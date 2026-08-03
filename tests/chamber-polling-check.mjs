import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);

async function loadBrowserModule(relativePath, exposure, globals = {}) {
  let source = await fs.readFile(new URL(relativePath, ROOT), 'utf8');
  source = source
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/^export\s+\{[^;]+\}\s+from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|(?:const|let|class)\b)/g, '');
  source += `\nglobalThis.__pollingCheck = { ${exposure} };\n`;
  const context = vm.createContext({
    console,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    API_URLS: { tzkt: 'https://example.test/v1' },
    loadDataAsset: async () => ({}),
    escapeHtml: (value) => String(value ?? ''),
    formatFreshnessStamp: () => 'fresh',
    formatMutez: (value) => String(value ?? 0),
    matchesTextQuery: () => true,
    setDataFreshnessState: () => {},
    wireChamberLauncher: () => {},
    quietlyMutate: (_node, mutate) => mutate(),
    quietlySyncElement: () => {},
    quietlySyncHtml: () => {},
    activateChamberDialog: () => {},
    deactivateChamberDialog: () => {},
    window: { CustomEvent: class CustomEvent {}, dispatchEvent() {} },
    document: {
      hidden: false,
      querySelector: () => null,
      getElementById: () => null,
      addEventListener() {},
      removeEventListener() {},
      documentElement: { style: {} },
      body: { style: {} }
    },
    localStorage: { getItem: () => null, setItem() {} },
    ...globals
  });
  new vm.Script(source, { filename: relativePath }).runInContext(context);
  return { api: context.__pollingCheck, context };
}

function block(level, hash = `B${level}`) {
  return {
    level,
    hash,
    timestamp: new Date(1_700_000_000_000 + level * 8000).toISOString(),
    producer: { address: `tz1${level}`, alias: `Baker ${level}` },
    lbToggle: level % 3 === 0 ? false : level % 3 === 1 ? true : null,
    lbToggleEma: 900_000_000 + level
  };
}

async function checkLiquidityBakingIncrementalRing() {
  const requests = [];
  let incrementalCalls = 0;
  let fullCalls = 0;
  const fetch = async (url) => {
    const parsed = new URL(String(url));
    const limit = Number(parsed.searchParams.get('limit'));
    requests.push(parsed);
    if (limit === 2500) {
      fullCalls += 1;
      const head = fullCalls === 1 ? 10_000 : 10_100;
      return { ok: true, json: async () => Array.from({ length: 2500 }, (_, index) => block(head - index)) };
    }
    assert.equal(limit, 32, 'modal refresh should request only the bounded overlap page');
    incrementalCalls += 1;
    if (incrementalCalls === 1) {
      return {
        ok: true,
        json: async () => [block(10_001), block(10_000, 'B10000-reorg'), block(9999), block(9998), block(9997)]
      };
    }
    return {
      ok: true,
      json: async () => Array.from({ length: 32 }, (_, index) => block(10_100 - index))
    };
  };

  const { api } = await loadBrowserModule(
    'js/features/liquidity-baking.js',
    'fetchLiquidityBakingData',
    { fetch }
  );
  const initial = await api.fetchLiquidityBakingData(2500, { force: true });
  assert.equal(initial.blocks.length, 2500);
  assert.equal(initial.latest.level, 10_000);

  const incremental = await api.fetchLiquidityBakingData(2500, { force: true });
  assert.equal(incremental.blocks.length, 2500);
  assert.equal(incremental.latest.level, 10_001);
  assert.equal(incremental.oldest.level, 7502);
  assert.equal(incremental.blocks.find((item) => item.level === 10_000)?.hash, 'B10000-reorg');
  assert.equal(new Set(incremental.blocks.map((item) => item.level)).size, 2500);
  assert.equal(requests[1].searchParams.get('level.ge'), '9997');

  const caughtUp = await api.fetchLiquidityBakingData(2500, { force: true });
  assert.equal(caughtUp.latest.level, 10_100);
  assert.equal(caughtUp.oldest.level, 7601);
  assert.equal(fullCalls, 2, 'a missed overlap should rebuild one contiguous full window');
  assert.equal(incrementalCalls, 2);
}

