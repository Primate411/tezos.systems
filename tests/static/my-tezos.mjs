// Static contracts owned by my-tezos. Shared dependencies remain explicit.
export function createMyTezosStaticChecks({
  MY_TEZOS_PORTFOLIO_SCHEMA,
  MyTezosRequestBroker,
  PARIS_ACTIVATION_LEVEL,
  aggregateCollectionHoldings,
  aggregateEtherlinkAccounts,
  appendPortfolioSnapshot,
  assert,
  buildBakerCapacitySnapshot,
  buildExactBalanceHistoryView,
  buildHistoricalBalanceSchedule,
  calculatePortfolioTotals,
  classifyObjktNftActivity,
  compactPortfolioHistory,
  createActivity,
  dedupeMyTezosActivities,
  fail,
  findMyTezosContractRule,
  fingerprintMyTezosRequest,
  historicalBalanceSource,
  mergePortfolioEntries,
  normalizeBakerRewardEdge,
  normalizeBakerStakingLimit,
  normalizeLinkedL2Accounts,
  normalizeObjktHolding,
  normalizeSavedMyTezosEntries,
  parsePortfolioImport,
  pass,
  portfolioCompositionKey,
  portfolioRowFromAccount,
  readText,
  resolveHistoricalScheduleTimestamps,
  upsertLinkedEtherlinkAccount,
  vm
}) {
  async function checkMyTezosPortfolioContracts() {
    const addressA = 'tz1X568Wdkb1ZUs8qfVYcsZD31YQ4UV3sdY4';
    const addressB = 'tz1gBXG9fg8RMDH69KfKqwoTH5sFDmzt5yzm';
    const addressC = 'tz1Yw8SgnsAmbQcJyaBbQokoYGxeeoX5AKYw';
    const migrated = normalizeSavedMyTezosEntries([
      { address: addressA, label: 'Vault' },
      { address: addressA, label: 'Duplicate' },
      { address: addressB, included: false }
    ], { now: 1234 });
    assert.equal(migrated.length, 2);
    assert.deepEqual(migrated[0], {
      network: 'tezos-l1', address: addressA, label: 'Vault', included: true, addedAt: 1234
    });
    assert.equal(migrated[1].included, false);
    const uniqueAddresses = '123456789ABC'.split('').map((suffix) => `tz1${'1'.repeat(32)}${suffix}`);
    assert.equal(normalizeSavedMyTezosEntries(uniqueAddresses.map((address) => ({ address }))).length, 10);

    assert.equal(normalizeBakerStakingLimit(2_000_000, 9), 2);
    assert.equal(normalizeBakerStakingLimit(12_000_000, 9), 9);
    assert.equal(normalizeBakerRewardEdge(125_000_000), 0.125);
    assert.deepEqual(buildBakerCapacitySnapshot({
      active: true,
      stakedBalance: 100_000_000,
      externalDelegatedBalance: 500_000_000,
      externalStakedBalance: 300_000_000,
      limitOfStakingOverBaking: 2_000_000,
      edgeOfBakingOverStaking: 100_000_000
    }, 9), {
      active: true,
      ownStake: 100,
      externalDelegated: 500,
      externalStaked: 300,
      globalDelegationLimit: 9,
      stakingLimit: 2,
      rewardEdge: 0.1,
      maxDelegation: 900,
      maxExternalStake: 200,
      freeDelegationCapacity: 400,
      freeStakingCapacity: -100,
      delegationUsage: 500 / 9,
      stakingUsage: 150,
      acceptsExternalStake: false,
      pendingStakingParameters: null
    });

    const rowA = portfolioRowFromAccount(migrated[0], {
      address: addressA,
      balance: 6_000_000,
      stakedBalance: 2_000_000,
      unstakedBalance: 3_000_000,
      delegate: { address: addressC, alias: 'Baker' }
    });
    const rowB = portfolioRowFromAccount({ ...migrated[1], included: true }, {
      address: addressB,
      type: 'delegate',
      balance: 15_000_000,
      stakedBalance: 5_000_000,
      unstakedBalance: 6_000_000
    });
    assert.equal(rowA.total, 6_000_000);
    assert.equal(rowA.spendable, 1_000_000);
    assert.equal(rowB.total, 15_000_000);
    assert.equal(rowB.spendable, 4_000_000);
    assert.deepEqual(calculatePortfolioTotals([rowA, rowB]), {
      total: 21_000_000, spendable: 5_000_000, staked: 7_000_000, unstaking: 9_000_000
    });
    assert.notEqual(
      portfolioCompositionKey([migrated[0]]),
      portfolioCompositionKey([migrated[0], { ...migrated[1], included: true }])
    );

    const now = Date.UTC(2026, 6, 22, 12);
    const makePoint = (timestamp, total) => ({ timestamp, total, spendable: total, staked: 0, unstaking: 0 });
    const compacted = compactPortfolioHistory([
      makePoint(now - 60 * 60 * 1000 + 1, 1),
      makePoint(now - 60 * 60 * 1000 + 2, 2),
      makePoint(now - 31 * 24 * 60 * 60 * 1000 + 1, 3),
      makePoint(now - 31 * 24 * 60 * 60 * 1000 + 2, 4),
      makePoint(now - 366 * 24 * 60 * 60 * 1000, 5)
    ], { now });
    assert.deepEqual(compacted.map((point) => point.total), [5, 4, 2]);
    const composition = portfolioCompositionKey([migrated[0]]);
    const store = appendPortfolioSnapshot({ schema: 1, series: {} }, composition, makePoint(now, 6), { now });
    assert.equal(store.series[composition].length, 1);

    const parsed = parsePortfolioImport({
      schema: MY_TEZOS_PORTFOLIO_SCHEMA,
      entries: [
        { network: 'tezos-l1', address: addressA, label: 'Imported', included: false },
        { network: 'etherlink', address: addressB },
        { network: 'tezos-l1', address: 'not-an-address' }
      ]
    });
    assert.equal(parsed.entries.length, 1);
    assert.equal(parsed.skipped, 2);
    assert.equal(parsed.entries[0].included, false);
    assert.throws(() => parsePortfolioImport({ schema: 'unknown', entries: [] }));
    assert.deepEqual(
      mergePortfolioEntries(migrated, parsed.entries).map((entry) => entry.address),
      [addressA, addressB]
    );

    const l2Address = `0x${'a'.repeat(40)}`;
    const linked = upsertLinkedEtherlinkAccount([], {
      address: l2Address.toUpperCase().replace('0X', '0x'),
      label: 'Studio'
    }, { activeL1Address: addressA, now: 1000 });
    assert.equal(linked.entries.length, 1);
    assert.equal(linked.entries[0].verification, 'unverified-device-local');
    const relinked = upsertLinkedEtherlinkAccount(linked.entries, {
      address: l2Address,
      linkedL1Addresses: [addressB]
    }, { activeL1Address: addressA, now: 2000 });
    assert.equal(relinked.existed, true);
    assert.deepEqual(relinked.entries[0].linkedL1Addresses, [addressA, addressB]);
    assert.equal(normalizeLinkedL2Accounts([...linked.entries, ...relinked.entries]).length, 1);
    assert.deepEqual(aggregateEtherlinkAccounts([
      { address: l2Address, nativeXtz: 1, transactions: 2 },
      { address: l2Address.toUpperCase().replace('0X', '0x'), nativeXtz: 100, transactions: 200 }
    ]), {
      accounts: 1, nativeXtz: 1, erc20Assets: 0, nftAssets: 0, transactions: 2, lastActivity: 0
    });

    const receiptActivity = createActivity({
      id: 'out',
      accountKey: `l1:${addressA}`,
      layer: 'l1',
      kind: 'xtz-transfer',
      direction: 'out',
      timestamp: now,
      operationHash: 'opSelf',
      groupKey: 'opSelf',
      amount: 1_000_000,
      confidence: 'exact'
    });
    const selfActivity = dedupeMyTezosActivities([
      receiptActivity,
      { ...receiptActivity, id: 'in', accountKey: `l1:${addressB}`, direction: 'in' }
    ], [`l1:${addressA}`, `l1:${addressB}`]);
    assert.equal(selfActivity.length, 1);
    assert.equal(selfActivity[0].kind, 'self-transfer');
    assert.equal(selfActivity[0].summary, 'Moved between your included wallets');

    const schedule = buildHistoricalBalanceSchedule({
      protocols: [
        { name: 'Before', block: 1, blockTime: 60 },
        { name: 'Paris', block: 20_000, blockTime: 10 },
        { name: 'Quebec', block: 100_000, blockTime: 8 }
      ],
      accountCreationLevels: [1_000, 110_000],
      oneYearLevel: 70_000,
      finalizedLevel: 130_000
    });
    assert(schedule.some((point) => point.level === 1_000 && point.anchors.includes('account-creation')));
    assert(schedule.some((point) => point.level === 110_000 && point.anchors.includes('account-creation')));
    assert(schedule.some((point) => point.level === 70_000 && point.anchors.includes('one-year-boundary')));
    assert(schedule.some((point) => point.level === 130_000 && point.anchors.includes('latest-finalized')));
    assert(schedule.some((point) => point.level === 20_000 && point.anchors.includes('protocol-boundary')));
    assert(schedule.some((point) => point.level === 100_000 && point.anchors.includes('protocol-boundary')));
    assert(schedule.some((point) => point.cadence === 'weekly'));
    assert(schedule.some((point) => point.cadence === 'daily'));
    assert.equal(new Set(schedule.map((point) => point.level)).size, schedule.length);
    assert(schedule.filter((point) => point.sampleStep).every((point) => point.level % point.sampleStep === 0));
    const fullYearSchedule = buildHistoricalBalanceSchedule({
      protocols: [{ name: 'Minute blocks', block: 1, blockTime: 60 }],
      accountCreationLevels: [1],
      oneYearLevel: 525_601,
      finalizedLevel: 1_051_201
    });
    assert(fullYearSchedule.filter((point) => point.cadence === 'daily').length >= 365);
    assert(fullYearSchedule.filter((point) => point.cadence === 'weekly').length >= 52);
    const recentAccountSchedule = buildHistoricalBalanceSchedule({
      protocols: [{ name: 'Minute blocks', block: 1, blockTime: 60 }],
      accountCreationLevels: [900_000],
      oneYearLevel: 525_601,
      finalizedLevel: 1_051_201
    });
    assert(recentAccountSchedule.some((point) => point.level === 525_601 && point.anchors.includes('one-year-boundary')));
    assert(recentAccountSchedule.some((point) => point.level < 900_000 && point.cadence === 'daily'));

    const timestampedSchedule = resolveHistoricalScheduleTimestamps(
      schedule,
      schedule.map((point, index) => ({
        level: point.level,
        timestamp: new Date(now + index * 1000).toISOString()
      }))
    );
    assert(timestampedSchedule.every((point) => Number.isFinite(point.timestamp)));
    assert.equal(historicalBalanceSource({ address: addressA, type: 'user', stakingOpsCount: 2 }, PARIS_ACTIVATION_LEVEL - 1), 'tzkt');
    assert.equal(historicalBalanceSource({ address: addressA, type: 'delegate', stakingOpsCount: null }, PARIS_ACTIVATION_LEVEL), 'tzkt');
    assert.equal(historicalBalanceSource({ address: 'KT1ExactHistory11111111111111111111111', type: 'contract' }, PARIS_ACTIVATION_LEVEL), 'tzkt');
    assert.equal(historicalBalanceSource({ address: addressA, type: 'user', stakingOpsCount: 0 }, PARIS_ACTIVATION_LEVEL), 'tzkt');
    assert.equal(historicalBalanceSource({ address: addressA, type: 'user', stakingOpsCount: 1 }, PARIS_ACTIVATION_LEVEL), 'archive');
    assert.equal(historicalBalanceSource({ address: addressA, type: 'user', stakingOpsCount: null }, PARIS_ACTIVATION_LEVEL), 'archive');

    const exactSchedule = [
      { level: 100, timestamp: now - 2000, cadence: 'weekly', protocol: 'Test' },
      { level: 200, timestamp: now - 1000, cadence: 'daily', protocol: 'Test' },
      { level: 300, timestamp: now, cadence: 'daily', protocol: 'Test' }
    ];
    const exactView = buildExactBalanceHistoryView({
      entries: [{ address: addressA }, { address: addressB }],
      accounts: [
        { address: addressA, firstActivity: 100 },
        { address: addressB, firstActivity: 200 }
      ],
      schedule: exactSchedule,
      recordsByAddress: {
        [addressA]: exactSchedule.map((point, index) => ({
          ...point,
          address: addressA,
          totalMutez: (index + 1) * 1_000_000,
          confidence: 'exact',
          source: 'tzkt-stepped-balance-history'
        })),
        [addressB]: [{
          ...exactSchedule[1],
          address: addressB,
          totalMutez: 4_000_000,
          confidence: 'exact',
          source: 'octez-archive'
        }]
      }
    });
    assert.equal(exactView.seriesByAddress[addressB][0].totalMutez, 0);
    assert.equal(exactView.seriesByAddress[addressB][0].source, 'pre-creation-zero');
    assert.deepEqual(exactView.aggregate.map((point) => point.totalMutez), [1_000_000, 6_000_000]);
    assert.deepEqual(exactView.aggregate.map((point) => point.level), [100, 200]);
    assert.equal(exactView.aggregateCoverage.completed, 2);
    assert.equal(exactView.aggregateCoverage.target, 3);
    assert.deepEqual(exactView.aggregateCoverage.missing, [300]);

    const holdingA = normalizeObjktHolding({
      quantity: 2,
      last_incremented_at: new Date(now).toISOString(),
      token: {
        fa_contract: 'KT1Asset',
        token_id: '1',
        name: 'One',
        fa: { name: 'Collection', contract: 'KT1Asset' }
      }
    }, addressA);
    const holdingB = normalizeObjktHolding({
      quantity: 3,
      token: {
        fa_contract: 'KT1Asset',
        token_id: '1',
        name: 'One',
        flag: 'none',
        fa: { name: 'Collection', contract: 'KT1Asset' }
      }
    }, addressB);
    assert.equal(holdingB.spam, false, 'neutral Objkt flag values must not hide valid holdings');
    const aggregatedHoldings = aggregateCollectionHoldings([holdingA, holdingB]);
    assert.equal(aggregatedHoldings[0].quantity, 5);
    assert.deepEqual(new Set(aggregatedHoldings[0].ownerAddresses), new Set([addressA, addressB]));
    assert.deepEqual(classifyObjktNftActivity({
      event: { type: 'listing_sale', ophash: 'opSale' },
      tzktTransfer: { operationHash: 'opSale', from: addressB, to: addressA },
      ownerAddress: addressA
    }), { kind: 'nft-purchase', direction: 'in', confidence: 'joined' });
    assert.equal(classifyObjktNftActivity({ event: { type: 'sale' } }).confidence, 'unknown');
    assert.equal(findMyTezosContractRule({
      l1: [{ address: 'KT1Dex', kind: 'dex' }],
      l2: []
    }, 'l1', 'KT1Dex')?.kind, 'dex');

    assert.equal(
      fingerprintMyTezosRequest({ method: 'post', url: '/same', body: '{"a":1}' }),
      fingerprintMyTezosRequest({ method: 'POST', url: '/same', body: '{"a":1}' })
    );
    let brokerCalls = 0;
    let releaseBroker;
    const brokerGate = new Promise((resolve) => { releaseBroker = resolve; });
    const dedupeBroker = new MyTezosRequestBroker({
      fetchImpl: async () => {
        brokerCalls += 1;
        await brokerGate;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    });
    const firstBrokerRequest = dedupeBroker.request('/dedupe', { provider: 'tzkt' });
    const secondBrokerRequest = dedupeBroker.request('/dedupe', { provider: 'tzkt' });
    releaseBroker();
    assert.deepEqual(await Promise.all([firstBrokerRequest, secondBrokerRequest]), [{ ok: true }, { ok: true }]);
    assert.equal(brokerCalls, 1);

    let archiveActive = 0;
    let archiveMaxActive = 0;
    let releaseArchive;
    const archiveGate = new Promise((resolve) => { releaseArchive = resolve; });
    const boundedArchiveBroker = new MyTezosRequestBroker({
      fetchImpl: async () => {
        archiveActive += 1;
        archiveMaxActive = Math.max(archiveMaxActive, archiveActive);
        await archiveGate;
        archiveActive -= 1;
        return new Response('1', { status: 200, headers: { 'content-type': 'application/json' } });
      }
    });
    const archiveRequests = Array.from({ length: 12 }, (_, index) => (
      boundedArchiveBroker.request(`/archive/${index}`, { provider: 'octezArchive' })
    ));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(archiveMaxActive, 6);
    releaseArchive();
    await Promise.all(archiveRequests);

    let rateLimitCalls = 0;
    const rateLimitedBroker = new MyTezosRequestBroker({
      fetchImpl: async () => {
        rateLimitCalls += 1;
        if (rateLimitCalls === 1) {
          return new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
        }
        return new Response('1', { status: 200, headers: { 'content-type': 'application/json' } });
      }
    });
    assert.equal(await rateLimitedBroker.request('/rate-limit', {
      provider: 'octezArchive',
      retries: 1
    }), 1);
    assert.equal(rateLimitedBroker.getProviderLimit('octezArchive'), 3);
    assert.equal(rateLimitCalls, 2);

    const [portfolio, myTezos, tabs, scope, adapter, wallet, savedEntries, index, styles, smoke, db, broker, memory, balanceHistory, balanceHistoryModel, config, collection, tezosx, bakerReportCard, rewards, sw] = await Promise.all([
      readText('js/features/my-tezos-portfolio.js'),
      readText('js/features/my-tezos.js'),
      readText('js/features/my-tezos-tabs.mjs'),
      readText('js/features/my-tezos-scope.mjs'),
      readText('js/features/my-tezos-tzkt-adapter.mjs'),
      readText('js/core/wallet.js'),
      readText('js/core/my-tezos-entries.mjs'),
      readText('index.html'),
      readText('css/styles.css'),
      readText('tests/smoke.mjs'),
      readText('js/core/my-tezos-db.mjs'),
      readText('js/core/my-tezos-request-broker.mjs'),
      readText('js/features/my-tezos-memory.mjs'),
      readText('js/features/my-tezos-balance-history.mjs'),
      readText('js/features/my-tezos-balance-history-model.mjs'),
      readText('js/core/config.js'),
      readText('js/features/my-tezos-collection.mjs'),
      readText('js/features/my-tezos-tezosx.mjs'),
      readText('js/features/baker-report-card.js'),
      readText('js/features/rewards-tracker.js'),
      readText('sw.js')
    ]);
    for (const snippet of [
      'saveCompleteSnapshot(composition, totals, model.timestamp)',
      "document.visibilityState === 'visible'",
      'portfolioChart.update(\'none\')',
      "label: 'Total XTZ'",
      "portfolioRange = '1y'",
      'readMyTezosScope()',
      'readScopedMyTezosEntries(entries)',
      'schedulePortfolioCompositionRefresh',
      'setPortfolioRefreshState',
      'Updating ${count} wallet',
      "refresh.dataset.portfolioRefreshWired = 'true'",
      'wirePortfolioControls();',
      'quietlySyncHtml(container, header + body)',
      'showing last complete read'
    ]) {
      if (!portfolio.includes(snippet)) fail(`My Tezos Portfolio data/quiet contract missing: ${snippet}`);
    }
    for (const snippet of ["'address.in': addresses.join(',')", 'firstActivity', 'stakingOpsCount', '/accounts/activity?', 'lastId', 'Portfolio coverage incomplete']) {
      if (!adapter.includes(snippet)) fail(`My Tezos TzKT adapter contract missing: ${snippet}`);
    }
    for (const snippet of ['setMyTezosView', 'sessionStorage.setItem(VIEW_SESSION_KEY', "event.key === 'ArrowRight'", "event.key === 'Home'", "routeMode: 'push'", "window.addEventListener('popstate'"]) {
      if (!tabs.includes(snippet)) fail(`My Tezos tab contract missing: ${snippet}`);
    }
    for (const snippet of [
      "MY_TEZOS_SCOPE_ALL = 'all'",
      'readScopedMyTezosEntries',
      "window.dispatchEvent(new CustomEvent('my-tezos-scope-changed'",
      "window.addEventListener('my-tezos-portfolio-ready'",
      "window.addEventListener('my-tezos-portfolio-status'",
      'quietlyMutate(freshness',
      'Last complete read',
      'update unavailable',
      "rememberMyTezosAddress(entry.address"
    ]) {
      if (!scope.includes(snippet)) fail(`My Tezos shared wallet scope contract missing: ${snippet}`);
    }
    for (const snippet of ['activateMyTezosPortfolio', "registerMyTezosView('transactions'", "import('./my-tezos-collection.mjs')", "import('./my-tezos-tezosx.mjs')"]) {
      if (!myTezos.includes(snippet)) fail(`My Tezos lazy feature registration missing: ${snippet}`);
    }
    for (const snippet of [
      'const ACTIVE_VIEW_REFRESH_MS = 30000',
      'window.__MY_TEZOS_VIEW_REFRESH_MS__',
      'refreshActiveMyTezosView',
      "case 'collection':",
      "case 'tezos-x':",
      'refreshMyTezosMemory()',
      'refreshMyTezosPortfolio()',
      'document.visibilityState !== \'visible\''
    ]) {
      if (!myTezos.includes(snippet)) fail(`My Tezos all-view live refresh contract missing: ${snippet}`);
    }
    if (!/case 'overview':\s*return Promise\.allSettled\(\[\s*refreshMyTezosPortfolio\(\{ allowHidden: true \}\),\s*refreshMyTezosMemory\(\)/.test(myTezos)) {
      fail('My Tezos Overview must quietly refresh both visible balances and recent receipts through the visibility-gated view timer');
    }
    for (const [source, snippet] of [
      [memory, 'export function refreshMyTezosMemory'],
      [collection, 'export async function refreshMyTezosCollection'],
      [collection, 'if (!background) renderedAssetLimit = MY_TEZOS_COLLECTION_PAGE_SIZE'],
      [collection, 'backgroundHoldings'],
      [collection, "collectionReadState === 'error'"],
      [collection, 'Collection unavailable.'],
      [tezosx, 'export async function refreshMyTezosTezosX'],
      [tezosx, 'preserveLoadedActivity'],
      [tezosx, 'if (!background) renderLinkedAccounts()']
    ]) {
      if (!source.includes(snippet)) fail(`My Tezos background view-model preservation contract missing: ${snippet}`);
    }
    for (const snippet of ["if (data.bakerAddr)", "classList.toggle('is-without-baker', withoutBaker)"]) {
      if (!myTezos.includes(snippet)) fail(`My Tezos idle-account rendering contract missing: ${snippet}`);
    }
    for (const snippet of ['normalizeSavedMyTezosEntries', 'MAX_SAVED_MY_TEZOS_ADDRESSES = 10', "included: item?.included !== false"]) {
      if (!savedEntries.includes(snippet)) fail(`My Tezos saved-entry schema contract missing: ${snippet}`);
    }
    if (!wallet.includes('my-tezos-portfolio-changed')) fail('My Tezos shared wallet mutation event is missing');
    for (const snippet of ['role="tablist"', 'my-tezos-panel-portfolio', 'my-tezos-panel-transactions', 'my-tezos-panel-collection', 'my-tezos-panel-tezos-x', 'id="my-tezos-wallet-scope"', 'data-my-tezos-scope-total="total"', 'data-transactions-total="receipts"', 'data-activity-filter="transfers"', 'data-activity-filter="nft"', 'data-portfolio-total="unstaking"', 'portfolio-history-chart', 'data-portfolio-range="1y"', 'Calculated on this device', 'can take a few seconds', 'portfolio-wallet-count', 'Exact total XTZ:', 'Linked on this device', 'not an ownership proof']) {
      if (!index.includes(snippet)) fail(`My Tezos Portfolio markup missing: ${snippet}`);
    }
    if ((index.match(/my-tezos-scope-select/g) || []).length !== 2) {
      fail('The shared L1 wallet scope and separate Etherlink account selector must share the styled control contract');
    }
    for (const snippet of [
      'Connect Temple, Kukai, or another Tezos wallet',
      'Octez.Connect opens the compatible-wallet chooser',
      'Track a public address or .tez name',
      'No wallet extension, pairing, or signature is needed',
      'Seven views, one saved L1 identity',
      'Follow the same account into Ledger Flow and Maxi Passport'
    ]) {
      if (!index.includes(snippet)) fail(`My Tezos empty-state onboarding contract missing: ${snippet}`);
    }
    if (!index.includes('id="tezosx-add-form" class="portfolio-add-form" aria-busy="true"')
        || !index.includes('class="glass-button my-baker-btn" type="submit" disabled')) {
      fail('My Tezos Tezos X form must remain disabled until its lazy validation module is ready');
    }
    for (const snippet of ['width: clamp(880px, 68vw, 960px)', 'grid-template-columns: repeat(4, minmax(0, 1fr))', '.my-tezos-wallet-scope-bar', '.my-tezos-scope-totals', '.portfolio-summary-grid', '.portfolio-wallet-row', '.portfolio-history-controls', '.portfolio-history-panel .portfolio-section-heading', '.portfolio-history-status', '.portfolio-local-notice', '.portfolio-refresh-icon', 'max-height: min(52vh, 510px)', 'position: sticky', '.collection-grid', '.tezosx-account-row', '.portfolio-activity-item', '--portfolio-history-height: clamp(300px, 38vh, 360px)', '.my-tezos-feature-shell .my-tezos-action[hidden]', '.my-tezos-drawer .my-tezos-scope-select']) {
      if (!styles.includes(snippet)) fail(`My Tezos adaptive Portfolio CSS missing: ${snippet}`);
    }
    for (const snippet of ['.my-tezos-start-grid', '.my-tezos-start-card', '.my-tezos-feature-map', '.my-tezos-onboarding-routes']) {
      if (!styles.includes(snippet)) fail(`My Tezos empty-state onboarding CSS missing: ${snippet}`);
    }
    for (const snippet of ['#drawer-brief.is-without-baker', '.drawer-connected.is-without-baker .drawer-live-columns', '.my-tezos-directory-action']) {
      if (!styles.includes(snippet)) fail(`My Tezos idle-account layout CSS missing: ${snippet}`);
    }
    if (!bakerReportCard.includes('let bakerAddr = null;')
        || bakerReportCard.includes('if (isBaker || bakerAddr)')) {
      fail('Baker Report Card must not treat every saved My Tezos address as a baker');
    }
    for (const snippet of ['tezos-systems-my-tezos', "'activityByAccount'", "'syncState'", 'commitMyTezosPage', 'pruneMyTezosActivityRecords']) {
      if (!db.includes(snippet)) fail(`My Tezos IndexedDB contract missing: ${snippet}`);
    }
    for (const snippet of ['this.inFlight', 'RETRYABLE', 'retry-after', 'this.paused', 'callerRace', 'octezArchive: 6', 'reduceProviderLimit', 'my-tezos-drawer-opened', 'my-tezos-drawer-closed']) {
      if (!broker.includes(snippet)) fail(`My Tezos request broker contract missing: ${snippet}`);
    }
    for (const snippet of ['syncExactBalanceHistory', 'seriesByAddress', 'aggregateCoverage', 'INITIAL_DAYS = 365', 'baselineCreated', 'my-tezos-drawer-closed', 'loadEarlierQueued', 'Finishing the current receipt sync, then loading earlier history', "button.setAttribute('aria-busy', String(busy))"]) {
      if (!memory.includes(snippet)) fail(`My Tezos Memory contract missing: ${snippet}`);
    }
    if (!index.includes('id="portfolio-load-earlier" class="glass-button my-tezos-pill" type="button" aria-busy="false"')) {
      fail('My Tezos Load earlier control must expose its idle busy state before the feature module loads');
    }
    if ((index.match(/id="my-tezos-story-transactions"/g) || []).length !== 1
        || memory.includes('data-memory-show-unseen')) {
      fail('My Tezos Story must expose one Show changes action without an injected duplicate');
    }
    for (const snippet of ['export function prepareMyTezosChangesView()', 'unseen.length > 0']) {
      if (!memory.includes(snippet)) fail(`My Tezos Story changes handoff missing: ${snippet}`);
    }
    if (!myTezos.includes('prepareMyTezosChangesView();')) {
      fail('My Tezos Story action no longer prepares the unseen Transactions view');
    }
    if (!styles.includes('.portfolio-history-empty[hidden]')) {
      fail('Completed exact-history charts must remove the hidden loading placeholder from layout');
    }
    for (const snippet of ['full_balance', 'config/history_mode', 'fetchArchiveFullBalance', 'fetchSteppedHistory', 'exactBalanceHistoryScopeId', 'dailyCoverage', 'lifetimeCoverage', 'sourceReceipt', "stage: 'daily'", "name: 'lifetime'"]) {
      if (!balanceHistory.includes(snippet)) fail(`My Tezos exact balance history source/cache contract missing: ${snippet}`);
    }
    for (const snippet of ['PARIS_ACTIVATION_LEVEL = 5_726_209', 'buildHistoricalBalanceSchedule', 'protocol-boundary', 'account-creation', 'one-year-boundary', 'latest-finalized', 'pre-creation-zero', 'mixed-exact-sources']) {
      if (!balanceHistoryModel.includes(snippet)) fail(`My Tezos exact balance history model contract missing: ${snippet}`);
    }
    for (const snippet of ["octezArchive: 'https://octez-mainnet-archive.octez.io'", "tzktArchive: 'https://rpc.tzkt.io/mainnet'"]) {
      if (!config.includes(snippet)) fail(`My Tezos archive endpoint config missing: ${snippet}`);
    }
    for (const retired of ['Reconstructed liquid*', 'buildReconstructedPortfolioSeries', 'Historical account balance can exclude staked tez']) {
      if (portfolio.includes(retired) || memory.includes(retired) || index.includes(retired)) {
        fail(`My Tezos retired liquid-history presentation remains: ${retired}`);
      }
    }
    for (const snippet of ['MY_TEZOS_COLLECTION_PAGE_SIZE', 'Syncing complete Objkt coverage', 'mediaCandidates', 'showing last saved holdings', 'not a portfolio value', 'sourceReceipt']) {
      if (!collection.includes(snippet) && !index.includes(snippet)) fail(`My Tezos Collection contract missing: ${snippet}`);
    }
    for (const snippet of ["activityFilter = 'transfers'", 'activity-item-${interactionType}', "my-tezos-panel-transactions", 'renderOverviewActivity', "slice(0, 3)"]) {
      if (!memory.includes(snippet)) fail(`My Tezos Transactions contract missing: ${snippet}`);
    }
    if (!myTezos.includes("registerMyTezosView('overview', () => activateMyTezosMemory({ activityOnly: true }))")) {
      fail('My Tezos Overview no longer activates the lightweight transaction preview');
    }
    for (const snippet of ['my-tezos-overview-transactions', 'my-tezos-overview-activity-list', 'View all transactions']) {
      if (!index.includes(snippet)) fail(`My Tezos Overview transaction preview markup missing: ${snippet}`);
    }
    const signalPanel = index.slice(index.indexOf('<section id="my-tezos-panel-baker-signal"'), index.indexOf('<section id="my-tezos-panel-portfolio"'));
    const overviewPanel = index.slice(index.indexOf('<section id="my-tezos-panel-overview"'), index.indexOf('<section id="my-tezos-panel-baker-signal"'));
    if (!signalPanel.includes('id="drawer-operator-status"') || overviewPanel.includes('id="drawer-operator-status"')
        || !tabs.includes("'overview', 'baker-signal', 'portfolio'")
        || !myTezos.includes("registerMyTezosView('baker-signal', () => refreshOperatorSignal())")
        || !signalPanel.includes('my-tezos-baker-signal-scope')
        || !myTezos.includes('quietlySyncHtml(container, html)')
        || !myTezos.includes("!isDrawerOpen() || document.visibilityState !== 'visible'")) {
      fail('Baker Signal must have its own accessible My Tezos tab with active-wallet scope and the existing quiet visible refresh');
    }
    const operatorSummary = vm.runInNewContext(`${myTezos.slice(
      myTezos.indexOf('function summarizeRecentAttestations('),
      myTezos.indexOf('async function fetchOperatorHead(')
    )}; ({ summarizeRecentAttestations, summarizeCycleAttestation, summarizeLiveOperatorStatus })`, {
      RECENT_OPERATOR_ATTESTATIONS: 10,
      formatLevel: String
    });
    const summarizeRights = (statuses) => operatorSummary.summarizeRecentAttestations(statuses.map((status, index) => ({ status, level: 100 - index })));
    for (const successful of [0, 1, 2, 4, 9, 10]) {
      const recent = summarizeRights([...Array(successful).fill('realized'), ...Array(10 - successful).fill('missed')]);
      const expectedState = successful === 0 ? 'issue' : successful === 10 ? 'ok' : 'watch';
      assert.equal(recent.state, expectedState, `Recent attestation recovery at ${successful}/10 successful rights`);
      assert.equal(operatorSummary.summarizeCycleAttestation({ expected_cycle_activity: 1000, missed_slots: 11 }, recent).state, expectedState);
      for (const blockState of ['ok', 'issue', 'unknown']) {
        const live = operatorSummary.summarizeLiveOperatorStatus({ state: blockState, text: blockState }, recent);
        assert.equal(live.state, expectedState);
        assert.equal(live.value, successful === 0 ? 'Check now' : successful === 10 ? (blockState === 'issue' ? 'Back online' : 'Working') : 'Recovering');
        if (successful > 0 && successful < 10) assert(live.detail.includes(`latest ${successful} OK`) && live.detail.includes(`${10 - successful}/10 recent attestation issue`));
      }
    }
    assert.equal(summarizeRights(['missed', ...Array(9).fill('realized')]).state, 'issue', 'A new miss must end recovery even when the issue count is low');
    assert.equal(summarizeRights(['future', 'realized', 'missed']).state, 'watch', 'Future rights must not interrupt confirmed recovery');
    assert.equal(summarizeRights(['future', 'missed', 'realized']).state, 'issue', 'A future right must not count as recovery');
    assert.equal(summarizeRights([]).state, 'unknown', 'Missing rights must not imply recovery');
    assert.equal(summarizeRights(['future']).state, 'unknown', 'Future-only rights must not imply recovery');
    for (const id of ['drawer-operator-status', 'drawer-baker', 'drawer-baker-history', 'drawer-baker-activity', 'drawer-baker-brief', 'my-tezos-delegation-guidance']) {
      if (!signalPanel.includes(`id="${id}"`) || overviewPanel.includes(`id="${id}"`)) {
        fail(`Baker Signal must own ${id} outside Overview`);
      }
    }
    if (!rewards.includes("document.getElementById('drawer-baker-history')")
        || !rewards.includes("quietlySyncHtml(historyTarget, bakerCalendar?.outerHTML || '')")) {
      fail('The 30-cycle baker calendar must quietly reconcile in Baker Signal');
    }
    if (!myTezos.includes("card.accent === 'baker' || card.accent === 'governance'")
        || myTezos.includes('secondary.appendChild(baker)')) {
      fail('Baker status, governance, and stats must not return to Overview during reconciliation');
    }
    if (!styles.includes('.my-tezos-start-wallet::after')) {
      fail('My Tezos empty-state action rows no longer reserve matching desktop feedback space');
    }
    for (const snippet of ['normalizeLinkedL2Accounts', 'linkedL1Addresses', 'data-tezosx-l1-link', 'nativeAvailable', 'Blockscout receipt', 'submitButton.disabled = false', "form?.setAttribute('aria-busy', 'false')"]) {
      if (!tezosx.includes(snippet)) fail(`My Tezos Tezos X contract missing: ${snippet}`);
    }
    if (rewards.includes('tezos-systems-rewards-v4-') || rewards.includes('localStorage.setItem(cacheKey')) {
      fail('My Tezos rewards still writes the retired raw localStorage payload');
    }
    for (const host of ['explorer.etherlink.com', 'node.mainnet.etherlink.com', 'octez-mainnet-archive.octez.io', 'rpc.tzkt.io']) {
      if (!sw.includes(`'${host}'`)) fail(`Service worker API no-cache host missing: ${host}`);
    }
    if (!smoke.includes("name: 'my-tezos-portfolio'")) fail('focused My Tezos Portfolio browser smoke is missing');
    if (!smoke.includes("name: 'my-tezos-cold-start'")) fail('focused My Tezos cold-start browser smoke is missing');
    if (!smoke.includes("name: 'my-tezos-empty-state'")) fail('focused My Tezos empty-state browser smoke is missing');
    if (!smoke.includes("name: 'my-tezos-idle-account'")) fail('focused My Tezos idle-account browser smoke is missing');
    for (const suite of ['my-tezos-storage', 'my-tezos-memory', 'my-tezos-collection', 'my-tezos-tezosx']) {
      if (!smoke.includes(`name: '${suite}'`)) fail(`focused ${suite} browser smoke is missing`);
    }
    if (!smoke.includes("name: 'my-tezos-view-live-refresh'")) {
      fail('focused My Tezos all-view live refresh browser smoke is missing');
    }
    if (!smoke.includes("name: 'my-tezos-balance-history'")) fail('focused My Tezos exact balance-history browser smoke is missing');
    pass('My Tezos storage, Portfolio Memory, Collection, Tezos X, routing, provenance, and quiet-refresh contracts checked');
  }

  return { checkMyTezosPortfolioContracts };
}
