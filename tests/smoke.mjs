#!/usr/bin/env node
import { smokeTextLoadingChambers, smokeTextLoadingMyTezos, smokeTextLoadingWidgets, smokeTextLoadingTools, smokeTextLoadingSecondary } from './lib/text-loading-smoke.mjs';

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeSuiteCatalog,
  formatSuiteSummary,
  isSmokeInfrastructureError,
  parseShard,
  selectSuiteCatalog,
  SmokeInfrastructureError,
  summarizeSuiteResults,
  unstableSuiteResults
} from './lib/smoke-harness.mjs';
import { selectAffectedSmokeSuites } from './lib/smoke-affected.mjs';
import { createSmokeLifecycle, SmokeCancelledError } from './lib/smoke-lifecycle.mjs';
import { metadataForSmokeSuite } from './lib/smoke-metadata.mjs';
import { chooseLiveHeadDepth } from './live-head-depth-smoke.mjs';
import { smokeTallScreen } from './tall-screen-smoke.mjs';
import { smokeChamberFirstPaint } from './lib/chamber-first-paint-smoke.mjs';
import { smokeStandaloneChamberExpansion } from './lib/standalone-chamber-expansion-smoke.mjs';
import { smokeChamberUx } from './lib/chamber-ux-smoke.mjs';
import { fundingFixtures } from './fixtures/community-funding.mjs';
import { buildFundingPreview } from '../js/core/community-funding.mjs';
import { smokeCommunityFunding } from './lib/community-funding-smoke.mjs';
import { smokeChamberReading } from './lib/chamber-reading-smoke.mjs';
import { smokeTezosCrpCompaction } from './lib/tezoscrp-compaction-smoke.mjs';
import { smokeStandaloneChamberCompletion } from './lib/standalone-chamber-completion-smoke.mjs';
import { smokeStandaloneChamberLifecycle } from './lib/standalone-chamber-lifecycle-smoke.mjs';
import { smokeBakerIncidents } from './lib/baker-incidents-smoke.mjs';
import { smokeMyTezosLayoutStates } from './lib/my-tezos-layout-states-smoke.mjs';
import { smokeMyTezosLayout } from './lib/my-tezos-layout-smoke.mjs';
import { checkInspectorKeyboardReceipt, checkInspectorTriggerRefresh } from './lib/network-health-harness-check.mjs';
import { smokeLiveHeadStall } from './lib/live-head-stall-smoke.mjs';
import { smokeWidgetRefresh } from './lib/widget-refresh-smoke.mjs';
import { smokeLazyDrawerCharts } from './lib/lazy-drawer-charts-smoke.mjs';
import { instrumentBrowserForAsyncWork } from './lib/smoke-browser-work.mjs';
import { smokeOptionalToolsLazy } from './lib/optional-tools-lazy-smoke.mjs';
import { smokeSourcePayloads } from './lib/source-payload-smoke.mjs';
import { smokeLiveTimeLabels } from './lib/live-time-label-smoke.mjs';
import { smokeDomAffordances } from './lib/dom-affordances-smoke.mjs';
import { smokeChainContinuity, smokeHenStylesLazy } from './lib/continuity-hen-smoke.mjs';
import { smokeRootOgImage } from './lib/root-og-smoke.mjs';
import { smokeThemeEffectsLazy } from './lib/theme-effects-lazy-smoke.mjs';
import { smokeBakerRosterLoading } from './lib/baker-roster-loading-smoke.mjs';
import { smokeViewportLoading } from './lib/viewport-loading-smoke.mjs';
import { decodeGeneratedTransport, encodeGeneratedTransport } from '../js/core/generated-transport.mjs';
import { getChamberCategories } from '../scripts/lib/chamber-catalog.mjs';
import { createShellSmokeSuites } from './smoke/shell.mjs';
import { createSearchSmokeSuites } from './smoke/search.mjs';
import { createNavigationSmokeSuites } from './smoke/navigation.mjs';
import { createHomeSmokeSuites } from './smoke/home.mjs';
import { createPulseSmokeSuites } from './smoke/pulse.mjs';
import { createMyTezosAccountSmokeSuites } from './smoke/my-tezos-account.mjs';
import { createMyTezosBakingSmokeSuites } from './smoke/my-tezos-baking.mjs';
import { createMyTezosViewsSmokeSuites } from './smoke/my-tezos-views.mjs';
import { createMyTezosNavigationSmokeSuites } from './smoke/my-tezos-navigation.mjs';
import { createNetworkHealthSmokeSuites } from './smoke/network-health.mjs';
import { createMaxisSmokeSuites } from './smoke/maxis.mjs';
import { createChamberLoadingSmokeSuites } from './smoke/chamber-loading.mjs';
import { createCapitalSmokeSuites } from './smoke/capital.mjs';
import { createMineralsSmokeSuites } from './smoke/minerals.mjs';
import { createMetalsSmokeSuites } from './smoke/metals.mjs';
import { createUraniumSmokeSuites } from './smoke/uranium.mjs';
import { createEcosystemSmokeSuites } from './smoke/ecosystem.mjs';
import { createGovernanceSmokeSuites } from './smoke/governance.mjs';
import { createStakingSmokeSuites } from './smoke/staking.mjs';
import { createActivitySmokeSuites } from './smoke/activity.mjs';
import { createToolsSmokeSuites } from './smoke/tools.mjs';
import { createThemesSmokeSuites } from './smoke/themes.mjs';
import { createHenSmokeSuites } from './smoke/hen.mjs';
import { createPublicRoutesSmokeSuites } from './smoke/public-routes.mjs';
import { createQuietRefreshSmokeSuites } from './smoke/quiet-refresh.mjs';
import { createUpstreamsSmokeSuites } from './smoke/upstreams.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const releaseRadarFixture = require('../data/release-radar.json');
// Ticker geometry and release ordering use a stable no-crossings catalog.
// Scheduled milestone receipts are exercised by their own dedicated suites.
const pulseMilestoneFixture = { schema: 1, tracks: {} };
const intentionalWaits = require('./fixtures/smoke-intentional-waits.json');
const defaultSmokeSuiteCosts = require('./fixtures/smoke-suite-costs.json');
const { launchChromium: launchPlaywrightChromium } = require('../scripts/lib/playwright-browser.cjs');
let cli;
try {
  cli = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`fail - ${error.message}`);
  process.exit(1);
}
const BASE_URL = cli.baseUrl || process.env.BASE_URL || '';
const HEADLESS = !(cli.headed || process.env.SMOKE_HEADED === '1');
const STRICT_EXTERNAL = cli.strictExternal || process.env.STRICT_EXTERNAL === '1';
const HERMETIC_NETWORK = !cli.allowLiveNetwork && (cli.hermetic || process.env.SMOKE_HERMETIC === '1');
const BROWSER_EXECUTABLE_PATH = cli.browserExecutablePath || process.env.BROWSER_EXECUTABLE_PATH || '';
const ONLY_SUITES = cli.onlySuites;
const ONLY_RISKS = cli.onlyRisks;
const ARTIFACTS_DIR_VALUE = cli.artifactsDir || process.env.SMOKE_ARTIFACTS_DIR || '';
const ARTIFACTS_DIR = ARTIFACTS_DIR_VALUE ? path.resolve(ROOT, ARTIFACTS_DIR_VALUE) : '';
const CONTINUE_ON_FAILURE = cli.continueOnFailure || process.env.SMOKE_CONTINUE_ON_FAILURE === '1';
const ISOLATE_SUITES = cli.isolateSuites || process.env.SMOKE_ISOLATE_SUITES === '1';
const REPEAT_EACH = cli.repeatEach;
const RETRY_FAILURES = cli.retryFailures;
const RETRY_INFRASTRUCTURE = cli.retryInfrastructure;
const SHARD = cli.shard;
const AFFECTED_SINCE = cli.affectedSince;
const AFFECTED_HIGH_RISK_REPEAT = cli.affectedHighRiskRepeat;
const SUITE_COSTS_PATH = cli.suiteCostsPath ? path.resolve(ROOT, cli.suiteCostsPath) : '';
const smokeSuiteCosts = SUITE_COSTS_PATH
  ? JSON.parse(readFileSync(SUITE_COSTS_PATH, 'utf8'))
  : defaultSmokeSuiteCosts;
let affectedSelectionReport = null;
let smokeLifecycle;

function stableTestValue(value) {
  if (Array.isArray(value)) return value.map(stableTestValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableTestValue(value[key])]));
}

function stableTestHash(value) {
  return createHash('sha256').update(JSON.stringify(stableTestValue(value))).digest('hex');
}

async function waitForIntentionalRealTime(page, key) {
  const receipt = intentionalWaits[key];
  if (!receipt || !Number.isInteger(receipt.milliseconds) || receipt.milliseconds < 1 || !receipt.reason) {
    throw new Error(`undocumented intentional real-time wait: ${key}`);
  }
  await page.waitForTimeout(receipt.milliseconds);
}

const allowedWarningPatterns = [
  /goatcounter/i,
  /Price fetch failed/i,
  /Rate limited \(429\)/i,
  /status of 429/i,
  /Landing data fetch/i,
  /Tezlink entry refresh failed/i,
  /Failed to fetch/i,
  /CORS policy/i,
  /No 'Access-Control-Allow-Origin'/i,
  /Failed to load resource: net::ERR_FAILED/i,
  /HTTP 429/i,
  /HTTP 503/i,
  /api\.coingecko\.com/i,
  /api\.tzkt\.io/i,
  /eu\.rpc\.tez\.capital/i,
  /tezos-mainnet\.octez\.io/i,
  /teztale-server-mainnet-ro-prd\.octez\.tech/i,
  /api\.llama\.fi/i,
  /fonts\.googleapis\.com/i,
  /fonts\.gstatic\.com/i,
  /explorer\.etherlink\.com/i,
  /node\.mainnet\.etherlink\.com/i,
  /api\.github\.com/i,
  /SW registration failed/i,
  /Service Worker registration blocked by Playwright/i,
  /Using local protocol fallback/i,
  // Native Chromium performance advice from NERV's occasional glitch slice,
  // not a failed draw or application warning. Do not force the mostly-drawing
  // painter into CPU readback mode solely to silence this diagnostic.
  /^Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true\. See: https:\/\/html\.spec\.whatwg\.org\/multipage\/canvas\.html#concept-canvas-will-read-frequently https?:\/\/[^\s]+\/js\/effects\/bg-effects\.js(?:\?[^\s]*)?$/,
  /preloaded using link preload/i
];

const browserRoutes = [
  '/',
  '/landing.html',
  '/my/',
  '/anthology/',
  '/staking/',
  '/stake/',
  '/governance/',
  '/chamber/',
  '/pulse/',
  '/capital/',
  '/minerals/',
  '/uranium/',
  '/metals/',
  '/ecosystem/',
  '/whales/',
  '/leaderboard/',
  '/history/',
  '/maxis/',
  '/tezoscrp/',
  '/funding/',
  '/health/',
  '/tezosx/',
  '/tezlink/',
  '/l2chamber/',
  '/tz4/',
  '/lb/',
  '/ledger-flow/',
  '/domains/',
  '/ctez/',
  '/bakers/',
  '/hen/',
  '/compare/',
  '/compare/tezos-vs-ethereum.html',
  '/compare/tezos-vs-solana.html',
  '/compare/tezos-vs-cardano.html',
  '/compare/tezos-vs-algorand.html',
  '/widgets/baker-count.html',
  '/widgets/block-height.html',
  '/widgets/staking-ratio.html',
  '/widgets/price.html',
  '/widgets/protocol.html',
  '/widgets/governance.html',
  '/widgets/combo.html',
  '/widgets/baker-card.html',
  '/widgets/builder.html'
];
const formattingRoutes = [
  ...browserRoutes,
  '/404.html'
];
const formattingViewports = [
  { label: 'desktop', viewport: { width: 1280, height: 900 } },
  { label: 'mobile', viewport: { width: 390, height: 844 } }
];

const DEFERRED_CHAMBER_MODULE_PATHS = [
  '/js/features/capital-chamber.js',
  '/js/features/chamber.js',
  '/js/features/ctez.js',
  '/js/features/community-funding.js',
  '/js/features/ecosystem-chamber.js',
  '/js/features/etherlink-governance.js',
  '/js/features/ledger-flow.js',
  '/js/features/liquidity-baking.js',
  '/js/features/leaderboard.js',
  '/js/features/maxis.js',
  '/js/features/metals-chamber.js',
  '/js/features/minerals-chamber.js',
  '/js/features/network-pulse.js',
  '/js/features/staking-chamber.js',
  '/js/features/tezos-domains.js',
  '/js/features/tezoscrp.js',
  '/js/features/tezlink.js',
  '/js/features/tz4-adoption.js',
  '/js/features/uranium-chamber.js',
  '/js/features/whale-chamber.js'
];
const DEFERRED_CHAMBER_PROJECTION_PATHS = [
  '/data/capital-entry-summary.json',
  '/data/ecosystem-entry-summary.json',
  '/data/maxis/entry-summary.json',
  '/data/baker-governance-signals.json',
  '/data/minerals-entry-summary.json',
  '/data/metals-entry-summary.json',
  '/data/uranium-entry-summary.json'
];
const DEFERRED_CHAMBER_STYLE_PATHS = [
  '/css/capital.min.css',
  '/css/community-funding.min.css',
  '/css/ecosystem.min.css',
  '/css/ledger-flow.min.css',
  '/css/leaderboard.min.css',
  '/css/maxis.min.css',
  '/css/market-room.min.css',
  '/css/metals-chamber.min.css',
  '/css/minerals-chamber.min.css',
  '/css/network-pulse.min.css',
  '/css/staking-chamber.min.css',
  '/css/tezos-domains.min.css',
  '/css/tezoscrp.min.css',
  '/css/uranium-chamber.min.css',
  '/css/whale-chamber.min.css'
];
const DEFERRED_CHAMBER_HEAVY_DATA_PATHS = [
  '/data/capital-snapshot.json',
  '/data/community-funding-teztree.json',
  '/data/community-funding-ttcrowd.json',
  '/data/community-funding-hacktez.json',
  '/data/ecosystem-stats.json',
  '/data/maxis-leaders.json',
  '/data/maxis-careers.json',
  '/data/maxis-l2-governance.json',
  '/data/maxis/manifest.json',
  '/data/metals-snapshot.json',
  '/data/minerals-snapshot.json',
  '/data/tezoscrp-awards.json',
  '/data/tezoscrp-awards.compact.json',
  '/data/uranium-snapshot.json',
  '/data/whale-watch.json'
];

const SAMPLE_ADDRESS = 'tz1aWXP237BLwNHJcCD4b3DutCevhqq2T1Z9';
const SAMPLE_ADDRESS_2 = 'tz1hThMBD8jQjFt78heuCnKxJnJtQo9Ao25X';
const SAMPLE_ADDRESS_3 = 'tz1PendingBaker111111111111111111111';
const SAMPLE_CONTRACT = 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT';
const SAMPLE_IDLE_ADDRESS = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const SAMPLE_ETHERLINK_ADDRESS = '0x1111111111111111111111111111111111111111';
const SAMPLE_LEDGER_ORIGIN = 'tz1LedgerOrigin1111111111111111111111';
const SAMPLE_LEDGER_MARKET = 'tz1LedgerMarket1111111111111111111111';
const SAMPLE_LEDGER_SMALL = 'tz1LedgerSmall11111111111111111111111';
const SAMPLE_DELEGATOR_ADDRESS = 'tz1iJP1EtP9iSkmaEKCZznDMst91oJGB9SZ5';
const SAMPLE_REGULAR_DELEGATOR_ADDRESS = 'tz1iKT2pvdbEHuVC3zugnJfVoQZbbyUzgToW';
const SAMPLE_SMALL_DELEGATOR_ADDRESS = 'tz1hh3pqYnm3umz3U7zJ6xkaCmpXbnKA7aAm';
const SAMPLE_STAKER_ADDRESS = 'tz1XrutuvkFRG15HmV2gdon86F38NMMGMAXr';
const SAMPLE_HEAVY_STAKER_ADDRESS = 'tz1dKGGEVmYrm6V8hBKexLQLdWCapoEAZb1i';
const SAMPLE_HISTORICAL_REWARDS_ADDRESS = 'tz1HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH';
const SAMPLE_LARGE_STAKER_ADDRESS = 'tz1dCgGWymGmVefmNTHSBhSYXXfeJ2aprCLv';
const SAMPLE_STAKING_BAKER_ADDRESS = 'tz1StakingBaker11111111111111111111111';
const SAMPLE_UNSTAKER_ADDRESS = 'tz1Unstaker11111111111111111111111111';
const OVERDELEGATED_ADDRESS = 'tz1bA9zZpouVgtMRLijvw5safwDKSxg62r1x';
const ETHERLINK_ROLLUP_ADDRESS = 'sr1Ghq66tYK9y3r8CC1Tf8i8m5nxh8nTvZEf';
const ETHERLINK_FAST_CONTRACT = 'KT19oUVQPnVLuUBYXrBVd46WJnNAMpqkKSwo';
const ETHERLINK_SLOW_CONTRACT = 'KT1AXRU3wLc87WNhLhVGrgqDGubLACUMUgPb';
const ETHERLINK_SEQUENCER_CONTRACT = 'KT1KiVz8ZpHo3HpE1GCP5HLgywPDRwVUkCFh';
const TEZOS_DOMAINS_CONTRACT = 'KT1F7JKNqwaoLzRsMio1MQC7zv3jG9dHcDdJ';
const ETHERLINK_FAST_PROPOSAL = '00625d22abf10a520cae5489b7e19df70219a150d336ee6dc0a8eb4c21eca43c1b';
const ETHERLINK_FAST_OLDER_PROPOSAL = '0056aea7f98b2bc4d18edb450b2f098f6e95e5356f30a1fac2b50080f3e482bad1';
const ETHERLINK_SLOW_PROPOSAL = '0079e0f348b608ce486c9e5e1fdf84b650019922bf3383b562522c2c8f60a098da';
const ETHERLINK_SEQUENCER_PROPOSAL = {
  pool_address: '3b1885eec759c22c878e12c84fac33b3b9d153e4',
  sequencer_pk: 'p2pk64mGSmsRAuodTdyNMJdSC6SmtWHF3gXH1WmmpPY8hyTqYFfd4Bg'
};
const ETHERLINK_PROPOSALS_BIGMAP = '990001';
const ETHERLINK_UPVOTERS_BIGMAP = '990002';
const ETHERLINK_UPVOTE_COUNTS_BIGMAP = '990003';
const ETHERLINK_PROMOTION_VOTERS_BIGMAP = '990004';
const ETHERLINK_TOTAL_VOTING_POWER = '656635662773932';
const ETHERLINK_SHARED_VOTING_KEY = SAMPLE_DELEGATOR_ADDRESS;
const ETHERLINK_PROMOTION_LEDGER = [
  ...Array.from({ length: 20 }, (_, index) => ({
    address: `tz1FullLedgerVoter${String(index + 1).padStart(2, '0')}xxxxxxxxxxxxxxxx`,
    alias: `Ledger Baker ${index + 1}`,
    votingPower: 6000000000000,
    vote: 'yea',
    level: 12345400 + index
  })),
  {
    address: 'tz1FullLedgerVoter21xxxxxxxxxxxxxxxx',
    alias: 'Ledger Baker 21',
    votingPower: 6540547994324,
    vote: 'yea',
    level: 12345420
  },
  {
    address: 'tz1FullLedgerVoter22xxxxxxxxxxxxxxxx',
    alias: 'Ledger Baker 22',
    votingPower: 17603957631481,
    vote: 'pass',
    level: 12345421
  },
  { address: SAMPLE_HEAVY_STAKER_ADDRESS, alias: 'Heavy Baker', votingPower: 10000000000000, vote: 'pass', level: 12345590 },
  { address: SAMPLE_STAKER_ADDRESS, alias: 'Staker Baker', votingPower: 15000000000000, vote: 'pass', level: 12345590 },
  { address: SAMPLE_ADDRESS_3, alias: 'Pending Baker', votingPower: 20000000000000, vote: 'pass', level: 12345590 },
  { address: SAMPLE_ADDRESS_2, alias: 'Second Baker', votingPower: 25000000000000, vote: 'pass', level: 12345590 },
  { address: SAMPLE_ADDRESS, alias: 'QA Baker', votingPower: 30000000000000, vote: 'yea', level: 12345600 }
];
// The catalog owns topic copy, membership and ordering. This independent visual
// contract still pins each room's actual DOM identity and intended density.
const EXPECTED_CHAMBER_PRESENTATION = {
  ecosystem: ['ecosystem-entry-card', 'featured'],
  pulse: ['network-pulse-entry-card', 'featured'],
  health: ['network-health', 'standard'],
  tezosx: ['tezlink-entry-card', 'standard'],
  capital: ['capital-entry-card', 'featured'],
  minerals: ['minerals-entry-card', 'featured'],
  uranium: ['uranium-entry-card', 'featured'],
  metals: ['metals-entry-card', 'featured'],
  whales: ['whale-watch-entry-card', 'wide'],
  'staking-chamber': ['staking-entry-card', 'compact'],
  leaderboard: ['baker-directory-entry-card', 'wide'],
  tz4: ['tz4-adoption', 'compact'],
  chamber: ['chamber-entry-card', 'standard'],
  'l2-governance': ['etherlink-governance-entry-card', 'standard'],
  'liquidity-baking': ['lb-entry-card', 'featured'],
  'ledger-flow': ['ledger-flow-entry-card', 'featured'],
  domains: ['tezos-domains-entry-card', 'featured'],
  maxis: ['maxis-entry-card', 'featured'],
  tezoscrp: ['tezoscrp-entry-card', 'featured'],
  funding: ['funding-entry-card', 'featured'],
  anthology: ['protocol-history-entry-card', 'standard'],
  history: ['cycle-history-entry-card', 'standard']
};
const chamberCategories = getChamberCategories();
const catalogChambers = chamberCategories.flatMap(category => category.entryIds);
assert(Object.keys(EXPECTED_CHAMBER_PRESENTATION).length === catalogChambers.length
  && new Set(catalogChambers).size === catalogChambers.length
  && catalogChambers.every(id => Object.hasOwn(EXPECTED_CHAMBER_PRESENTATION, id)),
  'Every canonical launcher needs an independently reviewed DOM/layout expectation');
const EXPECTED_CHAMBER_CATEGORIES = chamberCategories.map(({ key, label, question, entryIds }) => ({
  key, label, question,
  cards: entryIds.map(id => EXPECTED_CHAMBER_PRESENTATION[id][0]),
  layouts: entryIds.map(id => EXPECTED_CHAMBER_PRESENTATION[id][1])
}));
const EXPECTED_CHAMBER_ORDER = EXPECTED_CHAMBER_CATEGORIES.flatMap((category) => category.cards);
const DEFAULT_EXPANDED_CHAMBER_CATEGORY = 'ecosystem';

function hasExpectedDefaultChamberDisclosure(categories) {
  return categories.length === EXPECTED_CHAMBER_CATEGORIES.length
    && categories.every((category) => {
      const shouldBeOpen = category.key === DEFAULT_EXPANDED_CHAMBER_CATEGORY;
      return category.open === shouldBeOpen && category.visibleCards === (shouldBeOpen ? 1 : 0);
    });
}

function usage() {
  return `
Usage: node tests/smoke.mjs [options]

Options:
  --base-url <url>             Test an existing local or remote server instead of starting one
  --affected-since <git-ref>   Run static-selected owners of files changed since a Git reference
  --affected-high-risk-repeat <count>
                                Repeat selected high-risk suites this many times
  --headed                     Run Chromium visibly
  --strict-external            Fail on upstream warnings normally tolerated in local smoke runs
  --hermetic                   Block every undeclared non-target request and use shared pinned fixtures
  --allow-live-network         Explicitly disable hermetic routing for the live upstream canary
  --browser-executable <path>  Use a specific Chrome/Chromium executable
  --only <suite[,suite]>       Run selected suites by name
  --risk <level[,level]>       Run suites tagged low, normal, or high risk
  --shard <index/total>        Run one deterministic runtime-balanced shard of the selected suites
  --suite-costs <path>         Use an adaptive hosted timing ledger instead of the committed baseline
  --repeat-each <count>        Repeat every selected suite to expose intermittent behavior
  --retry-failures <count>     Re-run a failed suite in a fresh browser for diagnosis
  --retry-infrastructure <n>   Transparently retry pre-test browser/server startup failures
  --continue-on-failure        Run every selected suite and report all failures together
  --isolate-suites             Give every suite a fresh browser process
  --artifacts-dir <path>       Save JSON results and retry traces under this directory
  --list                       List available suites and exit
  --help                       Show this help
`.trim();
}

function readArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value\n\n${usage()}`);
  return value;
}

function readIntegerOption(value, flag, { min = 0, max = 100 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${flag} must be an integer from ${min} to ${max}\n\n${usage()}`);
  }
  return number;
}

function parseArgs(argv) {
  const options = {
    artifactsDir: '',
    allowLiveNetwork: false,
    affectedHighRiskRepeat: 1,
    affectedSince: '',
    baseUrl: '',
    browserExecutablePath: '',
    continueOnFailure: false,
    headed: false,
    hermetic: false,
    isolateSuites: false,
    list: false,
    onlyRisks: [],
    onlySuites: [],
    repeatEach: 1,
    retryFailures: 0,
    retryInfrastructure: 0,
    shard: null,
    strictExternal: false,
    suiteCostsPath: ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--headed') {
      options.headed = true;
    } else if (arg === '--strict-external') {
      options.strictExternal = true;
    } else if (arg === '--hermetic') {
      options.hermetic = true;
    } else if (arg === '--allow-live-network') {
      options.allowLiveNetwork = true;
      options.hermetic = false;
    } else if (arg === '--continue-on-failure') {
      options.continueOnFailure = true;
    } else if (arg === '--isolate-suites') {
      options.isolateSuites = true;
    } else if (arg === '--base-url') {
      options.baseUrl = readArg(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--affected-since') {
      options.affectedSince = readArg(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--affected-since=')) {
      options.affectedSince = arg.slice('--affected-since='.length);
    } else if (arg === '--affected-high-risk-repeat') {
      options.affectedHighRiskRepeat = readIntegerOption(readArg(argv, index, arg), arg, { min: 1, max: 20 });
      index += 1;
    } else if (arg.startsWith('--affected-high-risk-repeat=')) {
      options.affectedHighRiskRepeat = readIntegerOption(arg.slice('--affected-high-risk-repeat='.length), '--affected-high-risk-repeat', { min: 1, max: 20 });
    } else if (arg === '--browser-executable') {
      options.browserExecutablePath = readArg(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--browser-executable=')) {
      options.browserExecutablePath = arg.slice('--browser-executable='.length);
    } else if (arg === '--only') {
      options.onlySuites.push(...readArg(argv, index, arg).split(','));
      index += 1;
    } else if (arg.startsWith('--only=')) {
      options.onlySuites.push(...arg.slice('--only='.length).split(','));
    } else if (arg === '--risk') {
      options.onlyRisks.push(...readArg(argv, index, arg).split(','));
      index += 1;
    } else if (arg.startsWith('--risk=')) {
      options.onlyRisks.push(...arg.slice('--risk='.length).split(','));
    } else if (arg === '--shard') {
      options.shard = parseShard(readArg(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--shard=')) {
      options.shard = parseShard(arg.slice('--shard='.length));
    } else if (arg === '--suite-costs') {
      options.suiteCostsPath = readArg(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--suite-costs=')) {
      options.suiteCostsPath = arg.slice('--suite-costs='.length);
    } else if (arg === '--repeat-each') {
      options.repeatEach = readIntegerOption(readArg(argv, index, arg), arg, { min: 1, max: 100 });
      index += 1;
    } else if (arg.startsWith('--repeat-each=')) {
      options.repeatEach = readIntegerOption(arg.slice('--repeat-each='.length), '--repeat-each', { min: 1, max: 100 });
    } else if (arg === '--retry-failures') {
      options.retryFailures = readIntegerOption(readArg(argv, index, arg), arg, { min: 0, max: 10 });
      index += 1;
    } else if (arg.startsWith('--retry-failures=')) {
      options.retryFailures = readIntegerOption(arg.slice('--retry-failures='.length), '--retry-failures', { min: 0, max: 10 });
    } else if (arg === '--retry-infrastructure') {
      options.retryInfrastructure = readIntegerOption(readArg(argv, index, arg), arg, { min: 0, max: 10 });
      index += 1;
    } else if (arg.startsWith('--retry-infrastructure=')) {
      options.retryInfrastructure = readIntegerOption(arg.slice('--retry-infrastructure='.length), '--retry-infrastructure', { min: 0, max: 10 });
    } else if (arg === '--artifacts-dir') {
      options.artifactsDir = readArg(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--artifacts-dir=')) {
      options.artifactsDir = arg.slice('--artifacts-dir='.length);
    } else {
      throw new Error(`unknown smoke option: ${arg}\n\n${usage()}`);
    }
  }

  options.baseUrl = options.baseUrl.replace(/\/$/, '');
  options.onlyRisks = options.onlyRisks.map((risk) => risk.trim()).filter(Boolean);
  const unknownRisks = options.onlyRisks.filter((risk) => !['low', 'normal', 'high'].includes(risk));
  if (unknownRisks.length) throw new Error(`unknown smoke risk level(s): ${unknownRisks.join(', ')}`);
  options.onlySuites = options.onlySuites.map((suite) => suite.trim()).filter(Boolean);
  return options;
}

const sampleBakers = [
  {
    address: SAMPLE_ADDRESS,
    alias: 'QA Baker',
    stakingBalance: 1200000000000,
    externalStakedBalance: 250000000000,
    externalDelegatedBalance: 180000000000,
    limitOfStakingOverBaking: 1000000,
    edgeOfBakingOverStaking: 100000000,
    numDelegators: 42,
    stakersCount: 12,
    stakedBalance: 700000000000,
    bakingPower: 950000000000,
    consensusAddress: 'tz4QaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQ',
    balance: 900000000000,
    software: { version: 'v25.0', date: '2026-06-16T11:58:56Z' },
    softwareUpdateTime: new Date(Date.now() - 3 * 86400000).toISOString()
  },
  {
    address: SAMPLE_ADDRESS_2,
    alias: 'Second Baker',
    stakingBalance: 900000000000,
    externalStakedBalance: 120000000000,
    externalDelegatedBalance: 220000000000,
    limitOfStakingOverBaking: 1000000,
    edgeOfBakingOverStaking: 150000000,
    numDelegators: 35,
    stakersCount: 9,
    stakedBalance: 500000000000,
    bakingPower: 650000000000,
    consensusAddress: null,
    balance: 600000000000,
    software: { version: 'v24.4', date: '2026-04-17T10:26:39Z' },
    softwareUpdateTime: new Date(Date.now() - 5 * 86400000).toISOString()
  },
  {
    address: SAMPLE_ADDRESS_3,
    alias: 'Pending Baker',
    stakingBalance: 700000000000,
    externalStakedBalance: 100000000000,
    externalDelegatedBalance: 110000000000,
    limitOfStakingOverBaking: 1000000,
    edgeOfBakingOverStaking: 0,
    numDelegators: 18,
    stakersCount: 6,
    stakedBalance: 420000000000,
    bakingPower: 420000000000,
    consensusAddress: null,
    balance: 500000000000,
    software: { version: 'v25.1', date: '2026-06-18T19:55:16Z' },
    softwareUpdateTime: new Date(Date.now() - 2 * 86400000).toISOString()
  }
];

function sampleWhaleWatchArtifact({ dormantDaysOffset = 0 } = {}) {
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const sameHashDistinctOperationIds = [7001, 7002];
  const sharedHash = 'opSmokeWhaleGroupedFlow111111111111111111111111111';
  const groupedOperations = [
    {
      id: sameHashDistinctOperationIds[0],
      hash: sharedHash,
      type: 'transaction',
      status: 'applied',
      timestamp: new Date(now - 20 * 60 * 1000).toISOString(),
      amountMutez: 125000000000,
      sender: SAMPLE_ADDRESS,
      senderAlias: 'QA Baker',
      target: SAMPLE_ADDRESS_2,
      targetAlias: 'Second Baker'
    },
    {
      id: sameHashDistinctOperationIds[1],
      hash: sharedHash,
      type: 'transaction',
      status: 'applied',
      timestamp: new Date(now - 20 * 60 * 1000).toISOString(),
      amountMutez: 75000000000,
      sender: SAMPLE_ADDRESS_2,
      senderAlias: 'Second Baker',
      target: SAMPLE_ADDRESS_3,
      targetAlias: 'Pending Baker'
    }
  ];
  const singleOperation = {
    id: 7003,
    hash: 'opSmokeWhaleSingleFlow1111111111111111111111111111',
    type: 'transaction',
    status: 'applied',
    timestamp: new Date(now - 35 * 60 * 1000).toISOString(),
    amountMutez: 10000000000,
    sender: SAMPLE_ADDRESS_3,
    senderAlias: 'Pending Baker',
    target: SAMPLE_ADDRESS,
    targetAlias: 'QA Baker'
  };
  const awakeningDormantDays = 900;
  const awakeningTimestamp = new Date(now - 3 * 60 * 60 * 1000).toISOString();
  const previousActivityTime = new Date(Date.parse(awakeningTimestamp) - awakeningDormantDays * 24 * 60 * 60 * 1000).toISOString();
  return {
    kind: 'tezos-whale-watch',
    version: 1,
    generatedAt,
    methodology: {
      minimumTransferXtz: 1000,
      minimumDormantBalanceXtz: 1000000,
      minimumDormantDays: 365,
      identity: 'TzKT operation id identifies one operation; operation-group hash groups related hops into a flow story.',
      dormancy: 'Dormancy uses TzKT lastActivityTime. lastActivity is retained only as a block-level receipt.',
      accountLanguage: 'Rows are large accounts, not presumed individual wallets.'
    },
    coverage: {
      largeAccounts: { complete: true, pages: 2, eligibleCount: 1002 },
      transfers24h: { complete: true, pages: 2, eligibleCount: 3 }
    },
    dormant: {
      eligibleCount: 1,
      eligibleBalanceMutez: 4500000000000,
      displayLimit: 100,
      records: [{
        address: 'KT1SmokeDormantAccount1111111111111111111',
        alias: 'Deep Vault',
        labelSource: 'tzkt-alias',
        accountType: 'contract',
        balanceMutez: 4500000000000,
        lastActivityLevel: 7654321,
        lastActivityTime: '2022-02-03T04:05:06.000Z',
        dormantDays: 1600
      }]
    },
    awakenings: [{
      id: 'op:7100',
      address: 'tz1SmokeAwakenedAccount111111111111111111',
      alias: 'Old Current',
      accountType: 'implicit-account',
      balanceBeforeMutez: 9000000000000,
      balanceAfterMutez: 8876544000000,
      previousActivityTime,
      dormantDays: awakeningDormantDays + dormantDaysOffset,
      awakenedAt: awakeningTimestamp,
      movedAmountMutez: 123456000000,
      receipt: {
        id: 7100,
        hash: 'opSmokeAwakeningReceipt111111111111111111111111',
        type: 'transaction',
        status: 'applied',
        timestamp: awakeningTimestamp,
        amountMutez: 123456000000,
        sender: 'tz1SmokeAwakenedAccount111111111111111111',
        senderAlias: 'Old Current',
        target: SAMPLE_ADDRESS,
        targetAlias: 'QA Baker'
      }
    }],
    transfers24h: {
      window: { since, until: generatedAt, hours: 24 },
      semantics: 'Gross observed tez transferred by applied transaction operations. This is not economic volume and can include related internal hops.',
      minimumXtz: 1000,
      complete: true,
      operationCount: 3,
      operationGroupCount: 2,
      uniqueSenders: 3,
      uniqueTargets: 3,
      grossObservedMutez: 210000000000,
      thresholds: [
        { thresholdXtz: 1000, operationCount: 3, operationGroupCount: 2, grossObservedMutez: 210000000000 },
        { thresholdXtz: 10000, operationCount: 3, operationGroupCount: 2, grossObservedMutez: 210000000000 },
        { thresholdXtz: 100000, operationCount: 1, operationGroupCount: 1, grossObservedMutez: 125000000000 },
        { thresholdXtz: 1000000, operationCount: 0, operationGroupCount: 0, grossObservedMutez: 0 }
      ],
      largestOperation: groupedOperations[0],
      topFlowStories: [
        {
          hash: sharedHash,
          timestamp: groupedOperations[0].timestamp,
          grossObservedMutez: 200000000000,
          operations: groupedOperations,
          operationCount: 2
        },
        {
          hash: singleOperation.hash,
          timestamp: singleOperation.timestamp,
          grossObservedMutez: singleOperation.amountMutez,
          operations: [singleOperation],
          operationCount: 1
        }
      ]
    },
    sources: [
      { label: 'TzKT large-account ledger', url: 'https://api.tzkt.io/v1/accounts', observedAt: generatedAt },
      { label: 'TzKT applied transaction ledger', url: 'https://api.tzkt.io/v1/operations/transactions', observedAt: generatedAt }
    ]
  };
}

const overdelegatedBaker = {
  address: OVERDELEGATED_ADDRESS,
  alias: 'Overdelegated Baker',
  active: true,
  balance: 65000000000,
  stakedBalance: 65000000000,
  stakingBalance: 695000000000,
  externalStakedBalance: 567000000000,
  externalDelegatedBalance: 630000000000,
  edgeOfBakingOverStaking: 100000000,
  numDelegators: 459,
  stakersCount: 128,
  bakingPower: 695000000000,
  consensusAddress: null,
  limitOfStakingOverBaking: 9000000,
  software: { version: 'v24.4', date: '2026-04-17T10:26:39Z' }
};

function sampleHistoryRows() {
  const now = Date.now();
  return Array.from({ length: 91 }, (_, index) => {
    const step = Math.round(1 + (index * 7 / 90));
    return {
      timestamp: new Date(now - (90 - index) * 24 * 60 * 60 * 1000).toISOString(),
      tz4_percentage: 40 + step,
      staking_ratio: 28 + step / 10,
      total_bakers: 220 + step,
      tz4_power_pct: 30 + step / 2,
      tz4_power_active: 90000000 + step * 1000000,
      tz4_power_total: 300000000 + step * 1000000,
      current_issuance_rate: 3.4 + step / 100,
      protocol_issuance_rate: 3.15 + step / 1000,
      lb_issuance_rate: step > 4 ? 0 : 0.25,
      lb_ema: 1000000000 + step * 10000000,
      lb_ema_pct: 50 + step / 3,
      lb_subsidy_disabled: true,
      total_supply: 1050000000 + step * 1000,
      total_staked: 320000000 + step * 100000,
      total_delegated: 330000000 + step * 100000,
      total_baking_power: 430000000 + step * 100000,
      staking_apy_stake: 8 + step / 10,
      staking_apy_delegate: 2.6 + step / 100,
      total_burned: 2200000 + step * 100,
      tx_volume_24h: 120000 + step * 100,
      contract_calls_24h: 9000 + step * 10,
      funded_accounts: 520000 + step * 100,
      new_accounts_24h: 800 + step,
      smart_contracts: 95000 + step,
      tokens: 140000 + step,
      rollups: 18 + step,
      active_contracts_24h: 1200 + step
    };
  });
}

function sampleDomainHistoryRows(table) {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, index) => {
    const step = index + 1;
    const timestamp = new Date(now - (8 - step) * 24 * 60 * 60 * 1000).toISOString();
    if (table === 'market_history') {
      return {
        timestamp,
        source: 'coingecko',
        price_usd: 0.22 + step / 1000,
        price_eur: 0.2 + step / 1200,
        price_btc: 0.0000035 + step / 100000000,
        price_sats: 350 + step,
        market_cap_usd: 240000000 + step * 1000000,
        volume_24h_usd: 9000000 + step * 100000,
        change_24h_pct: -2 + step / 10
      };
    }
    if (table === 'network_health_history') {
      return {
        timestamp,
        head_level: 13600000 + step,
        head_timestamp: timestamp,
        sample_blocks: 16,
        health_score: 99 + step / 20,
        total_attestation_power: 111000 + step,
        total_committee_power: 112000,
        missing_attestation_power: 1000 - step,
        avg_block_seconds: 6,
        max_block_seconds: 7,
        on_target_blocks: 15,
        round_zero_pct: 99 + step / 10,
        max_round: step % 2,
        missed_blocks: step % 3,
        missed_attestation_slots: 100 - step,
        missed_attestation_rights: 10 + step
      };
    }
    if (table === 'tezosx_history') {
      return {
        timestamp,
        tvl_usd: 16000000 + step * 100000,
        tezos_l1_tvl_usd: 22000000 + step * 100000,
        tvl_share_pct: 42 + step / 3,
        transactions_24h: 300000 + step * 1000,
        total_transactions: 80000000 + step * 10000,
        total_addresses: 1500000 + step * 1000,
        active_addresses: 12000 + step * 100,
        gas_gwei: 1.5,
        average_block_time_ms: 680,
        explorer_head: 45000000 + step,
        rpc_head: 45000010 + step,
        top_protocol_tvl_usd: 9000000 + step * 10000
      };
    }
    return {
      timestamp,
      head_level: 13600000 + step,
      epoch: 90,
      period_index: 176,
      period_kind: 'cooldown',
      period_status: 'quiet',
      proposal: 'PsSmokeHistoryDigest1234567890abcdef',
      participation_pct: null,
      quorum_pct: 45,
      supermajority_pct: null,
      yay_power: 0,
      nay_power: 0,
      pass_power: 0,
      voting_power_voted: 0,
      voters_voted: 0,
      voters_total: 220,
      period_start: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      period_end: new Date(now + 24 * 60 * 60 * 1000).toISOString()
    };
  });
}

const SPARKLINE_LATEST_EXPECTATIONS = [
  ['Total Bakers', 'bakers-sparkline', 'totalBakers'],
  ['tz4 Adoption', 'tz4-sparkline', 'tz4Percentage'],
  ['Staking Ratio', 'staking-sparkline', 'stakingRatio'],
  ['Issuance Rate', 'issuance-sparkline', 'currentIssuanceRate'],
  ['Total Supply', 'supply-sparkline', 'totalSupply'],
  ['TX Volume', 'tx-volume-sparkline', 'transactionVolume24h'],
  ['Contract Calls', 'contract-calls-sparkline', 'contractCalls24h'],
  ['Funded Accounts', 'funded-accounts-sparkline', 'fundedAccounts'],
  ['New Accounts', 'new-accounts-sparkline', 'newAccounts24h'],
  ['Smart Contracts', 'smart-contracts-sparkline', 'smartContracts'],
  ['Tokens', 'tokens-sparkline', 'tokens'],
  ['Rollups', 'rollups-sparkline', 'rollups'],
  ['Active Contracts', 'active-contracts-sparkline', 'activeContracts24h']
];

async function assertAllSparklineLatestValues(page, label) {
  // These legacy sections are hidden on today's home page. Reveal the fixtures
  // before checking their chart values; hidden charts intentionally stay lazy.
  const sectionStyles = await page.evaluate(async () => {
    const sections = Array.from(document.querySelectorAll('.tezos-stats-section'));
    const styles = sections.map(section => [section.id, section.getAttribute('style')]);
    sections.forEach(section => { section.style.display = 'block'; });
    const { ASSET_VERSION } = await import('/js/core/asset-version.js');
    const history = await import(`/js/features/history.js?v=${ASSET_VERSION}`);
    await history.updateSparklines();
    return styles;
  });
  await page.waitForFunction((expectations) => {
    const stats = window.__smokeLatestStats
      || JSON.parse(localStorage.getItem('tezos-systems-stats') || 'null');
    if (!stats) return false;

    return expectations.every(([, canvasId, statKey]) => {
      const expected = Number(stats[statKey]);
      const canvas = document.getElementById(canvasId);
      const chart = canvas ? window.Chart?.getChart(canvas) : null;
      const values = chart?.data?.datasets?.[0]?.data || [];
      const actual = Number(values.at(-1));
      return Number.isFinite(expected) && chart && values.length >= 2 && Number.isFinite(actual) && Math.abs(actual - expected) <= 0.01;
    });
  }, SPARKLINE_LATEST_EXPECTATIONS, { timeout: 10000 }).catch(() => {});

  const state = await page.evaluate((expectations) => {
    const stats = window.__smokeLatestStats
      || JSON.parse(localStorage.getItem('tezos-systems-stats') || 'null');
    if (!stats) return { ready: false, missingStats: true, mismatches: [] };

    const mismatches = [];
    for (const [metricLabel, canvasId, statKey] of expectations) {
      const expected = Number(stats[statKey]);
      const canvas = document.getElementById(canvasId);
      const chart = canvas ? window.Chart?.getChart(canvas) : null;
      const values = chart?.data?.datasets?.[0]?.data || [];
      const actual = Number(values.at(-1));

      if (!Number.isFinite(expected) || !chart || values.length < 2 || !Number.isFinite(actual) || Math.abs(actual - expected) > 0.01) {
        mismatches.push({
          label: metricLabel,
          canvasId,
          statKey,
          expected,
          actual,
          points: values.length
        });
      }
    }

    return { ready: mismatches.length === 0, missingStats: false, mismatches };
  }, SPARKLINE_LATEST_EXPECTATIONS);
  assert(state.ready, `${label}: sparkline latest values must match live card stats:\n${JSON.stringify(state.mismatches, null, 2)}`);
  await page.evaluate(styles => {
    for (const [id, style] of styles) {
      const section = document.getElementById(id);
      if (style === null) section.removeAttribute('style');
      else section.setAttribute('style', style);
    }
  }, sectionStyles);
}

function fulfillJson(route, data) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data)
  });
}