async function checkLiquidityBakingRejectsPartialCanonicalWindow() {
  let canonicalCalls = 0;
  const fetch = async (url) => {
    const parsed = new URL(String(url));
    const limit = Number(parsed.searchParams.get('limit'));
    if (limit === 2500) {
      canonicalCalls += 1;
      const length = canonicalCalls === 1 ? 2500 : 500;
      return {
        ok: true,
        json: async () => Array.from({ length }, (_, index) => block(20_000 - index))
      };
    }
    assert.equal(limit, 32);
    return {
      ok: true,
      json: async () => Array.from({ length: 32 }, (_, index) => block(20_500 - index))
    };
  };

  const { api } = await loadBrowserModule(
    'js/features/liquidity-baking.js',
    'fetchLiquidityBakingData',
    { fetch }
  );
  const initial = await api.fetchLiquidityBakingData(2500, { force: true });
  assert.equal(initial.blocks.length, 2500);
  await assert.rejects(
    () => api.fetchLiquidityBakingData(2500, { force: true }),
    /only 500 of 2500 required Liquidity Baking blocks/,
    'a throttled or partial rebuild must not become the canonical sample'
  );
  const retained = await api.fetchLiquidityBakingData(2500);
  assert.equal(retained, initial, 'a failed canonical rebuild must retain the last complete 2,500-block sample');
  assert.equal(retained.latest.level, 20_000);
}

async function checkLiquidityBakingRetriesExactCanonicalWindow() {
  const requestedLimits = [];
  const retryDelays = [];
  let calls = 0;
  const fetch = async (url) => {
    const parsed = new URL(String(url));
    requestedLimits.push(Number(parsed.searchParams.get('limit')));
    calls += 1;
    if (calls === 1) return { ok: false, status: 429, headers: { get: () => '1' } };
    return {
      ok: true,
      status: 200,
      json: async () => Array.from({ length: 2500 }, (_, index) => block(30_000 - index))
    };
  };

  const { api } = await loadBrowserModule(
    'js/features/liquidity-baking.js',
    'fetchLiquidityBakingData',
    { fetch, setTimeout: (callback, delay) => { retryDelays.push(delay); callback(); return 0; } }
  );
  const result = await api.fetchLiquidityBakingData(2500, { force: true });
  assert.equal(result.blocks.length, 2500);
  assert.deepEqual(requestedLimits, [2500, 2500], 'a throttled canonical request must retry the complete window');
  assert.deepEqual(retryDelays, [1000], 'a bounded retry should honor TzKT Retry-After');
}

async function checkLiquidityBakingRetriesExactIncrementalWindow() {
  const requests = [];
  const retryDelays = [];
  let incrementalCalls = 0;
  const fetch = async (url) => {
    const parsed = new URL(String(url));
    requests.push(parsed);
    const limit = Number(parsed.searchParams.get('limit'));
    if (limit === 2500) {
      return {
        ok: true,
        status: 200,
        json: async () => Array.from({ length: 2500 }, (_, index) => block(50_000 - index))
      };
    }
    incrementalCalls += 1;
    if (incrementalCalls === 1) {
      return { ok: false, status: 429, headers: { get: () => '0.25' } };
    }
    return {
      ok: true,
      status: 200,
      json: async () => [block(50_001), block(50_000), block(49_999), block(49_998), block(49_997)]
    };
  };

  const { api } = await loadBrowserModule(
    'js/features/liquidity-baking.js',
    'fetchLiquidityBakingData',
    { fetch, setTimeout: (callback, delay) => { retryDelays.push(delay); callback(); return 0; } }
  );
  await api.fetchLiquidityBakingData(2500, { force: true });
  const result = await api.fetchLiquidityBakingData(2500, { force: true });
  assert.equal(result.latest.level, 50_001);
  const incrementalRequests = requests.slice(1);
  assert.equal(incrementalRequests.length, 2);
  assert.deepEqual(
    incrementalRequests.map((request) => request.searchParams.get('limit')),
    ['32', '32'],
    'a throttled incremental request must preserve its bounded page size'
  );
  assert.deepEqual(
    incrementalRequests.map((request) => request.searchParams.get('level.ge')),
    ['49997', '49997'],
    'a throttled incremental request must preserve its overlap filter'
  );
  assert.deepEqual(retryDelays, [250], 'an incremental retry should honor a fractional Retry-After value');
}

