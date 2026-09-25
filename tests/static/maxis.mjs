// Static contracts owned by maxis. Shared dependencies remain explicit.
export function createMaxisStaticChecks({
  CHAMBER_ROUTES,
  CURRENT_MAXIS_EVALUATOR_VERSION,
  DEEP_RANKING_LIMIT,
  L2_GOVERNANCE_TRACKS,
  MAXIS_L2_GOVERNANCE_CATEGORY,
  MAXIS_L2_GOVERNANCE_RANKING_LIMIT,
  PASSPORT_SHARD_ALGORITHM,
  PASSPORT_SHARD_COUNT,
  SEASON_CATEGORY_ORDER,
  SEASON_EVALUATOR_VERSION,
  SEASON_RULES_VERSION,
  addressShard,
  artifactBudgetErrors,
  assert,
  buildGovernanceCareerArtifact,
  buildL2GovernanceCareerArtifact,
  buildSeasonCompetition,
  compileContractCoverage,
  createHash,
  expandPassportRecord,
  extractL2GovernanceReceiptAddresses,
  fail,
  fetchKeysetPages,
  fetchOffsetPages,
  getMaxisEvaluator,
  getMaxisSource,
  hoursSince,
  maxisEvaluatorVersions,
  maxisImplementationHash,
  maxisSourceVersions,
  measureSeasonArtifactBudget,
  pass,
  pathExists,
  rankAppActivity,
  rankMints,
  rankSalesStats,
  rankSeasonBuilders,
  rankSeasonDelegation,
  rankSeasonGovernance,
  rankSeasonLiquidity,
  rankSeasonMints,
  rankSeasonNftSales,
  rankUnicorn,
  readStoredPassport,
  readText,
  registerMaxisEvaluator,
  registerMaxisSource,
  resolveProtocolSeason,
  stableJsonHash,
  truncationCoverageErrors,
  validateGovernanceCareerArtifact,
  validateL2GovernanceCareerArtifact,
  validateMaxisConfig,
  validateSeasonCatalog,
  validateTezosCrpDataset,
  validateTezosCrpIdentityAliases,
  validateTransactionAccumulator,
  walk
}) {
  async function checkMaxisContracts() {
    const config = JSON.parse(await readText('data/maxis-contracts.json'));
    const careerText = await readText('data/maxis-careers.json');
    const careerArtifact = JSON.parse(careerText);
    assert.equal(careerText, `${JSON.stringify(careerArtifact)}\n`, 'Mutable career artifact must retain compact JSON serialization');
    const l2GovernanceArtifact = JSON.parse(await readText('data/maxis-l2-governance.json'));
    const snapshot = JSON.parse(await readText('data/maxis-leaders.json'));
    const maxis = await readText('js/features/maxis.js');
    const maxisCss = await readText('css/maxis.css');
    const shellExtrasCss = await readText('css/shell-extras.css');
    const app = await readText('js/core/app.js');
    const siteMap = await readText('js/core/site-map.js');
    const sw = await readText('sw.js');
    const tezosDomainsCore = await readText('js/core/tezos-domains.js');
    const myTezos = await readText('js/features/my-baker.js');
    const maxisGenerator = await readText('scripts/refresh-maxis-data.mjs');
    const generatedSurfaces = await readText('scripts/refresh-generated-surfaces.mjs');
    const packageJson = JSON.parse(await readText('package.json'));

    const careerErrors = validateGovernanceCareerArtifact(careerArtifact);
    if (careerErrors.length) fail(`maxis Governance career artifact invalid: ${careerErrors.join('; ')}`);
    if (hoursSince(careerArtifact.generatedAt) > 72) fail('maxis Governance career artifact is older than 72 hours; run npm run refresh:maxis-careers');
    if (careerArtifact?.coverage?.absenceMeansZero !== true || careerArtifact?.recordCount < 1) {
      fail('maxis Governance career coverage must be complete enough for an absent address to mean zero');
    }
    const careerRecords = Object.values(careerArtifact?.records || {});
    const reconstructedCareerBallots = careerRecords.reduce((sum, record) => sum + Number(record?.lifetimeBallots || 0), 0);
    const reconstructedCareerProposals = careerRecords.reduce((sum, record) => sum + Number(record?.lifetimeProposals || 0), 0);
    if (reconstructedCareerBallots !== Number(careerArtifact?.sourceReceipts?.ballots?.rows)
      || reconstructedCareerProposals !== Number(careerArtifact?.sourceReceipts?.proposals?.rows)) {
      fail('maxis Governance career record totals must reconcile to the exact source receipts');
    }
    if (careerRecords.some((record) => record?.activeDelegateCounters?.operationRowCountsMatch === false)) {
      fail('maxis Governance career active-delegate counters disagree with reconstructed operation history');
    }
    const canonicalGovernanceRows = snapshot?.rankings?.governance || [];
    const careerGovernanceRows = careerRecords
      .filter((record) => Number(record?.activeDelegateGovernanceRank) > 0
        && Number(record.activeDelegateGovernanceRank) <= canonicalGovernanceRows.length)
      .sort((left, right) => Number(left.activeDelegateGovernanceRank) - Number(right.activeDelegateGovernanceRank));
    if (careerGovernanceRows.length !== canonicalGovernanceRows.length
      || canonicalGovernanceRows.some((row, index) => row.address !== careerGovernanceRows[index]?.address
        || Number(row.score) !== Number(careerGovernanceRows[index]?.lifetimeActions))) {
      fail('maxis canonical Governance board and exact active-delegate career ranks have drifted; refresh both artifacts together');
    }

    const l2GovernanceErrors = validateL2GovernanceCareerArtifact(l2GovernanceArtifact);
    if (l2GovernanceErrors.length) fail(`maxis L2 Governance career artifact invalid: ${l2GovernanceErrors.join('; ')}`);
    if (hoursSince(l2GovernanceArtifact.generatedAt) > 72) {
      fail('maxis L2 Governance career artifact is older than 72 hours; run npm run refresh:maxis-l2-governance');
    }
    if (l2GovernanceArtifact?.coverage?.absenceMeansZero !== true
      || l2GovernanceArtifact?.coverage?.status !== 'complete'
      || JSON.stringify(l2GovernanceArtifact?.coverage?.tracks) !== JSON.stringify(L2_GOVERNANCE_TRACKS)) {
      fail('maxis L2 Governance coverage must be complete across the reviewed FAST, SLOW, and Sequencer tracks');
    }
    if (l2GovernanceArtifact?.contracts?.current?.sequencer !== 'KT1KiVz8ZpHo3HpE1GCP5HLgywPDRwVUkCFh') {
      fail('maxis L2 Governance must use the official current Etherlink Sequencer governance contract');
    }
    const l2GovernanceRows = l2GovernanceArtifact?.rankings || [];
    const l2GovernanceRecords = l2GovernanceArtifact?.records || {};
    if (l2GovernanceRows.length !== MAXIS_L2_GOVERNANCE_RANKING_LIMIT) {
      fail(`maxis L2 Governance canonical board must contain ${MAXIS_L2_GOVERNANCE_RANKING_LIMIT} accounts`);
    }
    const l2GovernanceRankingAddresses = new Set();
    for (const [index, row] of l2GovernanceRows.entries()) {
      const record = l2GovernanceRecords[row?.address];
      if (row?.category !== MAXIS_L2_GOVERNANCE_CATEGORY || Number(row?.rank) !== index + 1
        || !record?.activeDelegate || Number(record?.activeDelegateL2GovernanceRank) !== index + 1
        || Number(row?.score) !== Number(record?.lifetimeWindows)) {
        fail(`maxis L2 Governance canonical rank ${index + 1} does not reconstruct from its active-delegate career record`);
      }
      if (l2GovernanceRankingAddresses.has(row?.address)) fail(`maxis L2 Governance canonical board repeats ${row?.address}`);
      l2GovernanceRankingAddresses.add(row?.address);
    }
    const reconstructedL2TopTen = Object.values(l2GovernanceRecords)
      .filter((record) => Number(record?.activeDelegateL2GovernanceRank) > 0
        && Number(record.activeDelegateL2GovernanceRank) <= MAXIS_L2_GOVERNANCE_RANKING_LIMIT)
      .sort((left, right) => Number(left.activeDelegateL2GovernanceRank) - Number(right.activeDelegateL2GovernanceRank));
    if (reconstructedL2TopTen.length !== l2GovernanceRows.length
      || reconstructedL2TopTen.some((record, index) => record.address !== l2GovernanceRows[index]?.address)) {
      fail('maxis L2 Governance canonical top ten has drifted from its exact career ranks');
    }
    if (!L2_GOVERNANCE_TRACKS.every((track) => Number(l2GovernanceArtifact?.periodLedger?.trackCounts?.[track]?.periods) > 0)) {
      fail('maxis L2 Governance committed period ledger must cover every reviewed governance track');
    }

    const configErrors = validateMaxisConfig(config);
    if (configErrors.length) fail(`maxis contract taxonomy invalid: ${configErrors.join('; ')}`);
    if (snapshot.schema !== 2) fail('maxis snapshot schema must be 2');
    if (snapshot.rankingLimit !== 10) fail('maxis snapshot ranking limit must be 10');
    if (hoursSince(snapshot.generatedAt) > 72) fail('maxis snapshot is older than 72 hours; run npm run refresh:maxis');
    if (snapshot.truncation?.mints || snapshot.truncation?.appTransactions) {
      fail(`maxis snapshot must not publish truncated rankings: ${JSON.stringify(snapshot.truncation)}`);
    }

    const expectedCategories = ['transaction', 'collector', 'artist', 'minter', 'defi', 'gaming', 'governance', 'staking', 'unicorn'];
    const categories = (snapshot.leaders || []).map((leader) => leader.category);
    if (categories.includes(MAXIS_L2_GOVERNANCE_CATEGORY) || snapshot?.rankings?.[MAXIS_L2_GOVERNANCE_CATEGORY]) {
      fail('maxis L2 Governance must remain an independently verified career artifact, not mutate the legacy canonical snapshot');
    }
    if (new Set(categories).size !== categories.length) fail('maxis snapshot categories must be unique');
    for (const category of expectedCategories) {
      if (!categories.includes(category)) fail(`maxis snapshot missing ${category} leader`);
      const ranking = snapshot.rankings?.[category];
      if (!Array.isArray(ranking) || ranking.length !== 10) fail(`maxis snapshot ${category} ranking must contain ten accounts`);
      const addresses = new Set();
      for (const [index, ranked] of (ranking || []).entries()) {
        if (ranked.rank !== index + 1) fail(`maxis snapshot ${category} rank order is invalid at ${index + 1}`);
        if (!/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(ranked.address || '')) fail(`maxis snapshot ${category} rank ${index + 1} has invalid address`);
        if (addresses.has(ranked.address)) fail(`maxis snapshot ${category} repeats ${ranked.address}`);
        addresses.add(ranked.address);
      }
      const leader = (snapshot.leaders || []).find((item) => item.category === category);
      if (leader?.address !== ranking?.[0]?.address) fail(`maxis snapshot ${category} winner must match rank 1`);
    }
    for (const leader of snapshot.leaders || []) {
      if (!['ready', 'empty'].includes(leader.status)) fail(`maxis leader ${leader.category} has invalid status ${leader.status}`);
      if (leader.status === 'ready') {
        if (!/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(leader.address || '')) fail(`maxis leader ${leader.category} has invalid address`);
        if (!leader.scoreLabel || !leader.method || !/^https:\/\//.test(leader.sourceUrl || '')) fail(`maxis leader ${leader.category} is missing score, method, or source`);
      }
    }
    const canonicalClockByCategory = {
      transaction: 'all-time',
      collector: 'rolling-30d',
      artist: 'rolling-30d',
      minter: 'rolling-30d',
      defi: 'rolling-30d',
      gaming: 'rolling-90d',
      governance: 'all-time-active',
      staking: 'live',
      unicorn: 'mixed'
    };
    for (const [category, windowKind] of Object.entries(canonicalClockByCategory)) {
      const leader = (snapshot.leaders || []).find((item) => item.category === category);
      if (leader?.windowKind !== windowKind) {
        fail(`maxis canonical ${category} crown must keep its lane-native ${windowKind} clock, got ${leader?.windowKind || 'missing'}`);
      }
    }
    const canonicalGovernance = (snapshot.leaders || []).find((leader) => leader.category === 'governance');
    if (canonicalGovernance?.status !== 'ready' || !/all-time ballots plus proposals among currently active/i.test(canonicalGovernance?.method || '')) {
      fail('maxis canonical Governance crown must remain an all-time-active record independent of quiet protocol seasons');
    }
    if (!snapshot.coverage?.caveat?.includes('Unknown or unlabeled contracts')) fail('maxis coverage must state the unknown-contract limitation');

    const addressA = 'tz1X568Wdkb1ZUs8qfVYcsZD31YQ4UV3sdY4';
    const addressB = 'tz1gBXG9fg8RMDH69KfKqwoTH5sFDmzt5yzm';
    const addressC = 'tz1Yw8SgnsAmbQcJyaBbQokoYGxeeoX5AKYw';
    const completeCareerSource = (rows) => ({
      rows,
      receipt: { complete: true, truncated: false, rows: rows.length, expectedRows: rows.length }
    });
    const careerPeriods = [
      { index: 0, epoch: 0, kind: 'proposal', firstLevel: 100, lastLevel: 199 },
      { index: 1, epoch: 0, kind: 'exploration', firstLevel: 200, lastLevel: 299 },
      { index: 2, epoch: 0, kind: 'promotion', firstLevel: 300, lastLevel: 399 },
      { index: 3, epoch: 0, kind: 'cooldown', firstLevel: 400, lastLevel: 499 },
      { index: 4, epoch: 1, kind: 'proposal', firstLevel: 500, lastLevel: 599 },
      { index: 5, epoch: 1, kind: 'exploration', firstLevel: 600, lastLevel: 699 },
      { index: 6, epoch: 1, kind: 'promotion', firstLevel: 700, lastLevel: 799 },
      { index: 7, epoch: 1, kind: 'adoption', firstLevel: 800, lastLevel: 899 },
      { index: 8, epoch: 2, kind: 'proposal', firstLevel: 900, lastLevel: 999 }
    ];
    const careerBallots = [1, 2, 5, 6].map((period, index) => ({
      id: String(1000 + index),
      timestamp: `2026-01-0${index + 1}T00:00:00Z`,
      delegate: { address: addressA, alias: 'Alpha' },
      period: { index: period }
    })).concat([1, 5].map((period, index) => ({
      id: String(2000 + index),
      timestamp: `2026-02-0${index + 1}T00:00:00Z`,
      delegate: { address: addressB, alias: 'Beta' },
      period: { index: period }
    })));
    const careerProposals = [{
      id: '3000',
      timestamp: '2026-01-01T12:00:00Z',
      delegate: { address: addressA, alias: 'Alpha' },
      period: { index: 0 }
    }];
    const careerDelegates = [
      { address: addressA, alias: 'Alpha', numBallots: 4, numProposals: 1, lastActivityTime: '2026-03-01T00:00:00Z' },
      { address: addressB, alias: 'Beta', numBallots: 2, numProposals: 0, lastActivityTime: '2026-02-01T00:00:00Z' },
      { address: addressC, alias: 'Gamma', numBallots: 0, numProposals: 0, lastActivityTime: '2026-01-01T00:00:00Z' }
    ];
    const careerFixtureInput = {
      generatedAt: '2026-07-10T00:00:00Z',
      head: {
        row: { level: 900, timestamp: '2026-07-10T00:00:00Z' },
        receipt: { complete: true, level: 900, timestamp: '2026-07-10T00:00:00.000Z' }
      },
      ballots: completeCareerSource(careerBallots),
      proposals: completeCareerSource(careerProposals),
      votingPeriods: completeCareerSource(careerPeriods),
      activeDelegates: completeCareerSource(careerDelegates),
      season: { id: 'fixture-season', protocolName: 'Fixture', activationLevel: 900, activatedAt: '2026-01-01T00:00:00Z' },
      seasonGovernanceReceipt: {
        complete: true,
        ballots: 0,
        proposals: 0,
        votingPeriods: [{ index: 8, epoch: 2, kind: 'proposal', firstLevel: 900, lastLevel: 999 }]
      }
    };
    const careerFixture = buildGovernanceCareerArtifact(careerFixtureInput);
    const shuffledCareerFixture = buildGovernanceCareerArtifact({
      ...careerFixtureInput,
      ballots: completeCareerSource([...careerBallots].reverse()),
      proposals: completeCareerSource([...careerProposals].reverse()),
      votingPeriods: completeCareerSource([...careerPeriods].reverse()),
      activeDelegates: completeCareerSource([...careerDelegates].reverse())
    });
    const fixtureA = careerFixture.records[addressA];
    const fixtureB = careerFixture.records[addressB];
    if (fixtureA?.lifetimeActions !== 5 || fixtureA?.actionablePeriodsParticipated !== 5
      || fixtureA?.longestBallotPeriodStreak !== 4 || fixtureA?.currentBallotPeriodStreak !== 4) {
      fail(`maxis Governance career streak/action fixture is wrong: ${JSON.stringify(fixtureA)}`);
    }
    if (fixtureB?.longestBallotPeriodStreak !== 1 || fixtureB?.currentBallotPeriodStreak !== 0) {
      fail(`maxis Governance career gap fixture is wrong: ${JSON.stringify(fixtureB)}`);
    }
    if (careerFixture.integrity.contentHash !== shuffledCareerFixture.integrity.contentHash) {
      fail('maxis Governance career artifact must be deterministic under source-row reordering');
    }
    if (careerFixture.currentProtocolContext?.state !== 'no-actionable-governance-occurred') {
      fail(`maxis Governance career current protocol context is ambiguous: ${JSON.stringify(careerFixture.currentProtocolContext)}`);
    }
    const tamperedCareerFixture = structuredClone(careerFixture);
    tamperedCareerFixture.records[addressA].lifetimeActions += 1;
    if (!validateGovernanceCareerArtifact(tamperedCareerFixture).length) fail('maxis Governance career validation must reject content tampering');
    const rehashedStreakTamper = structuredClone(careerFixture);
    rehashedStreakTamper.records[addressA].currentBallotPeriodStreak = 0;
    {
      const { integrity, ...unsigned } = rehashedStreakTamper;
      rehashedStreakTamper.integrity.contentHash = stableJsonHash(unsigned);
    }
    if (!validateGovernanceCareerArtifact(rehashedStreakTamper).some((error) => /current ballot-period streak/i.test(error))) {
      fail('maxis Governance career validation must semantically reject a rehashed false streak');
    }
    const rehashedPeriodOmission = structuredClone(careerFixture);
    rehashedPeriodOmission.periodLedger.periods = rehashedPeriodOmission.periodLedger.periods
      .filter((period) => period.index !== 3);
    rehashedPeriodOmission.periodLedger.count = rehashedPeriodOmission.periodLedger.periods.length;
    {
      const { integrity, ...unsigned } = rehashedPeriodOmission;
      rehashedPeriodOmission.integrity.contentHash = stableJsonHash(unsigned);
    }
    if (!validateGovernanceCareerArtifact(rehashedPeriodOmission).some((error) => /voting-period source receipt|voting-period index sequence/i.test(error))) {
      fail('maxis Governance career validation must reject a rehashed omitted voting period');
    }
    const openPeriodFixture = buildGovernanceCareerArtifact({
      ...careerFixtureInput,
      season: null,
      seasonGovernanceReceipt: null,
      head: {
        row: { level: 750, timestamp: '2026-06-10T00:00:00Z' },
        receipt: { complete: true, level: 750, timestamp: '2026-06-10T00:00:00.000Z' }
      }
    });
    if (openPeriodFixture.records[addressA]?.currentBallotPeriodStreak !== 3
      || openPeriodFixture.records[addressA]?.longestBallotPeriodStreak !== 3) {
      fail(`maxis Governance career streak must exclude an open ballot period: ${JSON.stringify(openPeriodFixture.records[addressA])}`);
    }
    let wrongPeriodRejected = false;
    try {
      const wrongPeriodBallots = [...careerBallots, { ...careerBallots[0], id: '4999', period: { index: 0 } }];
      buildGovernanceCareerArtifact({
        ...careerFixtureInput,
        ballots: completeCareerSource(wrongPeriodBallots),
        activeDelegates: completeCareerSource(careerDelegates.map((delegate) => delegate.address === addressA
          ? { ...delegate, numBallots: 5 }
          : delegate))
      });
    } catch {
      wrongPeriodRejected = true;
    }
    if (!wrongPeriodRejected) fail('maxis Governance career build must reject ballots outside exploration/promotion periods');
    let counterMismatchRejected = false;
    try {
      buildGovernanceCareerArtifact({
        ...careerFixtureInput,
        activeDelegates: completeCareerSource(careerDelegates.map((delegate) => delegate.address === addressA
          ? { ...delegate, numBallots: 3 }
          : delegate))
      });
    } catch {
      counterMismatchRejected = true;
    }
    if (!counterMismatchRejected) fail('maxis Governance career build must reject active-delegate counter mismatches');
    let incompleteCareerRejected = false;
    try {
      buildGovernanceCareerArtifact({
        ...careerFixtureInput,
        ballots: { rows: careerBallots, receipt: { complete: false, truncated: true, rows: careerBallots.length, expectedRows: careerBallots.length + 1 } }
      });
    } catch {
      incompleteCareerRejected = true;
    }
    if (!incompleteCareerRejected) fail('maxis Governance career build must refuse incomplete source receipts');

    const addressD = 'tz1aWXP237BLwNHJcCD4b3DutCevhqq2T1Z9';
    const l2VotingKey = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
    const l2FastContract = 'KT19oUVQPnVLuUBYXrBVd46WJnNAMpqkKSwo';
    const l2SlowContract = 'KT1AXRU3wLc87WNhLhVGrgqDGubLACUMUgPb';
    const l2SequencerContract = 'KT1KiVz8ZpHo3HpE1GCP5HLgywPDRwVUkCFh';
    const completeL2Source = (rows, extra = {}) => ({
      rows,
      receipt: { complete: true, truncated: false, rows: rows.length, expectedRows: rows.length, ...extra }
    });
    const l2Periods = [
      { governance: 'fast', contract: l2FastContract, contract_voting_index: 0, startLevel: 100, endLevel: 199, startDateTime: '2026-01-01T00:00:00Z', endDateTime: '2026-01-01T01:00:00Z', proposals: [] },
      { governance: 'fast', contract: l2FastContract, contract_voting_index: 0, startLevel: 200, endLevel: 299, startDateTime: '2026-01-01T02:00:00Z', endDateTime: '2026-01-01T03:00:00Z', promotion: { yea_voting_power: 1, nay_voting_power: 0, pass_voting_power: 0 } },
      { governance: 'slow', contract: l2SlowContract, contract_voting_index: 0, startLevel: 300, endLevel: 399, startDateTime: '2026-01-01T04:00:00Z', endDateTime: '2026-01-01T05:00:00Z', proposals: [] },
      { governance: 'sequencer', contract: l2SequencerContract, contract_voting_index: 0, startLevel: 400, endLevel: 499, startDateTime: '2026-01-01T06:00:00Z', endDateTime: '2026-01-01T07:00:00Z', promotion: { yea_voting_power: 1, nay_voting_power: 0, pass_voting_power: 0 } },
      { governance: 'slow', contract: l2SlowContract, contract_voting_index: 1, startLevel: 500, endLevel: 599, startDateTime: '2026-01-01T08:00:00Z', endDateTime: '2026-01-01T09:00:00Z', promotion: { yea_voting_power: 0, nay_voting_power: 0, pass_voting_power: 0 } }
    ];
    const l2Bigmaps = [
      { ptr: 101, contract: l2FastContract, path: 'voting_context.period.proposal.upvoters_proposals', firstLevel: 105, lastLevel: 190, totalKeys: 5, active: false },
      { ptr: 102, contract: l2FastContract, path: 'voting_context.period.proposal.proposals', firstLevel: 106, lastLevel: 190, totalKeys: 2, active: false },
      { ptr: 103, contract: l2FastContract, path: 'voting_context.period.promotion.voters', firstLevel: 205, lastLevel: 290, totalKeys: 2, active: false },
      { ptr: 201, contract: l2SlowContract, path: 'voting_context.period.proposal.upvoters_proposals', firstLevel: 305, lastLevel: 390, totalKeys: 3, active: false },
      { ptr: 202, contract: l2SlowContract, path: 'voting_context.period.proposal.proposals', firstLevel: 306, lastLevel: 390, totalKeys: 1, active: false },
      { ptr: 301, contract: l2SequencerContract, path: 'voting_context.period.promotion.voters', firstLevel: 405, lastLevel: 490, totalKeys: 3, active: false }
    ];
    const l2Keys = [
      { ptr: 101, id: 1, firstLevel: 110, timestamp: '2026-01-01T00:10:00Z', key: { key_hash: addressA, proposal: '0x01' }, sender: { address: l2VotingKey } },
      { ptr: 101, id: 2, firstLevel: 120, timestamp: '2026-01-01T00:20:00Z', key: { key_hash: addressA, proposal: '0x02' }, sender: { address: l2VotingKey } },
      { ptr: 101, id: 3, firstLevel: 130, timestamp: '2026-01-01T00:30:00Z', key: { key_hash: addressB, proposal: '0x01' } },
      { ptr: 101, id: 4, firstLevel: 130, timestamp: '2026-01-01T00:30:00Z', key: { key_hash: addressD, proposal: '0x01' } },
      { ptr: 101, id: 5, firstLevel: 140, timestamp: '2026-01-01T00:40:00Z', key: { key_hash: addressC, proposal: '0x01' } },
      { ptr: 102, id: 6, firstLevel: 115, timestamp: '2026-01-01T00:15:00Z', value: { proposers: [addressA] } },
      { ptr: 102, id: 7, firstLevel: 145, timestamp: '2026-01-01T00:45:00Z', value: { proposers: [addressC] } },
      { ptr: 103, id: 8, firstLevel: 220, timestamp: '2026-01-01T02:20:00Z', key: addressA },
      { ptr: 103, id: 9, firstLevel: 230, timestamp: '2026-01-01T02:30:00Z', key: addressC },
      { ptr: 201, id: 10, firstLevel: 320, timestamp: '2026-01-01T04:20:00Z', key: { key_hash: addressB, proposal: '0x03' } },
      { ptr: 201, id: 11, firstLevel: 320, timestamp: '2026-01-01T04:20:00Z', key: { key_hash: addressD, proposal: '0x03' } },
      { ptr: 201, id: 12, firstLevel: 330, timestamp: '2026-01-01T04:30:00Z', key: { key_hash: addressC, proposal: '0x03' } },
      { ptr: 202, id: 13, firstLevel: 325, timestamp: '2026-01-01T04:25:00Z', value: { proposers: [addressB] } },
      { ptr: 301, id: 14, firstLevel: 420, timestamp: '2026-01-01T06:20:00Z', key: addressB },
      { ptr: 301, id: 15, firstLevel: 420, timestamp: '2026-01-01T06:20:00Z', key: addressD },
      { ptr: 301, id: 16, firstLevel: 430, timestamp: '2026-01-01T06:30:00Z', key: addressC }
    ];
    const l2KeyMapReceipts = l2Bigmaps.map((map) => ({
      ptr: map.ptr,
      rows: map.totalKeys,
      expectedRows: map.totalKeys,
      complete: true,
      truncated: false
    }));
    const l2CurrentContracts = [
      { address: l2FastContract, storage: { config: { proposal_quorum: 5, promotion_quorum: 15, promotion_supermajority: 80 } } },
      { address: l2SlowContract, storage: { config: { proposal_quorum: 1, promotion_quorum: 5, promotion_supermajority: 75 } } },
      { address: l2SequencerContract, storage: { config: { proposal_quorum: 1, promotion_quorum: 8, promotion_supermajority: 75 } } }
    ];
    const l2FixtureInput = {
      generatedAt: '2026-07-10T00:00:00Z',
      periods: completeL2Source(l2Periods),
      bigmaps: completeL2Source(l2Bigmaps),
      keys: completeL2Source(l2Keys, { perMap: l2KeyMapReceipts }),
      activeDelegates: completeL2Source([
        { address: addressA, alias: 'Alpha' },
        { address: addressB, alias: 'Beta' },
        { address: addressD, alias: 'Delta' }
      ]),
      accounts: completeL2Source([
        { address: addressA, alias: 'Alpha' },
        { address: addressB, alias: 'Beta' },
        { address: addressC, alias: 'Inactive Gamma' },
        { address: addressD, alias: 'Delta' }
      ]),
      currentContracts: completeL2Source(l2CurrentContracts),
      head: {
        row: { level: 700, timestamp: '2026-07-10T00:00:00Z' },
        receipt: { complete: true, level: 700, timestamp: '2026-07-10T00:00:00.000Z' }
      }
    };
    const l2Fixture = buildL2GovernanceCareerArtifact(l2FixtureInput);
    const l2RepresentedAddresses = extractL2GovernanceReceiptAddresses(l2Periods, l2Bigmaps, l2Keys);
    if (!l2RepresentedAddresses.includes(addressA) || l2RepresentedAddresses.includes(l2VotingKey)
      || l2Fixture.records[l2VotingKey]) {
      fail('maxis L2 Governance must attribute voting-key activity to the represented baker stored in the governance receipt');
    }
    if (l2Fixture.records[addressA]?.lifetimeWindows !== 2
      || l2Fixture.records[addressA]?.lifetimeReceiptCount !== 3
      || l2Fixture.records[addressA]?.lifetimeProposalWindows !== 1) {
      fail(`maxis L2 Governance must count multiple proposal upvotes as one window while retaining receipt evidence: ${JSON.stringify(l2Fixture.records[addressA])}`);
    }
    const tiedL2Addresses = [addressB, addressD].sort();
    if (l2Fixture.rankings[0]?.address !== tiedL2Addresses[0]
      || l2Fixture.rankings[1]?.address !== tiedL2Addresses[1]
      || l2Fixture.rankings[0]?.scoreVector?.tracks !== 3
      || l2Fixture.rankings[1]?.scoreVector?.tracks !== 3) {
      fail(`maxis L2 Governance ties must preserve track breadth and deterministic raw-address ordering: ${JSON.stringify(l2Fixture.rankings)}`);
    }
    if (l2Fixture.records[addressC]?.activeDelegate !== false
      || l2Fixture.records[addressC]?.activeDelegateL2GovernanceRank != null
      || l2Fixture.rankings.some((row) => row.address === addressC)) {
      fail('maxis L2 Governance must retain inactive careers without admitting them to the all-time-active crown');
    }
    const zeroVoteL2Period = l2Fixture.periodLedger.periods.find((period) => period.id === `slow:${l2SlowContract}:1:promotion`);
    if (!zeroVoteL2Period?.officialZeroParticipation || zeroVoteL2Period?.bigmapPtrs?.participants !== null
      || zeroVoteL2Period?.participantBakers !== 0 || zeroVoteL2Period?.participantReceipts !== 0) {
      fail(`maxis L2 Governance must preserve an official zero-vote window without inventing a missing participant map: ${JSON.stringify(zeroVoteL2Period)}`);
    }
    const shuffledL2Fixture = buildL2GovernanceCareerArtifact({
      ...l2FixtureInput,
      periods: completeL2Source([...l2Periods].reverse()),
      bigmaps: completeL2Source([...l2Bigmaps].reverse()),
      keys: completeL2Source([...l2Keys].reverse(), { perMap: l2KeyMapReceipts }),
      activeDelegates: completeL2Source([...l2FixtureInput.activeDelegates.rows].reverse()),
      accounts: completeL2Source([...l2FixtureInput.accounts.rows].reverse()),
      currentContracts: completeL2Source([...l2CurrentContracts].reverse())
    });
    if (l2Fixture.integrity.contentHash !== shuffledL2Fixture.integrity.contentHash) {
      fail('maxis L2 Governance artifact must be deterministic under source-row reordering');
    }
    let unknownL2ContractRejected = false;
    try {
      buildL2GovernanceCareerArtifact({
        ...l2FixtureInput,
        periods: completeL2Source(l2Periods.map((period, index) => index === 0
          ? { ...period, contract: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT' }
          : period))
      });
    } catch {
      unknownL2ContractRejected = true;
    }
    if (!unknownL2ContractRejected) fail('maxis L2 Governance must reject an unreviewed contract even when its row claims a known track');
    let incompleteL2SourceRejected = false;
    try {
      buildL2GovernanceCareerArtifact({
        ...l2FixtureInput,
        periods: { rows: l2Periods, receipt: { complete: false, truncated: true, rows: l2Periods.length, expectedRows: l2Periods.length + 1 } }
      });
    } catch {
      incompleteL2SourceRejected = true;
    }
    if (!incompleteL2SourceRejected) fail('maxis L2 Governance must refuse incomplete canonical period receipts');
    const tamperedL2Fixture = structuredClone(l2Fixture);
    tamperedL2Fixture.records[addressA].lifetimeWindows += 1;
    if (!validateL2GovernanceCareerArtifact(tamperedL2Fixture).some((error) => /lifetime windows|integrity content hash/i.test(error))) {
      fail('maxis L2 Governance validation must reject content tampering');
    }
    const rehashedL2RankingTamper = structuredClone(l2Fixture);
    rehashedL2RankingTamper.rankings[0].score += 1;
    {
      const { integrity, ...unsigned } = rehashedL2RankingTamper;
      rehashedL2RankingTamper.integrity.contentHash = stableJsonHash(unsigned);
    }
    if (!validateL2GovernanceCareerArtifact(rehashedL2RankingTamper).some((error) => /canonical rankings do not reconstruct/i.test(error))) {
      fail('maxis L2 Governance validation must semantically reject a rehashed false canonical ranking');
    }
    const coverage = compileContractCoverage([
      { address: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT', alias: '3Route v4', lastActivityTime: '2026-07-09T00:00:00Z' },
      { address: 'KT1R5dHqnpeKVFow9mErfN763RFfe51vmiB8', alias: 'Tezotopia Resource Collector', lastActivityTime: '2026-07-09T00:00:00Z' }
    ], config.apps, '2026-07-01T00:00:00Z');
    if (coverage.length !== 2) fail(`maxis taxonomy fixture should classify two contracts, got ${coverage.length}`);

    const appLookup = new Map(coverage.map((item) => [item.address, item.app]));
    const appRank = rankAppActivity([
      { id: 1, hash: 'o1', counter: 1, nonce: null, timestamp: '2026-07-09T01:00:00Z', sender: { address: addressA }, target: { address: coverage[0]?.address } },
      { id: 2, hash: 'o2', counter: 2, nonce: null, timestamp: '2026-07-09T02:00:00Z', sender: { address: addressA }, target: { address: coverage[1]?.address } },
      { id: 3, hash: 'o3', counter: 3, nonce: null, timestamp: '2026-07-09T03:00:00Z', sender: { address: addressB }, target: { address: coverage[0]?.address } },
      { id: 4, hash: 'o4', counter: 4, nonce: 1, timestamp: '2026-07-09T04:00:00Z', sender: { address: addressC }, target: { address: coverage[1]?.address } }
    ], appLookup);
    if (appRank[0]?.address !== addressA || appRank[0]?.appCount !== 2 || appRank.some((row) => row.address === addressC)) {
      fail('maxis app ranking must prefer breadth and exclude internal transactions');
    }

    const mintRank = rankMints([
      { creator_address: addressA, token_pk: 1, amount: 1, ophash: 'm1', timestamp: '2026-07-08T00:00:00Z', creator: { flag: 'none' } },
      { creator_address: addressA, token_pk: 1, amount: 2, ophash: 'm1', timestamp: '2026-07-08T00:00:00Z', creator: { flag: 'none' } },
      { creator_address: addressB, token_pk: 2, amount: 1, ophash: 'm2', timestamp: '2026-07-09T00:00:00Z', creator: { flag: 'none' } }
    ]);
    if (mintRank.find((row) => row.address === addressA)?.tokens !== 1) fail('maxis mint ranking must deduplicate token ids');

    const salesRank = rankSalesStats([
      { type: 'buyer', subject_address: addressA, volume: 10, rank: 2, interval_days: 30, subject: { flag: 'none' } },
      { type: 'buyer', subject_address: addressA, volume: 12, rank: 1, interval_days: 30, subject: { flag: 'none' } },
      { type: 'buyer', subject_address: addressB, volume: 11, rank: 1, interval_days: 30, subject: { flag: 'none' } }
    ], 'buyer');
    if (salesRank[0]?.address !== addressA || salesRank.length !== 2) fail('maxis sales ranking must deduplicate subjects by strongest volume row');

    const unicornRank = rankUnicorn({
      collector: [{ address: addressA, score: 4 }, { address: addressB, score: 3 }],
      minter: [{ address: addressB, score: 3 }, { address: addressA, score: 2 }],
      defi: [{ address: addressA, score: 2 }]
    }, 3);
    if (unicornRank[0]?.address !== addressA || unicornRank[0]?.breadth !== 3) fail('maxis unicorn ranking must prefer qualifying breadth');

    const paginationOffsets = [];
    const pagedFixture = await fetchOffsetPages(async ({ offset, limit }) => {
      paginationOffsets.push({ offset, limit });
      if (offset === 0 || offset === 500) return Array.from({ length: 500 }, (_, index) => offset + index);
      if (offset === 1000) return Array.from({ length: 42 }, (_, index) => offset + index);
      return [];
    }, { pageSize: 500, maxPages: 10 });
    if (pagedFixture.rows.length !== 1042 || pagedFixture.pages !== 3 || pagedFixture.truncated || pagedFixture.nextOffset !== 1042) {
      fail(`maxis offset pagination must consume 500 + 500 + 42 rows, got ${JSON.stringify({ rows: pagedFixture.rows.length, pages: pagedFixture.pages, truncated: pagedFixture.truncated, nextOffset: pagedFixture.nextOffset })}`);
    }
    if (paginationOffsets.map((page) => `${page.offset}:${page.limit}`).join(',') !== '0:500,500:500,1000:500') {
      fail(`maxis offset pagination advanced incorrectly: ${JSON.stringify(paginationOffsets)}`);
    }

    const keysetCursors = [];
    const keysetFixture = await fetchKeysetPages(async ({ after, limit }) => {
      keysetCursors.push(`${after}:${limit}`);
      const start = Number(after) + 1;
      const length = after === '0' || after === '500' ? 500 : after === '1000' ? 42 : 0;
      return Array.from({ length }, (_, index) => ({ id: start + index }));
    }, { pageSize: 500, maxPages: 10 });
    if (
      keysetFixture.rows.length !== 1042
      || keysetFixture.pages !== 3
      || keysetFixture.truncated
      || keysetFixture.firstCursor !== '1'
      || keysetFixture.lastCursor !== '1042'
      || keysetFixture.cursorOrderVerified !== true
      || keysetCursors.join(',') !== '0:500,500:500,1000:500'
    ) {
      fail(`maxis keyset pagination must consume unique 500 + 500 + 42 rows: ${JSON.stringify({ keysetFixture, keysetCursors })}`);
    }
    let duplicateCursorRejected = false;
    try {
      await fetchKeysetPages(async () => [{ id: 1 }, { id: 1 }], { pageSize: 2, maxPages: 1 });
    } catch {
      duplicateCursorRejected = true;
    }
    if (!duplicateCursorRejected) fail('maxis keyset pagination must reject duplicate or non-increasing source ids');

    const seasonStart = '2026-07-01T00:00:00.000Z';
    const nftSales = rankSeasonNftSales([
      {
        id: 101,
        timestamp: '2026-07-08T00:00:00Z',
        price_xtz: 10_000_000,
        amount: 1,
        buyer_address: addressA,
        buyer: { flag: 'none' },
        token_pk: 1,
        token: {
          fa_contract: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT',
          creators: [
            { creator_address: addressA, holder: { flag: 'none' } },
            { creator_address: addressB, holder: { flag: 'none' } }
          ]
        }
      },
      {
        id: 101,
        timestamp: '2026-07-08T00:00:00Z',
        price_xtz: 10_000_000,
        amount: 1,
        buyer_address: addressA,
        buyer: { flag: 'none' },
        token_pk: 1,
        token: {
          fa_contract: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT',
          creators: [
            { creator_address: addressA, holder: { flag: 'none' } },
            { creator_address: addressB, holder: { flag: 'none' } }
          ]
        }
      },
      {
        id: 102,
        timestamp: '2026-07-09T00:00:00Z',
        price_xtz: 20_000_000,
        amount: 1,
        buyer_address: addressC,
        buyer: { flag: 'none' },
        token_pk: 2,
        token: {
          fa_contract: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT',
          creators: [
            { creator_address: addressA, holder: { flag: 'none' } },
            { creator_address: addressB, holder: { flag: 'none' } }
          ]
        }
      }
    ], seasonStart);
    const collectorA = nftSales.collector.find((row) => row.address === addressA);
    const collectorC = nftSales.collector.find((row) => row.address === addressC);
    const artistA = nftSales.artist.find((row) => row.address === addressA);
    const artistB = nftSales.artist.find((row) => row.address === addressB);
    if (
      collectorA?.artistCount !== 1 || collectorA?.purchases !== 1 || collectorA?.volume !== 5_000_000
      || collectorC?.artistCount !== 2 || collectorC?.purchases !== 1 || collectorC?.volume !== 20_000_000
      || artistA?.collectorCount !== 1 || artistA?.sales !== 1 || artistA?.volume !== 10_000_000
      || artistB?.collectorCount !== 2 || artistB?.sales !== 2 || artistB?.volume !== 15_000_000
    ) {
      fail(`maxis NFT scoring must dedupe listing ids and exclude only self-creator legs: ${JSON.stringify({ collectorA, collectorC, artistA, artistB })}`);
    }

    const mintSeason = rankSeasonMints([
      {
        id: 1,
        creator_address: addressA,
        creator: { flag: 'none' },
        token_pk: 11,
        fa_contract: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT',
        amount: 1,
        ophash: 'old-remint',
        timestamp: '2026-07-08T00:00:00Z',
        token: { timestamp: '2025-01-01T00:00:00Z' }
      },
      {
        id: 2,
        creator_address: addressB,
        creator: { flag: 'none' },
        token_pk: 12,
        fa_contract: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT',
        amount: 5,
        ophash: 'new-mint',
        timestamp: '2026-07-08T01:00:00Z',
        token: { timestamp: '2026-07-08T01:00:00Z' }
      }
    ], [
      { id: 201, token_pk: 12, token: { fa_contract: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT' }, timestamp: '2026-07-08T02:00:00Z', buyer_address: addressC, buyer: { flag: 'none' }, seller_address: addressB, price_xtz: 2_000_000, amount: 2 },
      { id: 201, token_pk: 12, token: { fa_contract: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT' }, timestamp: '2026-07-08T02:00:00Z', buyer_address: addressC, buyer: { flag: 'none' }, seller_address: addressB, price_xtz: 2_000_000, amount: 2 },
      { id: 202, token_pk: 12, token: { fa_contract: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT' }, timestamp: '2026-07-08T03:00:00Z', buyer_address: addressA, buyer: { flag: 'none' }, seller_address: addressC, price_xtz: 3_000_000, amount: 1 },
      { id: 203, token_pk: 12, token: { fa_contract: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT' }, timestamp: '2026-07-08T04:00:00Z', buyer_address: addressB, buyer: { flag: 'none' }, seller_address: addressB, price_xtz: 4_000_000, amount: 1 }
    ], seasonStart);
    if (
      mintSeason.length !== 1
      || mintSeason[0]?.address !== addressB
      || mintSeason[0]?.tokens !== 1
      || mintSeason[0]?.successfulDrops !== 1
      || mintSeason[0]?.independentCollectors !== 1
      || mintSeason[0]?.editionsSold !== 2
    ) {
      fail(`maxis Mint must exclude old-token remints, secondary sales, self-sales, and duplicate sale ids: ${JSON.stringify(mintSeason)}`);
    }

    const governanceSeason = rankSeasonGovernance([
      { id: 301, hash: 'ballot-testing', counter: 1, nonce: null, timestamp: '2026-07-08T00:00:00Z', delegate: { address: addressA }, period: { index: 2 } },
      { id: 302, hash: 'ballot-promotion', counter: 2, nonce: null, timestamp: '2026-07-09T00:00:00Z', delegate: { address: addressA }, period: { index: 3 } }
    ], [
      { id: 303, hash: 'proposal', counter: 3, nonce: null, timestamp: '2026-07-07T00:00:00Z', delegate: { address: addressA }, period: { index: 1 } }
    ], seasonStart, [
      { index: 1, kind: 'proposal', firstLevel: 1 },
      { index: 2, kind: 'testing', firstLevel: 2 },
      { index: 3, kind: 'promotion', firstLevel: 3 }
    ]);
    if (governanceSeason[0]?.periods !== 2 || governanceSeason[0]?.governanceActions !== 2 || governanceSeason[0]?.participationStreak !== 2) {
      fail(`maxis Governance must score only the ordered actionable period sequence: ${JSON.stringify(governanceSeason[0])}`);
    }

    const delegationSeason = rankSeasonDelegation([
      { id: 401, timestamp: '2026-07-08T00:00:00Z', sender: { address: addressA }, prevDelegate: { address: addressC }, newDelegate: { address: addressB } }
    ], [
      { address: addressA, delegate: { address: addressB }, balance: 100, stakedBalance: 999 }
    ], seasonStart);
    if (delegationSeason[0]?.address !== addressB || delegationSeason[0]?.retainedAssignments !== 1 || delegationSeason[0]?.retainedBalance !== 100) {
      fail(`maxis Delegation must use the same positive liquid-balance basis live and at exact close: ${JSON.stringify(delegationSeason[0])}`);
    }

    const liquidityContract = 'KT1R5dHqnpeKVFow9mErfN763RFfe51vmiB8';
    const liquidityApp = { id: 'fixture-liquidity', category: 'defi' };
    const liquiditySeason = rankSeasonLiquidity([
      { id: 501, hash: 'liquidity-add', counter: 1, nonce: null, timestamp: '2026-07-08T00:00:00Z', sender: { address: addressA }, target: { address: liquidityContract }, parameter: { entrypoint: 'addLiquidity' } },
      { id: 502, hash: 'ambiguous-position', counter: 2, nonce: null, timestamp: '2026-07-09T00:00:00Z', sender: { address: addressA }, target: { address: liquidityContract }, parameter: { entrypoint: 'setPosition' } }
    ], new Map([[liquidityContract, liquidityApp]]), [{ ...liquidityApp, liquidityEntrypoints: ['addLiquidity'] }], seasonStart);
    if (liquiditySeason[0]?.venueCount !== 1 || liquiditySeason[0]?.appCount !== 1 || liquiditySeason[0]?.calls !== 1 || liquiditySeason[0]?.entrypoints?.join(',') !== 'addLiquidity') {
      fail(`maxis Liquidity must count only frozen positive-supply entrypoints: ${JSON.stringify(liquiditySeason[0])}`);
    }

    const directContract = 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT';
    const internalContract = 'KT1R5dHqnpeKVFow9mErfN763RFfe51vmiB8';
    const builderSeason = rankSeasonBuilders([
      { id: 601, nonce: null, timestamp: '2026-07-08T00:00:00Z', sender: { address: addressB }, originatedContract: { address: directContract } },
      { id: 602, nonce: 1, timestamp: '2026-07-08T00:00:00Z', sender: { address: addressA }, originatedContract: { address: internalContract } }
    ], [
      { id: 603, hash: 'direct-use', counter: 1, nonce: null, timestamp: '2026-07-09T00:00:00Z', sender: { address: addressC }, initiator: { address: addressC }, target: { address: directContract } },
      { id: 604, hash: 'internal-use', counter: 2, nonce: null, timestamp: '2026-07-09T00:00:00Z', sender: { address: addressC }, initiator: { address: addressC }, target: { address: internalContract } }
    ], seasonStart);
    if (builderSeason.length !== 1 || builderSeason[0]?.address !== addressB || builderSeason[0]?.activeDeployments !== 1 || builderSeason[0]?.independentUsers !== 1) {
      fail(`maxis Builder must exclude factory/internal originations and require independent use: ${JSON.stringify(builderSeason)}`);
    }

    const protocolHash = 'PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY';
    const protocolSeason = resolveProtocolSeason({
      meta: { currentProtocol: 'Ushuaia' },
      protocols: [{ number: 25, name: 'Ushuaia', hash: protocolHash, date: '2026-06-30', block: 13857889 }]
    }, {
      currentProtocol: { code: 25, name: 'Ushuaia', hash: protocolHash, firstLevel: 13857889, startTime: '2026-06-30T00:31:52Z' },
      currentGovernance: { startTime: '2026-07-08T09:00:00Z' }
    }, new Date('2026-07-09T12:00:00Z'));
    if (protocolSeason.protocolNumber !== 25 || protocolSeason.activationLevel !== 13857889 || protocolSeason.activatedAt !== '2026-06-30T00:31:52.000Z') {
      fail(`maxis protocol season must use the current protocol activation receipt, never the current voting-period start: ${JSON.stringify(protocolSeason)}`);
    }
    if (protocolSeason.endsAt !== null || !/next Tezos protocol activation/i.test(protocolSeason.endsWhen || '')) {
      fail('maxis active protocol season must stay honestly open-ended before the next activation is known');
    }
    let maliciousProtocolHashRejected = false;
    try {
      resolveProtocolSeason({
        protocols: [{ number: 25, name: 'Ushuaia', hash: protocolHash, date: '2026-06-30', block: 13857889 }]
      }, {
        currentProtocol: {
          code: 25,
          name: 'Ushuaia',
          hash: `${protocolHash}/../../../../escape`,
          firstLevel: 13857889,
          startTime: '2026-06-30T00:31:52Z'
        }
      }, new Date('2026-07-09T12:00:00Z'));
    } catch {
      maliciousProtocolHashRejected = true;
    }
    if (!maliciousProtocolHashRejected) fail('maxis protocol identity must reject path-bearing or non-canonical protocol hashes');

    const seasonFixture = {
      ...protocolSeason,
      id: `protocol-25-${protocolHash}`,
      seasonOrdinal: 1,
      phase: 'season',
      displayLabel: 'Ushuaia Season',
      status: 'active'
    };
    const previousSeasonFixture = {
      schema: 1,
      generatedAt: '2026-07-10T00:00:00.000Z',
      season: seasonFixture,
      rankings: {
        transaction: [
          { address: addressB, rank: 1 },
          { address: addressA, rank: 2 }
        ],
        collector: [{ address: addressA, rank: 1 }],
        defi: [{ address: addressA, rank: 1 }]
      },
      history: {
        snapshotCount: 1,
        topTenByLane: {
          transaction: [addressA, addressB],
          collector: [addressA],
          defi: [addressA]
        }
      },
      passportIndex: {
        byAddress: {
          [addressA]: {
            address: addressA,
            alias: 'Alpha',
            activeWeeks: [1],
            badges: [{ id: 'top-10-governance', label: 'Governance Maxi top 10', earnedSeasonId: seasonFixture.id, earnedAt: '2026-07-10T00:00:00.000Z' }],
            lanes: { transaction: { rank: 2, personalBestRank: 2 } }
          }
        }
      }
    };
    const seasonCompetition = buildSeasonCompetition({
      season: seasonFixture,
      generatedAt: '2026-07-22T00:00:00.000Z',
      previousSnapshot: previousSeasonFixture,
      rawRankings: {
        transaction: [
          { address: addressA, alias: 'Alpha', transactions: 12, activeDays: 4, activeWeeks: [1, 2], lastActivity: '2026-07-14T00:00:00.000Z' },
          { address: addressB, alias: 'Beta', transactions: 10, activeDays: 3, activeWeeks: [1, 2], lastActivity: '2026-07-13T00:00:00.000Z' },
          { address: addressC, alias: 'Debut', transactions: 9, activeDays: 3, activeWeeks: [2], lastActivity: '2026-07-12T00:00:00.000Z' }
        ],
        collector: [
          { address: addressA, alias: 'Alpha', artistCount: 4, volume: 8_000_000, purchases: 6, activeWeeks: [1, 2], lastActivity: '2026-07-14T00:00:00.000Z' }
        ],
        defi: [
          { address: addressA, alias: 'Alpha', appCount: 3, calls: 7, contractCount: 4, activeWeeks: [1, 2], lastActivity: '2026-07-15T00:00:00.000Z' }
        ]
      }
    });
    const alphaTransaction = seasonCompetition.rankings.transaction.find((row) => row.address === addressA);
    const betaTransaction = seasonCompetition.rankings.transaction.find((row) => row.address === addressB);
    const debutTransaction = seasonCompetition.rankings.transaction.find((row) => row.address === addressC);
    const alphaPassport = seasonCompetition.passportIndex.byAddress[addressA];
    if (alphaTransaction?.rank !== 1 || alphaTransaction?.delta !== 1 || betaTransaction?.delta !== -1 || debutTransaction?.delta !== null) {
      fail('maxis season deltas must compare only wallets present in a prior snapshot from the same protocol season');
    }
    if (betaTransaction?.passGap?.next?.guaranteedPrimary?.amount !== 3) {
      fail(`maxis pass gap must strictly exceed the leader's primary metric, got ${JSON.stringify(betaTransaction?.passGap?.next)}`);
    }
    if (seasonCompetition.honors.rankClimb?.winner?.address !== addressA || seasonCompetition.honors.rankClimb?.candidates?.some((candidate) => candidate.address === addressC)) {
      fail('maxis Climber honor must not turn a first appearance into invented rank movement');
    }
    if (!seasonCompetition.honors.topTenDebut?.winners?.some((winner) => winner.address === addressC)) {
      fail('maxis first recorded top-ten entry must be represented as a debut');
    }
    if (seasonCompetition.rankings.unicorn[0]?.address !== addressA || seasonCompetition.rankings.unicorn[0]?.breadth !== 3) {
      fail('maxis Season Unicorn must use breadth from the same protocol-season rankings only');
    }
    if (!alphaPassport?.badges?.some((badge) => badge.id === 'top-10-governance') || alphaPassport?.lanes?.transaction?.personalBestRank !== 1) {
      fail('maxis Passport must preserve earned badges while advancing personal bests');
    }
    if (alphaPassport?.badges?.some((badge) => String(badge.id || '').startsWith('champion-'))) {
      fail('maxis active-season rank one must remain provisional and cannot mint a permanent champion badge');
    }
    if (alphaPassport?.activeWeekStreak !== 2 || alphaPassport?.unicorn?.progressPercent !== 100) {
      fail('maxis Passport must derive supported completed-week streaks and same-season Unicorn progress');
    }

    const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const fixtureAddress = (index) => {
      let cursor = index + 1;
      let suffix = '';
      while (cursor > 0) {
        suffix = base58Alphabet[cursor % base58Alphabet.length] + suffix;
        cursor = Math.floor(cursor / base58Alphabet.length);
      }
      return `tz1${suffix.padStart(33, '1')}`;
    };
    const deepCompetition = buildSeasonCompetition({
      season: seasonFixture,
      generatedAt: '2026-07-22T00:00:00.000Z',
      rawRankings: {
        transaction: Array.from({ length: 600 }, (_, index) => ({
          address: fixtureAddress(index),
          transactions: 10_000 - index,
          activeDays: 8,
          activeWeeks: [1, 2],
          lastActivity: '2026-07-21T00:00:00.000Z'
        }))
      }
    });
    const deepAddress = fixtureAddress(599);
    const deepLane = expandPassportRecord(deepCompetition.passportIndex.byAddress[deepAddress])?.lanes?.transaction;
    if (
      deepCompetition.passportIndex.indexedAddresses !== 600
      || deepCompetition.rankings.transaction.length !== DEEP_RANKING_LIMIT
      || deepCompetition.laneStatus.transaction.eligibleCount !== 600
      || deepLane?.rank !== 600
      || deepLane?.outsidePublishedDepth !== true
      || !deepLane?.passGap?.topTen
      || deepLane?.passGap?.next !== null
    ) {
      fail(`maxis Passports must cover every eligible wallet beyond the 500-row public standings depth: ${JSON.stringify({ indexed: deepCompetition.passportIndex.indexedAddresses, published: deepCompetition.rankings.transaction.length, eligible: deepCompetition.laneStatus.transaction.eligibleCount, deepLane })}`);
    }

    const compactTopHundred = expandPassportRecord({
      format: 'transaction-only-v1',
      address: addressA,
      transaction: { rank: 17, scoreVector: [{ metric: 'transactions', value: 42 }] },
      badges: [],
      activeWeeks: [1, 2],
      activeWeekStreak: 2
    });
    const compactOutsideHundred = expandPassportRecord({
      format: 'transaction-only-v1',
      address: addressB,
      transaction: { rank: 117, scoreVector: [{ metric: 'transactions', value: 12 }] },
      badges: []
    });
    if (
      compactTopHundred?.unicorn?.breadth !== 1
      || compactTopHundred?.unicorn?.qualifyingLanes?.[0]?.category !== 'transaction'
      || compactTopHundred?.unicorn?.progressPercent !== 33
      || compactOutsideHundred?.unicorn?.breadth !== 0
      || compactOutsideHundred?.unicorn?.progressPercent !== 0
    ) {
      fail(`maxis compact Transaction Passport must preserve top-100 Unicorn breadth without inflating deeper ranks: ${JSON.stringify({ compactTopHundred, compactOutsideHundred })}`);
    }

    const shardA = addressShard(addressA);
    if (!/^[0-3][0-9a-f]$/.test(shardA) || shardA !== addressShard(addressA) || PASSPORT_SHARD_COUNT !== 64 || PASSPORT_SHARD_ALGORITHM !== 'sha256-first-byte-mask-3f-v1') {
      fail('maxis Passport sharding must be deterministic across 64 two-digit hexadecimal buckets');
    }

    const v2EvaluatorBefore = getMaxisEvaluator(SEASON_EVALUATOR_VERSION);
    const v2SourceBefore = getMaxisSource(SEASON_EVALUATOR_VERSION);
    const v2HashBeforeMockV3 = await maxisImplementationHash(SEASON_EVALUATOR_VERSION);
    const v2RulesBeforeMockV3 = v2EvaluatorBefore.buildRuleDefinition(v2HashBeforeMockV3);
    const mockV3Version = 'maxis-evaluator-v3-static-fixture';
    const mockV3Evaluator = {
      SEASON_EVALUATOR_VERSION: mockV3Version,
      buildRuleDefinition: (implementationHash) => ({ evaluator: { version: mockV3Version, implementationHash } }),
      buildSeasonCompetition: () => ({ mock: 'v3-evaluator' }),
      validateSeasonSnapshot: () => []
    };
    const mockV3Source = {
      EVALUATOR_VERSION: mockV3Version,
      MAXIS_SOURCE_VERSION: 'maxis-source-v3-static-fixture',
      IMMUTABLE_IMPLEMENTATION_FILES: ['fixture-only'],
      buildFullSeasonSnapshot: async () => ({ mock: 'v3-source' }),
      rebuildWithoutTransactionLane: () => ({ mock: 'v3-fallback' })
    };
    registerMaxisEvaluator(mockV3Version, mockV3Evaluator);
    registerMaxisSource(mockV3Version, mockV3Source);
    const mockV3Selection = await getMaxisSource(mockV3Version).buildFullSeasonSnapshot();
    const v2HashAfterMockV3 = await maxisImplementationHash(SEASON_EVALUATOR_VERSION);
    const v2RulesAfterMockV3 = getMaxisEvaluator(SEASON_EVALUATOR_VERSION).buildRuleDefinition(v2HashAfterMockV3);
    let mismatchedRegistryRejected = false;
    let duplicateRegistryRejected = false;
    try {
      registerMaxisEvaluator('maxis-evaluator-v3-mismatch', { SEASON_EVALUATOR_VERSION: 'wrong-version' });
    } catch {
      mismatchedRegistryRejected = true;
    }
    try {
      registerMaxisSource(mockV3Version, mockV3Source);
    } catch {
      duplicateRegistryRejected = true;
    }
    if (
      CURRENT_MAXIS_EVALUATOR_VERSION !== SEASON_EVALUATOR_VERSION
      || !maxisEvaluatorVersions().includes(mockV3Version)
      || !maxisSourceVersions().includes(mockV3Version)
      || mockV3Selection?.mock !== 'v3-source'
      || getMaxisEvaluator(SEASON_EVALUATOR_VERSION) !== v2EvaluatorBefore
      || getMaxisSource(SEASON_EVALUATOR_VERSION) !== v2SourceBefore
      || v2HashAfterMockV3 !== v2HashBeforeMockV3
      || JSON.stringify(v2RulesAfterMockV3) !== JSON.stringify(v2RulesBeforeMockV3)
      || !mismatchedRegistryRejected
      || !duplicateRegistryRejected
    ) {
      fail(`maxis v3 registration must coexist without changing frozen v2 execution/hash: ${JSON.stringify({
        current: CURRENT_MAXIS_EVALUATOR_VERSION,
        evaluatorVersions: maxisEvaluatorVersions(),
        sourceVersions: maxisSourceVersions(),
        mockV3Selection,
        hashStable: v2HashAfterMockV3 === v2HashBeforeMockV3,
        rulesStable: JSON.stringify(v2RulesAfterMockV3) === JSON.stringify(v2RulesBeforeMockV3),
        mismatchedRegistryRejected,
        duplicateRegistryRejected
      })}`);
    }

    const buildingTransactionStates = await walk(
      'data/maxis/seasons',
      (file) => file.endsWith('/transaction-state.building.json')
    ).catch(() => []);
    for (const statePath of buildingTransactionStates) {
      const state = JSON.parse(await readText(statePath));
      const { integrity, ...unsigned } = state;
      const stateErrors = validateTransactionAccumulator(state, { allowBuilding: true });
      if (
        state?.status !== 'building'
        || integrity?.algorithm !== 'sha256-stable-json-v1'
        || integrity?.contentHash !== stableJsonHash(unsigned)
        || stateErrors.length
      ) {
        fail(`maxis deferred Transaction sidecar is not a valid signed building state: ${statePath} ${stateErrors.join('; ')}`);
      }
    }

    const manifest = JSON.parse(await readText('data/maxis/manifest.json'));
    const manifestErrors = validateSeasonCatalog(manifest);
    if (manifestErrors.length) fail(`maxis season manifest invalid: ${manifestErrors.join('; ')}`);
    const activeEntry = (manifest.seasons || []).find((entry) => entry.id === manifest.activeSeasonId);
    if (!activeEntry) fail('maxis season manifest has no matching active entry');
    const localArtifactPath = (value) => String(value || '').replace(/^\/+/, '');
    const activeSummaryPath = localArtifactPath(activeEntry?.summaryPath);
    const activeRulesPath = localArtifactPath(activeEntry?.rulesPath);
    const seasonSummary = activeSummaryPath ? JSON.parse(await readText(activeSummaryPath)) : null;
    const seasonRules = activeRulesPath ? JSON.parse(await readText(activeRulesPath)) : null;
    const careerSeasonContext = careerArtifact?.currentProtocolContext;
    const seasonGovernanceReceipt = seasonSummary?.sourceReceipts?.governance;
    if (careerSeasonContext?.seasonId !== activeEntry?.id
      || Number(careerSeasonContext?.ballots) !== Number(seasonGovernanceReceipt?.ballots || 0)
      || Number(careerSeasonContext?.proposals) !== Number(seasonGovernanceReceipt?.proposals || 0)
      || Number(careerSeasonContext?.actions) !== Number(seasonGovernanceReceipt?.ballots || 0) + Number(seasonGovernanceReceipt?.proposals || 0)) {
      fail('maxis Governance career current-protocol context does not cross-link to the active season receipt');
    }
    if (seasonRules?.version !== SEASON_RULES_VERSION || seasonRules?.evaluatorVersion !== SEASON_EVALUATOR_VERSION || seasonRules?.definition?.deepRankingLimit !== DEEP_RANKING_LIMIT) {
      fail('maxis active season rules do not match the frozen scorer version and deep ranking contract');
    }
    if (seasonRules?.seasonId !== activeEntry?.id || seasonRules?.protocolHash !== activeEntry?.protocolHash || seasonRules?.rulesHash !== activeEntry?.rulesHash || seasonRules?.taxonomyHash !== activeEntry?.taxonomyHash) {
      fail('maxis manifest and active frozen rules identity are out of sync');
    }
    const frozenConfigErrors = validateMaxisConfig(seasonRules?.taxonomySnapshot || {});
    if (frozenConfigErrors.length) fail(`maxis frozen season taxonomy invalid: ${frozenConfigErrors.join('; ')}`);
    if (seasonSummary?.season?.id !== activeEntry?.id || seasonSummary?.season?.protocolHash !== activeEntry?.protocolHash || seasonSummary?.rules?.rulesHash !== activeEntry?.rulesHash) {
      fail('maxis active summary identity or rules receipt does not match the manifest');
    }
    if (seasonSummary?.season?.status !== 'active' || seasonSummary?.season?.endsAt != null || !/next Tezos protocol activation/i.test(seasonSummary?.season?.endsWhen || '')) {
      fail('maxis active summary must declare an open protocol-season end until the next activation exists');
    }
    if (!seasonSummary?.sourceReceipts?.activation?.tzktBlock) fail('maxis active summary must carry an exact activation receipt');
    const transactionStatePath = localArtifactPath(
      activeEntry?.transactionStatePath || seasonSummary?.sourceReceipts?.transaction?.statePath
    );
    let transactionState = null;
    if (transactionStatePath) {
      transactionState = JSON.parse(await readText(transactionStatePath));
      const { integrity, ...unsigned } = transactionState;
      const transactionStateErrors = validateTransactionAccumulator(transactionState);
      if (
        integrity?.algorithm !== 'sha256-stable-json-v1'
        || integrity?.contentHash !== stableJsonHash(unsigned)
        || transactionStateErrors.length
      ) {
        fail(`maxis complete Transaction state is invalid: ${transactionStateErrors.join('; ')}`);
      }
      if (
        transactionState?.season?.id !== activeEntry?.id
        || transactionState?.rules?.evaluatorVersion !== seasonRules?.evaluatorVersion
        || transactionState?.rules?.rulesHash !== seasonRules?.rulesHash
        || integrity?.contentHash !== activeEntry?.transactionStateHash
        || integrity?.contentHash !== seasonSummary?.sourceReceipts?.transaction?.stateHash
      ) {
        fail('maxis complete Transaction state receipts do not cross-link to manifest, rules, and summary');
      }
    } else if (seasonSummary?.artifactBudget) {
      fail('maxis budgeted season summary is missing its complete Transaction state path');
    }
    const summaryTruncationErrors = truncationCoverageErrors(seasonSummary);
    if (summaryTruncationErrors.length) fail(`maxis source truncation is not isolated to unavailable dependent lanes: ${summaryTruncationErrors.join('; ')}`);
    if (Number(seasonSummary?.deepRankingLimit) !== DEEP_RANKING_LIMIT || Number(seasonSummary?.passports?.shardCount) !== PASSPORT_SHARD_COUNT || seasonSummary?.passports?.shardAlgorithm !== PASSPORT_SHARD_ALGORITHM) {
      fail('maxis active summary deep-rank or Passport shard metadata is invalid');
    }

    if (SEASON_CATEGORY_ORDER.includes(MAXIS_L2_GOVERNANCE_CATEGORY)
      || Object.hasOwn(seasonRules?.definition?.lanes || {}, MAXIS_L2_GOVERNANCE_CATEGORY)
      || Object.hasOwn(seasonSummary?.laneStatus || {}, MAXIS_L2_GOVERNANCE_CATEGORY)
      || Object.hasOwn(seasonSummary?.rankings || {}, MAXIS_L2_GOVERNANCE_CATEGORY)
      || Object.hasOwn(seasonSummary?.cutoffs || {}, MAXIS_L2_GOVERNANCE_CATEGORY)) {
      fail('maxis frozen v2 Season must remain byte-compatible and exclude the independent L2 Governance career lane');
    }

    const summaryCategories = Object.keys(seasonSummary?.laneStatus || {});
    if (summaryCategories.slice().sort().join(',') !== SEASON_CATEGORY_ORDER.slice().sort().join(',')) {
      fail(`maxis active summary lane catalog mismatch: ${summaryCategories.join(',')}`);
    }
    for (const category of SEASON_CATEGORY_ORDER) {
      const status = seasonSummary?.laneStatus?.[category];
      const ranking = seasonSummary?.rankings?.[category];
      const cutoff = seasonSummary?.cutoffs?.[category];
      if (!status || !['ready', 'empty', 'unavailable'].includes(status.status)) fail(`maxis season ${category} has an invalid status`);
      if (!Array.isArray(ranking) || ranking.length > 10) fail(`maxis season ${category} summary ranking is invalid`);
      if (status?.status === 'ready' && !ranking?.length) fail(`maxis season ${category} is ready without published standings`);
      if (status?.status === 'unavailable' && (ranking?.length || !status.reason)) fail(`maxis unavailable ${category} must publish no winner and explain why`);
      for (const [index, row] of (ranking || []).entries()) {
        if (row.rank !== index + 1 || !Array.isArray(row.scoreVector) || !row.scoreVector.length || !Object.hasOwn(row, 'delta')) {
          fail(`maxis season ${category} rank ${index + 1} lacks deterministic score/movement data`);
        }
      }
      if (ranking?.[0]?.address !== cutoff?.leader?.address) fail(`maxis season ${category} leader and cutoff receipt disagree`);
      if (ranking?.length >= 2 && ranking[1].address !== cutoff?.nearestChallenger?.address) fail(`maxis season ${category} nearest challenger receipt disagrees`);
      if (ranking?.length >= 10 && ranking[9].address !== cutoff?.topTen?.address) fail(`maxis season ${category} top-ten cutoff receipt disagrees`);
    }

    const summaryShards = seasonSummary?.passports?.nonemptyShards || [];
    const manifestShards = activeEntry?.availableShards || [];
    if (summaryShards.join(',') !== manifestShards.join(',')) fail('maxis summary and manifest disagree on non-empty Passport shards');
    const seenPassportAddresses = new Set();
    const passportLaneCounts = Object.fromEntries(SEASON_CATEGORY_ORDER.map((category) => [category, 0]));
    const verifiedShardHashes = {};
    const passportShardPayloads = new Map();
    for (const shard of manifestShards) {
      if (!/^[0-3][0-9a-f]$/.test(shard)) {
        fail(`maxis manifest contains invalid Passport shard ${shard}`);
        continue;
      }
      const shardPath = localArtifactPath(activeEntry.passportPathTemplate?.replace('{shard}', shard));
      const rawShard = await readText(shardPath);
      const expectedShardHash = seasonSummary?.passports?.shardHashes?.[shard];
      const { value: payload, text: sourceShard } = await readStoredPassport(rawShard, shardPath);
      const actualShardHash = createHash('sha256').update(sourceShard).digest('hex');
      if (!/^[0-9a-f]{64}$/.test(expectedShardHash || '') || actualShardHash !== expectedShardHash) {
        fail(`maxis Passport shard ${shard} does not match its SHA-256 receipt`);
      }
      verifiedShardHashes[shard] = actualShardHash;
      const storedPayload = JSON.parse(rawShard);
      if (seasonSummary?.passports?.algorithm === 'sha256-compact-json-v1' && rawShard !== `${JSON.stringify(storedPayload)}\n`) {
        fail(`maxis Passport shard ${shard} is not canonical compact JSON`);
      }
      passportShardPayloads.set(shard, storedPayload);
      const expectedShardSchema = seasonSummary?.artifactBudget ? 2 : Number(payload.schema);
      if (![1, 2].includes(Number(payload.schema)) || expectedShardSchema !== Number(payload.schema) || payload.seasonId !== activeEntry.id || payload.shard !== shard || payload.shardAlgorithm !== PASSPORT_SHARD_ALGORITHM) {
        fail(`maxis Passport shard ${shard} metadata is incompatible`);
      }
      for (const [address, storedPassport] of Object.entries(payload.passports || {})) {
        const passport = expandPassportRecord(storedPassport);
        if (addressShard(address) !== shard || passport?.address !== address || seenPassportAddresses.has(address)) {
          fail(`maxis Passport ${address} is duplicated, misidentified, or in the wrong shard`);
        }
        seenPassportAddresses.add(address);
        const badgeIds = (passport?.badges || []).map((badge) => badge.id);
        if (badgeIds.length !== new Set(badgeIds).size) fail(`maxis Passport ${address} repeats an earned badge`);
        for (const [category, lane] of Object.entries(passport?.lanes || {})) {
          if (!SEASON_CATEGORY_ORDER.includes(category) || (lane.rank != null && Number(lane.rank) < 1) || Number(lane.personalBestRank) < 1) {
            fail(`maxis Passport ${address} has an invalid ${category} lane record`);
          }
          if (SEASON_CATEGORY_ORDER.includes(category)) passportLaneCounts[category] += 1;
          const milestone = seasonRules?.definition?.lanes?.[category]?.passportMilestone;
          const progress = lane?.badgeProgress;
          const scoreValue = (lane?.scoreVector || []).find((metric) => metric.metric === milestone?.metric)?.value;
          const expectedPercent = milestone?.target > 0 ? Math.min(100, Math.round((Number(scoreValue || 0) / Number(milestone.target)) * 100)) : null;
          if (
            !milestone
            || progress?.version !== milestone.version
            || progress?.metric !== milestone.metric
            || Number(progress?.target) !== Number(milestone.target)
            || Number(progress?.value) !== Number(scoreValue || 0)
            || Number(progress?.percent) !== expectedPercent
            || Boolean(progress?.earned) !== (Number(scoreValue || 0) >= Number(milestone.target))
          ) {
            fail(`maxis Passport ${address} ${category} badge progress is not derived from its frozen milestone`);
          }
        }
        const qualifyingLanes = passport?.unicorn?.qualifyingLanes || [];
        if (passport?.unicorn?.rank != null) passportLaneCounts.unicorn += 1;
        const unicornMilestone = seasonRules?.definition?.lanes?.unicorn?.passportMilestone;
        const unicornProgress = passport?.unicorn?.badgeProgress;
        const expectedUnicornPercent = unicornMilestone?.target > 0
          ? Math.min(100, Math.round((qualifyingLanes.length / Number(unicornMilestone.target)) * 100))
          : null;
        if (
          !unicornMilestone
          || unicornProgress?.version !== unicornMilestone.version
          || unicornProgress?.metric !== unicornMilestone.metric
          || Number(unicornProgress?.target) !== Number(unicornMilestone.target)
          || Number(unicornProgress?.value) !== qualifyingLanes.length
          || Number(unicornProgress?.percent) !== expectedUnicornPercent
          || Boolean(unicornProgress?.earned) !== (qualifyingLanes.length >= Number(unicornMilestone.target))
        ) {
          fail(`maxis Passport ${address} Unicorn progress is not derived from its frozen milestone`);
        }
        if (Number(passport?.unicorn?.breadth || 0) !== qualifyingLanes.length) fail(`maxis Passport ${address} Unicorn breadth disagrees with its lane receipts`);
        for (const lane of qualifyingLanes) {
          if (seasonSummary?.laneStatus?.[lane.category]?.status !== 'ready' || Number(lane.rank) > 100) {
            fail(`maxis Passport ${address} receives Unicorn credit from an unavailable or non-qualifying lane`);
          }
        }
      }
    }
    if (seenPassportAddresses.size !== Number(seasonSummary?.passports?.indexedAddresses || 0)) {
      fail(`maxis Passport shard index count mismatch: ${seenPassportAddresses.size}/${seasonSummary?.passports?.indexedAddresses}`);
    }
    const verifiedContentRootInput = Object.entries(verifiedShardHashes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([shard, hash]) => `${shard}:${hash}`)
      .join('\n');
    const verifiedContentRoot = createHash('sha256').update(verifiedContentRootInput).digest('hex');
    if (verifiedContentRoot !== seasonSummary?.passports?.contentRoot) {
      fail('maxis Passport shard catalog does not match its season content root');
    }
    if (seasonSummary?.artifactBudget && transactionState) {
      const measuredBudget = measureSeasonArtifactBudget({
        rules: seasonRules,
        summary: seasonSummary,
        transactionState,
        shardPayloads: passportShardPayloads,
        limits: seasonSummary.artifactBudget.limits
      });
      const budgetErrors = artifactBudgetErrors(measuredBudget);
      if (JSON.stringify(measuredBudget) !== JSON.stringify(seasonSummary.artifactBudget) || budgetErrors.length) {
        fail(`maxis active artifact budget receipt does not match committed bytes: ${budgetErrors.join('; ')}`);
      }
    }
    for (const category of SEASON_CATEGORY_ORDER) {
      const eligibleCount = Number(seasonSummary?.laneStatus?.[category]?.eligibleCount || 0);
      if (passportLaneCounts[category] !== eligibleCount) {
        fail(`maxis Passport ${category} coverage count mismatch: ${passportLaneCounts[category]}/${eligibleCount}`);
      }
    }
    for (const archivedEntry of (manifest.seasons || []).filter((entry) => entry.status === 'finalized')) {
      const archivedSummary = JSON.parse(await readText(localArtifactPath(archivedEntry.summaryPath)));
      if (!archivedEntry.archiveUrl || archivedSummary?.season?.status !== 'finalized' || !archivedSummary?.integrity?.contentHash || !archivedSummary?.finalization) {
        fail(`maxis finalized season ${archivedEntry.id} lacks an immutable archive receipt`);
      }
    }

    const contracts = [
      ['maxis app import', 'initMaxisChamber', await readText('js/core/chamber-features.mjs')],
      ['maxis pretty path map', "case 'maxis':", app],
      ['maxis hash route', "hash === 'maxis'", app],
      ['maxis site map', "id: 'maxis'", siteMap],
      ['maxis entry card', 'id = \'maxis-entry-card\'', maxis],
      ['maxis shared focus restoration lifecycle', 'deactivateChamberDialog(overlay)', maxis],
      ['maxis Ledger Flow address action', '/#ledger-flow=${address}', maxis],
      ['maxis rank tweet action', 'https://twitter.com/intent/tweet?text=${tweetText}', maxis],
      ['maxis route-scoped rank shares', 'function rankShareUrl(category)', maxis],
      ['maxis unique row action ids', 'function rowActionId(entry, category)', maxis],
      ['maxis row toggle action ownership', 'aria-controls="${escapeHtml(actionsId)}"', maxis],
      ['maxis protocol-season selector', 'class="maxis-season-orb"', maxis],
      ['maxis shared corner trays', 'maxis-corner-tray', maxis],
      ['maxis four-room tab set', "const VIEW_KEYS = ['maxis', 'season', 'passport', 'champions']", maxis],
      ['maxis default canonical room', "view: 'maxis'", maxis],
      ['maxis legacy Crown Hall route alias', "crown: 'maxis'", maxis],
      ['maxis room-aware season selector', "seasonContext ? renderSeasonSelector() : ''", maxis],
      ['maxis neutral canonical hero', 'maxis-context-hero maxis-maxis-hero', maxis],
      ['maxis neutral Champions hero', 'maxis-context-hero maxis-champions-hero', maxis],
      ['maxis all-lane canonical overview', 'data-maxis-overview-lane=', maxis],
      ['maxis canonical detailed board', 'id="maxis-maxis-detail"', maxis],
      ['maxis single selected lane board', 'data-maxis-board=', maxis],
      ['maxis conservative pass-gap normalization', 'conservativeVectorPath', maxis],
      ['maxis archived pass-gap compatibility', ': gap.minimalKnownPath', maxis],
      ['maxis pass-gap certainty disclosure', 'conservative static-vector path:', maxis],
      ['maxis frozen archive lane catalog', 'archiveLaneCatalog', maxis],
      ['maxis frozen archive lane title', 'frozenLaneTitle', maxis],
      ['maxis frozen archive lane order', 'frozenLaneOrder', maxis],
      ['maxis final champion identity receipt', 'maxis-champion-record', maxis],
      ['maxis final champion on-chain trails', 'maxis-champion-actions', maxis],
      ['maxis final archive summary receipt', 'maxis-archive-summary-action', maxis],
      ['maxis frozen archive rules receipt', 'maxis-archive-rules-action', maxis],
      ['maxis compact transaction Passport adapter', "profile?.format === 'transaction-only-v1'", maxis],
      ['maxis compact transaction top-ten adapter', 'record?.topTenGap', maxis],
      ['maxis compact Unicorn progress adapter', 'profile?.unicornProgress?.breadth', maxis],
      ['maxis compact transaction near-miss adapter', 'function profileNearMisses', maxis],
      ['maxis Passport SHA-256 shard routing', 'const digestHex = await sha256Text(address.trim())', maxis],
      ['maxis Passport in-flight shard deduplication', 'shardRequestCache.has(key)', maxis],
      ['maxis Passport explicit-address form', 'data-maxis-passport-form', maxis],
      ['maxis Passport Tezos Domains resolver import', 'resolveTezDomainAddress', maxis],
      ['maxis Passport .tez input affordance', 'Tezos address or .tez name for Maxi Passport', maxis],
      ['shared Tezos Domains GraphQL endpoint', 'https://api.tezos.domains/graphql', tezosDomainsCore],
      ['shared Tezos Domains address validator export', 'export function isTezosAddress', tezosDomainsCore],
      ['shared Tezos Domains record resolver export', 'export async function resolveTezDomainRecord', tezosDomainsCore],
      ['shared Tezos Domains reverse batch export', 'export async function resolveTezReverseNames', tezosDomainsCore],
      ['shared Tezos Domains one-request reverse batch', 'query ReverseLookupBatch', tezosDomainsCore],
      ['shared Tezos Domains reverse cache', 'reverseNameCache.set', tezosDomainsCore],
      ['shared Tezos Domains resolution provenance', "source: address ? 'address' : owner ? 'owner' : null", tezosDomainsCore],
      ['shared Tezos Domains owner fallback', '[domain.address, domain.owner].find', tezosDomainsCore],
      ['maxis Passport Career section', 'maxis-passport-career', maxis],
      ['maxis Passport This Season section', 'maxis-passport-season', maxis],
      ['maxis cross-season Passport loader', 'function loadPassportCareer', maxis],
      ['maxis cross-season badge aggregation', 'function careerBadgeRecords', maxis],
      ['maxis cross-season personal best aggregation', 'function careerPersonalBestRecords', maxis],
      ['maxis cross-season breadth receipt', 'Cross-season breadth', maxis],
      ['maxis phase-aware selected-season badge separation', '${escapeHtml(scope.passportScope)} stamps', maxis],
      ['maxis scoped season summary failure', 'Selected season is scoped unavailable', maxis],
      ['maxis scoped season retry', 'data-maxis-season-retry', maxis],
      ['maxis scoped final archive retry', 'data-maxis-archives-retry', maxis],
      ['maxis explicit season phase', 'data-maxis-season-phase=', maxis],
      ['maxis stale summary request guard', 'refreshSerial !== summaryRequestSerial', maxis],
      ['maxis independent Governance career artifact', "const CAREER_DATA_URL = '/data/maxis-careers.json'", maxis],
      ['maxis Governance career integrity check', 'The Governance career artifact failed its SHA-256 integrity receipt.', maxis],
      ['maxis Passport exact Governance career record', 'maxis-governance-career', maxis],
      ['maxis independent L2 Governance career artifact', "const L2_GOVERNANCE_DATA_URL = '/data/maxis-l2-governance.json'", maxis],
      ['maxis L2 Governance career integrity check', 'The L2 Governance Maxi artifact failed its SHA-256 integrity receipt.', maxis],
      ['maxis canonical L2 Governance lane', "'l2_governance'", maxis],
      ['maxis L2 Governance contextual handoff', 'maxis-l2-governance-context', maxis],
      ['maxis L2 Chamber action', 'href="/l2chamber/"', maxis],
      ['maxis Passport separate L1 Governance career', 'maxis-l1-governance-career', maxis],
      ['maxis Passport separate L2 Governance career', 'maxis-l2-governance-career', maxis],
      ['maxis L2 Governance scoped failure style', '.maxis-l2-governance-career.is-unavailable', maxisCss],
      ['maxis L2 Governance site-map child', "id: 'maxis-l2-governance'", siteMap],
      ['maxis L2 Governance direct intent', "href: '/maxis/?lane=l2_governance'", siteMap],
      ['maxis current protocol Governance context', 'maxis-governance-context', maxis],
      ['maxis quiet Governance season truth', 'No actionable Governance window occurred in this protocol season, so no season crown is declared.', maxis],
      ['maxis quiet Governance no-ballot truth', 'no qualifying ballot or proposal activity was recorded, so no season crown is declared.', maxis],
      ['maxis quiet Governance enduring-record handoff', 'data-maxis-handoff-lane=', maxis],
      ['maxis objective crown disclosure', 'Crowns are objective activity metrics, not endorsements.', maxis],
      ['maxis opeculiar idea credit', 'Chamber idea by <strong>opeculiar</strong>', maxis],
      ['maxis footer idea credit', '<span class="maxis-idea-credit">', maxis],
      ['maxis centered footer idea credit styles', '.maxis-footer > .maxis-idea-credit', maxisCss],
      ['maxis protocol-season stage', '.maxis-season-stage', maxisCss],
      ['maxis mirrored corner inset', '--maxis-corner-inset', maxisCss],
      ['maxis HEN circular corner exception', '[data-theme="hen"] #maxis-modal .maxis-season-orb', maxisCss],
      ['maxis NERV circular corner exception', '[data-theme="nerv"] #maxis-modal .maxis-season-orb', maxisCss],
      ['maxis four-room tabs', '.maxis-room-tabs', maxisCss],
      ['maxis podium', '.maxis-podium', maxisCss],
      ['maxis compact ranks four through ten', '.maxis-compact-ranking', maxisCss],
      ['maxis Passport progress track', '.maxis-progress-track', maxisCss],
      ['maxis Champions archive cards', '.maxis-champion-card', maxisCss],
      ['My Tezos Passport link', 'my-tezos-maxi-passport-link', myTezos]
    ];
    for (const [label, snippet, source] of contracts) {
      if (!source.includes(snippet)) fail(`missing ${label}`);
    }
    if (maxisCss.includes('.drawer-maxi-passport-card')) {
      fail('My Tezos Maxi Passport styling must not depend on the lazy Maxis room stylesheet');
    }
    if (!/domain\(name:\s*\$name\)\s*\{\s*address\s+owner\s*\}/s.test(tezosDomainsCore)) {
      fail('shared Tezos Domains resolver must request both address and owner');
    }
    if (!/#chambers-grid\s+#maxis-entry-card\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s.test(maxisCss)) {
      fail('maxis single-card launcher pair must span its full grid at every viewport');
    }
    if (!/\.maxis-entry-front\s*>\s*\.maxis-entry-season-front\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s.test(maxisCss)) {
      fail('maxis launcher composition must span the full card content grid');
    }
    const maxisRoute = CHAMBER_ROUTES.find((route) => route.slug === 'maxis');
    if (!/On-Chain Crowns/.test(maxisRoute?.title || '') || maxisRoute?.eyebrow !== 'On-Chain Crowns' || !/honest natural clocks/i.test(maxisRoute?.description || '')) {
      fail(`maxis route metadata must lead with canonical crowns rather than season-only framing: ${JSON.stringify(maxisRoute)}`);
    }
    if (/on the known tie path/i.test(maxis)) fail('maxis UI must not present a frozen score-vector path as a known dynamic minimum');
    const governanceRefreshIndex = generatedSurfaces.indexOf("nodeScript('scripts/refresh-governance-data.mjs'");
    const maxisRefreshIndex = generatedSurfaces.indexOf("nodeScript('scripts/refresh-maxis-data.mjs'");
    const maxisCareerRefreshIndex = generatedSurfaces.indexOf("nodeScript('scripts/refresh-maxis-careers.mjs'");
    const maxisL2GovernanceRefreshIndex = generatedSurfaces.indexOf("nodeScript('scripts/refresh-maxis-l2-governance.mjs'");
    if (governanceRefreshIndex < 0 || maxisRefreshIndex < 0 || maxisCareerRefreshIndex < 0
      || governanceRefreshIndex > maxisRefreshIndex || maxisRefreshIndex > maxisCareerRefreshIndex) {
      fail('generated surfaces must refresh governance, frozen-season Maxis data, and mutable career context in dependency order');
    }
    if (maxisL2GovernanceRefreshIndex < 0) {
      fail('generated surfaces must check or refresh the independent L2 Governance Maxi artifact');
    }
    if (!/const activeSeasonGeneratedAt = new Date\(\)\.toISOString\(\);\s*const buildOptions = \{\s*season,\s*rules,\s*generatedAt: activeSeasonGeneratedAt,[\s\S]*?\};\s*const fullSeasonSnapshot = await buildFullSeasonSnapshot\(buildOptions\);/.test(maxisGenerator)) {
      fail('Maxis active-season builds must capture a fresh timestamp immediately before resolving their live Transaction boundary');
    }
    if (packageJson?.scripts?.['refresh:maxis-careers'] !== 'node scripts/refresh-maxis-careers.mjs'
      || packageJson?.scripts?.['check:maxis-careers'] !== 'node scripts/refresh-maxis-careers.mjs --check') {
      fail('package scripts must expose Maxis Governance career refresh and offline validation');
    }
    if (packageJson?.scripts?.['refresh:maxis-l2-governance'] !== 'node scripts/refresh-maxis-l2-governance.mjs'
      || packageJson?.scripts?.['check:maxis-l2-governance'] !== 'node scripts/refresh-maxis-l2-governance.mjs --check') {
      fail('package scripts must expose L2 Governance Maxi refresh and offline validation');
    }
    pass('Tezos Maxis taxonomy, snapshot, scoring, route, and Ledger Flow contracts checked');
  }

  async function checkTezosCrpContracts() {
    const dataset = JSON.parse(await readText('data/tezoscrp-awards.json'));
    const summary = JSON.parse(await readText('data/tezoscrp-summary.json'));
    const identityAliases = JSON.parse(await readText('data/tezoscrp-identity-aliases.json'));
    const feature = await readText('js/features/tezoscrp.js');
    const css = await readText('css/tezoscrp.css');
    const maxisCss = await readText('css/maxis.css');
    const tezosDomainsCss = await readText('css/tezos-domains.css');
    const app = await readText('js/core/app.js');
    const siteMap = await readText('js/core/site-map.js');
    const routes = await readText('scripts/lib/chamber-routes.mjs');
    const generatedSurfaces = await readText('scripts/refresh-generated-surfaces.mjs');
    const workflow = await readText('.github/workflows/refresh-tezoscrp.yml');
    const packageJson = JSON.parse(await readText('package.json'));

    const identityErrors = validateTezosCrpIdentityAliases(identityAliases, dataset);
    if (identityErrors.length) fail(`TezosCRP identity registry is invalid: ${identityErrors.join('; ')}`);
    const errors = validateTezosCrpDataset(dataset, identityAliases);
    if (errors.length) fail(`TezosCRP dataset is invalid: ${errors.join('; ')}`);
    if (dataset.awards.length < 2218 || dataset.people_summary.length < 827 || dataset.coverage.covered_periods < 69) {
      fail('TezosCRP archive must preserve the complete October 2020 through June 2026 baseline');
    }
    if (dataset.identity_resolution?.applied_alias_ids < 43 || dataset.identity_resolution?.pending_review_records !== identityAliases.pending_review.length) {
      fail('TezosCRP archive must retain its verified alias resolutions and explicit pending-review boundary');
    }
    for (const [canonicalPersonId, expectedAwards] of [['x:nicefishtaco', 3], ['x:cleofis', 2], ['x:flexasaurusrex', 7], ['x:one_bald_dude', 7]]) {
      const person = dataset.people_summary.find(({ person_id }) => person_id === canonicalPersonId);
      if (!person || person.total_awards < expectedAwards) fail(`TezosCRP canonical identity ${canonicalPersonId} lost verified award receipts`);
    }
    if (dataset.coverage.missing_periods.length || dataset.coverage.expected_periods !== dataset.coverage.covered_periods) {
      fail('TezosCRP monthly coverage must remain consecutive from the first through latest award period');
    }
    if (summary.totals.awards !== dataset.awards.length
        || summary.totals.people !== dataset.people_summary.length
        || summary.totals.periods !== dataset.coverage.covered_periods
        || summary.totals.categories !== dataset.category_summary.length) {
      fail('TezosCRP summary totals must reconcile exactly to the full archive');
    }
    if (summary.current_categories.length !== 9 || summary.current_categories.some((category, index) => category.icon !== `/assets/tezoscrp/cat-icon${String(index + 1).padStart(2, '0')}.png`)) {
      fail('TezosCRP summary must retain all nine current categories and their official icon mapping');
    }
    const year2022 = summary.records?.years?.find(({ year }) => year === 2022);
    const assimilationRecord = summary.records?.categories?.find(({ category }) => category === 'Assimilation Award');
    if (summary.records?.years?.length < 7
        || summary.records?.categories?.length !== dataset.category_summary.length
        || year2022?.record !== 17
        || year2022?.leaders?.[0]?.display_name !== 'Baking Benjamins'
        || assimilationRecord?.record < 25
        || !assimilationRecord?.leaders?.length) {
      fail('TezosCRP category and annual record projections must reconcile to the official award archive');
    }
    for (let index = 1; index <= 9; index += 1) {
      const icon = `assets/tezoscrp/cat-icon${String(index).padStart(2, '0')}.png`;
      if (!(await pathExists(icon))) fail(`TezosCRP official category icon is missing: ${icon}`);
    }

    for (const [label, needle, source] of [
      ['feature initializer', 'initTezosCrpChamber', await readText('js/core/chamber-features.mjs')],
      ['pretty route opener', "case 'tezoscrp':", app],
      ['hash route', "hash === 'tezoscrp'", app],
      ['close cleanup', 'closeTezosCrpChamber', await readText('js/core/chamber-features.mjs')],
      ['People category facet', "id: 'tezoscrp'", siteMap],
      ['category target', "tezoscrp: { selector: '#tezoscrp-entry-card', layout: 'featured' }", app],
      ['site-map destination', "href: '/tezoscrp/'", siteMap],
      ['site-map records intent', "view=records", siteMap],
      ['site-map archive intent', "view=archive", siteMap],
      ['pretty route metadata', "slug: 'tezoscrp'", routes],
      ['generated data target', "'data/tezoscrp-summary.json'", generatedSurfaces],
      ['central summary version stamp', "versionedAsset('/data/tezoscrp-summary.json')", feature],
      ['central compact archive version stamp', "versionedAsset('/data/tezoscrp-awards.compact.json')", feature],
      ['compact decoding at the read boundary', 'decodeTezosCrpDataset(await response.json())', feature],
      ['generated compact target', "'data/tezoscrp-awards.compact.json'", generatedSurfaces],
      ['scheduled compact publication', 'data/tezoscrp-awards.compact.json', workflow],
      ['daily schedule', "23 13 * * *", workflow],
      ['refresh command', 'refresh:tezoscrp', JSON.stringify(packageJson.scripts)],
      ['check command', 'check:tezoscrp', JSON.stringify(packageJson.scripts)]
    ]) {
      if (!source.includes(needle)) fail(`TezosCRP ${label} contract is missing`);
    }

    for (const copy of [
      'one official category listing equals one award',
      'most posts do not state a per-person XTZ payout',
      'uncertain lookalikes remain separate',
      'Ranked by category awards, with recognized months shown separately',
      'Ties stay ties',
      'after verified alias merges',
      'Official source'
    ]) {
      if (!feature.includes(copy)) fail(`TezosCRP truth/source copy is missing: ${copy}`);
    }
    if (!feature.includes('function hasPublishedAmount(award)') || !feature.includes('award?.amount_tez !== null')) {
      fail('TezosCRP must distinguish an unpublished payout amount from an explicit numeric amount');
    }
    if (feature.includes('setInterval(')) fail('TezosCRP client must not poll; the committed archive is refreshed by the repository workflow');
    for (const selector of ['.tezoscrp-entry-card', '.tezoscrp-entry-identity-strip', '.tezoscrp-entry-pulse', '.tezoscrp-hero-badges', '.tezoscrp-overlay', '.tezoscrp-tabs', '.tezoscrp-ranking', '.tezoscrp-record-board', '.tezoscrp-record-holder-grid', '.tezoscrp-category-grid', '.tezoscrp-archive-list']) {
      if (!css.includes(selector)) fail(`TezosCRP CSS is missing ${selector}`);
    }
    if (!feature.includes("renderChamberHeader({") || !feature.includes("room: 'tezoscrp'")) fail('TezosCRP must open with the shared Chamber header');
    for (const contract of ['data-tezoscrp-place="${index + 1}"', 'Most recognized TezosCRP identities', 'Human identity archive', '${overviewMetrics()}', "records: 'Records'", 'function renderRecords()', 'data-tezoscrp-record-year']) {
      if (!feature.includes(contract)) fail(`TezosCRP Maxis-inspired presentation contract is missing: ${contract}`);
    }
    if (!/#chambers-grid \.tezoscrp-entry-card\s*\{[^}]*height:\s*290px;[^}]*min-height:\s*290px;/s.test(css)) {
      fail('TezosCRP full-row launcher must keep its tightened 290px desktop shell');
    }
    if (!/\.tezoscrp-overlay\s*\{[^}]*z-index:\s*10002\s*!important;/s.test(css)) {
      fail('TezosCRP Chamber must render above theme spectacle canvases so archive figures stay readable');
    }
    if (!/#chambers-grid #maxis-entry-card\.maxis-entry-card\.chamber-entry-wide\s*\{[^}]*height:\s*360px !important;[^}]*min-height:\s*360px !important;/s.test(maxisCss)) {
      fail('Maxis categorized launcher must keep its compact 360px desktop shell');
    }
    if (!/@media \(min-width: 900px\)\s*\{[^}]*#chambers-grid > \.chamber-category > \.chamber-category-cards > \.tezos-domains-entry-card[^}]*height:\s*298px;[^}]*min-height:\s*298px;/s.test(tezosDomainsCss)) {
      fail('Tezos Domains category launcher must keep its 298px desktop shell');
    }

    const route = await readText('tezoscrp/index.html');
    if (!route.includes('<link rel="canonical" href="https://tezos.systems/tezoscrp/">') || !route.includes('/og/tezoscrp.png')) {
      fail('TezosCRP generated route must retain its canonical URL and dedicated OG image');
    }

    pass(`TezosCRP source, identity, category, route, and cadence contracts checked (${dataset.awards.length} awards across ${dataset.coverage.covered_periods} months)`);
  }

  return { checkMaxisContracts, checkTezosCrpContracts };
}