function fulfillText(route, body, contentType = 'text/plain') {
  return route.fulfill({ status: 200, contentType, body });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pageRows(total, offset, limit, makeRow) {
  const start = Math.max(0, Number(offset) || 0);
  const count = Math.max(0, Number(limit) || 0);
  if (count === 0 || start >= total) return [];
  const end = Math.min(total, start + count);
  return Array.from({ length: end - start }, (_, index) => makeRow(start + index));
}

function smokeHeldToken(index) {
  const isHighSupply = index === 1;
  return {
    last_incremented_at: new Date(Date.now() - index * 60000).toISOString(),
    quantity: isHighSupply ? '13635916737' : 1,
    token: {
      token_id: String(7000 + index),
      fa_contract: 'KT1SmokeSmokeSmokeSmokeSmokeSmoke12345',
      name: isHighSupply ? 'Smoke High Supply' : `Smoke Piece ${index + 1}`,
      thumbnail_uri: 'ipfs://smoke-hen-image',
      pk: index + 1,
      supply: isHighSupply ? '13635916737' : 10,
      fa: { name: 'Smoke Collection', contract: 'KT1SmokeSmokeSmokeSmokeSmokeSmoke12345', logo: 'ipfs://smoke-hen-image' },
      lowest_ask: index === 0 ? 1000000 : 0
    }
  };
}

function smokeCreatedToken(index) {
  return {
    token_pk: index + 1,
    token: {
      name: `Smoke Piece ${index + 1}`,
      supply: 10,
      pk: index + 1,
      fa: { name: 'Smoke Collection', contract: 'KT1SmokeSmokeSmokeSmokeSmokeSmoke12345', logo: 'ipfs://smoke-hen-image' },
      lowest_ask: index === 0 ? 1000000 : 0,
      listing_sales: index === 0 ? [{ price_xtz: 2500000, timestamp: new Date().toISOString() }] : []
    }
  };
}

function smokeHenModeTokens(postData = '') {
  const henContract = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
  let query = postData;
  try {
    query = JSON.parse(postData || '{}').query || postData;
  } catch {}
  const allSources = query.includes('_or:');
  const teiaOnly = !allSources && query.includes(`fa_contract: {_eq: "${henContract}"}`);
  const objktOnly = !allSources && query.includes(`fa_contract: {_neq: "${henContract}"}`);
  const priceMaxMatch = query.match(/lowest_ask:\s*\{_gt:\s*"0",\s*_lte:\s*"(\d+)"/);
  const listedOnly = /lowest_ask:\s*\{_gt:\s*"0"\s*\}/.test(query);
  const supplyMaxMatch = query.match(/supply:\s*\{_lte:\s*"(\d+)"/);
  const searchMatch = query.match(/name:\s*\{_ilike:\s*"%([^"]+)%"/);
  const priceMax = priceMaxMatch ? Number(priceMaxMatch[1]) : null;
  const supplyMax = supplyMaxMatch ? Number(supplyMaxMatch[1]) : null;
  const searchTerm = searchMatch ? searchMatch[1].toLowerCase() : '';
  const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const retryImage = 'ipfs://smoke-hen-image';
  const rows = query.includes('timestamp: {_gt:')
    ? [
      {
        token_id: '900001',
        fa_contract: henContract,
        name: 'Fresh Teia Smoke Mint',
        timestamp: new Date(Date.now() + 1000).toISOString(),
        mime: 'image/png',
        supply: '5',
        lowest_ask: 1500000,
        display_uri: retryImage,
        thumbnail_uri: retryImage,
        creators: [{ creator_address: SAMPLE_ADDRESS }],
        fa: { name: 'hic et nunc', logo: retryImage },
        holders: [{ holder_address: SAMPLE_ADDRESS, quantity: '1' }, { holder_address: SAMPLE_ADDRESS_2, quantity: '1' }],
        listings_active: [{ amount: '2', amount_left: '1', price_xtz: 1500000, timestamp: new Date().toISOString() }],
        listing_sales: [{ price_xtz: 1000000, timestamp: new Date(Date.now() - 120000).toISOString() }]
      }
    ]
    : [
    {
      token_id: '881518',
      fa_contract: henContract,
      name: 'Teia Smoke Mint',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      mime: 'image/png',
      supply: '12',
      lowest_ask: 1200000,
      display_uri: retryImage,
      thumbnail_uri: retryImage,
      creators: [{ creator_address: SAMPLE_ADDRESS }],
      fa: { name: 'hic et nunc', logo: retryImage },
      holders: [{ holder_address: SAMPLE_ADDRESS, quantity: '1' }, { holder_address: SAMPLE_ADDRESS_2, quantity: '1' }],
      listings_active: [{ amount: '3', amount_left: '2', price_xtz: 1200000, timestamp: new Date().toISOString() }],
      listing_sales: [{ price_xtz: 900000, timestamp: new Date(Date.now() - 120000).toISOString() }]
    },
    {
      token_id: '42',
      fa_contract: 'KT1ObjktSmokeSmokeSmokeSmokeSmoke12345',
      name: 'OBJKT Smoke Mint',
      timestamp: new Date(Date.now() - 30000).toISOString(),
      mime: 'image/png',
      supply: '3',
      lowest_ask: 3000000,
      display_uri: pixel,
      thumbnail_uri: pixel,
      creators: [{ creator_address: SAMPLE_ADDRESS_2 }],
      fa: { name: 'Smoke OBJKT Collection', logo: pixel },
      holders: [{ holder_address: SAMPLE_ADDRESS_2, quantity: '1' }],
      listings_active: [{ amount: '1', amount_left: '1', price_xtz: 3000000, timestamp: new Date().toISOString() }],
      listing_sales: [{ price_xtz: 2500000, timestamp: new Date(Date.now() - 180000).toISOString() }]
    }
  ];
  let scopedRows = rows;
  if (teiaOnly) scopedRows = scopedRows.filter((token) => token.fa_contract === henContract);
  if (objktOnly) scopedRows = scopedRows.filter((token) => token.fa_contract !== henContract);
  if (priceMax) scopedRows = scopedRows.filter((token) => Number(token.lowest_ask) > 0 && Number(token.lowest_ask) <= priceMax);
  else if (listedOnly) scopedRows = scopedRows.filter((token) => Number(token.lowest_ask) > 0);
  if (supplyMax) scopedRows = scopedRows.filter((token) => Number(token.supply) <= supplyMax);
  if (searchTerm) scopedRows = scopedRows.filter((token) => token.name.toLowerCase().includes(searchTerm));
  return scopedRows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function isoFrom(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

function sampleTeztaleBlock(level) {
  const offset = 12345678 - level;
  const timestampMs = Date.now() - 90000 - offset * 6000;
  const blockHash = `BMTeztaleSmoke${level}`;
  const successorHash = `BKTeztaleSuccessor${level}`;
  const round = level === 12345675 ? 1 : 0;
  const missingBlocks = level === 12345676
    ? [{ baking_right: { delegate: SAMPLE_ADDRESS_2, round: 0 }, sources: ['NL-vigie-mainnet-gcp'] }]
    : [];

  const baseBlock = {
    cycle_info: { cycle: 1143, cycle_position: 3000 + offset, cycle_size: 10800 },
    blocks: [{
      hash: blockHash,
      predecessor: `BMTeztalePrev${level}`,
      delegate: offset % 2 === 0 ? SAMPLE_ADDRESS : SAMPLE_ADDRESS_2,
      round,
      reception_times: [
        { source: 'NL-vigie-mainnet-gcp', validation: isoFrom(timestampMs, 900 + offset * 20), application: isoFrom(timestampMs, 1050 + offset * 20) },
        { source: 'NL-vigie-mainnet-full-gcp', validation: isoFrom(timestampMs, 1120 + offset * 20), application: isoFrom(timestampMs, 1260 + offset * 20) },
        { source: 'TF-North-America', validation: isoFrom(timestampMs, 1480 + offset * 20), application: isoFrom(timestampMs, 1630 + offset * 20) }
      ],
      timestamp: isoFrom(timestampMs, 0)
    }],
    missing_blocks: missingBlocks
  };

  if (level === 12345678) return baseBlock;

  return {
    ...baseBlock,
    endorsements: [
      {
        delegate: SAMPLE_ADDRESS,
        endorsing_power: 3500,
        operations: [
          {
            kind: 'Preendorsement',
            round,
            received_in_mempools: [
              { source: 'NL-vigie-mainnet-gcp', reception_time: isoFrom(timestampMs, 1200 + offset * 15) },
              { source: 'TF-North-America', reception_time: isoFrom(timestampMs, 1450 + offset * 15) }
            ]
          },
          {
            round,
            received_in_mempools: [
              { source: 'NL-vigie-mainnet-gcp', reception_time: isoFrom(timestampMs, 2400 + offset * 20) },
              { source: 'TF-North-America', reception_time: isoFrom(timestampMs, 2650 + offset * 20) }
            ],
            included_in_blocks: [successorHash]
          }
        ]
      },
      {
        delegate: SAMPLE_ADDRESS_2,
        endorsing_power: 2500,
        operations: [
          {
            kind: 'Preendorsement',
            round,
            received_in_mempools: [
              { source: 'NL-vigie-mainnet-gcp', reception_time: isoFrom(timestampMs, 1800 + offset * 18) }
            ]
          },
          {
            round,
            received_in_mempools: [
              { source: 'NL-vigie-mainnet-gcp', reception_time: isoFrom(timestampMs, 3100 + offset * 22) }
            ]
          }
        ]
      },
      {
        delegate: 'tz1HeldTeztaleSmoke1111111111111111111',
        endorsing_power: 700,
        operations: [
          {
            kind: 'Preendorsement',
            round,
            received_in_mempools: [
              { source: 'NL-vigie-mainnet-full-gcp', reception_time: isoFrom(timestampMs, 2100 + offset * 20) }
            ]
          },
          {
            round,
            received_in_mempools: [
              { source: 'NL-vigie-mainnet-full-gcp', reception_time: isoFrom(timestampMs, 3600 + offset * 22) }
            ],
            included_in_blocks: [successorHash]
          }
        ]
      },
      {
        delegate: 'tz1SilentTeztaleSmoke11111111111111111',
        endorsing_power: 300,
        operations: []
      }
    ]
  };
}

function sampleTezosDomainsGraphql(forwardDomainAddress = SAMPLE_ADDRESS, forwardDomainOwner = SAMPLE_ADDRESS) {
  const now = Date.now();
  const blockTimestamp = new Date(now - 4 * 60 * 1000).toISOString();
  const recent = (offset, item) => ({
    sourceAddress: item.sourceAddress || SAMPLE_ADDRESS,
    sourceAddressReverseRecord: { domain: { name: item.sourceName || 'qa-baker.tez' } },
    block: { level: 13842150 - offset, timestamp: new Date(now - offset * 12 * 60 * 1000).toISOString() },
    ...item
  });
  const auction = (domainName, amount, state = 'IN_PROGRESS') => ({
    domainName,
    state,
    bidCount: 3,
    countOfUniqueBidders: 2,
    bidAmountSum: amount,
    endsAtUtc: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
    operationGroupHash: `oo${domainName.replace(/[^a-z0-9]/gi, '')}auction`,
    highestBid: {
      amount,
      bidder: SAMPLE_ADDRESS_2,
      bidderReverseRecord: { domain: { name: 'second-baker.tez' } },
      timestamp: new Date(now - 45 * 60 * 1000).toISOString()
    }
  });
  const offer = (domainName, price, actorKey = 'seller') => ({
    domain: { name: domainName, owner: SAMPLE_ADDRESS },
    state: 'ACTIVE',
    price,
    priceWithoutFee: String(Math.floor(Number(price) * 0.975)),
    createdAtUtc: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAtUtc: new Date(now + 45 * 24 * 60 * 60 * 1000).toISOString(),
    operationGroupHash: `oo${domainName.replace(/[^a-z0-9]/gi, '')}offer`,
    [`${actorKey}Address`]: actorKey === 'buyer' ? SAMPLE_ADDRESS_2 : SAMPLE_ADDRESS,
    [`${actorKey}AddressReverseRecord`]: { domain: { name: actorKey === 'buyer' ? 'second-baker.tez' : 'qa-baker.tez' } }
  });
  const recentEvents = [
    recent(1, {
      __typename: 'DomainBuyEvent',
      id: 'DomainBuyEvent:smoke-1',
      type: 'DOMAIN_BUY_EVENT',
      domainName: 'viral.tez',
      price: '6000000',
      durationInDays: 730,
      domainOwnerAddress: SAMPLE_ADDRESS,
      operationGroupHash: 'ooDomainBuySmoke111'
    }),
    recent(2, {
      __typename: 'DomainRenewEvent',
      id: 'DomainRenewEvent:smoke-2',
      type: 'DOMAIN_RENEW_EVENT',
      domainName: 'builder.tez',
      price: '15000000',
      durationInDays: 1825,
      operationGroupHash: 'ooDomainRenewSmoke222',
      sourceName: 'builder.tez'
    }),
    recent(3, {
      __typename: 'OfferPlacedEvent',
      id: 'OfferPlacedEvent:smoke-3',
      type: 'OFFER_PLACED_EVENT',
      domainName: 'market.tez',
      price: '25000000',
      priceWithoutFee: '24375000',
      expiresAtUtc: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      tokenId: 12345,
      operationGroupHash: 'ooOfferPlacedSmoke333'
    }),
    recent(4, {
      __typename: 'DomainTransferEvent',
      id: 'DomainTransferEvent:smoke-4',
      type: 'DOMAIN_TRANSFER_EVENT',
      domainName: 'identity.tez',
      newOwner: SAMPLE_ADDRESS_2,
      newOwnerReverseRecord: { domain: { name: 'second-baker.tez' } },
      operationGroupHash: 'ooDomainTransferSmoke444'
    }),
    recent(5, {
      __typename: 'AuctionBidEvent',
      id: 'AuctionBidEvent:smoke-5',
      type: 'AUCTION_BID_EVENT',
      domainName: 'auction.tez',
      bidAmount: '12000000',
      previousBidAmount: '9000000',
      previousBidderAddress: SAMPLE_ADDRESS,
      transactionAmount: '3000000',
      operationGroupHash: 'ooAuctionBidSmoke555'
    }),
    recent(6, {
      __typename: 'ReverseRecordClaimEvent',
      id: 'ReverseRecordClaimEvent:smoke-6',
      type: 'REVERSE_RECORD_CLAIM_EVENT',
      sourceName: 'alias.tez'
    })
  ];

  return {
    data: {
      domain: { address: forwardDomainAddress, owner: forwardDomainOwner },
      reverseRecord: { domain: { name: 'qa-baker.tez' } },
      block: { level: 13842155, timestamp: blockTimestamp },
      registrations24h: { totalCount: 7 },
      renewals24h: { totalCount: 4 },
      transfers24h: { totalCount: 2 },
      subdomains24h: { totalCount: 1 },
      reverseRecords24h: { totalCount: 6 },
      marketplace7d: { totalCount: 9 },
      registrations7d: { totalCount: 31 },
      recentEvents: { totalCount: 710000, items: recentEvents },
      highValueRecent: { totalCount: 42, items: recentEvents.slice(0, 3) },
      liveAuctions: { totalCount: 4, items: [auction('auction.tez', '12000000'), auction('rare.tez', '8000000')] },
      settlementAuctions: { totalCount: 2, items: [auction('settle.tez', '5000000', 'CAN_BE_SETTLED')] },
      sellOffers: { totalCount: 711, items: [offer('market.tez', '25000000'), offer('signal.tez', '12000000')] },
      buyOffers: { totalCount: 3, items: [offer('baking.tez', '3382500', 'buyer'), offer('pizza.tez', '1025000', 'buyer')] },
      expiringSoon: {
        totalCount: 18,
        items: [
          { name: 'noob.tez', expiresAtUtc: new Date(now + 2 * 60 * 60 * 1000).toISOString(), owner: SAMPLE_ADDRESS, ownerReverseRecord: { domain: { name: 'qa-baker.tez' } }, address: SAMPLE_ADDRESS, tokenId: 93338 },
          { name: 'renewme.tez', expiresAtUtc: new Date(now + 8 * 60 * 60 * 1000).toISOString(), owner: SAMPLE_ADDRESS_2, ownerReverseRecord: { domain: { name: 'second-baker.tez' } }, address: SAMPLE_ADDRESS_2, tokenId: 93339 }
        ]
      }
    }
  };
}

function sampleTezosDomainsNameLookup(name = 'viral.tez', forwardDomainAddress = SAMPLE_ADDRESS, forwardDomainOwner = SAMPLE_ADDRESS) {
  const now = Date.now();
  const blockTimestamp = new Date(now - 4 * 60 * 1000).toISOString();
  const available = /^freshfind\.tez$/i.test(name);
  const recent = (offset, item) => ({
    sourceAddress: item.sourceAddress || SAMPLE_ADDRESS,
    sourceAddressReverseRecord: { domain: { name: item.sourceName || 'qa-baker.tez' } },
    block: { level: 13842150 - offset, timestamp: new Date(now - offset * 12 * 60 * 1000).toISOString() },
    ...item
  });
  return {
    data: {
      block: { level: 13842155, timestamp: blockTimestamp },
      domain: available ? null : {
        name,
        address: forwardDomainAddress,
        owner: forwardDomainOwner,
        expiresAtUtc: new Date(now + 280 * 24 * 60 * 60 * 1000).toISOString(),
        level: 2,
        tokenId: 411,
        ownerReverseRecord: { domain: { name: 'qa-baker.tez' } },
        addressReverseRecord: { domain: { name } }
      },
      currentAuction: null,
      currentOffer: /^market\.tez$/i.test(name) ? {
        domain: { name, owner: forwardDomainOwner },
        state: 'ACTIVE',
        price: '25000000',
        priceWithoutFee: '24375000',
        createdAtUtc: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAtUtc: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
        sellerAddress: forwardDomainOwner,
        sellerAddressReverseRecord: { domain: { name: 'qa-baker.tez' } },
        operationGroupHash: 'ooLookupOfferSmoke999'
      } : null,
      buyOffers: {
        totalCount: available ? 0 : 1,
        items: available ? [] : [{
          domain: { name, owner: forwardDomainOwner },
          state: 'ACTIVE',
          price: '3382500',
          priceWithoutFee: '3300000',
          expiresAtUtc: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
          buyerAddress: SAMPLE_ADDRESS_2,
          buyerAddressReverseRecord: { domain: { name: 'second-baker.tez' } },
          operationGroupHash: 'ooLookupBuyOfferSmoke888'
        }]
      },
      recentEvents: {
        totalCount: available ? 0 : 2,
        items: available ? [] : [
          recent(1, {
            __typename: 'DomainBuyEvent',
            id: 'DomainBuyEvent:lookup-1',
            type: 'DOMAIN_BUY_EVENT',
            domainName: name,
            price: '6000000',
            durationInDays: 730,
            domainOwnerAddress: forwardDomainOwner,
            operationGroupHash: 'ooLookupDomainBuySmoke777'
          }),
          recent(2, {
            __typename: 'DomainRenewEvent',
            id: 'DomainRenewEvent:lookup-2',
            type: 'DOMAIN_RENEW_EVENT',
            domainName: name,
            price: '15000000',
            durationInDays: 1825,
            operationGroupHash: 'ooLookupDomainRenewSmoke666'
          })
        ]
      }
    }
  };
}

function sampleTeztaleBatch(first, last) {
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => {
    const level = first + index;
    return { level, data: sampleTeztaleBlock(level) };
  });
}

function sampleLedgerFlowSentRows() {
  return [
    {
      id: 9104,
      hash: 'opLedgerSentLarge111111111111111111111111111111',
      level: 12345670,
      timestamp: new Date(Date.now() - 36 * 60000).toISOString(),
      amount: 4200000000,
      status: 'applied',
      sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
      target: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }
    },
    {
      id: 9103,
      hash: 'opLedgerSentMedium11111111111111111111111111111',
      level: 12345612,
      timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
      amount: 650000000,
      status: 'applied',
      sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
      target: { address: SAMPLE_LEDGER_MARKET, alias: 'Smoke Market' }
    },
    {
      id: 9102,
      hash: 'opLedgerSentSmall111111111111111111111111111111',
      level: 12345590,
      timestamp: new Date(Date.now() - 7 * 3600000).toISOString(),
      amount: 25000000,
      status: 'applied',
      sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
      target: { address: SAMPLE_LEDGER_SMALL, alias: 'Dust Tester' }
    }
  ];
}

function sampleLedgerFlowReceivedRows() {
  return [
    {
      id: 9205,
      hash: 'opLedgerReceivedLarge11111111111111111111111111',
      level: 12345674,
      timestamp: new Date(Date.now() - 22 * 60000).toISOString(),
      amount: 1800000000,
      status: 'applied',
      sender: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
      target: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
    },
    {
      id: 9204,
      hash: 'opLedgerReceivedMedium1111111111111111111111111',
      level: 12345620,
      timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
      amount: 1900000000,
      status: 'applied',
      sender: { address: SAMPLE_LEDGER_MARKET, alias: 'Smoke Market' },
      target: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
    },
    {
      id: 9203,
      hash: 'opLedgerReceivedSmall11111111111111111111111111',
      level: 12345510,
      timestamp: new Date(Date.now() - 4 * 3600000).toISOString(),
      amount: 12000000,
      status: 'applied',
      sender: { address: SAMPLE_LEDGER_SMALL, alias: 'Dust Tester' },
      target: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
    }
  ];
}

function sampleLedgerFlowContractRows() {
  return [
    {
      id: 9302,
      hash: 'opLedgerContractSent1111111111111111111111111111',
      level: 12345650,
      timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
      amount: 300000000,
      status: 'applied',
      sender: { address: SAMPLE_CONTRACT, alias: 'Smoke Contract' },
      target: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
    },
    {
      id: 9301,
      hash: 'opLedgerContractReceived111111111111111111111111',
      level: 12345600,
      timestamp: new Date(Date.now() - 80 * 60000).toISOString(),
      amount: 800000000,
      status: 'applied',
      sender: { address: SAMPLE_ADDRESS_2, alias: 'First Contract Buyer' },
      target: { address: SAMPLE_CONTRACT, alias: 'Smoke Contract' }
    }
  ];
}

let ledgerFlowSampleRows;

function sampleLedgerFlowLargestRows() {
  if (ledgerFlowSampleRows) return ledgerFlowSampleRows;
  const counterparties = [
    { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
    { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
    { address: SAMPLE_LEDGER_MARKET, alias: 'Smoke Market' }
  ];
  ledgerFlowSampleRows = Array.from({ length: 10000 }, (_, index) => {
    const counterparty = counterparties[index % counterparties.length];
    const received = index % 2 === 0;
    return {
      id: 50000 - index,
      hash: `opLedgerLargestSample${String(index).padStart(5, '0')}111111111111111111`,
      level: 12350000 - index,
      timestamp: new Date(Date.now() - (index + 1) * 1000).toISOString(),
      amount: 50000000000 - index * 1000000,
      status: 'applied',
      sender: received ? counterparty : { address: SAMPLE_IDLE_ADDRESS, alias: 'Idle Account' },
      target: received ? { address: SAMPLE_IDLE_ADDRESS, alias: 'Idle Account' } : counterparty
    };
  });
  return ledgerFlowSampleRows;
}

function sampleLedgerFlowRows(address) {
  if (address === SAMPLE_ADDRESS) {
    return [...sampleLedgerFlowSentRows(), ...sampleLedgerFlowReceivedRows()]
      .sort((left, right) => right.id - left.id);
  }
  if (address === SAMPLE_CONTRACT) return sampleLedgerFlowContractRows();
  if (address === SAMPLE_IDLE_ADDRESS) return sampleLedgerFlowLargestRows();
  return [];
}

function sampleLedgerFlowFilteredRows(address, params) {
  const minimum = Number(params.get('amount.ge') || 0);
  return sampleLedgerFlowRows(address).filter((row) => Number(row.amount || 0) >= minimum);
}

function sampleLedgerFlowCount(address, params) {
  if (address === SAMPLE_IDLE_ADDRESS) return 20001;
  return sampleLedgerFlowFilteredRows(address, params).length;
}

function sampleLedgerFlowFirstRow(address) {
  const fixture = {
    [SAMPLE_ADDRESS]: {
      id: 8801,
      hash: 'opLedgerFirstFunding111111111111111111111111111',
      level: 458753,
      timestamp: '2019-05-30T00:00:00Z',
      amount: 1000000,
      status: 'applied',
      sender: { address: SAMPLE_LEDGER_ORIGIN, alias: 'Genesis Fund' },
      target: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
    },
    [SAMPLE_CONTRACT]: {
      id: 8802,
      hash: 'opLedgerContractFirstInbound111111111111111111111',
      level: 12000010,
      timestamp: '2025-01-03T00:00:00Z',
      amount: 800000000,
      status: 'applied',
      sender: { address: SAMPLE_ADDRESS_2, alias: 'First Contract Buyer' },
      target: { address: SAMPLE_CONTRACT, alias: 'Smoke Contract' }
    },
    [SAMPLE_IDLE_ADDRESS]: {
      id: 8803,
      hash: 'opLedgerSampleFirstInbound11111111111111111111111',
      level: 12000100,
      timestamp: '2026-06-01T00:00:00Z',
      amount: 1000000,
      status: 'applied',
      sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
      target: { address: SAMPLE_IDLE_ADDRESS, alias: 'Idle Account' }
    }
  }[address];
  return fixture ? [fixture] : [];
}

function sampleLedgerFlowOriginationRow(address) {
  if (address !== SAMPLE_CONTRACT) return [];
  return [{
    id: 7701,
    level: 11999900,
    timestamp: '2025-01-02T03:04:05Z',
    sender: { address: SAMPLE_LEDGER_ORIGIN, alias: 'Smoke Contract Originator' },
    originatedContract: { address: SAMPLE_CONTRACT, alias: 'Smoke Contract' },
    contractBalance: 7500000000,
    status: 'applied'
  }];
}

function createStakingChamberFixture() {
  const now = Date.now();
  const baker = { address: SAMPLE_STAKING_BAKER_ADDRESS, alias: 'Kraken Baker' };
  const largeStaker = { address: SAMPLE_LARGE_STAKER_ADDRESS, alias: null };
  const otherStaker = { address: SAMPLE_UNSTAKER_ADDRESS, alias: 'Unstake QA' };
  const rich = (id, action, amount, ageMs, staker = largeStaker) => ({
    id,
    level: 14000000 + id,
    hash: `opStakingSmoke${id}111111111111111111111111111`,
    timestamp: new Date(now - ageMs).toISOString(),
    status: 'applied',
    action,
    amount,
    staker,
    baker
  });
  const richRows = [
    { ...rich(50000, 'stake', 9_000_000_000, 8 * 60 * 1000), requestedAmount: Number.MAX_SAFE_INTEGER },
    rich(49999, 'stake', 10_000_000_000, 9 * 60 * 1000),
    rich(49998, 'stake', 25_500_000_000, 10 * 60 * 1000),
    rich(40000, 'stake', 50_000_000_000, 48 * 60 * 60 * 1000),
    { ...rich(70000, 'unstake', 7_000_000_000, 4 * 60 * 1000), requestedAmount: Number.MAX_SAFE_INTEGER },
    rich(69999, 'unstake', 10_000_000_000, 5 * 60 * 1000),
    rich(69998, 'unstake', 32_000_000_000, 6 * 60 * 1000),
    rich(60000, 'unstake', 20_000_000_000, 72 * 60 * 60 * 1000, otherStaker)
  ];
  const byId = new Map(richRows.map((row) => [row.id, row]));
  const pageFor = (action) => {
    const start = action === 'stake' ? 50000 : 70000;
    const latest = action === 'stake' ? richRows.slice(0, 3) : richRows.slice(4, 7);
    return Array.from({ length: 10_000 }, (_, index) => {
      if (index < latest.length) {
        const row = latest[index];
        return {
          id: row.id,
          timestamp: row.timestamp,
          amount: row.amount,
          ...(row.requestedAmount ? { requestedAmount: row.requestedAmount } : {})
        };
      }
      return {
        id: start - index,
        timestamp: new Date(now - (index + 20) * 60 * 1000).toISOString(),
        amount: 1_000_000
      };
    });
  };
  const firstPages = {
    stake: pageFor('stake'),
    unstake: pageFor('unstake')
  };
  const secondPages = {
    stake: [richRows[3]],
    unstake: [richRows[7]]
  };
  return { byId, firstPages, richRows, secondPages };
}

async function installStakingChamberMocks(page, requestLog) {
  const fixture = createStakingChamberFixture();
  await page.route('https://api.tzkt.io/v1/operations/staking**', async (route) => {
    const parsed = new URL(route.request().url());
    const params = parsed.searchParams;
    const action = params.get('action') || '';
    const cursor = params.get('offset.cr') || '';
    const afterId = params.get('id.gt') || '';
    const select = params.get('select') || '';
    const staker = params.get('staker') || '';
    const idIn = params.get('id.in') || '';
    const limit = Number(params.get('limit')) || 0;
    requestLog.push({ action, cursor, afterId, idIn, limit, select, staker });

    if (idIn) {
      return fulfillJson(route, idIn.split(',').map((id) => fixture.byId.get(Number(id))).filter(Boolean));
    }
    if (staker) {
        return fulfillJson(route, fixture.richRows.filter((row) => row.action === action && row.staker?.address === staker));
    }
    if (!['stake', 'unstake'].includes(action)) return fulfillJson(route, []);
    if (afterId) return fulfillJson(route, []);
    if (select.includes('hash')) return fulfillJson(route, fixture.firstPages[action].slice(0, 3));
    if (limit === 1000) return fulfillJson(route, fixture.firstPages[action].slice(0, 3));
    if (cursor) return fulfillJson(route, fixture.secondPages[action]);
    return fulfillJson(route, fixture.firstPages[action]);
  });
  return fixture;
}

async function installFeatureMocks(context, options = {}) {
  const funding = fundingFixtures();
  await context.route(/\/data\/community-funding-(teztree|ttcrowd|hacktez)(?:-preview)?\.json/, route => {
    const source = route.request().url().match(/community-funding-(teztree|ttcrowd|hacktez)/)[1];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().url().includes('-preview.json') ? buildFundingPreview(funding[source]) : funding[source]) });
  });
  const cycleMilestone = options.cycleMilestone && typeof options.cycleMilestone === 'object'
    ? options.cycleMilestone
    : null;
  let lbBlocksHead = 12345678;
  const blockHeadAutoAdvance = options.blockHeadAutoAdvance !== false;
  let rpcHeaderLevel = Number(cycleMilestone?.headLevel) || 12345678;
  let rpcHeaderTimestamp = Number(cycleMilestone?.headTimestamp) || Date.now();
  let rpcMetadataLevel = rpcHeaderLevel;
  let blockHeadLagMs = Number(options.blockHeadLagMs) || 0;
  const lbNoVoteChanges = Boolean(options.lbNoVoteChanges);
  const networkHealthBlocksDelayMs = Number(options.networkHealthBlocksDelayMs) || 0;
  const etherlinkQuiet = Boolean(options.etherlinkQuiet);
  const etherlinkNullProposal = Boolean(options.etherlinkNullProposal);
  const etherlinkPromotionFailure = Boolean(options.etherlinkPromotionFailure);
  const etherlinkPromotion = Boolean(options.etherlinkPromotion) || etherlinkPromotionFailure;
  const governanceNoProposal = Boolean(options.governanceNoProposal);
  const governanceLiveVote = Boolean(options.governanceLiveVote);
  const governanceAdoptionPeriod = Boolean(options.governanceAdoptionPeriod);
  const leaderboardSignals = Boolean(options.leaderboardSignals);
  const bakerDirectoryPaged = Boolean(options.bakerDirectoryPaged);
  const historyStakerAddresses = new Set(options.historyStakerAddresses || []);
  const archivePrimaryFailure = Boolean(options.archivePrimaryFailure);
  const whaleChamberMocks = Boolean(options.whaleChamberMocks);
  const ledgerFlowMocks = Boolean(options.ledgerFlowMocks);
  const bakerPageOffsets = [];
  let whaleArtifactRequests = 0;
  let whaleLiveRequests = 0;
  let whaleFailureLane = '';
  let whaleDormancyMismatch = false;
  let bakerGovernanceFailure = false;
  let bakerGovernanceSignalRequests = 0;
  let bakerGovernanceHeavyRequests = 0;
  const whaleCursorRequests = [];
  const ledgerFlowRequests = [];
  const ledgerFlowTzktRequests = [];
  let ledgerFlowFailureTarget = '';
  let ledgerFlowDelayTarget = '';
  const signalBakers = leaderboardSignals
    ? sampleBakers.map((baker, index) => ({
        ...baker,
        firstActivityTime: [
          '2018-12-31T23:59:59Z',
          '2021-12-31T23:59:59Z',
          '2022-01-01T00:00:00Z'
        ][index] || '2024-01-01T00:00:00Z'
      }))
    : sampleBakers;
  const factualFitProfiles = [
    {
      alias: 'Paged Baker Community',
      stakedBalance: 500000000000,
      externalDelegatedBalance: 100000000000,
      numDelegators: 80,
      stakersCount: 20
    },
    {
      alias: 'Paged Baker Alpha Tie',
      stakedBalance: 800000000000,
      externalDelegatedBalance: 100000000000,
      numDelegators: 60,
      stakersCount: 20
    },
    {
      alias: 'Paged Baker Zulu Tie',
      stakedBalance: 800000000000,
      externalDelegatedBalance: 100000000000,
      numDelegators: 60,
      stakersCount: 20
    },
    {
      alias: 'Paged Baker Capacity',
      stakedBalance: 900000000000,
      externalDelegatedBalance: 100000000000,
      numDelegators: 15,
      stakersCount: 5
    },
    {
      alias: 'Paged Baker Over Capacity',
      stakedBalance: 100000000000,
      externalDelegatedBalance: 1350000000000,
      numDelegators: 12,
      stakersCount: 3
    }
  ];
  const pagedBakerTail = Array.from({ length: 499 }, (_, index) => ({
    ...sampleBakers[2],
    address: `tz1SmokePagedBaker${String(index + 1).padStart(4, '0').replace(/\d/g, digit => 'ABCDEFGHJK'[Number(digit)])}`.padEnd(36, 'x'),
    alias: `Paged Baker ${String(index + 1).padStart(4, '0')}`,
    stakingBalance: 690000000000 - index * 1000000,
    bakingPower: 410000000000 - index * 100000,
    numDelegators: 10 + (index % 50),
    stakersCount: 2 + (index % 12),
    firstActivityTime: '2024-01-01T00:00:00Z',
    ...(factualFitProfiles[index] || {})
  }));
  const leaderboardBakers = bakerDirectoryPaged
    ? [...signalBakers, ...pagedBakerTail]
    : signalBakers;
  const whaleLiveInitialRows = Array.from({ length: 28 }, (_, index) => ({
    id: 8000 - index,
    hash: index < 2
      ? 'opSmokeLiveGrouped1111111111111111111111111111111'
      : `opSmokeLive${String(index).padStart(3, '0')}111111111111111111111111111`,
    timestamp: new Date(Date.now() - (index + 1) * 60_000).toISOString(),
    amount: (2500 + index * 125) * 1e6,
    status: 'applied',
    sender: { address: index % 2 ? SAMPLE_ADDRESS_2 : SAMPLE_ADDRESS, alias: index % 2 ? 'Second Baker' : 'QA Baker' },
    target: { address: index % 3 ? SAMPLE_ADDRESS_3 : SAMPLE_ADDRESS_2, alias: index % 3 ? 'Pending Baker' : 'Second Baker' }
  }));
  const nullCycleTiming = Boolean(options.nullCycleTiming);
  const forwardDomainAddress = Object.prototype.hasOwnProperty.call(options, 'forwardDomainAddress')
    ? options.forwardDomainAddress
    : SAMPLE_ADDRESS;
  const forwardDomainOwner = options.forwardDomainOwner || SAMPLE_ADDRESS;
  const operatorAttestationSequence = Array.isArray(options.operatorAttestationSequence)
    ? options.operatorAttestationSequence
    : null;
  let operatorAttestationCalls = 0;
  const myTezosLiveRefresh = Boolean(options.myTezosLiveRefresh);
  const myTezosViewLiveRefresh = Boolean(options.myTezosViewLiveRefresh);
  const myTezosAccountDelayMs = Math.max(0, Number(options.myTezosAccountDelayMs) || 0);
  let myTezosActivityCycles = 0;
  let myTezosCollectionCycles = 0;
  let myTezosPortfolioCycles = 0;
  let myTezosXOverviewCycles = 0;
  let myTezosXTransactionCycles = 0;
  const isDrawerOpenForRequest = async (request) => {
    if (!myTezosLiveRefresh) return false;
    if (typeof options.myTezosLiveRefresh === 'function') return options.myTezosLiveRefresh();
    try {
      return await request.frame().evaluate(() => document.querySelector('#my-tezos-drawer')?.classList.contains('open') === true);
    } catch {
      return false;
    }
  };
  const sampleAddressAccount = async (request) => {
    const fresh = await isDrawerOpenForRequest(request);
    return {
      address: SAMPLE_ADDRESS,
      type: 'delegate',
      alias: 'QA Baker',
      active: true,
      balance: fresh ? 1750000000000 : 1500000000000,
      stakedBalance: fresh ? 725000000000 : 700000000000,
      delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true },
      firstActivity: 458753,
      firstActivityTime: '2019-05-30T00:00:00Z'
    };
  };
  const sampleAddressDelegate = async (request, baker) => {
    const fresh = await isDrawerOpenForRequest(request);
    return fresh ? {
      ...baker,
      stakingBalance: 1250000000000,
      externalStakedBalance: 280000000000,
      externalDelegatedBalance: 240000000000,
      stakedBalance: 725000000000,
      balance: 950000000000
    } : baker;
  };
  const dashboardHtml = options.dashboardHtml || '';
  const dashboardPathnames = new Set(options.dashboardPathnames || []);
  const dashboardOrigin = options.baseUrl ? new URL(options.baseUrl).origin : '';
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const postData = request.postData() || '';
    const parsedUrl = new URL(url);
    if (process.env.SMOKE_NETWORK_DEBUG === '1' && parsedUrl.origin !== dashboardOrigin) {
      log(`network mock saw ${request.method()} ${url}`);
    }

    if (parsedUrl.pathname.endsWith('/data/release-radar.json')) {
      return fulfillJson(route, {
        ...releaseRadarFixture,
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    if (parsedUrl.origin === 'https://api.tzkt.io'
      && parsedUrl.pathname === '/v1/operations/staking'
      && parsedUrl.searchParams.has('level')) {
      if (Number(parsedUrl.searchParams.get('level')) % 4 === 0) return fulfillJson(route, []);
      return fulfillJson(route, [{
        id: 120,
        hash: 'opHeartbeatStake',
        timestamp: new Date().toISOString(),
        action: 'stake',
        amount: 125000000,
        staker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
        baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
      }]);
    }

    if (parsedUrl.origin === 'https://api.tzkt.io'
      && parsedUrl.pathname === '/v1/tokens/transfers'
      && parsedUrl.searchParams.has('level')) {
      const level = Number(parsedUrl.searchParams.get('level'));
      if (level % 4 === 2) {
        return fulfillJson(route, [{
          id: 503,
          tokenId: 9003,
          standard: 'fa2',
          symbol: 'USDt',
          name: 'Tether USD',
          from: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
          to: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
          amount: '2500000',
          transactionId: 107
        }]);
      }
      if (level % 4 !== 1) return fulfillJson(route, []);
      return fulfillJson(route, [
        {
          id: 501,
          tokenId: 9001,
          name: 'Smoke Piece One',
          from: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
          to: { address: SAMPLE_ADDRESS_3, alias: 'Pending Baker' },
          amount: '1',
          transactionId: 105
        },
        {
          id: 502,
          tokenId: 9002,
          name: 'Smoke Piece Two',
          from: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
          to: { address: SAMPLE_ADDRESS_3, alias: 'Pending Baker' },
          amount: '1',
          transactionId: 105
        }
      ]);
    }

    if (parsedUrl.origin === 'https://api.tzkt.io'
      && parsedUrl.pathname === '/v1/operations/delegations'
      && parsedUrl.searchParams.has('level')) {
      const level = Number(parsedUrl.searchParams.get('level'));
      return fulfillJson(route, level % 4 === 3 ? [{
        id: 601,
        hash: 'opHeartbeatDelegate',
        timestamp: new Date().toISOString(),
        sender: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
        prevDelegate: null,
        newDelegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
      }] : []);
    }

    if (parsedUrl.origin === 'https://api.tzkt.io'
      && parsedUrl.pathname === '/v1/operations/originations'
      && parsedUrl.searchParams.has('level')) {
      const level = Number(parsedUrl.searchParams.get('level'));
      return fulfillJson(route, level % 4 === 3 ? [{
        id: 602,
        hash: 'opHeartbeatOrigination',
        timestamp: new Date().toISOString(),
        sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
        initiator: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
        originatedContract: { address: 'KT1SmokeOriginated1111111111111111111', kind: 'smart_contract' }
      }] : []);
    }

    if (
      dashboardHtml &&
      parsedUrl.origin === dashboardOrigin &&
      dashboardPathnames.has(parsedUrl.pathname)
    ) {
      return fulfillText(route, dashboardHtml, 'text/html');
    }

    if (options.milestoneCatalog && parsedUrl.pathname.endsWith('/data/milestone-catalog.json')) {
      return fulfillJson(route, options.milestoneCatalog);
    }

    if (parsedUrl.origin === 'https://api.tzkt.io' && parsedUrl.pathname.includes('/v1/suggest/accounts/')) {
      await new Promise((resolve) => setTimeout(resolve, 220));
      const query = decodeURIComponent(parsedUrl.pathname.split('/v1/suggest/accounts/')[1] || '').toLowerCase();
      if (query.includes('quipu')) {
        return fulfillJson(route, [
          { address: SAMPLE_CONTRACT, alias: 'QuipuSwap Router' },
          { address: SAMPLE_ADDRESS, alias: 'Quipu community baker' }
        ]);
      }
      if (query.includes('govern')) {
        return fulfillJson(route, [{ address: SAMPLE_ADDRESS_2, alias: 'Governance Baker Alias' }]);
      }
      if (query.includes('frobnicate')) {
        return fulfillJson(route, [{ address: SAMPLE_ADDRESS, alias: 'Completely Unrelated Baker' }]);
      }
      return fulfillJson(route, []);
    }

    if (parsedUrl.origin === 'https://api.tzkt.io' && parsedUrl.pathname === `/v1/accounts/${SAMPLE_CONTRACT}`) {
      return fulfillJson(route, {
        address: SAMPLE_CONTRACT,
        alias: 'Smoke Contract',
        type: 'contract',
        balance: 123000000,
        numTransactions: 42,
        activeTokensCount: 3,
        eventsCount: 19,
        tokenTransfersCount: 27,
        firstActivity: 12000000,
        firstActivityTime: '2025-01-02T03:04:05Z'
      });
    }

    if (parsedUrl.origin === 'https://api.tzkt.io' && parsedUrl.pathname === `/v1/contracts/${SAMPLE_CONTRACT}/entrypoints`) {
      return fulfillJson(route, [
        { name: 'default', jsonParameters: { 'schema:unit': 'unit' }, unused: false },
        { name: 'swap', jsonParameters: { 'schema:object': { 'amount:nat': 'nat', 'receiver:address': 'address' } }, unused: false }
      ]);
    }

    if (parsedUrl.origin === 'https://api.tzkt.io' && parsedUrl.pathname === `/v1/contracts/${SAMPLE_CONTRACT}/same`) {
      return fulfillJson(route, [
        { address: SAMPLE_CONTRACT, alias: 'Smoke Contract', kind: 'smart_contract' },
        { address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton', alias: 'Related Smoke Deployment', kind: 'smart_contract' }
      ]);
    }

    if (parsedUrl.origin === 'https://api.tzkt.io' && parsedUrl.pathname === `/v1/contracts/${SAMPLE_CONTRACT}`) {
      return fulfillJson(route, {
        address: SAMPLE_CONTRACT,
        alias: 'Smoke Contract',
        kind: 'smart_contract',
        balance: 123000000,
        creator: { address: SAMPLE_ADDRESS, alias: 'Smoke Creator' },
        codeHash: 123456789,
        typeHash: 987654321,
        tzips: ['fa2'],
        activeTokensCount: 3,
        eventsCount: 19,
        tokenTransfersCount: 27,
        numTransactions: 42,
        firstActivity: 12000000,
        firstActivityTime: '2025-01-02T03:04:05Z'
      });
    }

    if (whaleChamberMocks && parsedUrl.pathname.endsWith('/data/whale-watch.json')) {
      whaleArtifactRequests += 1;
      return fulfillJson(route, sampleWhaleWatchArtifact({ dormantDaysOffset: whaleDormancyMismatch ? 1000 : 0 }));
    }

    if (leaderboardSignals && [
      '/data/maxis-careers.json',
      '/data/governance-votes.json'
    ].some((pathname) => parsedUrl.pathname.endsWith(pathname))
      && parsedUrl.searchParams.get('surface') === 'leaderboard') {
      bakerGovernanceHeavyRequests += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"unexpected heavy Baker governance request"}' });
    }

    if (leaderboardSignals && parsedUrl.pathname.endsWith('/data/baker-governance-signals.json')) {
      bakerGovernanceSignalRequests += 1;
      if (bakerGovernanceFailure) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"smoke Baker governance signals unavailable"}' });
      }
      const generatedAt = new Date().toISOString();
      const unsigned = {
        schema: 1,
        kind: 'baker-governance-signals',
        generatedAt,
        coverage: {
          status: 'complete',
          mode: 'source-active-delegate-governance-signal-projection',
          zeroSemantics: 'Zero-valued fields mean zero only for an address present in this frozen source cohort.',
          missingAddressSemantics: 'A missing address is outside the source active-delegate cohort, not proof of no governance history.'
        },
        sources: {
          careers: { generatedAt },
          governanceVotes: { generatedAt }
        },
        recordCount: 2,
        acceptedProposalCount: 2,
        records: {
          [SAMPLE_ADDRESS]: {
            address: SAMPLE_ADDRESS,
            lifetimeBallots: 34,
            currentBallotPeriodStreak: 12,
            longestBallotPeriodStreak: 18,
            acceptedProposals: [
              { hash: 'PsSmokeAcceptedOne111111111111111111111111111', name: 'Smoke One', epoch: 89 },
              { hash: 'PsSmokeAcceptedTwo222222222222222222222222222', name: 'Smoke Two', epoch: 90 }
            ]
          },
          [SAMPLE_ADDRESS_2]: {
            address: SAMPLE_ADDRESS_2,
            lifetimeBallots: 4,
            currentBallotPeriodStreak: 0,
            longestBallotPeriodStreak: 2,
            acceptedProposals: []
          }
        }
      };
      return fulfillJson(route, {
        ...unsigned,
        integrity: {
          algorithm: 'sha256-stable-json-v1',
          contentHash: stableTestHash(unsigned)
        }
      });
    }

    if (url.includes('html2canvas@1.4.1')) {
      return fulfillText(route, `
        window.html2canvas = async function(element, options = {}) {
          window.__lastHtml2CanvasText = String(element?.innerText || element?.textContent || '');
          const width = Number(options.width) || 600;
          const height = Number(options.height) || 630;
          window.__lastHtml2CanvasSize = { width, height };
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0a0e1a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#00ff88';
          ctx.fillRect(24, 24, 552, 12);
          return canvas;
        };
      `, 'application/javascript');
    }

    for (const table of ['market_history', 'network_health_history', 'tezosx_history', 'governance_period_history']) {
      if (url.includes(`iijpfczftroespicmufb.supabase.co/rest/v1/${table}`)) {
        return fulfillJson(route, sampleDomainHistoryRows(table));
      }
    }

    if (url.includes('iijpfczftroespicmufb.supabase.co/rest/v1/tezos_history')) {
      return fulfillJson(route, sampleHistoryRows());
    }

    if (url.includes('api.github.com/repos/Primate411/tezos.systems/commits/main')) {
      return fulfillJson(route, {
        sha: 'cafebabecafebabecafebabecafebabecafebabe',
        html_url: 'https://github.com/Primate411/tezos.systems/commit/cafebabe',
        commit: { committer: { date: '2026-06-07T00:00:00Z' } }
      });
    }

    if (url.includes('tezos-mainnet.octez.io') && url.includes('/context/delegates?active=true')) {
      const currentSet = [SAMPLE_ADDRESS, SAMPLE_ADDRESS_2, SAMPLE_DELEGATOR_ADDRESS];
      const baselineSet = [SAMPLE_IDLE_ADDRESS, SAMPLE_REGULAR_DELEGATOR_ADDRESS, SAMPLE_STAKER_ADDRESS];
      return fulfillJson(route, url.includes('/blocks/head/') ? currentSet : baselineSet);
    }

    if (url.includes('tezos-mainnet.octez.io') && url.includes('/helpers/baking_power_distribution_for_current_cycle')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          '300',
          [
            [{ delegate: SAMPLE_ADDRESS, consensus_pkh: 'tz4SmokeConsensus111111111111111111111' }, '110'],
            [{ delegate: SAMPLE_ADDRESS_2, consensus_pkh: 'tz4SmokeConsensus222222222222222222222' }, '100'],
            [{ delegate: SAMPLE_ADDRESS_3, consensus_pkh: 'tz4SmokeConsensus333333333333333333333' }, '90']
          ]
        ])
      });
    }

    if (url.includes('teztale-server-mainnet-ro-prd.octez.tech')) {
      const pathname = parsedUrl.pathname.replace(/^\/+/, '');
      if (pathname === 'head.json') {
        return fulfillJson(route, { level: 12345678 });
      }
      const rangeMatch = pathname.match(/^(\d+)-(\d+)\.json$/);
      if (rangeMatch) {
        return fulfillJson(route, sampleTeztaleBatch(Number(rangeMatch[1]), Number(rangeMatch[2])));
      }
      const blockMatch = pathname.match(/^(\d+)\.json$/);
      if (blockMatch) {
        return fulfillJson(route, sampleTeztaleBlock(Number(blockMatch[1])));
      }
      if (pathname.endsWith('/available.json')) return fulfillJson(route, []);
      if (pathname.endsWith('/missing.json')) return fulfillJson(route, []);
    }

    if (url.includes('api.tezos.domains/graphql')) {
      if (postData.includes('ReverseLookupBatch')) {
        const body = JSON.parse(postData || '{}');
        const reverseNames = new Map([
          [SAMPLE_ADDRESS, 'qa-baker.tez'],
          [SAMPLE_ADDRESS_2, 'second-baker.tez'],
          [SAMPLE_DELEGATOR_ADDRESS, 'three-weeks.tez'],
          [SAMPLE_IDLE_ADDRESS, 'retired-baker.tez']
        ]);
        const data = {};
        Object.entries(body.variables || {}).forEach(([key, address]) => {
          const index = key.match(/^address(\d+)$/)?.[1];
          if (index === undefined) return;
          const name = reverseNames.get(address) || null;
          data[`record${index}`] = name ? { domain: { name } } : null;
        });
        return fulfillJson(route, { data });
      }
      if (postData.includes('TezosDomainsNameLookup')) {
        const body = JSON.parse(postData || '{}');
        return fulfillJson(route, sampleTezosDomainsNameLookup(body.variables?.name || 'viral.tez', forwardDomainAddress, forwardDomainOwner));
      }
      return fulfillJson(route, sampleTezosDomainsGraphql(forwardDomainAddress, forwardDomainOwner));
    }

    if (url.includes('data.objkt.com/v3/graphql')) {
      if (postData.includes('HenViewerHoldings')) {
        return fulfillJson(route, {
          data: {
            holder: [{
              held_tokens: [{
                quantity: '1',
                token: {
                  token_id: '881518',
                  fa_contract: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton'
                }
              }]
            }]
          }
        });
      }
      if (postData.includes('MyTezosCollection')) {
        const body = JSON.parse(postData || '{}');
        const vars = body.variables || {};
        const addresses = Array.isArray(vars.addresses) ? vars.addresses : [];
        const offset = Number(vars.offset) || 0;
        const rowLimit = Number(vars.rowLimit) || 100;
        if (myTezosViewLiveRefresh && offset === 0) myTezosCollectionCycles += 1;
        const liveCollectionRows = myTezosViewLiveRefresh ? Math.max(0, myTezosCollectionCycles - 1) : 0;
        const primaryRows = addresses[0] ? Array.from({ length: 138 + liveCollectionRows }, (_, index) => {
          const flagged = index === 137;
          const shared = index === 0;
          const tokenId = shared ? '42' : flagged ? '99' : String(1000 + index);
          const contract = flagged
            ? 'KT1SmokeFlaggedCollection11111111111111'
            : 'KT1SmokeCollection1111111111111111111';
          return {
            holder_address: addresses[0],
            last_incremented_at: new Date(Date.now() - index * 60000).toISOString(),
            quantity: shared ? '2' : '1',
            token: {
              token_id: tokenId,
              fa_contract: contract,
              name: shared ? 'Shared Smoke Artifact' : flagged ? 'Flagged Smoke Asset' : `Collected Smoke Artifact ${index + 1}`,
              thumbnail_uri: flagged ? null : `ipfs://smoke-collection-image-${tokenId}`,
              pk: 4200 + index,
              supply: flagged ? '1' : '10',
              lowest_ask: shared ? '1250000' : null,
              flag: flagged,
              metadata_status: flagged ? 'failed' : 'processed',
              content_rating: flagged ? 'unsafe' : 'safe',
              fa: {
                name: flagged ? 'Flagged Collection' : 'Smoke Collection',
                contract,
                collection_id: flagged ? 'flagged-smoke' : 'smoke-collection',
                logo: null
              },
              creators: flagged ? [] : [{
                creator_address: SAMPLE_ADDRESS,
                holder: { address: SAMPLE_ADDRESS, alias: 'QA Artist', tzdomain: 'qa-artist.tez' }
              }]
            }
          };
        }) : [];
        const sharedSecond = addresses[1] ? {
          ...primaryRows[0],
          holder_address: addresses[1],
          last_incremented_at: new Date(Date.now() - 30000).toISOString(),
          quantity: '1'
        } : null;
        const allCollected = primaryRows.length
          ? [primaryRows[0], ...(sharedSecond ? [sharedSecond] : []), ...primaryRows.slice(1)]
          : [];
        const collected = pageRows(allCollected.length, offset, rowLimit, (index) => allCollected[index]);
        const created = offset > 0 || !addresses.includes(SAMPLE_ADDRESS) ? [] : [{
          creator_address: SAMPLE_ADDRESS,
          token_pk: 4201,
          token: {
            token_id: '7',
            fa_contract: 'KT1SmokeCreatedCollection11111111111111',
            name: 'Created Smoke Artifact',
            thumbnail_uri: null,
            pk: 4201,
            supply: '5',
            lowest_ask: null,
            flag: false,
            metadata_status: 'processed',
            content_rating: 'safe',
            fa: {
              name: 'QA Originals',
              contract: 'KT1SmokeCreatedCollection11111111111111',
              collection_id: 'qa-originals',
              logo: null
            },
            creators: [{
              creator_address: SAMPLE_ADDRESS,
              holder: { address: SAMPLE_ADDRESS, alias: 'QA Artist', tzdomain: 'qa-artist.tez' }
            }]
          }
        }];
        return fulfillJson(route, {
          data: {
            holder: addresses.map((address, index) => ({
              address,
              alias: index === 0 ? 'QA Artist' : 'Second Collector',
              tzdomain: index === 0 ? 'qa-artist.tez' : null,
              twitter: null,
              description: index === 0 ? 'Smoke collector and creator' : null,
              logo: null
            })),
            token_holder: collected,
            token_creator: created
          }
        });
      }
      if (postData.includes('holder(')) {
        const body = JSON.parse(postData || '{}');
        const vars = body.variables || {};
        return fulfillJson(route, {
          data: {
            holder: [{
              address: SAMPLE_ADDRESS,
              alias: 'QA Artist',
              tzdomain: 'qa-artist.tez',
              held_tokens: pageRows(501, vars.heldOffset, vars.heldLimit, smokeHeldToken),
              created_tokens: pageRows(501, vars.createdOffset, vars.createdLimit, smokeCreatedToken),
              fa2s_created: pageRows(1, vars.collectionOffset, vars.collectionLimit, () => ({
                name: 'Smoke Collection',
                contract: 'KT1SmokeSmokeSmokeSmokeSmokeSmoke12345',
                items: 10,
                volume_total: 2500000,
                floor_price: 1000000,
                owners: 3
              })),
              listings_sold: pageRows(1, vars.soldOffset, vars.soldLimit, () => ({ price_xtz: 2500000, timestamp: new Date().toISOString() })),
              listings_bought: pageRows(1, vars.boughtOffset, vars.boughtLimit, () => ({ price_xtz: 1000000, timestamp: new Date().toISOString() })),
              sales_stats: [{ type: 'creator', volume: 2500000, interval_days: null }]
            }]
          }
        });
      }
      return fulfillJson(route, { data: { token: smokeHenModeTokens(postData) } });
    }

    if (url.includes('assets.objkt.media/file/assets-003/')) {
      return route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
      });
    }

    if (url.includes('/ipfs/smoke-collection-image')) {
      return route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
      });
    }

    if (url.includes('/ipfs/smoke-hen-image')) {
      if (url.includes('hen_retry=')) {
        return route.fulfill({
          status: 200,
          contentType: 'image/gif',
          body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
        });
      }
      return route.fulfill({ status: 503, body: 'retry me' });
    }

    if (url.includes('api.coingecko.com/api/v3/simple/price')) {
      return fulfillJson(route, {
        tezos: {
          usd: 0.74,
          eur: 0.69,
          btc: 0.000007,
          usd_24h_change: 2.5,
          usd_market_cap: 780000000,
          usd_24h_vol: 18000000
        }
      });
    }

    if (url.includes('api.coingecko.com/api/v3/coins/markets')) {
      return fulfillJson(route, [{
        id: 'tezos',
        current_price: 0.74,
        market_cap: 780000000,
        total_volume: 18000000,
        price_change_percentage_24h_in_currency: 2.5,
        price_change_percentage_7d_in_currency: -4.2,
        price_change_percentage_30d_in_currency: 9.8
      }]);
    }

    if (url.includes('api.coingecko.com/api/v3/coins/tezos')) {
      return fulfillJson(route, { market_data: { price_change_percentage_7d: 4.2 } });
    }

    if (url.includes('api.llama.fi/v2/chains')) {
      return fulfillJson(route, [
        { name: 'Etherlink', tvl: 18148091.5, chainId: 42793 },
        { name: 'Tezos', tvl: 22493581.69, chainId: null }
      ]);
    }

    if (url.includes('api.llama.fi/v2/historicalChainTvl/Etherlink')) {
      return fulfillJson(route, Array.from({ length: 31 }, (_, index) => ({
        date: Math.floor((Date.now() - (30 - index) * 86400000) / 1000),
        tvl: 15000000 + index * 104000
      })));
    }

    if (url.includes('api.llama.fi/protocols')) {
      return fulfillJson(route, [
        { name: 'Curve DEX', slug: 'curve-dex', category: 'Dexs', chainTvls: { Etherlink: 10014648.09 } },
        { name: 'Spiko', slug: 'spiko', category: 'RWA', chainTvls: { Etherlink: 9090824.44 } },
        { name: 'Morpho Blue', slug: 'morpho-blue', category: 'Lending', chainTvls: { Etherlink: 3559007.6 } },
        { name: 'Youves', slug: 'youves', category: 'CDP', chainTvls: { Tezos: 12000000 } }
      ]);
    }

    if (url.includes('explorer.etherlink.com/api/v2/stats/charts/transactions')) {
      return fulfillJson(route, {
        chart_data: Array.from({ length: 30 }, (_, index) => ({
          date: new Date(Date.now() - (29 - index) * 86400000).toISOString().slice(0, 10),
          transactions: 52000 + index * 840
        }))
      });
    }

    if (url.includes(`explorer.etherlink.com/api/v2/addresses/${SAMPLE_ETHERLINK_ADDRESS}/transactions`)) {
      myTezosXTransactionCycles += 1;
      const cursorRequest = parsedUrl.searchParams.size > 0;
      const liveTransaction = myTezosViewLiveRefresh && myTezosXTransactionCycles > 1 && !cursorRequest
        ? [{
            hash: `0xlive${String(myTezosXTransactionCycles).padStart(59, '0')}`,
            method: 'transfer',
            status: 'ok',
            fee: { type: 'actual', value: '21000000000000' },
            value: '0',
            timestamp: new Date().toISOString(),
            block_number: 44808890 + myTezosXTransactionCycles,
            from: { hash: SAMPLE_ETHERLINK_ADDRESS, name: null },
            to: { hash: '0x2222222222222222222222222222222222222222', name: 'Smoke Contract' }
          }]
        : [];
      return fulfillJson(route, {
        items: [...liveTransaction, {
          // Cursor history is a different transaction, not a conflicting
          // method/block receipt for the first page's transaction hash.
          hash: cursorRequest
            ? '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
            : '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          method: cursorRequest ? 'approve' : 'transfer',
          status: 'error',
          fee: { type: 'actual', value: '21000000000000' },
          value: '0',
          timestamp: new Date(Date.now() - (cursorRequest ? 900000 : 300000)).toISOString(),
          block_number: cursorRequest ? 44808870 : 44808890,
          from: { hash: SAMPLE_ETHERLINK_ADDRESS, name: null },
          to: { hash: '0x2222222222222222222222222222222222222222', name: 'Smoke Contract' }
        }],
        next_page_params: myTezosViewLiveRefresh && !cursorRequest ? { index: '1' } : null
      });
    }

    if (url.includes(`explorer.etherlink.com/api/v2/addresses/${SAMPLE_ETHERLINK_ADDRESS}/token-balances`)) {
      return fulfillJson(route, [{
        value: '2500000',
        token: {
          address_hash: '0x3333333333333333333333333333333333333333',
          decimals: '6',
          name: 'Smoke USD',
          symbol: 'sUSD',
          type: 'ERC-20'
        }
      }]);
    }

    if (url.includes(`explorer.etherlink.com/api/v2/addresses/${SAMPLE_ETHERLINK_ADDRESS}/nft`)) {
      return fulfillJson(route, {
        items: [{
          id: '12',
          value: '1',
          metadata: { name: 'Etherlink Smoke NFT' },
          token: {
            address_hash: '0x4444444444444444444444444444444444444444',
            name: 'Smoke L2 Collection',
            symbol: 'SL2',
            type: 'ERC-721'
          }
        }],
        next_page_params: null
      });
    }

    if (url.includes(`explorer.etherlink.com/api/v2/addresses/${SAMPLE_ETHERLINK_ADDRESS}/token-transfers`)) {
      return fulfillJson(route, {
        items: [{
          transaction_hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          timestamp: new Date(Date.now() - 600000).toISOString(),
          block_number: 44808880,
          log_index: 2,
          from: { hash: '0x5555555555555555555555555555555555555555', name: null },
          to: { hash: SAMPLE_ETHERLINK_ADDRESS, name: null },
          total: { value: '1000000', decimals: '6' },
          token: {
            address_hash: '0x3333333333333333333333333333333333333333',
            decimals: '6',
            name: 'Smoke USD',
            symbol: 'sUSD',
            type: 'ERC-20'
          }
        }],
        next_page_params: null
      });
    }

    if (url.includes(`explorer.etherlink.com/api/v2/addresses/${SAMPLE_ETHERLINK_ADDRESS}`)) {
      myTezosXOverviewCycles += 1;
      return fulfillJson(route, {
        coin_balance: '2500000000000000000',
        transactions_count: String(42 + (myTezosViewLiveRefresh ? myTezosXOverviewCycles - 1 : 0)),
        token_transfers_count: '7',
        gas_usage_count: '21000',
        is_contract: false,
        name: null,
        last_activity_time: new Date(Date.now() - 300000).toISOString()
      });
    }

    if (url.includes('explorer.etherlink.com/api/v2/stats/charts/active-accounts')) {
      return fulfillJson(route, Array.from({ length: 30 }, (_, index) => ({
        date: new Date(Date.now() - (29 - index) * 86400000).toISOString().slice(0, 10),
        active_accounts: 4100 + index * 55
      })));
    }

    if (url.includes('explorer.etherlink.com/api/v2/stats')) {
      return fulfillJson(route, {
        average_block_time: 2970,
        gas_prices: { slow: 0.88, average: 0.88, fast: 0.89 },
        gas_price_updated_at: new Date().toISOString(),
        total_addresses: '1595409',
        total_blocks: '44808895',
        total_transactions: '81004089',
        transactions_today: '87656',
        tvl: null
      });
    }

    if (url.includes('explorer.etherlink.com/api/v2/tokens')) {
      return fulfillJson(route, {
        items: [
          { symbol: 'USDC.e', name: 'Bridged USDC', holders_count: '18420' },
          { symbol: 'WXTZ', name: 'Wrapped XTZ', holders_count: '12920' },
          { symbol: 'YOU', name: 'Youves Governance', holders_count: '3110' }
        ]
      });
    }

    if (url.includes('explorer.etherlink.com/api/v2/transactions')) {
      return fulfillJson(route, {
        items: [
          {
            hash: '0xSmokeTx111111111111111111111111111111111111111111111111111111111111',
            method: 'credit',
            status: 'ok',
            fee: { type: 'actual', value: '953130000000000' },
            timestamp: new Date(Date.now() - 4000).toISOString(),
            block_number: 44808895,
            from: { hash: '0x6e311Afe9dc3Be21D6f4Ef4Ea913C14dc9470391', name: null },
            to: { hash: '0x0c532e1e916219007f244e2d8Ef46f8530Ec75DE', name: 'Bankroll' }
          },
          {
            hash: '0xSmokeTx222222222222222222222222222222222222222222222222222222222222',
            method: 'swap',
            status: 'ok',
            fee: { type: 'actual', value: '800000000000000' },
            timestamp: new Date(Date.now() - 9000).toISOString(),
            block_number: 44808894,
            from: { hash: '0xa76d2FdB56bD95707BFF83a55A3400630D093d64', name: null },
            to: { hash: '0x0000000000000000000000000000000000000001', name: 'Smoke DEX' }
          }
        ]
      });
    }

    if (url.includes('node.mainnet.etherlink.com')) {
      if (postData.includes('eth_getBalance')) {
        const body = JSON.parse(postData || '[]');
        const calls = Array.isArray(body) ? body : [body];
        return fulfillJson(route, calls.map((call) => ({
          jsonrpc: '2.0',
          id: call.id,
          result: '0x22b1c8c1227a0000'
        })));
      }
      if (postData.includes('eth_blockNumber')) return fulfillJson(route, { jsonrpc: '2.0', id: 1, result: '0x2abbd5f' });
      if (postData.includes('eth_gasPrice')) return fulfillJson(route, { jsonrpc: '2.0', id: 1, result: '0x3b9aca00' });
      return fulfillJson(route, { jsonrpc: '2.0', id: 1, result: null });
    }

    if (url.includes('octez-mainnet-archive.octez.io') || url.includes('rpc.tzkt.io/mainnet')) {
      if (url.endsWith('/config/history_mode')) return fulfillJson(route, { history_mode: 'archive' });
      if (url.includes('/context/contracts/') && url.endsWith('/full_balance')) {
        if (archivePrimaryFailure && url.includes('octez-mainnet-archive.octez.io')) {
          return fulfillJson(route, { error: 'primary archive unavailable in smoke' });
        }
        const address = decodeURIComponent(url.split('/context/contracts/')[1]?.split('/')[0] || SAMPLE_ADDRESS);
        const offset = address === SAMPLE_ADDRESS ? 0 : 100000000;
        return fulfillJson(route, String(500000000000 + offset));
      }
    }

    if (url.includes('eu.rpc.tez.capital')) {
      if (url.includes('/context/issuance/current_yearly_rate')) return fulfillText(route, '4.5');
      if (url.includes('/context/total_supply')) return fulfillText(route, '1050000000000000');
      if (url.includes('/context/total_frozen_stake')) return fulfillText(route, '305000000000000');
      if (url.includes('/context/delegates?active=true')) return fulfillJson(route, [SAMPLE_ADDRESS, SAMPLE_ADDRESS_2]);
      if (/\/blocks\/\d+\/operations\/3/.test(url)) {
        const level = Number(url.match(/\/blocks\/(\d+)\/operations\/3/)?.[1]) || 0;
        const gasPct = [12, 38, 68, 91][Math.abs(level) % 4];
        const totalMilligas = Math.round(1040000 * 1000 * gasPct / 100);
        const outerMilligas = Math.round(totalMilligas * 0.74);
        const chainEventContents = level % 4 === 3 ? [
          {
            kind: 'smart_rollup_publish',
            source: SAMPLE_ADDRESS,
            rollup: ETHERLINK_ROLLUP_ADDRESS,
            metadata: { operation_result: { status: 'applied', consumed_milligas: '0' } }
          },
          {
            kind: 'dal_publish_commitment',
            source: SAMPLE_ADDRESS_2,
            slot_header: { index: 8 },
            metadata: { operation_result: { status: 'applied', consumed_milligas: '0' } }
          },
          {
            kind: 'delegation',
            source: SAMPLE_ADDRESS_2,
            delegate: SAMPLE_ADDRESS,
            metadata: { operation_result: { status: 'applied', consumed_milligas: '0' } }
          },
          {
            kind: 'update_companion_key',
            source: SAMPLE_ADDRESS,
            metadata: { operation_result: { status: 'applied', consumed_milligas: '0' } }
          },
          {
            kind: 'transaction',
            source: SAMPLE_ADDRESS,
            metadata: {
              operation_result: { status: 'applied', consumed_milligas: '0' },
              internal_operation_results: [{
                kind: 'origination',
                source: SAMPLE_ADDRESS,
                result: {
                  status: 'applied',
                  consumed_milligas: '0',
                  originated_contracts: ['KT1SmokeOriginated1111111111111111111']
                }
              }]
            }
          }
        ] : [];
        return fulfillJson(route, [{
          hash: 'opHeartbeatManagerGroup',
          contents: [{
            kind: 'transaction',
            metadata: {
              operation_result: { status: 'applied', consumed_milligas: String(outerMilligas) },
              internal_operation_results: [{ result: { status: 'applied', consumed_milligas: String(totalMilligas - outerMilligas) } }]
            }
          }, ...chainEventContents]
        }]);
      }
      if (/\/blocks\/\d+\/operations\/2/.test(url)) {
        const level = Number(url.match(/\/blocks\/(\d+)\/operations\/2/)?.[1]) || 0;
        return fulfillJson(route, level % 4 === 3 ? [{
          hash: 'opHeartbeatEvidenceGroup',
          contents: [{
            kind: 'double_baking_evidence',
            metadata: { operation_result: { status: 'applied' } }
          }]
        }] : []);
      }
      if (url.includes('/context/constants')) {
        return fulfillJson(route, {
          blocks_per_cycle: Number(cycleMilestone?.blocksPerCycle) || 10800,
          minimal_block_delay: '6',
          minimal_participation_ratio: { numerator: 2, denominator: 3 },
          dal_parametric: { incentives_enable: true, minimal_participation_ratio: { numerator: '16', denominator: '25' } },
          hard_gas_limit_per_block: '1040000',
          consensus_committee_size: 7000,
          edge_of_staking_over_delegation: 3,
          liquidity_baking_subsidy: '2500000'
        });
      }
      if (url.includes('/helpers/current_level')) {
        return fulfillJson(route, { level: 12345678, cycle: 1143, cycle_position: 1234 });
      }
      if (url.includes('/metadata')) {
        const requestedLevel = Number(parsedUrl.pathname.match(/\/blocks\/(\d+)\/metadata$/)?.[1]);
        return fulfillJson(route, {
          level_info: nullCycleTiming
            ? { cycle: null, cycle_position: null }
            : {
                cycle: Number(cycleMilestone?.cycle) || 1143,
                cycle_position: cycleMilestone
                  ? (requestedLevel || rpcMetadataLevel) - Number(cycleMilestone.startLevel)
                  : 1234
              }
        });
      }
      if (url.includes('/header')) {
        if (cycleMilestone && url.includes(`/blocks/${cycleMilestone.startLevel}/header`)) {
          return fulfillJson(route, {
            hash: 'BLCycleMilestoneStartSmoke111111111111111111111111111111111',
            level: Number(cycleMilestone.startLevel),
            timestamp: new Date(cycleMilestone.startedAt).toISOString()
          });
        }
        const level = rpcHeaderLevel++;
        rpcMetadataLevel = level;
        const timestamp = new Date(rpcHeaderTimestamp).toISOString();
        rpcHeaderTimestamp += 6000;
        return fulfillJson(route, {
          hash: 'BLCycleMilestoneHeadSmoke1111111111111111111111111111111111',
          level,
          timestamp
        });
      }
      if (url.includes('/dal_participation')) {
        return fulfillJson(route, {
          expected_assigned_shards_per_slot: 214,
          delegate_attested_dal_slots: 14,
          delegate_attestable_dal_slots: 14,
          expected_dal_rewards: '277986',
          sufficient_dal_participation: true,
          denounced: false
        });
      }
      if (url.includes('/participation')) {
        return fulfillJson(route, { expected_cycle_activity: 7000, minimal_cycle_activity: 5600, missed_slots: 0, missed_levels: 0, remaining_allowed_missed_slots: 1400 });
      }
    }

    if (url.includes('api.tzkt.io/v1')) {
      if (ledgerFlowMocks) {
        const ledgerTarget = parsedUrl.searchParams.get('anyof.sender.target')
          || parsedUrl.searchParams.get('target')
          || parsedUrl.searchParams.get('originatedContract')
          || '';
        const ledgerAddresses = [
          SAMPLE_ADDRESS,
          SAMPLE_ADDRESS_2,
          SAMPLE_IDLE_ADDRESS,
          SAMPLE_CONTRACT
        ];
        const ledgerAccountPath = ledgerAddresses
          .some((address) => parsedUrl.pathname === `/v1/accounts/${address}`);
        const ledgerOperationPath = ledgerAddresses.includes(ledgerTarget)
          && [
            '/v1/operations/transactions',
            '/v1/operations/transactions/count',
            '/v1/operations/originations'
          ].includes(parsedUrl.pathname);
        if (ledgerAccountPath || ledgerOperationPath) ledgerFlowTzktRequests.push(url);
      }
      if (url.includes('/accounts/activity?')) {
        const lastId = Number(parsedUrl.searchParams.get('lastId')) || null;
        if (lastId) return fulfillJson(route, []);
        myTezosActivityCycles += 1;
        const liveRows = myTezosViewLiveRefresh && myTezosActivityCycles > 1
          ? [{
              id: 6000 + myTezosActivityCycles,
              type: 'transaction',
              timestamp: new Date().toISOString(),
              level: 12346000 + myTezosActivityCycles,
              status: 'applied',
              hash: `opSmokeLiveMemory${String(myTezosActivityCycles).padStart(28, '1')}`,
              amount: 1000000 + myTezosActivityCycles,
              sender: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
              target: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
            }]
          : [];
        return fulfillJson(route, [
          ...liveRows,
          {
            id: 5004,
            type: 'token_transfer',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            level: 12345004,
            status: 'applied',
            hash: 'opSmokeNftTransfer111111111111111111111111111',
            from: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            to: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            token: {
              contract: { address: 'KT1SmokeCollection1111111111111111111', alias: 'Smoke Collection' },
              tokenId: '42',
              standard: 'fa2',
              metadata: { symbol: 'NFT', name: 'Shared Smoke Artifact', decimals: '0', is_boolean_amount: true }
            },
            amount: '1'
          },
          {
            id: 5003,
            type: 'staking',
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            level: 12345003,
            status: 'applied',
            hash: 'opSmokeStake1111111111111111111111111111111',
            action: 'stake',
            sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            amount: 250000000
          },
          {
            id: 5002,
            type: 'delegation',
            timestamp: new Date(Date.now() - 10800000).toISOString(),
            level: 12345002,
            status: 'applied',
            hash: 'opSmokeDelegation11111111111111111111111111',
            sender: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            prevDelegate: null,
            newDelegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
          },
          {
            id: 5001,
            type: 'transaction',
            timestamp: new Date(Date.now() - 14400000).toISOString(),
            level: 12345001,
            status: 'applied',
            hash: 'opSmokeSelfTransfer1111111111111111111111111',
            amount: 1250000,
            sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            target: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }
          }
        ]);
      }
      if (url.includes('/balance_history?')) {
        const address = decodeURIComponent(parsedUrl.pathname.split('/accounts/')[1]?.split('/')[0] || SAMPLE_ADDRESS);
        const offset = address === SAMPLE_ADDRESS ? 0 : 100000000;
        return fulfillJson(route, [
          {
            level: 12000000,
            timestamp: new Date(Date.now() - 3 * 86400000).toISOString(),
            balance: 400000000000 + offset
          },
          {
            level: 12100000,
            timestamp: new Date(Date.now() - 2 * 86400000).toISOString(),
            balance: 450000000000 + offset
          },
          {
            level: 12200000,
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            balance: 500000000000 + offset
          }
        ]);
      }
      if (/\/balance_history\/\d+$/.test(parsedUrl.pathname)) {
        const address = decodeURIComponent(parsedUrl.pathname.split('/accounts/')[1]?.split('/')[0] || SAMPLE_ADDRESS);
        const offset = address === SAMPLE_ADDRESS ? 0 : 100000000;
        return fulfillJson(route, 500000000000 + offset);
      }
      if (url.includes('/contracts/KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2/storage')) {
        return fulfillJson(route, {
          drift: '0',
          ovens: 20919,
          target: '0',
          metadata: 20918,
          cfmm_address: 'KT1SmokeCtezCfmm1111111111111111111',
          ctez_fa12_address: 'KT1SmokeCtezFa1211111111111111111',
          last_drift_update: new Date().toISOString()
        });
      }
      if (url.includes('/bigmaps/20919/keys')) {
        const owner = parsedUrl.searchParams.get('key.owner') || '';
        if (owner !== SAMPLE_ADDRESS) return fulfillJson(route, []);
        return fulfillJson(route, [
          {
            key: { id: '42', owner: SAMPLE_ADDRESS },
            value: {
              address: 'KT1SmokeCtezOvenDebt1111111111111111',
              tez_balance: '6543210',
              ctez_outstanding: '123456'
            },
            lastLevel: 12345678
          },
          {
            key: { id: '43', owner: SAMPLE_ADDRESS },
            value: {
              address: 'KT1SmokeCtezOvenReady111111111111111',
              tez_balance: '987654',
              ctez_outstanding: '0'
            },
            lastLevel: 12345679
          }
        ]);
      }
      if (url.includes('/statistics/cyclic')) {
        const latestStart = Date.now() - 10 * 60 * 1000;
        const intervals = [67000, 64500, 65200, 64800, 65100, 64700, 64900];
        let elapsed = 0;
        return fulfillJson(route, Array.from({ length: 8 }, (_, index) => {
          if (index > 0) elapsed += intervals[index - 1];
          return {
            cycle: 1144 - index,
            level: 12345678 - index * 10800,
            timestamp: new Date(latestStart - elapsed * 1000).toISOString()
          };
        }));
      }
      if (url.includes('/statistics/current')) {
        if (parsedUrl.searchParams.get('select') === 'totalBakingPower') {
          return fulfillJson(route, 500000000000000);
        }
        return fulfillJson(route, {
          totalSupply: 1050000000000000,
          totalFrozen: 295000000000000,
          totalOwnStaked: 190000000000000,
          totalExternalStaked: 100000000000000,
          totalOwnDelegated: 80000000000000,
          totalExternalDelegated: 170000000000000,
          totalBakingPower: 500000000000000,
          totalDelegators: 125000,
          totalStakers: 5000,
          totalBurned: 600000000000,
          burnedSupply: 600000000000,
          totalBootstrapped: 1050000000000000
        });
      }
      if (url.includes('/head')) {
        return fulfillJson(route, {
          level: 12345678,
          cycle: 1278,
          timestamp: new Date(Date.now() - 1000).toISOString(),
          protocol: 'PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY'
        });
      }
      if (/\/blocks\/[^/]+\/level/.test(url)) {
        return fulfillJson(route, 12344000);
      }
      if (/^\/v1\/blocks\/\d+$/.test(parsedUrl.pathname)) {
        return fulfillJson(route, { level: Number(parsedUrl.pathname.split('/').pop()), hash: 'BLockSmokeReceipt', timestamp: new Date(Date.now() - 1000).toISOString(), round: 0, baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, validations: 7000, transactions: 0 });
      }
      if (url.includes('/blocks?')) {
        const params = new URL(url).searchParams;
        const bakerBaselineTimestamp = params.get('timestamp.le');
        if (bakerBaselineTimestamp && params.get('select') === 'level,hash,timestamp') {
          return fulfillJson(route, [{
            level: 12290000,
            hash: 'BMsmokeBakerSetBaseline11111111111111111111111111111111',
            timestamp: bakerBaselineTimestamp
          }]);
        }
        const priorBakeAddress = params.get('anyof.proposer.producer');
        if (priorBakeAddress) {
          if (priorBakeAddress !== SAMPLE_ADDRESS_2) return fulfillJson(route, []);
          const activationLevel = Number(params.get('level.lt')) || 12295000;
          return fulfillJson(route, [{
            level: activationLevel - 1000,
            timestamp: new Date(Date.now() - 180 * 86400000).toISOString(),
            proposer: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            producer: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }
          }]);
        }
        if (networkHealthBlocksDelayMs > 0) await sleep(networkHealthBlocksDelayMs);
        const bakerSizeTimestamp = params.get('timestamp.le');
        if (bakerSizeTimestamp && params.get('select') === 'level,cycle,timestamp') {
          return fulfillJson(route, [{ level: 9887330, cycle: 961, timestamp: bakerSizeTimestamp }]);
        }
        const requestedLevels = (params.get('level.in') || '').split(',').filter(Boolean).map(Number).filter(Number.isFinite);
        if (requestedLevels.length) {
          const now = Date.now();
          const bakerClosureCycles = new Map([
            [12310000, 1201],
            [12200000, 1194],
            [11800000, 1166]
          ]);
          return fulfillJson(route, requestedLevels.map((level) => ({
            level,
            cycle: bakerClosureCycles.get(level) || 1143,
            timestamp: new Date(now - Math.max(0, 12345678 - level) * 6000).toISOString(),
            protocol: null
          })));
        }
        const requestedLimit = Number(params.get('limit')) || 4;
        const isLiquidityBakingWindow = (params.get('select') || '').includes('lbToggleEma');
        // Liquidity Baking validates one complete, contiguous 2,500-block
        // opening window before switching to 32-block overlap polls. Keep other
        // generic block fixtures small, but model that bounded receipt exactly.
        const count = Math.max(1, isLiquidityBakingWindow ? requestedLimit : Math.min(requestedLimit, 20));
        const now = Date.now() - blockHeadLagMs;
        const head = lbBlocksHead;
        if (blockHeadAutoAdvance) lbBlocksHead += 1;
        const producers = [
          { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
          { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
          { address: 'tz1PassPassPassPassPassPassPassPassP', alias: 'Pass Baker' },
          { address: 'tz1OffOffOffOffOffOffOffOffOffOf', alias: 'Off Baker' }
        ];
        return fulfillJson(route, Array.from({ length: count }, (_, index) => {
          const producerIndex = index % producers.length;
          const occurrence = Math.floor(index / producers.length);
          const producer = producers[producerIndex];
          const lag = index * 6000 + (index >= 3 ? 2000 : 0);
          const power = index === 2 ? 6500 : (index === 0 ? 6988 : 7000);
          const stableToggles = [false, true, null, false];
          const changingToggles = [
            occurrence === 0 ? false : true,
            occurrence === 0 ? true : false,
            occurrence === 0 ? null : occurrence === 1 ? true : false,
            false
          ];
          return {
            level: head - index,
            cycle: 1143,
            proto: 25,
            timestamp: new Date(now - lag).toISOString(),
            producer,
            proposer: producer,
            attestationPower: power,
            attestationCommittee: 7000,
            payloadRound: index === 2 ? 1 : 0,
            blockRound: index === 2 ? 1 : 0,
            lbToggle: lbNoVoteChanges ? stableToggles[producerIndex] : changingToggles[producerIndex],
            lbToggleEma: 1030000000 - index * 500000
          };
        }));
      }
      if (url.includes('/protocols/current')) {
        return fulfillJson(route, { code: 25, hash: 'PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY', version: 25, firstLevel: 13857889 });
      }
      if (url.endsWith('/protocols') || url.includes('/protocols?')) {
        return fulfillJson(route, [
          { code: 4, extras: { alias: 'Athens' } },
          { code: 5, extras: { alias: 'Babylon' } },
          { code: 6, extras: { alias: 'Carthage' } },
          { code: 7, extras: { alias: 'Delphi' } },
          { code: 8, extras: { alias: 'Edo' } },
          { code: 9, extras: { alias: 'Florence' } },
          { code: 10, extras: { alias: 'Granada' } },
          { code: 11, extras: { alias: 'Hangzhou' } },
          { code: 12, extras: { alias: 'Ithaca' } },
          { code: 13, extras: { alias: 'Jakarta' } },
          { code: 14, extras: { alias: 'Kathmandu' } },
          { code: 15, extras: { alias: 'Lima' } },
          { code: 16, extras: { alias: 'Mumbai' } },
          { code: 17, extras: { alias: 'Nairobi' } },
          { code: 18, extras: { alias: 'Oxford' } },
          { code: 19, extras: { alias: 'Paris' } },
          { code: 20, extras: { alias: 'Paris C' } },
          { code: 21, extras: { alias: 'Quebec' } },
          { code: 22, extras: { alias: 'Rio' } },
          { code: 23, extras: { alias: 'Seoul' } },
          { code: 24, extras: { alias: 'Tallinn' } },
          { code: 25, hash: 'PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY', firstLevel: 13857889 }
        ]);
      }
      if (parsedUrl.pathname === '/v1/delegates' && parsedUrl.searchParams.get('sort.desc') === 'id' && parsedUrl.searchParams.get('select')?.includes('activationLevel')) {
        const now = Date.now();
        return fulfillJson(route, [
          { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true, bakingPower: 6000000000000, activationLevel: 12325000, activationTime: new Date(now - 86400000).toISOString(), deactivationLevel: null, deactivationTime: null },
          { address: SAMPLE_ADDRESS_2, alias: 'Second Baker', active: true, bakingPower: 600000000000, activationLevel: 12295000, activationTime: new Date(now - 3 * 86400000).toISOString(), deactivationLevel: null, deactivationTime: null },
          { address: SAMPLE_DELEGATOR_ADDRESS, alias: null, active: true, bakingPower: 50000000000, activationLevel: 12050000, activationTime: new Date(now - 21 * 86400000).toISOString(), deactivationLevel: null, deactivationTime: null }
        ]);
      }
      const bakerRosterDetailMatch = parsedUrl.pathname.match(/^\/v1\/delegates\/([^/]+)$/);
      if (bakerRosterDetailMatch && parsedUrl.searchParams.get('select')?.includes('activationLevel')) {
        const address = decodeURIComponent(bakerRosterDetailMatch[1]);
        const now = Date.now();
        const rows = new Map([
          [SAMPLE_ADDRESS, { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true, bakingPower: 6000000000000, activationLevel: 12325000, activationTime: new Date(now - 86400000).toISOString(), deactivationLevel: null, deactivationTime: null }],
          [SAMPLE_ADDRESS_2, { address: SAMPLE_ADDRESS_2, alias: 'Second Baker', active: true, bakingPower: 600000000000, activationLevel: 12295000, activationTime: new Date(now - 3 * 86400000).toISOString(), deactivationLevel: null, deactivationTime: null }],
          [SAMPLE_DELEGATOR_ADDRESS, { address: SAMPLE_DELEGATOR_ADDRESS, alias: null, active: true, bakingPower: 50000000000, activationLevel: 12050000, activationTime: new Date(now - 21 * 86400000).toISOString(), deactivationLevel: null, deactivationTime: null }],
          [SAMPLE_IDLE_ADDRESS, { address: SAMPLE_IDLE_ADDRESS, alias: 'Retired Baker', active: false, bakingPower: 0, activationLevel: 11900000, activationTime: new Date(now - 90 * 86400000).toISOString(), deactivationLevel: 12310000, deactivationTime: new Date(now - 2 * 86400000).toISOString() }],
          [SAMPLE_REGULAR_DELEGATOR_ADDRESS, { address: SAMPLE_REGULAR_DELEGATOR_ADDRESS, alias: 'Former Baker', active: false, bakingPower: 0, activationLevel: 11600000, activationTime: new Date(now - 180 * 86400000).toISOString(), deactivationLevel: 12200000, deactivationTime: new Date(now - 8 * 86400000).toISOString() }],
          [SAMPLE_STAKER_ADDRESS, { address: SAMPLE_STAKER_ADDRESS, alias: null, active: false, bakingPower: 0, activationLevel: 11000000, activationTime: new Date(now - 365 * 86400000).toISOString(), deactivationLevel: 11800000, deactivationTime: new Date(now - 28 * 86400000).toISOString() }]
        ]);
        return fulfillJson(route, rows.get(address) || null);
      }
      if (parsedUrl.pathname === '/v1/delegates' && parsedUrl.searchParams.get('sort.desc') === 'deactivationLevel') {
        const now = Date.now();
        return fulfillJson(route, [
          { address: SAMPLE_IDLE_ADDRESS, alias: 'Retired Baker', active: false, bakingPower: 0, activationLevel: 11900000, activationTime: new Date(now - 90 * 86400000).toISOString(), deactivationLevel: 12310000, deactivationTime: new Date(now - 2 * 86400000).toISOString() },
          { address: SAMPLE_REGULAR_DELEGATOR_ADDRESS, alias: 'Former Baker', active: false, bakingPower: 0, activationLevel: 11600000, activationTime: new Date(now - 180 * 86400000).toISOString(), deactivationLevel: 12200000, deactivationTime: new Date(now - 8 * 86400000).toISOString() },
          { address: SAMPLE_STAKER_ADDRESS, alias: null, active: false, bakingPower: 0, activationLevel: 11000000, activationTime: new Date(now - 365 * 86400000).toISOString(), deactivationLevel: 11800000, deactivationTime: new Date(now - 28 * 86400000).toISOString() }
        ]);
      }
      if (url.includes('/delegates/count?active=true')) return fulfillJson(route, leaderboardBakers.length);
      if (/\/operations\/(?:delegations|transactions)\/[^/]+\/status$/.test(parsedUrl.pathname)) {
        return fulfillJson(route, 'applied');
      }
      if (url.includes('/delegates?active=true') && url.includes('select=') && url.includes('bakingPower')) {
        const offset = Number(parsedUrl.searchParams.get('offset') || 0);
        const limit = Number(parsedUrl.searchParams.get('limit') || 500);
        bakerPageOffsets.push(offset);
        return fulfillJson(route, bakerDirectoryPaged
          ? leaderboardBakers.slice(offset, offset + limit)
          : leaderboardBakers);
      }
      if (url.includes('/delegates?active=true&limit=')) return fulfillJson(route, sampleBakers.map((b) => b.address));
      if (url.includes('/rights?')) {
        const rights = new URL(url).searchParams;
        const type = rights.get('type');
        if (type === 'attestation' && rights.get('status') === 'missed') {
            if (rights.has('baker') && rights.has('cycle')) return fulfillJson(route, [3, 10, 30].map((delta, index) => ({
              level: Number(rights.get('level.le')) - delta, cycle: Number(rights.get('cycle')),
              timestamp: new Date(Date.now() - (index + 1) * 3600000).toISOString(), slots: 24 - index,
              status: 'missed', type: 'attestation', baker: { address: rights.get('baker') }
            })));
          const startLevel = Number(rights.get('level.ge'));
          const endLevel = Number(rights.get('level.le'));
          const blockMisses = [endLevel - 1, endLevel - 2].flatMap((level) => [
            { level, timestamp: new Date(Date.now() - 13000).toISOString(), slots: 7, status: 'missed', type: 'attestation', baker: { address: 'tz1SecondTezReceipt11111111111111111', alias: 'second.tez' } },
            { level, timestamp: new Date(Date.now() - 13000).toISOString(), slots: 6, status: 'missed', type: 'attestation', baker: { address: 'tz4MissMissMissMissMissMissMissMis', alias: null } },
            { level, timestamp: new Date(Date.now() - 13000).toISOString(), slots: 5, status: 'missed', type: 'attestation', baker: { address: 'tz1KitchenSinkBakerOne111111111111', alias: 'Kitchen Baker' } },
            { level, timestamp: new Date(Date.now() - 13000).toISOString(), slots: 4, status: 'missed', type: 'attestation', baker: { address: 'tz2KitchenSinkBakerTwo222222222222', alias: 'Counter Baker' } },
            { level, timestamp: new Date(Date.now() - 13000).toISOString(), slots: 3, status: 'missed', type: 'attestation', baker: { address: 'tz3KitchenSinkBakerThree3333333333', alias: 'Pantry Baker' } },
            { level, timestamp: new Date(Date.now() - 13000).toISOString(), slots: 2, status: 'missed', type: 'attestation', baker: { address: 'tz1KitchenSinkBakerFour444444444444', alias: 'Galley Baker' } }
          ]);
          if (Number.isFinite(startLevel) && Number.isFinite(endLevel) && endLevel - startLevel <= 4) {
            return fulfillJson(route, blockMisses);
          }
          return fulfillJson(route, [
            ...blockMisses,
            { level: 12345678, timestamp: new Date(Date.now() - 1000).toISOString(), slots: 7, status: 'missed', type: 'attestation', baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } },
            { level: 12345677, timestamp: new Date(Date.now() - 7000).toISOString(), slots: 3, status: 'missed', type: 'attestation', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } },
            { level: 12345676, timestamp: new Date(Date.now() - 13000).toISOString(), slots: 2, status: 'missed', type: 'attestation', baker: { address: 'tz1MissMissMissMissMissMissMissMis', alias: 'Missed Attester' } }
          ]);
        }
        if (type === 'baking' && rights.get('status') === 'missed') {
          return fulfillJson(route, [
            { level: 12345660, timestamp: new Date(Date.now() - 120000).toISOString(), round: 0, status: 'missed', type: 'baking', baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } }
          ]);
        }
        if (type === 'baking' && rights.get('status') === 'future') {
          if (rights.get('round') !== '0') {
            return fulfillJson(route, [
              { level: 12345698, cycle: 1143, round: 5, status: 'future', type: 'baking', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } }
            ]);
          }
          return fulfillJson(route, [
            { level: 12345858, cycle: 1143, round: 0, status: 'future', type: 'baking', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } }
          ]);
        }
        if (type === 'baking' && rights.has('level') && rights.get('round') === '0' && !rights.has('status')) {
          return fulfillJson(route, [{
            level: Number(rights.get('level')),
            cycle: 1143,
            timestamp: new Date(Date.now() + 6000).toISOString(),
            round: 0,
            status: 'future',
            type: 'baking',
            baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }
          }]);
        }
        if (type === 'baking') {
          if (rights.get('round') !== '0') {
            return fulfillJson(route, [
              { level: 12345670, cycle: 1143, round: 5, status: 'missed', type: 'baking', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } }
            ]);
          }
          return fulfillJson(route, [
            { level: 12345540, cycle: 1143, round: 0, status: 'missed', type: 'baking', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } }
          ]);
        }
        const statusSpec = operatorAttestationSequence
          ? operatorAttestationSequence[Math.min(operatorAttestationCalls++, operatorAttestationSequence.length - 1)]
          : 'realized';
        return fulfillJson(route, Array.from({ length: 10 }, (_, index) => ({
          level: 12345670 - index,
          timestamp: new Date(Date.now() - index * 6000).toISOString(),
          slots: 1,
          status: Array.isArray(statusSpec)
            ? statusSpec[Math.min(index, statusSpec.length - 1)]
            : statusSpec,
          type: 'attestation',
          baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
        })));
      }
      if (url.includes('/rights/count?')) return fulfillText(route, '0');
      if (url.includes('/operations/update_consensus_key')) {
        const operations = [
          {
            id: 910001,
            level: 12000000,
            timestamp: new Date(Date.now() - 14 * 86400000).toISOString(),
            sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            publicKey: 'BLpkSmokeActiveConsensusKey111111111111111111111111111111111111111111111111',
            publicKeyHash: 'tz4QaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQ',
            activationCycle: 1136,
            status: 'applied'
          },
          {
            id: 910002,
            level: 12345000,
            timestamp: new Date(Date.now() - 1 * 86400000).toISOString(),
            sender: { address: SAMPLE_ADDRESS_3, alias: 'Pending Baker' },
            publicKey: 'BLpkSmokePendingConsensusKey1111111111111111111111111111111111111111111111',
            publicKeyHash: 'tz4PendingPendingPendingPendingPendingPend',
            activationCycle: 1284,
            status: 'applied'
          }
        ];
        const minLevel = Number(new URL(url).searchParams.get('level.ge'));
        return fulfillJson(route, Number.isFinite(minLevel)
          ? operations.filter((operation) => operation.level >= minLevel)
          : operations);
      }
      if (url.includes('/voting/periods/current/voters?') && url.includes('limit=10000')) {
        if (etherlinkPromotion) {
          return fulfillJson(route, [
            ...ETHERLINK_PROMOTION_LEDGER.map((voter) => ({
              delegate: { address: voter.address, alias: voter.alias },
              votingPower: voter.votingPower,
              status: 'none'
            })),
            { delegate: { address: SAMPLE_LEDGER_ORIGIN, alias: 'Other voting power' }, votingPower: 412491157148127, status: 'none' }
          ]);
        }
        return fulfillJson(route, [
          { delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, votingPower: 40000000000000, status: 'none' },
          { delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }, votingPower: 30000000000000, status: 'none' },
          { delegate: { address: SAMPLE_ADDRESS_3, alias: 'Pending Baker' }, votingPower: 23213811256339, status: 'none' },
          { delegate: { address: SAMPLE_LEDGER_ORIGIN, alias: 'Other voting power' }, votingPower: 563421851517593, status: 'none' }
        ]);
      }
      if (url.includes('/contracts?') && url.includes('creator=tz1VGpuq8GkCwf4x6MupTz6QAcJLivQcaAsb')) {
        return fulfillJson(route, [
          { address: ETHERLINK_SEQUENCER_CONTRACT, kind: 'smart_contract', firstActivity: 13171350 },
          { address: ETHERLINK_FAST_CONTRACT, kind: 'smart_contract', firstActivity: 13171346 },
          { address: ETHERLINK_SLOW_CONTRACT, kind: 'smart_contract', firstActivity: 13171342 }
        ]);
      }
      if (url.includes(`/contracts/${ETHERLINK_FAST_CONTRACT}/storage`)) {
        return fulfillJson(route, {
          config: {
            started_at_level: '10419200',
            period_length: '4800',
            proposal_quorum: '5',
            promotion_quorum: '15',
            promotion_supermajority: '80'
          },
          last_winner: null,
          voting_context: etherlinkQuiet || etherlinkPromotionFailure ? null : {
            period_index: '401',
            total_voting_power: ETHERLINK_TOTAL_VOTING_POWER,
            period: etherlinkPromotion
              ? {
                  promotion: {
                    voters: ETHERLINK_PROMOTION_VOTERS_BIGMAP,
                    winner_candidate: ETHERLINK_FAST_PROPOSAL,
                    yea_voting_power: '156540547994324',
                    nay_voting_power: '0',
                    pass_voting_power: '87603957631481',
                    total_voting_power: ETHERLINK_TOTAL_VOTING_POWER
                  }
                }
              : {
                  proposal: {
                    proposals: ETHERLINK_PROPOSALS_BIGMAP,
                    upvoters_proposals: ETHERLINK_UPVOTERS_BIGMAP,
                    upvoters_upvotes_count: ETHERLINK_UPVOTE_COUNTS_BIGMAP,
                    winner_candidate: etherlinkNullProposal ? null : ETHERLINK_FAST_PROPOSAL,
                    total_voting_power: ETHERLINK_TOTAL_VOTING_POWER,
                    max_upvotes_voting_power: etherlinkNullProposal ? '0' : '93213811256339'
                  }
                }
          }
        });
      }
      if (url.includes(`/contracts/${ETHERLINK_SLOW_CONTRACT}/storage`)) {
        return fulfillJson(route, {
          config: {
            started_at_level: etherlinkPromotionFailure ? '9589278' : '10454078',
            period_length: '67200',
            proposal_quorum: '1',
            promotion_quorum: '5',
            promotion_supermajority: '75'
          },
          last_winner: null,
          voting_context: etherlinkPromotionFailure ? {
            period_index: '41',
            total_voting_power: '654200097180881',
            period: {
              promotion: {
                winner_candidate: '007a6ac98660fa68cab09abfb3a59be93ccf4a5d47aeb44a00ffb0a3babdba448a',
                yea_voting_power: '84856459995',
                nay_voting_power: '215727025713721',
                pass_voting_power: '0',
                total_voting_power: '654200097180881'
              }
            }
          } : null
        });
      }
      if (url.includes(`/contracts/${ETHERLINK_SEQUENCER_CONTRACT}/storage`)) {
        return fulfillJson(route, {
          config: {
            started_at_level: '10454078',
            period_length: '67200',
            proposal_quorum: '1',
            promotion_quorum: '8',
            promotion_supermajority: '75'
          },
          last_winner: null,
          voting_context: null
        });
      }
      if (url.includes(`/bigmaps/${ETHERLINK_PROPOSALS_BIGMAP}/keys`)) {
        if (etherlinkNullProposal) return fulfillJson(route, []);
        return fulfillJson(route, [
          {
            key: ETHERLINK_FAST_PROPOSAL,
            firstLevel: 12343010,
            lastLevel: 12345600,
            value: {
              proposers: [SAMPLE_ADDRESS],
              upvotes_voting_power: '93213811256339'
            }
          }
        ]);
      }
      if (url.includes(`/bigmaps/${ETHERLINK_UPVOTERS_BIGMAP}/keys`)) {
        if (etherlinkNullProposal) return fulfillJson(route, []);
        return fulfillJson(route, [
          { firstLevel: 12343020, key: { key_hash: SAMPLE_ADDRESS, bytes: ETHERLINK_FAST_PROPOSAL }, value: null },
          { firstLevel: 12343720, key: { key_hash: SAMPLE_ADDRESS_2, bytes: ETHERLINK_FAST_PROPOSAL }, value: null },
          { firstLevel: 12344420, key: { key_hash: SAMPLE_ADDRESS_3, bytes: ETHERLINK_FAST_PROPOSAL }, value: null }
        ]);
      }
      if (url.includes(`/bigmaps/${ETHERLINK_UPVOTE_COUNTS_BIGMAP}/keys`)) {
        return fulfillJson(route, [
          { key: SAMPLE_ADDRESS, value: '1', firstLevel: 12343020 },
          { key: SAMPLE_ADDRESS_2, value: '1', firstLevel: 12343720 }
        ]);
      }
      if (url.includes(`/bigmaps/${ETHERLINK_PROMOTION_VOTERS_BIGMAP}/keys`)) {
        return fulfillJson(route, ETHERLINK_PROMOTION_LEDGER.map((voter, index) => ({
          id: index + 1,
          firstLevel: voter.level,
          lastLevel: voter.level,
          key: voter.address,
          value: voter.vote
        })));
      }
      if (url.includes('/operations/transactions?')
        && (url.includes('targetCodeHash.in=') || url.includes('target.in='))
        && url.includes('entrypoint=new_proposal')) {
        return fulfillJson(route, [
          {
            id: 5010,
            hash: 'opEtherlinkHistoricalFast111111111111111111111',
            level: 12345610,
            timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
            targetCodeHash: 1029816579,
            parameter: { entrypoint: 'new_proposal', value: ETHERLINK_FAST_PROPOSAL }
          },
          {
            id: 5009,
            hash: 'opEtherlinkHistoricalFastOlder1111111111111111',
            level: 12342000,
            timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
            targetCodeHash: 1029816579,
            parameter: { entrypoint: 'new_proposal', value: ETHERLINK_FAST_OLDER_PROPOSAL }
          },
          {
            id: 5008,
            hash: 'opEtherlinkHistoricalSlow111111111111111111111',
            level: 12330000,
            timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS_3, alias: 'Pending Baker' },
            target: { address: ETHERLINK_SLOW_CONTRACT, alias: 'Etherlink SLOW governance' },
            targetCodeHash: 2062495254,
            parameter: { entrypoint: 'new_proposal', value: ETHERLINK_SLOW_PROPOSAL }
          },
          {
            id: 5007,
            hash: 'opEtherlinkHistoricalSequencer11111111111111',
            level: 12320000,
            timestamp: new Date(Date.now() - 8 * 3600000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            target: { address: ETHERLINK_SEQUENCER_CONTRACT, alias: 'Etherlink Sequencer governance' },
            targetCodeHash: 368151125,
            parameter: { entrypoint: 'new_proposal', value: ETHERLINK_SEQUENCER_PROPOSAL }
          }
        ]);
      }
      if (url.includes('/accounts?') && url.includes('address.in=')) {
        myTezosPortfolioCycles += 1;
        const params = new URL(url).searchParams;
        const requested = (params.get('address.in') || '').split(',').filter(Boolean);
        const accounts = new Map(sampleBakers.map((baker) => [baker.address, {
          address: baker.address,
          alias: baker.alias,
          type: 'delegate',
          firstActivity: 12000000,
          firstActivityTime: new Date(Date.now() - 240 * 86400000).toISOString(),
          stakingOpsCount: 1,
          balance: baker.balance,
          stakedBalance: baker.stakedBalance,
          unstakedBalance: 0,
          delegate: null
        }]));
        return fulfillJson(route, requested.map((address) => {
          const account = accounts.get(address) || {
          address,
          alias: null,
          type: 'user',
          firstActivity: 12000000,
          firstActivityTime: new Date(Date.now() - 240 * 86400000).toISOString(),
          stakingOpsCount: historyStakerAddresses.has(address) ? 1 : 0,
          balance: historyStakerAddresses.has(address) ? 700000000000 : 0,
          stakedBalance: historyStakerAddresses.has(address) ? 200000000000 : 0,
          unstakedBalance: 0,
          delegate: null
          };
          return myTezosViewLiveRefresh && address === SAMPLE_ADDRESS
            ? { ...account, balance: Number(account.balance || 0) + myTezosPortfolioCycles * 1_000_000 }
            : account;
        }));
      }
      if (url.includes('/operations/transactions?') && url.includes(`target=${ETHERLINK_FAST_CONTRACT}`)) {
        if (etherlinkPromotion) {
          const directLedgerOps = ETHERLINK_PROMOTION_LEDGER.slice(0, 22).map((voter, index) => ({
            id: 4000 + index,
            hash: `opEtherlinkLedgerVote${String(index + 1).padStart(2, '0')}111111111111111111`,
            level: voter.level,
            timestamp: new Date(Date.now() - (60 - index) * 60000).toISOString(),
            status: 'applied',
            sender: { address: voter.address, alias: voter.alias },
            target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
            parameter: { entrypoint: 'vote', value: voter.vote }
          })).reverse();
          return fulfillJson(route, [
            {
              id: 4020,
              hash: 'opEtherlinkFastPromotionYea1111111111111111111',
              level: 12345600,
              timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
              status: 'applied',
              sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
              target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
              parameter: { entrypoint: 'vote', value: 'yea' }
            },
            {
              id: 4019,
              hash: 'opEtherlinkFastPromotionPass11111111111111111',
              level: 12345590,
              timestamp: new Date(Date.now() - 12 * 60000).toISOString(),
              status: 'applied',
              sender: { address: ETHERLINK_SHARED_VOTING_KEY, alias: 'Shared Voting Key' },
              target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
              parameter: { entrypoint: 'vote', value: 'pass' }
            },
            ...directLedgerOps
          ]);
        }
        return fulfillJson(route, [
          {
            id: 4011,
            hash: 'opEtherlinkFastUpvote111111111111111111111111111',
            level: 12345600,
            timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
            parameter: { entrypoint: 'upvote', value: ETHERLINK_FAST_PROPOSAL }
          },
          {
            id: 4010,
            hash: 'opEtherlinkFastSubmit111111111111111111111111',
            level: 12343010,
            timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
            parameter: { entrypoint: 'new_proposal', value: ETHERLINK_FAST_PROPOSAL }
          }
        ]);
      }
      if (url.includes('/operations/transactions?') && (url.includes(`target=${ETHERLINK_SLOW_CONTRACT}`) || url.includes(`target=${ETHERLINK_SEQUENCER_CONTRACT}`))) {
        return fulfillJson(route, []);
      }
      if (ledgerFlowMocks && parsedUrl.pathname.endsWith('/operations/transactions/count')) {
        const txParams = parsedUrl.searchParams;
        const target = txParams.get('anyof.sender.target') || '';
        if (target) {
          ledgerFlowRequests.push({
            kind: 'count',
            target,
            limit: 0,
            sort: '',
            cursor: '',
            url
          });
          if (target === ledgerFlowDelayTarget) await sleep(900);
          if (target === ledgerFlowFailureTarget) {
            return route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"error":"smoke Ledger Flow count unavailable"}'
            });
          }
          return fulfillJson(route, sampleLedgerFlowCount(target, txParams));
        }
      }
      if (ledgerFlowMocks && parsedUrl.pathname.endsWith('/operations/originations')) {
        const target = parsedUrl.searchParams.get('originatedContract') || '';
        ledgerFlowRequests.push({
          kind: 'origination',
          target,
          limit: Number(parsedUrl.searchParams.get('limit') || 0),
          sort: parsedUrl.searchParams.get('sort.asc') || '',
          cursor: '',
          url
        });
        return fulfillJson(route, sampleLedgerFlowOriginationRow(target));
      }
      if (ledgerFlowMocks && parsedUrl.pathname.endsWith('/operations/transactions')) {
        const txParams = parsedUrl.searchParams;
        const target = txParams.get('anyof.sender.target') || '';
        if (target) {
          const sort = txParams.get('sort.desc') || '';
          const cursor = txParams.get('id.lt') || '';
          const limit = Number(txParams.get('limit') || 0);
          ledgerFlowRequests.push({ kind: 'transfers', target, limit, sort, cursor, url });
          if (target === ledgerFlowDelayTarget) await sleep(900);
          if (target === ledgerFlowFailureTarget) {
            return route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"error":"smoke Ledger Flow rows unavailable"}'
            });
          }
          let rows = sampleLedgerFlowFilteredRows(target, txParams);
          if (cursor) rows = rows.filter((row) => Number(row.id) < Number(cursor));
          rows.sort((left, right) => sort === 'amount'
            ? Number(right.amount) - Number(left.amount)
            : Number(right.id) - Number(left.id));
          return fulfillJson(route, rows.slice(0, limit || rows.length));
        }
        const firstInboundTarget = txParams.get('target') || '';
        if (firstInboundTarget && txParams.get('sort.asc') === 'id') {
          ledgerFlowRequests.push({
            kind: 'first-inbound',
            target: firstInboundTarget,
            limit: Number(txParams.get('limit') || 0),
            sort: 'id',
            cursor: '',
            url
          });
          return fulfillJson(route, sampleLedgerFlowFirstRow(firstInboundTarget));
        }
      }
      if (url.includes('/operations/transactions?')) {
        const txParams = parsedUrl.searchParams;
        if (whaleChamberMocks && txParams.has('amount.ge')) {
          whaleLiveRequests += 1;
          if (txParams.has('timestamp.ge') || txParams.has('timestamp.gt')) {
            whaleCursorRequests.push({ lane: 'transactions', cursor: txParams.has('timestamp.ge') ? 'timestamp.ge' : 'timestamp.gt' });
          }
          if (whaleFailureLane === 'transactions') {
            return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"smoke transaction lane unavailable"}' });
          }
          if (txParams.has('timestamp.ge')) {
            return fulfillJson(route, [{
              id: whaleFailureLane ? 9999 : 9001,
              hash: whaleFailureLane
                ? 'opSmokeLiveMustNotCommit111111111111111111111111'
                : 'opSmokeLivePrepend11111111111111111111111111111',
              timestamp: new Date(Date.now() + 1000).toISOString(),
              amount: 987654000000,
              status: 'applied',
              sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
              target: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }
            }]);
          }
          return fulfillJson(route, whaleLiveInitialRows);
        }
      }
      if (parsedUrl.pathname.endsWith('/tokens/transfers/count')) {
        return fulfillJson(route, parsedUrl.searchParams.has('level') ? 7 : 73);
      }
      if (url.includes('/operations/transactions/count')) return fulfillJson(route, 12345);
      if (url.includes('/operations/transactions?')
        && parsedUrl.searchParams.has('level')
        && (parsedUrl.searchParams.get('select') || '').includes('internal')) {
        const levelMod = Number(parsedUrl.searchParams.get('level')) % 4;
        if (levelMod === 0) return fulfillJson(route, []);
        if (levelMod === 1) {
          return fulfillJson(route, [
            { id: 105, hash: 'opHeartbeatArt', amount: 0, parameter: { entrypoint: 'collect', value: {} }, internal: false, sender: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }, target: { address: 'KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w', alias: 'Teia Community Marketplace' } },
            { id: 106, hash: 'opHeartbeatArtTransfer', amount: 750000000, parameter: null, internal: false, sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, target: { address: SAMPLE_ADDRESS_3, alias: 'Pending Baker' } }
          ]);
        }
        if (levelMod === 2) {
          return fulfillJson(route, [
            { id: 107, hash: 'opHeartbeatTransferOne', amount: 2500000000, parameter: null, internal: false, sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, target: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } },
            { id: 108, hash: 'opHeartbeatTransferTwo', amount: 42000000, parameter: null, internal: false, sender: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }, target: { address: SAMPLE_ADDRESS_3, alias: 'Pending Baker' } },
            { id: 110, hash: 'opHeartbeatDomains', amount: 0, parameter: { entrypoint: 'update_operators', value: [] }, internal: false, sender: { address: SAMPLE_ADDRESS }, target: { address: TEZOS_DOMAINS_CONTRACT, alias: 'Tezos Domains' } }
          ]);
        }
        return fulfillJson(route, [
          { id: 101, hash: 'opHeartbeatOne', amount: 2500000000, parameter: null, internal: false, sender: { address: SAMPLE_ADDRESS }, target: { address: SAMPLE_ADDRESS_2 } },
          { id: 102, hash: 'opHeartbeatTwo', amount: 42000000, parameter: { entrypoint: 'mint', value: {} }, internal: false, sender: { address: SAMPLE_ADDRESS_2 }, target: { address: SAMPLE_CONTRACT } },
          { id: 103, hash: 'opHeartbeatThree', amount: 0, parameter: { entrypoint: 'transfer', value: [] }, internal: false, sender: { address: SAMPLE_ADDRESS }, target: { address: 'KT1UncataloguedCall111111111111111111' } },
          { id: 109, hash: 'opHeartbeatL2Vote', amount: 0, parameter: { entrypoint: 'vote', value: 'yea' }, internal: false, sender: { address: SAMPLE_ADDRESS }, target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' } },
          { id: 104, hash: 'opHeartbeatFour', amount: 0, parameter: null, internal: true, sender: { address: SAMPLE_CONTRACT }, target: { address: SAMPLE_ADDRESS_2 } }
        ]);
      }
      if (url.includes('/operations/transactions?')) {
        return fulfillJson(route, [{
          id: 1,
          hash: 'opSmokeWhale',
          timestamp: new Date().toISOString(),
          amount: 2500000000,
          status: 'applied',
          sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
          target: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }
        }]);
      }
      if (url.includes('/operations/delegations?') && url.includes(`newDelegate=${SAMPLE_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            id: 10,
            timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
            sender: { address: SAMPLE_ADDRESS_2, alias: 'Fresh Delegator' },
            newDelegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            prevDelegate: null
          }
        ]);
      }
      if (whaleChamberMocks && whaleFailureLane === 'delegations' && url.includes('/operations/delegations?')) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"smoke delegation lane unavailable"}' });
      }
      if (url.includes('/operations/delegations?')) {
        if (whaleChamberMocks) {
          const cursor = parsedUrl.searchParams.has('timestamp.ge') ? 'timestamp.ge' : parsedUrl.searchParams.has('timestamp.gt') ? 'timestamp.gt' : '';
          if (cursor) whaleCursorRequests.push({ lane: 'delegations', cursor });
        }
        return fulfillJson(route, []);
      }
      if (url.includes('/operations/staking?') && url.includes(`baker=${SAMPLE_ADDRESS}`) && url.includes('action=stake')) {
        return fulfillJson(route, [
          {
            id: 20,
            timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),
            sender: { address: 'tz1SmokeStaker1111111111111111111111111', alias: 'Fresh Staker' },
            baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            amount: 125000000,
            action: 'stake'
          }
        ]);
      }
      if (whaleChamberMocks && url.includes('/operations/staking?')) {
        const action = parsedUrl.searchParams.get('action') || '';
        const cursor = parsedUrl.searchParams.has('timestamp.ge') ? 'timestamp.ge' : parsedUrl.searchParams.has('timestamp.gt') ? 'timestamp.gt' : '';
        if (cursor && ['stake', 'unstake'].includes(action)) whaleCursorRequests.push({ lane: action, cursor });
        if (whaleFailureLane === action) {
          return route.fulfill({ status: 503, contentType: 'application/json', body: `{"error":"smoke ${action} lane unavailable"}` });
        }
      }
      if (url.includes('/operations/staking?')) return fulfillJson(route, []);
      if (url.includes(`/accounts/${OVERDELEGATED_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: OVERDELEGATED_ADDRESS,
          type: 'delegate',
          alias: 'Overdelegated Baker',
          active: true,
          balance: 65000000000,
          stakedBalance: 65000000000,
          delegate: { address: OVERDELEGATED_ADDRESS, alias: 'Overdelegated Baker', active: true },
          firstActivity: 458753,
          firstActivityTime: '2019-05-30T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_ADDRESS}`) && !url.includes('/operations?')) {
        if (myTezosAccountDelayMs > 0) await sleep(myTezosAccountDelayMs);
        return fulfillJson(route, await sampleAddressAccount(request));
      }
      if (url.includes(`/accounts/${SAMPLE_ADDRESS_2}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_ADDRESS_2,
          type: 'delegate',
          alias: 'Second Baker',
          active: true,
          balance: 600000000000,
          stakedBalance: 500000000000,
          delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker', active: true },
          firstActivity: 458753,
          firstActivityTime: '2019-05-30T00:00:00Z'
        });
      }
      if (parsedUrl.pathname === `/v1/accounts/${SAMPLE_ADDRESS_3}`) {
        const baker = sampleBakers.find(({ address }) => address === SAMPLE_ADDRESS_3);
        return fulfillJson(route, {
          ...baker,
          type: 'delegate',
          active: true,
          delegate: { address: baker.address, alias: baker.alias, active: true },
          firstActivity: 12300000,
          firstActivityTime: '2026-07-01T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_IDLE_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_IDLE_ADDRESS,
          type: 'user',
          alias: 'Idle Account',
          active: true,
          balance: 1100000,
          stakedBalance: 0,
          delegate: null,
          firstActivity: 12000000,
          firstActivityTime: '2026-06-01T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_DELEGATOR_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_DELEGATOR_ADDRESS,
          type: 'user',
          alias: 'Malicious Sheep',
          active: true,
          balance: 42000000000,
          stakedBalance: 0,
          delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true },
          firstActivity: 6422529,
          firstActivityTime: '2024-11-19T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_REGULAR_DELEGATOR_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_REGULAR_DELEGATOR_ADDRESS,
          type: 'user',
          alias: 'Regular Delegator',
          active: true,
          balance: 256243269312,
          stakedBalance: 0,
          delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true },
          firstActivity: 6123456,
          firstActivityTime: '2024-07-15T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_SMALL_DELEGATOR_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_SMALL_DELEGATOR_ADDRESS,
          type: 'user',
          alias: 'Small Delegator',
          active: true,
          balance: 6915950133,
          stakedBalance: 0,
          delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker', active: true },
          firstActivity: 5123456,
          firstActivityTime: '2023-10-09T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_STAKER_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_STAKER_ADDRESS,
          type: 'user',
          alias: 'Staked Visitor',
          active: true,
          balance: 2610075826,
          stakedBalance: 2085602892,
          delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true },
          firstActivity: 1388526,
          firstActivityTime: '2021-03-17T10:50:09Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_HEAVY_STAKER_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_HEAVY_STAKER_ADDRESS,
          type: 'user',
          alias: 'Mostly Staked Visitor',
          active: true,
          balance: 199382376272,
          stakedBalance: 199362178211,
          delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker', active: true },
          firstActivity: 5544432,
          firstActivityTime: '2024-02-20T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_HISTORICAL_REWARDS_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_HISTORICAL_REWARDS_ADDRESS,
          type: 'user',
          alias: 'Former Delegator',
          active: true,
          balance: 125000000,
          stakedBalance: 0,
          delegate: null,
          firstActivity: 4123456,
          firstActivityTime: '2022-08-10T00:00:00Z'
        });
      }
      if (url.includes('/rewards/bakers/') && parsedUrl.searchParams.get('select')?.includes('totalBakingPower')) {
        const address = parsedUrl.pathname.split('/').pop();
        const closurePower = new Map([
          [SAMPLE_IDLE_ADDRESS, 20000000000],
          [SAMPLE_REGULAR_DELEGATOR_ADDRESS, 700000000000],
          [SAMPLE_STAKER_ADDRESS, 8000000000000]
        ]).get(address);
        return fulfillJson(route, closurePower
          ? [{ cycle: Number(parsedUrl.searchParams.get('cycle')), bakingPower: closurePower, totalBakingPower: 500000000000000 }]
          : []);
      }
      if (url.includes(`/rewards/stakers/${SAMPLE_REGULAR_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/bakers/${SAMPLE_REGULAR_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/delegators/${SAMPLE_REGULAR_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            cycle: 1143,
            delegatedBalance: 256243269312,
            baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            bakerRewards: {
              externalDelegatedBalance: 2562432693120,
              blockRewardsDelegated: 6000000,
              attestationRewardsDelegated: 3000000,
              dalAttestationRewardsDelegated: 1000000
            }
          },
          {
            cycle: 1142,
            delegatedBalance: 256243269312,
            baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            bakerRewards: {
              externalDelegatedBalance: 2562432693120,
              blockRewardsDelegated: 3000000,
              attestationRewardsDelegated: 2000000,
              dalAttestationRewardsDelegated: 0
            }
          }
        ]);
      }
      if (url.includes(`/rewards/stakers/${SAMPLE_SMALL_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/bakers/${SAMPLE_SMALL_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/delegators/${SAMPLE_SMALL_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            cycle: 1143,
            delegatedBalance: 6915950133,
            baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            bakerRewards: {
              externalDelegatedBalance: 69159501330,
              blockRewardsDelegated: 3000000,
              attestationRewardsDelegated: 1200000,
              dalAttestationRewardsDelegated: 0
            }
          },
          {
            cycle: 1142,
            delegatedBalance: 6915950133,
            baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            bakerRewards: {
              externalDelegatedBalance: 69159501330,
              blockRewardsDelegated: 1000000,
              attestationRewardsDelegated: 200000,
              dalAttestationRewardsDelegated: 0
            }
          }
        ]);
      }
      if (url.includes(`/rewards/stakers/${SAMPLE_STAKER_ADDRESS}`)) {
        return fulfillJson(route, [
          { cycle: 1143, baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, initialStake: 2085435252, finalStake: 2085602892, rewards: 167640 },
          { cycle: 1142, baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, initialStake: 2084981785, finalStake: 2085435252, rewards: 453467 },
          { cycle: 1141, baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, initialStake: 2084517277, finalStake: 2084981785, rewards: 464508 }
        ]);
      }
      if (url.includes(`/rewards/bakers/${SAMPLE_STAKER_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/delegators/${SAMPLE_STAKER_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            cycle: 1143,
            delegatedBalance: 524341384,
            bakerRewards: {
              externalDelegatedBalance: 33538225605649,
              blockRewardsDelegated: 1017848222,
              attestationRewardsDelegated: 1156300055,
              dalAttestationRewardsDelegated: 257256945
            }
          }
        ]);
      }
      if (url.includes(`/rewards/stakers/${SAMPLE_HEAVY_STAKER_ADDRESS}`)) {
        return fulfillJson(route, [
          { cycle: 1143, baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }, initialStake: 199345572778, finalStake: 199362178211, rewards: 16605433 },
          { cycle: 1142, baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }, initialStake: 199309175613, finalStake: 199345572778, rewards: 36397165 },
          { cycle: 1141, baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }, initialStake: 199270967036, finalStake: 199309175613, rewards: 38208577 }
        ]);
      }
      if (url.includes(`/rewards/bakers/${SAMPLE_HEAVY_STAKER_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/delegators/${SAMPLE_HEAVY_STAKER_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            cycle: 1143,
            delegatedBalance: 20197488,
            baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            bakerRewards: {
              externalDelegatedBalance: 3203106679689,
              blockRewardsDelegated: 99584197,
              attestationRewardsDelegated: 0,
              dalAttestationRewardsDelegated: 0
            }
          }
        ]);
      }
      if (url.includes(`/rewards/stakers/${SAMPLE_HISTORICAL_REWARDS_ADDRESS}`)
          || url.includes(`/rewards/bakers/${SAMPLE_HISTORICAL_REWARDS_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/delegators/${SAMPLE_HISTORICAL_REWARDS_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            cycle: 1023,
            delegatedBalance: 125000000,
            baker: { address: SAMPLE_ADDRESS, alias: 'Former Baker' },
            bakerRewards: {
              externalDelegatedBalance: 1250000000,
              blockRewardsDelegated: 5000000,
              attestationRewardsDelegated: 2500000,
              dalAttestationRewardsDelegated: 0
            }
          }
        ]);
      }
      if (url.includes(`/rewards/delegators/${SAMPLE_IDLE_ADDRESS}`)
          || url.includes(`/rewards/stakers/${SAMPLE_IDLE_ADDRESS}`)
          || url.includes(`/rewards/bakers/${SAMPLE_IDLE_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes('/rewards/delegators/') || url.includes('/rewards/bakers/')) {
        return fulfillJson(route, [
          {
            cycle: 1143,
            blockRewardsStakedOwn: 6000000,
            attestationRewardsStakedOwn: 3000000,
            dalAttestationRewardsStakedOwn: 0,
            blockFees: 100000
          }
        ]);
      }
      if (url.includes('/accounts?balance.ge=')) {
        return fulfillJson(route, [
          { address: SAMPLE_ADDRESS, balance: 1500000000000, lastActivity: '2023-01-01T00:00:00Z' },
          { address: SAMPLE_ADDRESS_2, balance: 1250000000000, lastActivity: null }
        ]);
      }
      if (url.includes('/accounts/') && url.includes('/operations?')) return fulfillJson(route, []);
      if (url.includes('/accounts/count')) return fulfillJson(route, 520000);
      if (url.includes('/contracts/count')) return fulfillJson(route, 95000);
      if (url.includes('/tokens/count')) return fulfillJson(route, 140000);
      if (url.includes('/smart_rollups?')) {
        return fulfillJson(route, [
          {
            address: 'sr1SmokeRollup111111111111111111111111111',
            alias: 'Tezos X rollup',
            lastCommitmentLevel: 12345000,
            inboxLevel: 12345610,
            lastActivityTime: new Date(Date.now() - 180000).toISOString()
          }
        ]);
      }
      if (url.includes('/smart_rollups/count')) return fulfillJson(route, 18);
      if (url.includes('/operations/ballots?') && (parsedUrl.searchParams.has('level') || parsedUrl.searchParams.has('level.ge'))) {
        const startLevel = Number(parsedUrl.searchParams.get('level') || parsedUrl.searchParams.get('level.ge'));
        const endLevel = Number(parsedUrl.searchParams.get('level') || parsedUrl.searchParams.get('level.le'));
        let level = endLevel;
        while (level >= startLevel && level % 4 !== 3) level -= 1;
        return fulfillJson(route, level >= startLevel ? [{
          id: 7101,
          hash: 'opHeartbeatL1Ballot',
          level,
          timestamp: new Date().toISOString(),
          status: 'applied',
          vote: 'yay',
          delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
        }] : []);
      }
      if (url.includes('/operations/proposals?') && (parsedUrl.searchParams.has('level') || parsedUrl.searchParams.has('level.ge'))) {
        const startLevel = Number(parsedUrl.searchParams.get('level') || parsedUrl.searchParams.get('level.ge'));
        const endLevel = Number(parsedUrl.searchParams.get('level') || parsedUrl.searchParams.get('level.le'));
        let level = endLevel;
        while (level >= startLevel && level % 4 !== 3) level -= 1;
        return fulfillJson(route, level >= startLevel ? [{
          id: 7201,
          hash: 'opHeartbeatL1Proposal',
          level,
          timestamp: new Date().toISOString(),
          status: 'applied',
          delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }
        }] : []);
      }
      if (url.includes('/operations/ballots?')) {
        return fulfillJson(route, [
          { id: 1, timestamp: new Date(Date.now() - 11 * 3600000).toISOString(), votingPower: 5000, vote: 'yay', delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } },
          { id: 2, timestamp: new Date(Date.now() - 9 * 3600000).toISOString(), votingPower: 2500, vote: 'pass', delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } }
        ]);
      }
      if (url.includes('/voting/periods/173/voters')) {
        return fulfillJson(route, [
          { status: 'voted_yay', votingPower: 6000, delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } },
          { status: 'voted_pass', votingPower: 1500, delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } }
        ]);
      }
      if (url.includes('/voting/periods?')) {
        if (parsedUrl.searchParams.has('firstLevel.ge')) {
          const startLevel = Number(parsedUrl.searchParams.get('firstLevel.ge'));
          const endLevel = Number(parsedUrl.searchParams.get('firstLevel.le'));
          let firstLevel = endLevel;
          while (firstLevel >= startLevel && firstLevel % 4 !== 3) firstLevel -= 1;
          return fulfillJson(route, firstLevel >= startLevel ? [{ index: 174, firstLevel, kind: 'proposal' }] : []);
        }
        return fulfillJson(route, [
          { firstLevel: 458753, kind: 'proposal' },
          { firstLevel: 5726209, kind: 'promotion' }
        ]);
      }
      if (url.includes('/voting/proposals?')) {
        return fulfillJson(route, [
          {
            hash: 'PtSmokeProposal',
            status: 'accepted',
            extras: { alias: 'Smoke' },
            initiator: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
          }
        ]);
      }
      if (url.includes('/voting/periods/current/voters')) {
        if (governanceLiveVote) {
          return fulfillJson(route, [
            { status: 'voted_yay', votingPower: 6000, delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } },
            { status: 'voted_pass', votingPower: 1500, delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } }
          ]);
        }
        return fulfillJson(route, []);
      }
      if (url.includes('/voting/periods/current')) {
        const start = new Date(Date.now() - 3600000).toISOString();
        const end = new Date(Date.now() + 2 * 86400000 + 21 * 3600000 + 21 * 60000).toISOString();
        if (governanceNoProposal) {
          return fulfillJson(route, {
            index: 172,
            kind: 'proposal',
            status: 'active',
            epoch: 91,
            firstLevel: 12340000,
            lastLevel: 12350800,
            startTime: start,
            endTime: end,
            proposalsCount: 0,
            totalVotingPower: 12000
          });
        }
        if (governanceLiveVote) {
          return fulfillJson(route, {
            index: 173,
            kind: 'promotion',
            status: 'active',
            epoch: 91,
            firstLevel: 12340000,
            lastLevel: 12350800,
            startTime: start,
            endTime: end,
            totalVotingPower: 12000,
            ballotsQuorum: 50,
            supermajority: 80,
            yayVotingPower: 6000,
            passVotingPower: 1500,
            nayVotingPower: 0,
            yayBallots: 1,
            passBallots: 1,
            nayBallots: 0,
            ballotsCount: 2,
            proposalHash: 'PtSmokeProposal',
            proposal: { hash: 'PtSmokeProposal', alias: 'Smoke' }
          });
        }
        if (governanceAdoptionPeriod) {
          return fulfillJson(route, {
            index: 175,
            kind: 'adoption',
            status: 'active',
            epoch: 91,
            firstLevel: 12350801,
            lastLevel: 12361600,
            startTime: start,
            endTime: end,
            totalVotingPower: 12000,
            proposalHash: 'PtSmokeProposal',
            proposal: { hash: 'PtSmokeProposal', alias: 'Smoke' }
          });
        }
        return fulfillJson(route, {
          index: 174,
          kind: 'testing',
          status: 'active',
          epoch: 91,
          firstLevel: 12340000,
          lastLevel: 12350800,
          startTime: start,
          endTime: end,
          totalVotingPower: 12000
        });
      }
      if (url.includes('/voting/epochs/')) {
        const proposal = {
          hash: 'PtSmokeProposal',
          alias: 'Smoke',
          firstPeriod: 172,
          lastPeriod: 174,
          status: 'active',
          initiator: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
          upvotes: 12
        };
        return fulfillJson(route, {
          index: 91,
          status: 'voting',
          proposals: governanceNoProposal ? [] : [proposal],
          periods: [
            { index: 172, kind: 'proposal', status: governanceNoProposal ? 'active' : 'success', startTime: governanceNoProposal ? new Date(Date.now() - 3600000).toISOString() : new Date(Date.now() - 4 * 86400000).toISOString(), endTime: governanceNoProposal ? new Date(Date.now() + 2 * 86400000 + 21 * 3600000 + 21 * 60000).toISOString() : new Date(Date.now() - 2 * 86400000).toISOString(), totalVotingPower: 12000 },
            { index: 173, kind: 'exploration', status: 'success', startTime: new Date(Date.now() - 2 * 86400000).toISOString(), endTime: new Date(Date.now() - 2 * 3600000).toISOString(), totalVotingPower: 12000, ballotsQuorum: 49.9, supermajority: 80, yayVotingPower: 6000, nayVotingPower: 0, passVotingPower: 1500 },
            { index: 174, kind: 'testing', status: governanceAdoptionPeriod ? 'success' : 'active', startTime: new Date(Date.now() - 3600000).toISOString(), endTime: new Date(Date.now() + 86400000).toISOString(), totalVotingPower: 12000 },
            ...(governanceAdoptionPeriod
              ? [{ index: 175, kind: 'adoption', status: 'active', startTime: new Date(Date.now() - 1800000).toISOString(), endTime: new Date(Date.now() + 2 * 86400000 + 21 * 3600000 + 21 * 60000).toISOString(), totalVotingPower: 12000 }]
              : [])
          ]
        });
      }
      if (url.includes(`/delegates/${OVERDELEGATED_ADDRESS}`)) return fulfillJson(route, overdelegatedBaker);
      if (url.includes('/delegates/')) {
        const address = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
        const baker = sampleBakers.find((entry) => entry.address === address) || sampleBakers[0];
        return fulfillJson(route, address === SAMPLE_ADDRESS ? await sampleAddressDelegate(request, baker) : baker);
      }
    }

    return route.fallback();
  });
  return {
    bakerPageOffsets,
    advanceBlockHead(amount = 1) { lbBlocksHead += Math.max(1, Number(amount) || 1); },
    setBlockHeadLag(value = 0) { blockHeadLagMs = Math.max(0, Number(value) || 0); },
    failBakerGovernance(fail = false) { bakerGovernanceFailure = Boolean(fail); },
    get bakerGovernanceSignalRequests() { return bakerGovernanceSignalRequests; },
    get bakerGovernanceHeavyRequests() { return bakerGovernanceHeavyRequests; },
    failWhaleLane(lane = '') { whaleFailureLane = lane; },
    failLedgerFlowTarget(target = '') { ledgerFlowFailureTarget = target; },
    delayLedgerFlowTarget(target = '') { ledgerFlowDelayTarget = target; },
    mismatchWhaleDormancy(on = true) { whaleDormancyMismatch = Boolean(on); },
    get ledgerFlowRequests() { return ledgerFlowRequests.map((entry) => ({ ...entry })); },
    get ledgerFlowTzktRequests() { return [...ledgerFlowTzktRequests]; },
    get whaleArtifactRequests() { return whaleArtifactRequests; },
    get whaleCursorRequests() { return whaleCursorRequests.map((entry) => ({ ...entry })); },
    get whaleLiveRequests() { return whaleLiveRequests; }
  };
}

function log(message) {
  console.log(message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertNormalizedChamberShell(page, overlaySelector, dialogSelector, expectedSize, label) {
  await page.waitForFunction(({ overlaySelector, dialogSelector, expectedSize }) => {
    const dialog = document.querySelector(overlaySelector)?.querySelector(dialogSelector);
    if (!dialog) return false;
    const rect = dialog.getBoundingClientRect();
    const maxWidths = { narrow: 900, standard: 1180, wide: 1480 };
    const mobile = window.innerWidth < 760;
    const expectedWidth = mobile ? window.innerWidth : Math.min(maxWidths[expectedSize], window.innerWidth - 32);
    const expectedHeight = mobile ? window.innerHeight : window.innerHeight - 32;
    return Math.abs(rect.width - expectedWidth) <= 0.25 && Math.abs(rect.height - expectedHeight) <= 0.25;
  }, { overlaySelector, dialogSelector, expectedSize }, { timeout: 5000 });
  const geometry = await page.evaluate(({ overlaySelector, dialogSelector }) => {
    const overlay = document.querySelector(overlaySelector);
    const dialog = overlay?.querySelector(dialogSelector);
    const rect = dialog?.getBoundingClientRect();
    return {
      normalized: overlay?.classList.contains('chamber-shell-normalized') || false,
      roomShell: dialog?.classList.contains('chamber-room-shell') || false,
      roomSize: dialog?.dataset.roomSize || '',
      width: rect?.width || 0,
      height: rect?.height || 0,
      radius: Number.parseFloat(dialog ? getComputedStyle(dialog).borderTopLeftRadius : '0') || 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  }, { overlaySelector, dialogSelector });
  const maxWidths = { narrow: 900, standard: 1180, wide: 1480 };
  const mobile = geometry.viewportWidth < 760;
  const expectedWidth = mobile ? geometry.viewportWidth : Math.min(maxWidths[expectedSize], geometry.viewportWidth - 32);
  const expectedHeight = mobile ? geometry.viewportHeight : geometry.viewportHeight - 32;
  assert(geometry.normalized && geometry.roomShell && geometry.roomSize === expectedSize,
    `${label}: shared Chamber shell lifecycle missing ${JSON.stringify(geometry)}`);
  assert(Math.abs(geometry.width - expectedWidth) <= 2 && Math.abs(geometry.height - expectedHeight) <= 2,
    `${label}: normalized Chamber geometry drifted ${JSON.stringify({ ...geometry, expectedWidth, expectedHeight })}`);
  assert(mobile ? geometry.radius <= 0.5 : Math.abs(geometry.radius - 16) <= 0.5,
    `${label}: normalized Chamber radius drifted ${JSON.stringify(geometry)}`);
}

async function assertChamberOrder(page, label) {
  const chamberState = await page.evaluate(() => {
    const cardKey = (el) => el.id || el.dataset.stat || '';
    return {
      order: Array.from(document.querySelectorAll('#chambers-grid .stat-card')).map(cardKey),
      categories: Array.from(document.querySelectorAll('#chambers-grid > .chamber-category')).map((category) => ({
        key: category.dataset.chamberCategory || '',
        label: category.querySelector(':scope > .chamber-category-head .chamber-category-name')?.textContent?.trim() || '',
        question: category.querySelector(':scope > .chamber-category-head .chamber-category-question')?.textContent?.trim() || '',
        count: category.querySelector(':scope > .chamber-category-head .chamber-category-count')?.textContent?.trim() || '',
        countLabel: category.querySelector(':scope > .chamber-category-head .chamber-category-count')?.getAttribute('aria-label') || '',
        open: category.dataset.chamberExpanded === 'true',
        tagName: category.tagName,
        toggleTag: category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.tagName || '',
        hideTag: category.querySelector(':scope > .chamber-category-head > .chamber-category-hide')?.tagName || '',
        cards: Array.from(category.querySelectorAll(':scope > .chamber-category-cards > .stat-card')).map(cardKey),
        layouts: Array.from(
          category.querySelectorAll(':scope > .chamber-category-cards > .stat-card'),
          (card) => card.dataset.chamberLayout || ''
        )
      })),
      viewportWidth: window.innerWidth,
      legacyPairs: document.querySelectorAll('#chambers-grid > [data-chamber-pair]').length
    };
  });
  assert(
    chamberState.order.length === EXPECTED_CHAMBER_ORDER.length
      &&
    EXPECTED_CHAMBER_ORDER.every((key, index) => chamberState.order[index] === key),
    `${label}: Chambers order mismatch, expected ${EXPECTED_CHAMBER_ORDER.join(', ')} but saw ${chamberState.order.join(', ')}`
  );
  assert(
    chamberState.categories.length === EXPECTED_CHAMBER_CATEGORIES.length,
    `${label}: expected ${EXPECTED_CHAMBER_CATEGORIES.length} Chamber categories, saw ${JSON.stringify(chamberState.categories)}`
  );
  EXPECTED_CHAMBER_CATEGORIES.forEach((expected, index) => {
    const actual = chamberState.categories[index];
    assert(actual?.key === expected.key, `${label}: Chamber category ${index + 1} key mismatch ${JSON.stringify(actual)}`);
    assert(actual?.label === expected.label, `${label}: Chamber category ${expected.key} label mismatch ${JSON.stringify(actual)}`);
    assert(actual?.question === expected.question, `${label}: Chamber category ${expected.key} question mismatch ${JSON.stringify(actual)}`);
    assert(actual?.tagName === 'SECTION' && actual?.toggleTag === 'BUTTON' && actual?.hideTag === 'BUTTON', `${label}: Chamber category ${expected.key} must separate disclosure and Hide buttons ${JSON.stringify(actual)}`);
    assert(actual?.cards.join(',') === expected.cards.join(','), `${label}: Chamber category ${expected.key} membership mismatch ${JSON.stringify(actual)}`);
    assert(actual?.layouts.join(',') === expected.layouts.join(','), `${label}: Chamber category ${expected.key} density layout mismatch ${JSON.stringify(actual)}`);
    assert(actual?.count === String(expected.cards.length).padStart(2, '0'), `${label}: Chamber category ${expected.key} visible count mismatch ${JSON.stringify(actual)}`);
    assert(actual?.countLabel === `${expected.cards.length} ${expected.cards.length === 1 ? 'room' : 'rooms'}`, `${label}: Chamber category ${expected.key} accessible count mismatch ${JSON.stringify(actual)}`);
  });
  const uniqueCards = new Set(chamberState.categories.flatMap((category) => category.cards));
  assert(uniqueCards.size === EXPECTED_CHAMBER_ORDER.length, `${label}: a Chamber card is duplicated across categories ${JSON.stringify(chamberState.categories)}`);
  assert(chamberState.legacyPairs === 0, `${label}: legacy data-chamber-pair wrappers remain`);
}

async function assertPromotedLauncherGeometry(page, label, { desktop = false } = {}) {
  for (const categoryKey of ['capital', 'bakers', 'history']) {
    const toggle = page.locator(`#chambers-grid > .chamber-category[data-chamber-category="${categoryKey}"] .chamber-category-toggle`);
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.evaluate((button) => button.click());
  }
  await page.waitForFunction(() => {
    return ['whale-watch-entry-card', 'baker-directory-entry-card', 'cycle-history-entry-card']
      .every((id) => document.getElementById(id)?.getBoundingClientRect().height > 0);
  }, null, { timeout: 5000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => (
      animation.effect?.target?.closest?.('#chambers-grid')
      && animation.effect.getTiming().iterations !== Infinity
    )).map(animation => animation.finished.catch(() => {})));
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const geometry = await page.evaluate(() => {
    const readCard = (selector, railsSelector) => {
      const card = document.querySelector(selector);
      const front = card?.querySelector('.card-front');
      const cardRect = card?.getBoundingClientRect();
      const frontRect = front?.getBoundingClientRect();
      const boundedSelectors = [
        '.card-copy-link',
        '.chamber-info-btn',
        '.chamber-expand-cue',
        railsSelector
      ];
      const controls = boundedSelectors.flatMap((boundedSelector) => (
        [...(card?.querySelectorAll(boundedSelector) || [])].map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            selector: boundedSelector,
            visible: rect.width > 0 && rect.height > 0,
            inside: Boolean(cardRect
              && rect.left >= cardRect.left - 1
              && rect.right <= cardRect.right + 1
              && rect.top >= cardRect.top - 1
              && rect.bottom <= cardRect.bottom + 1),
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
          };
        })
      ));
      return {
        exists: Boolean(card && front),
        cardHeight: cardRect?.height || 0,
        frontHeight: frontRect?.height || 0,
        cardScrollHeight: card?.scrollHeight || 0,
        cardClientHeight: card?.clientHeight || 0,
        frontScrollHeight: front?.scrollHeight || 0,
        frontClientHeight: front?.clientHeight || 0,
        controls
      };
    };
    return {
      whale: readCard('#whale-watch-entry-card', '.whale-watch-entry-rails'),
      baker: readCard('#baker-directory-entry-card', '.baker-directory-entry-rails'),
      cycle: readCard(
        '#cycle-history-entry-card',
        '.cycle-history-entry-range, .cycle-history-entry-metrics, .cycle-history-entry-route'
      )
    };
  });
  for (const [name, card] of Object.entries(geometry)) {
    assert(card.exists && card.cardHeight > 0 && card.frontHeight > 0, `${label}: ${name} launcher card is missing or collapsed ${JSON.stringify(card)}`);
    assert(card.cardScrollHeight <= card.cardClientHeight + 1, `${label}: ${name} launcher card clips its content ${JSON.stringify(card)}`);
    assert(card.frontScrollHeight <= card.frontClientHeight + 1, `${label}: ${name} launcher front clips its content ${JSON.stringify(card)}`);
    const outside = card.controls.filter((control) => control.visible && !control.inside);
    assert(outside.length === 0, `${label}: ${name} launcher control or route rail escapes the card ${JSON.stringify(outside)}`);
  }
  if (desktop) {
    assert(Math.abs(geometry.whale.cardHeight - geometry.baker.cardHeight) <= 1, `${label}: Whale Watch and Baker Directory desktop pair heights differ ${JSON.stringify(geometry)}`);
  }
}