async function checkLiquidityBakingRetainsLastGoodAfterRetryExhaustion() {
  const requests = [];
  const retryDelays = [];
  let calls = 0;
  const fetch = async (url) => {
    const parsed = new URL(String(url));
    requests.push(parsed);
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => Array.from({ length: 2500 }, (_, index) => block(40_000 - index))
      };
    }
    return { ok: false, status: 503, headers: { get: () => null } };
  };

  const { api } = await loadBrowserModule(
    'js/features/liquidity-baking.js',
    'fetchLiquidityBakingData',
    { fetch, setTimeout: (callback, delay) => { retryDelays.push(delay); callback(); return 0; } }
  );
  const initial = await api.fetchLiquidityBakingData(2500, { force: true });
  await assert.rejects(
    () => api.fetchLiquidityBakingData(2500, { force: true }),
    /TzKT blocks HTTP 503/,
    'a repeatedly throttled incremental refresh should fail after bounded retries'
  );
  const retained = await api.fetchLiquidityBakingData(2500);
  assert.equal(retained, initial, 'retry exhaustion must retain the complete last-good window');
  assert.equal(retained.blocks.length, 2500);
  const incrementalRequests = requests.slice(1);
  assert.equal(incrementalRequests.length, 3);
  assert.deepEqual(incrementalRequests.map((request) => request.searchParams.get('limit')), ['32', '32', '32']);
  assert.deepEqual(incrementalRequests.map((request) => request.searchParams.get('level.ge')), ['39997', '39997', '39997']);
  assert.deepEqual(retryDelays, [900, 1800], 'retryable failures should stop after two bounded backoff delays');
}

async function checkLiquidityBakingCoalescesWindowRequests() {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetch = async () => {
    calls += 1;
    await gate;
    return {
      ok: true,
      status: 200,
      json: async () => Array.from({ length: 2500 }, (_, index) => block(60_000 - index))
    };
  };

  const { api } = await loadBrowserModule(
    'js/features/liquidity-baking.js',
    'fetchLiquidityBakingData',
    { fetch }
  );
  const first = api.fetchLiquidityBakingData(2500, { force: true });
  const second = api.fetchLiquidityBakingData(2500, { force: true });
  await Promise.resolve();
  assert.equal(calls, 1, 'concurrent launcher/modal reads should share one canonical LB window request');
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult, secondResult, 'coalesced LB window readers should receive the same summary object');
  assert.equal(firstResult.blocks.length, 2500);
}

async function checkLiquidityBakingRecentSwitcherSummary() {
  const producer = (address, alias) => ({ address, alias });
  const sampleBlock = (level, address, alias, lbToggle) => ({
    level,
    hash: `B${level}`,
    timestamp: new Date(Date.now() - (100 - level) * 6000).toISOString(),
    producer: producer(address, alias),
    lbToggle,
    lbToggleEma: 1_030_000_000 - (100 - level) * 50_000
  });
  const changing = [
    sampleBlock(100, 'tz1SwitcherA', 'Switcher A', false),
    sampleBlock(99, 'tz1SwitcherB', 'Switcher B', true),
    sampleBlock(98, 'tz1SwitcherC', 'Switcher C', null),
    sampleBlock(97, 'tz1SwitcherA', 'Switcher A', true),
    sampleBlock(96, 'tz1SwitcherB', 'Switcher B', false),
    sampleBlock(95, 'tz1SwitcherC', 'Switcher C', true),
    sampleBlock(94, 'tz1SwitcherA', 'Switcher A', null),
    sampleBlock(93, 'tz1SwitcherC', 'Switcher C', false)
  ];
  const stable = [
    sampleBlock(100, 'tz1StableA', 'Stable A', false),
    sampleBlock(99, 'tz1StableB', 'Stable B', true),
    sampleBlock(98, 'tz1StableA', 'Stable A', false),
    sampleBlock(97, 'tz1StableB', 'Stable B', true)
  ];
  const { api } = await loadBrowserModule(
    'js/features/liquidity-baking.js',
    'recentUniqueVoteChanges, renderEntrySwitcherStrip, summarizeBlocks'
  );
  const switchers = api.recentUniqueVoteChanges(changing);
  assert.deepEqual(Array.from(switchers, (change) => change.address), ['tz1SwitcherA', 'tz1SwitcherB', 'tz1SwitcherC']);
  assert.equal(switchers[0].level, 100, 'a repeatedly switching baker should keep only its newest switch event');
  assert.equal(switchers[0].from.key, 'on');
  assert.equal(switchers[0].to.key, 'off');
  const changingMarkup = api.renderEntrySwitcherStrip(api.summarizeBlocks(changing));
  assert.match(changingMarkup, /data-lb-switcher-count="3"/);
  assert.match(changingMarkup, /data-quiet-key="lb-entry-switch:tz1SwitcherA"/);
  assert.match(changingMarkup, /Switcher A[\s\S]*ON[\s\S]*OFF/);
  const stableMarkup = api.renderEntrySwitcherStrip(api.summarizeBlocks(stable));
  assert.match(stableMarkup, /data-lb-switcher-count="0"/);
  assert.match(stableMarkup, /No vote changes in this 4-block/);
}

