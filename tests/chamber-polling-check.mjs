import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);

async function loadBrowserModule(relativePath, exposure, globals = {}) {
  let source = await fs.readFile(new URL(relativePath, ROOT), 'utf8');
  source = source
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/^export\s+\{[^;]+\}(?:\s+from\s+['"][^'"]+['"])?;\s*$/gm, '')
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

async function checkConcurrentHistoryReceipts() {
  let now = Date.parse('2026-09-02T12:34:56.789Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const { api, context } = await loadBrowserModule(
    'js/core/api.js',
    'fetchHistoricalDataReceipt, fetchSupabaseHistoryRowsReceipt, fetchSupabaseHistoryFreshness',
    {
      Date: Clock,
      console: { error() {}, warn() {}, log() {} },
      API_URLS: { tzkt: 'https://example.test/v1', octez: 'https://rpc.example.test' },
      CACHE_TTLS: { memory: 60000 }, FETCH_LIMITS: {},
      HISTORY_START: '2018-06-30T17:39:57Z',
      HISTORY_FRESHNESS_LIMITS: {},
      SUPABASE_CONFIG: { url: 'https://history.example.test', key: 'public-test-key' }
    }
  );
  const requests = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let failPage = false;
  context.fetchWithRetry = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed);
    await pending;
    if (parsed.searchParams.get('limit') === '1') return [{ timestamp: new Clock().toISOString() }];
    if (parsed.searchParams.get('offset') === '0') return Array.from({ length: 1000 }, (_, id) => ({ id }));
    if (failPage) throw new Error('injected second-page failure');
    return [{ id: 1000 }];
  };

  const first = api.fetchHistoricalDataReceipt('30d');
  const second = api.fetchHistoricalDataReceipt('30d');
  assert.equal(requests.length, 1, 'concurrent callers must synchronously reserve one history request');
  assert.equal(requests[0].searchParams.get('timestamp'), 'gte.2026-08-03T12:34:56.789Z', 'dedupe must not round or shorten the requested range');
  now += 90000;
  const slowJoiner = api.fetchHistoricalDataReceipt('30d');
  assert.equal(requests.length, 1, 'an in-flight request must not expire with the settled-data TTL');
  release();
  const receipts = await Promise.all([first, second, slowJoiner]);
  assert.equal(requests.length, 2, 'each history page is fetched once, not once per caller');
  assert.equal(receipts[0].rows.length, 1001, 'all callers receive the complete paginated window');
  assert.equal(receipts[0], receipts[1]);
  assert.equal(receipts[0], receipts[2]);
  assert.equal(await api.fetchHistoricalDataReceipt('30d'), receipts[0]);
  assert.equal(requests.length, 2, 'settled receipts retain their existing cache TTL');

  now += 60001;
  failPage = true;
  const failed = await Promise.all([api.fetchHistoricalDataReceipt('30d'), api.fetchHistoricalDataReceipt('30d')]);
  assert.equal(requests.length, 4, 'failure still shares a single paginated attempt');
  assert(failed.every(receipt => receipt.status === 'unavailable' && receipt.rows.length === 0), 'partial pages must never become a successful receipt');
  failPage = false;
  assert.equal((await api.fetchHistoricalDataReceipt('30d')).rows.length, 1001, 'failed history attempts must be evicted so a new call can recover');

  requests.length = 0;
  const table = await Promise.all([
    api.fetchSupabaseHistoryRowsReceipt('market_history', '7d', 'timestamp,price'),
    api.fetchSupabaseHistoryRowsReceipt('market_history', '7d', 'timestamp,price'),
    api.fetchSupabaseHistoryRowsReceipt('market_history', '24h', 'timestamp,price'),
    api.fetchSupabaseHistoryRowsReceipt('market_history', '7d', 'timestamp'),
    api.fetchSupabaseHistoryRowsReceipt('network_health_history', '7d', 'timestamp')
  ]);
  assert.equal(requests.length, 8, 'table, range, and selection stay independent while identical requests coalesce');
  assert.equal(table[0], table[1]);
  assert(table.every(receipt => receipt.rows.length === 1001));

  requests.length = 0;
  const freshness = await Promise.all([api.fetchSupabaseHistoryFreshness(), api.fetchSupabaseHistoryFreshness()]);
  assert.equal(requests.length, 5, 'concurrent freshness audits share one read per history ledger');
  assert.equal(new Set(requests.map(url => url.pathname)).size, 5);
  assert.equal(freshness[0], freshness[1]);
}