async function assertChamberControlGeometry(page, label) {
  const issues = await page.evaluate(() => {
    const cardSelectors = [
      '#network-pulse-entry-card',
      '#capital-entry-card',
      '#whale-watch-entry-card',
      '#baker-directory-entry-card',
      '#chamber-entry-card',
      '#staking-entry-card',
      '#tezlink-entry-card',
      '#etherlink-governance-entry-card',
      '#lb-entry-card',
      '#ledger-flow-entry-card',
      '#protocol-history-entry-card',
      '#cycle-history-entry-card',
      '#maxis-entry-card',
      '#tezoscrp-entry-card',
      '#tezos-domains-entry-card',
      '#chambers-section [data-stat="tz4-adoption"]',
      '#chambers-section [data-stat="network-health"]'
    ];
    const contentSelector = [
      '.card-front .stat-label',
      '.card-front .stat-value',
      '.card-front .stat-description',
      '.card-front .chamber-entry-icon',
      '.card-front .chamber-entry-status',
      '.card-front .chamber-entry-metrics',
      '.card-front .chamber-entry-metric',
      '.card-front .staking-entry-head',
      '.card-front .staking-entry-tape',
      '.card-front .staking-entry-move',
      '.card-front .tezlink-entry-main',
      '.card-front .tezlink-entry-metrics',
      '.card-front .tezlink-entry-metric',
      '.card-front .tezlink-entry-tape',
      '.card-front .tezlink-tape-row',
      '.card-front .etherlink-gov-entry-metrics',
      '.card-front .etherlink-gov-entry-metric',
      '.card-front .ledger-flow-entry-main',
      '.card-front .ledger-flow-entry-metrics',
      '.card-front .maxis-entry-head',
      '.card-front .maxis-entry-grid',
      '.card-front .maxis-entry-leader',
      '.card-front .maxis-entry-season-front',
      '.card-front .maxis-entry-season-copy',
      '.card-front .maxis-entry-identity-strip',
      '.card-front .maxis-entry-identity-strip > span',
      '.card-front .maxis-entry-season-meta',
      '.card-front .maxis-entry-season-pulse',
      '.card-front .maxis-entry-pulse-line',
      '.card-front .maxis-entry-season-crowns',
      '.card-front .maxis-entry-season-crowns > span',
      '.card-front .tezoscrp-entry-main',
      '.card-front .tezoscrp-entry-identity-strip',
      '.card-front .tezoscrp-entry-identity-strip > span',
      '.card-front .tezoscrp-entry-meta',
      '.card-front .tezoscrp-entry-pulse',
      '.card-front .tezoscrp-entry-pulse-line',
      '.card-front .tezoscrp-entry-icons',
      '.card-front .capital-entry-price-chart',
      '.card-front .network-health-blocks',
      '.card-front .network-health-block',
      '.card-front .health-live-tape',
      '.card-front .health-live-row',
      '.card-front .lb-entry-meter',
      '.card-front .lb-entry-vote-tape',
      '.card-front .lb-entry-vote-row',
      '.card-front .lb-entry-vote-baker',
      '.card-front .lb-entry-vote-badge',
      '.card-front .tz4-entry-preview',
      '.card-front .tz4-entry-preview-title',
      '.card-front .tz4-entry-preview-row',
      '.card-front .tz4-entry-preview-empty',
      '.card-front .tz4-entry-preview-more',
      '.card-front .sparkline-container'
    ].join(', ');

    const visibleBox = (node) => {
      if (!node) return null;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return null;
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height
      };
    };
    const nameOf = (node) => {
      if (node.id) return `#${node.id}`;
      const classes = Array.from(node.classList || []).slice(0, 3).join('.');
      return classes ? `.${classes}` : node.tagName.toLowerCase();
    };
    const overlapArea = (a, b) => {
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return width > 1 && height > 1 ? width * height : 0;
    };
    const found = [];

    for (const selector of cardSelectors) {
      const card = document.querySelector(selector);
      const cardBox = visibleBox(card);
      if (!card || !cardBox) {
        found.push({ card: selector, issue: 'missing-card' });
        continue;
      }
      const controls = Array.from(card.querySelectorAll(':scope > .card-copy-link, :scope > .card-share-btn, :scope > .card-info-btn, :scope > .card-history-btn, :scope .chamber-entry-footer > .chamber-expand-cue'))
        .map((node) => ({ node, name: nameOf(node), box: visibleBox(node) }))
        .filter((item) => item.box);
      const topControls = controls.filter((item) => !item.node.classList.contains('chamber-expand-cue'));
      const footer = card.querySelector(':scope .chamber-entry-footer');
      const footerBox = visibleBox(footer);
      const content = Array.from(card.querySelectorAll(contentSelector))
        .filter((node) => !node.closest('.chamber-entry-footer'))
        .map((node) => ({ node, name: nameOf(node), box: visibleBox(node) }))
        .filter((item) => item.box);

      const shareControl = card.querySelector(':scope > .card-share-btn');
      const copyControl = card.querySelector(':scope > .card-copy-link');
      const infoControl = card.querySelector(':scope > .card-info-btn');
      const historyControl = card.querySelector(':scope > .card-history-btn');
      const infoTooltip = card.querySelector(':scope > .card-tooltip');
      if (!shareControl) found.push({ card: selector, issue: 'missing-share-control' });
      else if (!shareControl.querySelector('svg')) found.push({ card: selector, issue: 'share-control-missing-svg' });
      if (!infoControl) found.push({ card: selector, issue: 'missing-info-control' });
      else if (!infoControl.querySelector('svg')) found.push({ card: selector, issue: 'info-control-missing-svg' });
      if (!infoTooltip) found.push({ card: selector, issue: 'missing-info-tooltip' });
      else if (infoTooltip.previousElementSibling !== infoControl) found.push({ card: selector, issue: 'info-tooltip-not-adjacent' });
      if (shareControl && copyControl && infoControl && historyControl) {
        const expectedControlSize = window.innerWidth < 760 ? 27.2 : 25.6;
        const expectedControlGap = window.innerWidth < 760 ? 8.8 : 8.4;
        const stack = [
          ['share', shareControl],
          ['copy', copyControl],
          ['info', infoControl],
          ['history', historyControl]
        ].map(([name, node]) => ({ name, box: visibleBox(node) })).filter((item) => item.box);
        for (const control of stack) {
          if (
            Math.abs(control.box.width - expectedControlSize) > 0.35
            || Math.abs(control.box.height - expectedControlSize) > 0.35
          ) {
            found.push({
              card: selector,
              issue: 'control-stack-size',
              control: control.name,
              expected: expectedControlSize,
              actual: {
                width: Number(control.box.width.toFixed(2)),
                height: Number(control.box.height.toFixed(2))
              }
            });
          }
        }
        for (let index = 1; index < stack.length; index += 1) {
          if (stack[index].box.top <= stack[index - 1].box.top + 1) {
            found.push({ card: selector, issue: 'control-stack-order', before: stack[index - 1].name, after: stack[index].name, stack: stack.map((item) => ({ name: item.name, top: Number(item.box.top.toFixed(2)) })) });
          }
          const controlGap = stack[index].box.top - stack[index - 1].box.bottom;
          if (Math.abs(controlGap - expectedControlGap) > 0.35) {
            found.push({
              card: selector,
              issue: 'control-stack-gap',
              before: stack[index - 1].name,
              after: stack[index].name,
              expected: expectedControlGap,
              actual: Number(controlGap.toFixed(2))
            });
          }
          if (Math.abs(stack[index].box.left - stack[0].box.left) > 2) {
            found.push({ card: selector, issue: 'control-stack-column', control: stack[index].name, left: Number(stack[index].box.left.toFixed(2)), expected: Number(stack[0].box.left.toFixed(2)) });
          }
        }
      }

      if (!footer || !footerBox) {
        found.push({ card: selector, issue: 'missing-footer-rail' });
      } else {
        const expectedFreshness = card.dataset.updatedLabel || '';
        const actualFreshness = footer.querySelector('.chamber-entry-freshness')?.textContent?.trim() || '';
        if (expectedFreshness && actualFreshness !== expectedFreshness) {
          found.push({ card: selector, issue: 'footer-freshness-mismatch', expected: expectedFreshness, actual: actualFreshness });
        }
        if (footerBox.bottom > cardBox.bottom + 1 || footerBox.top < cardBox.top - 1) {
          found.push({ card: selector, issue: 'footer-outside-card', footer: footerBox, cardBox });
        }
        for (const item of content) {
          const overlap = overlapArea(footerBox, item.box);
          if (overlap > 0) {
            found.push({ card: selector, issue: 'footer-content-overlap', footer: '.chamber-entry-footer', content: item.name, overlap: Number(overlap.toFixed(2)), cardBox, footerBox, contentBox: item.box });
          }
        }
      }

      for (const item of content) {
        if (item.box.top < cardBox.top - 1 || item.box.bottom > cardBox.bottom + 1) {
          found.push({ card: selector, issue: 'content-outside-card', content: item.name, contentBox: item.box, cardBox });
        }
      }

      for (const control of topControls) {
        if (control.box.top < cardBox.top + 8) {
          found.push({ card: selector, issue: 'top-control-too-high', control: control.name, topGap: Number((control.box.top - cardBox.top).toFixed(2)) });
        }
        if (control.box.right > cardBox.right - 8) {
          found.push({ card: selector, issue: 'top-control-too-far-right', control: control.name, rightGap: Number((cardBox.right - control.box.right).toFixed(2)) });
        }
      }

      for (let first = 0; first < controls.length; first += 1) {
        for (let second = first + 1; second < controls.length; second += 1) {
          const overlap = overlapArea(controls[first].box, controls[second].box);
          if (overlap > 0) {
            found.push({ card: selector, issue: 'control-control-overlap', first: controls[first].name, second: controls[second].name, overlap: Number(overlap.toFixed(2)) });
          }
        }
      }

      for (const control of controls) {
        for (const item of content) {
          if (control.node === item.node || control.node.contains(item.node) || item.node.contains(control.node)) continue;
          const overlap = overlapArea(control.box, item.box);
          if (overlap > 0) {
            found.push({ card: selector, issue: 'control-content-overlap', control: control.name, content: item.name, overlap: Number(overlap.toFixed(2)), cardBox, controlBox: control.box, contentBox: item.box });
          }
        }
      }
    }

    return found;
  });
  assert(issues.length === 0, `${label}: chamber controls should not overlap content or each other: ${JSON.stringify(issues)}`);
}

