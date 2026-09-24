// Static contracts owned by data. Shared dependencies remain explicit.
export function createDataStaticChecks({
  STATIC_CHECKS,
  countProtocolUpgrades,
  fail,
  hoursSince,
  pass,
  protocolHashMatches,
  readText
}) {
  async function checkGovernanceVotes() {
    const data = JSON.parse(await readText('data/governance-votes.json'));
    const report = JSON.parse(await readText('data/governance-refresh-report.json'));
    const protocolData = JSON.parse(await readText('data/protocol-data.json'));
    const protocols = Array.isArray(protocolData.protocols) ? protocolData.protocols : [];
    const votes = Array.isArray(data.periodVotes) ? data.periodVotes : [];
    const failed = votes.filter((vote) => ['no_quorum', 'no_supermajority'].includes(vote.status));
    const namedFailures = new Set(failed.map((vote) => vote.displayName));

    if (!Array.isArray(data.epochs) || data.epochs.length !== data.epochCount) {
      fail('governance-votes epochCount must match epochs length');
    }
    const proposalRows = (data.epochs || []).flatMap((epoch) => epoch?.proposals || []);
    const acceptedProposals = proposalRows.filter((proposal) => proposal?.status === 'accepted');
    const acceptedHashes = new Set(acceptedProposals.map((proposal) => proposal?.hash));
    if (acceptedProposals.length < 20
      || acceptedHashes.size !== acceptedProposals.length
      || acceptedProposals.some((proposal) => !/^P[1-9A-HJ-NP-Za-km-z]+$/.test(proposal?.hash || '')
        || !/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(proposal?.initiator?.address || ''))) {
      fail('governance-votes accepted proposals must retain unique hashes and valid initiator attribution');
    }
    if (votes.length !== data.periodVoteCount) {
      fail('governance-votes periodVoteCount must match periodVotes length');
    }
    if (votes.length < 20) {
      fail('governance-votes must contain enough exploration/promotion votes for Chamber historical context');
    }
    if (failed.length !== data.failedVoteCount) {
      fail('governance-votes failedVoteCount must match failed period rows');
    }
    for (const expected of ['Brest A', 'Ithaca', 'Oxford', 'Qena', 'Qena42']) {
      if (!namedFailures.has(expected)) fail(`governance-votes missing failed proposal ${expected}`);
    }

    const parisC = protocols.find((protocol) => protocol.name === 'Paris C' || protocolHashMatches(protocol.hash, 'PsParisC'));
    const countedUpgradeTotal = countProtocolUpgrades(protocols);
    if (!parisC) {
      fail('protocol-data must keep the Paris C follow-up record');
    } else if (parisC.countsAsUpgrade !== false) {
      fail('Paris C must be marked countsAsUpgrade:false so totals do not double-count the Paris follow-up');
    }
    if (protocolData.meta?.totalUpgrades !== countedUpgradeTotal) {
      fail(`protocol-data meta.totalUpgrades (${protocolData.meta?.totalUpgrades}) must equal counted upgrade total (${countedUpgradeTotal})`);
    }
    if (countedUpgradeTotal !== 21) {
      fail(`protocol-data counted upgrade total should be 21 with Paris C excluded, got ${countedUpgradeTotal}`);
    }
    const jakarta = protocols.find((protocol) => protocol.name === 'Jakarta');
    const jakartaStory = JSON.stringify(jakarta?.history || {});
    if (!jakartaStory.includes('one-third') || !jakartaStory.includes('50%') || !jakartaStory.includes('Pass and reversibility')) {
      fail('Jakarta anthology story must explain the Ithaca one-third to Jakarta 50% reset and the counterargument');
    }
    const jakartaSources = new Set((jakarta?.history?.sources || []).map((source) => source.url));
    if (!jakartaSources.has('https://octez.tezos.com/docs/protocols/013_jakarta.html')
      || !jakartaSources.has('https://octez.tezos.com/docs/protocols/012_ithaca.html')) {
      fail('Jakarta anthology story must retain official Jakarta and Ithaca source receipts');
    }

    if (hoursSince(data.generatedAt) > 72) {
      fail('governance-votes is older than 72 hours; run npm run refresh:governance');
    }
    if (hoursSince(report.generatedAt) > 72) {
      fail('governance refresh report is older than 72 hours; run npm run refresh:governance');
    }
    if (report.status === 'blocked' || report.blockers?.length) {
      fail(`governance refresh report has blockers: ${(report.blockers || []).map((b) => b.code).join(', ')}`);
    }
    if (report.singleEntryPoint !== 'scripts/refresh-governance-data.mjs') {
      fail('governance refresh report must name scripts/refresh-governance-data.mjs as the single entry point');
    }
    if (!Array.isArray(report.generatedFiles) || !report.generatedFiles.includes('feed.xml')) {
      fail('governance refresh report generatedFiles must include feed.xml');
    }

    const feed = await readText('feed.xml');
    if (!feed.includes('<rss version="2.0"') || !feed.includes('https://tezos.systems/chamber/')) {
      fail('feed.xml must be an RSS feed linking governance items to /chamber/');
    }
    const activeName = report.currentGovernance?.proposalName;
    if (activeName && !feed.includes(activeName)) {
      fail(`feed.xml should include active proposal name ${activeName}`);
    }
    const activeHashPrefix = report.currentGovernance?.proposalHash?.slice(0, 8);
    if (activeName && activeHashPrefix && feed.includes(activeHashPrefix)) {
      fail(`feed.xml should use active proposal name ${activeName}, not raw hash prefix ${activeHashPrefix}`);
    }

    const currentProtocol = report.currentProtocol;
    const currentLore = currentProtocol
      ? protocols.find((p) => p.name === currentProtocol.name || protocolHashMatches(currentProtocol.hash, p.hash))
      : null;
    if (currentProtocol && !currentLore) {
      fail(`current protocol ${currentProtocol.name} is missing from data/protocol-data.json`);
    }

    const missingAccepted = report.coverage?.activatedProtocolLore?.missing || [];
    if (missingAccepted.length) {
      fail(`accepted protocol lore missing: ${missingAccepted.map((p) => p.name || p.hash).join(', ')}`);
    }

    pass(`governance vote history checked: ${votes.length} vote periods, ${failed.length} failures`);
  }

  async function checkHistoricalPagination() {
    const api = await readText('js/core/api.js');
    const freshnessContracts = await readText('js/core/freshness-contracts.mjs');
    const history = await readText('js/features/history.js');
    const index = await readText('index.html');
    const collector = await readText('.github/scripts/collect-data.js');
    const chamberCollector = await readText('.github/scripts/collect-chamber-history.js');
    const supabaseWrite = await readText('.github/scripts/supabase-write.js');
    const backfill = await readText('scripts/backfill-supabase-history.mjs');
    const freshness = await readText('scripts/check-supabase-history-freshness.mjs');
    const generatedWorkflow = await readText('.github/workflows/refresh-governance-surfaces.yml');
    const generatedFreshnessWorkflow = await readText('.github/workflows/audit-generated-freshness.yml');
    const comparisonWorkflow = await readText('.github/workflows/refresh-chain-comparison.yml');
    const tezoscrpWorkflow = await readText('.github/workflows/refresh-tezoscrp.yml');
    const globalCollectorWorkflow = await readText('.github/workflows/collect-data.yml');
    const chamberCollectorWorkflow = await readText('.github/workflows/collect-chamber-history.yml');
    const scheduledRefresh = await readText('scripts/refresh-scheduled-data.mjs');
    const scheduledLanes = await readText('scripts/lib/scheduled-refresh-lanes.mjs');
    const generatedFreshness = await readText('scripts/lib/generated-freshness.mjs');
    const backfillWorkflow = await readText('.github/workflows/backfill-supabase-history.yml');
    const packageJson = await readText('package.json');
    const smokeHarness = await readText('tests/lib/smoke-harness.mjs');
    const smokeRunner = await readText('tests/smoke.mjs');
    const migration = await readText('supabase/migrations/20260618190000_expand_historical_capture.sql');
    if (!api.includes('HISTORICAL_PAGE_SIZE')) {
      fail('fetchHistoricalData must page Supabase history results; default REST responses are capped at 1,000 rows');
    }
    if (!api.includes('&limit=${HISTORICAL_PAGE_SIZE}&offset=${offset}')) {
      fail('fetchHistoricalData must request paged Supabase results so all-time charts include recent rows');
    }
    if (!api.includes('historicalDataCache') || !api.includes('cached.promise')) {
      fail('fetchHistoricalData must cache in-flight and recent history requests so range switches do not refetch the same rows');
    }
    for (const table of [
      'tezos_history',
      'market_history',
      'network_health_history',
      'governance_period_history',
      'tezosx_history'
    ]) {
      if (!freshnessContracts.includes(`${table}: 5 * HOUR_MS`)) {
        fail(`shared historical freshness contract must give ${table} a five-hour delivery alarm`);
      }
    }
    if (!api.includes("from './freshness-contracts.mjs'")
      || !freshness.includes("from '../js/core/freshness-contracts.mjs'")) {
      fail('browser history reads and the operational freshness checker must share one freshness contract');
    }
    for (const snippet of ['Scheduled every 2h', 'Scheduled every 30m', 'observed median ~']) {
      if (!history.includes(snippet)) {
        fail(`Cycle History must distinguish configured and observed delivery cadence via ${snippet}`);
      }
    }
    if (!generatedWorkflow.includes("cron: '17 */6 * * *'")
      || !freshnessContracts.includes("GENERATED_PROOFBOOK_SCHEDULE_LABEL = '6h schedule'")) {
      fail('generated proofbook schedule disclosure must match the six-hour workflow cadence');
    }
    for (const snippet of ['--report "$RUNNER_TEMP/generated-refresh-report.json"', 'continue-on-error: true', '--check-report', 'refresh-scheduled-data.mjs --print-targets']) {
      if (!generatedWorkflow.includes(snippet)) fail(`scheduled generated-data workflow must preserve partial success through ${snippet}`);
    }
    for (const snippet of ['git', 'worktree', 'runRefreshLanes', 'requires a clean checkout']) {
      if (!scheduledRefresh.includes(snippet)) fail(`scheduled refresh runner must isolate last-good data through ${snippet}`);
    }
    for (const snippet of ['maxis-season', 'ecosystem', 'whales', 'launcher-projections', 'tests/uranium-check.mjs', 'tests/ecosystem-stats-check.mjs']) {
      if (!scheduledLanes.includes(snippet)) fail(`scheduled lane catalog must independently cover ${snippet}`);
    }
    for (const snippet of ['SCHEDULED_FRESHNESS_HOURS = 18', 'SCHEDULED_FRESHNESS_HOURS_BY_ARTIFACT', 'nakamoto: 30', 'ECOSYSTEM_MONDAY_GRACE_HOURS = 18', 'acceptableCompletedEcosystemWeeks', 'staleAfterHours', 'generatedAtCommitCount']) {
      if (!generatedFreshness.includes(snippet)) fail(`generated freshness contract must enforce ${snippet}`);
    }
    for (const snippet of ["cron: '47 3,9,15,21 * * *'", 'npm run check:generated:freshness', 'npm run check:supabase:freshness', 'contents: read', 'issues: write', 'actions/github-script@v8', 'tezos-systems-generated-freshness-incident', 'freshness-signature', "state: 'closed'", 'steps.generated.outcome', 'steps.history.outcome']) {
      if (!generatedFreshnessWorkflow.includes(snippet)) fail(`generated freshness audit workflow must include ${snippet}`);
    }
    if (generatedFreshnessWorkflow.includes('exit "$failed"')) {
      fail('generated freshness audit must reconcile one incident instead of failing every unchanged scheduled run');
    }
    for (const [label, workflow] of [
      ['generated surfaces', generatedWorkflow],
      ['chain comparison', comparisonWorkflow],
      ['TezosCRP', tezoscrpWorkflow]
    ]) {
      for (const snippet of ['actions: write', 'GH_TOKEN: ${{ github.token }}', 'gh workflow run ci.yml --ref main']) {
        if (!workflow.includes(snippet)) fail(`${label} repository writer must dispatch validated Pages delivery through ${snippet}`);
      }
    }

    if (/delay\s*:\s*\([^)]*\)\s*=>\s*[^,\n}]*dataIndex/.test(history)) {
      fail('history charts must not use per-point animation delays; long ranges should paint immediately');
    }
    if (!history.includes('FULL_CHART_POINT_LIMITS') || !history.includes('downsampleTimeSeries')) {
      fail('history charts must bound long-range render points before passing data to Chart.js');
    }
    if (!history.includes('getFullChartTimeScale') || !history.includes("case 'all':") || !history.includes("unit: 'month'")) {
      fail('history charts must use coarser time ticks for all-time ranges');
    }
    if (!history.includes('parsing: false') || !history.includes('animation: fastRender ? false')) {
      fail('history charts must use fast Chart.js options for 30d+ rendering');
    }

    const expandedColumns = [
      'new_accounts_24h',
      'active_contracts_24h',
      'total_staked',
      'total_delegated',
      'total_baking_power',
      'staking_apy_stake',
      'staking_apy_delegate',
      'protocol_issuance_rate',
      'lb_issuance_rate',
      'lb_ema',
      'lb_ema_pct',
      'lb_subsidy_disabled',
      'tz4_power_pct',
      'tz4_power_active',
      'tz4_power_total'
    ];

    for (const column of expandedColumns) {
      if (!collector.includes(column)) fail(`historical collector must write ${column}`);
      if (!migration.includes(column)) fail(`Supabase migration must add ${column}`);
    }
    if (/legacy payload|legacyDataPoint|retrying legacy/i.test(collector)) {
      fail('historical collector must fail on Supabase schema drift instead of silently retrying a legacy payload');
    }
    for (const snippet of ['postSupabaseJson', 'TEMPORARY_FAILURE_EXIT_CODE']) {
      if (!collector.includes(snippet) || !chamberCollector.includes(snippet)) {
        fail(`both historical collectors must share the Supabase delivery contract through ${snippet}`);
      }
    }
    for (const snippet of ['workflow_call:', 'group: tezos-systems-global-history', 'cancel-in-progress: false']) {
      if (!globalCollectorWorkflow.includes(snippet)) fail(`global history primary and catch-up collection must share ${snippet}`);
    }
    if (!chamberCollectorWorkflow.includes('uses: ./.github/workflows/collect-data.yml')
      || !chamberCollectorWorkflow.includes('SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}')
      || !collector.includes('await globalHistoryCollectionDue(')
      || !collector.includes('if (!cadence.due)')) {
      fail('chamber history must offer an independent, cadence-gated global catch-up opportunity');
    }
    for (const snippet of ['DEFAULT_ATTEMPTS = 5', 'isRetryableSupabaseStatus', 'confirmTimestampStored', 'retryAfterMilliseconds', 'alreadyStored']) {
      if (!supabaseWrite.includes(snippet)) fail(`Supabase write delivery must preserve ${snippet}`);
    }
    for (const snippet of ['status=$?', '"$status" -eq 75', 'GITHUB_STEP_SUMMARY', 'exit "$status"']) {
      if (!globalCollectorWorkflow.includes(snippet) || !chamberCollectorWorkflow.includes(snippet)) {
        fail(`both historical collector workflows must downgrade only exhausted temporary writes through ${snippet}`);
      }
    }
    for (const table of ['market_history', 'network_health_history', 'governance_period_history', 'tezosx_history']) {
      if (!migration.includes(`create table if not exists public.${table}`)) {
        fail(`Supabase migration must create ${table}`);
      }
      if (!api.includes(table)) {
        fail(`frontend API must fetch ${table}`);
      }
      if (!freshness.includes(table)) {
        fail(`freshness checker must inspect ${table}`);
      }
    }
    for (const snippet of [
      'fetchChamberHistoricalData',
      'fetchSupabaseHistoryFreshness',
      'DOMAIN_HISTORY_TABLES',
      'history-freshness-strip',
      'history-digest',
      'renderHistoryDigest',
      'DOMAIN_HISTORY_CHARTS',
      'CORE_HISTORY_CHARTS',
      'chart-total-staked',
      'chart-staking-apy',
      'chart-tz4-power',
      'chart-lb-ema',
      'chart-tezosx-tvl',
      'chart-governance-participation',
      'market_cap_usd',
      'missed_attestation_slots',
      'tvl_share_pct',
      'voting_power_voted',
      'staking-apy-sparkline',
      'delegated-sparkline',
      'total-burned-sparkline',
      'baking-power-sparkline'
    ]) {
      if (!api.includes(snippet) && !history.includes(snippet) && !index.includes(snippet)) {
        fail(`frontend historical surfaces must include ${snippet}`);
      }
    }
    for (const snippet of [
      "selector: '#lb-entry-card'",
      "selector: '#tezlink-entry-card'",
      "selector: '#chamber-entry-card'",
      "source: 'networkHealth'",
      "source: 'governance'",
      "source: 'tezosx'",
      "metric: 'lb_ema_pct'",
      "metric: 'tz4_power_pct'",
      "'staking-apy': { metric: 'staking_apy_stake'",
      "'delegated': { metric: 'delegated_ratio'",
      "'total-burned': { metric: 'total_burned'",
      "'baking-power': { metric: 'total_baking_power'"
    ]) {
      if (!history.includes(snippet)) {
        fail(`card history buttons must wire chamber stats via ${snippet}`);
      }
    }
    for (const snippet of [
      'statistics?timestamp.le=',
      'context/issuance/current_yearly_rate',
      'lbToggleEma',
      'totalOwnStaked',
      'BACKFILL_DRY_RUN',
      "method: 'PATCH'"
    ]) {
      if (!backfill.includes(snippet)) {
        fail(`Supabase backfill script must include ${snippet}`);
      }
    }
    if (!packageJson.includes('"backfill:supabase": "node scripts/backfill-supabase-history.mjs"')) {
      fail('package scripts must expose backfill:supabase');
    }
    if (!packageJson.includes('"check:supabase:freshness": "node scripts/check-supabase-history-freshness.mjs"')) {
      fail('package scripts must expose check:supabase:freshness');
    }
    if (!packageJson.includes('"check:generated:freshness": "node scripts/check-generated-freshness.mjs"')) {
      fail('package scripts must expose check:generated:freshness');
    }
    if (!packageJson.includes('"test:smoke:ci": "node tests/smoke.mjs --continue-on-failure --retry-failures 1 --retry-infrastructure 1 --isolate-suites --hermetic"')
      || !packageJson.includes('"test:affected": "npm run test:static && node tests/smoke.mjs --affected-since origin/main --affected-high-risk-repeat 3')
      || !packageJson.includes('"test:smoke:harness": "node tests/smoke-harness-check.mjs"')
      || !['tests/smoke-harness-check.mjs', 'tests/scheduled-refresh-check.mjs'].every(script => STATIC_CHECKS.some(entry => entry.script === script))) {
      fail('package scripts must keep CI smoke semantics and the smoke harness contract check in the standard static gate');
    }
    for (const snippet of ['parseShard', 'selectSuiteCatalog', 'executeSuiteCatalog', "suiteStatus = 'flaky'", 'continueOnFailure', 'SmokeInfrastructureError', 'infrastructure-retry']) {
      if (!smokeHarness.includes(snippet)) fail(`shared smoke harness must preserve ${snippet}`);
    }
    for (const snippet of ['instrumentBrowserForArtifacts', 'instrumentBrowserForHermeticNetwork', 'closeOpenBrowserContexts', 'writeSmokeResults', 'aggregateSmokeFailure', 'passed only after a fresh-browser retry; the harness will remain red']) {
      if (!smokeRunner.includes(snippet)) fail(`browser smoke runner must preserve ${snippet}`);
    }
    for (const snippet of ['workflow_dispatch:', 'SUPABASE_KEY', 'BACKFILL_DRY_RUN', "node-version: '24'", 'actions/checkout@v7', 'actions/setup-node@v6']) {
      if (!backfillWorkflow.includes(snippet)) {
        fail(`Supabase backfill workflow must include ${snippet}`);
      }
    }
    const workflowFiles = [
      '.github/workflows/backfill-supabase-history.yml',
      '.github/workflows/ci.yml',
      '.github/workflows/collect-chamber-history.yml',
      '.github/workflows/collect-data.yml',
      '.github/workflows/refresh-governance-surfaces.yml',
      '.github/workflows/audit-generated-freshness.yml'
    ];
    for (const file of workflowFiles) {
      const workflow = await readText(file);
      if (workflow.includes('actions/checkout@v4') || workflow.includes('actions/setup-node@v4') || workflow.includes("node-version: '20'")) {
        fail(`${file} must use Node 24-era action pins`);
      }
    }
    const ciWorkflow = await readText('.github/workflows/ci.yml');
    for (const snippet of ['pull_request:', 'branches: [main]', 'workflow_dispatch:', "github.event_name == 'workflow_dispatch'", 'npm run test:static', 'fail-fast: false', 'shard: [1, 2, 3, 4, 5, 6]', 'actions/cache@v5', 'playwright install-deps chromium', 'playwright install --only-shell chromium', 'npm run test:smoke:ci', '--suite-costs .cache/smoke-suite-costs.json', '--shard ${{ matrix.shard }}/6', 'if: always()', 'actions/upload-artifact@v5', 'Learn hosted smoke timings', 'scripts/update-smoke-costs.mjs', 'actions/cache/save@v5', 'needs: browser-smoke', 'pages: write', 'id-token: write', 'actions/configure-pages@v6', 'actions/upload-pages-artifact@v5', 'include-hidden-files: true', 'actions/deploy-pages@v5']) {
      if (!ciWorkflow.includes(snippet)) fail(`site validation workflow must include ${snippet}`);
    }

    pass('historical data fetch paginates and long-range charts use fast render settings');
  }

  async function checkLiquidityBakingIssuanceState() {
    const surfaces = [
      ['dashboard API', 'js/core/api.js'],
      ['landing live data', 'js/landing/live-data.js'],
      ['historical collector', '.github/scripts/collect-data.js'],
      ['compare page', 'js/features/compare-page.js']
    ];

    for (const [label, file] of surfaces) {
      const text = await readText(file);
      if (!text.includes('lbToggleEma') || !text.includes('LB_EMA_DISABLE_THRESHOLD')) {
        fail(`${label} must use live Liquidity Baking EMA state for issuance calculations`);
      }
    }

    const landing = await readText('staking/index.html');
    if (/data-live="issuance-rate">~\d/.test(landing)) {
      fail('staking page should not hardcode a numeric issuance fallback; live data must provide LB-aware issuance');
    }

    const tweets = JSON.parse(await readText('data/tweets.json'));
    const issuanceTemplates = (tweets.TWEET_OPTIONS?.['issuance-rate'] || []).map((item) => item.text).join('\n');
    if (/~3\.[56]/.test(issuanceTemplates) || /adaptive issuance at \{value\}/i.test(issuanceTemplates)) {
      fail('issuance share templates must not hardcode stale rates or describe total issuance as protocol-only adaptive issuance');
    }
    if (!/Liquidity Baking|LB/.test(issuanceTemplates)) {
      fail('issuance share templates should mention that the displayed rate reflects Liquidity Baking state');
    }

    pass('issuance surfaces account for Liquidity Baking active/disabled state');
  }

  async function checkTruthSurfaceContracts() {
    const rewardsTracker = await readText('js/features/rewards-tracker.js');
    const myTezos = await readText('js/features/my-tezos.js');
    const myBaker = await readText('js/features/my-baker.js');
    const leaderboard = await readText('js/features/leaderboard.js');
    const bakerReportCard = await readText('js/features/baker-report-card.js');
    const calculator = await readText('js/features/calculator.js');
    const api = await readText('js/core/api.js');
    const landingLive = await readText('js/landing/live-data.js');
    const comparison = await readText('js/features/comparison.js');
    const comparePage = await readText('js/features/compare-page.js');
    const comparisonConfig = await readText('js/core/config.js');
    const compareIndex = await readText('compare/index.html');
    const comparisonVerification = JSON.parse(await readText('data/chain-comparison-verification.json'));
    const comparisonRefresh = await readText('scripts/refresh-chain-comparison.mjs');
    const comparisonWorkflow = await readText('.github/workflows/refresh-chain-comparison.yml');
    const stakingGuide = await readText('js/core/staking-guide-content.mjs');
    const stakingChamber = await readText('js/features/staking-chamber.js');
    const bakersGuide = await readText('bakers/index.html');
    const tweetTemplates = await readText('data/tweets.json');
    const protocolData = await readText('data/protocol-data.json');
    const siteMapCopy = await readText('js/core/site-map.js');
    const dailyBriefingCopy = await readText('js/features/daily-briefing.js');
    const changelogCopy = await readText('js/features/changelog.js');

    for (const required of [
      'id="rt-countdown" data-magic="off"',
      "status: 'no-current-record'",
      'Latest historical record: cycle',
      'Not currently baking, staking, or delegating.',
      'No baker-efficiency score applies to a staker reward.',
      'Estimate from baker rewards; payout policies vary.'
    ]) {
      if (!rewardsTracker.includes(required)) fail(`rewards tracker truth state missing: ${required}`);
    }
    if (rewardsTracker.includes('baker efficiency') || rewardsTracker.includes('📈 This Cycle')) {
      fail('rewards tracker must not apply universal baker-efficiency or historical This Cycle copy');
    }
    if (/recent\s*=\s*rewards\.find[\s\S]*?\|\|\s*rewards\[0\]/.test(rewardsTracker)) {
      fail('rewards tracker must not fall back from the current cycle to a historical row');
    }
    const bakerEarnedBlock = rewardsTracker.match(/function sumBakerEarned\(row\) \{([\s\S]*?)\n\}/)?.[1] || '';
    if (/StakedShared/.test(bakerEarnedBlock)
        || !rewardsTracker.includes('Gross on-chain baker receipts before delegator payouts; external-staker shared rewards excluded')) {
      fail('rewards tracker baker-owned totals must exclude external-staker shared rewards and disclose gross pre-payout scope');
    }

    for (const [label, source] of [
      ['My Tezos', myTezos],
      ['My Baker', myBaker],
      ['calculator', calculator]
    ]) {
      if (/delegateAPY:\s*3\.1|stakeAPY:\s*9\.2/.test(source)) {
        fail(`${label} must not restore hard-coded APY fallbacks`);
      }
    }
    if (!myTezos.includes('No active reward estimate') || !calculator.includes('APY unavailable — retry shortly') || !myBaker.includes("'Reward Status'")) {
      fail('personal reward surfaces must render explicit inactive or unavailable states');
    }
    const missedRightsBlock = myBaker.match(/async function fetchMissedRights[\s\S]*?\n\}/)?.[0] || '';
    if (/return 0;/.test(missedRightsBlock)
        || !missedRightsBlock.includes('Number.isSafeInteger(count)')
        || !myBaker.includes("element.dataset.quality = blocksKnown && attestKnown ? 'live' : 'partial'")) {
      fail('My Baker missed-rights failures must render unavailable or partial coverage, never a fabricated zero');
    }
    if (!api.includes('gross * (1 - edge)')
        || !api.includes('edge_of_staking_over_delegation')
        || !myTezos.includes('activeRewardEstimate')
        || !myBaker.includes('Gross APY (Delegation)')) {
      fail('personal reward surfaces must use the live delegation divisor, apply the external-staker edge as gross times one minus edge, and withhold gross delegation projections');
    }
    if (!api.includes('parsedProtocolRate > 0')
        || !api.includes("rawLbEma !== null")
        || /Number\.isFinite\(Number\(lbState\?\.ema\)\)/.test(api)) {
      fail('issuance aggregation must reject zero protocol rates and must not coerce an unknown LB EMA to zero');
    }
    if (!api.includes("failedInputs.push('calculatedRate')")
        || !api.includes('const rawBurned = stats?.totalBurned')
        || !landingLive.includes("throw new Error('Live staking estimate values are invalid')")
        || !landingLive.includes('rawEma !== null')) {
      fail('APY, Liquidity Baking, and burned-supply surfaces must reject malformed or semantically empty 200 responses');
    }
    if (!calculator.includes('calc-delegate-payout-assumption')
        || !calculator.includes('calc-stake-edge-assumption')
        || /parseFloat\([^\n]*calc-staking-fee[^\n]*\)\s*\|\|\s*5/.test(calculator)) {
      fail('calculator must require explicit delegation/staking assumptions and preserve valid zero-percent endpoints');
    }
    if (!calculator.includes('const updateId = ++updateSequence')
        || !calculator.includes("if (updateId !== updateSequence || currentMode !== 'baker') return;")) {
      fail('calculator async renders must discard superseded assumption requests');
    }

    if (leaderboard.includes("value: 'edge'") || leaderboard.includes('bakerStakingEdgePercent')) {
      fail('delegator fit must not rank the direct-staking edge as if it were a delegation fee');
    }
    if (!leaderboard.includes('Delegation fees and payout policy are off-chain')
        || !leaderboard.includes('external-staker edge is not a delegation fee')) {
      fail('delegator fit must disclose that off-chain payout terms and the on-chain external-staker edge are different');
    }
    if (bakerReportCard.includes("buildScoreBar('Fee Score'")
        || bakerReportCard.includes("buildStatCell('Fee'")
        || !bakerReportCard.includes('External-staker edge')
        || !bakerReportCard.includes('Delegation payout policy is off-chain and is not scored here.')) {
      fail('Baker Report Card must show the external-staker edge separately from its operational grade and delegation terms');
    }
    if (!bakerReportCard.includes('Number(cycle?.cycle) < currentCycle')
        || !bakerReportCard.includes('Number(b.bakingPower || 0) - Number(a.bakingPower || 0)')
        || !bakerReportCard.includes('Current baking-power rank')) {
      fail('Baker Report Card must score a completed participation cycle and rank the field it labels as baking power');
    }

    if (comparison.includes("tezosLive: () => '4'") || comparePage.includes("validators: '6'")) {
      fail('comparison surfaces must not restore unreceipted hard-coded Tezos Nakamoto values');
    }
    const tezosStaticBlock = comparisonConfig.match(/tezosStatic:\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
    if (!tezosStaticBlock.includes("validators: 'See /health'") || /validators:\s*['"](?:4|6)['"]/.test(tezosStaticBlock)) {
      fail('comparison config must defer Tezos concentration to Network Health');
    }
    if (/\b(?:stakingPct|annualIssuance):\s*['"]Live['"]/.test(tezosStaticBlock)) {
      fail('comparison no-JS fallbacks must say unavailable rather than rendering a bare Live placeholder');
    }
    if (!comparison.includes('Concentration and slashing rows are contextual') || comparison.includes("key: 'slashing',\n        label: 'Slashing',\n        icon: '🔪',\n        tezosLive: () => CHAIN_COMPARISON.tezosStatic.slashing,\n        tezosNote: () => CHAIN_COMPARISON.tezosStatic.slashingNote,\n        winner: 'tezos'")) {
      fail('comparison summary must treat slashing and concentration as context, not categorical winners');
    }
    for (const key of ['stakingPct', 'annualIssuance', 'energyPerTx', 'avgTxFee']) {
      const metric = comparison.match(new RegExp(`key:\\s*'${key}',[\\s\\S]*?\\n\\s*},`))?.[0] || '';
      if (!metric.includes('winner: null')) {
        fail(`comparison ${key} must not assign a hard-coded winner to dynamic or method-dependent values`);
      }
    }
    const governanceRecordMetric = comparison.match(/key:\s*'selfAmendments',[\s\S]*?\n\s*},/)?.[0] || '';
    if (!governanceRecordMetric.includes("label: 'Governance Upgrade Record'")
        || !governanceRecordMetric.includes('winner: null')
        || /selfAmendments:\s*[01]\s*,/.test(comparisonConfig)) {
      fail('comparison must describe unlike governance upgrade mechanisms as context instead of an invented numeric self-amendment scoreboard');
    }
    if (!comparison.includes('Dynamic or method-dependent staking, issuance, energy, fee, concentration, and slashing rows have no categorical winner.')
        || /Lowest gross issuance in this tracked set|high staking participation|lowest fees, and the smallest energy footprint/i.test(comparison)) {
      fail('comparison chain profiles must keep dynamic and methodology-dependent metrics neutral');
    }
    if (/Solana wins cost|Highest participation|Tezos uses less energy per tx|~0\.00051 kWh|~\$0\.005/.test(comparison)) {
      fail('comparison share copy must not restore undated fee, energy, or staking winner claims');
    }
    if (/5 chains\. 1 comparison\. Live data|Cardano:\s*~12 min|created Lido|billions in exploits|forks every upgrade/i.test(comparison)) {
      fail('comparison share copy must distinguish live Tezos data from dated peers and avoid obsolete or unreceipted claims');
    }
    if (/Algorand:\s*~3\.3s|after 31 blocks|0\.658 kJ\/tx/.test(comparison)
        || !comparison.includes('const algorandFinality = CHAIN_COMPARISON.algorand.finality')
        || !comparison.includes('const solanaFinalityNote = CHAIN_COMPARISON.solana.finalityNote')) {
      fail('comparison share copy must use the verified snapshot instead of duplicating stale numeric values');
    }
    const hardForkMetric = comparison.match(/key:\s*'hardForks',[\s\S]*?\n\s*\},/)?.[0] || '';
    if (!hardForkMetric.includes("label: 'Upgrade Path'") || !hardForkMetric.includes('winner: null')) {
      fail('comparison must treat unlike hard-fork and upgrade mechanisms as contextual');
    }
    if (/of 10|Nakamoto coefficient/i.test(compareIndex)) {
      fail('comparison index must not present an editorial aggregate score or unlike Nakamoto bases as one ranking');
    }
    const comparisonVerifiedDate = comparisonConfig.match(/lastUpdated:\s*'([^']+)'/)?.[1];
    const expectedComparisonClaims = [
      'tezos.blockTime',
      'tezos.finality',
      'tezos.selfAmendments',
      'ethereum.blockTime',
      'ethereum.finality',
      'solana.blockTime',
      'solana.finality',
      'cardano.blockTime',
      'algorand.blockTime',
      'algorand.finality'
    ];
    if (comparisonVerification.lastVerified !== comparisonVerifiedDate
        || comparisonVerification.summary?.verifiedClaims !== expectedComparisonClaims.length
        || comparisonVerification.summary?.requiredChecksPerClaim !== 2
        || !comparisonConfig.includes("report: '/data/chain-comparison-verification.json'")
        || !comparisonConfig.includes('checksPerClaim: 2')) {
      fail('comparison config and monthly verification summary must reconcile');
    }
    const comparisonClaims = new Map((comparisonVerification.claims || []).map((claim) => [claim.id, claim]));
    for (const id of expectedComparisonClaims) {
      const claim = comparisonClaims.get(id);
      const checks = claim?.checks || [];
      if (claim?.status !== 'verified'
          || checks.length < 2
          || new Set(checks.map((check) => check.source)).size < 2
          || checks.some((check) => check.status !== 'verified' || !/^[a-f0-9]{64}$/.test(check.contentSha256 || ''))) {
        fail(`comparison numeric claim must retain two hashed source checks: ${id}`);
      }
    }
    if (!comparisonRefresh.includes('MAX_REPORT_AGE_DAYS = 45')
        || !comparisonRefresh.includes('Under Development')
        || !comparisonRefresh.includes('source-native-on-chain-sample')
        || !comparisonWorkflow.includes("cron: '23 8 1 * *'")
        || !comparisonWorkflow.includes('npm run refresh:comparison')
        || !comparisonWorkflow.includes('npm run check:comparison')
        || !comparisonWorkflow.includes('npm run bake:compare')
        || !comparisonWorkflow.includes('npm run test:static')) {
      fail('monthly comparison automation must double-check, fail closed, rebake, and validate before commit');
    }
    if (!compareIndex.includes('/data/chain-comparison-verification.json')
        || !compareIndex.includes(`${expectedComparisonClaims.length} static numbers each require at least 2 checks`)) {
      fail('comparison index must expose the monthly double-check receipt');
    }
    const peerReferences = {
      ethereum: 'https://ethereum.org/developers/docs/blocks/',
      solana: 'https://solana.com/developers/guides/advanced/confirmation',
      cardano: 'https://docs.cardano.org/about-cardano/explore-more/cardano-network',
      algorand: 'https://dev.algorand.co/concepts/transactions/blocks/'
    };
    for (const chain of ['ethereum', 'solana', 'cardano', 'algorand']) {
      const page = await readText(`compare/tezos-vs-${chain}.html`);
      if (!page.includes('See /health') || !page.includes('No composite score is assigned.')) {
        fail(`Tezos vs ${chain} must defer concentration and omit a composite winner`);
      }
      if (/<div class="cp-scoreboard"/.test(page)) {
        fail(`Tezos vs ${chain} must not restore the baked aggregate scoreboard`);
      }
      if (!page.includes(peerReferences[chain])
          || !page.includes('/data/chain-comparison-verification.json')
          || !page.includes('Peer values are a static snapshot')
          || !page.includes('they are not all live')) {
        fail(`Tezos vs ${chain} must disclose its static peer snapshot and primary reference`);
      }
    }

    if (/250\+|~250/.test(stakingGuide + bakersGuide)) {
      fail('staking and baker guides must not hard-code a stale baker population');
    }
    if (/below 67% attestation rate get deactivated/i.test(bakersGuide)) {
      fail('baker guide must separate reward participation thresholds from inactivity deactivation');
    }
    if (!/direct staking freezes XTZ/i.test(stakingGuide)
        || !stakingGuide.includes('protocol unstaking and finalization process')
        || !bakersGuide.includes('deactivation is a separate consequence of sustained inactivity')) {
      fail('staking and baker guides must preserve lockup and deactivation semantics');
    }
    if (stakingGuide.includes('<td>Baker fee</td>')
        || !stakingGuide.includes('Off-chain baker payout policy')
        || !stakingGuide.includes('0–100% external-staker edge')
        || !stakingGuide.includes('It is not a delegation fee.')) {
      fail('staking guide must distinguish off-chain delegation terms from the on-chain direct-staking edge');
    }
    if (!stakingChamber.includes('STAKING_GUIDE_COPY')
        || !stakingChamber.includes('renderStakingGuide(overviewData)')
        || !stakingChamber.includes('fetchStakingAPY()')
        || !stakingChamber.includes('fetchIssuance()')
        || !stakingChamber.includes("url.searchParams.set('view', 'guide')")) {
      fail('Staking Chamber must visibly render the shared guide, source its live economics, and preserve the canonical guide-view route');
    }

    const publicCopy = `${tweetTemplates}\n${protocolData}\n${comparison}\n${siteMapCopy}\n${dailyBriefingCopy}\n${changelogCopy}`;
    const forbiddenClaims = [
      [/\{value\}\s+independent\s+(?:bakers|operators|validators)/i, 'active baker addresses must not be presented as independently controlled operators'],
      [/every single one run by an independent operator/i, 'the baker count must not imply one independent operator per address'],
      [/risk[- ]?free|zero additional risk|no slashing risk|no smart contract risk/i, 'delegation copy must not erase payout, wallet, market, or operational risks'],
      [/Tezos is the only L1 with real on-chain democracy|stake IS governance|your stake IS your vote|every staker is also a voter/i, 'governance copy must distinguish assigned voting power from baker ballots'],
      [/Ethereum[^\n]{0,120}probabilistic finality|probabilistic finality[^\n]{0,120}Ethereum/i, 'Ethereum PoS must be described with checkpoint finality, not Nakamoto-style probabilistic finality'],
      [/zero hard forks|zero chain splits|zero reorganizations|no reorgs|100% uptime|zero downtime|perfect uptime|not a single outage|days fork-free|zero-fork (?:history|streak|upgrades)/i, 'public copy must not make unreceipted absolute continuity claims'],
      [/every (?:single )?block is final|guaranteed finality|mathematically final/i, 'Tenderbake finality must retain its BFT, quorum, and network assumptions'],
      [/no admin keys|zero external trust assumptions|no bridge risk|same guarantees|actually work as intended|verified first|no other (?:L1|chain)|every use case|won't drain user funds|formally verified contracts|near-zero exploits|formal verification would have caught|bugs (?:aren't found|are made impossible)/i, 'public share copy must not turn framework capabilities into universal application or cross-chain guarantees'],
      [/single Tezos transaction uses|Raspberry Pis drawing \d+ watts|\b\d[\d,.]*x more efficient|certified carbon neutral/i, 'public energy copy must retain a dated measurement boundary and methodology'],
      [/staking is voting|funded (?:accounts|addresses)[^\n]{0,80}(?:are|represent|counts?) (?:real )?(?:people|users|humans)|every[^\n]{0,60}can[^\n]{0,40}vote/i, 'funded addresses must not be presented as unique people or direct governance voters'],
      [/trilemma solved|every new baker adds another operator|no slashing for downtime/i, 'baker-address copy must not imply independent control or erase protocol risk'],
      [/only one lets stakeholders vote/i, 'cross-chain governance copy must not use an unreceipted categorical winner'],
      [/no VC unlocks|no hidden wallets|mysterious foundation wallet|team tokens unlocking/i, 'supply telemetry must not infer wallet control or future market behavior'],
      [/zero fragmentation|approve\/transferFrom footguns|built-in contract upgrade mechanism/i, 'token and contract tooling copy must not turn design options into universal guarantees'],
      [/first time a blockchain upgraded itself|foundation of every zk-rollup/i, 'protocol history must avoid unsupported cross-chain firsts and universal ZK claims'],
      [/sub-cent|fractions?[- ]of[- ](?:a[- ])?cent|near-zero fees|costs? almost nothing|for pennies/i, 'fee copy must use current comparable receipts instead of timeless dollar-cost claims'],
      [/stake: run your own baker|earn: either way|your XTZ, your choice of baker, your rewards|accounts earning through staking or delegation|reward-earning/i, 'staking copy must distinguish direct staking, baking, and discretionary delegation payouts'],
      [/daily cycles mean daily rewards|earn every single day|without a single halt|hasn['’]t missed one since genesis/i, 'cycle copy must not turn nominal timing into guaranteed rewards or availability'],
      [/all of them actually finalized|deterministic finality[^\n]{0,100}what are you waiting for/i, 'transaction counts must not imply unconditional finality'],
      [/active smart rollups|active examples|rollups live|enshrined L2 security|inter-rollup messaging without the trust assumptions/i, 'unfiltered originated-rollup counts and L1 verification must not erase activity or deployment assumptions'],
      [/unbiasable randomness|ETH validators still can['’]t separate|any VM[^\n]{0,80}verified by the L1|\{total\} on-chain votes|most contested (?:Tezos )?upgrade/i, 'protocol-history copy must not restore false universal, superlative, or one-upgrade-one-vote claims'],
      [/how many people (?:are )?(?:actually )?securing|merge to deflationary|went deflationary with the merge|respond(?:s|ing)? to actual (?:network )?usage(?: patterns)?/i, 'issuance copy must use direct-staking conditions and dated net-supply outcomes']
    ];
    for (const [pattern, message] of forbiddenClaims) {
      if (pattern.test(publicCopy)) fail(message);
    }
    for (const required of [
      'baker payout/default, wallet, market, and operational risks remain',
      'Delegators assign voting power to their baker',
      'quorum and normal network conditions',
      'Ethereum proof of stake uses checkpoint finality'
    ]) {
      if (!publicCopy.includes(required)) fail(`public truth copy must retain: ${required}`);
    }

    pass('reward, APY, concentration, and staking guide truth contracts checked');
  }

  return { checkGovernanceVotes, checkHistoricalPagination, checkLiquidityBakingIssuanceState, checkTruthSurfaceContracts };
}