async function checkWhaleForcedRefreshCoalescing() {
  const sourceText = await fs.readFile(new URL('data/whale-watch.json', ROOT), 'utf8');
  const artifact = JSON.parse(sourceText);
  let requests = 0;
  let liveRequests = 0;
  let release;
  const liveGate = new Promise(resolve => { release = resolve; });
  const { api } = await loadBrowserModule('js/features/whale-chamber.js',
    'refreshWhaleChamber, seed: (artifact) => { lastArtifact = artifact; lastArtifactRead = Date.now(); }', {
      versionedAsset: value => value,
      createChamberSnapshotCache: () => ({ save: async () => {} }),
      GENERATED_PROOFBOOK_SCHEDULE_LABEL: '6h schedule',
      document: { visibilityState: 'visible', getElementById: () => null },
      getWhaleSnapshot: () => ({ transactions: [], delegations: [], stake: [], unstake: [] }),
      getAwakeningNotificationState: () => ({ enabled: false }),
      refreshWhaleData: async () => { liveRequests += 1; await liveGate; return {}; },
      fetch: async () => { requests += 1; return { ok: true, text: async () => sourceText }; }
    });
  api.seed(artifact);
  const ordinary = api.refreshWhaleChamber();
  const forced = api.refreshWhaleChamber({ forceArtifact: true });
  const joined = api.refreshWhaleChamber({ forceArtifact: true });
  assert.equal(requests, 0, 'forced archive reads must queue behind the active live tick');
  release();
  const results = await Promise.all([ordinary, forced, joined]);
  assert.equal(requests, 1, 'simultaneous explicit retries must share one queued archive request');
  assert.equal(liveRequests, 2, 'one normal refresh plus one forced follow-up');
  assert.equal(results[1], results[2], 'queued callers receive the same settled refresh');
  await Promise.all([api.refreshWhaleChamber({ forceArtifact: true }), api.refreshWhaleChamber({ forceArtifact: true })]);
  assert.equal(requests, 2, 'callers also coalesce when the active request is already forced');
}

async function checkSharedOctezReceipts() {
  let now = 1000000, calls = 0, hold = false;
  const waiting = [];
  class Clock extends Date { static now() { return now; } }
  const row = (version, power) => ({ address: `tz1-fixture-${version}`, bakingPower: power, software: { version } });
  const { api } = await loadBrowserModule('js/core/octez-versions.js', 'fetchOctezVersions, classifyOctezVersion', {
    Date: Clock,
    fetchWithRetry: async (url, options) => {
      calls++;
      assert(url.includes('select=address,alias,bakingPower,software'));
      if (hold) return new Promise(resolve => waiting.push({ resolve, options }));
      return [row('25.1', 90), row('24.3', 10), row('', 0)];
    }
  });
  const [first, concurrent] = await Promise.all([api.fetchOctezVersions(), api.fetchOctezVersions()]);
  assert.equal(calls, 1);
  assert.equal(first, concurrent);
  assert.equal(first.latestVersion, '25.1');
  assert.equal(first.latestPowerShare, 90);
  assert.equal(first.knownBakers, 2);
  assert.equal(api.classifyOctezVersion('24.3', '25.1').state, 'issue');
  assert.equal(api.classifyOctezVersion('Unknown', '25.1').state, 'unknown');
  now += 29 * 60000;
  assert.equal(await api.fetchOctezVersions(), first);
  assert.equal(calls, 1, 'Shared software receipts preserve the 30-minute TTL');
  now += 2 * 60000;
  hold = true;
  const background = api.fetchOctezVersions();
  const interactive = api.fetchOctezVersions({ priority: 'interactive' });
  const joined = api.fetchOctezVersions({ priority: 'interactive' });
  assert.equal(waiting.length, 2, 'Interactive read can overtake background but joins existing interactive work');
  assert.equal(waiting[1].options.__tezosSystemsPriority, 'interactive');
  waiting[1].resolve([row('26.0', 100)]);
  const newest = await interactive;
  assert.equal(await joined, newest);
  waiting[0].resolve([row('25.1', 100)]);
  assert.equal(await background, newest, 'Late background result cannot overwrite newer interactive receipt');
  assert.equal((await api.fetchOctezVersions()).latestVersion, '26.0');
}

await checkSharedOctezReceipts();
await checkWhaleForcedRefreshCoalescing();
await checkConcurrentHistoryReceipts();
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