async function assertChamberInfoTooltipsContained(page, label) {
  const selectors = [
    '#staking-entry-card',
    '#chambers-section [data-stat="tz4-adoption"]',
    '#lb-entry-card',
    '#chambers-section [data-stat="network-health"]'
  ];

  for (const selector of selectors) {
    const button = page.locator(`${selector} > .card-info-btn`);
    await button.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForFunction(cardSelector => {
      const card = document.querySelector(cardSelector);
      return card && !card.hasAttribute('data-chamber-skeleton')
        && card.querySelector(':scope > .card-info-btn')?.dataset.chamberInfoWired === '1';
    }, selector, { timeout: 10000 });
    await button.click();
    await page.waitForFunction((cardSelector) => (
      document.querySelector(`${cardSelector} > .card-info-btn`)?.getAttribute('aria-expanded') === 'true'
    ), selector, { timeout: 5000 }).catch(async error => {
      const state = await page.locator(selector).evaluate(card => ({
        skeleton: card.hasAttribute('data-chamber-skeleton'),
        busy: card.getAttribute('aria-busy'),
        info: card.querySelector(':scope > .card-info-btn')?.outerHTML,
        focus: document.activeElement?.outerHTML,
        openDialogs: [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(node => node.getClientRects().length).map(node => node.id)
      }));
      throw new Error(`${label}: ${selector} info tooltip did not open: ${JSON.stringify(state)}`, { cause: error });
    });
    // Fonts and late card hydration can queue another placement after opening.
    // Read one settled receipt instead of sampling an arbitrary 350 ms later.
    const geometryHandle = await page.waitForFunction((cardSelector) => {
      const card = document.querySelector(cardSelector);
      const tooltip = card.querySelector(':scope > .card-tooltip');
      const box = tooltip?.getBoundingClientRect();
      const geometry = {
        left: box?.left ?? -1,
        right: box?.right ?? -1,
        top: box?.top ?? -1,
        bottom: box?.bottom ?? -1,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        visible: Boolean(tooltip && getComputedStyle(tooltip).visibility === 'visible'),
        tooltipClass: tooltip?.className || '',
        buttonClass: card.querySelector(':scope > .card-info-btn')?.className || '',
        expanded: card.querySelector(':scope > .card-info-btn')?.getAttribute('aria-expanded') || '',
        adjacent: tooltip?.previousElementSibling === card.querySelector(':scope > .card-info-btn'),
        scrollable: Boolean(tooltip && tooltip.scrollHeight > tooltip.clientHeight + 1),
        maxHeight: tooltip ? getComputedStyle(tooltip).maxHeight : '',
        inlineStyle: tooltip?.getAttribute('style'),
        computedTop: tooltip ? getComputedStyle(tooltip).top : '',
        cardTop: card.getBoundingClientRect().top,
        offsetParent: tooltip?.offsetParent?.className,
        stakingStyles: Boolean(document.querySelector('link[href*="staking-chamber.min.css"]')?.sheet)
      };
      const ready = geometry.visible && getComputedStyle(tooltip).opacity === '1'
        && geometry.left >= 10 && geometry.top >= 10
        && geometry.right <= geometry.viewportWidth - 10
        && geometry.bottom <= geometry.viewportHeight - 10
        && tooltip.getAnimations().every(animation => animation.playState !== 'running' && animation.playState !== 'pending');
      if (!ready) {
        delete tooltip.__smokeSettledGeometry;
        return false;
      }
      const signature = [box.left, box.top, box.right, box.bottom, geometry.cardTop].join(':');
      const previous = tooltip.__smokeSettledGeometry;
      if (previous?.signature !== signature) {
        tooltip.__smokeSettledGeometry = { signature, since: performance.now() };
        return false;
      }
      if (performance.now() - previous.since < 64) return false;
      delete tooltip.__smokeSettledGeometry;
      return geometry;
    }, selector, { timeout: 5000 }).catch(async error => {
      const box = await page.locator(`${selector} > .card-tooltip`).boundingBox();
      throw new Error(`${label}: ${selector} info tooltip did not settle inside the viewport: ${JSON.stringify(box)}`, { cause: error });
    });
    const geometry = await geometryHandle.jsonValue();
    await geometryHandle.dispose();
    assert(
      geometry.visible
        && geometry.left >= 10
        && geometry.top >= 10
        && geometry.right <= geometry.viewportWidth - 10
        && geometry.bottom <= geometry.viewportHeight - 10,
      `${label}: ${selector} info tooltip must remain fully inside the viewport: ${JSON.stringify(geometry)}`
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction((cardSelector) => (
      document.querySelector(`${cardSelector} > .card-info-btn`)?.getAttribute('aria-expanded') === 'false'
    ), selector, { timeout: 5000 });
  }
}

async function readMaxisLauncherGeometry(page) {
  return page.locator('#maxis-entry-card').evaluate((card) => {
    const visible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && node.getClientRects().length > 0;
    };
    const box = (node) => {
      const bounds = node?.getBoundingClientRect();
      return bounds ? {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height
      } : null;
    };
    const front = card.querySelector('.maxis-entry-front');
    const stage = card.querySelector('.maxis-entry-season-front');
    const pair = card.closest('.chamber-card-pair');
    const frontBox = box(front);
    const frontStyle = front ? getComputedStyle(front) : null;
    const paddingLeft = Number.parseFloat(frontStyle?.paddingLeft || '0') || 0;
    const paddingRight = Number.parseFloat(frontStyle?.paddingRight || '0') || 0;
    const identityCells = Array.from(card.querySelectorAll('.maxis-entry-identity-strip > span')).filter(visible);
    const identityLeaders = Array.from(card.querySelectorAll('.maxis-entry-identity-leader')).filter(visible);
    const pulseLines = Array.from(card.querySelectorAll('.maxis-entry-pulse-line')).filter(visible);
    const seasonCrowns = Array.from(card.querySelectorAll('.maxis-entry-season-crowns > span')).filter(visible);
    const cardBox = box(card);
    const stageBox = box(stage);
    const footerBox = box(card.querySelector('.chamber-entry-footer'));
    return {
      card: cardBox,
      pair: box(pair),
      stage: stageBox,
      footer: footerBox,
      contentLeft: frontBox ? frontBox.left + paddingLeft : null,
      contentRight: frontBox ? frontBox.right - paddingRight : null,
      contentWidth: front ? front.clientWidth - paddingLeft - paddingRight : 0,
      identityCount: identityCells.length,
      identityLeaderCount: identityLeaders.length,
      pulseLineCount: pulseLines.length,
      seasonCrownCount: seasonCrowns.length,
      cardTail: cardBox && frontBox ? Number((cardBox.bottom - frontBox.bottom).toFixed(2)) : null,
      clippedIdentityCells: identityCells
        .filter((node) => node.scrollWidth > node.clientWidth + 1)
        .map((node) => ({
          text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth
        })),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
}

async function assertResponsiveChamberCards(browser, baseUrl, viewport, label, mockOptions = {}) {
  const issues = [];
  const context = await browser.newContext({
    viewport,
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context, mockOptions);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, label, issues);
  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `${label}: dashboard failed with HTTP ${response?.status()}`);
  await page.waitForFunction(() => document.querySelectorAll('#chambers-section .chamber-entry-card[data-updated-label]').length >= 6, null, { timeout: 15000 });
  await page.evaluate(() => {
    document.querySelectorAll('#chambers-section [data-chamber-entry-id]').forEach((card) => {
      card.dispatchEvent(new PointerEvent('pointerenter'));
    });
  });
  try {
    await page.waitForFunction((expectedCount) => {
      const cards = Array.from(document.querySelectorAll('#chambers-section .chamber-entry-card'));
      return cards.length === expectedCount && cards.every((card) => (
        Boolean(card.querySelector(':scope .card-front .chamber-entry-title'))
        && card.querySelector(':scope .chamber-entry-footer > .chamber-expand-cue')?.tagName === 'BUTTON'
      ));
    }, EXPECTED_CHAMBER_ORDER.length, { timeout: 15000 });
  } catch {
    const readiness = await page.evaluate(() => Array.from(document.querySelectorAll('#chambers-section .chamber-entry-card')).map((card) => ({
      id: card.id || card.dataset.stat || '',
      title: card.querySelector(':scope .card-front .chamber-entry-title')?.textContent?.trim() || '',
      cueTag: card.querySelector(':scope .chamber-entry-footer > .chamber-expand-cue')?.tagName || ''
    })));
    throw new Error(`${label}: Chamber launchers did not settle: ${JSON.stringify(readiness)}`);
  }
  await assertChamberOrder(page, label);
  await page.waitForTimeout(250);
  const initialCategories = await page.evaluate(() => Array.from(
    document.querySelectorAll('#chambers-grid > .chamber-category'),
    (category) => ({
      key: category.dataset.chamberCategory || '',
      open: category.dataset.chamberExpanded === 'true',
      visibleCards: Array.from(category.querySelectorAll(':scope > .chamber-category-cards > .stat-card')).filter((card) => card.getClientRects().length > 0).length
    })
  ));
  assert(
    hasExpectedDefaultChamberDisclosure(initialCategories),
    `${label}: Ecosystem must be the only default-open Chamber category ${JSON.stringify(initialCategories)}`
  );
  if (mockOptions.governanceLiveVote) {
    await page.waitForFunction(() => {
      const card = document.querySelector('#chamber-entry-card.chamber-entry-wide[data-chamber-entry-size="wide"]');
      const metrics = card?.querySelector('.chamber-entry-metrics');
      return Boolean(card && metrics && !metrics.hidden && metrics.querySelector('.chamber-entry-metric strong'));
    }, null, { timeout: 10000 });
  }
  if (viewport.width < 760) {
    const capitalHead = page.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] > .chamber-category-head > .chamber-category-toggle');
    await page.evaluate(() => {
      const html = document.documentElement;
      const previousBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="capital"] > .chamber-category-head > .chamber-category-toggle')
        ?.scrollIntoView({ block: 'center', behavior: 'auto' });
      html.style.scrollBehavior = previousBehavior;
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const beforeToggle = await page.evaluate(() => ({ scrollY: window.scrollY, active: document.activeElement?.className || '' }));
    const simulatedAnchoringShift = 369;
    await page.evaluate((shift) => {
      const head = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="capital"] > .chamber-category-head > .chamber-category-toggle');
      window.__chamberCategoryAnchorShift = null;
      head?.addEventListener('click', () => {
        requestAnimationFrame(() => {
          // Browser anchoring is immediate, regardless of CSS smooth scrolling.
          const html = document.documentElement;
          const previousBehavior = html.style.scrollBehavior;
          html.style.scrollBehavior = 'auto';
          const before = window.scrollY;
          window.scrollBy(0, shift);
          window.__chamberCategoryAnchorShift = { before, after: window.scrollY };
          html.style.scrollBehavior = previousBehavior;
        });
      }, { once: true });
    }, simulatedAnchoringShift);
    const activationScrollY = await page.evaluate(() => {
      const head = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="capital"] > .chamber-category-head > .chamber-category-toggle');
      head?.focus({ preventScroll: true });
      const scrollY = window.scrollY;
      head?.click();
      return scrollY;
    });
    await page.waitForFunction((targetScrollY) => {
      const category = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="capital"]');
      const head = category?.querySelector(':scope > .chamber-category-head > .chamber-category-toggle');
      return Boolean(category?.dataset.chamberExpanded === 'true'
        && window.__chamberCategoryAnchorShift
        && document.activeElement === head
        && Math.abs(window.scrollY - targetScrollY) <= 4);
    }, activationScrollY, { timeout: 3000 });
    const afterToggle = await page.evaluate(() => {
      const category = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="capital"]');
      return {
        scrollY: window.scrollY,
        anchorShift: window.__chamberCategoryAnchorShift,
        open: category?.dataset.chamberExpanded === 'true',
        focused: document.activeElement === category?.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')
      };
    });
    assert(afterToggle.anchorShift.after - afterToggle.anchorShift.before === simulatedAnchoringShift,
      `${label}: the complete simulated browser anchor shift must occur before testing its repair ${JSON.stringify(afterToggle)}`);
    assert(afterToggle.open && afterToggle.focused, `${label}: mobile disclosure toggle must remain focused and open ${JSON.stringify(afterToggle)}`);
    assert(Math.abs(afterToggle.scrollY - activationScrollY) <= 4, `${label}: mobile disclosure toggle did not repair a ${simulatedAnchoringShift}px browser anchor shift ${JSON.stringify({ beforeToggle, activationScrollY, afterToggle })}`);
    await page.evaluate(() => {
      const head = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="capital"] > .chamber-category-head > .chamber-category-toggle');
      const nativeScrollTo = window.scrollTo;
      window.__chamberCategoryScrollProbe = {
        nativeScrollTo,
        readerIntent: false,
        restoreCallsAfterIntent: 0,
        displacingCallsAfterIntent: 0,
        targetY: Math.max(0, window.scrollY - 240),
        appliedY: window.scrollY
      };
      window.scrollTo = function (...args) {
        const probe = window.__chamberCategoryScrollProbe;
        if (probe?.readerIntent) {
          probe.restoreCallsAfterIntent += 1;
          const requestedY = typeof args[0] === 'object'
            ? Number(args[0]?.top ?? window.scrollY)
            : Number(args[1] ?? window.scrollY);
          if (Number.isFinite(requestedY) && Math.abs(requestedY - probe.targetY) > 2) {
            probe.displacingCallsAfterIntent += 1;
          }
        }
        return nativeScrollTo.apply(window, args);
      };
      head?.addEventListener('click', () => {
        const probe = window.__chamberCategoryScrollProbe;
        probe.readerIntent = true;
        head.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, bubbles: true, cancelable: true }));
        const html = document.documentElement;
        const previousBehavior = html.style.scrollBehavior;
        html.style.scrollBehavior = 'auto';
        probe.nativeScrollTo.call(window, window.scrollX, probe.targetY);
        html.style.scrollBehavior = previousBehavior;
        probe.appliedY = window.scrollY;
      }, { once: true });
      head?.focus({ preventScroll: true });
      head?.click();
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const afterReaderScroll = await page.evaluate(() => {
      const category = document.querySelector('#chambers-grid > .chamber-category[data-chamber-category="capital"]');
      const probe = window.__chamberCategoryScrollProbe;
      const state = {
        scrollY: window.scrollY,
        open: category?.dataset.chamberExpanded === 'true',
        focused: document.activeElement === category?.querySelector(':scope > .chamber-category-head > .chamber-category-toggle'),
        restoreCallsAfterIntent: probe?.restoreCallsAfterIntent ?? -1,
        displacingCallsAfterIntent: probe?.displacingCallsAfterIntent ?? -1,
        targetY: probe?.targetY ?? -1,
        appliedY: probe?.appliedY ?? -1
      };
      if (probe?.nativeScrollTo) window.scrollTo = probe.nativeScrollTo;
      delete window.__chamberCategoryScrollProbe;
      return state;
    });
    assert(
      !afterReaderScroll.open
        && afterReaderScroll.focused
        && Math.abs(afterReaderScroll.appliedY - afterReaderScroll.targetY) <= 2
        && Math.abs(afterReaderScroll.scrollY - afterReaderScroll.targetY) <= 2
        && afterReaderScroll.displacingCallsAfterIntent === 0,
      `${label}: delayed disclosure restore overwrote immediate reader scroll ${JSON.stringify(afterReaderScroll)}`
    );
    await page.evaluate(() => {
      document.querySelectorAll('#chambers-grid > .chamber-category').forEach((category) => {
        category.dataset.chamberExpanded = 'true';
        category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
        const cards = category.querySelector(':scope > .chamber-category-cards');
        if (cards) cards.hidden = false;
      });
    });
  } else {
    await page.evaluate(() => {
      document.querySelectorAll('#chambers-grid > .chamber-category').forEach((category) => {
        category.dataset.chamberExpanded = 'true';
        category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
        const cards = category.querySelector(':scope > .chamber-category-cards');
        if (cards) cards.hidden = false;
      });
    });
  }
  if (mockOptions.governanceLiveVote) {
    await page.locator('#chamber-entry-card.chamber-entry-wide[data-chamber-entry-size="wide"] .chamber-entry-metric strong').first().waitFor({ state: 'visible', timeout: 10000 });
  }
  // This geometry fixture hydrates every room at once. Visit LB before waiting
  // for its data; offscreen preloads now yield to what the reader can see.
  await page.locator('#lb-entry-card').scrollIntoViewIfNeeded();
  await page.locator('#lb-entry-switcher-strip[data-lb-sample-blocks="2500"][data-lb-switcher-count="3"]').waitFor({ state: 'attached', timeout: 10000 });
  await assertChamberControlGeometry(page, label);
  await assertChamberInfoTooltipsContained(page, label);
  await page.waitForFunction(() => [
    'whale-watch-entry-card',
    'baker-directory-entry-card',
    'cycle-history-entry-card'
  ].every((id) => {
    const label = document.getElementById(id)?.dataset.updatedLabel?.trim() || '';
    return label && !/refreshing/i.test(label);
  }), null, { timeout: 15000 });

  const state = await page.evaluate(() => {
    const rect = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const metricGrid = document.querySelector('#chamber-entry-card.chamber-entry-wide .chamber-entry-metrics');
    const metricStyle = metricGrid ? window.getComputedStyle(metricGrid) : null;
    const metricColumns = metricStyle?.gridTemplateColumns?.split(' ').filter(Boolean).length || 0;
    const metricTruncations = Array.from(document.querySelectorAll('#chamber-entry-card.chamber-entry-wide .chamber-entry-metric span, #chamber-entry-card.chamber-entry-wide .chamber-entry-metric strong'))
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => node.textContent?.trim() || '');
    const tezlinkCard = document.querySelector('#tezlink-entry-card');
    const tezlinkLabel = tezlinkCard?.querySelector('.stat-label');
    const tezlinkCardBox = rect(tezlinkCard);
    const tezlinkLabelBox = rect(tezlinkLabel);
    const lbCard = document.querySelector('#lb-entry-card');
    const lbStrip = lbCard?.querySelector('#lb-entry-switcher-strip');
    const lbFooter = lbCard?.querySelector('.chamber-entry-footer');
    const lbItems = Array.from(lbStrip?.querySelectorAll('.lb-entry-switcher-item') || []);
    const lbMore = lbStrip?.querySelector('.lb-entry-switcher-more');
    const footers = Array.from(document.querySelectorAll('#chambers-section .chamber-entry-card')).map((card) => ({
      id: card.id || card.dataset.stat || '',
      updatedLabel: card.dataset.updatedLabel || '',
      footerText: card.querySelector('.chamber-entry-footer .chamber-entry-freshness')?.textContent?.trim() || '',
      hasOpenCue: Boolean(card.querySelector('.chamber-entry-footer > .chamber-expand-cue'))
    }));
    const titles = Array.from(document.querySelectorAll('#chambers-section .chamber-entry-card')).map((card) => {
      const title = card.querySelector(':scope .card-front .chamber-entry-title');
      const style = title ? window.getComputedStyle(title) : null;
      return {
        id: card.id || card.dataset.stat || '',
        title: title?.textContent?.trim() || '',
        fontFamily: style?.fontFamily || '',
        fontSize: style?.fontSize || '',
        fontWeight: style?.fontWeight || '',
        letterSpacing: style?.letterSpacing || '',
        textTransform: style?.textTransform || '',
        surfaceWired: card.dataset.chamberSurfaceWired || '',
        cueTag: card.querySelector('.chamber-entry-footer > .chamber-expand-cue')?.tagName || ''
      };
    });
    return {
      chamberWide: document.querySelector('#chamber-entry-card')?.classList.contains('chamber-entry-wide') || false,
      chamberText: document.querySelector('#chamber-entry-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      metricColumns,
      metricTruncations,
      passiveAnimations: Array.from(document.querySelectorAll('#chambers-section .chamber-entry-card:not(.chamber-entry-risk)'))
        .map((card) => ({
          id: card.id || card.dataset.stat || '',
          animationName: getComputedStyle(card, '::before').animationName
        }))
        .filter((card) => card.animationName !== 'none'),
      footers,
      titles,
      tezlinkTitleClip: Boolean(tezlinkCardBox && tezlinkLabelBox && tezlinkLabelBox.top < tezlinkCardBox.top - 1),
      tezlinkCardBox,
      tezlinkLabelBox,
      lbGeometry: {
        card: rect(lbCard),
        strip: rect(lbStrip),
        footer: rect(lbFooter),
        totalItems: lbItems.length,
        visibleItems: lbItems.filter((item) => getComputedStyle(item).display !== 'none').length,
        moreVisible: Boolean(lbMore && getComputedStyle(lbMore).display !== 'none'),
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      }
    };
  });

  assert(!mockOptions.governanceLiveVote || state.chamberWide, `${label}: live vote should render Tezos L1 Governance as a wide card: ${JSON.stringify(state)}`);
  assert(state.passiveAnimations.length === 0, `${label}: ordinary live/fresh Chamber cards must not pulse ${JSON.stringify(state.passiveAnimations)}`);
  assert(state.metricTruncations.length === 0, `${label}: live vote metrics should not ellipsize: ${JSON.stringify(state.metricTruncations)}`);
  assert(viewport.width >= 760 ? state.metricColumns === 2 : state.metricColumns >= 1, `${label}: unexpected live vote metric columns: ${state.metricColumns}`);
  assert(!state.tezlinkTitleClip, `${label}: Tezos X title should remain inside the card: ${JSON.stringify({ card: state.tezlinkCardBox, label: state.tezlinkLabelBox })}`);
  assert(
    state.lbGeometry.card
      && state.lbGeometry.strip
      && state.lbGeometry.footer
      && state.lbGeometry.strip.left >= state.lbGeometry.card.left - 1
      && state.lbGeometry.strip.right <= state.lbGeometry.card.right + 1
      && state.lbGeometry.strip.bottom <= state.lbGeometry.footer.top + 1
      && state.lbGeometry.pageOverflow <= 2,
    `${label}: LB switcher strip must remain inside the card above its footer without page overflow: ${JSON.stringify(state.lbGeometry)}`
  );
  if (viewport.width < 1180) {
    assert(
      state.lbGeometry.totalItems === 3
        && state.lbGeometry.visibleItems === 1
        && state.lbGeometry.moreVisible,
      `${label}: narrow LB switcher strip should show the latest baker plus a remaining-count indicator: ${JSON.stringify(state.lbGeometry)}`
    );
  }
  assert(state.footers.length >= 6 && state.footers.every((footer) => footer.updatedLabel === footer.footerText && footer.hasOpenCue), `${label}: chamber footer rail should own freshness and open cue on every card: ${JSON.stringify(state.footers)}`);
  const requiredFreshness = state.footers.filter(({ id }) => [
    'whale-watch-entry-card',
    'baker-directory-entry-card',
    'cycle-history-entry-card'
  ].includes(id));
  assert(
    requiredFreshness.length === 3
      && requiredFreshness.every(({ updatedLabel, footerText }) => updatedLabel && updatedLabel === footerText && !/refreshing/i.test(updatedLabel)),
    `${label}: promoted data-bearing Chambers must resolve semantic non-empty launcher freshness ${JSON.stringify(requiredFreshness)}`
  );
  assert(state.titles.length === EXPECTED_CHAMBER_ORDER.length, `${label}: expected a normalized title for every Chamber card: ${JSON.stringify(state.titles)}`);
  const referenceTitle = state.titles.find((title) => title.id === 'network-health') || state.titles[0];
  assert(state.titles.every((title) => title.title && title.surfaceWired === '1' && title.cueTag === 'BUTTON'), `${label}: every Chamber must expose the shared card surface and native Open action: ${JSON.stringify(state.titles)}`);
  assert(state.titles.every((title) => title.fontFamily === referenceTitle.fontFamily
    && title.fontSize === referenceTitle.fontSize
    && title.fontWeight === referenceTitle.fontWeight
    && title.letterSpacing === referenceTitle.letterSpacing
    && title.textTransform === 'uppercase'), `${label}: Chamber title typography must match the compact uppercase reference: ${JSON.stringify(state.titles)}`);
  assert(issues.length === 0, `${label}: browser issues:\n${issues.join('\n')}`);
  await context.close();
}