function consensusOperation(id, level, { bls = true } = {}) {
  return {
    id,
    level,
    hash: `op${id}`,
    counter: id,
    timestamp: new Date(1_700_000_000_000 + level * 1000).toISOString(),
    sender: { address: `tz1sender${id}` },
    publicKey: bls ? `BLpk${id}` : `edpk${id}`,
    publicKeyHash: bls ? `tz4${id}` : `tz1${id}`,
    activationCycle: 100 + id,
    status: 'applied'
  };
}

async function checkTz4PagedAndIncrementalHistory() {
  const operationRequests = [];
  let delegateRequests = 0;
  let headRequests = 0;
  let headFails = false;
  const fetchWithRetry = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith('/head')) {
      headRequests += 1;
      if (headFails) throw new Error('head unavailable');
      return { cycle: 11, timestamp: '2026-08-01T12:00:00Z' };
    }
    if (parsed.pathname.endsWith('/delegates')) {
      delegateRequests += 1;
      return [{ address: `tz1baker${delegateRequests}`, bakingPower: 1, consensusAddress: 'tz4baker' }];
    }
    assert(parsed.pathname.endsWith('/operations/update_consensus_key'));
    operationRequests.push(parsed);
    const minLevel = parsed.searchParams.get('level.ge');
    if (minLevel !== null) {
      return [consensusOperation(1002, 1002), consensusOperation(1003, 1003)];
    }
    const offset = Number(parsed.searchParams.get('offset'));
    if (offset === 0) {
      return Array.from({ length: 1000 }, (_, index) => consensusOperation(index + 1, index + 1, { bls: index % 500 === 0 }));
    }
    if (offset === 1000) return [consensusOperation(1001, 1001, { bls: false }), consensusOperation(1002, 1002)];
    throw new Error(`unexpected operation offset ${offset}`);
  };

  const { api } = await loadBrowserModule(
    'js/features/tz4-adoption.js',
    'fetchConsensusKeyUpdates, fetchActiveBakers, fetchTz4AdoptionData, getCoverage: () => _tz4OperationCoverage',
    { fetchWithRetry }
  );
  const initial = await api.fetchConsensusKeyUpdates();
  assert.deepEqual(Array.from(initial, (operation) => operation.id), [1, 501, 1002], 'all BLS operations across both initial pages should be retained');
  assert.deepEqual(operationRequests.slice(0, 2).map((url) => url.searchParams.get('offset')), ['0', '1000']);
  assert.equal(api.getCoverage().mode, 'complete-paged');
  assert.equal(api.getCoverage().initialPages, 2);

  const refreshed = await api.fetchConsensusKeyUpdates({ incremental: true });
  assert.equal(refreshed.length, 4);
  assert.equal(new Set(refreshed.map((item) => item.id)).size, refreshed.length);
  assert.equal(operationRequests[2].searchParams.get('level.ge'), '938');
  assert.equal(api.getCoverage().mode, 'complete-paged-plus-overlap');

  await api.fetchActiveBakers({ cycle: 10 });
  await api.fetchActiveBakers({ cycle: 10 });
  await api.fetchActiveBakers({ cycle: 11 });
  assert.equal(delegateRequests, 2, 'active delegate snapshots should be reused inside a cycle and refreshed on rollover');

  const operationRequestCount = operationRequests.length;
  const [firstData, secondData] = await Promise.all([
    api.fetchTz4AdoptionData({ force: true }),
    api.fetchTz4AdoptionData({ force: true })
  ]);
  assert.equal(firstData, secondData, 'simultaneous launcher and room hydration should share one data result');
  assert.equal(headRequests, 1);
  assert.equal(operationRequests.length, operationRequestCount + 1, 'simultaneous hydration should share one incremental operation request');
  assert.equal(firstData.updatedAt, '2026-08-01T12:00:00.000Z', 'freshness must use the oldest complete source receipt, not wall-clock now');
  assert.equal(firstData.freshnessStatus, 'ok');

  headFails = true;
  const lastGood = await api.fetchTz4AdoptionData({ force: true });
  assert.equal(headRequests, 2);
  assert.equal(lastGood.clocks.head.observedAt, '2026-08-01T12:00:00Z');
  assert.equal(lastGood.clocks.head.status, 'last-good');
  assert.equal(lastGood.updatedAt, firstData.updatedAt, 'a head failure must not fabricate a fresh observation timestamp');
  assert.equal(lastGood.freshnessStatus, 'last-good');
}