function isAllowedWarning(message) {
  return allowedWarningPatterns.some((pattern) => pattern.test(message));
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 10000;
  let lastError;
  while (Date.now() < deadline) {
    smokeLifecycle?.signal.throwIfAborted();
    try {
      const response = await fetch(url, { cache: 'no-store', signal: smokeLifecycle?.signal });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become ready: ${lastError?.message || 'unknown error'}`);
}

async function startLocalServer() {
  if (BASE_URL) return { baseUrl: BASE_URL.replace(/\/$/, ''), stop: async () => {} };

  let port;
  try {
    port = await findFreePort();
  } catch (error) {
    throw new SmokeInfrastructureError(`could not allocate a local smoke port: ${error.message}`, { cause: error });
  }
  const child = spawn('python3', ['tests/lib/smoke-server.py', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
      }, 2000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill();
    });
  };
  const untrack = smokeLifecycle?.track(stop);
  child.once('exit', () => untrack?.());

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(`${baseUrl}/`);
  } catch (error) {
    await stop();
    smokeLifecycle?.signal.throwIfAborted();
    throw new SmokeInfrastructureError(`${error.message}\n${output}`, { cause: error });
  }

  return {
    baseUrl,
    stop
  };
}

async function startSmokeServer() {
  let lastError;
  for (let retry = 0; retry <= RETRY_INFRASTRUCTURE; retry += 1) {
    smokeLifecycle?.signal.throwIfAborted();
    try {
      return await startLocalServer();
    } catch (error) {
      smokeLifecycle?.signal.throwIfAborted();
      lastError = isSmokeInfrastructureError(error)
        ? error
        : new SmokeInfrastructureError(`local smoke server startup failed: ${error.message}`, { cause: error });
      if (retry < RETRY_INFRASTRUCTURE) {
        log(`infra-retry - local smoke server startup ${retry + 1}/${RETRY_INFRASTRUCTURE}: ${lastError.message}`);
      }
    }
  }
  throw lastError;
}

async function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    throw new Error('Playwright is not installed. Run npm install first.');
  }
}

async function installOctezConnectMock(context, address = SAMPLE_ADDRESS, options = {}) {
  await context.addInitScript(({ mockAddress, hangPermissions, startConnected }) => {
    const activeAccount = {
      address: mockAddress,
      network: { type: 'mainnet' },
      origin: { type: 'mock' },
      scopes: ['operation_request', 'sign']
    };
    const listeners = {};
    let currentAccount = startConnected ? activeAccount : null;
    window.__octezConnectRequests = [];
    window.__octezConnectPermissionRequests = 0;
    window.__octezConnectDisconnected = false;
    window.__octezConnectDisconnectAttempts = 0;
    window.__octezConnectClearActiveCount = 0;
    window.__octezConnectHangDisconnect = false;
    const client = {
      async requestPermissions() {
        window.__octezConnectPermissionRequests += 1;
        if (hangPermissions) {
          return new Promise(() => {});
        }
        currentAccount = activeAccount;
        window.__octezConnectDisconnected = false;
        (listeners.ACTIVE_ACCOUNT_SET || []).forEach((callback) => callback(currentAccount));
        return currentAccount;
      },
      async getActiveAccount() {
        return currentAccount;
      },
      async requestOperation(input) {
        window.__octezConnectRequests.push(input);
        return { transactionHash: `ooSmoke${window.__octezConnectRequests.length}` };
      },
      async disconnect() {
        window.__octezConnectDisconnectAttempts += 1;
        if (window.__octezConnectHangDisconnect) {
          return new Promise(() => {});
        }
        currentAccount = null;
        window.__octezConnectDisconnected = true;
        (listeners.ACTIVE_ACCOUNT_SET || []).forEach((callback) => callback(null));
      },
      async clearActiveAccount() {
        window.__octezConnectClearActiveCount += 1;
        currentAccount = null;
        (listeners.ACTIVE_ACCOUNT_SET || []).forEach((callback) => callback(null));
      },
      async subscribeToEvent(eventName, callback) {
        listeners[eventName] = listeners[eventName] || [];
        listeners[eventName].push(callback);
      }
    };
    window.beacon = {
      getDAppClientInstance: () => client,
      NetworkType: { MAINNET: 'mainnet' },
      PermissionScope: { OPERATION_REQUEST: 'operation_request', SIGN: 'sign' },
      TezosOperationType: { TRANSACTION: 'transaction', DELEGATION: 'delegation' },
      BeaconEvent: { ACTIVE_ACCOUNT_SET: 'ACTIVE_ACCOUNT_SET', PAIR_ABORTED: 'PAIR_ABORTED' },
      Regions: { EUROPE_WEST: 'EUROPE_WEST', NORTH_AMERICA_EAST: 'NORTH_AMERICA_EAST' }
    };
  }, {
    mockAddress: address,
    hangPermissions: Boolean(options.hangPermissions),
    startConnected: Boolean(options.startConnected)
  });
}

async function launchChromium(chromium) {
  try {
    smokeLifecycle?.signal.throwIfAborted();
    const browser = await launchPlaywrightChromium(chromium, {
      executablePath: BROWSER_EXECUTABLE_PATH,
      headless: HEADLESS,
      launchOptions: { handleSIGINT: false, handleSIGTERM: false },
      logger: log
    });
    const untrack = smokeLifecycle?.track(() => browser.close());
    browser.once('disconnected', () => untrack?.());
    smokeLifecycle?.signal.throwIfAborted();
    return browser;
  } catch (error) {
    throw new SmokeInfrastructureError(`Chromium startup failed before the suite began: ${error.message}`, { cause: error });
  }
}

const hermeticAssetCache = new Map();

async function readHermeticAsset(key, resolvePath) {
  if (!hermeticAssetCache.has(key)) {
    hermeticAssetCache.set(key, readFile(resolvePath(), 'utf8'));
  }
  return hermeticAssetCache.get(key);
}

function octezConnectHermeticModule() {
  return `
export const NetworkType = { MAINNET: 'mainnet' };
export const TezosOperationType = { TRANSACTION: 'transaction', DELEGATION: 'delegation' };
export const PermissionScope = { OPERATION_REQUEST: 'operation_request', SIGN: 'sign' };
export const BeaconEvent = { ACTIVE_ACCOUNT_SET: 'ACTIVE_ACCOUNT_SET', PAIR_ABORTED: 'PAIR_ABORTED' };
export const Regions = { EUROPE_WEST: 'EUROPE_WEST', NORTH_AMERICA_EAST: 'NORTH_AMERICA_EAST' };
export class DAppClient {
  async requestPermissions() { return null; }
  async requestOperation() { return { transactionHash: 'ooHermeticSmoke' }; }
  async getActiveAccount() { return null; }
  async disconnect() {}
  async clearActiveAccount() {}
  async subscribeToEvent() {}
}
let instance;
export function getDAppClientInstance() {
  instance ||= new DAppClient();
  return instance;
}
`;
}

async function fulfillHermeticSharedAsset(route, url) {
  if (url.origin === 'https://fonts.googleapis.com') {
    await route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '/* hermetic font fallback */' });
    return true;
  }
  if (url.origin === 'https://fonts.gstatic.com') {
    await route.fulfill({ status: 204, contentType: 'font/woff2', body: '' });
    return true;
  }
  if (url.hostname === 'gc.zgo.at' || url.hostname.endsWith('.goatcounter.com')) {
    const isScript = route.request().resourceType() === 'script';
    await route.fulfill({
      status: isScript ? 200 : 204,
      contentType: isScript ? 'application/javascript; charset=utf-8' : 'text/plain; charset=utf-8',
      body: isScript ? 'window.goatcounter = window.goatcounter || { count() {} };' : ''
    });
    return true;
  }
  if (url.href === 'https://esm.sh/@tezos-x/octez.connect-sdk@4.8.5?bundle') {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: octezConnectHermeticModule()
    });
    return true;
  }
  if (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.includes('/chart.js@4.4.1/')) {
    const source = await readHermeticAsset('chart.js@4.4.1', () => (
      path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.js')
    ));
    await route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: source });
    return true;
  }
  if (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.includes('/chartjs-adapter-date-fns@3.0.0/')) {
    const source = await readHermeticAsset('chartjs-adapter-date-fns@3.0.0', () => (
      path.join(path.dirname(require.resolve('chartjs-adapter-date-fns')), 'chartjs-adapter-date-fns.bundle.min.js')
    ));
    await route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: source });
    return true;
  }
  if (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.includes('/html2canvas@1.4.1/')) {
    const source = await readHermeticAsset('html2canvas@1.4.1', () => require.resolve('html2canvas/dist/html2canvas.min.js'));
    await route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: source });
    return true;
  }
  return false;
}

function fulfillHermeticSharedWebSocket(socket, url) {
  if (url.href !== 'wss://ws.kraken.com/v2') return false;
  socket.onMessage((payload) => {
    let message;
    try {
      message = JSON.parse(String(payload));
    } catch {
      return;
    }
    if (message?.method !== 'subscribe') return;
    const channel = message.params?.channel;
    const interval = Number(message.params?.interval) || 5;
    const observedAt = new Date().toISOString();
    socket.send(JSON.stringify({
      method: 'subscribe',
      req_id: message.req_id,
      result: { channel, snapshot: true, symbol: ['XU3O8/USD'] },
      success: true,
      time_in: observedAt,
      time_out: observedAt
    }));
    if (channel === 'ticker') {
      socket.send(JSON.stringify({
        channel: 'ticker',
        type: 'snapshot',
        data: [{
          ask: 5.614,
          ask_qty: 98.25,
          bid: 5.610,
          bid_qty: 120.5,
          change: 0.152,
          change_pct: 2.7839,
          high: 5.620,
          last: 5.612,
          low: 5.458,
          symbol: 'XU3O8/USD',
          timestamp: observedAt,
          trades: 88,
          volume: 1184.75,
          vwap: 5.581
        }]
      }));
      return;
    }
    if (channel === 'ohlc') {
      const intervalMs = interval * 60_000;
      const end = Math.floor(Date.now() / intervalMs) * intervalMs;
      const data = Array.from({ length: 6 }, (_, index) => {
        const close = 5.56 + index * 0.01;
        return {
          close,
          high: close + 0.008,
          interval,
          interval_begin: new Date(end - ((5 - index) * intervalMs)).toISOString(),
          low: close - 0.008,
          open: close - 0.004,
          symbol: 'XU3O8/USD',
          trades: 6 + index,
          volume: 20 + index * 3,
          vwap: close - 0.001
        };
      });
      socket.send(JSON.stringify({ channel: 'ohlc', type: 'snapshot', data }));
    }
  });
  return true;
}

async function installHermeticNetworkGuard(context, { baseUrl, violations }) {
  const targetUrl = new URL(baseUrl);
  const targetOrigin = targetUrl.origin;
  const loopbackHosts = ['127.0.0.1', 'localhost', '::1', '[::1]'];
  const isLoopback = (url) => loopbackHosts.includes(url.hostname);
  await context.route('**/*', async (route) => {
    const request = route.request();
    let url;
    try {
      url = new URL(request.url());
    } catch {
      return route.fallback();
    }
    if (url.origin === targetOrigin || isLoopback(url)) return route.continue();
    if (await fulfillHermeticSharedAsset(route, url)) return;
    violations.push({
      method: request.method(),
      resourceType: request.resourceType(),
      serviceWorker: Boolean(request.serviceWorker?.()),
      url: url.href
    });
    await route.fulfill({
      status: 599,
      contentType: 'text/plain; charset=utf-8',
      body: `Undeclared external request blocked by smoke harness: ${url.href}`
    });
  });
  await context.routeWebSocket('**/*', async (socket) => {
    let url;
    try {
      url = new URL(socket.url());
    } catch {
      await socket.close({ code: 1008, reason: 'Invalid WebSocket URL' });
      return;
    }
    if (fulfillHermeticSharedWebSocket(socket, url)) return;
    const targetPort = targetUrl.port || (targetUrl.protocol === 'https:' ? '443' : '80');
    const socketPort = url.port || (url.protocol === 'wss:' ? '443' : '80');
    const sameTarget = url.hostname === targetUrl.hostname && socketPort === targetPort;
    if (sameTarget || isLoopback(url)) {
      socket.connectToServer();
      return;
    }
    violations.push({
      method: 'WS',
      resourceType: 'websocket',
      serviceWorker: false,
      url: url.href
    });
    await socket.close({ code: 1008, reason: 'Undeclared external WebSocket blocked by smoke harness' });
  });
}

async function instrumentBrowserForHermeticNetwork(rawBrowser, { baseUrl }) {
  const violations = [];
  const browser = new Proxy(rawBrowser, {
    get(target, property) {
      if (property === 'newContext') {
        return async (...args) => {
          const context = await target.newContext(...args);
          await installHermeticNetworkGuard(context, { baseUrl, violations });
          return context;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  return {
    browser,
    assertClean() {
      if (!violations.length) return;
      const unique = [...new Map(violations.map((violation) => (
        [`${violation.method} ${violation.url}`, violation]
      ))).values()];
      throw new Error([
        `hermetic smoke blocked ${unique.length} undeclared external request(s)`,
        ...unique.map((violation) => `- ${violation.method} ${violation.resourceType}${violation.serviceWorker ? ' service-worker' : ''} ${violation.url}`)
      ].join('\n'));
    }
  };
}

function artifactSegment(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

async function instrumentBrowserForArtifacts(rawBrowser, { suiteName, iteration, attempt }) {
  const attemptDirectory = path.join(
    ARTIFACTS_DIR,
    artifactSegment(suiteName),
    `iteration-${iteration}`,
    `attempt-${attempt}`
  );
  await mkdir(attemptDirectory, { recursive: true });
  const contexts = new Map();
  const artifactIssues = [];
  let contextSequence = 0;

  const instrumentContext = async (rawContext) => {
    contextSequence += 1;
    const contextId = `context-${String(contextSequence).padStart(2, '0')}`;
    let finalized = false;
    let tracing = false;
    try {
      await rawContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
      tracing = true;
    } catch (error) {
      artifactIssues.push(`${contextId} trace start: ${error.message}`);
    }

    const finalize = async () => {
      if (finalized) return;
      finalized = true;
      const pageMetadata = [];
      const pages = rawContext.pages();
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        const page = pages[pageIndex];
        const pageId = `${contextId}-page-${String(pageIndex + 1).padStart(2, '0')}`;
        pageMetadata.push({ id: pageId, url: page.url(), closed: page.isClosed() });
        if (page.isClosed()) continue;
        try {
          await page.screenshot({
            path: path.join(attemptDirectory, `${pageId}.png`),
            fullPage: false,
            timeout: 5000
          });
        } catch (error) {
          artifactIssues.push(`${pageId} screenshot: ${error.message}`);
        }
        try {
          await writeFile(path.join(attemptDirectory, `${pageId}.html`), await page.content());
        } catch (error) {
          artifactIssues.push(`${pageId} html: ${error.message}`);
        }
      }
      try {
        await writeFile(
          path.join(attemptDirectory, `${contextId}-pages.json`),
          `${JSON.stringify(pageMetadata, null, 2)}\n`
        );
      } catch (error) {
        artifactIssues.push(`${contextId} metadata: ${error.message}`);
      }
      if (tracing) {
        try {
          await rawContext.tracing.stop({ path: path.join(attemptDirectory, `${contextId}-trace.zip`) });
        } catch (error) {
          artifactIssues.push(`${contextId} trace stop: ${error.message}`);
        }
      }
    };

    const contextProxy = new Proxy(rawContext, {
      get(target, property) {
        if (property === 'close') {
          return async (...args) => {
            try {
              await finalize();
            } finally {
              contexts.delete(rawContext);
            }
            return target.close(...args);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    contexts.set(rawContext, finalize);
    return contextProxy;
  };

  const browserProxy = new Proxy(rawBrowser, {
    get(target, property) {
      if (property === 'newContext') {
        return async (...args) => instrumentContext(await target.newContext(...args));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

  return {
    browser: browserProxy,
    async flush() {
      await Promise.allSettled([...contexts.values()].map((finalize) => finalize()));
      if (artifactIssues.length) {
        await writeFile(
          path.join(attemptDirectory, 'artifact-errors.txt'),
          `${artifactIssues.join('\n')}\n`
        );
      }
    }
  };
}

async function closeOpenBrowserContexts(rawBrowser) {
  let contexts = [];
  try {
    contexts = rawBrowser?.contexts?.() || [];
  } catch {
    return 0;
  }
  if (!contexts.length) return 0;
  await Promise.allSettled(contexts.map((context) => context.close()));
  return contexts.length;
}

function withHarnessDiagnostic(error, diagnostic) {
  const original = error instanceof Error ? error : new Error(String(error));
  const wrapped = new Error(`${original.message}\nHarness diagnostic: ${diagnostic}`, { cause: original });
  wrapped.name = original.name;
  if (original.stack) wrapped.stack = `${original.stack}\nHarness diagnostic: ${diagnostic}`;
  return wrapped;
}

async function writeSmokeResults({ results, selectedSuites, baseUrl, cancelled = null }) {
  const summary = summarizeSuiteResults(results, selectedSuites.length);
  const estimatedDurationSeconds = selectedSuites.reduce(
    (total, suite) => total + (Number(smokeSuiteCosts[suite.name]) || 10),
    0
  );
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    environment: {
      ci: Boolean(process.env.CI),
      githubActions: process.env.GITHUB_ACTIONS === 'true',
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || '',
      githubRunId: process.env.GITHUB_RUN_ID || '',
      sha: process.env.GITHUB_SHA || ''
    },
    shard: SHARD?.value || '',
    suiteCostsSource: SUITE_COSTS_PATH || 'tests/fixtures/smoke-suite-costs.json',
    options: {
      continueOnFailure: CONTINUE_ON_FAILURE,
      isolateSuites: ISOLATE_SUITES,
      hermeticNetwork: HERMETIC_NETWORK,
      repeatEach: REPEAT_EACH,
      retryFailures: RETRY_FAILURES,
      retryInfrastructure: RETRY_INFRASTRUCTURE
    },
    selectedSuites: selectedSuites.map((suite) => suite.name),
    estimatedDurationSeconds,
    ...(cancelled ? { cancelled } : {}),
    summary,
    results
  };
  if (ARTIFACTS_DIR) {
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await writeFile(path.join(ARTIFACTS_DIR, 'results.json'), `${JSON.stringify(payload, null, 2)}\n`);
  }

  const githubSummary = process.env.GITHUB_STEP_SUMMARY || '';
  if (githubSummary) {
    const rows = results.map((result) => (
      `| \`${result.name}\` | ${result.status} | ${(result.durationMs / 1000).toFixed(1)}s |`
    ));
    const markdown = [
      `### Browser smoke${SHARD ? ` shard ${SHARD.value}` : ''}`,
      '',
      `**${formatSuiteSummary(results, selectedSuites.length)}**`,
      ...(cancelled ? [`Cancelled by ${cancelled.signal}; the interrupted attempt is not a passing test.`] : []),
      '',
      '| Suite | Result | Duration |',
      '| --- | --- | ---: |',
      ...rows,
      ''
    ].join('\n');
    try {
      await appendFile(githubSummary, markdown);
    } catch (error) {
      log(`warn - could not append smoke summary: ${error.message}`);
    }
  }
}

function aggregateSmokeFailure(results, selectedCount) {
  const unstable = unstableSuiteResults(results);
  const lines = unstable.map((result) => {
    const failedAttempts = result.iterations.flatMap((iteration) => iteration.attempts.filter((attempt) => attempt.status === 'failed'));
    const firstMessage = failedAttempts[0]?.error?.message || 'unknown failure';
    return `- ${result.name}: ${result.status} - ${firstMessage}`;
  });
  return new Error([
    `smoke harness rejected ${unstable.length} unstable suite(s): ${formatSuiteSummary(results, selectedCount)}`,
    ...lines,
    ARTIFACTS_DIR ? `Diagnostics: ${ARTIFACTS_DIR}` : ''
  ].filter(Boolean).join('\n'));
}

function attachIssueCollectors(page, label, issues) {
  page.on('console', (message) => {
    if (!['warning', 'warn', 'error'].includes(message.type())) return;
    const text = message.text();
    const locationUrl = message.location()?.url || '';
    const warningText = `${text} ${locationUrl}`;
    if (STRICT_EXTERNAL || !isAllowedWarning(warningText)) {
      issues.push(`${label} console ${message.type()}: ${text}${locationUrl ? ` (${locationUrl})` : ''}`);
    }
  });

  page.on('pageerror', (error) => {
    issues.push(`${label} pageerror: ${error.message}`);
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    const failureText = request.failure()?.errorText || 'failed';
    if (failureText === 'net::ERR_ABORTED' && !STRICT_EXTERNAL) return;
    if (/api\.tzkt\.io|eu\.rpc\.tez\.capital|tezos-mainnet\.octez\.io|api\.coingecko\.com|api\.llama\.fi|explorer\.etherlink\.com|node\.mainnet\.etherlink\.com|gc\.zgo\.at|goatcounter|fonts\.googleapis|fonts\.gstatic/.test(url) && !STRICT_EXTERNAL) {
      return;
    }
    issues.push(`${label} request failed: ${failureText} ${url}`);
  });
}