async function checkSnapshotProjectionReceiptBinding() {
  const { api: receiptApi } = await loadBrowserModule(
    'js/core/snapshot-receipt.js',
    'assertSnapshotMatchesProjection',
    {
      sha256Text: async (value) => createHash('sha256').update(String(value)).digest('hex')
    }
  );
  const { assertSnapshotMatchesProjection } = receiptApi;
  const sourceText = '{"schemaVersion":1,"contentHash":"semantic"}\n';
  const fileSha256 = createHash('sha256').update(sourceText).digest('hex');
  const contentHash = 'a'.repeat(64);
  const snapshot = { contentHash };
  const receipt = { contentHash, fileSha256 };

  assert.equal(
    await assertSnapshotMatchesProjection(snapshot, sourceText, receipt, { label: 'Test snapshot' }),
    snapshot,
    'an exact semantic and byte receipt match should retain the parsed snapshot'
  );
  await assert.rejects(
    () => assertSnapshotMatchesProjection(
      { contentHash: 'b'.repeat(64) },
      sourceText,
      receipt,
      { label: 'Test snapshot' }
    ),
    /does not match the launcher projection content receipt/,
    'a semantically different snapshot must be rejected even when its own receipt could be valid'
  );
  await assert.rejects(
    () => assertSnapshotMatchesProjection(
      snapshot,
      `${sourceText} `,
      receipt,
      { label: 'Test snapshot' }
    ),
    /does not match the launcher projection exact-file receipt/,
    'a byte-different snapshot must be rejected even when its semantic content hash matches'
  );
  await assert.rejects(
    () => assertSnapshotMatchesProjection(snapshot, sourceText, { contentHash }, { label: 'Test snapshot' }),
    /launcher projection source receipt is incomplete/,
    'a present but incomplete projection receipt must fail closed'
  );
  assert.equal(
    await assertSnapshotMatchesProjection(snapshot, sourceText, null, { label: 'Test snapshot' }),
    snapshot,
    'an explicit Chamber open may still validate a self-receipted full snapshot when the compact projection is unavailable'
  );

  const chambers = [
    {
      path: 'js/features/capital-chamber.js',
      receipt: 'const sourceReceipt = summary?.source || null;',
      binding: "assertSnapshotMatchesProjection(snapshot, sourceText, sourceReceipt, { label: 'Capital snapshot' })",
      fetch: 'fetchCapitalSnapshot(summary)'
    },
    {
      path: 'js/features/ecosystem-chamber.js',
      receipt: 'const sourceReceipt = summary?.source || null;',
      binding: "assertSnapshotMatchesProjection(value, text, sourceReceipt, { label: 'Ecosystem snapshot' })",
      fetch: 'fetchSnapshot(summary)'
    },
    {
      path: 'js/features/minerals-chamber.js',
      receipt: 'const sourceReceipt = summary?.fullSnapshot || null;',
      binding: "assertSnapshotMatchesProjection(snapshot, text, sourceReceipt, { label: 'Minerals snapshot' })",
      fetch: 'fetchMineralsSnapshot(summary)'
    },
    {
      path: 'js/features/metals-chamber.js',
      receipt: 'const sourceReceipt = summary?.source || null;',
      binding: "assertSnapshotMatchesProjection(snapshot, sourceText, sourceReceipt, { label: 'Metals snapshot' })",
      fetch: 'fetchMetalsSnapshot(summary)'
    },
    {
      path: 'js/features/uranium-chamber.js',
      receipt: 'const sourceReceipt = summary?.source || null;',
      binding: "assertSnapshotMatchesProjection(snapshot, sourceText, sourceReceipt, { label: 'Uranium snapshot' })",
      fetch: 'fetchUraniumSnapshot(summary)'
    }
  ];
  for (const chamber of chambers) {
    const source = await fs.readFile(new URL(chamber.path, ROOT), 'utf8');
    assert(source.includes(chamber.receipt), `${chamber.path} must capture the validated launcher source receipt`);
    assert(source.includes(chamber.binding), `${chamber.path} must bind the fetched full artifact to that exact receipt`);
    assert(source.includes(chamber.fetch), `${chamber.path} must pass the locally validated summary into the full fetch`);
    assert.match(
      source,
      /catch \(error\) \{[\s\S]{0,500}return lastSnapshot;/,
      `${chamber.path} must retain the last-good full snapshot when receipt binding rejects a refresh`
    );
  }
}

await checkLiquidityBakingIncrementalRing();
await checkLiquidityBakingRejectsPartialCanonicalWindow();
await checkLiquidityBakingRetriesExactCanonicalWindow();
await checkLiquidityBakingRetriesExactIncrementalWindow();
await checkLiquidityBakingRetainsLastGoodAfterRetryExhaustion();
await checkLiquidityBakingCoalescesWindowRequests();
await checkLiquidityBakingRecentSwitcherSummary();
await checkTz4PagedAndIncrementalHistory();
await checkSnapshotProjectionReceiptBinding();
console.log('chamber polling checks passed');