async function expectCount(page, selector, min, label) {
  const count = await page.locator(selector).count();
  assert(count >= min, `${label}: expected at least ${min} for ${selector}, saw ${count}`);
  return count;
}

async function openDropdown(page, buttonSelector, dropdownSelector) {
  const button = page.locator(buttonSelector);
  await assertLocatorCount(button, 1, buttonSelector);
  await button.click();
  const dropdown = page.locator(dropdownSelector);
  await expectClassContains(dropdown, 'open', dropdownSelector);
}

async function ensureDropdownOpen(page, buttonSelector, dropdownSelector) {
  const dropdown = page.locator(dropdownSelector);
  const classes = await dropdown.getAttribute('class');
  if (!(classes || '').split(/\s+/).includes('open')) {
    await openDropdown(page, buttonSelector, dropdownSelector);
  }
}

async function clickFeatureLauncher(page, selector) {
  await ensureDropdownOpen(page, '#features-gear', '#features-dropdown');
  const button = page.locator(selector);
  await assertLocatorCount(button, 1, selector);
  const disclosureId = await button.evaluate((node) => node.closest('details.feature-launcher-disclosure')?.id || '');
  if (disclosureId) {
    const disclosure = page.locator(`#${disclosureId}`);
    if (!(await disclosure.evaluate((node) => node.open))) {
      const summary = disclosure.locator(':scope > summary');
      await assertLocatorCount(summary, 1, `${selector} disclosure summary`);
      await summary.click();
    }
  }
  await button.click();
}

async function assertLocatorCount(locator, expected, label) {
  const count = await locator.count();
  assert(count === expected, `${label}: expected ${expected}, saw ${count}`);
}

async function expectClassContains(locator, className, label) {
  const classes = await locator.getAttribute('class');
  assert((classes || '').split(/\s+/).includes(className), `${label}: missing .${className}, class="${classes || ''}"`);
}

async function expectShareModal(page, label, issues = []) {
  try {
    await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      hasModal: Boolean(document.querySelector('#share-modal')),
      notification: document.querySelector('.share-notification')?.textContent || '',
      cardButtonText: document.querySelector('[data-stat="total-bakers"] .card-share-btn')?.textContent || '',
      comparisonShareWired: Boolean(document.querySelector('#comparison-share-all-btn')?._wired),
      comparisonShareVisible: Boolean(document.querySelector('#comparison-share-all-btn') && getComputedStyle(document.querySelector('#comparison-share-all-btn')).display !== 'none'),
      html2canvasLoaded: typeof window.html2canvas === 'function',
      scripts: Array.from(document.querySelectorAll('script[src*="html2canvas"]')).map((script) => script.src)
    }));
    throw new Error(`${label}: share modal did not open (${error.message}); debug=${JSON.stringify(debug)}; issues=${issues.join(' | ')}`);
  }
  await expectCount(page, '#share-modal .share-modal-preview img[src^="data:image/png"]', 1, label);
  await expectCount(page, '#share-modal #tweet-compose-text', 1, label);
  await expectCount(page, '#share-modal #share-handle-input', 1, label);
  await expectCount(page, '#share-modal #share-download', 1, label);
  await expectCount(page, '#share-modal #share-copy', 1, label);
  await expectCount(page, '#share-modal #share-twitter', 1, label);
  await page.locator('#share-modal .share-modal-close').click();
  await page.locator('#share-modal').waitFor({ state: 'detached', timeout: 5000 });
}

async function waitForShareModal(page, label, issues = []) {
  try {
    await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      hasModal: Boolean(document.querySelector('#share-modal')),
      notification: document.querySelector('.share-notification')?.textContent || '',
      html2canvasLoaded: typeof window.html2canvas === 'function'
    }));
    throw new Error(`${label}: share modal did not open (${error.message}); debug=${JSON.stringify(debug)}; issues=${issues.join(' | ')}`);
  }
  await expectCount(page, '#share-modal .share-modal-preview img[src^="data:image/png"]', 1, label);
  await expectCount(page, '#share-modal #tweet-compose-text', 1, label);
  await expectCount(page, '#share-modal #share-handle-input', 1, label);
  await expectCount(page, '#share-modal #share-download', 1, label);
  await expectCount(page, '#share-modal #share-copy', 1, label);
  await expectCount(page, '#share-modal #share-twitter', 1, label);
}

async function installShareActionMocks(context, { nativeShare = true } = {}) {
  await context.addInitScript(({ nativeShare }) => {
    window.__shareActions = {
      clipboardWrites: [],
      downloads: [],
      nativeShares: [],
      opens: []
    };

    HTMLCanvasElement.prototype.toBlob = function(callback, type = 'image/png') {
      callback(new Blob(['smoke-share-png'], { type }));
    };

    window.ClipboardItem = class SmokeClipboardItem {
      constructor(items) {
        this.items = items;
        this.types = Object.keys(items || {});
      }
    };

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async (items) => {
          window.__shareActions.clipboardWrites.push({
            count: Array.isArray(items) ? items.length : 0,
            types: Array.from(new Set((items || []).flatMap((item) => item?.types || Object.keys(item?.items || {}))))
          });
        },
        writeText: async (text) => {
          window.__shareActions.clipboardWrites.push({
            count: 1,
            text: String(text),
            types: ['text/plain']
          });
        }
      }
    });

    const originalOpen = window.open?.bind(window);
    window.open = (url, target, features) => {
      window.__shareActions.opens.push({ url: String(url), target: String(target || ''), features: String(features || '') });
      return { closed: false, focus() {} };
    };

    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.download || String(this.href || '').startsWith('data:image/')) {
        window.__shareActions.downloads.push({
          download: this.download || '',
          href: this.href || ''
        });
        return;
      }
      return originalAnchorClick.call(this);
    };

    if (nativeShare) {
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: (payload) => Boolean(payload?.files?.length)
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (payload) => {
          window.__shareActions.nativeShares.push({
            fileCount: Array.isArray(payload?.files) ? payload.files.length : 0,
            fileTypes: Array.isArray(payload?.files) ? payload.files.map((file) => file.type) : [],
            text: String(payload?.text || ''),
            url: String(payload?.url || '')
          });
        }
      });
    } else {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    }
  }, { nativeShare });
}


async function getMyTezosRewardReport(browser, baseUrl, { address, label, requiredText, nullCycleTiming = false }) {
  const issues = [];
  const rewardsRequests = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await installFeatureMocks(context, { nullCycleTiming });
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  let page = null;
  try {
    page = await context.newPage();
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('api.tzkt.io/v1/rewards/')) rewardsRequests.push(url);
    });
    attachIssueCollectors(page, label, issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `${label}: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
    await page.locator('#my-tezos-btn').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', `${label} drawer`);
    await page.locator('#drawer-address-input').fill(address);
    await page.locator('#drawer-connect-btn').click();
    await page.waitForFunction(({ address, requiredText }) => {
      const rewardsText = document.querySelector('#rewards-tracker-container')?.innerText || '';
      const statsText = document.querySelector('#my-baker-results')?.innerText || '';
      const briefText = document.querySelector('#drawer-brief')?.innerText || '';
      const combined = `${rewardsText}\n${statsText}\n${briefText}`;
      const combinedLower = combined.toLowerCase();
      return window._myTezosData?.fullAddress === address
        && requiredText.every((text) => combinedLower.includes(text.toLowerCase()));
    }, { address, requiredText }, { timeout: 15000 });

    const state = await page.evaluate(() => {
      const data = window._myTezosData || {};
      const rewardsText = document.querySelector('#rewards-tracker-container')?.innerText?.replace(/\s+/g, ' ').trim() || '';
      const lifetimeText = document.querySelector('#rt-lifetime-card')?.innerText?.replace(/\s+/g, ' ').trim() || '';
      const statsText = document.querySelector('#my-baker-results')?.innerText?.replace(/\s+/g, ' ').trim() || '';
      const statsLabels = Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat-label')).map((el) => el.textContent?.trim());
      return {
        rewardsText,
        rewardHistoryPanel: document.querySelector('.rt-calendar')?.closest('[data-my-tezos-panel]')?.dataset.myTezosPanel,
        cycleClockText: document.querySelectorAll('#rewards-tracker-container .rt-card')[0]?.innerText?.replace(/\s+/g, ' ').trim() || '',
        currentCycleText: document.querySelectorAll('#rewards-tracker-container .rt-card')[1]?.innerText?.replace(/\s+/g, ' ').trim() || '',
        currentCycleValue: document.querySelectorAll('#rewards-tracker-container .rt-card')[1]?.querySelector('.rt-value')?.textContent?.trim() || '',
        lifetimeText,
        statsText,
        statsLabels,
        operatorHeading: document.querySelector('#drawer-operator-status h3')?.textContent?.trim() || '',
        fullAddress: data.fullAddress,
        isStaker: data.isStaker,
        rewardsLastCycle: data.rewardsLastCycle,
        latestRewardCycle: data.latestRewardCycle,
        hasRewardRole: data.hasRewardRole,
        activeRewardEstimate: data.activeRewardEstimate,
        apyRate: data.apyRate,
        estAnnual: data.estAnnual,
        staked: data.staked,
        totalXTZ: data.totalXTZ
      };
    });

    assert(issues.length === 0, `${label} browser issues:\n${issues.join('\n')}`);
    return { state, rewardsRequests };
  } catch (error) {
    let debug = null;
    if (page) {
      try {
        debug = await page.evaluate(() => ({
          data: window._myTezosData || null,
          rewardsText: document.querySelector('#rewards-tracker-container')?.innerText || '',
          statsText: document.querySelector('#my-baker-results')?.innerText || '',
          briefText: document.querySelector('#drawer-brief')?.innerText || '',
          errorText: document.querySelector('#my-baker-error-msg')?.textContent || '',
          stored: localStorage.getItem('tezos-systems-my-baker-address')
        }));
      } catch {}
    }
    throw new Error(`${label} did not render expected state:\n${JSON.stringify({ debug, rewardsRequests }, null, 2)}\n${error.message}`);
  } finally {
    await context.close();
  }
}


async function revealMyTezosAccountControls(page) {
  const details = page.locator('.drawer-account-details');
  if (!await details.evaluate(el => el.open)) await details.locator('summary').click();
}


async function openMyTezosSmokeView(page, baseUrl, view) {
  const response = await page.goto(`${baseUrl}/?theme=clean`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `my tezos ${view}: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#my-tezos-btn[data-drawer-wired="1"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#my-tezos-btn').click();
  await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
  await expectClassContains(page.locator('#my-tezos-drawer'), 'open', `my tezos ${view} drawer`);
  await page.locator(`#my-tezos-tab-${view}`).click();
  await page.waitForFunction((selectedView) => (
    document.querySelector(`[data-my-tezos-view="${selectedView}"]`)?.getAttribute('aria-selected') === 'true'
      && document.querySelector(`[data-my-tezos-panel="${selectedView}"]`)?.hidden === false
  ), view, { timeout: 10000 });
}


function getSuiteCatalog(browser, baseUrl) {
  const suites = [
    { name: 'first-visit-tour', description: 'Deep-link onboarding, first root visit, and tour prompt behavior', run: () => smokeFirstVisitTour(browser, baseUrl) },
    { name: 'visit-signal-bloom', description: 'Rare visit landmarks bloom as theme-aware, shareable, reduced-motion-safe hidden signals without same-day replay', run: () => smokeVisitSignalBloom(browser, baseUrl) },
    { name: 'home-layout', description: 'Six device-local Home switches, inline Hide/Undo, persistence, tab sync, deep-link recovery, tour preview, Live Pulse gating, and responsive accessibility', run: () => smokeHomeLayout(browser, baseUrl) },
    { name: 'app-shell', description: 'Version metadata, service worker, manifest, icons, robots, sitemap, and shell assets', run: () => smokeAppShell(browser, baseUrl) },
    { name: 'release-update', description: 'One-click desktop/mobile release dock, Later dismissal, activation recovery, and cross-tab service-worker lifecycle', run: () => smokeReleaseUpdateDock(browser, baseUrl) },
    { name: 'hero-landscape', description: 'Compact network metrics share the mainnet-age row at intermediate widths and stack without clipping on tablets and phones', run: () => smokeHeroIntermediate(browser, baseUrl) },
    { name: 'hero-command-bar-first-paint', description: 'The no-JavaScript Live Head command shell paints with stable geometry and truthful loading state', run: () => smokeHeroCommandBar(browser, baseUrl, 'first-paint') },
    { name: 'hero-command-bar-desktop', description: 'Desktop Index Chamber launches synchronously with its Index Loom, routed full-height results, accessible isolation, and exact reader-state restoration', run: () => smokeHeroCommandBar(browser, baseUrl, 'desktop') },
    { name: 'hero-command-bar-mobile', description: 'Mobile Index Chamber preserves visual viewport, keyboard, focus, scroll, fallback glyph, starter and Loom grids, and routed result geometry', run: () => smokeHeroCommandBar(browser, baseUrl, 'mobile') },
    { name: 'handoff-question-field', description: 'The Handoff keeps seven anchor and six satellite questions readable and non-overlapping across every theme and phone/compact/desktop geometry', run: () => smokeHandoffQuestionField(browser, baseUrl) },
    { name: 'route-search-state', description: 'Alias transitions, bare routes, search relevance, Escape focus, query preservation, and Back/Forward state stay coherent', run: () => smokeRouteSearchState(browser, baseUrl) },
    { name: 'breakpoint-accessibility', description: 'Exact paired breakpoints, 200% reflow, forced colors, and reduced motion preserve shell/search/Chamber focus, containment, and horizontal fit', run: () => smokeBreakpointAccessibility(browser, baseUrl) },
    { name: 'cycle-milestone', description: 'Exact cycle milestones survive stale catalogs and quiet reconciliation while dead history breadcrumbs stay removed', run: () => smokeCycleMilestone(browser, baseUrl) },
    { name: 'tzkt-throttle', description: 'TzKT pacing preserves deadlines and cancellation while visible facts and chamber intent reorder pending work', run: () => smokeTzktThrottle(browser, baseUrl) },
    { name: 'viewport-loading', description: 'Desktop and phone essentials render before blocked history and retain reader state when enrichment finishes', run: () => smokeViewportLoading(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'dashboard-desktop', description: 'Desktop dashboard chrome, menus, widgets utility, calculator, drawer, share picker', run: () => smokeDashboard(browser, baseUrl, { width: 1440, height: 1000 }, 'desktop') },
    { name: 'dashboard-mobile', description: 'Mobile dashboard chrome, menus, widgets utility, calculator, drawer, share picker', run: () => smokeDashboard(browser, baseUrl, { width: 390, height: 844 }, 'mobile') },
    { name: 'chamber-categories', description: 'Catalogued responsive topics and individually hideable Chambers with persistent Hide/Undo, recovery, sync, route reveal, and first-paint state', run: () => smokeChamberCategories(browser, baseUrl) },
    { name: 'lazy-chamber-loading', description: 'Chamber code, projections, and CSS remain deferred until intent; hydration preserves focus; failed modules and styles retry without unstyled rooms', run: () => smokeLazyChamberLoading(browser, baseUrl) },
    { name: 'network-pulse-launcher', description: 'Network Pulse lower launcher row hydrates from collected history without opening the modal or enabling legacy full stats', run: () => smokeNetworkPulseLauncher(browser, baseUrl) },
    { name: 'launcher-projections', description: 'Capital, Ecosystem Activity, and Maxis hydrate from compact summaries, defer reviewed full artifacts until room open, preserve parity, and fall back safely', run: () => smokeLauncherProjections(browser, baseUrl) },
    { name: 'chamber-first-paint', description: 'Six snapshot rooms finish hidden first render, paint verified saved receipts before network, and revalidate without moving desktop or mobile readers', run: () => smokeChamberFirstPaint(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'chamber-ux', description: 'Chambers keep one scroller, a reachable exit, retained disclosures and view positions, and primary controls near the entrance', run: () => smokeChamberUx(browser, baseUrl, { installFeatureMocks }) },
    { name: 'community-funding', description: 'Campaign and project semantics, safe source links, responsive routing, isolated failures and quiet source refresh', run: () => smokeCommunityFunding(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'chamber-reading', description: 'Room summaries and source clocks stay contained, truthful, visible-only, and quiet across desktop/mobile reader updates', run: () => smokeChamberReading(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'standalone-chamber-expansion', description: 'Five independent rooms defer dashboard startup, preserve direct state and failed-exit readers, and hand off once across desktop/mobile navigation and cancelled loads', run: () => smokeStandaloneChamberExpansion(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'standalone-chamber-completion', description: 'Every generated room and alias boots without home telemetry and retains direct desktop/mobile navigation through the dashboard handoff', run: () => smokeStandaloneChamberCompletion(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR, ledgerFlowAddress: SAMPLE_ADDRESS }) },
    { name: 'standalone-chamber-lifecycle', description: 'Standalone legacy rooms retain failed-exit readers, lazy charts retry locally, directory controls navigate correctly, and selected themes survive handoff', run: () => smokeStandaloneChamberLifecycle(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'capital-chamber', description: 'Capital Chamber renders sourced cross-layer, market, asset, RWA, and art-economy views with quality quarantine, explicit gaps, direct routing, and quiet refresh', run: () => smokeCapitalChamber(browser, baseUrl) },
    { name: 'minerals-chamber', description: 'Critical Minerals keeps its compact launcher independent, exposes five accessible sourced views, preserves routes and quiet reading state, retains last-good receipts, and fits 320/390px rooms', run: () => smokeMineralsChamber(browser, baseUrl) },
    { name: 'uranium-chamber', description: 'Uranium Chamber preserves ranged chart history, deterministic Kraken live receipts, direct routing, hidden gating, and quiet reading state', run: () => smokeUraniumChamber(browser, baseUrl) },
    { name: 'metals-chamber', description: 'Precious Metals isolates compact timers/failures from the full room, preserves independent source clocks and accessible routes, retains last-good data quietly, and fits 320/390px rooms', run: () => smokeMetalsChamber(browser, baseUrl) },
    { name: 'ecosystem-activity', description: 'Completed-week dapp rankings, partial pulse, full history, app proofbooks, direct routing, responsive layout, and quiet refresh', run: () => smokeEcosystemActivity(browser, baseUrl) },
    { name: 'staking-chamber', description: 'Narrow >10K stake/unstake tape, canonical ratio, complete cursor archive, mover trail, pretty route, and mobile geometry', run: () => smokeStakingChamber(browser, baseUrl) },
    { name: 'lazy-drawer-charts', description: 'Drawer styling and real chart libraries load on intent, cancel safely, retry locally, and remain shared', run: () => smokeLazyDrawerCharts(browser, baseUrl, { installFeatureMocks, address: SAMPLE_ADDRESS, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'my-tezos-cold-start', description: 'My Tezos remains off-screen while its lazy styles are delayed, then preserves normal desktop and mobile open/close behavior', run: () => smokeMyTezosColdStart(browser, baseUrl) },
    { name: 'my-tezos-empty-state', description: 'My Tezos clearly separates Octez.Connect wallet pairing from watch-only tracking and explains all seven responsive views', run: () => smokeMyTezosEmptyState(browser, baseUrl) },
    { name: 'my-tezos-baker-incidents', description: 'Finalized missed-attestation receipts, honest stale and empty states, RPC allowance, and quiet reader preservation', run: () => smokeBakerIncidents(browser, baseUrl, { installFeatureMocks, address: SAMPLE_ADDRESS, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'my-tezos-layout-states', description: 'Loading and loaded card positions, sizes, equal row heights, and terminal-list growth across all seven My Tezos views', run: () => smokeMyTezosLayoutStates(browser, baseUrl, { installFeatureMocks, address: SAMPLE_ADDRESS, etherlinkAddress: SAMPLE_ETHERLINK_ADDRESS, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'my-tezos-layout', description: 'All seven tabs retain readable desktop, phone and landscape layouts, exact balances, disclosures, touch targets, and per-tab scroll', run: () => smokeMyTezosLayout(browser, baseUrl, { installFeatureMocks, address: SAMPLE_ADDRESS, secondAddress: SAMPLE_ADDRESS_2, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'live-pulse-ticker', description: 'Live Pulse drifts continuously above Live Head, opens its explainer, preserves phase, and uses accessible hold/static behavior', run: () => smokeLivePulseTicker(browser, baseUrl) },
    { name: 'release-radar-pulse', description: 'Compact Tezos X and Octez release forecast leads Live Pulse and opens every gate, release lane, dependency boundary, receipt, and history row without disturbing the reader', run: () => smokeReleaseRadarPulse(browser, baseUrl) },
    { name: 'live-pulse-personal-ribbons', description: 'Evidence-only Live Pulse account ribbons preserve stronger events and quiet reading state on desktop and mobile', run: () => smokeLivePulsePersonalRibbons(browser, baseUrl) },
    { name: 'live-pulse-daily-curio', description: 'One deterministic UTC-day Curio stays low-rank, scarce, truthful, and reading-state safe on desktop and mobile', run: () => smokeLivePulseDailyCurio(browser, baseUrl) },
    { name: 'my-tezos-baker-activity', description: 'My Tezos connected baker drawer lists recent delegators and stakers', run: () => smokeMyTezosBakerActivity(browser, baseUrl) },
    { name: 'my-tezos-idle-account', description: 'My Tezos removes baker-only controls and keeps an undelegated account readable in one column', run: () => smokeMyTezosIdleAccount(browser, baseUrl) },
    { name: 'my-tezos-live-signal', description: 'My Tezos open baker drawer refreshes stale operator signal without a manual reload', run: () => smokeMyTezosBakerLiveSignal(browser, baseUrl) },
    { name: 'my-tezos-drawer-live-refresh', description: 'My Tezos opening drawer refreshes stale brief, header, and baker-grid stats together', run: () => smokeMyTezosDrawerLiveRefresh(browser, baseUrl) },
    { name: 'my-tezos-wallet-connect', description: 'My Tezos drawer connects through Octez.Connect and keeps the saved profile after wallet disconnect', run: () => smokeMyTezosWalletConnect(browser, baseUrl) },
    { name: 'octez-connect-sdk-loader', description: 'Octez.Connect SDK imports through the real CSP-safe ESM loader and exposes the dApp client API', run: () => smokeOctezConnectSdkLoader(browser, baseUrl) },
    { name: 'kraken-websocket-canary', description: 'Kraken XU3O8/USD WebSocket subscription returns a shaped ticker snapshot through the pinned hermetic fixture or explicit live canary', run: () => smokeKrakenWebSocketCanary(browser) },
    { name: 'my-tezos-baker-capacity', description: 'My Tezos connected baker drawer shows signed over-delegation capacity', run: () => smokeMyTezosBakerCapacity(browser, baseUrl) },
    { name: 'my-tezos-staker-rewards', description: 'My Tezos connected drawer uses personal staker reward rows for regular and mostly-staked accounts', run: () => smokeMyTezosStakerRewards(browser, baseUrl) },
    { name: 'my-tezos-delegator-rewards', description: 'My Tezos connected drawer uses delegator estimate rows for zero-stake delegated accounts', run: () => smokeMyTezosDelegatorRewards(browser, baseUrl) },
    { name: 'my-tezos-historical-rewards', description: 'My Tezos keeps historical rewards out of the Current Cycle value and shows an inactive reward role honestly', run: () => smokeMyTezosHistoricalRewards(browser, baseUrl) },
    { name: 'my-tezos-storage', description: 'My Tezos migrates legacy browser data into normalized IndexedDB without reordering duplicates or losing labels', run: () => smokeMyTezosStorage(browser, baseUrl) },
    { name: 'my-tezos-portfolio', description: 'My Tezos adaptive tabs, exact multi-address totals, unified account journeys, complete-only failure state, quiet refresh, and desktop geometry', run: () => smokeMyTezosAddressSwitch(browser, baseUrl) },
    { name: 'my-tezos-balance-history', description: 'My Tezos exact total-XTZ history verifies archive fallback, immutable caching, hidden-tab resume, and quiet chart state', run: () => smokeMyTezosBalanceHistory(browser, baseUrl) },
    { name: 'my-tezos-memory', description: 'My Tezos persists exact per-address balance points while handing human-readable receipts to Transactions and Your Story', run: () => smokeMyTezosMemory(browser, baseUrl) },
    { name: 'my-tezos-collection', description: 'Collection aggregates included L1 NFT holdings without presenting marketplace asks as portfolio value', run: () => smokeMyTezosCollection(browser, baseUrl) },
    { name: 'my-tezos-tezosx', description: 'Tezos X links device-local Etherlink accounts with explicit L2 provenance, assets, activity, and independent inclusion', run: () => smokeMyTezosTezosX(browser, baseUrl) },
    { name: 'my-tezos-view-live-refresh', description: 'Every active My Tezos view quietly receives visible live updates without resetting filters, pagination, charts, focus, selection, or scroll', run: () => smokeMyTezosViewLiveRefresh(browser, baseUrl) },
    { name: 'my-tezos-ledger-flow-handoff', description: 'My Tezos closes its mobile drawer before opening the address-scoped Ledger Flow Chamber', run: () => smokeMyTezosLedgerFlowHandoff(browser, baseUrl) },
    { name: 'my-tezos-circular-return', description: 'A child room continues into the relevant My Tezos tab and returns through canonical session-only context', run: () => smokeMyTezosCircularReturn(browser, baseUrl) },
    { name: 'my-tezos-subdomain-input', description: 'My Tezos connected drawer accepts Tezos Domains subdomains and saves their resolved address', run: () => smokeMyTezosSubdomainInput(browser, baseUrl) },
    { name: 'my-tezos-proposal-attribution', description: 'My Tezos Story distinguishes a delegator from their baker when accepted proposals are shown', run: () => smokeMyTezosProposalAttribution(browser, baseUrl) },
    { name: 'my-tezos-pretty-route', description: 'The bare /my URL resolves to the canonical My Tezos drawer route', run: () => smokeMyTezosPrettyRoute(browser, baseUrl) },
    { name: 'my-tezos-deep-link-hash', description: 'My Tezos address and domain hash links override a stale saved baker on first load', run: () => smokeMyTezosDeepLinkOverridesStale(browser, baseUrl, 'hash') },
    { name: 'my-tezos-deep-link-path', description: 'My Tezos direct address and domain paths override a stale saved baker on first load', run: () => smokeMyTezosDeepLinkOverridesStale(browser, baseUrl, 'path') },
    { name: 'tezlink', description: 'Tezos X Chamber opens #tezosx with atomic L2 TVL, protocol mix, and live transaction tape', run: () => smokeTezlinkChamber(browser, baseUrl) },
    { name: 'my-tezos-block-monitor', description: 'Setup keeps one persisted saved-address-only block monitor synchronized across Home and Network Health', run: () => smokeMyTezosBlockMonitor(browser, baseUrl) },
    { name: 'tall-screen', description: 'Tall Chambers use available height and health lines and pills remain crisp at 1x/2x pixel density across desktop/mobile', run: () => smokeTallScreen(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'network-health-inspector-refresh', description: 'Supplemental block receipts preserve the exact inspector button while its accessible description updates', run: () => checkInspectorTriggerRefresh(browser, baseUrl, { installFeatureMocks }) },
    { name: 'live-head-stall', description: 'Centered stall overlay, responsive geometry, quiet elapsed ticks, retained rows and recovery', run: () => smokeLiveHeadStall(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'network-health', description: 'Live Head stories and Network Health expose block cadence, missed rights, live 33/66 Nakamoto coefficients, reports, and saved-baker context', run: () => smokeNetworkHealthChamber(browser, baseUrl) },
    { name: 'ledger-flow', description: 'Ledger Flow opens #ledger-flow with sent, received, first-funding, and amount-weighted transfer paths', run: () => smokeLedgerFlowChamber(browser, baseUrl) },
    { name: 'maxis-domain-passport', description: 'Maxi Passport resolves .tez names and subdomains without mutating My Tezos or assigning KT1 activity to an owner', run: () => smokeMaxisDomainPassport(browser, baseUrl) },
    { name: 'maxis', description: 'Default all-lane Maxis crowns, room-aware protocol seasons, career-plus-season Passport, immutable Champions, mobile geometry, and address trails', run: () => smokeMaxisChamber(browser, baseUrl) },
    { name: 'tezoscrp', description: 'Human-identity Recognition Hall, official category icons, latest winners, sourced monthly archive, and mobile geometry', run: () => smokeTezosCrpChamber(browser, baseUrl) },
    { name: 'standalone-chamber-boot', description: 'TezosCRP loads only its room, then hydrates the dashboard once on intent with preserved routes, search, My Tezos, and retryable failures', run: () => smokeStandaloneChamberBoot(browser, baseUrl) },
    { name: 'tezos-domains', description: 'Tezos Domains opens #domains with fresh .tez names, auctions, offers, and expiring-name pressure', run: () => smokeTezosDomainsChamber(browser, baseUrl) },
    { name: 'ctez', description: 'ctez End of Life opens #ctez with opt-in oven discovery and wallet-reviewed operations', run: () => smokeCtezChamber(browser, baseUrl) },
    { name: 'governance-lb-active', description: 'Active Governance, Tezos X Governance, LB dashboard/modal receipts, lore, links, and smooth refresh', run: () => smokeGovernanceTestingPeriod(browser, baseUrl, 'active') },
    { name: 'governance-lb-quiet', description: 'Quiet L1, L2, and LB periods retain truthful sizing, gaps, receipts, and room geometry', run: () => smokeGovernanceTestingPeriod(browser, baseUrl, 'quiet') },
    { name: 'hash-modal-cleanup', description: 'Hash-routed modal navigation closes stale history and chamber overlays before opening the next room', run: () => smokeHashModalCleanup(browser, baseUrl) },
    { name: 'overlay-stack', description: 'Share, Protocol Stories, nested card history, Native Explorer, and the shared stack preserve modal focus, isolation, topmost Escape, routes, and scroll', run: async () => {
      await smokeOverlayFeatureIntegrations(browser, baseUrl);
      await smokeOverlayStack(browser, baseUrl);
    } },
    { name: 'ux-regressions', description: 'Clean theme contrast, deep-linked utility sections, share picker contrast, widget utility', run: () => smokeUxChanges(browser, baseUrl) },
    { name: 'live-number-motion', description: 'Only factual live deltas animate, with concurrent quiet updates, newest-value cancellation, reduced motion, stable accessibility, and every theme personality', run: () => smokeLiveNumberMotion(browser, baseUrl) },
    { name: 'quiet-refresh', description: 'Background data reconciliation preserves page, rail, chamber, focus, selection, and animation state', run: () => smokeQuietRefresh(browser, baseUrl) },
    { name: 'live-time-labels', description: 'Unchanged time labels preserve text nodes and selection while age, countdown, duration, and stale transitions remain accurate', run: () => smokeLiveTimeLabels(browser, baseUrl, { artifactsDir: ARTIFACTS_DIR }) },
    { name: 'chain-continuity', description: 'Shared observations replace hidden clocks while visible continuity, finality, reader state and standalone ownership remain intact', run: () => smokeChainContinuity(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'hen-styles-lazy', description: 'HEN feed CSS waits for intent, gates activation, preserves cascade and recovers cancelled or failed direct entries', run: () => smokeHenStylesLazy(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'dom-affordances', description: 'Header links and card history attach only to affected elements, survive replacement, and preserve reader state', run: () => smokeDomAffordances(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'root-og', description: 'Root social preview retains real fonts, readable enlarged change pills, bounded layout, and lossless PNG pixels', run: () => smokeRootOgImage(browser, baseUrl, { artifactsDir: ARTIFACTS_DIR }) },
    { name: 'baker-directory', description: 'Complete paged active-baker set, search, factual signals, direct route, quiet reading state, and mobile geometry', run: () => smokeLeaderboardSignals(browser, baseUrl) },
    { name: 'baker-wallet-actions', description: 'Every canonical baker row exposes wallet-reviewed first-time delegation and exact Tezos stake operations', run: () => smokeBakerWalletActions(browser, baseUrl) },
    { name: 'whale-watch-chamber', description: 'Complete-window receipts, grouped flow legs, timestamp dormancy, receipt-backed awakenings, legacy giants alias, prepend anchoring, and mobile geometry', run: () => smokeWhaleWatchChamber(browser, baseUrl) },
    { name: 'cycle-history-chamber', description: 'Direct range and metric routes, focused charts, close lifecycle, restored entry focus, and mobile geometry', run: () => smokeCycleHistoryChamber(browser, baseUrl) },
    { name: 'text-loading-chambers', description: 'Delayed source receipts show rendered text bubbles or retain existing themed effects and settle after data', run: () => smokeTextLoadingChambers(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR, address: SAMPLE_ADDRESS, etherlinkAddress: SAMPLE_ETHERLINK_ADDRESS }) },
    { name: 'text-loading-my-tezos', description: 'Delayed source receipts show rendered text bubbles or retain existing themed effects and settle after data', run: () => smokeTextLoadingMyTezos(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR, address: SAMPLE_ADDRESS, etherlinkAddress: SAMPLE_ETHERLINK_ADDRESS }) },
    { name: 'text-loading-widgets', description: 'Delayed source receipts show rendered text bubbles or retain existing themed effects and settle after data', run: () => smokeTextLoadingWidgets(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR, address: SAMPLE_ADDRESS, etherlinkAddress: SAMPLE_ETHERLINK_ADDRESS }) },
    { name: 'text-loading-secondary', description: 'Launcher previews and secondary chamber reads expose text loading in their actual result areas', run: () => smokeTextLoadingSecondary(browser, baseUrl, { installFeatureMocks, address: SAMPLE_ADDRESS }) },
    { name: 'text-loading-tools', description: 'Delayed source receipts show rendered text bubbles or retain existing themed effects and settle after data', run: () => smokeTextLoadingTools(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR, address: SAMPLE_ADDRESS, etherlinkAddress: SAMPLE_ETHERLINK_ADDRESS }) },
    { name: 'baker-roster-loading', description: 'Baker changes preload while visible, paint before slow details, and preserve desktop/mobile readers through enrichment and name-service failures', run: () => smokeBakerRosterLoading(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'feature-workflows-desktop', description: 'Desktop baker lifecycle, Baker Directory, calculator, price intelligence, comparison, Whale Watch, Cycle History, and share cards', run: () => smokeFeatureWorkflows(browser, baseUrl, 'desktop') },
    { name: 'feature-workflows-mobile', description: 'Mobile baker lifecycle roster, price chronology, touch actions, and in-flow geometry', run: () => smokeFeatureWorkflows(browser, baseUrl, 'mobile') },
    { name: 'share-actions', description: 'Share modal copy, post, download, native share, and mobile photo fallback buttons', run: () => smokeShareActions(browser, baseUrl) },
    { name: 'info-modals', description: 'All section info modals and About Tezos launch-date copy', run: () => smokeInfoModals(browser, baseUrl) },
    { name: 'valley-theme', description: 'Valley lazy renderer, data motion, lifecycle, reading-state preservation, reduced motion, and responsive geometry', run: () => smokeValleyTheme(browser, baseUrl) },
    { name: 'theme-effects-lazy', description: 'Only selected background renderers load; previews, delayed imports, failure retries, reduced motion and Chamber handoff preserve one current painter', run: () => smokeThemeEffectsLazy(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'themes', description: 'Theme picker availability and representative light/dark/colorful theme switching', run: () => smokeThemeSelection(browser, baseUrl) },
    { name: 'widget-builder', description: 'Standalone widget builder type picker, preview sizing, and embed code tabs', run: () => smokeWidgetBuilder(browser, baseUrl) },
    { name: 'widget-refresh', description: 'Widgets retain last-good readings through source failures and preserve visibility, focus, selection, and reader state during refresh', run: () => smokeWidgetRefresh(browser, baseUrl, { artifactsDir: ARTIFACTS_DIR }) },
    { name: 'source-payloads', description: 'Validated source reads and prices recover honestly while retaining reader state', run: () => smokeSourcePayloads(browser, baseUrl, { installFeatureMocks, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'optional-tools-lazy', description: 'Optional tools and share rendering load on intent, retain early actions, and recover after failed imports', run: () => smokeOptionalToolsLazy(browser, baseUrl, { installFeatureMocks, clickFeatureLauncher, artifactsDir: ARTIFACTS_DIR }) },
    { name: 'optional-startup', description: 'Changelog, HEN runtime, and Anthology styles load only on intent, preserve routes, and recover from failed or cancelled loads', run: () => smokeOptionalStartup(browser, baseUrl) },
    { name: 'hen-standalone', description: 'Direct HEN layout, compact collector, and denied-artwork recovery on desktop and mobile', run: () => smokeHenStandalone(browser, baseUrl) },
    { name: 'hen-mode', description: 'HEN overlay startup and exit path', run: () => smokeHenMode(browser, baseUrl) },
    { name: 'route-formatting', description: 'Public pages, widget pages, and 404 screen avoid horizontal overflow and clipped controls on desktop/mobile', run: () => smokeRouteFormatting(browser, baseUrl) },
    { name: 'standalone-links', description: 'Visible first-party links on public and widget routes resolve without local/custom-domain drift', run: () => smokeStandaloneLinks(browser, baseUrl) },
    { name: 'route-crawl', description: 'Dashboard, SEO pages, compare pages, and standalone widget routes render non-empty bodies', run: () => crawlRoutes(browser, baseUrl) }
  ];
  return suites.map((suite) => ({
    ...suite,
    ...metadataForSmokeSuite(suite.name)
  }));
}

function readGitPathList(args) {
  const output = execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return output.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
}

function collectAffectedFiles(ref) {
  try {
    return [...new Set([
      ...readGitPathList(['diff', '--name-only', '--diff-filter=ACMRD', `${ref}...HEAD`]),
      ...readGitPathList(['diff', '--name-only', '--diff-filter=ACMRD']),
      ...readGitPathList(['diff', '--cached', '--name-only', '--diff-filter=ACMRD']),
      ...readGitPathList(['ls-files', '--others', '--exclude-standard'])
    ])];
  } catch (error) {
    throw new Error(`could not resolve affected smoke files from ${ref}: ${error.stderr?.toString().trim() || error.message}`);
  }
}

function selectSuites(catalog) {
  let candidates = ONLY_RISKS.length
    ? catalog.filter((suite) => ONLY_RISKS.includes(suite.risk))
    : catalog;
  if (AFFECTED_SINCE) {
    affectedSelectionReport = selectAffectedSmokeSuites(candidates, collectAffectedFiles(AFFECTED_SINCE));
    candidates = affectedSelectionReport.suites.map((suite) => (
      suite.risk === 'high' && AFFECTED_HIGH_RISK_REPEAT > 1
        ? { ...suite, repeatEach: AFFECTED_HIGH_RISK_REPEAT }
        : suite
    ));
  }
  return selectSuiteCatalog(candidates, {
    onlySuites: ONLY_SUITES,
    shard: SHARD,
    suiteCosts: smokeSuiteCosts
  });
}

async function main() {
  if (cli.help) {
    console.log(usage());
    return;
  }

  if (cli.list) {
    for (const { name, description } of selectSuites(getSuiteCatalog(null, ''))) {
      console.log(`${name} - ${description}`);
    }
    return;
  }

  smokeLifecycle = createSmokeLifecycle({ logger: log });
  let server;
  let sharedBrowser;
  let suites = [];
  let activeAttempt = null;
  const completedResults = [];
  try {
    server = await startSmokeServer();
    const { chromium } = await loadPlaywright();
    log(`Smoke target: ${server.baseUrl}`);
    suites = selectSuites(getSuiteCatalog(null, server.baseUrl));
    if (affectedSelectionReport) {
      log(`Affected smoke: ${affectedSelectionReport.mode} · ${affectedSelectionReport.reason}`);
    }
    if (!suites.length && affectedSelectionReport?.mode === 'none') {
      log('Smoke suites: none; static checks cover the changed files');
      return;
    }
    if (!suites.length) throw new Error(`smoke selection is empty${SHARD ? ` for shard ${SHARD.value}` : ''}`);
    if (SHARD) {
      const estimatedSeconds = suites.reduce(
        (total, suite) => total + (Number(smokeSuiteCosts[suite.name]) || 10),
        0
      );
      log(`Smoke shard: ${SHARD.value} · estimated ${(estimatedSeconds / 60).toFixed(2)} minutes`);
    }
    log(`Smoke suites: ${suites.map((suite) => suite.name).join(', ')}`);
    log(`Smoke harness: ${ISOLATE_SUITES ? 'isolated browsers' : 'shared browser'} · ${CONTINUE_ON_FAILURE ? 'aggregate failures' : 'fail fast'} · ${RETRY_FAILURES} assertion retries · ${RETRY_INFRASTRUCTURE} infrastructure retries · ${REPEAT_EACH} repetitions · ${HERMETIC_NETWORK ? 'hermetic network' : 'live network allowed'}`);

    const closeBrowser = async (browser) => {
      if (!browser) return;
      try {
        await browser.close();
      } catch (error) {
        log(`warn - browser close failed: ${error.message}`);
      }
    };

    const runAttempt = async (suite, { iteration, attempt, diagnostic }) => {
      const ownsBrowser = ISOLATE_SUITES || diagnostic;
      let rawBrowser;
      if (ownsBrowser) {
        rawBrowser = await launchChromium(chromium);
      } else {
        if (!sharedBrowser) sharedBrowser = await launchChromium(chromium);
        rawBrowser = sharedBrowser;
      }

      let hermeticRuntime = null;
      let artifactRuntime = null;
      let suiteBrowser = instrumentBrowserForAsyncWork(rawBrowser);
      if (HERMETIC_NETWORK) {
        hermeticRuntime = await instrumentBrowserForHermeticNetwork(suiteBrowser, { baseUrl: server.baseUrl });
        suiteBrowser = hermeticRuntime.browser;
      }
      if (diagnostic && ARTIFACTS_DIR) {
        artifactRuntime = await instrumentBrowserForArtifacts(suiteBrowser, {
          suiteName: suite.name,
          iteration,
          attempt
        });
        suiteBrowser = artifactRuntime.browser;
      }

      let runError = null;
      try {
        const executableSuite = getSuiteCatalog(suiteBrowser, server.baseUrl)
          .find((candidate) => candidate.name === suite.name);
        if (!executableSuite) throw new Error(`smoke suite disappeared from catalog: ${suite.name}`);
        await executableSuite.run();
      } catch (error) {
        runError = error;
      }

      if (artifactRuntime) {
        try {
          await artifactRuntime.flush();
        } catch (error) {
          runError = runError
            ? withHarnessDiagnostic(runError, `artifact flush failed: ${error.message}`)
            : new Error(`artifact flush failed: ${error.message}`);
        }
      }

      if (hermeticRuntime) {
        try {
          hermeticRuntime.assertClean();
        } catch (error) {
          runError = runError
            ? withHarnessDiagnostic(runError, error.message)
            : error;
        }
      }

      const leakedContexts = await closeOpenBrowserContexts(rawBrowser);
      if (leakedContexts && !runError) {
        const diagnosticText = `${suite.name} leaked ${leakedContexts} browser context(s); the harness closed them before continuing`;
        runError = new Error(diagnosticText);
      }

      if (ownsBrowser) {
        await closeBrowser(rawBrowser);
      } else if (runError) {
        await closeBrowser(sharedBrowser);
        sharedBrowser = null;
      }

      if (runError) throw runError;
    };

    const results = await executeSuiteCatalog(suites, {
      continueOnFailure: CONTINUE_ON_FAILURE,
      repeatEach: REPEAT_EACH,
      retryFailures: RETRY_FAILURES,
      retryInfrastructure: RETRY_INFRASTRUCTURE,
      signal: smokeLifecycle.signal,
      runAttempt,
      onEvent: ({ type, suite, iteration, attempt, repeats, retries, infrastructureRetry, infrastructureRetries, error, result }) => {
        if (type === 'suite-complete') {
          completedResults.push(result);
          activeAttempt = null;
        }
        if (type === 'attempt-start') {
          activeAttempt = { suite: suite.name, iteration, attempt };
          const detail = [
            repeats > 1 ? `repeat ${iteration}/${repeats}` : '',
            retries > 0 ? `attempt ${attempt}/${retries + 1}` : ''
          ].filter(Boolean).join(', ');
          log(`run - ${suite.name}${detail ? ` (${detail})` : ''}`);
        } else if (type === 'attempt-fail') {
          const callsite = String(error.stack || '')
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.includes('/tests/smoke.mjs:')) || '';
          log(`unstable - ${suite.name} attempt ${attempt}: ${error.message}${callsite ? `\n${callsite}` : ''}`);
        } else if (type === 'infrastructure-retry') {
          log(`infra-retry - ${suite.name} pre-test startup ${infrastructureRetry}/${infrastructureRetries}: ${error.message}`);
        } else if (type === 'suite-complete' && result.status === 'flaky') {
          log(`flaky - ${suite.name} passed only after a fresh-browser retry; the harness will remain red`);
        } else if (type === 'suite-complete' && result.status === 'failed') {
          log(`failed - ${suite.name} remained broken after ${result.iterations.at(-1)?.attempts.length || 1} attempt(s)`);
        }
      }
    });
    await writeSmokeResults({ results, selectedSuites: suites, baseUrl: server.baseUrl });
    log(`Smoke summary: ${formatSuiteSummary(results, suites.length)}`);
    if (unstableSuiteResults(results).length) {
      throw aggregateSmokeFailure(results, suites.length);
    }
  } catch (error) {
    if (smokeLifecycle.signal.aborted) {
      const reason = smokeLifecycle.signal.reason;
      await writeSmokeResults({
        results: completedResults,
        selectedSuites: suites,
        baseUrl: server?.baseUrl || BASE_URL,
        cancelled: { signal: reason.signalName, activeAttempt }
      }).catch(failure => log(`warn - could not write cancellation ledger: ${failure.message}`));
      throw reason;
    }
    throw error;
  } finally {
    if (sharedBrowser) {
      try {
        await sharedBrowser.close();
      } catch (error) {
        log(`warn - browser close failed: ${error.message}`);
      }
    }
    await server?.stop();
    await smokeLifecycle.close();
    smokeLifecycle.dispose();
  }
  smokeLifecycle.signal.throwIfAborted();
}

const { smokeAppShell, smokeReleaseUpdateDock } = createShellSmokeSuites({
  ARTIFACTS_DIR,
  assert,
  attachIssueCollectors,
  createServer,
  fulfillJson,
  installFeatureMocks,
  log,
  path,
  sampleDomainHistoryRows,
  sampleHistoryRows
});

const { smokeHeroIntermediate, smokeSearchCatalogRecovery, smokeHeroCommandBar, smokeHandoffQuestionField } = createSearchSmokeSuites({
  SAMPLE_ADDRESS,
  SAMPLE_CONTRACT,
  assert,
  attachIssueCollectors,
  installFeatureMocks,
  log
});

const { smokeRouteSearchState, smokeBreakpointAccessibility, smokeHashModalCleanup, smokeOverlayFeatureIntegrations, smokeOverlayStack } = createNavigationSmokeSuites({
  DEFERRED_CHAMBER_MODULE_PATHS,
  SAMPLE_CONTRACT,
  assert,
  assertNormalizedChamberShell,
  attachIssueCollectors,
  installFeatureMocks,
  log
});

const { smokeDashboard, smokeHomeLayout, smokeFirstVisitTour, smokeVisitSignalBloom, smokeUxChanges, smokeCycleMilestone } = createHomeSmokeSuites({
  SAMPLE_ADDRESS,
  assert,
  assertChamberOrder,
  assertLocatorCount,
  attachIssueCollectors,
  expectClassContains,
  expectCount,
  hasExpectedDefaultChamberDisclosure,
  installFeatureMocks,
  log,
  openDropdown,
  waitForIntentionalRealTime
});

const { smokeNetworkPulseLauncher, smokeLivePulseLoading, smokeLivePulseTicker, smokeReleaseRadarPulse, smokeLivePulsePersonalRibbons, smokeLivePulseDailyCurio } = createPulseSmokeSuites({
  ROOT,
  SAMPLE_ADDRESS,
  assert,
  assertNormalizedChamberShell,
  attachIssueCollectors,
  installFeatureMocks,
  log,
  path,
  pulseMilestoneFixture,
  readFileSync,
  releaseRadarFixture,
  waitForIntentionalRealTime
});

const { smokeMyTezosColdStart, smokeMyTezosIdleAccount, smokeMyTezosEmptyState, smokeMyTezosWalletConnect, smokeMyTezosAddressSwitch, smokeMyTezosStorage } = createMyTezosAccountSmokeSuites({
  OVERDELEGATED_ADDRESS,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_DELEGATOR_ADDRESS,
  SAMPLE_ETHERLINK_ADDRESS,
  SAMPLE_HEAVY_STAKER_ADDRESS,
  SAMPLE_IDLE_ADDRESS,
  SAMPLE_LARGE_STAKER_ADDRESS,
  SAMPLE_REGULAR_DELEGATOR_ADDRESS,
  SAMPLE_SMALL_DELEGATOR_ADDRESS,
  SAMPLE_STAKER_ADDRESS,
  assert,
  attachIssueCollectors,
  expectClassContains,
  fulfillJson,
  installFeatureMocks,
  installOctezConnectMock,
  log,
  openMyTezosSmokeView,
  revealMyTezosAccountControls,
  sleep
});

const { smokeMyTezosBakerActivity, smokeMyTezosBakerLiveSignal, smokeMyTezosBakerCapacity, smokeMyTezosStakerRewards, smokeMyTezosDelegatorRewards, smokeMyTezosHistoricalRewards, smokeMyTezosBlockMonitor } = createMyTezosBakingSmokeSuites({
  ARTIFACTS_DIR,
  OVERDELEGATED_ADDRESS,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_DELEGATOR_ADDRESS,
  SAMPLE_HEAVY_STAKER_ADDRESS,
  SAMPLE_HISTORICAL_REWARDS_ADDRESS,
  SAMPLE_IDLE_ADDRESS,
  SAMPLE_REGULAR_DELEGATOR_ADDRESS,
  SAMPLE_SMALL_DELEGATOR_ADDRESS,
  SAMPLE_STAKER_ADDRESS,
  assert,
  attachIssueCollectors,
  chooseLiveHeadDepth,
  expectClassContains,
  expectCount,
  fulfillJson,
  getMyTezosRewardReport,
  installFeatureMocks,
  log,
  openDropdown,
  path,
  revealMyTezosAccountControls,
  sampleBakers,
  waitForIntentionalRealTime
});

const { smokeMyTezosDrawerLiveRefresh, smokeMyTezosBalanceHistory, smokeMyTezosMemory, smokeMyTezosCollection, smokeMyTezosTezosX, smokeMyTezosViewLiveRefresh } = createMyTezosViewsSmokeSuites({
  ARTIFACTS_DIR,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_DELEGATOR_ADDRESS,
  SAMPLE_ETHERLINK_ADDRESS,
  assert,
  attachIssueCollectors,
  expectClassContains,
  installFeatureMocks,
  log,
  openMyTezosSmokeView,
  path,
  sleep,
  waitForIntentionalRealTime
});

const { smokeMyTezosLedgerFlowHandoff, smokeMyTezosCircularReturn, smokeMyTezosSubdomainInput, smokeMyTezosProposalAttribution, smokeMyTezosDeepLinkOverridesStale, smokeMyTezosPrettyRoute, runMyTezosDeepLinkOverride } = createMyTezosNavigationSmokeSuites({
  ARTIFACTS_DIR,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_DELEGATOR_ADDRESS,
  SAMPLE_ETHERLINK_ADDRESS,
  assert,
  attachIssueCollectors,
  expectClassContains,
  expectShareModal,
  installFeatureMocks,
  log,
  path,
  revealMyTezosAccountControls
});

const { smokeNetworkHealthInteractivePriority, smokeLiveHeadThemeGeometry, smokeNetworkHealthChamber } = createNetworkHealthSmokeSuites({
  ARTIFACTS_DIR,
  SAMPLE_ADDRESS_2,
  assert,
  assertNormalizedChamberShell,
  attachIssueCollectors,
  checkInspectorKeyboardReceipt,
  installFeatureMocks,
  log,
  sampleBakers
});

const { smokeMaxisDomainPassport, smokeMaxisChamber, smokeTezosCrpChamber } = createMaxisSmokeSuites({
  ARTIFACTS_DIR,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_DELEGATOR_ADDRESS,
  SAMPLE_REGULAR_DELEGATOR_ADDRESS,
  assert,
  assertNormalizedChamberShell,
  attachIssueCollectors,
  createHash,
  decodeGeneratedTransport,
  encodeGeneratedTransport,
  fulfillJson,
  installFeatureMocks,
  log,
  readMaxisLauncherGeometry,
  smokeTezosCrpCompaction
});

const { smokeStandaloneChamberBoot, smokeLauncherProjections, smokeLazyChamberLoading, smokeChamberCategories } = createChamberLoadingSmokeSuites({
  ARTIFACTS_DIR,
  DEFERRED_CHAMBER_HEAVY_DATA_PATHS,
  DEFERRED_CHAMBER_MODULE_PATHS,
  DEFERRED_CHAMBER_PROJECTION_PATHS,
  DEFERRED_CHAMBER_STYLE_PATHS,
  EXPECTED_CHAMBER_CATEGORIES,
  EXPECTED_CHAMBER_ORDER,
  assert,
  assertChamberOrder,
  attachIssueCollectors,
  fulfillJson,
  hasExpectedDefaultChamberDisclosure,
  installFeatureMocks,
  log,
  path,
  sleep,
  stableTestHash,
  waitForIntentionalRealTime
});

const { smokeCapitalChamber } = createCapitalSmokeSuites({
  assert,
  attachIssueCollectors,
  createHash,
  fulfillJson,
  installFeatureMocks,
  log,
  stableTestHash
});

const { smokeMineralsChamber } = createMineralsSmokeSuites({
  assert,
  attachIssueCollectors,
  createHash,
  fulfillJson,
  installFeatureMocks,
  log,
  stableTestHash
});

const { smokeMetalsChamber } = createMetalsSmokeSuites({
  assert,
  assertNormalizedChamberShell,
  attachIssueCollectors,
  createHash,
  fulfillJson,
  installFeatureMocks,
  log,
  stableTestHash
});

const { smokeUraniumChamber } = createUraniumSmokeSuites({
  DEFAULT_EXPANDED_CHAMBER_CATEGORY,
  EXPECTED_CHAMBER_CATEGORIES,
  EXPECTED_CHAMBER_ORDER,
  assert,
  attachIssueCollectors,
  createHash,
  fulfillJson,
  installFeatureMocks,
  log,
  stableTestHash
});

const { smokeEcosystemActivity, smokeTezosDomainsChamber } = createEcosystemSmokeSuites({
  EXPECTED_CHAMBER_CATEGORIES,
  assert,
  attachIssueCollectors,
  createHash,
  fulfillJson,
  installFeatureMocks,
  log,
  stableTestHash
});

const { smokeGovernanceTestingPeriod, smokeTezlinkChamber, smokeCtezChamber } = createGovernanceSmokeSuites({
  ETHERLINK_FAST_CONTRACT,
  ETHERLINK_FAST_PROPOSAL,
  SAMPLE_ADDRESS,
  assert,
  assertChamberControlGeometry,
  assertChamberOrder,
  assertLocatorCount,
  assertNormalizedChamberShell,
  assertResponsiveChamberCards,
  attachIssueCollectors,
  ensureDropdownOpen,
  expectCount,
  expectShareModal,
  installFeatureMocks,
  installOctezConnectMock,
  log
});

const { smokeStakingChamber, smokeLeaderboardSignals, smokeBakerWalletActions } = createStakingSmokeSuites({
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_ADDRESS_3,
  SAMPLE_IDLE_ADDRESS,
  SAMPLE_LARGE_STAKER_ADDRESS,
  SAMPLE_REGULAR_DELEGATOR_ADDRESS,
  assert,
  assertNormalizedChamberShell,
  assertPromotedLauncherGeometry,
  attachIssueCollectors,
  expectCount,
  installFeatureMocks,
  installOctezConnectMock,
  installStakingChamberMocks,
  log
});

const { smokeLedgerFlowChamber, smokeWhaleWatchChamber, smokeCycleHistoryChamber } = createActivitySmokeSuites({
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_CONTRACT,
  SAMPLE_IDLE_ADDRESS,
  assert,
  assertPromotedLauncherGeometry,
  attachIssueCollectors,
  expectCount,
  installFeatureMocks,
  log
});

const { smokeFeatureWorkflows, smokeShareActions, smokeInfoModals, smokeWidgetBuilder } = createToolsSmokeSuites({
  assert,
  assertAllSparklineLatestValues,
  assertLocatorCount,
  attachIssueCollectors,
  clickFeatureLauncher,
  ensureDropdownOpen,
  expectClassContains,
  expectCount,
  expectShareModal,
  installFeatureMocks,
  installShareActionMocks,
  log,
  waitForShareModal
});

const { smokeValleyTheme, smokeThemeSelection } = createThemesSmokeSuites({
  assert,
  assertLocatorCount,
  attachIssueCollectors,
  ensureDropdownOpen,
  installFeatureMocks,
  log,
  waitForIntentionalRealTime
});

const { smokeOptionalStartup, smokeHenStandalone, smokeHenMode } = createHenSmokeSuites({
  ARTIFACTS_DIR,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  assert,
  attachIssueCollectors,
  ensureDropdownOpen,
  expectClassContains,
  installFeatureMocks,
  installOctezConnectMock,
  log,
  mkdir,
  openDropdown,
  path,
  waitForIntentionalRealTime
});

const { smokeStandaloneLinks, smokeRouteFormatting, crawlRoutes } = createPublicRoutesSmokeSuites({
  SAMPLE_ADDRESS,
  assert,
  attachIssueCollectors,
  browserRoutes,
  formattingRoutes,
  formattingViewports,
  fulfillJson,
  installFeatureMocks,
  log
});

const { smokeQuietRefresh, smokeLiveNumberShellMotion, smokeLiveNumberMotion } = createQuietRefreshSmokeSuites({
  assert,
  attachIssueCollectors,
  installFeatureMocks,
  log,
  waitForIntentionalRealTime
});

const { smokeTzktThrottle, smokeOctezConnectSdkLoader, smokeKrakenWebSocketCanary } = createUpstreamsSmokeSuites({
  assert,
  attachIssueCollectors,
  installFeatureMocks,
  log
});

main().catch((error) => {
  console.error(`fail - ${error.stack || error.message}`);
  process.exit(error instanceof SmokeCancelledError ? error.exitCode : isSmokeInfrastructureError(error) ? 75 : 1);
});
