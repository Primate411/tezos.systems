#!/usr/bin/env node

import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHAMBER_ROUTES, routeUrl } from '../scripts/lib/chamber-routes.mjs';
import {
  MILESTONE_BASE_THRESHOLDS,
  MILESTONE_CATALOG_SCHEMA,
  MILESTONE_REFRESH_COMMITS,
  MILESTONE_REFRESH_DAYS,
  cycleMilestoneStartLevel,
  extendMilestoneThresholds,
  generatedMilestoneAnchor,
  generatedMilestoneMoments,
  generatedMilestoneThresholds,
  mergedMilestoneThresholds,
  milestoneCatalogCadence
} from '../js/features/milestone-catalog.mjs';
import { advanceMilestoneTrack, claimMilestoneArrival, deriveMilestoneMoments, MILESTONE_MOMENT_TTL_MS, normalizeMilestoneStore, qualifyMilestoneNearState } from '../js/features/milestone-lifecycle.mjs';
import { ETHERLINK_ROLLUP_ADDRESS, classifyBlockStory, compileBlockStoryCatalog } from '../js/core/block-story.mjs';
import { buildQuietBakerNotice } from '../js/core/baker-size.mjs';
import {
  compileContractCoverage,
  rankAppActivity,
  rankMints,
  rankSalesStats,
  rankUnicorn,
  validateMaxisConfig
} from '../scripts/lib/maxis-ranking.mjs';
import { fetchKeysetPages, fetchOffsetPages } from '../scripts/lib/maxis-pagination.mjs';
import {
  CURRENT_MAXIS_EVALUATOR_VERSION,
  DEEP_RANKING_LIMIT,
  PASSPORT_SHARD_ALGORITHM,
  PASSPORT_SHARD_COUNT,
  SEASON_CATEGORY_ORDER,
  SEASON_EVALUATOR_VERSION,
  SEASON_LANE_RULES,
  SEASON_RULES_VERSION,
  addressShard,
  buildSeasonCompetition,
  expandPassportRecord,
  getMaxisEvaluator,
  maxisEvaluatorVersions,
  rankSeasonBuilders,
  rankSeasonDelegation,
  rankSeasonGovernance,
  rankSeasonLiquidity,
  rankSeasonMints,
  rankSeasonNftSales,
  resolveProtocolSeason,
  truncationCoverageErrors,
  validateSeasonCatalog,
  registerMaxisEvaluator
} from '../scripts/lib/maxis-season.mjs';
import {
  getMaxisSource,
  maxisSourceVersions,
  registerMaxisSource
} from '../scripts/lib/maxis-source.mjs';
import {
  artifactBudgetErrors,
  measureSeasonArtifactBudget
} from '../scripts/lib/maxis-artifact-budget.mjs';
import { validateTransactionAccumulator } from '../scripts/lib/maxis-transactions-v2.mjs';
import {
  buildGovernanceCareerArtifact,
  validateGovernanceCareerArtifact
} from '../scripts/lib/maxis-governance-career.mjs';
import {
  L2_GOVERNANCE_TRACKS,
  MAXIS_L2_GOVERNANCE_CATEGORY,
  MAXIS_L2_GOVERNANCE_RANKING_LIMIT,
  buildL2GovernanceCareerArtifact,
  extractL2GovernanceReceiptAddresses,
  validateL2GovernanceCareerArtifact
} from '../scripts/lib/maxis-l2-governance.mjs';
import { maxisImplementationHash } from '../scripts/refresh-maxis-data.mjs';
import { validateTezosCrpDataset, validateTezosCrpIdentityAliases } from '../scripts/lib/tezoscrp-awards.mjs';
import { renderLlmsTxt } from '../scripts/generate-llms-txt.mjs';
import { normalizeSavedMyTezosEntries } from '../js/core/my-tezos-entries.mjs';
import {
  createActivity,
  dedupeMyTezosActivities,
  normalizeLinkedL2Accounts
} from '../js/core/my-tezos-models.mjs';
import {
  MyTezosRequestBroker,
  fingerprintMyTezosRequest
} from '../js/core/my-tezos-request-broker.mjs';
import {
  buildBakerCapacitySnapshot,
  normalizeBakerRewardEdge,
  normalizeBakerStakingLimit
} from '../js/core/baker-capacity.mjs';
import { findMyTezosContractRule } from '../js/core/my-tezos-contract-registry.mjs';
import {
  aggregateCollectionHoldings,
  classifyObjktNftActivity,
  normalizeObjktHolding
} from '../js/features/my-tezos-collection-model.mjs';
import {
  aggregateEtherlinkAccounts,
  upsertLinkedEtherlinkAccount
} from '../js/features/my-tezos-tezosx-model.mjs';
import {
  MY_TEZOS_PORTFOLIO_SCHEMA,
  appendPortfolioSnapshot,
  calculatePortfolioTotals,
  compactPortfolioHistory,
  mergePortfolioEntries,
  parsePortfolioImport,
  portfolioCompositionKey,
  portfolioRowFromAccount
} from '../js/features/my-tezos-portfolio-model.mjs';
import {
  PARIS_ACTIVATION_LEVEL,
  buildExactBalanceHistoryView,
  buildHistoricalBalanceSchedule,
  historicalBalanceSource,
  resolveHistoricalScheduleTimestamps
} from '../js/features/my-tezos-balance-history-model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];
const passes = [];

function pass(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

async function readText(file) {
  return fs.readFile(path.join(ROOT, file), 'utf8');
}

async function checkHomeLayoutContracts() {
  const [index, preload, layout, app, search, briefing, tour, handoff, styles, smoke, readme, changelog] = await Promise.all([
    readText('index.html'),
    readText('js/core/home-layout-preload.js'),
    readText('js/ui/home-layout.js'),
    readText('js/core/app.js'),
    readText('js/features/search.js'),
    readText('js/features/daily-briefing.js'),
    readText('js/features/tooltip-tour.js'),
    readText('js/core/site-handoff.js'),
    readText('css/shell-extras.css'),
    readText('tests/smoke.mjs'),
    readText('README.md'),
    readText('js/features/changelog.js')
  ]);
  const pulseTicker = await readText('js/ui/pulse-ticker.js');
  const tickerCss = await readText('css/shell-extras.css');
  const expectedIds = ['live-head', 'live-pulse', 'explore', 'moments', 'handoff', 'credits'];
  const registryIds = [...layout.matchAll(/Object\.freeze\(\{ id: '([^']+)'/g)].map((match) => match[1]);
  if (JSON.stringify(registryIds) !== JSON.stringify(expectedIds)) {
    fail(`Home layout registry must contain exactly the six ordered blocks: ${JSON.stringify(registryIds)}`);
  }
  for (const source of [preload, layout]) {
    if (!source.includes('tezos-systems-home-layout-v1') || !source.includes('version: 1') || !source.includes('hidden')) {
      fail('Home layout preload and manager must share the version 1 hidden-ID storage contract');
      break;
    }
  }
  const preloadIndex = index.indexOf('js/core/home-layout-preload.js');
  const pulseTickerIndex = index.indexOf('id="pulse-ticker-strip"');
  const liveHeadIndex = index.indexOf('id="live-head"');
  if (preloadIndex < 0 || pulseTickerIndex < 0 || liveHeadIndex < 0 || preloadIndex > pulseTickerIndex || pulseTickerIndex > liveHeadIndex
      || !styles.includes('[data-home-hidden~="live-pulse"] #pulse-ticker-strip')
      || !styles.includes('[data-home-hidden~="live-head"] #live-head')) {
    fail('Home layout first-paint preload must run before managed content and own CSS hiding from the root token');
  }
  if (!pulseTicker.includes('data-pulse-run="echo"')
      || !pulseTicker.includes('aria-hidden="true">${echoHtml}</div>')
      || pulseTicker.includes('aria-hidden="true" inert>${echoHtml}</div>')
      || !pulseTicker.includes("const PULSE_ITEM_SELECTOR = '[data-hot-signal-id], [data-pulse-echo-of]';")
      || !tickerCss.includes('.pulse-ticker-shelf{')
      || !tickerCss.includes('position: absolute;')) {
    fail('Live Pulse echo must remain AT-hidden but pointer-interactive while its detail shelf overlays without changing page flow');
  }
  const pulseInfoIndex = index.indexOf('id="hot-today-info-btn"', pulseTickerIndex);
  const pulseHideIndex = index.indexOf('class="home-block-hide home-block-hide-compact pulse-ticker-hide"', pulseInfoIndex);
  const pulseBarEnd = index.indexOf('</div>', pulseHideIndex);
  if (pulseInfoIndex < 0 || pulseHideIndex < pulseInfoIndex || pulseBarEnd < pulseHideIndex
      || !tickerCss.includes('grid-template-columns: minmax(0, 1fr) auto auto auto;')
      || !tickerCss.includes('.pulse-ticker-bar .pulse-ticker-hide{')
      || !tickerCss.includes('width: 26px;')
      || index.includes('id="pulse-ticker-dot"')
      || index.includes('class="chain-heartbeat-eyebrow pulse-ticker-kicker"')
      || index.includes('class="hot-today-clock-dot"')
      || !/\.pulse-ticker-bar\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/.test(tickerCss)) {
    fail('Live Pulse must sit directly on the site background and keep its compact Hide control immediately after the info control inside the bar');
  }
  if (!app.includes("closest('.section-header, .pulse-ticker-strip')")
      || briefing.includes('Latest signal')
      || !smoke.includes("name: 'live-pulse-ticker'")) {
    fail('Live Pulse must keep its concise age clock, working anchored explainer, and focused ticker browser regression');
  }
  const liveHeadHideIndex = index.indexOf('class="home-block-hide home-block-hide-compact live-head-hide"', liveHeadIndex);
  if (liveHeadHideIndex < liveHeadIndex || !index.includes('data-home-hide="live-head"')) {
    fail('Live Head must keep one compact Hide eye inside the combined card');
  }
  if (!preload.includes('tezos-systems-live-head-depth-v1')
      || !index.includes('id="live-head-depth-setting"')
      || !index.includes('id="live-head-depth-toggle"')) {
    fail('Live Head depth preference must preload and remain available from both the card corner and Setup');
  }
  for (const id of expectedIds) {
    if (!index.includes(`data-home-block="${id}"`) || !index.includes(`data-home-layout-toggle="${id}"`)) {
      fail(`Home layout HTML is missing the managed block and switch for ${id}`);
    }
  }
  for (const id of ['live-head', 'live-pulse', 'explore', 'moments']) {
    if (!index.includes(`data-home-hide="${id}"`)) fail(`Home layout inline Hide action missing for ${id}`);
  }
  if (!handoff.includes('data-home-hide="handoff"')) fail('Keep Exploring must render its inline Hide action');
  if (!index.includes('data-home-hide="credits"') || !index.includes('class="footer-last-line"')) fail('Credits must render its Hide action on the final build line');
  for (const legacyKey of [
    'tezos-systems-chambers-visible',
    'tezos-systems-collapsed-pulse-ticker',
    'tezos-systems-collapsed-chambers-section',
    'tezos-systems-collapsed-moments-section'
  ]) {
    if (!preload.includes(legacyKey) || !layout.includes(legacyKey)) fail(`Home layout migration is missing ${legacyKey}`);
  }
  if (!app.includes("if (section.hasAttribute('data-home-block')) return;")
    || index.includes('data-section-collapse aria-expanded="true" aria-controls="pulse-ticker-viewport"')
    || index.includes('data-section-collapse aria-expanded="true" aria-controls="chambers-grid"')) {
    fail('Managed Home blocks must be excluded from legacy collapse wiring');
  }
  for (const snippet of [
    "setHomeBlockVisible('explore', !isHomeBlockVisible('explore'), 'explore-menu')",
    "setHomeBlockVisible('live-pulse', true, 'deep-link')",
    "setHomeBlockVisible('live-head', true, 'deep-link')",
    "setHomeBlockVisible('handoff', true, 'deep-link')"
  ]) {
    if (!app.includes(snippet)) fail(`Home layout navigation integration missing: ${snippet}`);
  }
  if (!search.includes("setHomeBlockVisible('live-head', true, 'search-shortcut')")) fail('The / shortcut must reveal and save Live Head');
  if (!preload.includes("saved.hidden.indexOf('ticker')") || !preload.includes("saved.hidden.indexOf('search')")
      || !layout.includes("value.hidden.includes('ticker')") || !layout.includes("value.hidden.includes('search')")) {
    fail('Home layout must migrate the retired ticker/search pair without discarding partial or unknown preferences');
  }
  if (!tour.includes("beginPreview?.('guided-tour')") || !tour.includes("endPreview?.('guided-tour')")) fail('Guided tour must temporarily reveal and restore the saved Home layout');
  for (const snippet of ['hotTodaySurfaceVisible()', 'stopHotTodaySurfaceTimers()', "event.detail?.id === 'live-pulse'", 'hotTodayQuietRestore']) {
    if (!briefing.includes(snippet)) fail(`Live Pulse hidden/quiet restoration contract missing: ${snippet}`);
  }
  for (const recovery of ['id="settings-gear"', 'id="my-tezos-btn"']) {
    if (!index.includes(recovery)) fail(`Permanent Home recovery surface missing: ${recovery}`);
  }
  for (const footerContract of ['id="site-footer"', '>Source</a>', '>MPL-2.0</a>', 'data-home-block="credits"']) {
    if (!index.includes(footerContract)) fail(`Managed credits or legal surface missing: ${footerContract}`);
  }
  if (!styles.includes('@media (max-width: 600px)')
    || !styles.includes('min-height: 44px')
    || !styles.includes('@media (prefers-reduced-motion: reduce)')
    || !styles.includes('@media (forced-colors: active)')) {
    fail('Home layout must retain mobile touch, reduced-motion, and forced-color CSS contracts');
  }
  for (const route of CHAMBER_ROUTES) {
    const routeHtml = await readText(`${route.slug}/index.html`);
    if (!routeHtml.includes('/js/core/home-layout-preload.js') || !routeHtml.includes('id="home-layout-modal"')) {
      fail(`Generated route ${route.slug}/ is missing Home layout recovery controls`);
      break;
    }
  }
  if (!smoke.includes("name: 'home-layout'") || !smoke.includes('async function smokeHomeLayout')) fail('Focused home-layout browser suite is missing');
  if (!readme.includes('Customize home') || !readme.includes('tezos-systems-home-layout-v1')) fail('README must document the device-local Home layout contract');
  if (!changelog.includes('Customize home')) fail('User-facing changelog must mention Customize home');
  pass('device-local six-block Home layout, recovery, migration, route, tour, and Live Pulse contracts checked');
}

function checkLiveHeadPureContracts() {
  const knownLanes = {
    transactions: [],
    stakingRows: [],
    l1VotingRows: [],
    l2VotingRows: [],
    tokenTransfers: [],
    managerOperations: [],
    evidenceRows: [],
    milestoneRows: []
  };
  const catalog = compileBlockStoryCatalog({
    apps: [
      {
        id: 'reviewed-defi',
        category: 'defi',
        layers: [{ id: 'tezos', contractSource: { aliasPatterns: ['^Reviewed DEX$'] }, proofUrls: [] }]
      },
      {
        id: 'tezos-domains',
        category: 'identity',
        layers: [{ id: 'tezos', contractSource: { addresses: ['KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton'] }, proofUrls: [] }]
      }
    ]
  });
  const l2Vote = {
    id: 81,
    amount: 0,
    internal: false,
    sender: { address: 'tz1GovernanceVoter1111111111111111111' },
    target: { address: 'KT19oUVQPnVLuUBYXrBVd46WJnNAMpqkKSwo', alias: 'Etherlink FAST governance' },
    parameter: { entrypoint: 'vote', value: 'yea' }
  };
  const governance = classifyBlockStory({
    ...knownLanes,
    transactions: [
      l2Vote,
      { id: 82, amount: 12000000, internal: false, target: { address: 'tz1Recipient111111111111111111111111' } }
    ],
    stakingRows: [],
    l1VotingRows: [
      { id: 71, delegate: { address: 'tz1LayerOneVoter11111111111111111111' }, vote: 'yay' },
      { id: 72, delegate: { address: 'tz1LayerOneProposer1111111111111111' } }
    ],
    l2VotingRows: [l2Vote],
    maxFragments: 30
  });
  assert.deepEqual(governance.fragments.map(({ key }) => key), ['l1-vote', 'l2-vote', 'transfers']);
  assert.equal(governance.text, 'L1: Vote · 2 · L2: Vote · 1 · Transfers · 1');
  assert.equal(governance.fragments.filter(({ key }) => key === 'transfers').length, 1);

  const mixed = classifyBlockStory({
    ...knownLanes,
    catalog,
    managerOperations: [{ kind: 'smart_rollup_publish', rollup: ETHERLINK_ROLLUP_ADDRESS }],
    transactions: [
      { amount: 1000000, internal: false, target: { address: 'KT1JNNMMGyNNy36Zo6pcgRTMLUZyqRrttMZ4', alias: 'Reviewed DEX' } },
      { amount: 2000000, internal: false, target: { address: 'sr1UndWm3nAcuLY4RDcNBpRZgaMRDuRdu9D6', alias: '' } },
      { amount: 3000000, internal: false, target: { address: 'KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w', alias: 'Unknown app' } },
      { amount: 0, internal: false, target: { address: 'KT1UnknownCall111111111111111111111111' }, parameter: { entrypoint: 'mint' } },
      { amount: 4000000, internal: true, target: { address: 'KT1JNNMMGyNNy36Zo6pcgRTMLUZyqRrttMZ4', alias: 'Reviewed DEX' } }
    ],
    maxFragments: 30
  });
  assert.deepEqual(mixed.fragments.map(({ key }) => key), ['etherlink', 'defi', 'transfers', 'calls']);
  assert.equal(mixed.fragments.find(({ key }) => key === 'transfers').value, 2, 'a generic sr1 transfer must not be called Etherlink');
  assert(!mixed.text.includes('Oracle') && !mixed.text.includes('· 0'));

  const staking = classifyBlockStory({
    ...knownLanes,
    stakingRows: [
      { action: 'stake', amount: 12400000000 },
      { action: 'unstake', amount: 800000000 }
    ]
  });
  assert.equal(staking.text, 'Stake · 1 · Unstake · 1');
  assert.equal(staking.fragments[0].details[0], 'Stake · 1 · 12,400 ꜩ');
  assert.equal(staking.fragments[1].details[0], 'Unstake · 1 · 800 ꜩ');

  const artCatalog = compileBlockStoryCatalog({
    apps: [{
      id: 'reviewed-art',
      category: 'nft',
      layers: [{ id: 'tezos', contractSource: { addresses: ['KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w'] }, proofUrls: [] }]
    }]
  });
  const art = classifyBlockStory({
    ...knownLanes,
    catalog: artCatalog,
    transactions: [{ id: 91, amount: 0, internal: false, target: { address: 'KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w' } }],
    tokenTransfers: [
      { transactionId: 91, name: 'arachno trip' },
      { transactionId: 91, name: 'Undoing' },
      { transactionId: 92, symbol: 'USDt', name: 'Tether USD' }
    ],
    maxFragments: 30
  });
  assert.equal(art.text, 'Art · 2 · Tokens · 1');
  assert.deepEqual(art.fragments[0].details, [
    'Art · 2 · arachno trip · +1',
    'Art · 2 · arachno trip · Undoing'
  ]);
  assert.deepEqual(art.fragments[1].details, ['Tokens · 1 · USDt']);

  const domains = classifyBlockStory({
    ...knownLanes,
    catalog,
    transactions: [{ id: 93, amount: 0, internal: false, target: { address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton' }, parameter: { entrypoint: 'update_operators' } }],
    maxFragments: 30
  });
  assert.equal(domains.text, 'Domains · 1');

  const chainEvents = classifyBlockStory({
    ...knownLanes,
    managerOperations: [
      { kind: 'smart_rollup_publish', rollup: ETHERLINK_ROLLUP_ADDRESS },
      { kind: 'smart_rollup_publish', rollup: ETHERLINK_ROLLUP_ADDRESS },
      { kind: 'smart_rollup_cement', rollup: ETHERLINK_ROLLUP_ADDRESS },
      { kind: 'smart_rollup_publish', rollup: 'sr1UndWm3nAcuLY4RDcNBpRZgaMRDuRdu9D6' },
      { kind: 'dal_publish_commitment', slotIndex: 8 },
      { kind: 'delegation', source: 'tz1DelegateSource11111111111111111111', delegate: 'tz1DelegateTarget11111111111111111111' },
      { kind: 'origination', result: { originated_contracts: ['KT1Originated11111111111111111111111'] } },
      { kind: 'update_companion_key' },
      { kind: 'set_delegate_parameters' }
    ],
    evidenceRows: [
      { kind: 'double_baking_evidence' },
      { kind: 'drain_delegate' }
    ],
    milestoneRows: [
      { kind: 'cycle', cycle: 1337 },
      { kind: 'protocol', name: 'Ushuaia' },
      { kind: 'voting', period: 'proposal' }
    ],
    maxFragments: 30
  });
  assert.deepEqual(chainEvents.fragments.map(({ key }) => key), [
    'evidence', 'milestone', 'baker', 'etherlink', 'dal', 'delegate', 'contract'
  ]);
  assert(chainEvents.fragments.slice(0, 3).every(({ mandatory }) => mandatory === true));
  assert.deepEqual(chainEvents.fragments.find(({ key }) => key === 'etherlink').details, [
    'TEZOS X · 3 · publish 2 · +1',
    'TEZOS X · 3 · publish 2 · cement'
  ]);
  assert.equal(chainEvents.fragments.find(({ key }) => key === 'dal').details.at(-1), 'DAL · 1 · slot 8');
  assert.equal(chainEvents.fragments.find(({ key }) => key === 'delegate').details.at(-1), 'Delegate · 1 · new');

  const delegationSemantics = classifyBlockStory({
    ...knownLanes,
    managerOperations: [{ kind: 'delegation' }],
    delegationRows: [
      { sender: { address: 'tz1Self' }, newDelegate: { address: 'tz1Self' } },
      { sender: { address: 'tz1A' }, newDelegate: { address: 'tz1B' } },
      { sender: { address: 'tz1A' }, prevDelegate: { address: 'tz1B' }, newDelegate: { address: 'tz1C' } },
      { sender: { address: 'tz1A' }, prevDelegate: { address: 'tz1C' }, newDelegate: null }
    ],
    maxFragments: 30
  });
  assert.deepEqual(delegationSemantics.fragments[0].details, [
    'Delegate · 4 · self register · +3',
    'Delegate · 4 · self register · new · +2',
    'Delegate · 4 · self register · new · switch · +1',
    'Delegate · 4 · self register · new · switch · undelegate'
  ]);

  const transfers = classifyBlockStory({
    ...knownLanes,
    transactions: [
      { id: 1, amount: 2500000000, internal: false, sender: { alias: 'Sender.tez' }, target: { alias: 'Receiver' } },
      { id: 2, amount: 42000000, internal: false, sender: { alias: 'Second sender' }, target: { alias: 'Second receiver' } }
    ],
  });
  assert.equal(transfers.text, 'Transfers · 2');
  assert.deepEqual(transfers.fragments[0].details, [
    'Transfers · 2 · 2,542 ꜩ total',
    'Transfers · 2 · 2,542 ꜩ total · top Sender.tez → Receiver'
  ]);
  assert.equal(classifyBlockStory(), null);
  assert.equal(classifyBlockStory({ ...knownLanes, evidenceRows: null }), null);
  assert.equal(classifyBlockStory({ ...knownLanes, transactionsClipped: true }), null);
  assert.equal(classifyBlockStory(knownLanes).text, 'Quiet');
  assert(classifyBlockStory({ ...knownLanes, transactions: [{ amount: 1, internal: false, target: { address: 'KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w' } }] }).text.startsWith('Transfers'));
  assert(classifyBlockStory({ ...knownLanes, transactions: [{ amount: 1, internal: false, target: { address: 'KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w' } }], transactionsClipped: true }).text.endsWith('+'));

  const large = { baker: { address: 'tz1-large', alias: 'Large Baker' }, slots: 8 };
  const small = { baker: { address: 'tz1-small', alias: 'Small Baker' }, slots: 2 };
  const notice = buildQuietBakerNotice({
    attestationRights: [large, small],
    powerByDelegate: { 'tz1-large': '2000', 'tz1-small': '20' },
    totalPower: '100000'
  });
  assert(notice?.text.includes('Large Baker') && notice.text.includes('missed attestations'));
  assert.equal(buildQuietBakerNotice({ attestationRights: [small], powerByDelegate: { 'tz1-small': '20' }, totalPower: '100000' }), null);
  const blockMiss = buildQuietBakerNotice({ bakingRights: [{ baker: { address: 'tz1-small', alias: 'Small Baker' } }] });
  assert.equal(blockMiss?.text, 'Small Baker missed the block');
  pass('Live Head application, token, call, rollup, DAL, delegation, origination, evidence, milestone, baker, clipping, quiet-block, and baker-materiality contracts checked');
}

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
  for (const [source, snippet] of [
    [memory, 'export function refreshMyTezosMemory'],
    [collection, 'export async function refreshMyTezosCollection'],
    [collection, 'if (!background) renderedAssetLimit = MY_TEZOS_COLLECTION_PAGE_SIZE'],
    [collection, 'backgroundHoldings'],
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
    'Six views, one saved L1 identity',
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
  if (index.indexOf('id="my-tezos-overview-transactions"') > index.indexOf('id="drawer-operator-status"')) {
    fail('My Tezos Overview transaction preview no longer appears before the baker signal');
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

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
}

function stableJsonHash(value) {
  return createHash('sha256').update(JSON.stringify(stableJsonValue(value))).digest('hex');
}

async function pathExists(file) {
  try {
    await fs.access(path.join(ROOT, file));
    return true;
  } catch {
    return false;
  }
}

async function statOrNull(file) {
  try {
    return await fs.stat(path.join(ROOT, file));
  } catch {
    return null;
  }
}

async function walk(dir, predicate, results = []) {
  const entries = await fs.readdir(path.join(ROOT, dir), { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (child === 'node_modules' || child === '.git') continue;
      await walk(child, predicate, results);
    } else if (predicate(child)) {
      results.push(child.replaceAll(path.sep, '/'));
    }
  }
  return results.sort();
}

function stripUrl(value) {
  return value.split('#')[0].split('?')[0];
}

function isExternalRef(value) {
  return (
    !value ||
    value.startsWith('#') ||
    value.startsWith('data:') ||
    value.startsWith('mailto:') ||
    value.startsWith('tel:') ||
    value.startsWith('javascript:') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('//')
  );
}

function resolveLocalRef(fromFile, rawValue) {
  if (isExternalRef(rawValue)) return null;
  let value = stripUrl(rawValue);
  if (!value) value = '/';

  if (value === '/') return 'index.html';
  if (value.endsWith('/')) value += 'index.html';

  const baseDir = path.dirname(fromFile);
  const resolved = value.startsWith('/')
    ? value.slice(1)
    : path.normalize(path.join(baseDir, value));

  return resolved.replaceAll(path.sep, '/');
}

function collectHtmlRefs(file, html) {
  const refs = [];
  const attrPattern = /\b(?:src|href|poster)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(attrPattern)) {
    const raw = match[1].trim();
    if (raw.includes('{{') || raw.includes('${')) continue;
    const resolved = resolveLocalRef(file, raw);
    if (resolved) refs.push({ raw, resolved });
  }
  return refs;
}

function collectCssRefs(file, css) {
  const refs = [];
  const urlPattern = /url\(([^)]+)\)/gi;
  for (const match of css.matchAll(urlPattern)) {
    const raw = match[1].trim().replace(/^["']|["']$/g, '');
    const resolved = resolveLocalRef(file, raw);
    if (resolved) refs.push({ raw, resolved });
  }
  return refs;
}

function collectJsImports(file, js) {
  const refs = [];
  const patterns = [
    /\bimport\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\(["']([^"']+)["']\)/g
  ];
  for (const pattern of patterns) {
    for (const match of js.matchAll(pattern)) {
      const raw = match[1].trim();
      if (!raw.startsWith('.')) continue;
      const resolved = resolveLocalRef(file, raw);
      if (!resolved) continue;
      refs.push({ raw, resolved: path.extname(resolved) ? resolved : `${resolved}.js` });
    }
  }
  return refs;
}

async function checkRequiredFiles() {
  const required = [
    'index.html',
    'landing.html',
    'css/styles.css',
    'css/styles.min.css',
    'css/my-tezos.min.css',
    'css/hero-search.css',
    'css/site-map.css',
    'css/leaderboard.css',
    'css/history-chamber.css',
    'css/whale-chamber.css',
    'css/network-pulse.css',
    'css/capital.css',
    'css/market-room.css',
    'css/minerals-chamber.css',
    'css/uranium-chamber.css',
    'css/metals-chamber.css',
    'css/staking-chamber.css',
    'css/network-health.css',
    'css/maxis.css',
    'css/tezoscrp.css',
    'js/core/app.js',
    'js/core/api.js',
    'js/core/asset-version.js',
    'js/core/config.js',
    'js/core/mainnet.mjs',
    'js/core/liquidity-baking-vote.js',
  'js/core/quiet-refresh.js',
  'js/core/snapshot-receipt.js',
    'js/core/pulse-history.mjs',
    'js/core/pulse-history-analysis.mjs',
    'js/core/personal-signal-relevance.mjs',
    'js/core/live-pulse-curio.mjs',
    'js/core/search-catalog.js',
    'js/core/search-entities.js',
    'js/core/site-map.js',
    'js/core/site-journey.js',
    'js/core/etherlink-governance-contracts.mjs',
    'js/core/tzkt-throttle.js',
    'js/core/wallet.js',
    'js/core/my-tezos-entries.mjs',
    'js/core/my-tezos-db.mjs',
    'js/core/my-tezos-models.mjs',
    'js/core/my-tezos-request-broker.mjs',
    'js/core/my-tezos-contract-registry.mjs',
    'js/core/objkt-client.mjs',
    'js/core/etherlink-client.mjs',
    'js/features/governance-alerts.js',
    'js/features/staking-chamber.js',
    'js/features/capital-chamber.js',
    'js/features/minerals-chamber.js',
    'js/features/uranium-chamber.js',
    'js/features/metals-chamber.js',
    'js/features/ecosystem-chamber.js',
    'js/features/whale-chamber.js',
    'js/features/tezoscrp.js',
    'js/features/milestone-catalog.mjs',
    'js/features/my-tezos-portfolio.js',
    'js/features/my-tezos-portfolio-model.mjs',
    'js/features/my-tezos-tabs.mjs',
    'js/features/my-tezos-tzkt-adapter.mjs',
    'js/features/my-tezos-activity-model.mjs',
    'js/features/my-tezos-memory.mjs',
    'js/features/my-tezos-collection-model.mjs',
    'js/features/my-tezos-collection.mjs',
    'js/features/my-tezos-tezosx-model.mjs',
    'js/features/my-tezos-tezosx.mjs',
    'js/features/search.js',
    'js/landing/site-nav.js',
    'js/ui/wayfinder.js',
    'js/ui/pulse-ticker.js',
    'js/ui/chamber-styles.js',
    'sw.js',
    'og-image.png',
    'stake/index.html',
    'og/stake.png',
    'capital/index.html',
    'og/capital.png',
    'minerals/index.html',
    'og/minerals.png',
    'assets/minerals/minerals-core.webp',
    'assets/minerals/minerals-core-640.webp',
    'assets/minerals/minerals-launcher.webp',
    'assets/minerals/minerals-launcher-480.webp',
    'uranium/index.html',
    'og/uranium.png',
    'assets/uranium/uranium-core.webp',
    'assets/uranium/uranium-core-640.webp',
    'assets/uranium/uranium-launcher.webp',
    'assets/uranium/uranium-launcher-480.webp',
    'metals/index.html',
    'og/metals.png',
    'assets/metals/metals-core.webp',
    'assets/metals/metals-core-640.webp',
    'assets/metals/metals-launcher.webp',
    'assets/metals/metals-launcher-480.webp',
    'ecosystem/index.html',
    'og/ecosystem.png',
    'history/index.html',
    'og/history.png',
    'leaderboard/index.html',
    'og/leaderboard.png',
    'whales/index.html',
    'og/whales.png',
    'version.json',
    'LICENSE',
    'NOTICE',
    'SECURITY.md',
    '_config.yml',
    '.well-known/ai-plugin.json',
    '.well-known/openapi.json',
    '.well-known/security.txt',
    'llms.txt',
    'widgets/runtime.js',
    'feed.xml',
    'scripts/refresh-generated-surfaces.mjs',
    'scripts/refresh-scheduled-data.mjs',
    'scripts/check-generated-freshness.mjs',
    'scripts/lib/scheduled-refresh-lanes.mjs',
    'scripts/lib/scheduled-refresh-runner.mjs',
    'scripts/lib/generated-freshness.mjs',
    '.github/scripts/supabase-write.js',
    'tests/supabase-write-check.mjs',
    'scripts/generate-llms-txt.mjs',
    'scripts/measure-initial-load.mjs',
    'tests/fixtures/initial-load-baseline.json',
    'scripts/generate-milestone-catalog.mjs',
    'scripts/generate-search-catalog.mjs',
    'scripts/refresh-nakamoto-sources.mjs',
    'scripts/refresh-chain-comparison.mjs',
    'scripts/refresh-capital-data.mjs',
    'scripts/refresh-minerals-data.mjs',
    'scripts/refresh-uranium-data.mjs',
    'scripts/refresh-metals-data.mjs',
    'scripts/generate-capital-entry-summary.mjs',
    'scripts/refresh-ecosystem-stats.mjs',
    'scripts/generate-ecosystem-entry-summary.mjs',
    'scripts/lib/ecosystem-stats.mjs',
    'scripts/generate-maxis-entry-summary.mjs',
    'scripts/generate-baker-governance-signals.mjs',
    'scripts/generate-launcher-projections.mjs',
    'scripts/refresh-whale-watch-data.mjs',
    'scripts/refresh-tezoscrp-awards.mjs',
    'scripts/refresh-maxis-data.mjs',
    'scripts/refresh-maxis-careers.mjs',
    'scripts/refresh-maxis-l2-governance.mjs',
    'scripts/lib/maxis-artifact-budget.mjs',
    'scripts/lib/maxis-coverage-v2.mjs',
    'scripts/lib/maxis-evaluator-v2-primitives.mjs',
    'scripts/lib/maxis-evaluator-v2.mjs',
    'scripts/lib/maxis-governance-career.mjs',
    'scripts/lib/maxis-l2-governance.mjs',
    'scripts/lib/maxis-pagination.mjs',
    'scripts/lib/maxis-season.mjs',
    'scripts/lib/maxis-source.mjs',
    'scripts/lib/maxis-source-v2.mjs',
    'scripts/lib/maxis-transactions-v2.mjs',
    'scripts/lib/tezoscrp-awards.mjs',
    'data/governance-votes.json',
    'data/my-tezos-contracts.json',
    'data/nakamoto-sources.json',
    'data/chain-comparison-verification.json',
    'data/governance-refresh-report.json',
    'data/capital-snapshot.json',
    'data/capital-entry-summary.json',
    'data/minerals-snapshot.json',
    'data/minerals-entry-summary.json',
    'data/uranium-snapshot.json',
    'data/uranium-entry-summary.json',
    'data/metals-snapshot.json',
    'data/metals-entry-summary.json',
    'data/ecosystem-apps.json',
    'data/ecosystem-stats.json',
    'data/ecosystem-entry-summary.json',
    'data/whale-watch.json',
    'data/milestone-catalog.json',
    'data/search-catalog.json',
    'data/maxis-contracts.json',
    'data/maxis-careers.json',
    'data/baker-governance-signals.json',
    'data/maxis-l2-governance.json',
    'data/maxis-leaders.json',
    'data/maxis/entry-summary.json',
    'data/maxis/manifest.json',
    'data/tezoscrp-awards.json',
    'data/tezoscrp-identity-aliases.json',
    'data/tezoscrp-summary.json',
    'maxis/index.html',
    'og/maxis.png',
    'tezoscrp/index.html',
    'og/tezoscrp.png',
    '.github/workflows/refresh-tezoscrp.yml',
    '.github/workflows/refresh-chain-comparison.yml',
    '.github/workflows/audit-generated-freshness.yml',
    'tests/scheduled-refresh-check.mjs',
    'tests/generated-freshness-check.mjs',
    'tests/tezoscrp-check.mjs',
    'tests/ecosystem-stats-check.mjs',
    'tests/ledger-flow-check.mjs',
    'tests/pulse-history-check.mjs',
    'tests/personal-signal-relevance-check.mjs',
    'tests/live-pulse-curio-check.mjs',
    'tests/baker-governance-signals-check.mjs',
    'tests/uranium-check.mjs',
    'tests/metals-check.mjs',
    'tests/minerals-check.mjs',
    'tests/service-worker-cache-check.mjs',
    'data/protocol-data.json',
    'data/protocol-debates.json',
    'data/tweets.json'
  ];

  for (const file of required) {
    if (await pathExists(file)) pass(`required file exists: ${file}`);
    else fail(`missing required file: ${file}`);
  }
}

async function checkJsonFiles() {
  const jsonFiles = await walk('.', (file) => file.endsWith('.json') || file.endsWith('.webmanifest'));
  for (const file of jsonFiles) {
    try {
      JSON.parse(await readText(file));
      pass(`valid JSON: ${file}`);
    } catch (error) {
      fail(`invalid JSON in ${file}: ${error.message}`);
    }
  }
}

function hoursSince(iso) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return (Date.now() - time) / 36e5;
}

function protocolHashMatches(hash, prefix) {
  if (!hash || !prefix) return false;
  return hash.startsWith(prefix) || hash.startsWith(prefix.slice(0, 8)) || prefix.startsWith(hash.slice(0, 8));
}

function countsAsProtocolUpgrade(protocol) {
  if (!protocol) return false;
  if (protocol.countsAsUpgrade === false || protocol.countsAsSelfAmendment === false) return false;
  const name = String(protocol.name || protocol.alias || protocol.extras?.alias || protocol.metadata?.alias || '').trim().toLowerCase();
  const hash = String(protocol.hash || protocol.protocol || '');
  if (name === 'paris c' || hash.startsWith('PsParisC') || hash.startsWith('PsParisc')) return false;
  const code = Number(protocol.code ?? protocol.number);
  if (Number.isFinite(code) && code < 4) return false;
  if (Object.prototype.hasOwnProperty.call(protocol, 'firstLevel')) {
    const firstLevel = Number(protocol.firstLevel);
    if (Number.isFinite(firstLevel) && firstLevel <= 0) return false;
  }
  return true;
}

function countProtocolUpgrades(protocols) {
  return Array.isArray(protocols) ? protocols.filter(countsAsProtocolUpgrade).length : 0;
}

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

async function checkLocalReferences() {
  const htmlFiles = await walk('.', (file) => file.endsWith('.html'));
  const cssFiles = await walk('css', (file) => file.endsWith('.css'));
  const jsFiles = await walk('js', (file) => file.endsWith('.js'));

  const refs = [];
  for (const file of htmlFiles) refs.push(...collectHtmlRefs(file, await readText(file)).map((ref) => ({ file, ...ref })));
  for (const file of cssFiles) refs.push(...collectCssRefs(file, await readText(file)).map((ref) => ({ file, ...ref })));
  for (const file of jsFiles) refs.push(...collectJsImports(file, await readText(file)).map((ref) => ({ file, ...ref })));

  let checked = 0;
  for (const ref of refs) {
    if (ref.resolved.includes('*')) continue;
    checked += 1;
    if (!(await pathExists(ref.resolved))) {
      fail(`${ref.file} references missing asset ${ref.raw} -> ${ref.resolved}`);
    }
  }
  pass(`local references checked: ${checked}`);
}

async function checkSiteMapGraphContracts() {
  const source = await readText('js/core/site-map.js');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const {
    SITE_MAP,
    SITE_MAP_NAV_GROUPS,
    SITE_MAP_RELATIONS,
    findCurrentSiteMapContext,
    findSiteMapDestination,
    searchSiteMap,
    searchSiteMapIntents,
    siteMapBrowseEntries,
    siteMapBrowseIntents,
    siteMapDirectoryChildren,
    siteMapRelated,
    siteMapSearchChips,
    siteMapSitemapEntries,
    siteMapStarters
  } = await import(moduleUrl);
  const journeySource = (await readText('js/core/site-journey.js'))
    .replace("'./site-map.js'", JSON.stringify(moduleUrl))
    .replace(
      "'./my-tezos-models.mjs'",
      JSON.stringify(pathToFileURL(path.join(ROOT, 'js/core/my-tezos-models.mjs')).href)
    );
  const journeyModuleUrl = `data:text/javascript;base64,${Buffer.from(journeySource).toString('base64')}`;
  const {
    MY_TEZOS_JOURNEY_ORIGIN_KEY,
    buildMyTezosJourneyLinks,
    journeyAnalyticsDetails,
    readMyTezosJourneyOrigin,
    siteMapJourneyLinks
  } = await import(journeyModuleUrl);

  const ids = SITE_MAP.map((entry) => entry.id);
  const hrefs = SITE_MAP.map((entry) => entry.href);
  const knownIds = new Set(ids);
  if (knownIds.size !== ids.length) fail('site map entry ids must be unique');
  if (new Set(hrefs).size !== hrefs.length) fail('site map entry hrefs must be unique');
  const intentEntries = SITE_MAP.flatMap((entry) => (entry.searchIntents || []).map((intent) => ({ ...intent, parentId: entry.id })));
  const intentIds = intentEntries.map((entry) => entry.id);
  if (new Set(intentIds).size !== intentIds.length) fail('site map child intent ids must be unique');
  if (intentIds.some((id) => knownIds.has(id))) fail('site map child intent ids must not collide with top-level ids');

  for (const group of SITE_MAP_NAV_GROUPS) {
    if (!SITE_MAP.some((entry) => entry.group === group)) fail(`site map nav group is empty: ${group}`);
  }
  for (const entry of SITE_MAP) {
    if (!SITE_MAP_NAV_GROUPS.includes(entry.group)) fail(`site map destination is missing from the complete directory groups: ${entry.id}`);
  }
  if (new Set(Object.keys(SITE_MAP_RELATIONS)).size !== SITE_MAP.length || SITE_MAP.some((entry) => !SITE_MAP_RELATIONS[entry.id])) {
    fail('every site map destination must own a semantic relation set');
  }
  for (const [sourceId, relatedIds] of Object.entries(SITE_MAP_RELATIONS)) {
    if (!knownIds.has(sourceId)) fail(`site map relation source is unknown: ${sourceId}`);
    if (new Set(relatedIds).size !== relatedIds.length) fail(`site map relation ${sourceId} contains duplicates`);
    for (const relatedId of relatedIds) {
      if (!knownIds.has(relatedId)) fail(`site map relation ${sourceId} points to unknown id ${relatedId}`);
      if (relatedId === sourceId) fail(`site map relation ${sourceId} must not point to itself`);
    }
  }

  const starterIds = siteMapStarters().map((entry) => entry.id);
  for (const required of ['my-tezos', 'pulse', 'staking-chamber', 'maxis', 'health']) {
    if (!starterIds.includes(required)) fail(`site map starter set is missing ${required}`);
  }
  const chipIds = siteMapSearchChips().map((entry) => entry.id);
  for (const required of ['my-tezos', 'pulse', 'staking-chamber', 'maxis', 'domains', 'health']) {
    if (!chipIds.includes(required)) fail(`site map search chips are missing ${required}`);
  }

  const starterOrders = SITE_MAP.filter((entry) => Number.isFinite(entry.starter)).map((entry) => entry.starter);
  if (new Set(starterOrders).size !== starterOrders.length) fail('site map starter orders must be unique');
  const chipOrders = SITE_MAP.filter((entry) => entry.searchChip).map((entry) => entry.searchChip.order);
  if (new Set(chipOrders).size !== chipOrders.length) fail('site map search chip orders must be unique');

  const expectedBrowseIds = SITE_MAP
    .filter((entry) => SITE_MAP_NAV_GROUPS.includes(entry.group))
    .sort((a, b) => SITE_MAP_NAV_GROUPS.indexOf(a.group) - SITE_MAP_NAV_GROUPS.indexOf(b.group) || ids.indexOf(a.id) - ids.indexOf(b.id))
    .map((entry) => entry.id);
  const browseIds = siteMapBrowseEntries().map((entry) => entry.id);
  if (JSON.stringify(browseIds) !== JSON.stringify(expectedBrowseIds)) {
    fail(`site map browse order must cover every grouped destination exactly once: ${browseIds.join(', ')}`);
  }
  if (browseIds.length !== SITE_MAP.length) fail(`complete site map must include all ${SITE_MAP.length} top-level destinations, got ${browseIds.length}`);

  const inbound = new Map(ids.map((id) => [id, 0]));
  for (const sourceId of ids) {
    for (const related of siteMapRelated(sourceId, 4)) inbound.set(related.id, (inbound.get(related.id) || 0) + 1);
  }
  for (const [id, count] of inbound) {
    if (!count) fail(`site map destination has no rendered inbound semantic route: ${id}`);
  }
  for (const startId of ids) {
    const seen = new Set([startId]);
    const queue = [startId];
    while (queue.length) {
      for (const related of siteMapRelated(queue.shift(), 4)) {
        if (seen.has(related.id)) continue;
        seen.add(related.id);
        queue.push(related.id);
      }
    }
    if (seen.size !== SITE_MAP.length) {
      fail(`site map relation graph is not circular from ${startId}; missing ${ids.filter((id) => !seen.has(id)).join(', ')}`);
    }
  }

  const contextCases = [
    ['/capital/?view=art', 'capital', 'capital-art'],
    ['/capital/?view=system&focus=fees', 'capital', 'capital-fees'],
    ['/ecosystem/?layer=etherlink', 'ecosystem', 'ecosystem-l2'],
    ['/maxis/?view=passport&address=tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb', 'maxis', 'maxis-passport'],
    ['/maxis/?view=season&lane=staking', 'maxis', 'maxis-season'],
    ['/whales/?view=awakenings&search=tz1ignored', 'whales', 'whales-awakenings'],
    ['/leaderboard/?view=discover', 'leaderboard', 'leaderboard-discover'],
    ['/compare/tezos-vs-ethereum.html', 'compare', 'compare-ethereum'],
    ['/capital/?unknown=1', 'capital', null]
  ];
  for (const [route, entryId, intentId] of contextCases) {
    const url = new URL(route, 'https://tezos.systems');
    const context = findCurrentSiteMapContext(url);
    if (context.entryId !== entryId || context.intentId !== intentId) {
      fail(`site map context ${route} should resolve ${entryId}/${intentId || 'parent'}, got ${context.entryId}/${context.intentId || 'parent'}`);
    }
  }
  if (findSiteMapDestination('capital-art')?.parentId !== 'capital') {
    fail('site map child destination lookup must preserve its canonical parent');
  }

  for (const contextId of ['pulse', 'staking-chamber', 'ledger-flow', 'capital-art', 'maxis-passport', 'ecosystem-l2']) {
    const links = siteMapJourneyLinks(contextId, { limit: 4, hasLinkedL2: false });
    if (
      links.length !== 4
      || new Set(links.map((entry) => entry.id)).size !== 4
      || links.some((entry) => (entry.parentId || entry.id) === (findSiteMapDestination(contextId)?.parentId || contextId))
    ) {
      fail(`site journey ${contextId} must expose four unique destinations outside its current family`);
    }
  }
  const pulseJourneyIds = siteMapJourneyLinks('pulse', { limit: 4 }).map((entry) => entry.id);
  const pulseRelatedIds = siteMapRelated('pulse', 4).map((entry) => entry.id);
  if (JSON.stringify(pulseJourneyIds) !== JSON.stringify(pulseRelatedIds)) {
    fail('Network Pulse must retain its established four-link relation order');
  }
  const stakingJourney = siteMapJourneyLinks('staking-chamber', { limit: 4 });
  if (stakingJourney[0]?.id !== 'my-tezos' || stakingJourney[0]?.href !== '/my/?view=portfolio') {
    fail('Staking Chamber must continue naturally into My Tezos Portfolio');
  }
  const unlinkedL2Journey = siteMapJourneyLinks('ecosystem-l2', { limit: 4, hasLinkedL2: false });
  if (unlinkedL2Journey.some((entry) => entry.id === 'my-tezos')) {
    fail('L2 contexts must not recommend My Tezos X without an explicit local link');
  }
  const linkedL2Journey = siteMapJourneyLinks('ecosystem-l2', { limit: 4, hasLinkedL2: true });
  if (linkedL2Journey[0]?.href !== '/my/?view=tezos-x') {
    fail('explicitly linked L2 contexts must continue into My Tezos X');
  }

  const activeAddress = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
  const baseData = { fullAddress: activeAddress, loading: false, story: {} };
  const recommendationCases = [
    ['baker overview', { view: 'overview', data: { ...baseData, isBaker: true } }, ['health', 'chamber']],
    ['staker overview', { view: 'overview', data: { ...baseData, isStaker: true, staked: 1 } }, ['staking-chamber', 'calculator']],
    ['delegator overview', { view: 'overview', data: { ...baseData, bakerAddr: activeAddress } }, ['leaderboard-discover', 'health']],
    ['creator overview', { view: 'overview', data: { ...baseData, story: { creatorStats: { totalCreated: 1 } } } }, ['capital-art', 'maxis-artist']],
    ['collector overview', { view: 'overview', data: { ...baseData, story: { nftAssetsCollected: 2 } } }, ['hen', 'maxis-collector']],
    ['domain overview', { view: 'overview', data: { ...baseData, story: { domainAlias: 'person.tez' } } }, ['domains', 'ledger-flow']],
    ['portfolio tab', { view: 'portfolio', data: baseData }, ['ledger-flow', 'price']],
    ['transactions tab', { view: 'transactions', data: baseData }, ['ledger-flow', 'whales']],
    ['collection tab', { view: 'collection', data: baseData }, ['hen', 'capital-art']],
    ['story tab', { view: 'story', data: baseData }, ['maxis-passport', 'anthology']],
    ['linked Tezos X tab', { view: 'tezos-x', data: baseData, hasLinkedL2: true }, ['tezosx', 'ecosystem-l2']]
  ];
  for (const [label, options, expected] of recommendationCases) {
    const actual = buildMyTezosJourneyLinks({ address: activeAddress, ...options, origin: null }).map((entry) => entry.id);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`${label} journey cards should be ${expected.join(', ')}, got ${actual.join(', ')}`);
    }
  }
  const unlinkedPersonalIds = buildMyTezosJourneyLinks({
    view: 'tezos-x',
    data: baseData,
    address: activeAddress,
    hasLinkedL2: false,
    origin: null
  }).map((entry) => entry.id);
  if (unlinkedPersonalIds.some((id) => ['tezosx', 'ecosystem-l2', 'l2-governance'].includes(id))) {
    fail('My Tezos must not infer an L2 continuation without an explicit active-address link');
  }
  const returnCards = buildMyTezosJourneyLinks({
    view: 'collection',
    data: baseData,
    address: activeAddress,
    origin: { entryId: 'capital', intentId: 'capital-art' }
  });
  if (returnCards[0]?.title !== 'Return to Art Economy' || returnCards[0]?.href !== '/capital/?view=art' || !returnCards[0]?.isReturn) {
    fail('My Tezos must reconstruct a canonical child-view Return card without raw route state');
  }

  const analytics = journeyAnalyticsDetails({
    from: 'capital-art',
    to: 'my-tezos',
    surface: 'generic-wayfinder',
    reason: 'account-collection'
  });
  if (
    JSON.stringify(Object.keys(analytics || {})) !== JSON.stringify(['from', 'to', 'surface', 'reason'])
    || Object.values(analytics || {}).some((value) => /(?:tz[1-4]|KT1|0x[0-9a-f]{40}|\.tez|address=)/i.test(value))
  ) {
    fail('journey analytics must contain only the four privacy-safe canonical dimensions');
  }
  const originalSessionStorage = globalThis.sessionStorage;
  const sessionValues = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => sessionValues.get(key) || null,
    setItem: (key, value) => sessionValues.set(key, value),
    removeItem: (key) => sessionValues.delete(key)
  };
  sessionValues.set(MY_TEZOS_JOURNEY_ORIGIN_KEY, JSON.stringify({
    entryId: 'capital',
    intentId: 'capital-art',
    address: activeAddress
  }));
  if (readMyTezosJourneyOrigin() !== null || sessionValues.has(MY_TEZOS_JOURNEY_ORIGIN_KEY)) {
    fail('journey origin memory must reject and clear records with raw or extra fields');
  }
  if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage = originalSessionStorage;

  const rankedIntent = {
    'my tezos': 'my-tezos',
    wallet: 'my-tezos',
    '/history': 'history',
    '/leaderboard': 'leaderboard',
    '/compare': 'live-compare',
    widgets: 'widgets',
    '/stake': 'staking-chamber',
    chambers: 'chambers',
    governance: 'chamber',
    staking: 'staking-chamber',
    liquidity: 'liquidity-baking',
    finality: 'health',
    'rewards tracker': 'my-tezos',
    'nakamoto coefficient': 'health',
    "what's hot today": 'hot-today',
    nft: 'hen'
  };
  for (const [query, expectedId] of Object.entries(rankedIntent)) {
    const actual = searchSiteMap(query)[0]?.id;
    if (actual !== expectedId) fail(`site map search ${JSON.stringify(query)} should rank ${expectedId} first, got ${actual || 'none'}`);
  }
  const governanceOrder = searchSiteMap('governance').map((entry) => entry.id);
  if (!(governanceOrder.indexOf('chamber') < governanceOrder.indexOf('governance-guide')
    && governanceOrder.indexOf('governance-guide') < governanceOrder.indexOf('maxis'))) {
    fail(`site map search "governance" should keep the chamber first and rank the guide above Maxis, got ${governanceOrder.slice(0, 5).join(', ')}`);
  }

  const rankedSubfeatureIntent = {
    season: ['maxis-season', '/maxis/?view=season'],
    passport: ['maxis-passport', '/maxis/?view=passport'],
    champions: ['maxis-champions', '/maxis/?view=champions'],
    'transaction maxi': ['maxis-transaction', '/maxis/?lane=transaction'],
    'transaction season': ['maxis-transaction', '/maxis/?view=season&lane=transaction'],
    'transaction maxi season': ['maxis-transaction', '/maxis/?view=season&lane=transaction'],
    transaction: ['maxis-transaction', '/maxis/?lane=transaction'],
    'delegation maxi': ['maxis-delegation', '/maxis/?view=season&lane=delegation'],
    'bridge maxi': ['maxis-bridge', '/maxis/?view=season&lane=bridge'],
    'tezos vs ethereum': ['compare-ethereum', '/compare/tezos-vs-ethereum.html'],
    ethereum: ['compare-ethereum', '/compare/tezos-vs-ethereum.html'],
    'price widget': ['widget-price', '/widgets/price.html'],
    'baker card widget': ['widget-baker-card', '/widgets/baker-card.html']
  };
  for (const [query, [expectedId, expectedHref]] of Object.entries(rankedSubfeatureIntent)) {
    const actual = searchSiteMapIntents(query)[0];
    if (actual?.id !== expectedId || actual?.href !== expectedHref) {
      fail(`site map subfeature search ${JSON.stringify(query)} should rank ${expectedId} at ${expectedHref}, got ${actual?.id || 'none'} at ${actual?.href || 'none'}`);
    }
  }

  const transactionSeason = searchSiteMapIntents('transaction season')[0];
  if (transactionSeason?.title !== 'Transaction Maxi Season' || !/protocol-season Transaction Maxi race/.test(transactionSeason?.detail || '')) {
    fail('season lane intents must switch title and detail together with their season route');
  }

  const visibleLauncherQueries = {
    'HEN / Teia Collecting': 'hen',
    'Baker Directory': 'leaderboard',
    'Staking Rewards Estimator': 'calculator',
    'Tezos Widgets': 'widgets',
    'ctez Oven Exit': 'ctez'
  };
  for (const [query, expectedId] of Object.entries(visibleLauncherQueries)) {
    if (searchSiteMap(query)[0]?.id !== expectedId) fail(`visible Explore label ${JSON.stringify(query)} must resolve to ${expectedId}`);
  }

  const directoryIntentIds = new Set(SITE_MAP.flatMap((entry) => siteMapDirectoryChildren(entry).map((intent) => intent.id)));
  const browseIntentIds = siteMapBrowseIntents().map((intent) => intent.id);
  if (JSON.stringify(browseIntentIds) !== JSON.stringify([...directoryIntentIds])) {
    fail('empty search browse must expose every nested directory view exactly once');
  }
  for (const entry of siteMapSitemapEntries()) {
    if (entry.parentId && !directoryIntentIds.has(entry.id)) fail(`crawlable child route is missing from the complete human map: ${entry.id}`);
  }

  const expectedWidgetFiles = (await walk('widgets', (name) => name.endsWith('.html') && !name.endsWith('/builder.html')))
    .map((file) => `/${file}`);
  const widgetIntentHrefs = new Set(intentEntries.filter((entry) => entry.parentId === 'widgets').map((entry) => entry.href));
  for (const href of expectedWidgetFiles) {
    if (!widgetIntentHrefs.has(href)) fail(`widget endpoint is missing from canonical site map intents: ${href}`);
  }

  for (const intent of intentEntries) {
    const url = new URL(intent.href, 'https://tezos.systems');
    if (url.origin !== 'https://tezos.systems') continue;
    const local = url.pathname.endsWith('/') ? `${url.pathname.slice(1)}index.html` : url.pathname.slice(1);
    if (local && !(await pathExists(local))) fail(`site map intent ${intent.id} points to missing local route ${intent.href}`);
  }

  for (const route of CHAMBER_ROUTES) {
    const canonicalSlug = route.canonicalSlug || route.slug;
    if (!SITE_MAP.some((entry) => entry.href === `/${canonicalSlug}/`)) {
      fail(`site map is missing canonical chamber route /${canonicalSlug}/`);
    }
    const routeShell = await readText(`${route.slug}/index.html`);
    if (routeShell.includes('chamber-route-shell-intro')
      || routeShell.includes('data-chamber-route-shell')
      || routeShell.includes('chamber-route-title')
      || routeShell.includes('Opening the live room')) {
      fail(`${route.slug}/index.html must not leave a redundant route introduction behind the live room`);
    }
    if (!routeShell.includes(`<meta name="description" content="${route.description}">`)
      || !routeShell.includes(`<title>${route.title} | tezos.systems</title>`)) {
      fail(`${route.slug}/index.html must keep its route-specific title and summary in document metadata`);
    }
    if (!routeShell.includes('"@type": "WebPage"')
      || !routeShell.includes('"@type": "BreadcrumbList"')
      || routeShell.includes('"@type": "FAQPage"')) {
      fail(`${route.slug}/index.html must use route-specific WebPage/Breadcrumb schema without inherited dashboard FAQ claims`);
    }
  }

  const standalonePages = [
    'staking/index.html',
    'governance/index.html',
    'bakers/index.html',
    'landing.html',
    'compare/index.html',
    'compare/tezos-vs-ethereum.html',
    'compare/tezos-vs-solana.html',
    'compare/tezos-vs-cardano.html',
    'compare/tezos-vs-algorand.html',
    'hen/index.html',
    '404.html',
    'widgets/builder.html'
  ];
  for (const file of standalonePages) {
    const html = await readText(file);
    if (!html.includes('data-site-circulation') || !html.includes('data-site-footer') || !html.includes('/css/site-map.css') || !html.includes('/js/landing/site-nav.js')) {
      fail(`${file} must expose contextual circulation and the complete shared site map`);
    }
  }

  const search = await readText('js/features/search.js');
  const searchEntities = await readText('js/core/search-entities.js');
  const searchCatalogSource = await readText('js/core/search-catalog.js');
  const nativeExplorer = await readText('js/features/native-explorer.js');
  const tezosCrpSearch = await readText('js/features/tezoscrp.js');
  const searchCatalog = JSON.parse(await readText('data/search-catalog.json'));
  const ecosystemAppsForSearch = JSON.parse(await readText('data/ecosystem-apps.json'));
  const app = await readText('js/core/app.js');
  const index = await readText('index.html');
  const siteHandoff = await readText('js/core/site-handoff.js');
  const wayfinder = await readText('js/ui/wayfinder.js');
  if (/const\s+CHAMBERS\s*=/.test(search)) fail('hero search must not keep a duplicate Chamber catalog');
  const searchContracts = [
    ['generated first-party catalog loader', 'loadSearchCatalog', search],
    ['stable quiet result reconciliation', 'quietlySyncHtml(panel', search],
    ['nonselectable loading results', 'selectable: false', search],
    ['no pointer-move rerender', "panel.addEventListener('mousemove'", search, false],
    ['Base58 checksum validation', 'validateBase58Check', searchEntities],
    ['case-sensitive address warning', 'case-sensitive', search],
    ['catalog ranking through shared score', 'siteMapSearchScore(row, raw)', searchCatalogSource],
    ['contract entrypoint endpoint', '/entrypoints', nativeExplorer],
    ['contract same-code endpoint', '/same', nativeExplorer],
    ['contract raw-code endpoint', '/code?format=1', nativeExplorer],
    ['stale contract response guard', 'generation !== requestGeneration', nativeExplorer],
    ['partial Native Explorer source status', 'Partial TzKT read', nativeExplorer],
    ['Native Explorer last-good preservation', 'reconcileLastGoodLens', nativeExplorer],
    ['Native Explorer retry control', 'data-native-retry', nativeExplorer],
    ['Native Explorer unavailable-is-not-zero copy', 'unavailable fields are not zero', nativeExplorer],
    ['TezosCRP archive query route', "url.searchParams.set('q'", tezosCrpSearch]
  ];
  for (const [label, snippet, source, expected = true] of searchContracts) {
    const present = source.includes(snippet);
    if (present !== expected) fail(`search contract mismatch: ${label}`);
  }
  const searchCatalogKinds = searchCatalog.rows?.reduce((counts, row) => counts.add(row.kind), new Set()) || new Set();
  if (searchCatalog.schemaVersion !== 1
    || searchCatalog.rows?.length < 850
    || !['app', 'identity', 'history', 'milestone'].every((kind) => searchCatalogKinds.has(kind))) {
    fail('generated search catalog is incomplete');
  } else {
    pass(`search safety, catalog, contract-lens, and stable-interaction contracts checked: ${searchCatalog.rows.length} rows`);
  }
  const catalogAppNames = new Set(searchCatalog.rows?.filter((row) => row.kind === 'app').map((row) => row.title));
  const missingSearchApps = (ecosystemAppsForSearch.apps || []).map((appEntry) => appEntry.name).filter((name) => !catalogAppNames.has(name));
  if (missingSearchApps.length) fail(`generated search catalog omits reviewed apps: ${missingSearchApps.join(', ')}`);
  if (!index.includes('data-site-handoff data-site-context="home"')
    || !index.includes('data-site-footer data-site-context="home"')
    || !siteHandoff.includes('SITE_MAP_NAV_GROUPS.map')) {
    fail('dashboard must expose separate manifest-backed Handoff and footer surfaces');
  }
  for (const [questionId, entryId] of [
    ['build', 'ecosystem'],
    ['move', 'ledger-flow'],
    ['now', 'pulse'],
    ['mine', 'my-tezos'],
    ['decide', 'chamber'],
    ['before', 'anthology'],
    ['power', 'staking-chamber']
  ]) {
    if (!siteHandoff.includes(`id: '${questionId}'`) || !siteHandoff.includes(`entryId: '${entryId}'`)) {
      fail(`Handoff question ${questionId} must resolve through the canonical ${entryId} entry`);
    }
  }
  if (!siteHandoff.includes("window.addEventListener('site-handoff-signal', applySignal)")
    || !siteHandoff.includes("link.classList.toggle('is-emphasized'")
    || !siteHandoff.includes("container.dataset.siteHandoffEmphasisSource = source")
    || !siteHandoff.includes("document.visibilityState !== 'visible'")
    || !siteHandoff.includes("!handoffReaderIsHolding(container)")) {
    fail('Handoff signal emphasis must reconcile in place without rebuilding the navigation field');
  }
  if (!app.includes('initSiteWayfinder') || !wayfinder.includes('siteMapJourneyLinks')) fail('dashboard Chambers must initialize the shared semantic wayfinder');
  if (!index.includes('data-site-map-complete') || !index.includes('class="feature-launcher-directory-link"') || !index.includes('href="/#site-map"')) {
    fail('Explore must expose one quiet complete-directory utility');
  }
  if (index.includes('id="search-everything-feature-link"')) {
    fail('Explore must not duplicate the global search surface as another feature row');
  }
  const nativePulse = await readText('js/features/network-pulse.js');
  const nativeStaking = await readText('js/features/staking-chamber.js');
  const nativeWayfinders = [nativePulse, nativeStaking];
  for (const native of nativeWayfinders) {
    if (!native.includes('data-site-wayfinder-native') || !native.includes('siteMapJourneyLinks(') || !native.includes('href="/#chambers"') || !native.includes('href="/#search"')) {
      fail('native Chamber wayfinders must expose four semantic neighbors plus Chambers and search exits');
    }
  }
  const siteMapCss = await readText('css/site-map.css');
  if (siteMapCss.includes('var(--handoff-constellation-x)')
      || siteMapCss.includes('var(--handoff-constellation-compact-x)')) {
    fail('Handoff signal emphasis must not translate its interactive link targets');
  }
  if (!siteMapCss.includes('.chamber-overlay [data-site-wayfinder-native]')) {
    fail('native Chamber wayfinders must inherit the shared wayfinder color and border variables');
  }
  if ((nativePulse.match(/renderChamberLinks\(\)/g) || []).length < 3 || (nativeStaking.match(/renderNativeWayfinder\(\)/g) || []).length < 3) {
    fail('native Chamber wayfinders must survive both successful and failed live-data renders');
  }

  const jsonLdMatch = index.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  const webAppSchema = jsonLdMatch ? JSON.parse(jsonLdMatch[1]) : null;
  const featureList = new Set(Array.isArray(webAppSchema?.featureList) ? webAppSchema.featureList : []);
  for (const entry of SITE_MAP.filter((item) => item.id !== 'home')) {
    if (!featureList.has(entry.title)) fail(`WebApplication featureList is missing canonical ware: ${entry.title}`);
  }

  pass(`site map graph checked: ${SITE_MAP.length} destinations, ${intentEntries.length} child views, ${SITE_MAP_NAV_GROUPS.length} groups, ${standalonePages.length} standalone surfaces`);
}

async function checkCacheBustAlignment() {
  const index = await readText('index.html');
  const sw = await readText('sw.js');
  const app = await readText('js/core/app.js');
  const releaseUpdate = await readText('js/ui/release-update.js');
  const changelogSource = await readText('js/features/changelog.js');
  const changelogModuleUrl = `data:text/javascript;base64,${Buffer.from(changelogSource).toString('base64')}`;
  const { CHANGELOG } = await import(changelogModuleUrl);
  const latestChangelogEntry = await readText('scripts/latest-changelog-entry.mjs');
  const stampVersion = await readText('scripts/stamp-version.sh');
  const version = JSON.parse(await readText('version.json'));
  const styles = await readText('css/styles.css');
  const heroSearch = await readText('js/features/search.js');
  const leaderboard = await readText('js/features/leaderboard.js');
  const ledgerFlow = await readText('js/features/ledger-flow.js');
  const networkPulse = await readText('js/features/network-pulse.js');
  const stakingChamber = await readText('js/features/staking-chamber.js');
  const networkHealth = await readText('js/features/network-health.js');
  const maxis = await readText('js/features/maxis.js');
  const assetVersion = await readText('js/core/asset-version.js');
  const themePreload = await readText('js/core/theme-preload.js');
  const themeUi = await readText('js/ui/theme.js');
  const cssMatch = index.match(/css\/styles\.min\.css\?v=(\d+)/);
  const loadingCssLinkMatch = index.match(/css\/loading\.css\?v=(\d+)/);
  const heroCssLinkMatch = index.match(/css\/hero-search\.css\?v=(\d+)/);
  const siteMapCssLinkMatch = index.match(/css\/site-map\.css\?v=(\d+)/);
  const appPreloadMatch = index.match(/js\/core\/app\.js\?v=(\d+)/);
  const appScriptMatch = index.match(/<script[^>]+src=["']js\/core\/app\.js\?v=(\d+)["']/);
  const themePreloadScriptMatch = index.match(/js\/core\/theme-preload\.js\?v=(\d+)/);
  const cacheMatch = sw.match(/CACHE_NAME\s*=\s*['"]tezos-systems-v(\d+)['"]/);
  const shellExtrasCssMatch = index.match(/css\/shell-extras\.min\.css\?v=(\d+)/);
  const assetVersionMatch = assetVersion.match(/ASSET_VERSION\s*=\s*['"](\d+)['"]/);
  const themePreloadMatch = themePreload.match(/THEME_CSS_VERSION\s*=\s*['"](\d+)['"]/);
  const themeUiMatch = themeUi.match(/THEME_CSS_VERSION\s*=\s*['"](\d+)['"]/);
  const runtimeCssContracts = [
    ['search.js hero-search.css', heroSearch, "versionedAsset('/css/hero-search.css')"],
    ['app.js generated My Tezos CSS', app, "versionedAsset('/css/my-tezos.min.css')"],
    ['leaderboard.js leaderboard CSS', leaderboard, "versionedAsset('/css/leaderboard.min.css')"],
    ['ledger-flow.js Ledger Flow CSS', ledgerFlow, "versionedAsset('/css/ledger-flow.min.css')"],
    ['network-pulse.js Network Pulse CSS', networkPulse, "versionedAsset('/css/network-pulse.min.css')"],
    ['staking-chamber.js Staking CSS', stakingChamber, "versionedAsset('/css/staking-chamber.min.css')"],
    ['network-health.js Network Health CSS', networkHealth, "versionedAsset('/css/network-health.min.css')"],
    ['maxis.js Maxis CSS', maxis, "versionedAsset('/css/maxis.min.css')"]
  ];

  if (!cssMatch) fail('index.html must serve css/styles.min.css with a ?v= cache stamp');
  if (!loadingCssLinkMatch) fail('index.html must serve css/loading.css with a ?v= cache stamp');
  if (!heroCssLinkMatch) fail('index.html must serve css/hero-search.css with a ?v= cache stamp');
  if (!siteMapCssLinkMatch) fail('index.html must serve css/site-map.css with a ?v= cache stamp');
  if (!appPreloadMatch) fail('index.html modulepreload for js/core/app.js must carry a ?v= cache stamp');
  if (!appScriptMatch) fail('index.html app module script must carry a ?v= cache stamp');
  if (!themePreloadScriptMatch) fail('index.html theme-preload.js script must carry a ?v= cache stamp');
  if (!cacheMatch) fail('sw.js CACHE_NAME must be tezos-systems-vNN');
  if (!shellExtrasCssMatch) fail('index.html must serve the render-blocking minified shell-extras bundle with a ?v= cache stamp');
  if (!assetVersionMatch) fail('asset-version.js must expose the shared runtime ASSET_VERSION');
  for (const [label, source, contract] of runtimeCssContracts) {
    if (!source.includes(contract)) fail(`${label} loader must use the shared versionedAsset() cache stamp`);
  }
  if (!themePreloadMatch) fail('theme-preload.js must expose THEME_CSS_VERSION');
  if (!themeUiMatch) fail('theme.js must expose THEME_CSS_VERSION');

  const versions = [
    cssMatch?.[1],
    loadingCssLinkMatch?.[1],
    heroCssLinkMatch?.[1],
    siteMapCssLinkMatch?.[1],
    appPreloadMatch?.[1],
    appScriptMatch?.[1],
    themePreloadScriptMatch?.[1],
    cacheMatch?.[1],
    shellExtrasCssMatch?.[1],
    assetVersionMatch?.[1],
    themePreloadMatch?.[1],
    themeUiMatch?.[1]
  ].filter(Boolean);
  if (new Set(versions).size > 1) {
    fail(`cache stamps are out of sync: ${versions.join(', ')}`);
  } else if (versions.length === 12) {
    pass(`cache stamps aligned at v${versions[0]}`);
  }

  const generatedRouteCacheRefs = [
    ['styles', /<link rel="stylesheet" href="\/css\/styles\.min\.css\?v=(\d+)">/],
    ['loading', /<link rel="stylesheet" href="\/css\/loading\.css\?v=(\d+)">/],
    ['hero search', /<link id="hero-search-css" rel="stylesheet" href="\/css\/hero-search\.css\?v=(\d+)">/],
    ['site map', /<link rel="stylesheet" href="\/css\/site-map\.css\?v=(\d+)">/],
    ['app module preload', /<link rel="modulepreload" href="\/js\/core\/app\.js\?v=(\d+)">/],
    ['theme preload', /<script src="\/js\/core\/theme-preload\.js\?v=(\d+)"><\/script>/],
    ['app module script', /<script type="module" src="\/js\/core\/app\.js\?v=(\d+)"><\/script>/]
  ];
  const generatedRouteCacheVersion = cacheMatch?.[1];
  if (generatedRouteCacheVersion) {
    for (const route of CHAMBER_ROUTES) {
      const routeShell = await readText(`${route.slug}/index.html`);
      for (const [label, pattern] of generatedRouteCacheRefs) {
        const routeVersion = routeShell.match(pattern)?.[1];
        if (routeVersion !== generatedRouteCacheVersion) {
          fail(`${route.slug}/index.html ${label} cache stamp must match v${generatedRouteCacheVersion}, saw ${routeVersion || 'missing'}`);
        }
      }
    }
    pass(`${CHAMBER_ROUTES.length} generated Chamber shells align seven cache-stamped shell references at v${generatedRouteCacheVersion}`);
  }

  const themeVersions = [themePreloadMatch?.[1], themeUiMatch?.[1], cssMatch?.[1]].filter(Boolean);
  if (new Set(themeVersions).size > 1) {
    fail(`lazy theme CSS versions are out of sync: ${themeVersions.join(', ')}`);
  } else if (themeVersions.length === 3) {
    pass(`lazy theme CSS version aligned at v${themeVersions[0]}`);
  }

  if (!sw.includes("'/version.json'") && !sw.includes('/version.json')) {
    fail('sw.js must handle version.json freshness');
  } else {
    pass('service worker handles version.json freshness');
  }

  const shellAssetsBlock = sw.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/)?.[1] || '';
  for (const optionalAsset of ["'/anthology/'", "'/pulse/'", "'/widgets/builder.html'", "'/css/styles.css'", "'/css/network-health.css'", "'/data/maxis/manifest.json'"]) {
    if (shellAssetsBlock.includes(optionalAsset)) fail(`sw.js install shell should not precache optional asset ${optionalAsset}`);
  }
  for (const contract of ['RUNTIME_CACHE_LIMIT', "_quality: { status: 'unavailable', observedAt: null }"]) {
    if (!sw.includes(contract)) fail(`sw.js bounded runtime/explicit API failure contract missing ${contract}`);
  }
  if (sw.includes('staleApiFallback') || sw.includes('API_CACHE_MAX_AGE_MS')) {
    fail('sw.js must not return cached API payloads as successful current responses to provenance-unaware consumers');
  }
  if (!shellAssetsBlock.includes("'/offline.html'") || !sw.includes("caches.match('/offline.html')")) {
    fail('sw.js must precache and serve the self-contained offline navigation page');
  }
  if (shellAssetsBlock.includes("'/'") || shellAssetsBlock.includes("'/index.html'")) {
    fail('sw.js must not precache navigable dashboard HTML when offline navigations deliberately use offline.html');
  }
  if (!sw.includes("event.data?.type === 'SKIP_WAITING'") || !app.includes("waiting.postMessage({ type: 'SKIP_WAITING' })")) {
    fail('service-worker updates must wait for an explicit visible user action');
  }
  const releaseUpdateContracts = [
    ["import('../ui/release-update.js')", app],
    ['SERVICE_WORKER_UPDATE_CHECK_MS', app],
    ['SERVICE_WORKER_UPDATE_DEFER_MS', app],
    ['SERVICE_WORKER_UPDATE_DEFER_KEY', app],
    ['sessionStorage.setItem(SERVICE_WORKER_UPDATE_DEFER_KEY', app],
    ['sessionStorage.getItem(SERVICE_WORKER_UPDATE_DEFER_KEY', app],
    ['SERVICE_WORKER_ACTIVATION_FALLBACK_MS', app],
    ['window.setInterval(checkForUpdate, SERVICE_WORKER_UPDATE_CHECK_MS)', app],
    ["document.visibilityState === 'visible'", app],
    ['Update applied in another tab', app],
    ['Update ready to finish', app],
    ['fetchReleaseUpdateMetadata', app],
    ['version?.latestChange', app],
    ['hydrateIncomingReleaseContext', releaseUpdate],
    ['showReleaseUpdateDock', releaseUpdate],
    ['reserveToastSafeArea(SAFE_AREA_KEY', releaseUpdate],
    ['--release-update-safe-bottom', releaseUpdate],
    ['release-update-safe-area-raised', releaseUpdate],
    ['tezos:overlay-stack-change', releaseUpdate],
    ['activeOverlayCount', releaseUpdate],
    ['overlaySuppressed', releaseUpdate],
    ["pill.addEventListener('click'", releaseUpdate],
    ['release-update-transmission-header', releaseUpdate],
    ['System transmission · incoming', releaseUpdate],
    [".release-update-action", styles],
    [".release-update-transmission-header", styles],
    ['left: 50%', styles],
    ['.release-update-dock[data-state="error"]', styles],
    ['--release-accent: #45E0C8', styles],
    ['min-height: 44px', styles],
    [".release-update-dock.is-collapsed", styles],
    ['expanded = false', releaseUpdate]
  ];
  for (const [snippet, source] of releaseUpdateContracts) {
    if (!source.includes(snippet)) fail(`service-worker release dock contract missing: ${snippet}`);
  }
  if (!shellAssetsBlock.includes("'/js/ui/release-update.js'")) {
    fail('service-worker install shell must include the dedicated release update UI');
  }
  const currentLatestChange = CHANGELOG[0]?.entries?.at(-1)?.text || '';
  if (!currentLatestChange
      || version.latestChange !== currentLatestChange
      || !latestChangelogEntry.includes("CHANGELOG[0]")
      || !stampVersion.includes('latest-changelog-entry.mjs')) {
    fail('version metadata must carry the latest user-facing changelog entry for the release transmission');
  } else {
    pass('release transmission metadata matches the latest user-facing changelog entry');
  }
  if (app.includes('service-worker-update-toast') || app.includes('duration: 15000')) {
    fail('service-worker updates must not regress to the expiring ambient toast');
  }
  if (!themePreload.includes("window.location.hash.slice(1)") || !themePreload.includes("get('theme')")) {
    fail('theme-preload.js must honor hash theme deep links before first paint');
  }
  if (!themeUi.includes("window.location.hash.slice(1)") || !themeUi.includes("hashParams.get('theme')")) {
    fail('theme.js runtime initialization must preserve hash theme precedence over saved preferences');
  }
  pass('service worker uses a bottom-center System Transmission with current release context, visible hourly checks, cross-tab recovery, a small install shell, bounded runtime cache, explicit API failures, and an offline navigation page');

  if (!index.includes('<meta property="og:image:width" content="1200">') || !index.includes('<meta property="og:image:height" content="630">')) {
    fail('index.html root OG image metadata must match generated og-image.png at 1200x630');
  } else {
    pass('root OG image dimensions match generator output');
  }
  const rootOgUrl = index.match(/<meta property="og:image" content="(https:\/\/tezos\.systems\/og-image\.png\?v=[^"]+)">/)?.[1];
  if (!rootOgUrl || !index.includes(`<meta name="twitter:image" content="${rootOgUrl}">`)) {
    fail('index.html root OG and X metadata must share one cache-busted social-card URL');
  } else {
    const rootOgConsumers = [
      'landing.html',
      'staking/index.html',
      'governance/index.html',
      'bakers/index.html',
      'hen/index.html',
      'compare/index.html',
      'compare/tezos-vs-ethereum.html',
      'compare/tezos-vs-solana.html',
      'compare/tezos-vs-cardano.html',
      'compare/tezos-vs-algorand.html'
    ];
    for (const file of rootOgConsumers) {
      const html = await readText(file);
      const references = [...html.matchAll(/https:\/\/tezos\.systems\/og-image\.png(?:\?v=[^"']+)?/g)].map((match) => match[0]);
      if (!references.length || references.some((reference) => reference !== rootOgUrl)) {
        fail(`${file} must use the shared cache-busted root social-card URL`);
      }
    }
    pass(`root social-card cache key aligned across ${rootOgConsumers.length + 1} public surfaces`);
  }

  if (!app.includes("fetch('/version.json'")) {
    fail('app.js must fetch /version.json from the site root so clean route pages do not request nested version metadata');
  } else {
    pass('app.js fetches version metadata from the site root');
  }
}

async function checkCsp() {
  const index = await readText('index.html');
  const cspMatch = index.match(/http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"/i)
    || index.match(/http-equiv=["']Content-Security-Policy["'][^>]*content='([^']+)'/i);
  if (!cspMatch) {
    fail('index.html is missing a Content-Security-Policy meta tag');
    return;
  }

  const csp = cspMatch[1];
  const requiredScript = [
    'cdn.jsdelivr.net',
    'https://esm.sh'
  ];
  for (const domain of requiredScript) {
    if (!csp.includes(domain)) fail(`CSP script-src is missing ${domain}`);
  }

  const requiredConnect = [
    'api.coingecko.com',
    '*.tzkt.io',
    'api.tezos.domains',
    '*.rpc.tez.capital',
    '*.supabase.co',
    'data.objkt.com',
    'api.github.com',
    'cdn.jsdelivr.net',
    'https://esm.sh',
    '*.octez.io',
    'teztale-server-mainnet-ro-prd.octez.tech',
    'wss://*.octez.io',
    'https://*.papers.tech',
    'wss://*.papers.tech',
    'wss://relay.walletconnect.com',
    'wss://ws.kraken.com',
    'api.llama.fi',
    'explorer.etherlink.com',
    'node.mainnet.etherlink.com'
  ];
  for (const domain of requiredConnect) {
    if (!csp.includes(domain)) fail(`CSP connect-src is missing ${domain}`);
  }
  const mediaDirective = csp.match(/media-src\s+([^;]+)/)?.[1] || '';
  for (const domain of ['assets.objkt.media', 'dweb.link', 'nftstorage.link', 'ipfs.io', 'gateway.pinata.cloud']) {
    if (!mediaDirective.includes(domain)) fail(`CSP media-src is missing HEN media gateway ${domain}`);
  }
  pass('CSP includes required live-data domains');
}

async function checkSitemapCoverage() {
  const sitemap = await readText('sitemap.xml');
  const locs = new Set(Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => match[1].replaceAll('&amp;', '&')));
  const source = await readText('js/core/site-map.js');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const { siteMapSitemapEntries } = await import(moduleUrl);
  const expected = new Set(siteMapSitemapEntries().map((entry) => new URL(entry.href, 'https://tezos.systems').toString()));
  const protocolData = JSON.parse(await readText('data/protocol-data.json'));
  for (const protocol of protocolData.protocols || []) {
    const slug = String(protocol?.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) expected.add(`https://tezos.systems/anthology/${slug}/`);
  }

  for (const url of expected) {
    if (!locs.has(url)) fail(`sitemap.xml missing ${url}`);
  }
  for (const url of locs) {
    if (!expected.has(url)) fail(`sitemap.xml contains a route outside the canonical site map: ${url}`);
    if (url.includes('#')) fail(`sitemap.xml should use crawlable paths instead of hash fragments: ${url}`);
  }

  const canonicalPages = {
    'landing.html': 'https://tezos.systems/',
    'staking/index.html': 'https://tezos.systems/staking/',
    'governance/index.html': 'https://tezos.systems/governance/',
    'bakers/index.html': 'https://tezos.systems/bakers/',
    'hen/index.html': 'https://tezos.systems/hen/',
    'widgets/builder.html': 'https://tezos.systems/widgets/builder.html'
  };
  for (const file of await walk('widgets', (name) => name.endsWith('.html') && !name.endsWith('/builder.html'))) {
    canonicalPages[file] = `https://tezos.systems/${file}`;
  }
  for (const [file, canonical] of Object.entries(canonicalPages)) {
    const html = await readText(file);
    if (!html.includes(`<link rel="canonical" href="${canonical}">`)) fail(`${file} canonical URL must agree with the site map: ${canonical}`);
    if (file === 'landing.html' && !html.includes(`<meta property="og:url" content="${canonical}">`)) {
      fail(`landing.html Open Graph URL must agree with its Dashboard canonical: ${canonical}`);
    }
  }

  pass(`canonical sitemap equality checked: ${locs.size} URLs`);
}

async function checkSelectorContracts() {
  const index = await readText('index.html');
  const themePreload = await readText('js/core/theme-preload.js');
  const networkHealth = await readText('js/features/network-health.js');
  const siteMapSource = await readText('js/core/site-map.js');
  const siteHandoffSource = await readText('js/core/site-handoff.js');
  const siteMapModuleUrl = `data:text/javascript;base64,${Buffer.from(siteMapSource).toString('base64')}`;
  const { siteMapStarters } = await import(siteMapModuleUrl);
  const governanceLanding = await readText('governance/index.html');
  const landingLiveData = await readText('js/landing/live-data.js');
  const shareSnippetSource = await readText('js/ui/share.js');
  const requiredIds = [
    'price-bar',
    'ctez-launcher',
    'tzsafe-launcher',
    'features-gear',
    'features-dropdown',
    'ctez-feature-btn',
    'tzsafe-feature-link',
    'chambers-toggle',
    'chambers-section',
    'chambers-grid',
    'hot-today-info-btn',
    'pulse-ticker-strip',
    'pulse-ticker-viewport',
    'pulse-ticker-shelf',
    'live-head',
    'live-head-stack',
    'live-head-next',
    'live-head-depth-toggle',
    'live-head-depth-setting',
    'header-activity-button',
    'header-activity-line',
    'header-protocol-chip',
    'header-current-protocol',
    'hero-slot',
    'hero-search-form',
    'hero-search-input',
    'hero-search-panel',
    'recruit-section',
    'comparison-summary',
    'widgets-gallery',
    'settings-gear',
    'settings-dropdown',
    'my-tezos-btn',
    'my-tezos-drawer',
    'drawer-close',
    'calc-toggle',
    'calculator-section',
    'share-btn',
    'changelog-btn',
    'changelog-modal',
    'history-copy-link',
    'governance-alert-strip',
    'build-version'
  ];

  for (const id of requiredIds) {
    if (!index.includes(`id="${id}"`)) fail(`index.html missing required QA selector #${id}`);
  }
  pass(`required QA selectors checked: ${requiredIds.length}`);

  const requiredSnippets = [
    ['feature launcher grouped menu', 'class="settings-dropdown feature-launcher"'],
    ['expanded My Tezos header action', 'class="glass-button header-nav-btn header-primary-action"'],
    ['My Tezos emoji and text label', '<span class="my-tezos-icon">👤</span> <span class="nav-label">My Tezos</span>'],
    ['feature launcher decorative map icon', '<span aria-hidden="true">🗺️</span> <span class="nav-label">Explore</span>'],
    ['header Setup action', '<span aria-hidden="true">⚙️</span> <span class="nav-label">Setup</span>'],
    ['feature launcher Explore title', 'class="feature-launcher-intro-copy"'],
    ['feature launcher progressive-disclosure copy', 'Start with a live room, then open a category when you need more.'],
    ['feature launcher starter group', '<div class="dropdown-section-label">Start here</div>'],
    ['feature launcher disclosure groups', 'class="feature-launcher-group feature-launcher-disclosure"'],
    ['feature launcher disclosure grid', 'class="feature-launcher-disclosure-grid"'],
    ['feature launcher explicit close control', 'data-dropdown-close aria-label="Close Explore"'],
    ['feature launcher Tezos Domains row', 'id="domains-feature-link"'],
    ['feature launcher legacy group', 'feature-launcher-group feature-launcher-disclosure feature-launcher-legacy'],
    ['combined chambers launcher copy link', 'data-copy-hash="#chambers"'],
    ['direct feature copy links', 'data-copy-hash="#compare"'],
    ['widget embed utility panel', 'class="widget-utility-panel"'],
    ['widget embed utility hidden by default', 'class="stats-section widget-utility-section toggleable-section"'],
    ['widget builder CTA', 'href="/widgets/builder.html"'],
    ['share picker styles hook', 'section-picker-note'],
    ['price bar change surface', 'class="price-change"'],
    ['price bar 7-day change surface', 'data-price-change="7d"'],
    ['price bar 30-day change surface', 'data-price-change="30d"'],
    ['price bar cycle health launcher', 'class="cycle-chip" id="cycle-chip" href="#health"'],
    ['Tezos Handoff navigation hook', 'data-site-handoff data-site-context="home"'],
    ['Separate Tezos footer hook', 'data-site-footer data-site-context="home"'],
    ['Separate Tezos footer styling hook', 'class="footer site-footer-separate"'],
    ['Tezos Handoff attribution hook', 'data-site-footer-attribution'],
    ['Tezos Handoff title', 'Follow a question, not a menu.', siteHandoffSource],
    ['Tezos Handoff question field', 'class="site-handoff-question-field"', siteHandoffSource],
    ['Tezos Handoff complete map disclosure', 'Open the complete map · ${totalDestinations} destinations', siteHandoffSource],
    ['Tezos Handoff human question route', 'What’s being built?', siteHandoffSource],
    ['Tezos Handoff hospitable invitation', 'Stay awhile. When one of these feels like yours, follow it.', siteHandoffSource],
    ['Tezos Handoff topical signal hook', "window.addEventListener('hot-signal-rendered', applySignal)", siteHandoffSource],
    ['Live Head search placeholder', 'placeholder="Search Tezos"'],
    ['timeline share fallback host', 'document.querySelector(\'.upgrade-badges\')'],
    ['timeline share protocol history chamber fallback', 'document.querySelector(\'#protocol-history-chamber-modal .protocol-history-feature-panel\')'],
    ['header protocol chip', 'id="header-protocol-chip" href="#protocol-history"'],
    ['Live Head combined shell', 'class="live-head-panel lb-panel" id="live-head"'],
    ['hero command bar slot', 'class="hero-slot" id="hero-slot"'],
    ['hero command bar combobox', 'aria-controls="hero-search-panel"'],
    ['Governance alert strip shell', 'class="stats-section governance-alert-section"'],
    ['History modal direct link copy button', 'id="history-copy-link"'],
    ['Governance SEO nonblank voting fallback', 'data-live="voting-period">Checking TzKT', governanceLanding],
    ['Governance SEO source freshness note', 'data-live="governance-freshness"', governanceLanding],
    ['Governance SEO retry fallback', 'Live governance status is retrying', landingLiveData],
    ['Governance SEO checked-at freshness helper', 'function checkedAtLabel', landingLiveData]
  ];

  for (const [label, snippet, source] of requiredSnippets) {
    const text = source || `${index}\n${shareSnippetSource}`;
    if (!text.includes(snippet)) {
      fail(`missing selector contract: ${label}`);
    }
  }
  pass(`new UX selector contracts checked: ${requiredSnippets.length}`);

  if (index.includes('return-greeting')) {
    fail('the header must not restore the personalized return greeting beside My Tezos');
  }

  if (index.includes('Start from anything.') || index.includes('data-loop-aura')) {
    fail('dashboard footer must not restore the retired search-recipe console');
  }

  const uptimeClusterStart = index.indexOf('<div class="top-uptime-cluster">');
  const milestonePopoverIndex = index.indexOf('<span class="top-continuity-milestone-popover"', uptimeClusterStart);
  const milestoneOutlineIndex = index.indexOf('<span class="top-continuity-milestone-outline"', uptimeClusterStart);
  const milestoneNewIndex = index.indexOf('<span class="top-continuity-milestone-new"', milestoneOutlineIndex);
  const milestoneCloseIndex = index.indexOf('<button class="top-continuity-milestone-close"', uptimeClusterStart);
  const milestoneLinkIndex = index.indexOf('<a class="top-continuity-milestone-link"', uptimeClusterStart);
  const uptimeYearIndex = index.indexOf('<button class="top-continuity-history"', uptimeClusterStart);
  const uptimeCounterIndex = index.indexOf('id="hero-chain-uptime-counter"', uptimeYearIndex);
  const uptimeOriginIndex = index.indexOf('class="top-continuity-origin"', uptimeCounterIndex);
  if (
    uptimeClusterStart < 0
    || uptimeYearIndex < uptimeClusterStart
    || uptimeCounterIndex < uptimeYearIndex
    || milestoneOutlineIndex < uptimeCounterIndex
    || milestoneNewIndex < milestoneOutlineIndex
    || !index.includes('<span class="top-continuity-milestone-outline" aria-hidden="true" hidden></span>\n                                        <span class="top-continuity-milestone-new" aria-hidden="true">New</span>')
    || uptimeOriginIndex < milestoneNewIndex
    || milestonePopoverIndex < uptimeOriginIndex
    || milestoneCloseIndex < milestonePopoverIndex
    || milestoneLinkIndex < milestonePopoverIndex
  ) {
    fail('header milestone clean outline must wrap the uptime counter, attach its NEW marker, and keep its closeable disclosure anchored after the clock');
  }
  if (index.includes('top-continuity-milestone-orbit') || index.includes('top-continuity-milestone-eclipse')) {
    fail('header milestone clean outline must not restore the retired chronograph or ellipse');
  }
  const brandStackStart = index.indexOf('<div class="header-brand-stack">');
  const titleRowIndex = index.indexOf('<div class="header-title-row"', brandStackStart);
  const continuityRowIndex = index.indexOf('<div class="top-continuity-row">', titleRowIndex);
  const liveHeadIndex = index.indexOf('id="live-head"');
  const activityButtonIndex = index.indexOf('id="header-activity-button"');
  const liveHeadFilterIndex = index.indexOf('id="live-head-filter-toggle"', liveHeadIndex);
  if (brandStackStart < 0 || titleRowIndex < brandStackStart || continuityRowIndex < titleRowIndex || uptimeClusterStart < continuityRowIndex) {
    fail('header must keep title first, then mainnet age in the lower continuity row');
  }
  if (liveHeadIndex < 0 || activityButtonIndex < liveHeadIndex || liveHeadFilterIndex < activityButtonIndex) {
    fail('trailing-hour activity must move into the Live Head right rail immediately before its activity setup control');
  }
  if (index.includes('Syncing 1H activity')) {
    fail('header first paint must not expose the retired one-hour activity loading sentence');
  }
  const initialActivityEnd = index.indexOf('</button>', activityButtonIndex);
  const initialActivityMarkup = index.slice(activityButtonIndex, initialActivityEnd);
  if (!initialActivityMarkup.includes('header-activity-cluster is-loading')
      || !initialActivityMarkup.includes('>1H Activity</span>')
      || !['tx', 'moved', 'nft', 'whale'].every((slot) => initialActivityMarkup.includes(`data-usage-slot="${slot}"`))) {
    fail('header first paint must reserve the final one-hour metric cluster before JavaScript runs');
  }
  if (!networkHealth.includes('>1H Activity</span>${segments}')) {
    fail('live Network Health refresh must preserve the descriptive 1H Activity header label');
  }

  const chambersLauncherIndex = index.indexOf('id="chambers-toggle"');
  const pulseLauncherIndex = index.indexOf('id="tezos-stats-toggle"');
  const stakingLauncherIndex = index.indexOf('id="staking-chamber-feature-link"');
  const maxisLauncherIndex = index.indexOf('id="maxis-feature-link"');
  const ctezLauncherIndex = index.indexOf('id="ctez-feature-btn"');
  const legacyLauncherIndex = index.indexOf('feature-launcher-group feature-launcher-disclosure feature-launcher-legacy');
  if (chambersLauncherIndex < 0 || ctezLauncherIndex < 0 || chambersLauncherIndex > ctezLauncherIndex) {
    fail('Explore launcher must keep Chambers ahead of ctez recovery tools');
  }
  if (![chambersLauncherIndex, pulseLauncherIndex, stakingLauncherIndex, maxisLauncherIndex].every((position) => position >= 0)
      || !(chambersLauncherIndex < pulseLauncherIndex && pulseLauncherIndex < stakingLauncherIndex && stakingLauncherIndex < maxisLauncherIndex)) {
    fail('Explore starter order must be Chambers, Network Pulse, Staking Chamber, then Tezos Maxis');
  }
  if (legacyLauncherIndex < 0 || ctezLauncherIndex < 0 || legacyLauncherIndex > ctezLauncherIndex) {
    fail('Explore launcher ctez recovery tools must stay inside the legacy group');
  }

  const promotedStarterIds = [...index.matchAll(/data-site-map-starter="([^"]+)"/g)].map((match) => match[1]);
  if (JSON.stringify(promotedStarterIds) !== JSON.stringify(['pulse', 'staking-chamber', 'maxis'])) {
    fail(`Explore promoted starter set drifted: ${promotedStarterIds.join(', ')}`);
  }
  const canonicalStarterIds = new Set(siteMapStarters().map((entry) => entry.id));
  if (promotedStarterIds.some((id) => !canonicalStarterIds.has(id))) {
    fail('Explore promoted rows must come from the canonical site-map starter set');
  }

  for (const retiredSnippet of ['feature-live-crumb', 'explore-chambers-live', 'my-tezos-feature-btn']) {
    if (index.includes(retiredSnippet)) fail(`Explore launcher contains retired duplicate surface: ${retiredSnippet}`);
  }
  pass('Explore launcher hierarchy checked');

  const retiredLauncherSnippets = [
    ['individual Chamber launcher', 'id="chamber-toggle"'],
    ['individual LB launcher', 'id="liquidity-baking-toggle"'],
    ['individual tz4 launcher', 'id="tz4-adoption-toggle"'],
    ['individual tz4 launcher copy link', 'feature-copy-link" type="button" data-copy-hash="#tz4"']
  ];
  for (const [label, snippet] of retiredLauncherSnippets) {
    if (index.includes(snippet)) fail(`retired launcher still present: ${label}`);
  }
  pass(`retired chamber launcher contracts checked: ${retiredLauncherSnippets.length}`);

  const app = await readText('js/core/app.js');
  const siteMap = await readText('js/core/site-map.js');
  const siteHandoff = await readText('js/core/site-handoff.js');
  const siteNav = await readText('js/landing/site-nav.js');
  const search = await readText('js/features/search.js');
  const heroSearchCss = await readText('css/hero-search.css');
  const siteMapCss = await readText('css/site-map.css');
  const shellExtrasCss = await readText('css/shell-extras.css');
  const loadingCss = await readText('css/loading.css');
  const henModeCss = await readText('css/hen-mode.css');
  const henMode = await readText('js/features/hen-mode.js');
  const henPage = await readText('hen/index.html');
  const objkt = await readText('js/features/objkt.js');
    const chamber = await readText('js/features/chamber.js');
    const lb = await readText('js/features/liquidity-baking.js');
    const api = await readText('js/core/api.js');
    const tezlink = await readText('js/features/tezlink.js');
  const etherlinkGovernance = await readText('js/features/etherlink-governance.js');
  const etherlinkGovernanceContracts = await readText('js/core/etherlink-governance-contracts.mjs');
  const tz4 = await readText('js/features/tz4-adoption.js');
  const ctez = await readText('js/features/ctez.js');
  const ledgerFlow = await readText('js/features/ledger-flow.js');
  const ledgerFlowModel = await readText('js/features/ledger-flow-model.mjs');
  const tezosDomains = await readText('js/features/tezos-domains.js');
  const maxis = await readText('js/features/maxis.js');
  const chamberAccessibility = await readText('js/ui/chamber-accessibility.js');
  const overlayStack = await readText('js/ui/overlay-stack.js');
  const wallet = await readText('js/core/wallet.js');
  const health = await readText('js/features/network-health.js');
  const networkPulse = await readText('js/features/network-pulse.js');
  const history = await readText('js/features/history.js');
  const nativeExplorer = await readText('js/features/native-explorer.js');
  const share = await readText('js/ui/share.js');
  const moments = await readText('js/features/moments.js');
  const streak = await readText('js/features/streak.js');
  const toastQueue = await readText('js/ui/toast-queue.js');
  const governanceAlerts = await readText('js/features/governance-alerts.js');
  const leaderboard = await readText('js/features/leaderboard.js');
  const myTezos = await readText('js/features/my-tezos.js');
  const myBaker = await readText('js/features/my-baker.js');
  const siteJourney = await readText('js/core/site-journey.js');
  const comparison = await readText('js/features/comparison.js');
  const compareIndex = await readText('compare/index.html');
  const chamberRoutes = await readText('scripts/lib/chamber-routes.mjs');
  const chamberRouteGenerator = await readText('scripts/generate-chamber-routes.mjs');
  const themeUi = await readText('js/ui/theme.js');
  const styles = await readText('css/styles.css');
  const networkHealthCss = await readText('css/network-health.css');
  const healthStyles = `${styles}\n${networkHealthCss}`;
  const leaderboardCss = await readText('css/leaderboard.css');
  const networkPulseCss = await readText('css/network-pulse.css');
  const stakingChamber = await readText('js/features/staking-chamber.js');
  const stakingChamberCss = await readText('css/staking-chamber.css');
  const ledgerFlowCss = await readText('css/ledger-flow.css');
  const maxisCss = await readText('css/maxis.css');
  const tezosDomainsCss = await readText('css/tezos-domains.css');
  if (app.includes('updateReturnGreeting') || styles.includes('.return-greeting')) {
    fail('the retired personalized return greeting must not leave renderer or style code behind');
  }
  if (/TEZOS_LOOP_STORAGE_KEY|initTezosLoopConsole|initSiteFooterMap/.test(app)) {
    fail('app.js must not retain the retired loop-console or duplicate dashboard footer renderers');
  }
  const deepLinkContracts = [
    ['Chamber hash route', "hash === 'chamber'", app],
    ['Chambers hash route', "hash === 'chambers'", app],
    ['Tezos X Governance hash route', "hash === 'l2chamber'", app],
    ['Tezos X hash route', "hash === 'tezosx'", app],
    ['Legacy Tezlink hash route', "hash === 'tezlink'", app],
    ['Network Pulse hash route', "hash === 'pulse'", app],
    ['Health hash route', "hash === 'health'", app],
    ['Ledger Flow hash route', "hash === 'ledger-flow'", app],
    ['Ledger Flow scoped hash route', "params.has('ledger-flow')", app],
    ['Ledger Flow modal cleanup', 'closeLedgerFlowChamber', app],
    ['Domains hash route', "hash === 'domains'", app],
    ['Domains legacy hash route', "hash === 'tezos-domains'", app],
    ['Domains modal cleanup', 'closeTezosDomainsChamber', app],
    ['Protocol history legacy hash route', "params.get('protocol')", app],
    ['Protocol History Chamber hash route', "hash === 'protocol-history'", app],
    ['Protocol history global opener', 'window.openProtocolHistoryByName = openProtocolHistoryByName', app],
    ['Protocol History Chamber global opener', 'window.openProtocolHistoryChamber = openProtocolHistoryChamber', app],
    ['Protocol History header launcher', 'function initProtocolHistoryHeaderLauncher', app],
    ['Protocol History chamber current-first timeline', 'const displayProtocols = isHistoryChamber ? [...protocols].reverse() : protocols', app],
    ['Protocol History Chamber card', "card.id = 'protocol-history-entry-card'", app],
    ['Protocol Anthology card copy', 'Protocol Anthology', app],
    ['Protocol Anthology pretty route map', "href: '/anthology/'", siteMap],
    ['Protocol Anthology crawlable route source', "slug: 'anthology'", chamberRoutes],
    ['Protocol Anthology card anatomy', 'protocol-history-entry-anthology', app],
    ['Protocol Anthology recent spines', 'protocol-history-entry-spine-item', app],
    ['Protocol Anthology library host', 'protocol-history-anthology-board', app],
    ['Protocol Anthology real-data renderer', 'function renderProtocolAnthologyBoard', app],
    ['Protocol Anthology protocol page links', 'protocolStoryPath(protocol)', app],
    ['Protocol Anthology searchable index', 'protocol-anthology-search', app],
    ['Protocol Anthology filter controls', 'data-anthology-filter', app],
    ['Protocol Anthology chapter list styles', '.protocol-anthology-chapter', heroSearchCss],
    ['Protocol Anthology reader styles', '.protocol-story-article', heroSearchCss],
    ['Protocol Anthology timeline crowd styles', '.contention-crowd', heroSearchCss],
    ['Protocol History Chamber modal', "overlay.id = 'protocol-history-chamber-modal'", app],
    ['Protocol History Chamber technical disclosure', 'protocol-anthology-tools', app],
    ['Protocol History chapter pretty route', '/anthology/${encodeURIComponent(slug)}/', app],
    ['Protocol search opens canonical Anthology chapter URLs', '/anthology/${encodeURIComponent(slug)}/', search],
    ['Protocol History stable read button', 'history-expand-btn', app],
    ['Protocol History copy-link action', 'history-modal-copy-link', app],
    ['Protocol History native-share action', 'history-modal-native-share', app],
    ['Protocol History image action', 'history-modal-share', app],
    ['Protocol History print button', 'history-modal-print', app],
    ['Protocol History print helper', 'function printProtocolHistory', app],
    ['Protocol History Chamber reveal helper', 'function revealProtocolHistorySection', app],
    ['shared Chamber launcher article semantics', "card.setAttribute('role', 'article')", chamberAccessibility],
    ['shared Chamber native Open action', "cue.tagName !== 'BUTTON'", chamberAccessibility],
    ['shared Chamber title normalization', "title.classList.add('chamber-entry-title')", chamberAccessibility],
    ['shared Chamber full-card launcher', "card.dataset.chamberSurfaceWired !== '1'", chamberAccessibility],
    ['shared Chamber nested control exclusion', 'target.closest(CHAMBER_INTERACTIVE_SELECTOR)', chamberAccessibility],
    ['shared Chamber close controls stay unframed', '.chamber-close {\n    background: transparent !important;\n    border: 0 !important;\n    box-shadow: none !important;\n    outline: 0 !important;\n}', styles],
    ['shared Chamber close focus stays on the X', '.chamber-close:is(:hover, :focus-visible)', styles],
    ['shared overlay focus trap', "event.key !== 'Tab'", overlayStack],
    ['shared overlay topmost Escape close', "event.key === 'Escape'", overlayStack],
    ['shared overlay opener restoration', 'state.opener.isConnected', overlayStack],
    ['shared overlay background isolation', "element.setAttribute('inert', '')", overlayStack],
    ['shared overlay nested orphan prevention', "reason: 'parent-close'", overlayStack],
    ['shared overlay raw-removal recovery', 'new MutationObserver', overlayStack],
    ['shared overlay exception-safe child close', 'tezos:overlay-close-error', overlayStack],
    ['shared overlay legacy-state reconciliation', 'reconcileOverlayEnvironment', overlayStack],
    ['Chambers use the shared overlay stack', 'activateOverlayDialog(overlay', chamberAccessibility],
    ['Share uses the shared overlay stack', 'activateOverlayDialog(modal', share],
    ['Share mobile save fallback uses the shared overlay stack', 'activateOverlayDialog(overlay', share],
    ['Share dialog owns its accessible title', 'aria-labelledby="share-modal-title"', share],
    ['Protocol Stories use the shared overlay stack', 'activateOverlayDialog(modal', app],
    ['Protocol History Chamber delegates scroll ownership', 'lockScroll: true', app],
    ['Protocol Stories clear direct route state', 'clearDirectStoryRoute', app],
    ['Protocol Stories expose an accessible title', 'aria-labelledby="protocol-history-story-title"', app],
    ['card history uses the shared overlay stack', 'close: () => closeCardHistoryModal(modal)', history],
    ['card history owns its accessible title', 'aria-labelledby="card-history-title"', history],
    ['Native Explorer uses the shared overlay stack', 'activateOverlayDialog(overlay', nativeExplorer],
    ['Native Explorer provides direct-route focus fallback', "restoreFocusSelector: '#hero-search-input, #features-gear'", nativeExplorer],
    ['Protocol Anthology accessible launcher', 'wireChamberLauncher(card', app],
    ['Network Pulse accessible launcher', 'wireChamberLauncher(card', networkPulse],
    ['Tezos L1 Governance accessible launcher', 'wireChamberLauncher(card', chamber],
    ['Liquidity Baking accessible launcher', 'wireChamberLauncher(card', lb],
    ['Staking accessible launcher', 'wireChamberLauncher(card', stakingChamber],
    ['Tezos X accessible launcher and dialog', 'activateChamberDialog(overlay', tezlink],
    ['Tezos X Governance accessible launcher and dialog', 'activateChamberDialog(overlay', etherlinkGovernance],
    ['tz4 accessible launcher and dialog', 'activateChamberDialog(overlay', tz4],
    ['Ledger Flow accessible launcher and dialog', 'activateChamberDialog(overlay', ledgerFlow],
    ['Tezos Domains accessible launcher and dialog', 'activateChamberDialog(overlay', tezosDomains],
    ['Network Health accessible launcher', 'wireChamberLauncher(card', health],
    ['Tezos Maxis accessible launcher', 'wireChamberLauncher(card', maxis],
    ['Staking uses the shared plain Chamber label', '<h2 class="stat-label">Staking Chamber</h2>', stakingChamber],
    ['Staking compact Chamber label size', 'font-size: 0.75rem;', stakingChamberCss],
    ['Maxis compact Chamber label override', '#chambers-grid .maxis-entry-season-title.chamber-entry-title', maxisCss],
    ['Maxis launcher crown-holder names', 'maxis-entry-identity-leader', maxis],
    ['Maxis launcher crown-holder styles', '.maxis-entry-identity-leader', maxisCss],
    ['Maxis launcher protocol-season leaders', 'maxis-entry-season-crowns', maxis],
    ['Maxis launcher protocol-season leader styles', '.maxis-entry-season-crowns', maxisCss],
    ['Protocol History Chamber timeline toggle target', 'protocol-timeline-toggle-btn', app],
    ['Protocol History Chamber action styles', '.protocol-history-chamber-action', heroSearchCss],
    ['Hero search mode body class', "document.body.classList.toggle('hero-search-mode'", search],
    ['Hero search attaches the composed index room to Live Head', '.live-head-panel .hero-search-panel', heroSearchCss],
    ['Hero search uses a bounded empty starter menu', 'MISSION_STARTERS', search],
    ['Hero search renders a state-aware index threshold', 'function searchPanelHeaderHtml', search],
    ['Hero search index threshold has chamber-level anatomy', '.live-head-panel .hero-search-panel-head', heroSearchCss],
    ['Hero search starters use a curated responsive card grid', '.live-head-panel .hero-search-group.is-starter', heroSearchCss],
    ['Hero search offers a real clipboard hash action', "result.action === 'paste'", search],
    ['Hero search imports ranked site map search', 'searchSiteMap', search],
    ['Hero search derives starter rows from site map', 'siteMapStarters', search],
    ['Hero search derives quick chips from site map', 'siteMapSearchChips', search],
    ['Hero search uses canonical site-map routes', 'siteMapRoute', search],
    ['Hero search root hash page normalization', 'const rootHashEntry', search],
    ['Site map manifest exports groups', 'SITE_MAP_NAV_GROUPS', siteMap],
    ['Site map manifest includes anthology route', "href: '/anthology/'", siteMap],
    ['Site map manifest includes Network Pulse route', "href: '/pulse/'", siteMap],
    ['Landing pages share site nav renderer', 'function renderFooter()', siteNav],
    ['Shared Handoff renderer', 'function renderSiteHandoff', siteHandoff],
    ['Shared Handoff stable question catalog', "{ id: 'now', prompt: 'What now?', label: 'Network Pulse', entryId: 'pulse' }", siteHandoff],
    ['Shared Handoff quiet satellite catalog', "{ id: 'health', prompt: 'Is the chain healthy?', label: 'Network Health', entryId: 'health', tier: 'satellite' }", siteHandoff],
    ['Shared Handoff satellite hierarchy hook', "question.tier === 'satellite' ? 'is-satellite' : 'is-anchor'", siteHandoff],
    ['Shared Handoff contextual question emphasis', 'function contextualQuestionId', siteHandoff],
    ['Shared Handoff canonical semantic relations', 'SITE_MAP_RELATIONS', siteHandoff],
    ['Shared Handoff coordinated constellation state', 'container.dataset.siteHandoffConstellation = nextId', siteHandoff],
    ['Shared Handoff near and far relationship state', 'link.dataset.handoffRelation = relation', siteHandoff],
    ['Shared Handoff directory uses canonical groups', 'SITE_MAP_NAV_GROUPS.map', siteHandoff],
    ['Shared Handoff desktop question field styles', '.site-handoff-question-field', siteMapCss],
    ['Shared Handoff event-bound signal settle', '@keyframes site-handoff-signal-settle', siteMapCss],
    ['Shared Handoff signal settle applies only to arriving inner content', '.site-handoff-question.is-signal-arriving > span', siteMapCss],
    ['Shared Handoff visible destination cue', 'content: " ↗";', siteMapCss],
    ['Shared Handoff quiet satellite typography', '.site-handoff-question.is-satellite', siteMapCss],
    ['Shared Handoff reduced-motion breath removal', 'scale: none;', siteMapCss],
    ['Shared Handoff mobile question composition', 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);', siteMapCss],
    ['Shared Handoff mobile readable UI typography', 'font-family: var(--font-ui, system-ui', siteMapCss],
    ['Hero search runtime-only quick chips', 'RUNTIME_QUICK_CHIPS', search],
    ['Hero search runtime-only commands', 'RUNTIME_COMMANDS', search],
    ['Hero search complete browse index', 'siteMapBrowseEntries', search],
    ['Hero search complete nested view index', 'siteMapBrowseIntents', search],
    ['Hero search manifest subfeature intents', 'searchSiteMapIntents', search],
    ['Hero search explicit mobile close', 'id="hero-search-close"', index],
    ['Hero search runtime changelog command', "title: '/changelog'", search],
    ['Hero search runtime export command', "title: '/export'", search],
    ['Hero search remains an anchored bottom-of-window index room', 'height: var(--hero-search-available-height', heroSearchCss],
    ['Hero search hides shortcut chips outside HEN presentation', '.live-head-panel .hero-search-chips', heroSearchCss],
    ['Top continuity mobile explainer reserves flow', '.top-continuity-explain.is-visible', shellExtrasCss],
    ['Hero search .tez scoped Domains route', '#domains=${encodeURIComponent(domain)}', search],
    ['Hero search Ledger Flow command', 'Ledger Flow', search],
    ['Hero search Ledger Flow scoped account route', '#ledger-flow=${encodeURIComponent(address)}', search],
    ['Hero search KT1 starter route', "['kt1', 'KT1 Contracts']", search],
    ['Hero search grouped visual order normalization', 'groupOrderedResults', search],
    ['Hero search Maxi Passport intent route', '/maxis/?view=passport', siteMap],
    ['Hero search Maxis Season intent route', '/maxis/?view=season', siteMap],
    ['Hero search address-scoped Maxi Passport route', 'view=passport&address=${encodeURIComponent(target)}', search],
    ['Hero search explicit full-directory mode', 'data-hero-browse-all="true"', search],
    ['Standalone footer progressive disclosure', 'class="site-map-disclosure"', siteHandoff],
    ['Hero search manifest page result adapter', 'function siteMapResult', search],
    ['LB tile hash route', "hash === 'lb-tile'", app],
    ['tz4 hash route', "hash === 'tz4'", app],
    ['comparison summary renderer', 'function renderComparisonSummary', comparison],
    ['comparison summary standing copy', 'Self-upgrading baseline', comparison],
    ['comparison summary grid', 'comparison-standing-grid comparison-grid', comparison],
    ['comparison hub standing summary', 'Where the major proof-of-stake chains stand', compareIndex],
    ['comparison hub all peer links', '/compare/tezos-vs-algorand.html', compareIndex],
    ['Chambers launcher button', 'id="chambers-toggle"', index],
    ['Chambers launcher copy link', 'data-copy-hash="#chambers"', index],
    ['Network Pulse launcher copy link', 'data-copy-hash="#pulse"', index],
    ['Chambers section info button', 'id="chambers-info-btn"', index],
    ['Live Pulse section info button', 'id="hot-today-info-btn"', index],
    ['Shared section explainer wiring', 'function initSectionExplainers()', app],
    ['Explore Tezos section explainer route', "href: '/chambers/'", app],
    ['Live Pulse section explainer route', "href: '/pulse/'", app],
    ['Dedicated section collapse button support', "header.querySelector('[data-section-collapse]')", app],
    ['Collapsed header inline spacing reset', "header.style.marginBottom = '0'", app],
    ['Chambers visibility uses Home layout registry', "setHomeBlockVisible('explore'", app],
    ['Pretty chamber path route map', 'function getPrettyChamberPathRoute()', app],
    ['Pretty chamber route resolves through site map', 'findCurrentSiteMapEntry({', app],
    ['Pretty chamber route uses canonical hash identity', "entry.hash.replace(/^#/, '')", app],
    ['Dashboard uses shared Handoff renderer', 'renderSiteHandoff', app],
    ['Dashboard Handoff hook', 'data-site-handoff data-site-context="home"', index],
    ['Dashboard separate footer hook', 'data-site-footer data-site-context="home"', index],
    ['Dashboard separate footer styles', '.site-footer-separate', siteMapCss],
    ['Dashboard footer canonical map id', "sequence === 1 ? 'site-map'", siteHandoff],
    ['Pretty chamber route generator hydrates dashboard shell', "dashboardShell = await fs.readFile", chamberRouteGenerator],
    ['Network Pulse feature import', 'initNetworkPulseChamber', app],
    ['Network Pulse card copy link', 'data-copy-hash="#pulse"', networkPulse],
    ['Network Pulse modal', 'network-pulse-modal', networkPulse],
    ['Network Pulse lazy CSS loader', 'network-pulse-css', networkPulse],
    ['Network Pulse real cache timestamp', 'loadStatsTimestamp', networkPulse],
    ['Network Pulse history data fetch', 'fetchHistoricalData', networkPulse],
    ['Network Pulse shared chamber history data fetch', 'getPulseDomainRows', networkPulse],
    ['Network Pulse Market category', "id: 'market'", networkPulse],
    ['Network Pulse Market source cards', "source: 'market'", networkPulse],
    ['Network Pulse sourced freshness label', 'network-pulse-source-age', networkPulse],
    ['Network Pulse card history modal', 'openCardHistoryModal', networkPulse],
    ['Network Pulse semantic room source', "siteMapJourneyLinks('pulse', { limit: 4 })", networkPulse],
    ['Network Pulse nav buttons avoid hash pollution', 'data-pulse-target', networkPulse],
    ['Network Pulse scrollspy wiring', 'IntersectionObserver', networkPulse],
    ['Network Pulse delta chip markup', 'network-pulse-delta', networkPulse],
    ['Network Pulse entry delta chip', 'network-pulse-entry-delta', networkPulse],
    ['Network Pulse entry cell jumps', 'data-pulse-jump', networkPulse],
    ['Network Pulse entry semantic article', "document.createElement('article')", networkPulse],
    ['Network Pulse explicit open action', 'network-pulse-entry-open', networkPulse],
    ['Network Pulse entry header freshness', 'network-pulse-entry-freshness', networkPulse],
    ['Network Pulse entry history value fallback', 'latestMetricValue(lastEntryHistoryRows, metric.history)', networkPulse],
    ['Network Pulse partial hero merge', "event?.detail?.source === 'hero'", networkPulse],
    ['Network Pulse tiered top mover', "tier: 'structural'", networkPulse],
    ['Network Pulse quiet ballot guard', 'quietWhen: isGovernanceBallotQuiet', networkPulse],
    ['Network Pulse USD delta prefix', "deltaPrefix: '$'", networkPulse],
    ['Network Pulse sparkline markup', 'network-pulse-sparkline', networkPulse],
    ['Network Pulse history button markup', 'data-pulse-history', networkPulse],
    ['Network Pulse card grid CSS', '.network-pulse-card-grid', networkPulseCss],
    ['Network Pulse dense entry cells CSS', '.network-pulse-entry-metric', networkPulseCss],
    ['Network Pulse flex entry header CSS', '.network-pulse-entry-head', networkPulseCss],
    ['Network Pulse hover headline transform guard', 'network-pulse-entry-card:hover .network-pulse-entry-value', networkPulseCss],
    ['Network Pulse entry footer cue alignment', '.network-pulse-entry-card .chamber-entry-footer', networkPulseCss],
    ['Network Pulse explicit open action styles', '.network-pulse-entry-open', networkPulseCss],
    ['Network Pulse entry sparkline CSS', '.network-pulse-entry-sparkline', networkPulseCss],
    ['Network Pulse loading state CSS', '.network-pulse-field.is-loading', networkPulseCss],
    ['Network Pulse scroll-margin CSS', 'scroll-margin-top', networkPulseCss],
    ['Network Pulse active nav CSS', '.network-pulse-nav button.active', networkPulseCss],
    ['Network Pulse mobile nav wraps on phones', 'flex-wrap: wrap', networkPulseCss],
    ['Network Pulse direct footer link', 'Direct: /pulse/', networkPulse],
    ['Network Pulse pretty route', "slug: 'pulse'", chamberRoutes],
    ['Network Pulse chamber category facet', "chamberCategory: 'network'", siteMap],
    ['Network Pulse chamber category target', "pulse: { selector: '#network-pulse-entry-card', layout: 'featured' }", app],
    ['Network Pulse share route', 'siteMapCanonicalRoute', share],
    ['Network Pulse hero stats spread', '...heroStats', app],
    ['Network Pulse hero stats fallback event', "source: 'hero'", app],
    ['Network Pulse delegated hero stat', 'delegatedRatio: staking.delegatedRatio', api],
    ['API request deadline', 'DEFAULT_FETCH_TIMEOUT_MS', api],
    ['API caller abort forwarding', "callerSignal.addEventListener('abort', forwardAbort", api],
    ['API Retry-After cap', 'MAX_RETRY_AFTER_MS', api],
    ['API aggregate quality receipt', 'qualityFromSettled', api],
    ['API failed category receipt', 'failedCategories', api],
    ['API unavailable APY receipt', "status: 'unavailable'", api],
    ['Network Pulse XTZ price card history', "'xtz-price'", history],
    ['Network Pulse market cap card history', "'market-cap'", history],
    ['Network Pulse L2 transactions card history', "'l2-transactions'", history],
    ['Staking Chamber feature import', 'initStakingChamber', app],
    ['Staking Chamber hash route', "hash === 'staking'", app],
    ['Staking Chamber legacy short hash route', "hash === 'stake'", app],
    ['Staking Chamber pretty route opens without hash redirect', "case 'staking':", app],
    ['Staking Chamber modal cleanup', 'closeStakingChamber', app],
    ['Staking Chamber Capital category facet', "id: 'staking-chamber'", siteMap],
    ['Staking Chamber category target', "'staking-chamber': { selector: '#staking-entry-card', layout: 'compact' }", app],
    ['Staking Chamber card copy link', 'data-copy-hash="#staking"', stakingChamber],
    ['Staking Chamber card ratio', 'id="staking-entry-ratio"', stakingChamber],
    ['Staking Chamber two-action tape', "renderEntryMove('stake', data?.stake)}${renderEntryMove('unstake', data?.unstake)", stakingChamber],
    ['Staking Chamber modal', "overlay.id = 'staking-chamber-modal'", stakingChamber],
    ['Staking Chamber canonical current ratio', 'fetchStakingRatio()', stakingChamber],
    ['Staking Chamber 7-day ratio context', "fetchHistoricalData('7d')", stakingChamber],
    ['Staking Chamber strict actual-amount threshold', 'return amountMutez(row) > LARGE_MOVE_THRESHOLD_MUTEZ', stakingChamber],
    ['Staking Chamber applied-operation filter', "params.set('status', 'applied')", stakingChamber],
    ['Staking Chamber cursor archive scan', "params.set('offset.cr', String(cursor))", stakingChamber],
    ['Staking Chamber compact archive select', "'id,timestamp,amount'", stakingChamber],
    ['Staking Chamber visible receipt hydration', "params.set('id.in', ids.join(','))", stakingChamber],
    ['Staking Chamber 24-hour gross and net flow', 'data-staking-flow="net"', stakingChamber],
    ['Staking Chamber mover trail', 'id="staking-mover-panel"', stakingChamber],
    ['Staking Chamber Ledger Flow drilldown', 'href="#ledger-flow=${encodeURIComponent(moverTrail.address)}"', stakingChamber],
    ['Staking Chamber complete-history disclosure', 'All applied moves over 10,000 ꜩ', stakingChamber],
    ['Staking Chamber exact-10K exclusion disclosure', 'Exactly 10,000 ꜩ is excluded.', stakingChamber],
    ['Staking Chamber direct footer link', 'Direct: /stake/', stakingChamber],
    ['Staking Chamber crawlable route source', "slug: 'stake'", chamberRoutes],
    ['Staking Chamber site-map route', "href: '/stake/'", siteMap],
    ['Staking Chamber hero-search manifest source', 'siteMapSearchChips()', search],
    ['Staking Chamber share route', 'siteMapCanonicalRoute', share],
    ['Staking Chamber Capital category membership', "entryIds: Object.freeze(['capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber'])", siteMap],
    ['Staking Chamber category-aware desktop geometry', '#chambers-grid .staking-entry-card', stakingChamberCss],
    ['Chamber info tooltip viewport positioning', 'positionChamberInfoTooltip(button)', app],
    ['Chamber info tooltip bounded height', '--card-tooltip-max-height', stakingChamberCss],
    ['Staking Chamber mobile operation rows', '.staking-operation-row {', stakingChamberCss],
    ['Chamber card copy link', 'data-copy-hash="#chamber"', chamber],
    ['Tezos L1 Governance card label', 'Tezos L1 Governance', chamber],
    ['Tezos L1 Governance quiet headline', "setEntryHero(heroEl, isQuietProposalPeriod ? 'No Proposal' : '')", chamber],
    ['Tezos L1 Governance quiet period metrics', "label: 'Candidates',\n                        value: 'None'", chamber],
    ['Tezos L1 Governance quiet status', 'No active L1 proposal · refresh 60s', chamber],
    ['Chamber current state panel', 'id="chamber-now-panel"', chamber],
    ['Chamber current state watch list', 'chamber-now-watch', chamber],
    ['Chamber current state styles', '.chamber-now-panel', styles],
    ['Chamber proposal intel panel', 'id="chamber-proposal-intel"', chamber],
    ['Chamber gap analysis panel', 'id="chamber-gap-analysis"', chamber],
    ['Chamber promotion delta uses epoch periods', '(epoch.periods || []).find', chamber],
    ['Chamber branded share capture helper', 'captureBrandedChamberShare', share],
    ['Chamber share direct link baked into image', 'tezos.systems/chamber/', chamber],
    ['Governance alerts reuse voting status', 'fetchVotingStatus', governanceAlerts],
    ['Governance alerts reuse My Tezos vote signal', 'fetchBakerVoteStatus', governanceAlerts],
    ['Governance alerts expose RSS action', 'href="/feed.xml"', governanceAlerts],
    ['Governance alerts browser reminder opt-in', 'Notification.requestPermission', governanceAlerts],
    ['My Tezos exports baker vote check', 'export async function fetchBakerVoteStatus', myTezos],
    ['My Tezos Morning Brief vote card', "title: 'Vote Check'", myTezos],
    ['Tezos X Governance card copy link', 'data-copy-hash="#l2chamber"', etherlinkGovernance],
    ['Tezos X Governance L2 dashboard note', 'L2 Governance · FAST', etherlinkGovernance],
    ['Tezos X Governance direct footer link', 'Direct: /l2chamber/', etherlinkGovernance],
    ['Tezos X Governance chamber wiring', 'openEtherlinkGovernanceChamber', etherlinkGovernance],
    ['Tezos X Governance TzKT discovery', 'discoverGovernanceTracks', etherlinkGovernance],
    ['Tezos X Governance shared reviewed registry', 'ETHERLINK_GOVERNANCE_PRODUCTION_CONTRACTS', etherlinkGovernance],
    ['Tezos X Governance official current Sequencer contract', 'KT1KiVz8ZpHo3HpE1GCP5HLgywPDRwVUkCFh', etherlinkGovernanceContracts],
    ['Tezos X Governance current registry', 'ETHERLINK_GOVERNANCE_CURRENT_CONTRACTS', etherlinkGovernanceContracts],
    ['Tezos X Governance shared configuration classifier', 'classifyEtherlinkGovernanceTrack', etherlinkGovernanceContracts],
    ['Tezos X Governance discovery failure copy', 'contract discovery unavailable', etherlinkGovernance],
    ['Tezos X Governance track rules panel', 'id="etherlink-gov-rules"', etherlinkGovernance],
    ['Tezos X Governance track memory panel', 'id="etherlink-gov-memory"', etherlinkGovernance],
    ['Tezos X Governance merged timeline panel', 'id="etherlink-gov-timeline"', etherlinkGovernance],
    ['Tezos X Governance phase hero', 'id="etherlink-governance-phase-hero"', etherlinkGovernance],
    ['Tezos X Governance current-state panel', 'id="etherlink-governance-now"', etherlinkGovernance],
    ['Tezos X Governance recent baker quorum panel', 'id="etherlink-governance-recent-bakers"', etherlinkGovernance],
    ['Tezos X Governance complete L1 voting-power snapshot', 'fetchAllRows(`${TZKT}/voting/periods/current/voters?select=delegate,votingPower`)', etherlinkGovernance],
    ['Tezos X Governance complete baker receipt ledger', 'fetchAllBigmapKeys(track.promotion.votersPtr', etherlinkGovernance],
    ['Tezos X Governance receipt-level operation provenance', 'fetchReceiptOperations(track, receipts)', etherlinkGovernance],
    ['Tezos X Governance chronological quorum crossing', 'quorum reached here', etherlinkGovernance],
    ['Tezos X Governance voting-key expansion disclosure', 'Voting-key calls are expanded into the represented L1 baker accounts', etherlinkGovernance],
    ['Tezos X Governance background history hydration', 'hydrateHistoricalProposals(data)', etherlinkGovernance],
    ['Tezos X Governance highest-priority hot score', 'score: 260', etherlinkGovernance],
    ['Tezos X Governance historic hot treatment', "spectacle: 'historic'", etherlinkGovernance],
    ['Tezos X Governance breaking hot treatment', 'breaking: true', etherlinkGovernance],
    ['Tezos X Governance two-gate Promotion verdict', "headline: 'CANNOT PASS'", etherlinkGovernance],
    ['Tezos X Governance maximum possible supermajority', 'maximumPromotionSupermajority', etherlinkGovernance],
    ['Tezos X Governance visible quorum and Yea gates', 'class="etherlink-gov-entry-gates"', etherlinkGovernance],
    ['Tezos X Governance hydrates its launcher class', "card.classList.add('etherlink-governance-entry-card')", etherlinkGovernance],
    ['Tezos X Governance official docs path', 'How L2 governance works', etherlinkGovernance],
    ['Tezos X card copy link', 'data-copy-hash="#tezosx"', tezlink],
    ['Tezos X direct footer link', 'Direct: /tezosx/', tezlink],
    ['Tezos X 30d trend panel', 'id="tezlink-trend-panel"', tezlink],
    ['Tezos X 30d trend fallback copy', 'formatDirectionDelta', tezlink],
    ['Tezos X 30d trend metric helper', 'renderTrendMetric', tezlink],
    ['Tezos X L1 anchor panel', 'id="tezlink-anchor-panel"', tezlink],
    ['Tezos X gas oracle panel', 'id="tezlink-gas-oracle"', tezlink],
    ['Tezos X top tokens panel', 'id="tezlink-token-panel"', tezlink],
    ['LB chamber copy link', 'data-copy-hash="#lb"', lb],
    ['LB entry vote tape rows', 'id="lb-entry-vote-rows"', lb],
    ['LB entry vote tape limit', 'LB_ENTRY_VOTE_LIMIT', lb],
    ['LB EMA forecast panel', 'id="lb-ema-forecast"', lb],
    ['LB EMA history panel', 'id="lb-ema-history"', lb],
    ['LB vote change feed', 'id="lb-vote-change-feed"', lb],
    ['Ledger Flow feature import', 'initLedgerFlowChamber', app],
    ['Ledger Flow card copy link', 'data-copy-hash="#ledger-flow"', ledgerFlow],
    ['Ledger Flow card info copy', 'ledger-flow-entry-card', app],
    ['Ledger Flow direct footer link', 'Direct: /ledger-flow/', ledgerFlow],
    ['Ledger Flow pretty route', "slug: 'ledger-flow'", chamberRoutes],
    ['Ledger Flow lazy CSS loader', 'ledger-flow-css', ledgerFlow],
    ['Ledger Flow sent color class', '.ledger-flow-edge-sent', ledgerFlowCss],
    ['Ledger Flow received color class', '.ledger-flow-edge-received', ledgerFlowCss],
    ['Ledger Flow first-funding color class', '.ledger-flow-edge-first', ledgerFlowCss],
    ['Ledger Flow shared archive subscription', 'subscribeWhaleWatchArtifact', ledgerFlow],
    ['Ledger Flow card real 24-hour metrics', "['24h moves', formatCount(metrics.operationCount)", ledgerFlow],
    ['Ledger Flow card gross-observed qualifier', "'not economic volume'", ledgerFlow],
    ['Ledger Flow measured share headline', 'card.dataset.shareValue = projection.metrics', ledgerFlow],
    ['Ledger Flow private resume share exclusion', 'data-share-exclude href="#ledger-flow=', ledgerFlow],
    ['Chamber share clone private exclusion', "'[data-share-exclude]'", share],
    ['Ledger Flow card metric color CSS', '.chamber-entry-metric[data-ledger-flow-metric] strong', ledgerFlowCss],
    ['Ledger Flow threshold slider', 'id="ledger-flow-threshold"', ledgerFlow],
    ['Ledger Flow amount-weighted edge width', 'function edgeWidth', ledgerFlow],
    ['Ledger Flow first inbound fetch', 'async function fetchFirstInbound', ledgerFlow],
    ['Ledger Flow TzKT count-first request', 'transactionCountUrl(transferScope(address', ledgerFlow],
    ['Ledger Flow unified directional query', "'anyof.sender.target': address", ledgerFlow],
    ['Ledger Flow exact row budget', 'const EXACT_ROW_LIMIT = 20000', ledgerFlow],
    ['Ledger Flow sampled row budget', 'const SAMPLE_ROW_LIMIT = 10000', ledgerFlow],
    ['Ledger Flow bounded exact request count', 'Math.ceil(EXACT_ROW_LIMIT / TRANSFER_PAGE_LIMIT)', ledgerFlow],
    ['Ledger Flow largest-row sampling', "params['sort.desc'] = 'amount'", ledgerFlow],
    ['Ledger Flow superseded-load cancellation', "abortActiveLoad('superseded')", ledgerFlow],
    ['Ledger Flow close cancellation', "abortActiveLoad('closed')", ledgerFlow],
    ['Ledger Flow close invalidates pending seed work', 'openGeneration !== chamberOpenGeneration', ledgerFlow],
    ['Ledger Flow close clears delayed threshold work', 'window.clearTimeout(thresholdReloadTimer)', ledgerFlow],
    ['Ledger Flow last-good failure copy', 'still showing the last-good', ledgerFlow],
    ['Ledger Flow rejects missing indexed accounts', 'TzKT does not recognize this account.', ledgerFlow],
    ['Ledger Flow discloses excluded self transfers', 'Account-to-itself rows are excluded from path totals.', ledgerFlow],
    ['Ledger Flow contract origination fetch', 'async function fetchOrigination', ledgerFlow],
    ['Ledger Flow funded origination receipt', 'origination?.contractBalance', ledgerFlow],
    ['Ledger Flow honest scope disclosure', 'applied tez transaction rows only', ledgerFlow],
    ['Ledger Flow quiet body reconciliation', 'quietlySyncHtml(container, markup)', ledgerFlow],
    ['Ledger Flow mobile flow list', 'ledger-flow-mobile-map', ledgerFlow],
    ['Ledger Flow subject-first mobile ratio', 'ledger-flow-direction-ratio', ledgerFlow],
    ['Ledger Flow complete counterparty query', 'id="ledger-flow-counterparty-query"', ledgerFlow],
    ['Ledger Flow complete counterparty sort', 'id="ledger-flow-counterparty-sort"', ledgerFlow],
    ['Ledger Flow passive exact time profile', 'function renderTimeline(model)', ledgerFlow],
    ['Ledger Flow receipt-proven composition', 'Categories use only contract address form and aliases returned with TzKT transfer rows', ledgerFlow],
    ['Ledger Flow projected transfer fields', 'select: TRANSFER_FIELDS', ledgerFlow],
    ['Ledger Flow My Tezos counterparty links', '#my-baker=${encodeURIComponent(address)}', ledgerFlow],
    ['Ledger Flow compact TzKT pills', 'ledger-flow-tzkt-pill', ledgerFlow],
    ['Ledger Flow label-aware node width', 'function nodeGeometry', ledgerFlow],
    ['Ledger Flow pure accounting model', 'export function buildLedgerFlowModel', ledgerFlowModel],
    ['Ledger Flow pure launcher projection', 'export function buildLedgerFlowEntryProjection', ledgerFlowModel],
    ['Ledger Flow pure counterparty discovery', 'export function filterLedgerCounterparties', ledgerFlowModel],
    ['Ledger Flow pure time profile', 'export function buildLedgerFlowTimeline', ledgerFlowModel],
    ['Ledger Flow dynamic layout model', 'export function layoutLedgerFlowNodes', ledgerFlowModel],
    ['Ledger Flow directional cohort key', '`cohort:${direction}`', ledgerFlowModel],
    ['Tezos Domains feature import', 'initTezosDomainsChamber', app],
    ['Tezos Domains card copy link', 'data-copy-hash="#domains"', tezosDomains],
    ['Tezos Domains direct footer link', 'Direct: /domains/', tezosDomains],
    ['Tezos Domains pretty route', "slug: 'domains'", chamberRoutes],
    ['Tezos Domains lazy CSS loader', 'tezos-domains-css', tezosDomains],
    ['Tezos Domains live GraphQL endpoint', 'https://api.tezos.domains/graphql', tezosDomains],
    ['Tezos Domains name lookup query', 'query TezosDomainsNameLookup', tezosDomains],
    ['Tezos Domains lookup form', 'tezos-domains-lookup-input', tezosDomains],
    ['Tezos Domains scoped deep link opener', 'openTezosDomainsChamber(initialName', tezosDomains],
    ['Tezos Domains premium threshold', "MIN_HIGH_VALUE_MUTEZ = '25000000'", tezosDomains],
    ['Tezos Domains event query', 'recentEvents: events', tezosDomains],
    ['Tezos Domains reverse-record metric', 'reverseRecords24h: events', tezosDomains],
    ['Tezos Domains auction query', 'liveAuctions: auctions', tezosDomains],
    ['Tezos Domains sell offer query', 'sellOffers: offers', tezosDomains],
    ['Tezos Domains buy offer query', 'buyOffers: buyOffers', tezosDomains],
    ['Tezos Domains expiring soon query', 'expiringSoon: domains', tezosDomains],
    ['Tezos Domains 30-day expiration window', 'lessThanOrEqualTo: $soon', tezosDomains],
    ['Tezos Domains chamber modal', 'tezos-domains-modal', tezosDomains],
    ['Tezos Domains People category facet', "chamberCategory: 'people'", siteMap],
    ['Tezos Domains category target', "domains: { selector: '#tezos-domains-entry-card', layout: 'featured' }", app],
    ['Tezos Domains lookup panel CSS', '.td-lookup-panel', tezosDomainsCss],
    ['Tezos Domains category-aware CSS', '#chambers-grid > .chamber-category > .chamber-category-cards > .tezos-domains-entry-card', tezosDomainsCss],
    ['Tezos Domains share route', 'siteMapCanonicalRoute', share],
    ['ctez hash route', "hash === 'ctez'", app],
    ['ctez feature copy link', 'data-copy-hash="#ctez"', index],
    ['ctez top-left launcher', 'id="ctez-launcher"', index],
    ['ctez feature launcher', 'id="ctez-feature-btn"', index],
    ['TzSafe top-left launcher', 'id="tzsafe-launcher"', index],
    ['TzSafe feature launcher', 'id="tzsafe-feature-link"', index],
    ['TzSafe canonical external link', 'href="https://tzsafe.tez.page/"', index],
    ['TzSafe feature copy', 'KT1 Multisig Recovery', index],
    ['TzSafe cleanup hint', 'External cleanup path for legacy TzSafe KT1 safes', index],
    ['TzSafe external action button', 'feature-external-link" href="https://tzsafe.tez.page/"', index],
    ['TzSafe feature row polish', '.tzsafe-feature-link', henModeCss],
    ['TzSafe tray icon style', '.tzsafe-launcher', henModeCss],
    ['TzSafe key mark style', '.tzsafe-logo-key', henModeCss],
    ['corner gift items removed from closed tray layout', 'position: absolute;\n    top: 100%;\n    left: 50%;', henModeCss],
    ['mobile corner gift has an in-flow utility slot', 'grid-template-columns: 30px minmax(0, 1fr);', henModeCss],
    ['mobile corner gift scrolls with utility row', 'position: relative;\n        top: auto;\n        left: auto;', henModeCss],
    ['narrow mobile price actions collapse before clipping', '@media (max-width: 350px)', henModeCss],
    ['HEN source all tab', 'data-hen-mode="all"', index],
    ['HEN source Teia tab', 'data-hen-mode="teia"', index],
    ['HEN source OBJKT tab', 'data-hen-mode="objkt"', index],
    ['HEN standalone canonical URL', '<link rel="canonical" href="https://tezos.systems/hen/">', henPage],
    ['HEN standalone live overlay', 'id="hen-overlay"', henPage],
    ['HEN standalone auto activator', '/js/features/hen-mode.js?v=95', henPage],
    ['HEN CSS cache stamp', 'css/hen-mode.css?v=98', index],
    ['HEN JS cache stamp', 'js/features/hen-mode.js?v=95', index],
    ['HEN setup status strip', 'id="hen-status-strip"', index],
    ['HEN permanent now line', 'id="hen-now-line"', index],
    ['HEN mobile filter toggle', 'id="hen-mobile-filter-toggle"', index],
    ['HEN persistent filter bar', 'id="hen-filterbar"', index],
    ['HEN for-sale filter control', 'id="hen-filter-listed"', index],
    ['HEN visible search input', 'id="hen-search-input"', index],
    ['HEN saved filter control', 'id="hen-filter-saved"', index],
    ['HEN hide-owned filter control', 'id="hen-filter-hide-owned"', index],
    ['HEN minimal wallet connect', 'id="hen-wallet-connect"', index],
    ['HEN minimal wallet input', 'id="hen-wallet-input"', index],
    ['HEN collector profile panel', 'id="hen-profile-panel"', index],
    ['HEN default mixed source mode', "const DEFAULT_FEED_MODE = 'all'", henMode],
    ['HEN source preference key', "const HEN_SOURCE_KEY = 'tezos-systems-hen-source'", henMode],
    ['HEN sort preference key', "const HEN_SORT_KEY = 'tezos-systems-hen-sort'", henMode],
    ['HEN favorites key', "const HEN_FAVORITES_KEY = 'tezos-systems-hen-favorites'", henMode],
    ['HEN eager-loads first two desktop rows', 'const HEN_EAGER_CARD_LIMIT = 8', henMode],
    ['HEN eager card limit controls lazy loading', 'staggerIdx < HEN_EAGER_CARD_LIMIT && offset === 0', henMode],
    ['HEN stable grid shell', '.hen-overlay.active {\n    display: grid;', henModeCss],
    ['HEN viewport row edge guard', '.hen-overlay > .hen-header,\n.hen-overlay > .hen-status-strip,\n.hen-overlay > .hen-feed,\n.hen-overlay > .hen-cli', henModeCss],
    ['HEN rows clamp to viewport width', 'max-width: 100vw;', henModeCss],
    ['HEN fixed status strip height', 'height: 44px;', henModeCss],
    ['HEN visible status line', 'position: static;\n    flex: 0 1 clamp', henModeCss],
    ['HEN filter bar does not wrap vertically', 'flex-wrap: nowrap;', henModeCss],
    ['HEN CLI scrollback anchors to overlay', "output.className = 'hen-cli-output'", henMode],
    ['HEN CLI scrollback is appended off-flow', 'ov.appendChild(output)', henMode],
    ['HEN mint pulse is a floating button', "pulseEl.className = 'hen-mint-pulse'", henMode],
    ['HEN scroll compensation for off-top live prepends', 'previousScrollHeight', henMode],
    ['HEN idle resets only on actual fresh mints', 'if (fresh.length > 0) {\n                resetIdleIndicator();', henMode],
    ['HEN paged live poll avoids skipping busy windows', 'async function fetchFreshTokens', henMode],
    ['HEN modal suppresses live chrome', 'if (!expandedActive) {\n                    showMintPulse', henMode],
    ['HEN global keys stop behind expander', 'if (expandedActive) return;', henMode],
    ['HEN now-playing throttle', 'NOW_PLAYING_MIN_INTERVAL', henMode],
    ['HEN sticky mint count is cumulative', 'pendingMintCount += freshTokens.length;', henMode],
    ['HEN token cache is capped', 'trimMapCache(tokenCache, TOKEN_CACHE_LIMIT)', henMode],
    ['HEN timestamp timer starts only while active', 'function startCardTimeUpdates', henMode],
    ['HEN CLI dismissal clears retained scrollback', 'if (reset !== false) cliScrollback = [];', henMode],
    ['HEN artist command validates addresses', '> invalid artist address', henMode],
    ['HEN GraphQL escape strips control chars', "replace(/[\\u0000-\\u001F\\u007F]/g, ' ')", henMode],
    ['HEN live paused sort status', 'live paused (sorted by ', henMode],
    ['HEN source tab live pulse', 'source-live-pulse', henMode],
    ['HEN platform edge rule classes', "card.className = 'hen-card hen-card-platform-' + platformKey(token)", henMode],
    ['HEN hover video playback path', 'function activateCardVideo', henMode],
    ['HEN random keyboard ritual', "case 'random': case 'r':", henMode],
    ['HEN CRT vibe command', "case 'crt': case 'vibe':", henMode],
    ['HEN now-playing overlay', 'function showNowPlaying', henMode],
    ['HEN warm glow opacity variable', '--warm-start-opacity', henMode],
    ['HEN saved filter uses every favorite key', 'var keys = Array.from(favoriteKeys);', henMode],
    ['HEN first-run hint key', "const HEN_HINT_DISMISSED_KEY = 'tezos-systems-hen-loop-hint-dismissed'", henMode],
    ['HEN viewer wallet key', "const HEN_VIEWER_KEY = 'tezos-systems-hen-viewer-address'", henMode],
    ['HEN My Tezos address key', "const MY_TEZOS_ADDRESS_KEY = 'tezos-systems-my-baker-address'", henMode],
    ['HEN periodic image retry delays', 'const DEFAULT_IMAGE_RETRY_DELAYS = [3000, 10000, 30000, 120000, 300000]', henMode],
    ['HEN retryable image handler', 'function setupImageRetry', henMode],
    ['HEN OBJKT CDN media base', "const OBJKT_ASSETS_BASE = 'https://assets.objkt.media/file/assets-003/'", henMode],
    ['HEN OBJKT CDN media helper', 'function mediaCdnUrl', henMode],
    ['HEN Collection media candidate reuse', 'mediaCandidates: mediaCandidates', henMode],
    ['HEN share meta prefers OBJKT CDN image', "var image = mediaCdnUrl(token, 'thumb400') || resolveUri(token.display_uri || token.thumbnail_uri || '');", henMode],
    ['HEN primary live IPFS gateway', "const IPFS_GW = 'https://dweb.link/ipfs/'", henMode],
    ['HEN nftstorage fallback gateway', "'https://nftstorage.link/ipfs/'", henMode],
    ['HEN CSP allows dweb fallback images', 'dweb.link *.dweb.link nftstorage.link ipfs.io gateway.pinata.cloud', index],
    ['HEN direct-load blackout cleanup', 'function clearInitialBlackout', henMode],
    ['HEN blackout style removal', "document.getElementById('hen-initial-blackout')", henMode],
    ['HEN wallet connect bridge', 'async function connectWalletFromHen', henMode],
    ['HEN My Tezos sync bridge', 'rememberMyTezosAddress(viewerAddress', henMode],
    ['HEN Objkt profile reuse', 'mod.fetchObjktProfile(address)', henMode],
    ['OBJKT profile preserves tzdomain for HEN identity labels', 'tzdomain: holder.tzdomain || null', objkt],
    ['OBJKT profile recent acquisitions ordered by latest held increment', 'order_by: {last_incremented_at: desc}', objkt],
    ['OBJKT profile carries collection logos for HEN rows', 'fa { name contract collection_id logo }', objkt],
    ['OBJKT profile carries recent acquisition token ids for CDN thumbnails', 'tokenId: h.token.token_id', objkt],
    ['HEN public activator', 'window.HenMode = HenMode', henMode],
    ['HEN site-map live route', "href: '/hen/'", siteMap],
    ['HEN site-map slash alias', "'/nfts'", siteMap],
    ['shared My Tezos address helper', 'export function rememberMyTezosAddress', wallet],
    ['shared My Tezos saved history key', "export const SAVED_ADDRESSES_KEY = 'tezos-systems-saved-addresses'", wallet],
    ['wallet connect syncs My Tezos', "source: 'octez-connect'", wallet],
    ['My Tezos listens for external identity updates', "window.addEventListener('my-baker-updated'", myBaker],
    ['HEN Teia contract constant', "const HEN_CONTRACT = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton'", henMode],
    ['HEN Teia contract source filter', 'fa_contract: {_eq: "\' + HEN_CONTRACT + \'"', henMode],
    ['HEN OBJKT excludes HEN source filter', 'fa_contract: {_neq: "\' + HEN_CONTRACT + \'"', henMode],
    ['HEN saved source reader', 'function getSavedFeedMode', henMode],
    ['HEN saved source writer', 'persistFeedMode(mode)', henMode],
    ['HEN price filter state', 'let priceMaxMutez = null', henMode],
    ['HEN listed-only filter state', 'let listedOnly = false', henMode],
    ['HEN edition filter state', 'let editionMax = null', henMode],
    ['HEN hide-owned filter state', 'let hideOwned = false', henMode],
    ['HEN saved-only filter state', 'let savedOnly = false', henMode],
    ['HEN price GraphQL filter', 'lowest_ask: {_gt: "0", _lte:', henMode],
    ['HEN listed-only GraphQL filter', 'function listingWhereClause', henMode],
    ['HEN edition GraphQL filter', 'supply: {_lte:', henMode],
    ['HEN sort order GraphQL parameter', 'function orderByClause', henMode],
    ['HEN wallet holdings query', 'query HenViewerHoldings', henMode],
    ['HEN CLI Teia source command', "case 'teia': case 'hen': case 'hic':", henMode],
    ['HEN CLI OBJKT source command', "case 'objkt': case 'objkts':", henMode],
    ['HEN CLI price filter command', "case 'price': case 'under': case 'max':", henMode],
    ['HEN CLI for-sale filter command', "case 'forsale': case 'listed':", henMode],
    ['HEN CLI edition filter command', "case 'edition': case 'editions': case 'supply':", henMode],
    ['HEN CLI sort filter command', "case 'sort':", henMode],
    ['HEN CLI saved filter command', "case 'saved': case 'favorites': case 'watchlist':", henMode],
    ['HEN CLI hide-owned filter command', "case 'hideowned': case 'hide-owned':", henMode],
    ['HEN CLI wallet command', "case 'wallet':", henMode],
    ['HEN live mints prepend automatically', 'g.prepend(shell)', henMode],
    ['HEN fresh poll keeps near-top readers current', 'wasNearTop', henMode],
    ['HEN source tabs style', '.hen-source-tabs', henModeCss],
    ['HEN status strip style', '.hen-status-strip', henModeCss],
    ['HEN filter bar style', '.hen-filterbar', henModeCss],
    ['HEN desktop filter overflow fade', 'mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent);', henModeCss],
    ['HEN expanded modal stays above live chrome', 'z-index: 10010;', henModeCss],
    ['HEN mobile filter collapsed style', '.mobile-filters-open', henModeCss],
    ['HEN first-run loop hint style', '.hen-loop-hint', henModeCss],
    ['HEN wallet controls style', '.hen-wallet-controls', henModeCss],
    ['HEN profile panel style', '.hen-profile-panel', henModeCss],
    ['HEN price pill style', '.hen-card-price-pill', henModeCss],
    ['HEN favorite button style', '.hen-card-favorite', henModeCss],
    ['HEN image retry style', '.hen-image-retrying', henModeCss],
    ['HEN owned badge style', '.hen-card-owned-badge', henModeCss],
    ['HEN listing status style', '.hen-card-listing', henModeCss],
    ['ctez end of life chamber copy', 'ctez End of Life', ctez],
    ['ctez chamber wiring', 'openCtezChamber', ctez],
    ['ctez launcher wiring', 'wireCtezLauncher', ctez],
    ['ctez direct footer link', 'Direct: /ctez/', ctez],
    ['ctez contract address', 'KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2', ctez],
    ['ctez official-style console shell', 'ctez-console-shell', ctez],
    ['ctez sunset banner', 'ctez-sunset-banner', ctez],
    ['ctez oven summary strip', 'ctez-summary-strip', ctez],
    ['ctez oven detail cards', 'ctez-detail-card', ctez],
    ['ctez detected oven list', 'ctez-oven-list', ctez],
    ['ctez automatic oven lookup', 'fetchCtezOvens', ctez],
    ['ctez TzKT big-map lookup', '/bigmaps/${ovensPtr}/keys', ctez],
    ['ctez Octez.Connect controls', 'ctez-wallet-connect', ctez],
    ['ctez wallet refresh control', 'ctez-wallet-refresh', ctez],
    ['ctez close plan preview', 'ctez-close-plan', ctez],
    ['ctez one-batch close control', 'ctez-wallet-close', ctez],
    ['ctez batch close operation builder', 'buildCtezCloseOvenOperations', ctez],
    ['ctez community tool reference', 'https://purplematter.com/ctez-tool/', ctez],
    ['ctez community builder reference', 'https://x.com/webidente', ctez],
    ['ctez no manual raw fields copy', 'No manual contract pages or raw recovery fields are required', ctez],
    ['ctez mint_or_burn operation builder', 'buildCtezMintOrBurnOperation', ctez],
    ['ctez withdraw operation builder', 'buildCtezWithdrawOperation', ctez],
    ['ctez wallet request path', 'requestWalletOperation(operations)', ctez],
    ['Baking Benjamins canonical delegate address', "BAKING_BENJAMINS_DELEGATE_ADDRESS = 'tz1S5WxdZR5f9NzsPXhr7L9L1vrEb5spZFur'", wallet],
    ['Baking Benjamins connected-wallet delegation request', 'requestConnectedWalletDelegation', wallet],
    ['Baking Benjamins Beacon delegation operation kind', "TezosOperationType?.DELEGATION || 'delegation'", wallet],
    ['Baking Benjamins footer wallet action', "button.dataset.footerDelegate = 'true'", wallet],
    ['dashboard initializes footer delegation', "safe('footerDelegation', () => initFooterDelegation(document))", app],
    ['standalone footer initializes delegation', 'initFooterDelegation(footer)', siteNav],
    ['footer delegation button styling', '.footer-delegate-button', siteMapCss],
    ['Octez.Connect SDK pin', '@tezos-x/octez.connect-sdk@${OCTEZ_CONNECT_VERSION}', wallet],
    ['Octez.Connect ESM loader', 'https://esm.sh/@tezos-x/octez.connect-sdk@${OCTEZ_CONNECT_VERSION}?bundle', wallet],
    ['Octez.Connect lazy loader', 'loadOctezConnect', wallet],
    ['Octez.Connect preload helper', 'preloadOctezConnect', wallet],
    ['Octez.Connect SDK timeout', 'WALLET_SDK_TIMEOUT_MS', wallet],
    ['Octez.Connect permission timeout', 'WALLET_CONNECT_TIMEOUT_MS', wallet],
    ['Octez.Connect connect timeout override', '__TEZOS_WALLET_CONNECT_TIMEOUT_MS__', wallet],
    ['Octez.Connect My Tezos sync key', 'tezos-systems-my-baker-address', wallet],
    ['Octez.Connect wallet storage key', 'tezos-systems-octez-wallet-address', wallet],
    ['HEN wallet preconnect helper', 'function preloadWalletConnect()', henMode],
    ['HEN wallet preconnect on activate', 'preloadWalletConnect();', henMode],
    ['HEN wallet waiting status', 'wallet prompt waiting', henMode],
    ['HEN wallet timeout status', 'wallet prompt timed out', henMode],
    ['HEN allows Beacon modal roots', '[id*="beacon" i]', henModeCss],
    ['HEN allows WalletConnect modal roots', '[id*="walletconnect" i]', henModeCss],
    ['My Tezos wallet connect control', 'id="drawer-wallet-connect-btn"', index],
    ['My Tezos connected wallet control', 'id="my-tezos-wallet-connect"', index],
    ['My Tezos Your Story tab', 'data-my-tezos-view="story"', index],
    ['My Tezos Your Story panel', 'data-my-tezos-panel="story"', index],
    ['My Tezos Story renderer', 'function renderStoryPanel(card, data)', myTezos],
    ['My Tezos Story Memory handoff', "registerMyTezosView('story', () => activateMyTezosMemory({ activityOnly: true }))", myTezos],
    ['My Tezos Ledger Flow link control', 'id="my-tezos-ledger-flow-link"', index],
    ['My Tezos Ledger Flow explain card', 'drawer-ledger-flow-card', index],
    ['My Tezos Ledger Flow explain copy', 'Trace bounded sent and received tez paths with all-time receipt context.', index],
    ['My Tezos unified account journeys', 'Explore this account', index],
    ['My Tezos shared account journey card', '.drawer-account-journey-card', styles],
    ['My Tezos contextual journey builder', 'buildMyTezosJourneyLinks', myTezos],
    ['My Tezos active-address scoped journey routes', '/#ledger-flow=${encodeURIComponent(address)}', siteJourney],
    ['My Tezos shared drawer state controller', 'setMyTezosDrawerOpenState = setDrawerOpen', app],
    ['My Tezos Chamber handoff closes drawer without stale focus restore', 'setMyTezosDrawerOpenState?.(false, { restoreFocus: false })', app],
    ['My Tezos Octez operator fetch', '/delegates/${encodeURIComponent(bakerAddr)}', myTezos],
    ['My Tezos Octez version classifier', 'classifyOctezVersion', myTezos],
    ['My Tezos Octez operator tile', "renderOperatorTile(\n        'Octez'", myTezos],
    ['My Baker Octez version stat', 'Octez Version', myBaker],
    ['My Baker delegate Octez version stat', 'Bkr Octez', myBaker],
    ['My Baker Octez status class factory', 'my-baker-octez-${status.className}', myBaker],
    ['tz4 tile card copy link', 'data-copy-hash="#tz4"', index],
    ['tz4 tile expand cue', 'data-stat="tz4-adoption"', index],
    ['tz4 tile chamber wiring', 'openTz4AdoptionChamber', tz4],
    ['tz4 direct footer link', 'Direct: /tz4/', tz4],
    ['tz4 projection panel', 'id="tz4-projection-panel"', tz4],
    ['tz4 holdouts panel', 'id="tz4-holdouts-panel"', tz4],
    ['tz4 holdout baker-name wrapping', '.tz4-holdout-table .lb-baker-name-link', styles],
    ['tz4 monthly switch panel', 'id="tz4-switch-momentum"', tz4],
    ['tz4 power milestone panel', 'id="tz4-power-milestones"', tz4],
    ['404 address/domain redirect', '#my-baker=', await fs.readFile(path.join(ROOT, '404.html'), 'utf8')],
    ['404 My Tezos route fallback', "path.toLowerCase() === 'my'", await fs.readFile(path.join(ROOT, '404.html'), 'utf8')],
    ['app direct account path handler', 'function getMyTezosPathTarget()', app],
    ['app My Tezos pretty route handler', "case 'my-tezos':", app],
    ['app direct domain resolver', 'function resolveForwardTezDomain(name)', app],
    ['health tile card copy link', 'data-copy-hash="#health"', index],
    ['health tile expand cue', 'data-stat="network-health"', index],
    ['health tile chamber wiring', 'openNetworkHealthChamber', health],
    ['health direct footer link', 'Direct: /health/', health],
    ['health incident memory panel', 'id="health-incident-memory"', health],
    ['health cycle timing panel', 'id="health-cycle-timing"', health],
    ['health current cycle progress value', 'id="health-cycle-progress"', health],
    ['health current cycle progressbar', 'role="progressbar"', health],
    ['health current cycle Octez source', 'fetchCurrentCycleProgress', health],
    ['health cycle timing TzKT source', '/statistics/cyclic', health],
    ['health Teztale consensus panel', 'id="health-teztale-consensus"', health],
    ['health Teztale exact quorum target', 'const TEZTALE_QUORUM_TARGET = 2 / 3', health],
    ['health Teztale propagation builder', 'function buildTeztaleReceptionHistogram', health],
    ['health Teztale propagation renderer', 'function renderTeztaleReceptionHistogram', health],
    ['health Teztale propagation panel', 'id="health-teztale-propagation"', health],
    ['health Teztale average pre-attestation 66 value', 'id="health-teztale-pre-66-avg"', health],
    ['health Teztale average pre-attestation 90 value', 'id="health-teztale-pre-90-avg"', health],
    ['health Teztale average attestation 66 value', 'id="health-teztale-att-66-avg"', health],
    ['health Teztale average attestation 90 value', 'id="health-teztale-att-90-avg"', health],
    ['health Teztale reception histogram bins', 'health-consensus-histogram-bin', health],
    ['health Teztale histogram bin width', 'const TEZTALE_RECEPTION_BIN_MS = 500', health],
    ['health Teztale earliest-observer disclosure', 'Earliest Teztale observer reception', health],
    ['health Teztale endorsing-power weighting disclosure', 'endorsing-power weighted', health],
    ['health Teztale validation-observed path label', 'Validation observed', health],
    ['health Teztale validation-to-pre-quorum path label', 'Validation → pre-quorum', health],
    ['health Teztale pre-quorum-to-quorum path label', 'Pre-quorum → quorum', health],
    ['health Teztale validation-to-quorum path label', 'Validation → quorum', health],
    ['health Teztale source URL', 'TEZTALE_REPORT_URL', health],
    ['health Teztale Nomadic Labs credit', 'Teztale by Nomadic Labs', health],
    ['health Teztale config endpoint', "teztale: 'https://teztale-server-mainnet-ro-prd.octez.tech'", await readText('js/core/config.js')],
    ['health Nakamoto coefficient panel', 'id="health-nakamoto-coefficient"', health],
    ['health Nakamoto one-third value', 'id="health-nc-33"', health],
    ['health Nakamoto two-thirds value', 'id="health-nc-66"', health],
    ['health Nakamoto print button', 'id="health-nc-print"', health],
    ['health Nakamoto share button', 'id="health-nc-share"', health],
    ['health Nakamoto print-document helper', 'function renderNakamotoPrintDocument', health],
    ['health Nakamoto print helper', 'function printNakamotoCoefficient', health],
    ['health Nakamoto share helper', 'function shareNakamotoCoefficient', health],
    ['health Nakamoto current-cycle RPC', 'baking_power_distribution_for_current_cycle', health],
    ['health Nakamoto explainer', 'Explain the Nakamoto Coefficient', health],
    ['health Nakamoto Chainspect disclosure', 'Chainspect', await readText('data/nakamoto-sources.json')],
    ['health Nakamoto Edinburgh disclosure', 'Edinburgh EDI', await readText('data/nakamoto-sources.json')],
    ['health Octez versions panel', 'id="health-octez-versions"', health],
    ['health Octez versions TzKT source', '/delegates?active=true', health],
    ['health Octez versions cache TTL', 'OCTEZ_VERSIONS_TTL', health],
    ['health period telemetry panel', 'id="health-period-telemetry"', health],
    ['health network load panel', 'id="health-network-load"', health],
    ['health chain proof panel', 'id="health-chain-proof"', health],
    ['health chain-age methodology label', 'chain age · upgrade history', health],
    ['health chain uptime counter', 'id="chain-uptime-counter"', health],
    ['top continuity stat panel', 'id="top-continuity-panel"', index],
    ['top continuity title-stack uptime launcher', 'id="top-continuity-history"', index],
    ['top continuity proof opens Protocol Anthology', 'aria-controls="protocol-history-chamber-modal"', index],
    ['expanded My Tezos nav label at narrow widths', '#my-tezos-btn .nav-label', heroSearchCss],
    ['top continuity statement wrapper', 'class="top-continuity-statement"', index],
    ['top continuity mainnet-age statement claim', 'top-continuity-claim">mainnet age', index],
    ['top continuity statement subline', 'class="top-continuity-subline"', index],
    ['top continuity since-2018 marker', 'top-continuity-origin">since 2018', index],
    ['top continuity milestone runtime outline', 'class="top-continuity-milestone-outline"', index],
    ['top continuity milestone NEW marker', 'class="top-continuity-milestone-new"', index],
    ['top continuity milestone anchored disclosure', 'id="top-continuity-milestone-popover" role="group"', index],
    ['top continuity milestone close action', 'id="top-continuity-milestone-close"', index],
    ['top continuity milestone explicit action', 'id="top-continuity-milestone-link"', index],
    ['header trailing-hour activity launcher', 'id="header-activity-button"', index],
    ['header trailing-hour activity cluster', 'class="header-activity-cluster"', health],
    ['header trailing-hour activity updater', 'function updateHeaderActivity', health],
    ['top continuity proof baker metric', 'id="hero-chain-uptime-bakers"', index],
    ['top continuity baker all-time pill', 'data-card-history="total-bakers"', index],
    ['top continuity baker right-change roster', 'id="top-continuity-baker-roster"', app],
    ['top continuity latest baker activation ordering', "'sort.desc': active ? 'activationLevel' : 'deactivationLevel'", app],
    ['top continuity funded active baker filter', "params.set('bakingPower.gt', '0')", app],
    ['top continuity baker TzKT transient retry path', 'function fetchTopContinuityTzktJson', app],
    ['top continuity baker shared network-share size tiers', "import { bakerSizeTier } from './baker-size.mjs'", app],
    ['Live Head reuses current-cycle baker power', 'powerByDelegate', health],
    ['top continuity closed baker cycle-size receipt', '/rewards/bakers/${encodeURIComponent(row.address)}', app],
    ['top continuity closed baker one-year lookback', 'oneYearBeforeBakerEvent(row.eventTime)', app],
    ['top continuity closed baker timestamp cycle lookup', "'timestamp.le': targetTime", app],
    ['top continuity New and Reactivated Bakers heading', "renderTopContinuityBakerList('New + Reactivated', 'baking rights gained'", app],
    ['top continuity latest baker prior-block classification', "'anyof.proposer.producer': row.address", app],
    ['top continuity first-time baker marker', 'data-baker-entry="${escapeHtml(entryKind)}"', app],
    ['top continuity 7d 30d 90d changes', "{ label: '90D', days: 90 }", app],
    ['top continuity scheduled-history receipt', "fetchHistoricalDataReceipt('90d')", app],
    ['top continuity open trend refresh follows live metric settlement', 'TOP_CONTINUITY_TREND_METRICS[explainActiveKey]', app],
    ['top continuity Closed Bakers heading', "renderTopContinuityBakerList('Closed Bakers', 'baking rights lost'", app],
    ['top continuity baker Tezos Domains batch', 'resolveTezReverseNames(', app],
    ['top continuity baker saved My Tezos action', 'data-baker-set-save-address', app],
    ['top continuity baker My Tezos link', 'data-baker-set-my-address', app],
    ['top continuity baker TzKT link', 'https://tzkt.io/${encodeURIComponent(row.address)}', app],
    ['top continuity baker quiet roster sync', 'quietlySyncHtml(roster', app],
    ['top continuity explainer title follows the settled live value', 'value?.dataset?.finalText || value?.textContent?.trim()', app],
    ['top continuity finality all-time pill', 'data-card-history="finality"', index],
    ['top continuity staked all-time pill', 'data-card-history="staking-ratio"', index],
    ['top continuity issuance all-time pill', 'data-card-history="issuance-rate"', index],
    ['Live Head renderer', 'function updateBlockTicker', health],
    ['Live Head fixed age formatter', 'function formatTickerAge', health],
    ['Live Head keyed block rows', 'data-quiet-key="live-head-block-${block.level}"', health],
    ['Live Head search floor', 'class="hero-slot" id="hero-slot"', index],
    ['Live Head search usage help', 'id="hero-search-help">Wallets · .tez names · bakers · KT1 contracts · operations · blocks · protocols · Chambers — press / anywhere', index],
    ['Live Head countdown stays outside its announcer', 'data-magic="off"', health],
    ['Live Head dedicated block announcer', 'id="chain-heartbeat-announcer" aria-live="polite"', index],
    ['Live Head exact next R0 right', 'function fetchHeartbeatNextRight', health],
    ['Live Head per-block activity receipts', 'function fetchHeartbeatActivity', health],
    ['Live Head per-block missed-attester receipts', 'function liveHeadMissedState', health],
    ['Live Head exact missed-attester threshold', 'LIVE_HEAD_POWER_DETAIL_THRESHOLD = 6969', health],
    ['Live Head quiet-block missed-attester trigger', 'const quiet = story?.quiet === true', health],
    ['Live Head missed-attester identity pills', 'data-missed-baker-address=', health],
    ['Live Head width-aware pill fitting', 'function fitLiveHeadPills', health],
    ['Live Head responsive pill observer', 'new ResizeObserver', health],
    ['Live Head full producer addresses', "producerHasAlias ? producer.alias : (producer.address || 'Unknown baker')", health],
    ['Live Head two-thirds consensus status', 'const quorumPower = Math.ceil(committee * 2 / 3)', health],
    ['Live Head top-line Quiet indicator', 'class="live-head-quiet"', health],
    ['Live Head exact manager gas receipt', '/operations/3', health],
    ['Live Head protocol gas-limit denominator', 'hard_gas_limit_per_block', health],
    ['Live Head internal manager gas aggregation', 'internal_operation_results', health],
    ['Live Head non-quiet gas fullness pill', 'class="live-head-gas is-${gas.className}"', health],
    ['Live Head gas severity tiers', "pct >= 85 ? 'hot' : pct >= 60 ? 'busy' : pct >= 25 ? 'active' : 'open'", health],
    ['Live Head quiet removed from detail pills', "filter((fragment) => fragment.key !== 'quiet')", health],
    ['Live Head compact responsive cap', 'function compactLiveHeadBlockLimit', health],
    ['Live Head ten-row desktop expanded cap', 'LIVE_HEAD_EXPANDED_DESKTOP_LIMIT = 10', health],
    ['Live Head nine-row mobile expanded cap', 'LIVE_HEAD_EXPANDED_MOBILE_LIMIT = 9', health],
    ['Live Head persistent depth preference', 'tezos-systems-live-head-depth-v1', health],
    ['Live Head shared corner and Setup depth controls', 'function wireLiveHeadDepthControls', health],
    ['Network Health Passing Blocks shares the depth control', 'id="health-block-depth-toggle"', health],
    ['Network Health Passing Blocks compact desktop depth', 'CHAMBER_COMPACT_DESKTOP_BLOCK_LIMIT = 8', health],
    ['Network Health Passing Blocks compact mobile depth', 'CHAMBER_COMPACT_MOBILE_BLOCK_LIMIT = 6', health],
    ['Network Health Passing Blocks expanded desktop depth', 'CHAMBER_BLOCK_LIMIT = 15', health],
    ['Network Health Passing Blocks expanded mobile depth', 'CHAMBER_EXPANDED_MOBILE_BLOCK_LIMIT = 12', health],
    ['Network Health Passing Blocks depth wiring', 'function wireHealthBlockDepthControl', health],
    ['Network Health Passing Blocks activity Setup', 'id="health-block-filter-toggle"', health],
    ['Network Health Passing Blocks receipt rail', 'data-health-block-receipts', health],
    ['Network Health Passing Blocks shared supplement request', 'function requestRecentBlockSupplements', health],
    ['Network Health Passing Blocks quiet receipt update', 'quietlySyncElement(receipt, renderRecentBlockReceipts(block))', health],
    ['Live Head expanded receipt cache', 'HEARTBEAT_ACTIVITY_CACHE_LIMIT = 20', health],
    ['Live Head quiet keyed row reconciliation', 'quietlySyncElement(row, renderLiveHeadRow', health],
    ['Live Head FLIP row shift', 'function smoothlyShiftLiveHeadRows', health],
    ['Live Head Passing Blocks level field', 'class="live-head-level"', health],
    ['Live Head Passing Blocks round field', '${renderRoundBadge(block)}', health],
    ['Live Head Passing Blocks delta field', 'live-head-delta health-interval', health],
    ['Live Head Passing Blocks attestation field', 'live-head-power health-power', health],
    ['Live Head once-per-margin bar signature', 'data-bar-signature="${barSignature}"', health],
    ['Live Head opaque first paint', 'class="live-head-skeleton-primary"', index],
    ['Live Head bottom-right depth arrow', 'id="live-head-depth-toggle"', index],
    ['Live Head Setup depth option', 'id="live-head-depth-setting"', index],
    ['Live Head visibility-gated supplements', "document.visibilityState !== 'visible'", health],
    ['Live Head health feed hook', 'updateBlockTicker(data)', health],
    ['price bar cycle health wiring', 'function wireCycleChipHealthLauncher', health],
    ['Live Head landing-page panel styles', '.live-head-panel.lb-panel', heroSearchCss],
    ['Live Head redundant status badge removed', '.live-head-state {\n    display: none;\n}', heroSearchCss],
    ['Live Head story chip styles', '.live-head-story-chip', heroSearchCss],
    ['Live Head missed-attester pill styles', '.live-head-miss-pill', heroSearchCss],
    ['Live Head clear attestation pill remains complete', '.live-head-miss-pill.is-clear {\n    max-width: none;', heroSearchCss],
    ['Live Head gas fullness fill styles', '.live-head-gas::before', heroSearchCss],
    ['Live Head mobile info-and-age fact rail', 'grid-template-columns: 10.5ch minmax(0, 1fr) max-content;', heroSearchCss],
    ['Live Head mobile viewport-width panel', 'width: var(--page-col);', heroSearchCss],
    ['Live Head full-bleed search unclamped', 'max-width: none;', heroSearchCss],
    ['Live Head reduced-motion settle', '.live-head-story-chip,', heroSearchCss],
    ['Live Head depth arrow styling', '.live-head-depth-toggle[aria-expanded="true"] svg', heroSearchCss],
    ['Network Health Passing Blocks depth arrow styling', '.health-block-depth-toggle[aria-expanded="true"] svg', networkHealthCss],
    ['Network Health Passing Blocks compact row styling', '#health-recent-block-list .health-block-row:nth-child(n + 9)', networkHealthCss],
    ['Network Health Passing Blocks expanded mobile row styling', 'html[data-live-head-expanded="true"] #health-recent-block-list .health-block-row:nth-child(n + 13)', networkHealthCss],
    ['Network Health Passing Blocks reclaimed level lane', 'grid-template-columns: 124px 58px 58px 112px 56px', networkHealthCss],
    ['Network Health Passing Blocks right receipt rail styling', '.health-block-receipts {', networkHealthCss],
    ['Network Health Passing Blocks Setup styling', '.health-block-filter-toggle.live-head-filter-toggle', networkHealthCss],
    ['network health continuity panel styles', '.health-continuity-panel', styles],
    ['network health continuity runtime styles', '.health-continuity-runtime', styles],
    ['chain uptime counter updater', "document.getElementById('chain-uptime-counter')", app],
    ['top continuity counter updater', 'setTopContinuityRuntime(years, days, hours, mins);', app],
    ['top continuity decrypt duration', 'TOP_CONTINUITY_SHUFFLE_MS = 1500', app],
    ['top continuity Protocol Anthology launcher wiring', 'openProtocolHistoryChamber();', app],
    ['top continuity Protocol Anthology hash wiring', "window.history.pushState(null, '', '#protocol-history');", app],
    ['top continuity all-time pill history wiring', "openCardHistoryModal(key, 'all')", app],
    ['top continuity finality history metric', "metric: 'finality_seconds'", await readText('js/features/history.js')],
    ['chain uptime baker updater', "setChainText('chain-uptime-bakers'", app],
    ['top continuity proof styles', '.top-continuity-panel', styles],
    ['header uptime badge title stack styles', '.header-brand-stack', styles],
    ['header continuity row styles', '.header-continuity-row', heroSearchCss],
    ['header render-blocking trailing-hour activity styles', '.header-activity-button', heroSearchCss],
    ['header first-paint activity loading state', '.header-activity-cluster.is-loading .block-ticker-value', heroSearchCss],
    ['header intermediate two-row breakpoint', '@media (min-width: 641px) and (max-width: 1279px)', heroSearchCss],
    ['header intermediate four-column pill grid', 'grid-template-columns: repeat(4, minmax(0, 1fr));', heroSearchCss],
    ['top continuity stat rail right aligned', 'justify-content: flex-end', styles],
    ['top continuity rail is borderless tape', 'border: 0;', styles],
    ['top continuity identity claim styles', '.top-continuity-claim', heroSearchCss],
    ['top continuity statement runtime scale', 'font-size: clamp(1.5rem, 2.15vw, 2rem);', heroSearchCss],
    ['top continuity dedicated runtime font role', 'font-family: var(--font-runtime);', heroSearchCss],
    ['Handoff display font role', 'font-family: var(--font-display, Orbitron', siteMapCss],
    ['Live Pulse display font role', "var(--font-display, 'Space Grotesk'", shellExtrasCss],
    ['Live Pulse clock explicit presentation', '.hot-today-clock:is(:link, :visited)', shellExtrasCss],
    ['Live Pulse clock suppresses visited-link decoration', 'text-decoration: none;', shellExtrasCss],
    ['Maxis display font role', "font-family: var(--font-display, 'Orbitron'", maxisCss],
    ['top continuity runtime readability scale', 'font-size: 1.08em;', heroSearchCss],
    ['top continuity runtime real font weight', 'font-weight: 700;', heroSearchCss],
    ['top continuity statement caption scale', 'font-size: clamp(0.72rem, 0.92vw, 0.875rem);', heroSearchCss],
    ['top continuity statement separator scale', 'font-size: clamp(0.7rem, 0.85vw, 0.82rem);', heroSearchCss],
    ['top continuity mobile direct runtime scale', 'font-size: clamp(1.05rem, 4.1vw, 1.2rem);', heroSearchCss],
    ['top continuity mobile removes zoom offset', 'zoom: 1;', styles],
    ['mobile title and protocol stack independently', 'grid-template-columns: minmax(0, 1fr);', heroSearchCss],
    ['top continuity runtime natural segment gap', 'gap: 0.5ch;', heroSearchCss],
    ['top continuity hover affordance', '.top-continuity-history:is(:hover, :focus-visible) .top-continuity-arrow', heroSearchCss],
    ['top continuity segmented runtime renderer', 'renderTopContinuityRuntime(years, days, hours, mins)', app],
    ['top continuity hero settled promise', 'window.tezosSystemsHeroSettled = heroSettled', app],
    ['top continuity toast gate waits for hero', 'setToastGate(heroSettled)', app],
    ['toast queue waits for hero gate', 'await waitForGate();', toastQueue],
    ['top continuity counter tween', 'tweenNumber(el, 0, totalMinutes', app],
    ['top continuity pill stagger', '}, index * 80);', app],
    ['top continuity arrival pending class', 'hero-arrival-pending', app],
    ['top continuity arrival completion class', 'hero-arrived', app],
    ['top continuity milestone event bridge', "window.addEventListener('hot-signal-rendered'", app],
    ['top continuity milestone destination resolver', 'uptimeMilestoneDestination(signal)', app],
    ['top continuity milestone marker binding', "querySelector('.top-continuity-milestone-new')", app],
    ['top continuity milestone near state', "topContinuityProof?.classList.toggle('is-milestone-near', near)", app],
    ['top continuity milestone crossed state', "topContinuityProof?.classList.toggle('is-milestone-crossed', crossed)", app],
    ['top continuity milestone status label', "topContinuityMilestoneNew.textContent = near ? 'Soon' : 'New';", app],
    ['top continuity nullable milestone expiry guard', "if (value == null || value === '') return null;", app],
    ['top continuity milestone clean outline', '.top-continuity-milestone-outline', shellExtrasCss],
    ['top continuity milestone transparent interior', 'background: transparent;', shellExtrasCss],
    ['top continuity milestone hairline border', 'border: 1px solid color-mix(in srgb, var(--uptime-badge-label) 58%, var(--uptime-badge-value));', shellExtrasCss],
    ['top continuity approaching milestone dashed outline', '.top-uptime-cluster.is-milestone-near .top-continuity-milestone-outline', shellExtrasCss],
    ['top continuity approaching milestone dashed treatment', 'border-style: dashed;', shellExtrasCss],
    ['top continuity crossed milestone solid outline', '.top-uptime-cluster.is-milestone-crossed .top-continuity-milestone-outline', shellExtrasCss],
    ['top continuity milestone NEW marker styles', '.top-continuity-milestone-new', shellExtrasCss],
    ['top continuity milestone NEW marker above outline paint layer', 'z-index: 2;', shellExtrasCss],
    ['top continuity milestone NEW marker visible for unseen signal', '.top-uptime-cluster.has-milestone-signal .top-continuity-milestone-new', shellExtrasCss],
    ['top continuity milestone NEW marker separated above outline', 'top: -1.3rem;', shellExtrasCss],
    ['top continuity milestone removes offset highlight', 'box-shadow: none;', shellExtrasCss],
    ['top continuity milestone one-shot reveal', 'uptimeMilestoneNewReveal 720ms', shellExtrasCss],
    ['top continuity milestone delayed one-shot nudge', 'uptimeMilestoneNewNudge 420ms ease-out 5.1s 1', shellExtrasCss],
    ['top continuity milestone popover styles', '.top-continuity-milestone-popover', shellExtrasCss],
    ['top continuity mobile fixed milestone sheet', 'bottom: max(0.72rem, env(safe-area-inset-bottom));', shellExtrasCss],
    ['top continuity milestone action styles', '.top-continuity-milestone-link', shellExtrasCss],
    ['top continuity baker compact row styles', '.top-continuity-baker-row', shellExtrasCss],
    ['top continuity baker right-side actions', '.top-continuity-baker-actions', shellExtrasCss],
    ['top continuity baker size badge styles', '.top-continuity-baker-size', shellExtrasCss],
    ['top continuity baker mobile action targets', 'min-width: 44px;', shellExtrasCss],
    ['top continuity milestone close wiring', "topContinuityMilestoneClose?.addEventListener('click'", app],
    ['top continuity rolling seen-state key', "tezos-systems-uptime-milestone-seen-v1", app],
    ['top continuity id-status seen identity', '`${id}|${uptimeMilestoneStatus(signal)}`', app],
    ['top continuity touch disclosure detector', 'function uptimeMilestoneNeedsDisclosureStep()', app],
    ['top continuity first touch opens disclosure', 'setUptimeMilestonePopoverVisible(true, { lockDisclosure: true });', app],
    ['top continuity second activation marks seen', 'markUptimeMilestoneSeen(milestoneSignal);', app],
    ['top continuity second activation opens destination', 'openUptimeMilestoneDestination(milestoneSignal);', app],
    ['top continuity cross-tab seen sync', 'event.key !== UPTIME_MILESTONE_SEEN_KEY', app],
    ['top continuity explicit destination action', "topContinuityMilestoneLink?.addEventListener('click'", app],
    ['milestone ticker word and glyph styles', '.pulse-ticker-weight', shellExtrasCss],
    ['milestone ticker weight selector', '[data-pulse-weight="milestone"]', shellExtrasCss],
    ['milestone ticker arrival treatment', '.pulse-ticker-item.is-arriving', shellExtrasCss],
    ['top continuity loading skeleton respects arrived pills', '.hero-arrival-pending .top-continuity-stat:not(.hero-arrived) strong', loadingCss],
    ['top continuity title theme token', '--header-title-color', styles],
    ['top continuity uptime statement transparent bg', 'background: transparent;', styles],
    ['top continuity uptime statement unboxed border', 'border: 0;', styles],
    ['top continuity uptime badge label token', 'color: var(--uptime-badge-label);', styles],
    ['top continuity uptime value token', 'color: var(--uptime-badge-value);', styles],
    ['top continuity value color tokens', 'var(--pill-color, var(--top-pill-bakers))', styles],
    ['top continuity baker color selector', '.top-continuity-stat[data-card-history="total-bakers"]', styles],
    ['top continuity finality color selector', '.top-continuity-stat[data-card-history="finality"]', styles],
    ['top continuity staked color selector', '.top-continuity-stat[data-card-history="staking-ratio"]', styles],
    ['top continuity issuance color selector', '.top-continuity-stat[data-card-history="issuance-rate"]', styles],
    ['top continuity mobile pill grid', 'grid-template-columns: repeat(2, minmax(0, 1fr))', styles],
    ['top continuity isolated decrypt styles', '.top-continuity-stat.is-shuffling', styles],
    ['top continuity stable finality slot', '.top-continuity-stat[data-card-history="finality"] strong', styles],
    ['top continuity arrival hides pending pills only', '.top-continuity-panel.hero-arrival-pending .top-continuity-stat:not(.hero-arrived)', heroSearchCss],
    ['top continuity arrival reveal class', '.top-continuity-stat.hero-arrived', heroSearchCss],
    ['health cycle timing styles', '.health-cycle-panel', styles],
    ['health current cycle progress styles', '.health-cycle-progress-track', networkHealthCss],
    ['health Teztale consensus styles', '.health-consensus-panel', healthStyles],
    ['health Teztale propagation styles', '.health-consensus-propagation', healthStyles],
    ['health Teztale histogram styles', '.health-consensus-histogram', healthStyles],
    ['health Teztale histogram-bin styles', '.health-consensus-histogram-bin', healthStyles],
    ['health Clean-theme consensus contrast override', '[data-theme="clean"] .health-consensus-panel', networkHealthCss],
    ['health Nakamoto panel styles', '.health-nakamoto-panel', networkHealthCss],
    ['health Nakamoto source-row styles', '.health-nc-source-row', networkHealthCss],
    ['health Nakamoto action-group styles', '.health-nc-actions', healthStyles],
    ['health Nakamoto action-button styles', '.health-nc-action', healthStyles],
    ['health Octez versions styles', '.health-octez-panel', styles],
    ['My Tezos Octez warning styles', '.drawer-operator-watch', styles],
    ['My Baker Octez critical styles', '.my-baker-stat.my-baker-octez-critical', styles],
    ['canonical chamber expand cue factory', 'function createChamberExpandCue()', app],
    ['canonical chamber expand cue class', "cue.className = 'chamber-expand-cue'", app],
    ['shared chamber footer rail style', '.chamber-entry-footer', styles],
    ['shared chamber freshness text style', '.chamber-entry-freshness', styles],
    ['Network moments monotonic change guard', 'MONOTONIC_CHANGE_METRICS', moments],
    ['Network moments shared rule gate', 'function ruleFires', moments],
    ['My Tezos era card button', 'tezos-era-share-btn', myTezos],
    ['My Tezos era card share helper', 'function shareEraCard', myTezos],
    ['Tezos Story action styles', '.tezos-story-actions', styles],
    ['Delegator fit finder questions', 'FIT_QUESTIONS', leaderboard],
    ['Delegator fit strict factual matcher', 'function bakerMatchesFit', leaderboard],
    ['Delegator fit lexicographic comparator', 'function compareBakerFit', leaderboard],
    ['Delegator fit factual ordering', 'function factualBakerFits', leaderboard],
    ['Delegator fit finder styles', '.baker-fit-finder', leaderboardCss],
    ['Delegator fit finder truth disclosure', 'No blended score is calculated', leaderboard],
    ['Leaderboard native sort controls', 'class="lb-sort-btn"', leaderboard],
    ['Leaderboard column sort state', 'aria-sort="${direction}"', leaderboard],
    ['Leaderboard explicit baker action', 'class="lb-baker-open"', leaderboard],
    ['Leaderboard compact governance signal source', "GOVERNANCE_SIGNALS_URL = '/data/baker-governance-signals.json'", leaderboard],
    ['Leaderboard governance signal integrity receipt', 'failed its SHA-256 integrity receipt', leaderboard],
    ['Leaderboard accepted proposal projection', 'record.acceptedProposals.map', leaderboard],
    ['Leaderboard completed ballot streak signal', 'currentBallotPeriodStreak', leaderboard],
    ['Leaderboard multi-signal badge rail', 'class="lb-badge-rail"', leaderboard],
    ['Leaderboard progressive signal legend', '.leaderboard-signal-legend', leaderboardCss],
    ['Leaderboard sort focus styles', '.lb-sort-btn:focus-visible', leaderboardCss],
    ['Theme picker native radio controls', 'class="theme-radio" type="radio"', themeUi],
    ['Theme picker radio group label', 'role="radiogroup" aria-label="Choose a site theme"', themeUi],
    ['Theme picker row-safe copy controls', 'class="theme-link-copy" type="button" data-copy-hash="#theme=${theme}"', themeUi],
    ['Theme picker copy control accessible label', 'aria-label="Copy ${label} theme link"', themeUi],
    ['Theme picker copy control focus style', '.theme-link-copy:focus-visible', shellExtrasCss],
    ['Clean dark Chamber surface token', '--chamber-surface-bg: #07101D', styles],
    ['Clean dark Chamber semantic exclusion', '.chamber-content:not(.maxis-content):not(.staking-chamber-content)', styles]
  ];
  for (const [label, snippet, text] of deepLinkContracts) {
    if (!text.includes(snippet)) fail(`missing deep-link contract: ${label}`);
  }
  if (heroSearchCss.includes('body.hero-search-mode .main-content')
      || heroSearchCss.includes('body.hero-search-mode .command-deck')
      || search.includes('setBackgroundInert')
      || /event\.key === ['"]Tab['"]/.test(search)) {
    fail('Live Head search must not dim, blur, inert, fix, or keyboard-trap the landing page');
  }
  if (index.includes('id="block-ticker-strip"') || index.includes('id="upgrade-clock"')) {
    fail('The retired ticker strip and command-deck sibling must not survive as hidden compatibility markup');
  }

  const chamberPollingContracts = [
    ['Liquidity Baking bounded incremental page', 'const LB_INCREMENTAL_BLOCK_LIMIT = 32', lb],
    ['Liquidity Baking overlap depth', 'const LB_INCREMENTAL_OVERLAP_LEVELS = 4', lb],
    ['Liquidity Baking block hash receipt', "select: 'level,hash,timestamp,producer,lbToggle,lbToggleEma'", lb],
    ['Liquidity Baking incremental level filter', "params.set('level.ge'", lb],
    ['Liquidity Baking deduplicated ring merge', 'function mergeBlockWindow(', lb],
    ['Liquidity Baking continuity catch-up', 'return fetchCanonicalBlockWindow();', lb],
    ['Liquidity Baking canonical launcher sample', 'fetchLiquidityBakingData(LB_MODAL_BLOCK_LIMIT, { force })', lb],
    ['Liquidity Baking launcher/modal request coalescing', 'let _lbWindowFetchPromise = null', lb],
    ['Liquidity Baking initial modal cache reuse', 'fetchLiquidityBakingData(LB_MODAL_BLOCK_LIMIT, { force: !initial })', lb],
    ['Liquidity Baking recent switcher summary', 'function recentUniqueVoteChanges(', lb],
    ['Liquidity Baking switcher quiet reconciliation', 'quietlySyncElement(switcherStrip, renderEntrySwitcherStrip(data))', lb],
    ['Liquidity Baking latest-vote quiet reconciliation', 'quietlySyncHtml(voteRows, renderEntryVoteTape(data.blocks))', lb],
    ['Liquidity Baking last-good launcher state', "card.dataset.lbRefreshState = 'delayed'", lb],
    ['Liquidity Baking visible-tab catch-up', 'handleLiquidityBakingVisibilityChange', lb],
    ['tz4 explicit operation page size', 'const CONSENSUS_OPERATION_PAGE_SIZE = 1000', tz4],
    ['tz4 safe overlap depth', 'const CONSENSUS_UPDATE_OVERLAP_LEVELS = 64', tz4],
    ['tz4 explicit operation offset', 'offset: String(offset)', tz4],
    ['tz4 incremental level filter', "params.set('level.ge'", tz4],
    ['tz4 operation receipt deduplication', 'function consensusOperationIdentity(', tz4],
    ['tz4 ten-minute baker snapshot cache', 'const BAKER_CACHE_TTL = 10 * 60 * 1000', tz4],
    ['tz4 launcher-room request coalescing', 'let _tz4FetchPromise = null', tz4],
    ['tz4 truthful paged-history coverage', "mode: 'complete-paged'", tz4],
    ['tz4 visible-tab catch-up', 'handleTz4VisibilityChange', tz4],
    ['Liquidity Baking static launcher shell', 'data-chamber-entry-id="liquidity-baking"', index],
    ['Liquidity Baking dynamic module registry', "modulePath: '../features/liquidity-baking.js'", app],
    ['tz4 dynamic module registry', "modulePath: '../features/tz4-adoption.js'", app]
  ];
  for (const [label, snippet, text] of chamberPollingContracts) {
    if (!text.includes(snippet)) fail(`missing Chamber polling contract: ${label}`);
  }
  if (/^import\s+\{[^\n]*(?:initLiquidityBaking|initTz4AdoptionChamber)[^\n]*\}\s+from/m.test(app)) {
    fail('Liquidity Baking and tz4 launchers must not regain eager static imports');
  }
  pass(`Liquidity Baking and tz4 lazy polling contracts checked: ${chamberPollingContracts.length}`);

  const uptimeMilestoneClickStart = app.indexOf("topContinuityHistory.addEventListener('click'");
  const uptimeMilestoneLinkStart = app.indexOf("topContinuityMilestoneLink?.addEventListener('click'", uptimeMilestoneClickStart);
  const uptimeMilestoneClick = app.slice(uptimeMilestoneClickStart, uptimeMilestoneLinkStart);
  const firstDisclosureIndex = uptimeMilestoneClick.indexOf('setUptimeMilestonePopoverVisible(true, { lockDisclosure: true });');
  const seenIndex = uptimeMilestoneClick.indexOf('markUptimeMilestoneSeen(milestoneSignal);');
  const destinationIndex = uptimeMilestoneClick.indexOf('openUptimeMilestoneDestination(milestoneSignal);');
  if (
    uptimeMilestoneClickStart < 0
    || uptimeMilestoneLinkStart < 0
    || !uptimeMilestoneClick.includes('uptimeMilestoneNeedsDisclosureStep() && !uptimeMilestoneDisclosureLocked')
    || firstDisclosureIndex < 0
    || seenIndex < firstDisclosureIndex
    || destinationIndex < seenIndex
  ) {
    fail('mobile uptime milestone must disclose on the first tap, then mark seen and open its Chamber on the second tap');
  }

  for (const staleMilestoneState of [
    'is-milestone-celebrating',
    'has-milestone-near',
    'has-milestone-celebration'
  ]) {
    if (app.includes(staleMilestoneState)) {
      fail(`header milestone must not retain dead state class: ${staleMilestoneState}`);
    }
  }
  if (
    app.includes("topContinuityHistory?.classList.toggle('is-milestone-near'")
    || app.includes("topContinuityHistory?.classList.toggle('is-milestone-crossed'")
  ) {
    fail('header milestone state classes belong only on the top uptime cluster');
  }
  const criticalMyTezosDrawer = loadingCss.match(/\.my-tezos-drawer\s*\{([^}]*)\}/)?.[1] || '';
  const criticalMyTezosScrim = loadingCss.match(/\.drawer-scrim\s*\{([^}]*)\}/)?.[1] || '';
  for (const declaration of [
    'position: fixed',
    'right: 0',
    'max-width: 100vw',
    'transform: translateX(100%)'
  ]) {
    if (!criticalMyTezosDrawer.includes(declaration)) {
      fail(`My Tezos critical first-paint drawer state is missing ${declaration}`);
    }
  }
  for (const declaration of ['position: fixed', 'opacity: 0', 'pointer-events: none']) {
    if (!criticalMyTezosScrim.includes(declaration)) {
      fail(`My Tezos critical first-paint scrim state is missing ${declaration}`);
    }
  }
  pass('My Tezos critical first-paint closed state checked');
  if (/function\s+scoreBakerFit|\bfitScore\b|\bcompositeFitScore\b/.test(leaderboard)) {
    fail('Delegator fit must use strict factual filters and lexicographic facts, never a hidden composite score');
  }
  if (leaderboard.includes('lb-share-btn') || leaderboard.includes('lb-share-col')) {
    fail('Baker Leaderboard must not restore one share control per row');
  }
  if (!leaderboard.includes('const OG_LAST_YEAR = 2018;')
      || !leaderboard.includes('const VETERAN_LAST_YEAR = 2021;')
      || !leaderboard.includes("artifact?.kind !== 'baker-governance-signals'")
      || !leaderboard.includes('acceptedProposalCount !== Number(artifact.acceptedProposalCount)')) {
    fail('Baker Leaderboard badge cutoffs or compact governance receipt validation have drifted');
  }
  if (leaderboard.includes('computeBakerScores') || leaderboard.includes("value: 'reliability'") || leaderboard.includes('grade ${')) {
    fail('Delegator fit must not present synthetic participation defaults as reliability or performance grades');
  }
  if (/card\.setAttribute\(['"]role['"],\s*['"]button['"]\)/.test(networkPulse)) {
    fail('Network Pulse entry card must not wrap its inner controls in an outer button role');
  }
  if (/const\s+(?:CHAMBERS|COMMANDS|QUICK_CHIPS)\s*=/.test(search)) {
    fail('Hero search must not restore manual site-map destination catalogs');
  }
  if (search.includes("value: 'Ushuaia'") || search.includes('${result.value}${result.hash}')) {
    fail('Hero search must not hard-code the current protocol or append redundant hashes to pretty routes');
  }
  if (stakingChamber.includes('requestedAmount')) {
    fail('Staking Chamber must filter TzKT actual processed amount, never requestedAmount');
  }
  if (/amountMutez\(row\)\s*>=\s*LARGE_MOVE_THRESHOLD_MUTEZ/.test(stakingChamber)) {
    fail('Staking Chamber threshold must stay strictly greater than 10,000 tez');
  }
  if (!/@media\s*\(max-width:\s*759px\)[\s\S]*?\.staking-chamber-content\s*\{[\s\S]*?width:\s*calc\(100vw\s*-\s*0\.875rem\)/.test(stakingChamberCss)) {
    fail('Staking Chamber mobile modal must remain viewport-contained');
  }
  pass('Staking Chamber strict amount, archive, route, and responsive contracts checked');
  if (!/\.health-consensus-panel[^\{]*\{[^}]*grid-column:\s*1\s*\/\s*-1\s*;/s.test(healthStyles)) {
    fail('Network Health Consensus Lens must span the full dashboard width');
  }
  const continuityPanelIndex = health.indexOf('${renderContinuityProofPanel()}');
  const promotedCyclePanelIndex = health.indexOf('${renderCycleTimingPanel(data)}', continuityPanelIndex);
  const healthDashboardIndex = health.indexOf('<div class="lb-dashboard-grid health-dashboard-grid">', continuityPanelIndex);
  if (!(continuityPanelIndex >= 0
      && promotedCyclePanelIndex > continuityPanelIndex
      && promotedCyclePanelIndex < healthDashboardIndex)) {
    fail('Network Health cycle progress must sit directly below Mainnet Continuity and above the detailed health grid');
  }
  if (!/\.health-continuity-runtime\s*\{[^}]*font-size:\s*clamp\(1\.3rem,\s*2\.5vw,\s*1\.9rem\);/s.test(styles)
      || !/@media\s*\(max-width:\s*760px\)[\s\S]*?\.health-continuity-runtime\s*\{[^}]*font-size:\s*clamp\(1rem,\s*4\.5vw,\s*1\.35rem\);/s.test(styles)) {
    fail('Network Health Mainnet Continuity counter must retain its compact desktop and mobile type scales');
  }
  pass('Network Health continuity and cycle-progress hierarchy checked');
  if (styles.includes('top-continuity-digits-') || app.includes('top-continuity-digits-')) {
    fail('top continuity runtime must use natural segment widths, not fixed digit slots');
  }
  if (index.includes('live-feed-pill') || index.includes('header-nft-feed-btn')) {
    fail('header must not expose a separate NFT Feed action');
  }
  const headerMyTezosIndex = index.indexOf('id="my-tezos-btn"');
  const headerExploreIndex = index.indexOf('id="features-gear"', headerMyTezosIndex);
  const headerSetupIndex = index.indexOf('id="settings-gear"', headerExploreIndex);
  if (!(headerMyTezosIndex >= 0
      && headerExploreIndex > headerMyTezosIndex
      && headerSetupIndex > headerExploreIndex)) {
    fail('header actions must stay ordered My Tezos, Explore, Setup');
  }
  if (!index.includes('id="hen-launcher" class="hen-launcher corner-gift-item" href="/hen/"')) {
    fail('HEN must remain discoverable through the corner gift tray');
  }
  for (const snippet of [
    'id="features-gear" class="glass-button header-nav-btn" aria-label="Open feature launcher" aria-haspopup="dialog" aria-controls="features-dropdown" aria-expanded="false"',
    'id="features-dropdown" role="dialog" aria-label="Explore Tezos Systems"',
    'id="settings-gear" class="glass-button header-nav-btn header-setup-btn" aria-label="Open setup and settings" aria-haspopup="dialog" aria-controls="settings-dropdown" aria-expanded="false"',
    'id="settings-dropdown" role="dialog" aria-label="Setup and settings"'
  ]) {
    if (!index.includes(snippet)) fail(`header popup semantics missing: ${snippet}`);
  }
  pass('header action priority and responsive labels checked');
  const networkPulseMobileNavBlock = networkPulseCss.match(/@media\s*\(max-width:\s*759px\)\s*\{[\s\S]*?\.network-pulse-nav\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  if (!networkPulseMobileNavBlock.includes('position: static') || !networkPulseMobileNavBlock.includes('flex-wrap: wrap')) {
    fail('Network Pulse mobile nav must wrap in normal flow instead of using an off-viewport scroll strip');
  }
  if (networkPulseMobileNavBlock.includes('overflow-x: auto') || networkPulseMobileNavBlock.includes('flex-wrap: nowrap')) {
    fail('Network Pulse mobile nav must not use horizontal overflow or nowrap pills');
  }
  const roomSelectorBlock = networkPulse.match(/const ROOM_VALUE_SELECTORS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || '';
  if (!roomSelectorBlock) {
    fail('Network Pulse room value selectors must stay explicit and checkable');
  } else {
    const selectorIds = Array.from(roomSelectorBlock.matchAll(/:\s*['"]#([^'"]+)['"]/g), (match) => match[1]);
    const selectorSurfaceFiles = await walk('.', (file) => /\.(?:html|js|mjs)$/.test(file) && !file.startsWith('node_modules/'));
    const selectorSurfaceText = (await Promise.all(selectorSurfaceFiles.map((file) => readText(file)))).join('\n');
    for (const id of selectorIds) {
      const hasId = selectorSurfaceText.includes(`id="${id}"`) || selectorSurfaceText.includes(`id='${id}'`);
      if (!hasId) fail(`Network Pulse room selector references missing DOM id: #${id}`);
    }
    pass(`Network Pulse room selectors checked: ${selectorIds.length}`);
  }
  const protocolEntryRailBlock = app.match(/function buildProtocolEntryRail[\s\S]*?function protocolDate/)?.[0] || '';
  if (!protocolEntryRailBlock.includes('PROTOCOL_ENTRY_RECENT_FALLBACK') || !protocolEntryRailBlock.includes('getProtocolEntryOrdinal(protocol, list)')) {
    fail('Protocol Anthology rail must use shared upgrade ordinals so Paris C stays a follow-up');
  }
  if (protocolEntryRailBlock.includes('chapterBase') || protocolEntryRailBlock.includes('list.length : 22')) {
    fail('Protocol Anthology rail must not derive chapter labels from raw protocol record length');
  }
  const protocolAnthologyBoardBlock = app.match(/function renderProtocolAnthologyBoard[\s\S]*?function updateProtocolHistoryEntryCard/)?.[0] || '';
  if (!protocolAnthologyBoardBlock.includes('const chapterCount = countProtocolUpgrades(enriched)')) {
    fail('Protocol Anthology board metric must use shared upgrade count convention');
  }
  const protocolEntryCardBlock = app.match(/function updateProtocolHistoryEntryCard[\s\S]*?function ensureProtocolHistoryEntryCard/)?.[0] || '';
  if (!protocolEntryCardBlock.includes('const count = Math.max(CANONICAL_UPGRADE_COUNT, countProtocolUpgrades(list, 0))')) {
    fail('Protocol Anthology entry card total must use shared upgrade count convention with canonical fallback');
  }
  if (protocolEntryCardBlock.includes('list.length || 22') || protocolEntryCardBlock.includes('id="protocol-history-entry-count">22')) {
    fail('Protocol Anthology entry card must not show raw 22-record protocol total');
  }
  if (heroSearchCss.includes('dissolve-into-search') || heroSearchCss.includes('blockTickerAperture')) {
    fail('Live Head rows must not dissolve into the search well');
  }
  const chainHeartbeatUpdateBlock = health.match(/function updateBlockTicker[\s\S]*?function wireCycleChipHealthLauncher/)?.[0] || '';
  const chainHeartbeatActivityBlock = health.match(/async function fetchHeartbeatActivity[\s\S]*?function requestHeartbeatSupplements/)?.[0] || '';
  const liveHeadRowBlock = health.match(/function renderLiveHeadRow[\s\S]*?function renderLiveHeadRows/)?.[0] || '';
  if (!health.includes('function updateLiveHeadRows')
      || !health.includes('quietlySyncElement(row, renderLiveHeadRow')
      || !health.includes("stack.insertAdjacentHTML('afterbegin'")) {
    fail('Live Head updates must reconcile compatible keyed rows in place');
  }
  if (chainHeartbeatUpdateBlock.includes('stack.innerHTML')) {
    fail('Live Head background updates must not replace the full live stack');
  }
  if (!chainHeartbeatActivityBlock.includes('Promise.allSettled')
      || !chainHeartbeatActivityBlock.includes('story?.complete === true && gas?.complete === true')
      || !health.includes('/operations/ballots?${query}')
      || !health.includes('/operations/proposals?${query}')
      || !health.includes('/voting/periods?firstLevel.ge=${startLevel}')
      || !health.includes('fetchHeartbeatL1Voting(visible)')
      || !chainHeartbeatActivityBlock.includes('transactions?.filter(isEtherlinkGovernanceActivity)')
      || !chainHeartbeatActivityBlock.includes('managerOperations !== null')
      || !chainHeartbeatActivityBlock.includes('evidenceRows !== null')
      || !chainHeartbeatActivityBlock.includes('milestoneRows')) {
    fail('Live Head stories must preserve partial-source receipt truth instead of coercing unavailable data to zero');
  }
  const powerIndex = liveHeadRowBlock.indexOf('live-head-power health-power');
  const trackIndex = liveHeadRowBlock.indexOf('live-head-power-track');
  const activityStatusIndex = liveHeadRowBlock.indexOf('${activityStatus}');
  if (!(powerIndex >= 0 && trackIndex > powerIndex && activityStatusIndex > trackIndex)
      || liveHeadRowBlock.includes('class="live-head-missed"')
      || liveHeadRowBlock.includes('${missed}')) {
    fail('Live Head must read attestation power, safety-margin rail, then Quiet/gas status without repeating aggregate missed power');
  }
  if (!health.includes("if (story.quiet === true) return { state: 'quiet'")
      || !health.includes("if (gas.state === 'quiet')")
      || !health.includes("if (gas.state === 'unavailable')")
      || !health.includes('data-gas-percent=')) {
    fail('Live Head must render Quiet and factual gas fullness as mutually exclusive, truth-preserving top-line states');
  }
  if (!index.includes('id="live-head-inspector"')
      || !health.includes('function renderLiveHeadInspector(')
      || !health.includes('function wireLiveHeadInspector(')
      || !health.includes('function liveHeadReadingPaused()')
      || !health.includes('function queueLiveHeadPausedUpdate(')
      || !health.includes('function resumeLiveHeadAfterInspector()')
      || !health.includes("panel.dataset.readingPaused = 'true'")
      || !health.includes('suppressMotion: true')
      || !health.includes("document.addEventListener('pointerdown'")
      || !health.includes("event.target.closest('#live-head-inspector')")
      || !health.includes("event.target.closest('.live-head-info')")
      || !health.includes("event.target.closest('.live-head-row[data-live-head-level]')")
      || !health.includes("event.target.closest('a, button, input, select, textarea, [role=\"button\"], [contenteditable=\"true\"]')")
      || !health.includes('class="live-head-info"')
      || !health.includes('liveHeadBlockUrl(level, { operations: true })')
      || !health.includes('href="/#my-baker=${encoded}"')
      || !health.includes('data-live-head-open-health')
      || !health.includes('maxFragments: LIVE_HEAD_ACTIVITY_TYPES.length + 3')
      || !heroSearchCss.includes('.live-head-inspector-fact')
      || !heroSearchCss.includes('.live-head-inspector-health')
      || !heroSearchCss.includes('.live-head-info:is(:hover, :focus-visible)')) {
    fail('Every Live Head block must expose its complete linked inspector from info hover/focus or a non-interactive row click, retain the lock while that receipt scrolls, and release one quiet catch-up on click-away');
  }
  if (!index.includes('id="live-head-alert"')
      || !index.includes('id="chain-stall-announcer"')
      || !health.includes('const LIVE_HEAD_STALLED_AFTER = 30 * 1000')
      || !health.includes('function confirmLiveHeadObservation(')
      || !health.includes("liveHeadStallLatchedLevel = level")
      || !health.includes("label.textContent = state === 'stalled' ? 'CHAIN STALLED' : 'BLOCKS DELAYED'")
      || !health.includes('liveHeadResumePendingLevel = level')
      || !health.includes("state === 'live' && (previousState === 'stalled' || liveHeadResumePendingLevel > 0)")
      || !heroSearchCss.includes('.live-head-panel[data-chain-state="stalled"]')
      || !heroSearchCss.includes('.live-head-alert-copy strong')
      || !/\.live-head-alert\s*\{[\s\S]*?position:\s*absolute;/.test(heroSearchCss)) {
    fail('Live Head must latch a source-confirmed stale head into an unmistakable chain-stall alert until a newer block resumes the chain');
  }
  if (!index.includes('id="live-head-filter-menu"')
      || !['l1-vote', 'l2-vote', 'etherlink', 'dal', 'art', 'defi', 'gaming', 'bridge', 'domains', 'stake', 'unstake', 'delegate', 'tokens', 'contract', 'transfers', 'calls'].every((kind) => index.includes(`data-live-head-filter-kind="${kind}"`))
      || !health.includes('id="health-block-filter-menu"')
      || !['l1-vote', 'l2-vote', 'etherlink', 'dal', 'art', 'defi', 'gaming', 'bridge', 'domains', 'stake', 'unstake', 'delegate', 'tokens', 'contract', 'transfers', 'calls'].every((kind) => health.includes(`data-live-head-filter-kind="${kind}"`))
      || !health.includes('LIVE_HEAD_ACTIVITY_FILTER_STORAGE_KEY')
      || !health.includes("tezos-systems-live-head-activity-filter-v3")
      || !health.includes('function wireLiveHeadActivityFilter(')
      || !health.includes('function syncAllLiveHeadActivityFilterUis(')
      || !health.includes('data-live-head-kind=')
      || !health.includes('data-live-head-mandatory=')
      || !health.includes("pill.dataset.liveHeadMandatory !== 'true'")
      || !health.includes('fitLiveHeadPills(panel)')
      || !heroSearchCss.includes('.live-head-filter-menu button[aria-pressed="false"]')) {
    fail('Live Head and Network Health Passing Blocks must share one persisted all-on normal-activity setup, keep exceptional chain receipts unfiltered, and apply each category choice through measured pill fitting');
  }
  if (!index.includes('id="live-head-my-tezos-setting"')
      || (index.match(/data-live-head-my-tezos-toggle/g) || []).length < 2
      || !health.includes('data-live-head-my-tezos-toggle')
      || !health.includes("import { readSavedMyTezosEntries } from '../core/wallet.js'")
      || !health.includes('LIVE_HEAD_MY_TEZOS_STORAGE_KEY')
      || !health.includes('actorAddresses: collectHeartbeatActorAddresses(')
      || !chainHeartbeatActivityBlock.includes('managerOperations,')
      || !chainHeartbeatActivityBlock.includes('evidenceRows,')
      || !health.includes('&& !transactionsClipped')
      || !health.includes('&& !stakingClipped')
      || !health.includes('&& !tokenTransfersClipped')
      || !health.includes('&& !l1VotingClipped')
      || !health.includes('function syncLiveHeadMyTezosRows()')
      || !health.includes('quietlyMutate(surface.container')
      || !health.includes('data-my-tezos-block-state="${personal.state}"')
      || !health.includes("!row.classList.contains('is-my-tezos-filtered-out') && row.getClientRects().length > 0")
      || !health.includes('const exitGhosts = motionAllowed && !liveHeadMyTezosOnly')
      || !health.includes("window.addEventListener('my-tezos-portfolio-changed'")
      || health.includes('ensureLiveHeadMyTezosStatus')
      || health.includes('Watching My Tezos')
      || !heroSearchCss.includes('.live-head-row.is-my-tezos-filtered-out')
      || heroSearchCss.includes('.live-head-my-tezos-status')
      || !heroSearchCss.includes('--live-head-compact-stack-height: 246px')
      || !heroSearchCss.includes('--live-head-expanded-stack-height: 618px')
      || !heroSearchCss.includes('--live-head-compact-stack-height: 196px')
      || !heroSearchCss.includes('--live-head-expanded-stack-height: 592px')
      || !heroSearchCss.includes('html[data-live-head-my-tezos-only="true"] .live-head-stack')
      || !heroSearchCss.includes('height: var(--live-head-compact-stack-height)')
      || !heroSearchCss.includes('height: var(--live-head-expanded-stack-height)')
      || !/\.live-head-depth-rail\s*\{[\s\S]*?position:\s*static;/.test(heroSearchCss)
      || !/\.live-head-depth-toggle\s*\{[\s\S]*?right:\s*8px;[\s\S]*?bottom:\s*56px;/.test(heroSearchCss)
      || !networkHealthCss.includes('.health-block-row.is-my-tezos-filtered-out')
      || !shellExtrasCss.includes('.live-head-my-tezos-setting-count')) {
    fail('Setup must persist one silent My Tezos-only block monitor, preclassify rows before insertion, exclude hidden rows from exit ghosts, preserve canonical compact and expanded geometry, pin the depth arrow to the card edge, and reconcile both block surfaces quietly');
  }
  if (!health.includes('live-head-baker-name')
      || !health.includes('live-head-story-connector')
      || !heroSearchCss.includes('.live-head-story-connector::after')) {
    fail('Live Head baker identities must hand receipts across a restrained right-pointing connector without spending receipt width');
  }
  if (!app.includes("import { initPlatformTextFallbacks } from './platform-text.js'")
      || !app.includes("safe('platformTextFallbacks', initPlatformTextFallbacks)")
      || !(await pathExists('js/core/platform-text.js'))) {
    fail('dashboard must initialize the iOS-safe Tezos glyph text fallback');
  }
  if (!heroSearchCss.includes('.live-head-quiet,\n.live-head-gas,\n.live-head-story-chip,\n.live-head-miss-pill')
      || !heroSearchCss.includes('background: rgba(11, 18, 34, 0.88);')
      || !heroSearchCss.includes('box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 10%, transparent)')
      || !heroSearchCss.includes('text-shadow: 0 1px 2px rgba(2, 8, 18, 0.9);')
      || !heroSearchCss.includes('backdrop-filter: blur(4px);')) {
    fail('Every Live Head pill must inherit Quiet\'s opaque theme-invariant backing, edge, shadow, and blur');
  }
  if (!chainHeartbeatActivityBlock.includes('/tokens/transfers?level=${level}')
      || chainHeartbeatActivityBlock.includes('token.metadata.artifactUri.null=false')
      || !chainHeartbeatActivityBlock.includes('token.metadata.symbol as symbol')
      || !chainHeartbeatActivityBlock.includes('HEARTBEAT_TOKEN_TRANSFER_LIMIT')
      || !chainHeartbeatActivityBlock.includes('tokenTransfersClipped')
      || !health.includes('/operations/3`')
      || !health.includes('/operations/2`')
      || !health.includes('flattenAppliedManagerOperations')
      || !health.includes('flattenAppliedEvidenceOperations')
      || !health.includes('data-live-head-details=')
      || !health.includes('LIVE_HEAD_DETAIL_MIN_WIDTH = 420')
      || !health.includes('pill.scrollWidth > pill.clientWidth + 1')
      || health.includes("story.fragments.filter((fragment) => fragment.key !== 'quiet').slice(0, 2)")) {
    fail('Live Head activity pills must reuse exact block receipts, classify all token transfers without double-counting art, and spend only measured spare row width on richer details');
  }
  const heartbeatBaseCacheIndex = chainHeartbeatActivityBlock.indexOf('heartbeatActivityCache.set(level, activity)');
  const heartbeatEnrichmentIndex = chainHeartbeatActivityBlock.indexOf('const needsDelegationEnrichment');
  const heartbeatEnrichmentBlock = chainHeartbeatActivityBlock.match(/const enrichmentPromise = Promise\.allSettled\([\s\S]*?heartbeatActivityEnrichmentInFlight\.set\(level, enrichmentPromise\);/)?.[0] || '';
  if (!health.includes('const heartbeatActivityEnrichmentInFlight = new Map()')
      || !(heartbeatBaseCacheIndex >= 0 && heartbeatEnrichmentIndex > heartbeatBaseCacheIndex)
      || !chainHeartbeatActivityBlock.includes('delegationRows: []')
      || !chainHeartbeatActivityBlock.includes('originationRows: []')
      || !chainHeartbeatActivityBlock.includes('heartbeatActivityCache.get(level) !== activity')
      || !heartbeatEnrichmentBlock.includes('/operations/delegations?level=${level}')
      || !heartbeatEnrichmentBlock.includes('/operations/originations?level=${level}')
      || heartbeatEnrichmentBlock.includes("priority: 'interactive'")
      || !heartbeatEnrichmentBlock.includes('updateBlockTicker(heartbeatData, { supplemental: true })')) {
    fail('Optional delegation and origination enrichment must yield to explicit user work, leave the complete base receipt available first, and reconcile only the matching cached block');
  }
  for (const bannedLiveHeadCopy of ['Syncing latest head block', 'Waiting for recent block receipts', 'Receipts syncing', 'Preparing block stories']) {
    if (index.includes(bannedLiveHeadCopy) || chainHeartbeatUpdateBlock.includes(bannedLiveHeadCopy)) {
      fail(`Live Head first paint must use opaque objects instead of visible status copy: ${bannedLiveHeadCopy}`);
    }
  }
  if (!heroSearchCss.includes('height: var(--hero-search-available-height')
      || heroSearchCss.includes('max-height: min(40vh, 420px')
      || !search.includes('!event.target.isConnected')
      || !search.includes("window.addEventListener('scroll', syncAvailableHeight, { passive: true })")) {
    fail('Live Head search must reach the viewport bottom and preserve detached result-menu clicks');
  }
  if (index.includes('id="live-head-bakers"')
      || health.includes('function updateLiveHeadBakers')
      || health.includes('LIVE_HEAD_MISS_PILL_LIMIT')
      || !health.includes('data-miss-state=')
      || !health.includes('data-live-head-missed-snapshot=')
      || !health.includes('liveHeadMissedStateFromRow(row, level)')
      || !heroSearchCss.includes('.live-head-story-chip.is-transfers')
      || !heroSearchCss.includes('.live-head-story-chip.is-art')
      || !heroSearchCss.includes('.live-head-miss-pill')
      || !heroSearchCss.includes('text-overflow: ellipsis;')
      || !heroSearchCss.includes('width: calc(100% + 32px);')
      || !heroSearchCss.includes('margin: 4px -16px -8px;')
      || !heroSearchCss.includes('border-top: 0;')) {
    fail('Live Head must put color-coded truncated facts on each block and join the block stack directly to the search well');
  }
  const liveHeadRowCss = heroSearchCss.match(/\.live-head-row \{[\s\S]*?\n\}/)?.[0] || '';
  const liveHeadPanelRuleCss = heroSearchCss.match(/\.live-head-panel\.lb-panel::before \{[\s\S]*?\n\}/)?.[0] || '';
  const liveHeadSearchFormCss = heroSearchCss.match(/\.live-head-panel \.hero-search-form \{[\s\S]*?\n\}/)?.[0] || '';
  if (!liveHeadRowCss
      || /border-bottom\s*:/.test(liveHeadRowCss)
      || !liveHeadRowCss.includes('height: 60px;')
      || !liveHeadRowCss.includes('row-gap: 4px;')
      || !liveHeadPanelRuleCss.includes('content: none;')
      || !liveHeadPanelRuleCss.includes('display: none;')
      || !liveHeadSearchFormCss.includes('border: 0;')
      || !liveHeadSearchFormCss.includes('border-top: 1px solid')
      || !heroSearchCss.includes('.live-head-baker.is-address')
      || !/\.live-head-baker\s*\{[\s\S]*?font-family:\s*'JetBrains Mono'/.test(heroSearchCss)
      || !heroSearchCss.includes('.live-head-panel .hero-search-form > .hero-search-copy > .hero-search-help')
      || !heroSearchCss.includes('@keyframes liveHeadRowReveal')
      || !heroSearchCss.includes('@keyframes liveHeadRowExit')
      || !health.includes("row.style.transform = `translate3d(0, ${delta}px, 0)`")
      || health.includes("import { blockTick }")
      || heroSearchCss.includes('.live-head-power-track::after')
      || heroSearchCss.includes('.live-head-consensus-cue')
      || !heroSearchCss.includes('transform: scaleX(var(--live-head-margin, 0));')
      || !health.includes('data-safety-margin=')) {
    fail('Live Head must remove decorative rules, replace row lines with spacing, and use the search well as its integrated bottom edge');
  }
  if (!health.includes("document.addEventListener('visibilitychange'") || !health.includes("document.visibilityState !== 'visible'")) {
    fail('Chain Heartbeat polling and catch-up must remain visibility gated');
  }
  if (henMode.includes('feed.insertBefore(output, grid())')) {
    fail('HEN CLI output must stay off-flow instead of inserting before the grid');
  }
  if (henMode.includes('hen-listening') || henMode.includes('origPoll')) {
    fail('HEN idle state must use the header/status dot path, not the old injected listening row or dead poll stub');
  }
  if (index.includes('</html>\n>')) {
    fail('index.html must not leave stray text after the closing html tag');
  }
  if (henPage.includes('http-equiv="refresh"') || henPage.includes('location.replace')) {
    fail('/hen/ must render a crawlable entry page instead of an empty redirect stub');
  }
  if (chamberRouteGenerator.includes('location.replace') || chamberRouteGenerator.includes('http-equiv="refresh"')) {
    fail('pretty chamber routes must hydrate the dashboard shell instead of redirecting to hash routes');
  }
  if (henMode.includes('cloudflare-ipfs.com')) {
    fail('HEN mode must not retry through the retired Cloudflare public IPFS gateway');
  }
  if (index.includes('cloudflare-ipfs.com')) {
    fail('CSP must not allow the retired Cloudflare public IPFS gateway');
  }
  if (api.includes('delegateAPY: 3.1') || api.includes('stakeAPY: 9.2')) {
    fail('shared API must not present hardcoded APY fallback values as live measurements');
  }
  for (const retiredSearchCopy of ['Wallet/.tez', 'wallet/domain retrieval surface', 'TzKT boundary', 'No Tezos.Systems room']) {
    if (search.includes(retiredSearchCopy)) fail(`hero search should not retain confusing copy: ${retiredSearchCopy}`);
  }
  if (!/@media \(max-width: 768px\)[\s\S]*?\.hero-search-input\s*\{[\s\S]*?font-size:\s*16px;/.test(heroSearchCss)) {
    fail('mobile hero search input must keep 16px text to avoid iOS focus zoom');
  }
  if (index.includes('top-continuity-proof-item') || styles.includes('.top-continuity-proof-item')) {
    fail('top header uptime badge should not retain the old Zero Forks / Zero Outages proof stamps');
  }
  if (index.includes('continuity-proof') || styles.includes('continuity-proof') || heroSearchCss.includes('continuity-proof') || app.includes('continuity-proof')) {
    fail('homepage should not retain the retired continuity-proof panel');
  }
  for (const [sourceName, source] of [['index.html', index], ['app.js', app], ['hero-search.css', heroSearchCss], ['styles.css', styles]]) {
    if (source.includes('protocol-ribbon') || source.includes('protocolRibbon') || source.includes('protocol_ribbon') || source.includes('PROTOCOL_RIBBON')) {
      fail(`${sourceName} should not retain the retired homepage protocol ribbon`);
    }
  }
  if (/style=["'][^"']*--pill-color/.test(index)) {
    fail('top header stat pills should use theme palette tokens, not inline --pill-color styles');
  }
  const themeListMatch = themeUi.match(/export const THEMES\s*=\s*\[([\s\S]*?)\];/);
  const registeredThemes = themeListMatch ? Array.from(themeListMatch[1].matchAll(/'([^']+)'/g), (match) => match[1]) : [];
  if (!registeredThemes.length) {
    fail('theme registry should expose the active THEMES list');
  }
  const headerPaletteTokens = [
    '--font-ui',
    '--font-display',
    '--font-data',
    '--font-runtime',
    '--header-title-color',
    '--header-title-glow',
    '--uptime-badge-bg',
    '--uptime-badge-border',
    '--uptime-badge-label',
    '--uptime-badge-value',
    '--uptime-badge-note',
    '--top-pill-bg',
    '--top-pill-bakers',
    '--top-pill-finality',
    '--top-pill-staked',
    '--top-pill-issuance'
  ];
  const rootPaletteBlock = styles.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  for (const theme of registeredThemes) {
    const themeBlockMatch = styles.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`));
    if (!themeBlockMatch) {
      fail(`theme ${theme} should define a CSS variable block for header palette tokens`);
      continue;
    }
    const paletteScope = theme === 'aurora' ? `${rootPaletteBlock}\n${themeBlockMatch[1]}` : themeBlockMatch[1];
    for (const token of headerPaletteTokens) {
      if (!paletteScope.includes(`${token}:`)) {
        fail(`theme ${theme} should define ${token} for title, uptime, and pill colors`);
      }
    }
  }
  const auroraBlock = `${rootPaletteBlock}\n${styles.match(/\[data-theme="aurora"\]\s*\{([\s\S]*?)\n\}/)?.[1] || ''}`;
  for (const color of ['#07111F', '#0D102A', '#45E0C8', '#9B8CFF']) {
    if (!auroraBlock.includes(color)) {
      fail(`Aurora uptime palette should keep the recommended teal-to-violet token ${color}`);
    }
  }
  if (!/Nunito:wght@400;500;600;700;800;900/.test(themePreload)) {
    fail('theme font request should load the rounded Nunito family used by Bubblegum and Moss');
  }
  const bubblegumTypography = styles.match(/\[data-theme="bubblegum"\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  if (!bubblegumTypography.includes("--font-ui: 'Nunito'") || !bubblegumTypography.includes("--font-runtime: 'Nunito'")) {
    fail('Bubblegum should use the rounded Nunito UI and runtime roles');
  }
  if (!styles.includes('[data-theme="nerv"] .title') || !styles.includes("--font-display: 'Archivo Black'")) {
    fail('NERV should pair its IBM console UI with the Archivo Black display role');
  }
  pass(`top header theme palette tokens checked: ${registeredThemes.length} themes`);
  const removedProtocolPromptContracts = [
    ['app banner renderer', 'updateGovernanceBanner', app],
    ['app banner selector', 'gov-countdown-banner', app],
    ['app banner slot', 'gov-countdown-banner-slot', app],
    ['index banner slot', 'gov-countdown-banner-slot', index],
    ['source banner styles', 'gov-countdown-banner', styles]
  ];
  for (const [label, snippet, text] of removedProtocolPromptContracts) {
    if (text.includes(snippet)) fail(`removed Current Protocol prompt resurfaced: ${label}`);
  }
  pass(`removed Current Protocol prompt guard checked: ${removedProtocolPromptContracts.length}`);

  const forbiddenCtezInterfaceStrings = [
    'better-call.dev',
    'ctez-wallet-oven-id',
    'ctez-wallet-withdraw-to',
    'ctez-tez-input',
    'ctez-outstanding-input',
    'CTEZ_STORAGE_URL',
    'decimalToMicroString',
    'Wallet flow',
    'chamber-entry-wide ctez-entry-card',
    'ctez-entry-card'
  ];
  for (const snippet of forbiddenCtezInterfaceStrings) {
    if (ctez.includes(snippet)) fail(`ctez chamber should not expose manual recovery UI: ${snippet}`);
  }
  if (wallet.includes('dist/octez.connect.min.js') || wallet.includes('loadScript(')) {
    fail('Octez.Connect wallet loader must avoid the CSP-hostile UMD script bundle');
  }
  const fixedEtherlinkContracts = [
    'KT19oUVQPnVLuUBYXrBVd46WJnNAMpqkKSwo',
    'KT1AXRU3wLc87WNhLhVGrgqDGubLACUMUgPb',
    'KT1VGyd2cRSHoDnxDnSuqGJD3mL8DzcVqX98'
  ];
  for (const address of fixedEtherlinkContracts) {
    if (etherlinkGovernance.includes(address)) fail(`Tezos X Governance chamber should discover active contract, not hardcode ${address}`);
  }
  pass(`deep-link selector contracts checked: ${deepLinkContracts.length}`);
  pass('Protocol Anthology chapter-count convention checked');

  const cardControlContracts = [
    ['Health card copy slot', '.health-entry-card .card-copy-link', styles],
    ['Health card camera slot', '.health-entry-card .card-share-btn', styles],
    ['Network Health pre-init camera slot', '.stat-card[data-stat="network-health"] .card-share-btn', styles],
    ['Chamber history/stat slot', '#chambers-grid .chamber-entry-card > .card-history-btn', styles],
    ['Chamber desktop controls are 80 percent size', '--chamber-control-size: 25.6px;', styles],
    ['Chamber mobile controls are 80 percent size', '--chamber-control-size: 27.2px;', styles],
    ['Chamber controls use shared compact size', 'width: var(--chamber-control-size);', styles],
    ['Chamber camera icon is 80 percent size', '#chambers-grid .chamber-entry-card > .card-share-btn > svg {\n    width: 12px;', styles],
    ['Chamber info icon is 80 percent size', '#chambers-grid .chamber-entry-card > .card-info-btn > svg {\n    width: 12.8px;', styles],
    ['Chamber history/stat desktop bottom placement', 'top: calc(0.85rem + 102px);', styles],
    ['Chamber history/stat mobile bottom placement', 'top: calc(0.78rem + 108px);', styles],
    ['Chamber share helper export', 'export function ensureCardShareButton(card)', share],
    ['Chamber share sync call', 'ensureCardShareButton(card);', app],
    ['Chamber rich share capture helper', 'async function captureChamberCard(card)', share],
    ['Chamber rich share clones visible panel', 'cloneChamberPanel(card)', share],
    ['Chamber rich share html2canvas color sanitizer', 'sanitizeCaptureModernColorStyles(panelClone', share],
    ['Chamber rich share canonical route helper imports', "import { findSiteMapDestination, siteMapCanonicalRoute } from '../core/site-map.js';", share],
    ['Chamber rich share canonical route resolver', "siteMapCanonicalRoute(hash || '#chambers')", share],
    ['Chamber rich share panel label', 'Visible Chamber Panel', share],
    ['Chamber generated info helper', 'function ensureChamberInfoButton(card)', app],
    ['Chamber generated info copy', 'CHAMBER_INFO_COPY', app],
    ['Chamber generated info canonical tooltip id', 'tooltip.id = `tooltip-${key}`;', app],
    ['Chamber top control lane', '--chamber-control-lane', styles],
    ['Chamber content avoids top-right controls', 'padding-right: var(--chamber-control-lane);', styles],
    ['Chamber controls layer above card content', '#chambers-grid .chamber-entry-card > .card-copy-link', styles],
    ['Chamber footer rail exists in flow', '.chamber-entry-footer', styles],
    ['Chamber footer is absolute bottom rail', 'position: absolute;', styles],
    ['Chamber footer uses shared right edge', 'right: var(--chamber-card-inline-padding);', styles],
    ['Chamber footer uses shared left edge', 'left: var(--chamber-card-inline-padding);', styles],
    ['Chamber footer bottom placement is fixed', 'bottom: 0.75rem;', styles],
    ['Chamber open cue style is global', '.chamber-expand-cue {', styles],
    ['Chamber stale freshness uses footer text', '.chamber-entry-card.chamber-data-stale .chamber-entry-freshness', styles],
    ['Chamber pseudo freshness disabled', '.chamber-entry-card[data-updated-label]::after', styles]
  ];
  for (const [label, snippet, text] of cardControlContracts) {
    if (!text.includes(snippet)) fail(`missing card control spacing contract: ${label}`);
  }
  pass(`card control spacing contracts checked: ${cardControlContracts.length}`);

  const expandCueMarkupFiles = [
    'index.html',
    ...(await walk('js', (file) => file.endsWith('.js')
      && file !== 'js/core/app.js'
      && file !== 'js/ui/chamber-accessibility.js'))
  ];
  for (const file of expandCueMarkupFiles) {
    const text = file === 'index.html' ? index : await readText(file);
    if (text.includes('chamber-expand-cue')) {
      fail(`chamber expand cue must be created only by js/core/app.js, found in ${file}`);
    }
  }

  const scopedCueSelectors = [];
  for (const match of styles.matchAll(/([^{}]+)\{/g)) {
    const selectorBlock = match[1].trim();
    if (!selectorBlock.includes('.chamber-expand-cue')) continue;
    selectorBlock.split(',').map((selector) => selector.trim()).forEach((selector) => {
      if (!selector.startsWith('.chamber-expand-cue')) scopedCueSelectors.push(selector);
    });
  }
  if (scopedCueSelectors.length) {
    fail(`chamber expand cue styles must stay unscoped: ${scopedCueSelectors.join(', ')}`);
  }
  pass(`chamber expand cue canonical contracts checked: ${expandCueMarkupFiles.length} source files`);

  const chamberRendererStyleContracts = [
    ['Tezos X Governance timeline row style', '.etherlink-gov-table .etherlink-gov-timeline-row', styles],
    ['Tezos X Governance timeline row removes browser underline', 'a.etherlink-gov-timeline-row:hover', styles],
    ['Tezos X Governance failure-red launcher state', '[data-etherlink-governance-state="risk"] .etherlink-gov-entry-value', shellExtrasCss],
    ['Tezos X Governance recent baker quorum styles', '.etherlink-gov-baker-vote-row', shellExtrasCss],
    ['tz4 monthly bar rail style', '.tz4-month-bars', styles],
    ['tz4 monthly bar column style', '.tz4-month-bar {', styles],
    ['tz4 monthly bar visible count style', '.tz4-month-count', styles],
    ['tz4 monthly bar fill style', '.tz4-month-fill', styles],
    ['tz4 first movers top 10 cap', '.slice(0, 10)', tz4],
    ['ctez console shell style', '.ctez-console-shell', styles],
    ['ctez summary strip style', '.ctez-summary-strip', styles],
    ['ctez oven panel style', '.ctez-oven-panel', styles],
    ['ctez oven card style', '.ctez-oven-card', styles],
    ['ctez utilization bar style', '.ctez-utilization-bar', styles],
    ['ctez detail card style', '.ctez-detail-card', styles],
    ['ctez action button grid style', '.ctez-action-buttons', styles]
  ];
  for (const [label, snippet, text] of chamberRendererStyleContracts) {
    if (!text.includes(snippet)) fail(`missing chamber renderer style contract: ${label}`);
  }
  pass(`chamber renderer style contracts checked: ${chamberRendererStyleContracts.length}`);

  const goatcounterInit = await readText('js/core/goatcounter-init.js');
  const shareTrackingContracts = [
    ['tracked Tezos URL helper', 'export function trackedTezosUrl', share],
    ['stable share campaign', "const SHARE_UTM_CAMPAIGN = 'tezos_systems_shares'", share],
    ['X share source', "return { source: 'x', medium: 'social' }", share],
    ['native share source', "return { source: 'native_share', medium: 'share' }", share],
    ['visible canonical share URL', 'addPreferredShareUrlToText', share],
    ['share text tracking rewrite', 'addShareTrackingToText', share],
    ['preferred canonical share URL', 'preferredUrl || core', share],
    ['share modal event tracking', "trackShareEvent('modal_opened'", share],
    ['native share tracked URL', "'native_share'", share],
    ['X post event tracking', "trackShareEvent('post_x'", share],
    ['editable share tweet composer', 'tweet-compose-text', share],
    ['share handle storage', 'tezos-systems-share-handle', share],
    ['Network Moments share capture helper', 'captureNetworkMomentShare', share],
    ['Network Moments use share modal pipeline', 'captureNetworkMomentShare(moment)', moments],
    ['history share deep link', 'tezos.systems/#history', share],
    ['history copy hidden during capture', 'copyBtn.style.display', share],
    ['GoatCounter event helper', 'trackTezosSystemsEvent', goatcounterInit],
    ['GoatCounter single pageview mode', 'window.goatcounter.no_onload = true', goatcounterInit],
    ['GoatCounter bounded readiness retry', 'flushAttempts >= 40', goatcounterInit]
  ];
  for (const [label, snippet, text] of shareTrackingContracts) {
    if (!text.includes(snippet)) fail(`missing share/tracking contract: ${label}`);
  }
  pass(`share and loop tracking contracts checked: ${shareTrackingContracts.length}`);

  const goatcounterEndpoint = 'data-goatcounter="https://tezsys.goatcounter.com/count"';
  const widgetBuilder = await readText('widgets/builder.html');
  if (!index.includes(goatcounterEndpoint)) fail('dashboard must configure the GoatCounter collection endpoint');
  if (index.indexOf('js/core/goatcounter-init.js') > index.indexOf('src="//gc.zgo.at/count.js"')) {
    fail('dashboard must initialize GoatCounter settings before loading count.js');
  }
  if (!widgetBuilder.includes(goatcounterEndpoint)) fail('widget builder must configure the GoatCounter collection endpoint');
  if (widgetBuilder.indexOf('../js/core/goatcounter-init.js') > widgetBuilder.indexOf('src="//gc.zgo.at/count.js"')) {
    fail('widget builder must initialize GoatCounter settings before loading count.js');
  }
  pass('GoatCounter endpoint and single-pageview initialization checked');

  const rawWidgetLinks = [
    'href="/widgets/price.html"',
    'href="/widgets/baker-card.html"',
    'href="/widgets/staking-ratio.html"',
    'href="/widgets/governance.html"',
    'href="/widgets/combo.html"'
  ];
  for (const rawLink of rawWidgetLinks) {
    if (index.includes(rawLink)) fail(`dashboard should not link directly to raw widget endpoint: ${rawLink}`);
  }
  pass('dashboard widget utility avoids raw widget endpoint links');
}

async function checkUxAuditContracts() {
  const index = await readText('index.html');
  const api = await readText('js/core/api.js');
  const app = await readText('js/core/app.js');
  const storage = await readText('js/core/storage.js');
  const calculator = await readText('js/features/calculator.js');
  const stateOfTezos = await readText('js/features/state-of-tezos.js');
  const tooltipTour = await readText('js/features/tooltip-tour.js');
  const styles = await readText('css/styles.css');
  const heroSearchCss = await readText('css/hero-search.css');
  const shellExtrasCss = await readText('css/shell-extras.css');
  const historyCss = await readText('css/history-chamber.css');
  const siteMapCss = await readText('css/site-map.css');
  const siteHandoff = await readText('js/core/site-handoff.js');
  const landingCss = await readText('css/landing.css');
  const siteNav = await readText('js/landing/site-nav.js');
  const liveData = await readText('js/landing/live-data.js');
  const henCss = await readText('css/hen-mode.css');
  const henPage = await readText('hen/index.html');
  const tezosCrp = await readText('js/features/tezoscrp.js');
  const changelog = await readText('js/features/changelog.js');
  const skipPages = [
    ['index.html', index],
    ['landing.html', await readText('landing.html')],
    ['staking/index.html', await readText('staking/index.html')],
    ['governance/index.html', await readText('governance/index.html')],
    ['bakers/index.html', await readText('bakers/index.html')],
    ['compare/index.html', await readText('compare/index.html')],
    ['hen/index.html', henPage],
    ['404.html', await readText('404.html')]
  ];

  for (const [file, html] of skipPages) {
    if (!html.includes('class="skip-link" href="#main-content"') || !html.includes('id="main-content"')) {
      fail(`${file} must expose a skip-to-content target`);
    }
  }
  for (const route of CHAMBER_ROUTES) {
    const html = await readText(`${route.slug}/index.html`);
    if (!html.includes('class="skip-link" href="#main-content"') || !html.includes('id="main-content"')) {
      fail(`${route.slug}/index.html must inherit the dashboard skip-to-content contract`);
    }
  }
  for (const file of ['compare/tezos-vs-ethereum.html', 'compare/tezos-vs-solana.html', 'compare/tezos-vs-cardano.html', 'compare/tezos-vs-algorand.html']) {
    const html = await readText(file);
    if (!html.includes('class="skip-link" href="#main-content"') || !html.includes('id="main-content"')) {
      fail(`${file} must inherit the comparison skip-to-content contract`);
    }
  }
  if (!siteMapCss.includes('.skip-link')
    || !siteMapCss.includes('button:not([disabled])')
    || !siteMapCss.includes('[tabindex]:not([tabindex="-1"])):focus-visible')) {
    fail('shared site-map CSS must provide skip-link and broad focus-visible coverage');
  }

  for (const [, html] of skipPages.filter(([file]) => /^(staking|governance|bakers)\//.test(file))) {
    if (!html.includes('class="landing-nav-menu"') || !html.includes('class="landing-nav-toggle"')) {
      fail('guide pages must retain a no-JS native mobile navigation disclosure');
    }
  }
  if (!siteNav.includes('<details class="landing-nav-menu" open>')
    || !siteNav.includes('<summary class="landing-nav-toggle">')
    || !siteNav.includes("window.matchMedia('(max-width: 640px)')")
    || !landingCss.includes('.landing-nav-menu:not([open]) > .landing-nav-links')) {
    fail('shared guide navigation must render and style the mobile Explore disclosure');
  }

  if (!liveData.includes("inject('voting-time-left', 'Still syncing')")
    || liveData.includes("inject('voting-time-left', 'RSS ready')")) {
    fail('governance retry copy must remain coherent with the Time Remaining label');
  }

  const staticDialogs = [...index.matchAll(/<div class="modal-overlay[^"]*" id="([^"]+)"[^>]*>\s*<div class="[^"]*\bmodal-content\b[^"]*"([^>]*)>/g)];
  if (staticDialogs.length < 17) fail(`expected at least 17 static modal dialogs, found ${staticDialogs.length}`);
  for (const [, modalId, attributes] of staticDialogs) {
    const labelId = attributes.match(/aria-labelledby="([^"]+)"/)?.[1] || '';
    if (!/role="dialog"/.test(attributes)
      || !/aria-modal="true"/.test(attributes)
      || !/tabindex="-1"/.test(attributes)
      || !labelId
      || !index.includes(`id="${labelId}"`)) {
      fail(`#${modalId} must ship complete static dialog semantics and an existing label`);
    }
  }
  if (!/class="changelog-modal-content"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="changelog-modal-title"/.test(index)) {
    fail('Changelog must ship complete static dialog semantics');
  }

  for (const label of ['source', 'price ꜩ', 'edition', 'sort']) {
    if (!index.includes(`>${label}</span>`) || !henPage.includes(`>${label}</span>`)) {
      fail(`dashboard and standalone HEN filters must expose the visible ${label} group label`);
    }
  }
  if (!henCss.includes('.hen-filter-group-label')) fail('HEN visible filter group labels must be styled');
  if (!index.includes('<a href="/landing.html">Start here</a>') || !siteNav.includes('<a href="/landing.html">Start here</a>')) {
    fail('dashboard and standalone footers must expose the non-forced Start here route');
  }
  for (const href of ['/favicon.svg', '/favicon-48.png', '/favicon-32.png', '/favicon-16.png', '/apple-touch-icon.png', '/safari-pinned-tab.svg', '/site.webmanifest']) {
    if (!index.includes(`href="${href}"`)) fail(`root shell asset must survive history route rewrites: ${href}`);
  }
  if (!index.includes('id="drawer-address-status"') || !index.includes('id="hero-chain-uptime-finality">—</strong>')) {
    fail('My Tezos validation and finality must ship honest visible initial states');
  }
  if (api.includes('X-Tezos-Systems-Observed-At') || api.includes("response.headers.get('X-Tezos-Systems-Cache')")) {
    fail('api.js must not keep dead service-worker stale-response readers');
  }
  if (!storage.includes("stats?._quality?.status !== 'live'")) {
    fail('partial or unavailable aggregate stats must not replace the last good storage cache');
  }
  if (!stateOfTezos.includes("sessionStorage.getItem('tezos_price_cache')") || stateOfTezos.includes('tezos-systems-price-cache')) {
    fail('State of Tezos must use the actual shared XTZ price cache schema');
  }
  if (calculator.includes('486.7') || !calculator.includes('HOURS_PER_YEAR / cycleHours')) {
    fail('calculator compounding cadence must derive from protocol cycle timing');
  }
  if (!app.includes("document.addEventListener('visibilitychange', pollBlockWhenVisible)") || !tooltipTour.includes('.visit-streak-toast.visible')) {
    fail('RPC polling and first-visit surfaces must respect document visibility and toast occupancy');
  }
  if (!index.includes('<script defer src="js/features/hen-mode.js?v=95"></script>')
    || !index.includes('<link rel="stylesheet" href="css/hen-mode.css?v=98">')) {
    fail('HEN JavaScript may defer, but its first-paint overlay stylesheet must remain eager');
  }
  if (!index.includes('id="portfolio-import-file" type="file" accept="application/json,.json" aria-label="Import My Tezos portfolio JSON file"')
    || !index.includes('id="hen-cli-input" class="hen-cli-input" type="text" aria-label="HEN command input"')) {
    fail('file import and HEN command inputs must retain explicit accessible names');
  }
  if ((tezosCrp.match(/loading="lazy" decoding="async"/g) || []).length < 3) {
    fail('TezosCRP category icon templates must defer off-screen loading and decoding');
  }
  if (!tooltipTour.includes("document.getElementById('hero-slot')")
    || !tooltipTour.includes("document.getElementById('hero-search-form')")
    || !tooltipTour.includes("host.insertBefore(nudge, host.querySelector('.hero-search-submit'))")
    || !tooltipTour.includes("window.addEventListener('hot-signal-rendered', keepNudgeInSearchRail)")
    || !/\(heroSlot \|\| document\.getElementById\('live-head'\) \|\| document\.body\)\.appendChild\(nudge\)/.test(tooltipTour)
    || !/\.tour-nudge\s*\{[\s\S]*?position:\s*static[\s\S]*?flex:\s*0 0 auto[\s\S]*?display:\s*inline-flex/.test(styles)
    || !heroSearchCss.includes('.live-head-panel .hero-search-form > .tour-nudge')) {
    fail('first-visit guidance must stay compact without reviving an idle search-chip rail');
  }
  if (!/\.site-map-shell \.site-map-sublink\s*\{[\s\S]*?min-height:\s*24px/.test(siteMapCss)
    || !/\.site-map-shell \.site-map-links \.site-map-link\s*\{[\s\S]*?min-height:\s*24px/.test(siteMapCss)
    || !/\.price-link\s*\{[\s\S]*?min-height:\s*24px/.test(styles)
    || !/\.cycle-chip\s*\{[\s\S]*?min-height:\s*24px/.test(styles)
    || !/\.chamber-expand-cue\s*\{[\s\S]*?height:\s*24px/.test(styles)
    || !/\.hero-search-chip\s*\{[\s\S]*?min-height:\s*24px/.test(heroSearchCss)
    || !/\.hot-today-clock\s*\{[\s\S]*?min-height:\s*24px/.test(shellExtrasCss)
    || !/\.cycle-history-entry-route\s*\{[\s\S]*?min-height:\s*24px/.test(historyCss)) {
    fail('compact actionable header, launcher, history, and directory targets must retain a 24px minimum height');
  }
  if (await pathExists('js/features/objkt-ui.js')) fail('orphaned OBJKT UI module must stay retired');
  if (!changelog.includes('Keyboard visitors now get a sitewide skip link')) {
    fail('changelog must disclose the July UI/UX audit implementation');
  }

  pass('July UI/UX audit quick-win contracts checked');
}

async function checkWidgetRuntimeContracts() {
  const runtimeSource = await readText('widgets/runtime.js');
  const builder = await readText('widgets/builder.html');
  const sw = await readText('sw.js');
  const config = await readText('js/core/config.js');
  const htmlFiles = await walk('widgets', (file) => file.endsWith('.html'));
  const rawWidgetFiles = htmlFiles.filter((file) => file !== 'widgets/builder.html');
  const catalog = Array.from(runtimeSource.matchAll(/type:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'/g))
    .map((match) => ({ type: match[1], path: match[2] }));
  const catalogPaths = new Set(catalog.map((widget) => `widgets/${widget.path}`));
  const comboStatKeys = Array.from(runtimeSource.matchAll(/key:\s*'([^']+)'/g)).map((match) => match[1]);

  if (!runtimeSource.includes("import '../js/core/tzkt-throttle.js';")) {
    fail('widgets/runtime.js must install the shared TzKT throttle');
  }
  if (!runtimeSource.includes("import { fetchWithRetry } from '../js/core/api.js';")) {
    fail('widgets/runtime.js must reuse the shared fetchWithRetry helper');
  }
  if (!runtimeSource.includes("import { API_URLS, FETCH_LIMITS, STAKING_TARGET } from '../js/core/config.js';")) {
    fail('widgets/runtime.js must read endpoint/fetch/staking constants from js/core/config.js');
  }
  if (!runtimeSource.includes("import { DEFAULT_THEME, THEME_COLORS, THEMES } from '../js/ui/theme.js';")) {
    fail('widgets/runtime.js must share dashboard theme metadata from js/ui/theme.js');
  }
  if (!config.includes("coingecko: 'https://api.coingecko.com/api/v3'")) {
    fail('js/core/config.js must expose the CoinGecko API base for widgets and price surfaces');
  }

  if (!runtimeSource.includes('export const DEFAULT_WIDGET_THEME = DEFAULT_THEME')) {
    fail('widget default theme should follow dashboard DEFAULT_THEME');
  }
  for (const snippet of ["WIDGET_THEME_ORDER = [...THEMES, 'transparent']", 'transparent: { bg:']) {
    if (!runtimeSource.includes(snippet)) fail(`widget theme runtime missing ${snippet}`);
  }
  for (const snippet of [
    'WIDGET_UTM_CAMPAIGN',
    'export function trackedDashboardUrl',
    "params.set('utm_medium', 'widget')",
    'widget_attribution',
    'export function markdownCode'
  ]) {
    if (!runtimeSource.includes(snippet)) fail(`widget attribution runtime missing ${snippet}`);
  }
  for (const key of ['health', 'tz4']) {
    if (!comboStatKeys.includes(key)) {
      fail(`combo widget options missing latest signal: ${key}`);
    }
  }

  for (const file of rawWidgetFiles) {
    const text = await readText(file);
    if (!catalogPaths.has(file)) fail(`widgets/runtime.js catalog missing raw widget page ${file}`);
    if (!text.includes("from './runtime.js'")) fail(`${file} must import widgets/runtime.js`);
    if (/https:\/\/api\.tzkt\.io\/v1|https:\/\/api\.coingecko\.com\/api\/v3/.test(text)) {
      fail(`${file} must not hardcode TzKT/CoinGecko API hosts; use widgets/runtime.js`);
    }
    if (text.includes("const THEMES") || text.includes('THEME_NAMES')) {
      fail(`${file} must not maintain a private theme list`);
    }
    if (!text.includes('utm_medium=widget_attribution')) {
      fail(`${file} footer must link back with widget attribution params`);
    }
    if (!text.includes('powered by tezos.systems ->')) {
      fail(`${file} footer must visibly credit tezos.systems`);
    }
    if (text.includes('gc.zgo.at') || text.includes('../js/core/goatcounter-init.js')) {
      fail(`${file} must not load third-party analytics inside an embedding site`);
    }
  }

  for (const widget of catalog) {
    const file = `widgets/${widget.path}`;
    if (!(await pathExists(file))) fail(`widgets/runtime.js catalog points at missing widget ${file}`);
  }
  if (catalog.length !== rawWidgetFiles.length) {
    fail(`widgets/runtime.js catalog count ${catalog.length} must match raw widget pages ${rawWidgetFiles.length}`);
  }

  for (const snippet of ['WIDGET_CATALOG', 'WIDGET_THEME_ORDER', 'COMBO_STAT_OPTIONS', "from './runtime.js'"]) {
    if (!builder.includes(snippet)) fail(`widgets/builder.html must derive ${snippet} from widgets/runtime.js`);
  }
  if (!builder.includes('max="3600"')) {
    fail('widgets/builder.html refresh slider must support the runtime one-hour upper bound');
  }
  if (!builder.includes('widget_builder_copy')) {
    fail('widgets/builder.html must track embed-code copy events');
  }
  if (!runtimeSource.includes('activeBakerCount()') || !runtimeSource.includes('/delegates/count?active=true&bakingPower.gt=0')) {
    fail('baker-count widgets must use the TzKT aggregate count endpoint');
  }
  if (!runtimeSource.includes('document.hidden') || !runtimeSource.includes("document.addEventListener('visibilitychange'")) {
    fail('widget refresh loops must pause while their document is hidden');
  }
  if (!runtimeSource.includes("directUrl.searchParams.set('utm_medium', 'widget_markdown')")
      || !/return `\[Open the Tezos \$\{type\} widget\]\(\$\{directUrl\.toString\(\)\}\)`/.test(runtimeSource)) {
    fail('Markdown widget output must be a directly attributed working link, not image syntax pointed at HTML');
  }

  if (!sw.includes('RUNTIME_CACHE_LIMIT') || !sw.includes('putBounded(RUNTIME_CACHE')) {
    fail('sw.js must cache optional widgets and feature assets on use in a bounded runtime cache');
  }
  for (const file of ['widgets/runtime.js', ...htmlFiles]) {
    if (sw.includes(`'/${file}'`) || sw.includes(`"/${file}"`)) {
      fail(`sw.js install shell must not eagerly precache optional widget asset /${file}`);
    }
  }

  pass(`widget runtime contracts checked: ${catalog.length} widgets, ${comboStatKeys.length} combo stat options`);
}

async function checkMainnetLaunchCopy() {
  const config = await readText('js/core/config.js');
  const mainnet = await readText('js/core/mainnet.mjs');
  if (!mainnet.includes("MAINNET_LAUNCH = '2018-06-30T17:39:57Z'")) {
    fail('js/core/mainnet.mjs must keep MAINNET_LAUNCH at the Mainnet Block 1 timestamp');
  }
  if (!config.includes("export { MAINNET_LAUNCH } from './mainnet.mjs';")) {
    fail('js/core/config.js must re-export the shared MAINNET_LAUNCH timestamp');
  }

  const userFacingFiles = [
    'index.html',
    '.well-known/ai-plugin.json',
    'data/tweets.json',
    'README.md',
    'js/core/app.js',
    'js/features/state-of-tezos.js',
    'js/landing/live-data.js'
  ];
  const stalePatterns = [
    /September 17, 2018/i,
    /September 17 UTC/i,
    /Sep 17, 2018/i,
    /2018-09-17T00:00:00Z/i,
    /temporalCoverage["']?\s*:\s*["']2018-09-17\/\.\./i,
    /refreshed every 2 minutes/i
  ];

  for (const file of userFacingFiles) {
    const text = await readText(file);
    for (const pattern of stalePatterns) {
      if (pattern.test(text)) {
        fail(`${file} contains stale September 2018 mainnet launch wording (${pattern})`);
      }
    }
  }

  const index = await readText('index.html');
  if (!index.includes('June 30, 2018') || !index.includes('"temporalCoverage": "2018-06-30/.."')) {
    fail('index.html should expose the Mainnet Block 1 calendar date in copy and temporal coverage');
  }

  const aiPlugin = await readText('.well-known/ai-plugin.json');
  if (!aiPlugin.includes('June 30, 2018')) {
    fail('.well-known/ai-plugin.json must use the Mainnet Block 1 calendar date');
  }
  if (!aiPlugin.includes('visible freshness markers')) {
    fail('.well-known/ai-plugin.json must describe freshness without stale two-minute claims');
  }
  const aiPluginJson = JSON.parse(aiPlugin);
  const openApi = JSON.parse(await readText('.well-known/openapi.json'));
  const securityTxt = await readText('.well-known/security.txt');
  if (aiPluginJson?.api?.url !== 'https://tezos.systems/.well-known/openapi.json' || !openApi.openapi || !openApi.paths?.['/version.json']) {
    fail('AI plugin metadata must point to the site-owned OpenAPI document');
  }
  if (!/Contact: mailto:support@tez\.capital/.test(securityTxt) || !/Canonical: https:\/\/tezos\.systems\/\.well-known\/security\.txt/.test(securityTxt)) {
    fail('security.txt must expose canonical private reporting contacts');
  }

  const anniversary = await readText('js/core/anniversary.js');
  const app = await readText('js/core/app.js');
  if (!anniversary.includes('getCalendarElapsedTime') || !app.includes('getCalendarElapsedTime(now)')) {
    fail('mainnet age and anniversary pulse must share the UTC calendar elapsed-time helper');
  }
  if (/function tickUptime\(\)[\s\S]*?365\.25[\s\S]*?function tickBlockAge/.test(app)) {
    fail('the live mainnet-age clock must not use fixed 365.25-day year arithmetic');
  }

  pass('mainnet launch copy and calendar clock use Mainnet Block 1 on June 30, 2018');
}

function openApiPathPattern(dataPath) {
  const escaped = dataPath
    .replace(/^\//, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{seasonId\\\}/g, '[^/]+')
    .replace(/\\\{shard\\\}/g, '[0-9a-f]{2}');
  return new RegExp(`^${escaped}$`);
}

async function checkPublicDataDiscoveryContracts() {
  const pagesConfig = await readText('_config.yml');
  const openApi = JSON.parse(await readText('.well-known/openapi.json'));
  const aiPlugin = JSON.parse(await readText('.well-known/ai-plugin.json'));
  const maxisManifest = JSON.parse(await readText('data/maxis/manifest.json'));
  const llms = await readText('llms.txt');
  const sitemap = await readText('sitemap.xml');
  const generator = await readText('scripts/generate-llms-txt.mjs');
  const orchestrator = await readText('scripts/refresh-generated-surfaces.mjs');
  const dataFiles = await walk('data', (file) => file.endsWith('.json'));
  const publicPathPatterns = [];
  const operationIds = new Set();
  const resolveLocalRef = (ref) => {
    if (!String(ref || '').startsWith('#/')) return undefined;
    return ref.slice(2).split('/').reduce((value, part) => value?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], openApi);
  };
  const inspectRefs = (value) => {
    if (Array.isArray(value)) {
      value.forEach(inspectRefs);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if ('$ref' in value && (!String(value.$ref).startsWith('#/') || resolveLocalRef(value.$ref) === undefined)) {
      fail(`OpenAPI catalogue has an unresolved or non-local reference: ${value.$ref}`);
    }
    Object.values(value).forEach(inspectRefs);
  };

  inspectRefs(openApi);
  if (openApi.openapi !== '3.0.3'
    || openApi.servers?.[0]?.url !== 'https://tezos.systems') {
    fail('OpenAPI public data catalogue must be a site-owned OpenAPI 3.0 document');
  }
  if (!/^include:\s*\n\s*-\s*\.well-known\s*$/m.test(pagesConfig)) {
    fail('GitHub Pages Jekyll config must include the public .well-known directory');
  }

  const passportShardParameter = openApi.components?.parameters?.PassportShard;
  const passportSharding = maxisManifest.passportSharding;
  const passportShardCount = Number(passportSharding?.shardCount);
  if (!Number.isInteger(passportShardCount) || passportShardCount < 1 || passportShardCount > 256) {
    fail(`Maxis manifest Passport shard count must be an integer from 1 to 256, saw ${passportSharding?.shardCount}`);
  } else {
    const expectedPassportShards = Array.from(
      { length: passportShardCount },
      (_, index) => index.toString(16).padStart(2, '0')
    );
    const passportShardRange = `${expectedPassportShards[0]}..${expectedPassportShards.at(-1)}`;
    const manifestOutput = String(passportSharding?.output || '');
    const parameterDescription = String(passportShardParameter?.description || '');
    const parameterPatternSource = String(passportShardParameter?.schema?.pattern || '');
    let passportShardPattern = null;
    try {
      passportShardPattern = new RegExp(parameterPatternSource);
    } catch {
      fail(`OpenAPI PassportShard pattern is invalid: ${parameterPatternSource}`);
    }
    if (!manifestOutput.includes(passportShardRange)) {
      fail(`Maxis manifest Passport shard output must disclose its derived ${passportShardRange} range`);
    }
    if (!parameterDescription.includes(String(passportShardCount))
      || !parameterDescription.includes(passportShardRange)) {
      fail(`OpenAPI PassportShard description must disclose the manifest's ${passportShardCount}-shard ${passportShardRange} range`);
    }
    if (passportShardPattern) {
      const documentedPassportShards = Array.from(
        { length: 256 },
        (_, index) => index.toString(16).padStart(2, '0')
      ).filter((shard) => passportShardPattern.test(shard));
      assert.deepEqual(
        documentedPassportShards,
        expectedPassportShards,
        'OpenAPI PassportShard pattern must match exactly the manifest-derived shard range'
      );
      const invalidPassportShardExamples = ['', '0', '000', '0A', '3F', '40', 'ff', 'gg', ' 00', '00 '];
      if (!parameterPatternSource.startsWith('^')
        || !parameterPatternSource.endsWith('$')
        || invalidPassportShardExamples.some((shard) => passportShardPattern.test(shard))) {
        fail('OpenAPI PassportShard pattern must reject values outside the exact two-character lowercase manifest range');
      }
    }
    for (const season of maxisManifest.seasons || []) {
      assert.deepEqual(
        season.availableShards,
        expectedPassportShards,
        `${season.id} availableShards must match the manifest Passport sharding contract`
      );
    }
  }

  for (const [publicPath, pathItem] of Object.entries(openApi.paths || {})) {
    const operation = pathItem.get;
    if (!operation) continue;
    if (!operation.operationId || operationIds.has(operation.operationId)) {
      fail(`OpenAPI public data operation ${publicPath} has a missing or duplicate operationId`);
    }
    operationIds.add(operation.operationId);
    if (!operation.responses?.['200'] || operation.requestBody) {
      fail(`OpenAPI public data operation ${publicPath} must be read-only with a documented 200 response`);
    }
    const declaredParameters = [...(pathItem.parameters || []), ...(operation.parameters || [])]
      .map((parameter) => parameter?.$ref ? resolveLocalRef(parameter.$ref) : parameter)
      .filter(Boolean);
    const templateParameters = Array.from(publicPath.matchAll(/\{([^}]+)\}/g), (match) => match[1]).sort();
    const documentedPathParameters = declaredParameters
      .filter((parameter) => parameter.in === 'path' && parameter.required === true)
      .map((parameter) => parameter.name)
      .sort();
    if (JSON.stringify(templateParameters) !== JSON.stringify(documentedPathParameters)) {
      fail(`OpenAPI path parameters do not match ${publicPath}: ${documentedPathParameters.join(', ')}`);
    }
    for (const field of ['summary', 'description', 'x-refresh-cadence', 'x-license-boundary']) {
      if (!String(operation[field] || '').trim()) {
        fail(`OpenAPI public data operation ${publicPath} is missing ${field}`);
      }
    }
    if (publicPath.startsWith('/data/')) {
      const pattern = openApiPathPattern(publicPath);
      publicPathPatterns.push(pattern);
      if (!dataFiles.some((file) => pattern.test(file))) {
        fail(`OpenAPI public data path family has no matching artifact: ${publicPath}`);
      }
    }
  }

  const internalArtifactPatterns = [
    /^data\/maxis-contracts\.json$/,
    /^data\/maxis\/seasons\/[^/]+\/transaction-state(?:\.building)?\.json$/,
    /^data\/tezoscrp-identity-aliases\.json$/,
    /^data\/tweets\.json$/
  ];
  for (const file of dataFiles) {
    if (!publicPathPatterns.some((pattern) => pattern.test(file))
      && !internalArtifactPatterns.some((pattern) => pattern.test(file))) {
      fail(`tracked data artifact is neither catalogued nor explicitly internal: ${file}`);
    }
  }

  const sitemapUrls = Array.from(sitemap.matchAll(/<loc>(https:\/\/tezos\.systems\/[^<]*)<\/loc>/g), (match) => match[1]).sort();
  const destinationBlock = llms.split('## Canonical destinations\n\n')[1]?.split('\n\n## Public JSON data')[0] || '';
  const llmsDestinationUrls = Array.from(destinationBlock.matchAll(/\]\((https:\/\/tezos\.systems\/[^)]*)\)/g), (match) => match[1]).sort();
  assert.deepEqual(llmsDestinationUrls, sitemapUrls, 'llms.txt canonical destinations must match sitemap.xml exactly');

  for (const [publicPath, pathItem] of Object.entries(openApi.paths || {})) {
    const summary = pathItem.get?.summary;
    const expectedSummary = publicPath.includes('{')
      ? `${summary} — path template: \`${publicPath}\``
      : `[${summary}](`;
    if (summary && !llms.includes(expectedSummary)) {
      fail(`llms.txt is missing OpenAPI dataset summary: ${summary}`);
    }
  }
  assert.equal(llms, await renderLlmsTxt(), 'llms.txt must match its canonical generator byte-for-byte');
  if (/%7B|%7D/.test(llms)) fail('llms.txt must not publish encoded path-template placeholders as broken links');
  if (!generator.includes("js/core/site-map.js") || !generator.includes(".well-known', 'openapi.json")) {
    fail('llms.txt generator must derive from the canonical site map and OpenAPI catalogue');
  }
  if (!orchestrator.includes("nodeScript('scripts/generate-llms-txt.mjs')") || !orchestrator.includes("const LLMS_TARGETS = ['llms.txt']")) {
    fail('generated-surface orchestration must refresh and track llms.txt');
  }
  if (!aiPlugin.description_for_model.includes('/llms.txt')
    || !aiPlugin.description_for_model.includes('OpenAPI document catalogues intentionally public JSON artifacts')) {
    fail('AI plugin metadata must direct models to the complete public data catalogue and llms.txt');
  }

  pass(`public data discovery covers ${dataFiles.length} JSON artifacts across ${publicPathPatterns.length} public path families and explicit internal families`);
}

async function checkInitialLoadMeasurementContracts() {
  const measurement = await readText('scripts/measure-initial-load.mjs');
  const baseline = JSON.parse(await readText('tests/fixtures/initial-load-baseline.json'));
  const packageJson = JSON.parse(await readText('package.json'));
  const requiredMeasurementContracts = [
    "require('./lib/playwright-browser.cjs')",
    "serviceWorkers: options.mode === 'installed-worker' ? 'allow' : 'block'",
    "document.visibilityState",
    "type: 'layout-shift'",
    "type: 'longtask'",
    'eagerJsDecodedBytes',
    'sameOriginDecodedBytes',
    'domInteractiveMs',
    'domContentLoadedMs',
    'longestTaskMs',
    'totalBlockingTimeMs',
    'serviceWorkerResponseCount',
    'readiness',
    'deferredChamberResources',
    'deferredChamberStylePaths',
    'forbiddenHeavyResources',
    "page.on('pageerror'",
    'decodedBytesWithinFivePct',
    'rawLongTasksWithinFifteenPct',
    'totalBlockingTimeMaxAdjacentDeltaPct',
    'totalBlockingTimeWithinFifteenPct',
    'warmupRuns',
    'warmupDiagnostics',
    '--warmup-runs',
    '--require-stable',
    'stability acceptance failed'
  ];
  for (const contract of requiredMeasurementContracts) {
    if (!measurement.includes(contract)) fail(`initial-load measurement harness is missing contract: ${contract}`);
  }
  if (packageJson.scripts?.['measure:load'] !== 'node scripts/measure-initial-load.mjs') {
    fail('package scripts must expose the repeatable initial-load measurement harness');
  }
  if (packageJson.scripts?.['measure:load:stable'] !== 'node scripts/measure-initial-load.mjs --require-stable') {
    fail('package scripts must expose the threshold-enforcing initial-load measurement mode');
  }
  if (baseline.schemaVersion !== 1
    || !/^[0-9a-f]{40}$/.test(baseline.commit || '')
    || baseline.profile?.serviceWorkers !== 'blocked'
    || baseline.profile?.runs !== 5
    || baseline.medians?.sameOriginDecodedBytes < 1_000_000
    || typeof baseline.stability?.decodedBytesWithinFivePct !== 'boolean'
    || typeof baseline.stability?.longTasksWithinFifteenPct !== 'boolean'
    || !Array.isArray(baseline.largestResources)
    || baseline.largestResources.length < 20
    || baseline.largestResources.some((resource) => !Number.isFinite(resource.medianDecodedBytes) || resource.observedRuns !== 5)) {
    fail('initial-load baseline must retain the dated five-run clean-profile reference row');
  }

  pass(`initial-load measurement harness and ${baseline.measuredAt.slice(0, 10)} baseline checked`);
}

async function checkChamberEfficiencyContracts() {
  const app = await readText('js/core/app.js');
  const index = await readText('index.html');
  const chamberStyles = await readText('js/ui/chamber-styles.js');
  const chamberAccessibility = await readText('js/ui/chamber-accessibility.js');
  const marketRoomStyles = await readText('css/market-room.css');
  const shellExtras = await readText('css/shell-extras.css');
  const historyChamberStyles = await readText('css/history-chamber.css');
  const stakingChamberStyles = await readText('css/staking-chamber.css');
  const mainStyles = await readText('css/styles.css');
  const networkPulseStyles = await readText('css/network-pulse.css');
  const dataAssets = await readText('js/core/data-assets.js');
  const dailyBriefing = await readText('js/features/daily-briefing.js');
  const maxis = await readText('js/features/maxis.js');
  const smoke = await readText('tests/smoke.mjs');
  const sw = await readText('sw.js');
  const lazyModules = [
    'network-pulse.js', 'tezlink.js', 'capital-chamber.js', 'minerals-chamber.js',
    'uranium-chamber.js', 'metals-chamber.js', 'whale-chamber.js', 'staking-chamber.js',
    'ecosystem-chamber.js', 'tz4-adoption.js', 'chamber.js', 'etherlink-governance.js',
    'liquidity-baking.js', 'leaderboard.js', 'ledger-flow.js', 'tezos-domains.js', 'maxis.js',
    'tezoscrp.js', 'ctez.js'
  ];
  for (const moduleName of lazyModules) {
    const modulePath = `../features/${moduleName}`;
    if (!app.includes(`modulePath: '${modulePath}'`)) {
      fail(`lazy Chamber registry is missing ${modulePath}`);
    }
    if (new RegExp(`^import\\s+[\\s\\S]*?from\\s+['"]\\.\\./features/${moduleName.replace('.', '\\.') }['"];?`, 'm').test(app)) {
      fail(`app.js must not statically import lazy Chamber module ${moduleName}`);
    }
    if (index.includes(`modulepreload\" href=\"/js/features/${moduleName}`)
      || index.includes(`modulepreload\" href=\"js/features/${moduleName}`)) {
      fail(`index.html must not eagerly modulepreload ${moduleName}`);
    }
  }
  for (const statefulModule of ['leaderboard.js', 'whale-chamber.js']) {
    if (smoke.includes(`import('/js/features/${statefulModule}')`)) {
      fail(`browser smoke probes must import the loaded stamped ${statefulModule} URL instead of creating a second module instance`);
    }
  }
  for (const snippet of [
    'const _chamberModuleAttempts = new Map()',
    '_chamberModulePromises.delete(entryId)',
    'versionedAsset(new URL(config.modulePath, import.meta.url).pathname)',
    '&chamber-retry=${attempt}',
    '_chamberModuleAttempts.set(entryId, attempt + 1)',
    'let _chamberOpenEpoch = 0',
    'const openEpoch = _chamberOpenEpoch',
    'if (openEpoch !== _chamberOpenEpoch)',
    '_chamberOpenEpoch += 1',
    'isChamberOpenCancelled(error)',
    "hydrated?.querySelector?.('.chamber-expand-cue')",
    'focusTarget?.focus?.({ preventScroll: true })',
    'closeLoadedChamberFeatures()',
    "init: 'initCtezChamber'",
    'exclusiveLaunchers: true',
    'closeFeatureMenu: true',
    "'tezoscrp-modal': { entryIds: ['tezoscrp'], hashes: ['tezoscrp', 'community-rewards', 'crp'] }"
  ]) {
    if (!app.includes(snippet)) fail(`lazy Chamber runtime is missing contract: ${snippet}`);
  }

  const focusHydrationStart = app.indexOf('function initStaticChamberEntry(entryId, initializer)');
  const moduleLoadStart = app.indexOf('function loadChamberFeature(entryId', focusHydrationStart);
  const moduleLoadEnd = app.indexOf('\nfunction callLoadedChamberFeature(', moduleLoadStart);
  const focusHydrationSource = app.slice(focusHydrationStart, moduleLoadStart);
  const moduleLoadSource = app.slice(moduleLoadStart, moduleLoadEnd);
  if (focusHydrationStart < 0
    || moduleLoadStart < 0
    || !focusHydrationSource.includes('document.activeElement === placeholder || placeholder.contains(document.activeElement)')
    || !focusHydrationSource.includes("hydrated?.querySelector?.('.chamber-expand-cue')")
    || !focusHydrationSource.includes('focusTarget?.focus?.({ preventScroll: true })')) {
    fail('focused static Chamber shells must transfer focus into the hydrated launcher without scrolling');
  }
  if (moduleLoadEnd < 0
    || !moduleLoadSource.includes('.catch((error) => {\n            _chamberModulePromises.delete(entryId);')
    || !moduleLoadSource.includes('_chamberModuleAttempts.set(entryId, attempt + 1);\n            throw error;')) {
    fail('failed lazy Chamber imports must evict their rejected promise and advance the cache-busting retry attempt');
  }
  for (const snippet of [
    'focusAfter.activeTagName === \'BUTTON\'',
    'focusAfter.activeTabIndex === 0',
    "await page.keyboard.press('Enter')",
    "const firstModuleFailureSettled = retryPage.waitForEvent('console'",
    "retryUrl.searchParams.get('chamber-retry') === '1'"
  ]) {
    if (!smoke.includes(snippet)) fail(`lazy Chamber focused browser regression is missing contract: ${snippet}`);
  }

  for (const snippet of [
    'const stylesheetPromises = new Map()',
    'if (existing?.sheet) return Promise.resolve(existing)',
    "link.addEventListener('load'",
    "link.addEventListener('error'",
    'stylesheetPromises.delete(id)',
    'link.remove()'
  ]) {
    if (!chamberStyles.includes(snippet)) fail(`shared Chamber stylesheet loader is missing contract: ${snippet}`);
  }
  for (const reservation of ['236px', '248px', '320px', '538px', '428px', '318px', '344px']) {
    if (!shellExtras.includes(`--chamber-entry-reserved-height: ${reservation}`)) {
      fail(`render-blocking Chamber shell is missing semantic reservation ${reservation}`);
    }
  }
  if (!shellExtras.includes('min-height: var(--chamber-entry-reserved-height)')
    || !mainStyles.includes('min-height: var(--chamber-entry-reserved-height)')
    || !networkPulseStyles.includes('#chambers-grid .network-pulse-entry-card.chamber-entry-wide { min-height: 538px; }')
    || !networkPulseStyles.includes('#chambers-grid .network-pulse-entry-card.chamber-entry-wide { min-height: 428px; }')
    || !mainStyles.includes('#chambers-grid .tezlink-entry-card.chamber-entry-wide {\n        min-height: 344px;')
    || !mainStyles.includes('#chambers-grid .health-entry-card.chamber-entry-wide {\n        min-height: 318px;')) {
    fail('render-blocking mobile Network shell floors must exactly match the hydrated Pulse, Health, and Tezos X floors');
  }
  for (const snippet of [
    'const WIDE_CHAMBER_DIALOG_SELECTOR',
    'dialog.dataset.roomSize = roomSize',
    "scrollContainer.classList.add('chamber-room-scroll')",
    "'tezos:chamber-dialog-active'",
    "'release-radar-overlay'",
    "'ctez-overlay'",
    'export function focusChamberTab(tab)',
    'tab.focus({ preventScroll: true })',
    'tablist.scrollLeft +='
  ]) {
    if (!chamberAccessibility.includes(snippet)) fail(`shared Chamber shell normalizer is missing contract: ${snippet}`);
  }
  for (const snippet of [
    '.market-room-shell',
    '.market-room-title.is-display',
    '.market-room-title.is-editorial',
    '.market-room-tabs',
    '.market-room-view-shell',
    '.market-room-core-stage figcaption',
    '.chamber-state-error'
  ]) {
    if (!marketRoomStyles.includes(snippet)) fail(`market-room component layer is missing contract: ${snippet}`);
  }
  if (!marketRoomStyles.includes('font-size: var(--type-room-title)')
    || !stakingChamberStyles.includes('font-size: var(--type-room-title)')
    || !historyChamberStyles.includes('font-size: var(--type-room-title)')) {
    fail('shared Chamber title scale must own market, Staking, and Cycle History room titles');
  }
  for (const snippet of [
    "window.addEventListener('wheel', markReaderScrollIntent, scrollIntentOptions)",
    "window.addEventListener('touchmove', markReaderScrollIntent, scrollIntentOptions)",
    'const maxRestoreFrames = 8',
    'if (restoreFrame < maxRestoreFrames) requestAnimationFrame(restoreBrowserShift)',
    'else clearScrollIntentListeners()',
    'const simulatedAnchoringShift = 369',
    'afterReaderScroll.restoreCallsAfterIntent === 0'
  ]) {
    if (!(app.includes(snippet) || smoke.includes(snippet))) {
      fail(`mobile Chamber disclosure scroll preservation is missing contract: ${snippet}`);
    }
  }
  const styleGatedModules = [
    ['capital-chamber.js', 'await ensureCapitalCss()'],
    ['ecosystem-chamber.js', 'await ensureEcosystemCss()'],
    ['history.js', 'await ensureCycleHistoryStyles()'],
    ['leaderboard.js', 'await ensureLeaderboardStyles()'],
    ['ledger-flow.js', 'await ensureLedgerFlowStyles()'],
    ['maxis.js', 'await ensureMaxisStyles()'],
    ['metals-chamber.js', 'await ensureMetalsCss()'],
    ['minerals-chamber.js', 'await ensureMineralsCss()'],
    ['network-health.js', 'await ensureNetworkHealthCss()'],
    ['network-pulse.js', 'await ensureNetworkPulseCss()'],
    ['staking-chamber.js', 'await ensureStakingStyles()'],
    ['tezos-domains.js', 'await ensureTezosDomainsStyles()'],
    ['tezoscrp.js', 'await ensureStyles()'],
    ['uranium-chamber.js', 'await ensureUraniumCss()'],
    ['whale-chamber.js', 'await ensureWhaleCss()']
  ];
  for (const [moduleName, awaitContract] of styleGatedModules) {
    const source = await readText(`js/features/${moduleName}`);
    if (!source.includes("from '../ui/chamber-styles.js'")) {
      fail(`${moduleName} must use the shared Chamber stylesheet loader`);
    }
    if (!source.includes(awaitContract)) {
      fail(`${moduleName} must await its stylesheet before activating the room`);
    }
  }
  for (const moduleName of ['capital-chamber.js', 'metals-chamber.js', 'minerals-chamber.js', 'uranium-chamber.js']) {
    const source = await readText(`js/features/${moduleName}`);
    for (const contract of ["versionedAsset('/css/market-room.min.css')", "ensureChamberStylesheet('market-room-css'", 'market-room-shell', 'market-room-header', 'market-room-tabs', 'market-room-view-shell', 'focusChamberTab(']) {
      if (!source.includes(contract)) fail(`${moduleName} is missing shared market-room contract: ${contract}`);
    }
  }
  for (const moduleName of [
    'network-pulse.js',
    'staking-chamber.js',
    'network-health.js',
    'maxis.js',
    'tezoscrp.js',
    'liquidity-baking.js',
    'chamber.js'
  ]) {
    const source = await readText(`js/features/${moduleName}`);
    if (!source.includes('activateChamberDialog(overlay') || !source.includes('deactivateChamberDialog(overlay')) {
      fail(`${moduleName} must use the shared Chamber dialog and shell lifecycle`);
    }
  }
  const marketRoomLegacyStyles = {
    capital: await readText('css/capital.css'),
    metals: await readText('css/metals-chamber.css'),
    minerals: await readText('css/minerals-chamber.css'),
    uranium: await readText('css/uranium-chamber.css')
  };
  const ruleBody = (source, selector) => source.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] || '';
  const ownsProperty = (body, property) => new RegExp(`(?:^|\\n)\\s*${property}\\s*:`, 'm').test(body);
  for (const [prefix, source] of Object.entries(marketRoomLegacyStyles)) {
    const content = ruleBody(source, `${prefix}-content`);
    const header = ruleBody(source, `${prefix}-header`);
    const title = ruleBody(source, `${prefix}-title-row h2`);
    const tab = ruleBody(source, `${prefix}-tab`);
    const coreStage = ruleBody(source, `${prefix}-core-stage`);
    for (const property of ['width', 'max-width', 'height', 'max-height', 'padding', 'overflow', 'border-radius']) {
      if (ownsProperty(content, property)) fail(`${prefix} room content must not override shared ${property} geometry`);
    }
    for (const property of ['position', 'z-index', 'top', 'padding', 'backdrop-filter']) {
      if (ownsProperty(header, property)) fail(`${prefix} room header must not override shared ${property} structure`);
    }
    if (ownsProperty(title, 'font') || ownsProperty(title, 'font-size')) {
      fail(`${prefix} room title must not override the shared title scale`);
    }
    for (const property of ['position', 'display', 'flex', 'padding', 'border', 'background', 'cursor']) {
      if (ownsProperty(tab, property)) fail(`${prefix} room tab must not override shared ${property} structure`);
    }
    for (const property of ['position', 'min-width', 'margin', 'overflow']) {
      if (ownsProperty(coreStage, property)) fail(`${prefix} room artwork frame must not override shared ${property} structure`);
    }
  }
  for (const stylesheet of ['css/metals-chamber.css', 'css/minerals-chamber.css', 'css/uranium-chamber.css']) {
    const source = await readText(stylesheet);
    if (source.includes('Space Grotesk')) fail(`${stylesheet} must not reference an unloaded Space Grotesk face`);
  }

  const freshnessModules = [
    ['capital-chamber.js', 'syncCapitalFreshness'],
    ['ecosystem-chamber.js', 'syncEcosystemFreshness'],
    ['minerals-chamber.js', 'syncMineralsFreshness'],
    ['metals-chamber.js', 'syncMetalsFreshness'],
    ['uranium-chamber.js', 'syncUraniumFreshness']
  ];
  for (const [moduleName, helper] of freshnessModules) {
    const source = await readText(`js/features/${moduleName}`);
    if (!source.includes(`function ${helper}(`) || !source.includes(`${helper}(`)) {
      fail(`${moduleName} must reconcile freshness when an unchanged summary hash crosses its stale threshold`);
    }
  }

  for (const snippet of [
    'const DATA_ASSET_CACHE_MODES',
    "protocolData: 'default'",
    "governanceVotes: 'no-cache'",
    "force ? 'reload'",
    'DATA_ASSET_CACHE_MODES[name]'
  ]) {
    if (!dataAssets.includes(snippet)) fail(`data asset cache policy is missing contract: ${snippet}`);
  }
  for (const dataPath of [
    '/data/capital-entry-summary.json', '/data/capital-snapshot.json',
    '/data/ecosystem-entry-summary.json', '/data/ecosystem-stats.json',
    '/data/minerals-entry-summary.json', '/data/minerals-snapshot.json',
    '/data/metals-entry-summary.json', '/data/metals-snapshot.json',
    '/data/uranium-entry-summary.json', '/data/uranium-snapshot.json',
    '/data/baker-governance-signals.json'
  ]) {
    if (!sw.includes(`'${dataPath}'`)) fail(`service worker network-only data inventory is missing ${dataPath}`);
  }
  if (!sw.includes('isNetworkOnlyDataPath(url.pathname)')) {
    fail('service worker must route generated mutable receipts through the network-only predicate');
  }
  if (!sw.includes('event.respondWith(generatedDataNetworkFirst(request, event))')
    || !sw.includes("fetchWithTimeout(request, API_NETWORK_TIMEOUT_MS, { cache: 'no-cache' })")) {
    fail('service worker generated receipts must conditionally revalidate without a Cache Storage fallback');
  }
  if (!sw.includes('event.respondWith(apiNetworkFirst(request, event))')
    || !sw.includes("fetchWithTimeout(request, API_NETWORK_TIMEOUT_MS, { cache: 'no-store' })")) {
    fail('service worker live API reads must remain network-only and bypass browser caching');
  }
  if (!sw.includes('self.navigator?.onLine === false') || !sw.includes('unavailableDataResponse()')) {
    fail('service worker network-only generated receipts must fail closed while the browser is explicitly offline');
  }
  if (!dailyBriefing.includes("fetch(MILESTONE_CATALOG_URL, { cache: 'no-cache'")) {
    fail('the mutable milestone catalog must conditionally revalidate instead of opting out of HTTP caching');
  }
  if (!maxis.includes("const response = await fetch(url, { cache: 'default', headers: { Accept: 'application/json' } });")) {
    fail('immutable, hash-verified Maxis Passport shards must use normal HTTP caching');
  }
  if (sw.includes('/passports\\/[0-9a-f]{2}\\.json$/.test(pathname)')) {
    fail('immutable Maxis Passport shards must not use the service worker network-only data branch');
  }

  pass(`lazy Chamber registry, stylesheet readiness, freshness reconciliation, and cache policy checked across ${lazyModules.length} deferred modules`);
}

async function checkLauncherProjectionContracts() {
  const [
    capitalProjectionText,
    capitalSourceText,
    ecosystemProjectionText,
    ecosystemSourceText,
    maxisProjectionText,
    bakerSignalsProjectionText,
    bakerCareersSourceText,
    governanceVotesSourceText,
    capitalGenerator,
    ecosystemGenerator,
    maxisGenerator,
    bakerSignalsGenerator,
    aggregateGenerator,
    capitalFeature,
    ecosystemFeature,
    maxisFeature,
    leaderboardFeature,
    measurement,
    packageText,
    orchestrator,
    readmeGuard,
    smoke
  ] = await Promise.all([
    readText('data/capital-entry-summary.json'),
    readText('data/capital-snapshot.json'),
    readText('data/ecosystem-entry-summary.json'),
    readText('data/ecosystem-stats.json'),
    readText('data/maxis/entry-summary.json'),
    readText('data/baker-governance-signals.json'),
    readText('data/maxis-careers.json'),
    readText('data/governance-votes.json'),
    readText('scripts/generate-capital-entry-summary.mjs'),
    readText('scripts/generate-ecosystem-entry-summary.mjs'),
    readText('scripts/generate-maxis-entry-summary.mjs'),
    readText('scripts/generate-baker-governance-signals.mjs'),
    readText('scripts/generate-launcher-projections.mjs'),
    readText('js/features/capital-chamber.js'),
    readText('js/features/ecosystem-chamber.js'),
    readText('js/features/maxis.js'),
    readText('js/features/leaderboard.js'),
    readText('scripts/measure-initial-load.mjs'),
    readText('package.json'),
    readText('scripts/refresh-generated-surfaces.mjs'),
    readText('scripts/guard-readme-sync.mjs'),
    readText('tests/smoke.mjs')
  ]);
  const capitalProjection = JSON.parse(capitalProjectionText);
  const capitalSource = JSON.parse(capitalSourceText);
  const ecosystemProjection = JSON.parse(ecosystemProjectionText);
  const ecosystemSource = JSON.parse(ecosystemSourceText);
  const maxisProjection = JSON.parse(maxisProjectionText);
  const bakerSignalsProjection = JSON.parse(bakerSignalsProjectionText);
  const packageJson = JSON.parse(packageText);

  if (Buffer.byteLength(capitalProjectionText) > 16 * 1024) {
    fail(`Capital launcher projection exceeds its 16 KiB budget: ${Buffer.byteLength(capitalProjectionText)} bytes`);
  }
  const { contentHash: capitalProjectionHash, ...capitalUnsigned } = capitalProjection;
  if (capitalProjection.schemaVersion !== 1
    || stableJsonHash(capitalUnsigned) !== capitalProjectionHash
    || capitalProjection.source?.path !== 'data/capital-snapshot.json'
    || capitalProjection.source?.generatedAt !== capitalSource.generatedAt
    || capitalProjection.source?.contentHash !== capitalSource.contentHash
    || capitalProjection.source?.fileSha256 !== createHash('sha256').update(capitalSourceText).digest('hex')) {
    fail('Capital launcher projection must match its stable payload and exact reviewed source receipt');
  }
  if (capitalProjection.markets?.xtz?.coin?.lastUpdated !== capitalSource.markets?.xtz?.coin?.lastUpdated
    || capitalProjection.markets?.xtz?.coin?.sourceStatus !== capitalSource.sources?.coingecko?.status) {
    fail('Capital launcher projection must carry the reviewed CoinGecko observation time and source status');
  }

  if (Buffer.byteLength(maxisProjectionText) > 24 * 1024) {
    fail(`Maxis launcher projection exceeds its 24 KiB budget: ${Buffer.byteLength(maxisProjectionText)} bytes`);
  }

  if (Buffer.byteLength(ecosystemProjectionText) > 16 * 1024) {
    fail(`Ecosystem launcher projection exceeds its 16 KiB budget: ${Buffer.byteLength(ecosystemProjectionText)} bytes`);
  }
  const { contentHash: ecosystemProjectionHash, ...ecosystemUnsigned } = ecosystemProjection;
  if (ecosystemProjection.schemaVersion !== 1
    || stableJsonHash(ecosystemUnsigned) !== ecosystemProjectionHash
    || ecosystemProjection.source?.path !== 'data/ecosystem-stats.json'
    || ecosystemProjection.source?.generatedAt !== ecosystemSource.generatedAt
    || ecosystemProjection.source?.contentHash !== ecosystemSource.contentHash
    || ecosystemProjection.source?.fileSha256 !== createHash('sha256').update(ecosystemSourceText).digest('hex')) {
    fail('Ecosystem launcher projection must match its stable payload and exact reviewed source receipt');
  }
  const { integrity: maxisIntegrity, ...maxisUnsigned } = maxisProjection;
  if (maxisProjection.schema !== 1
    || maxisProjection.kind !== 'maxis-entry-summary'
    || maxisIntegrity?.algorithm !== 'sha256-stable-json-v1'
    || maxisIntegrity?.contentHash !== stableJsonHash(maxisUnsigned)) {
    fail('Maxis launcher projection must retain its stable integrity receipt');
  }
  for (const [key, receipt] of Object.entries(maxisProjection.sourceReceipts || {})) {
    const sourcePath = String(receipt?.path || '').replace(/^\/+/, '');
    if (!sourcePath.startsWith('data/')) {
      fail(`Maxis launcher projection ${key} receipt must name a first-party data artifact`);
      continue;
    }
    const sourceText = await readText(sourcePath);
    if (receipt.bytes !== Buffer.byteLength(sourceText)
      || receipt.sha256 !== createHash('sha256').update(sourceText).digest('hex')) {
      fail(`Maxis launcher projection ${key} receipt has drifted from ${sourcePath}`);
    }
  }

  const { integrity: bakerSignalsIntegrity, ...bakerSignalsUnsigned } = bakerSignalsProjection;
  if (Buffer.byteLength(bakerSignalsProjectionText) > 96 * 1024
    || bakerSignalsProjection.schema !== 1
    || bakerSignalsProjection.kind !== 'baker-governance-signals'
    || bakerSignalsProjection.coverage?.status !== 'complete'
    || bakerSignalsProjection.coverage?.mode !== 'source-active-delegate-governance-signal-projection'
    || bakerSignalsProjection.recordCount !== Object.keys(bakerSignalsProjection.records || {}).length
    || bakerSignalsIntegrity?.algorithm !== 'sha256-stable-json-v1'
    || bakerSignalsIntegrity?.contentHash !== stableJsonHash(bakerSignalsUnsigned)
    || bakerSignalsProjection.sources?.careers?.path !== 'data/maxis-careers.json'
    || bakerSignalsProjection.sources?.careers?.fileSha256 !== createHash('sha256').update(bakerCareersSourceText).digest('hex')
    || bakerSignalsProjection.sources?.governanceVotes?.path !== 'data/governance-votes.json'
    || bakerSignalsProjection.sources?.governanceVotes?.fileSha256 !== createHash('sha256').update(governanceVotesSourceText).digest('hex')) {
    fail('Baker governance signal projection must remain compact, complete, integrity-checked, and tied to both exact source files');
  }

  if (packageJson.scripts?.['refresh:launcher-projections'] !== 'node scripts/generate-launcher-projections.mjs'
    || packageJson.scripts?.['check:launcher-projections'] !== 'node scripts/generate-launcher-projections.mjs --check'
    || packageJson.scripts?.['test:baker-governance-signals'] !== 'node tests/baker-governance-signals-check.mjs'
    || !packageJson.scripts?.['test:static']?.includes('node tests/baker-governance-signals-check.mjs')
    || !aggregateGenerator.includes('generate-capital-entry-summary.mjs')
    || !aggregateGenerator.includes('generate-ecosystem-entry-summary.mjs')
    || !aggregateGenerator.includes('generate-maxis-entry-summary.mjs')
    || !aggregateGenerator.includes('generate-baker-governance-signals.mjs')) {
    fail('package scripts must expose one deterministic launcher-projection refresh and check path');
  }
  const projectionCheckIndex = orchestrator.indexOf("nodeScript('scripts/generate-launcher-projections.mjs', ['--check'])");
  const bakerSignalsPrecommitIndex = orchestrator.indexOf("nodeScript('scripts/generate-baker-governance-signals.mjs')");
  const projectionPrecommitStageIndex = orchestrator.indexOf('if (shouldStage) stageTargets(LAUNCHER_PROJECTION_TARGETS)', projectionCheckIndex);
  const whaleCheckIndex = orchestrator.indexOf("nodeScript('scripts/refresh-whale-watch-data.mjs', ['--check'])", projectionCheckIndex);
  if (!capitalGenerator.includes('MAX_OUTPUT_BYTES = 16 * 1024')
    || !ecosystemGenerator.includes('MAX_OUTPUT_BYTES = 16 * 1024')
    || !maxisGenerator.includes('MAX_OUTPUT_BYTES = 24 * 1024')
    || !bakerSignalsGenerator.includes('MAX_OUTPUT_BYTES = 96 * 1024')
    || !bakerSignalsGenerator.includes("proposal?.status !== 'accepted'")
    || !bakerSignalsGenerator.includes('proposal.initiator.address')
    || !maxisGenerator.includes("integrity: {\n      algorithm: 'sha256-stable-json-v1'")
    || !orchestrator.includes("'data/baker-governance-signals.json'")
    || projectionCheckIndex < 0
    || bakerSignalsPrecommitIndex < 0
    || bakerSignalsPrecommitIndex > projectionCheckIndex
    || projectionPrecommitStageIndex < projectionCheckIndex
    || projectionPrecommitStageIndex > whaleCheckIndex
    || !orchestrator.includes("nodeScript('scripts/generate-launcher-projections.mjs')")
    || !orchestrator.includes('stageTargets(LAUNCHER_PROJECTION_TARGETS)')) {
    fail('generated-surface orchestration must validate, refresh, budget, and optionally stage all launcher projections');
  }
  for (const guardedPath of [
    'generate-capital-entry-summary',
    'generate-ecosystem-entry-summary',
    'generate-maxis-entry-summary',
    'generate-baker-governance-signals',
    'generate-launcher-projections',
    'generate-llms-txt',
    'measure-initial-load',
    'openapi'
  ]) {
    if (!readmeGuard.includes(guardedPath)) {
      fail(`README guard must cover the documented ${guardedPath} contract`);
    }
  }

  for (const [label, feature, snippets] of [
    ['Capital', capitalFeature, [
      "import { sha256Text } from '../core/sha256.js'",
      "const CAPITAL_ENTRY_SUMMARY_URL = '/data/capital-entry-summary.json'",
      'fetchCapitalEntrySummary',
      'fetchCapitalSnapshot',
      'priceFreshnessLabel',
      'GENERATED_PROOFBOOK_SCHEDULE_LABEL',
      'Capital snapshot failed its SHA-256 integrity receipt',
      'const sourceReceipt = summary?.source || null',
      'assertSnapshotMatchesProjection(snapshot, sourceText, sourceReceipt'
    ]],
    ['Ecosystem', ecosystemFeature, [
      "import { sha256Text } from '../core/sha256.js'",
      "const ECOSYSTEM_ENTRY_SUMMARY_URL = '/data/ecosystem-entry-summary.json'",
      'fetchEntrySummary',
      'fetchSnapshot',
      'Ecosystem snapshot failed its SHA-256 integrity receipt',
      'const sourceReceipt = summary?.source || null',
      'assertSnapshotMatchesProjection(value, text, sourceReceipt'
    ]],
    ['Maxis', maxisFeature, [
      "import { sha256Text } from '../core/sha256.js'",
      "const ENTRY_SUMMARY_URL = '/data/maxis/entry-summary.json'",
      'loadEntrySummaryProjection',
      'The compact Maxis launcher receipt is temporarily unavailable.',
      'entryHydrationSerial',
      'failed its SHA-256 integrity receipt',
      'missing a canonical identity',
      'season does not match its manifest and source receipt'
    ]]
  ]) {
    for (const snippet of snippets) {
      if (!feature.includes(snippet)) fail(`${label} launcher projection contract is missing: ${snippet}`);
    }
    if (/async function sha256Text\s*\(/.test(feature)
      || /(?:SHA-256 verification|Web Crypto) is unavailable/.test(feature)) {
      fail(`${label} receipt verification must retain the shared deterministic fallback on plain-HTTP LAN origins`);
    }
  }
  if (maxisFeature.includes('progressiveEntryLoad')) {
    fail('Maxis launcher projection failures must fail closed instead of loading full room artifacts');
  }
  for (const snippet of [
    "name: 'launcher-projections'",
    '/data/capital-entry-summary.json',
    '/data/ecosystem-entry-summary.json',
    '/data/maxis/entry-summary.json',
    'full Capital data loaded before its Chamber opened',
    'full Ecosystem data loaded before its Chamber opened',
    'full Maxis data loaded before its Chamber opened',
    'plain-HTTP launcher receipt fixture did not disable SubtleCrypto',
    'projection failure loaded full data before explicit room intent',
    'delayed Maxis projection overwrote full launcher data'
  ]) {
    if (!smoke.includes(snippet)) fail(`launcher-projection browser regression contract is missing: ${snippet}`);
  }
  if (!leaderboardFeature.includes('refreshBakerDirectoryChamber({ quiet: false, includeGovernance: false })')
    || !leaderboardFeature.includes('if (includeGovernance) requests.push(fetchGovernanceSignals())')
    || !leaderboardFeature.includes("GOVERNANCE_SIGNALS_URL = '/data/baker-governance-signals.json'")
    || !measurement.includes("'/data/ecosystem-entry-summary.json'")
    || !measurement.includes("'/data/ecosystem-stats.json'")
    || !measurement.includes("'/data/baker-governance-signals.json'")
    || !measurement.includes("'/data/maxis-careers.json'")
    || !smoke.includes('bakerGovernanceHeavyRequests === 0')
    || !smoke.includes("!hasPath('/data/maxis-careers.json')")
    || !smoke.includes("hasPath('/data/maxis-careers.json')")) {
    fail('initial-load QA must defer the Baker Directory compact signal receipt and full Maxis career ledger until explicit room intent');
  }

  const sourceBytes = Buffer.byteLength(capitalSourceText)
    + Buffer.byteLength(ecosystemSourceText)
    + Buffer.byteLength(bakerCareersSourceText)
    + Buffer.byteLength(governanceVotesSourceText)
    + Object.values(maxisProjection.sourceReceipts || {}).reduce((total, receipt) => total + Number(receipt?.bytes || 0), 0);
  const projectionBytes = Buffer.byteLength(capitalProjectionText)
    + Buffer.byteLength(ecosystemProjectionText)
    + Buffer.byteLength(maxisProjectionText)
    + Buffer.byteLength(bakerSignalsProjectionText);
  pass(`launcher projections retain exact source receipts within ${projectionBytes} bytes versus ${sourceBytes} reviewed source bytes`);
}

async function checkModuleImportVersions() {
  const jsFiles = await walk('js', (file) => file.endsWith('.js'));
  const versionedImportPattern = /\b(?:import|export)\s+(?:[^'"]+\s+from\s+)?["']\.\.?\/[^"']+\?v=\d+["']/;
  const dynamicVersionedImportPattern = /\bimport\(["']\.\.?\/[^"']+\?v=\d+["']\)/;

  for (const file of jsFiles) {
    const source = await readText(file);
    if (versionedImportPattern.test(source) || dynamicVersionedImportPattern.test(source)) {
      fail(`${file} imports a local ES module with a ?v= query; use a single module specifier so shared state is not duplicated`);
    }
  }

  pass('local ES module imports avoid cache-busting query strings');
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
  for (const snippet of ['pull_request:', 'branches: [main]', 'workflow_dispatch:', "github.event_name == 'workflow_dispatch'", 'npm run test:static', 'playwright install --with-deps chromium', 'npm run test:smoke', 'needs: browser-smoke', 'pages: write', 'id-token: write', 'actions/configure-pages@v6', 'actions/upload-pages-artifact@v5', 'include-hidden-files: true', 'actions/deploy-pages@v5']) {
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
  const stakingGuide = await readText('staking/index.html');
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
  if (!stakingGuide.includes('direct staking freezes XTZ')
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

async function checkStylesheetFreshness() {
  const source = await statOrNull('css/styles.css');
  const minified = await statOrNull('css/styles.min.css');
  if (!source || !minified) return;

  if (source.mtimeMs > minified.mtimeMs + 1000) {
    warn('css/styles.css is newer than css/styles.min.css; regenerate the served minified CSS before deploy');
  } else {
    pass('served minified CSS is not older than source CSS');
  }

  const themeFiles = await walk('css/themes', (file) => file.endsWith('.min.css')).catch(() => []);
  const themeSource = await readText('js/ui/theme.js');
  const themeMatch = themeSource.match(/export const THEMES\s*=\s*\[([\s\S]*?)\];/);
  const expectedThemes = themeMatch ? Array.from(themeMatch[1].matchAll(/['"]([^'"]+)['"]/g), (match) => match[1]) : [];
  if (!expectedThemes.length) {
    fail('js/ui/theme.js theme list could not be parsed for lazy theme CSS checks');
  }
  const baseCss = await readText('css/styles.min.css');
  const styles = await readText('css/styles.css');
  const matrixCss = await readText('css/themes/matrix.css');
  const shellExtrasCss = await readText('css/shell-extras.css');
  if (!matrixCss.includes('[data-theme="matrix"] :is(.price-label, .price-mcap)')
      || !matrixCss.includes('color: #8cff8c')
      || !shellExtrasCss.includes('.pulse-ticker-weight')
      || !shellExtrasCss.includes('color: #8cff8c')) {
    fail('Matrix small telemetry labels must keep the explicit high-contrast treatment');
  }
  const leakedThemes = expectedThemes.filter((theme) => new RegExp(`data-theme\\s*=\\s*["']?${theme}["']?`, 'i').test(baseCss));
  if (leakedThemes.length) {
    fail(`css/styles.min.css should not carry lazy theme selectors: ${leakedThemes.join(', ')}`);
  }
  if (minified.size > 300 * 1024) {
    fail(`css/styles.min.css is ${Math.round(minified.size / 1024)}KB; lazy theme split should keep the render-blocking base under 300KB`);
  }
  for (const theme of expectedThemes) {
    const file = `css/themes/${theme}.min.css`;
    if (!themeFiles.includes(file)) fail(`missing lazy theme bundle: ${file}`);
    const themeStat = await statOrNull(file);
    if (themeStat && source.mtimeMs > themeStat.mtimeMs + 1000) {
      warn(`${file} is older than css/styles.css; run npm run build:css`);
    }
  }
  if (themeFiles.length >= expectedThemes.length) {
    pass(`lazy theme CSS bundles checked: ${themeFiles.length}`);
  }

  const lazySurfaceSources = [
    'capital.css', 'ecosystem.css', 'history-chamber.css', 'leaderboard.css', 'ledger-flow.css',
    'maxis.css', 'market-room.css', 'metals-chamber.css', 'minerals-chamber.css', 'network-health.css',
    'network-pulse.css', 'staking-chamber.css', 'tezos-domains.css', 'tezoscrp.css',
    'uranium-chamber.css', 'whale-chamber.css'
  ];
  const myTezosMinStat = await statOrNull('css/my-tezos.min.css');
  if (!myTezosMinStat) {
    fail('missing generated stylesheet: css/my-tezos.min.css');
  } else if (source.mtimeMs > myTezosMinStat.mtimeMs + 1000) {
    warn('css/my-tezos.min.css is older than css/styles.css; run npm run build:css');
  }
  for (const sourceName of ['shell-extras.css', ...lazySurfaceSources]) {
    const sourcePath = `css/${sourceName}`;
    const minPath = `css/${sourceName.replace(/\.css$/, '.min.css')}`;
    const sourceStat = await statOrNull(sourcePath);
    const minStat = await statOrNull(minPath);
    if (!sourceStat || !minStat) {
      fail(`missing generated stylesheet pair: ${sourcePath} -> ${minPath}`);
    } else if (sourceStat.mtimeMs > minStat.mtimeMs + 1000) {
      warn(`${minPath} is older than ${sourcePath}; run npm run build:css`);
    }
  }
  const generatedSurfaces = await readText('scripts/refresh-generated-surfaces.mjs');
  if (!generatedSurfaces.includes('const CSS_SOURCE_PATTERNS = [')
    || !generatedSurfaces.includes("'css/my-tezos.min.css'")
    || !generatedSurfaces.includes("'css/shell-extras.min.css'")
    || !generatedSurfaces.includes('...LAZY_SURFACE_STYLES.map')
    || !generatedSurfaces.includes('stageTargets(CSS_TARGETS)')) {
    fail('pre-commit generated-surface orchestration must rebuild and stage every served minified stylesheet');
  }
  pass(`lazy surface CSS bundles and pre-commit coverage checked: ${lazySurfaceSources.length}`);

  const sourceCss = await readText('css/styles.css');
  const henCss = await readText('css/hen-mode.css');
  const parseVariables = (block = '') => Object.fromEntries(
    Array.from(block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi), (match) => [match[1], match[2].trim()])
  );
  const rootVariables = parseVariables(sourceCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1]);
  const henVariables = parseVariables(henCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1]);
  const resolveVariable = (value, variables, depth = 0) => {
    const variable = String(value || '').match(/^var\((--[a-z0-9-]+)\)$/i)?.[1];
    if (!variable || depth > 4) return value;
    return resolveVariable(variables[variable], variables, depth + 1);
  };
  const normalizeHex = (value) => /^#[0-9a-f]{3}$/i.test(value || '')
    ? `#${value.slice(1).split('').map((character) => character.repeat(2)).join('')}`
    : value;
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255);
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const contrastRatio = (left, right) => {
    const light = Math.max(luminance(left), luminance(right));
    const dark = Math.min(luminance(left), luminance(right));
    return (light + 0.05) / (dark + 0.05);
  };
  for (const theme of expectedThemes) {
    const themeBlock = sourceCss.match(new RegExp(`\\[data-theme=["']${theme}["']\\]\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] || '';
    const variables = { ...rootVariables, ...henVariables, ...parseVariables(themeBlock) };
    for (const textToken of ['--text-tertiary', '--text-muted']) {
      const textColor = normalizeHex(resolveVariable(variables[textToken], variables));
      for (const backgroundToken of ['--bg-primary', '--bg-secondary', '--bg-tertiary']) {
        const backgroundColor = normalizeHex(resolveVariable(variables[backgroundToken], variables));
        if (!/^#[0-9a-f]{6}$/i.test(textColor || '') || !/^#[0-9a-f]{6}$/i.test(backgroundColor || '')) {
          fail(`theme ${theme} contrast contract could not resolve ${textToken} on ${backgroundToken}`);
          continue;
        }
        const ratio = contrastRatio(textColor, backgroundColor);
        if (ratio < 4.5) {
          fail(`theme ${theme} ${textToken} contrast is ${ratio.toFixed(2)}:1 on ${backgroundToken}; small text needs at least 4.5:1`);
        }
      }
    }
    if (theme === 'clean') {
      const linkColor = normalizeHex(resolveVariable(variables['--surface-link-color'], variables));
      for (const backgroundToken of ['--bg-primary', '--bg-secondary', '--bg-tertiary']) {
        const backgroundColor = normalizeHex(resolveVariable(variables[backgroundToken], variables));
        const ratio = contrastRatio(linkColor, backgroundColor);
        if (ratio < 4.5) {
          fail(`theme clean link contrast is ${ratio.toFixed(2)}:1 on ${backgroundToken}; ordinary links need at least 4.5:1`);
        }
      }
    }
  }
  pass(`theme small-text contrast checked across ${expectedThemes.length} themes`);
}

async function checkAuroraDesktopTitleTreatment() {
  const css = await readText('css/styles.css');
  const matrixEffects = await readText('js/effects/matrix-effects.js');
  const backgroundEffects = await readText('js/effects/bg-effects.js');
  const titleStart = css.indexOf('[data-theme="aurora"] .title');
  const keyframesStart = css.indexOf('@keyframes auroraTitleShift', titleStart);
  const sharedBlock = titleStart >= 0 && keyframesStart >= 0
    ? css.slice(titleStart, keyframesStart)
    : '';

  if (!sharedBlock.includes('[data-theme="aurora"] .title')) {
    fail('aurora title needs a shared mobile/desktop multicolor treatment');
    return;
  }

  for (const token of ['#45E0C8', '#5BA8FF', '#9B8CFF', '#F49AD1']) {
    if (!sharedBlock.includes(token)) fail(`shared aurora title gradient missing ${token}`);
  }

  if (!sharedBlock.includes('background-size: 220% auto')) {
    fail('aurora title must keep the mobile-style wide gradient field on desktop');
  }
  if (!sharedBlock.includes('animation: auroraTitleShift 9s linear infinite')) {
    fail('aurora title must use the same shifting animation on desktop and mobile');
  }
  if (css.includes('auroraTitleSweep')) {
    fail('desktop aurora title should not use a separate sweep animation from mobile');
  }
  const accessibilityStart = css.indexOf('Accessibility');
  const reducedMotionStart = css.indexOf('@media (prefers-reduced-motion: reduce)', accessibilityStart);
  const reducedMotionEnd = css.indexOf('.glass-button:focus', reducedMotionStart);
  const reducedMotionBlock = reducedMotionStart >= 0 && reducedMotionEnd > reducedMotionStart
    ? css.slice(reducedMotionStart, reducedMotionEnd)
    : '';
  if (!reducedMotionBlock.includes('animation: none !important')) {
    fail('reduced-motion mode must disable decorative animations');
  }
  if (!reducedMotionBlock.includes('*::before') || !reducedMotionBlock.includes('*::after')) {
    fail('reduced-motion mode must also disable animations on pseudo-elements');
  }
  if (reducedMotionBlock.includes('auroraTitleShift') || /animation:[^;]*infinite/i.test(reducedMotionBlock)) {
    fail('Aurora and other theme animations must not be re-enabled in reduced-motion mode');
  }
  for (const [label, source] of [['Matrix canvas', matrixEffects], ['theme background canvas', backgroundEffects]]) {
    if (!source.includes("matchMedia('(prefers-reduced-motion: reduce)')")
        || !source.includes('!reducedMotionQuery.matches')
        || !source.includes("addEventListener('change', handleThemeChange)")) {
      fail(`${label} must avoid animation under reduced motion and react when the preference changes`);
    }
  }

  pass('desktop aurora title shares the multicolor treatment while respecting reduced motion');
}

async function checkValleyThemeContracts() {
  const [
    themeSource,
    preloadSource,
    buildCssSource,
    generatedSource,
    indexSource,
    landingSource,
    stylesSource,
    smokeSource
  ] = await Promise.all([
    readText('js/ui/theme.js'),
    readText('js/core/theme-preload.js'),
    readText('scripts/build-css.mjs'),
    readText('scripts/refresh-generated-surfaces.mjs'),
    readText('index.html'),
    readText('landing.html'),
    readText('css/styles.css'),
    readText('tests/smoke.mjs')
  ]);
  const loaderSource = await readText('js/effects/valley-loader.js').catch(() => '');
  const rendererSource = await readText('js/effects/valley-effects.js').catch(() => '');
  const valleyBundle = await readText('css/themes/valley.css').catch(() => '');
  const valleyMinBundle = await readText('css/themes/valley.min.css').catch(() => '');

  const parseStringArray = (source, pattern) => {
    const body = source.match(pattern)?.[1] || '';
    return Array.from(body.matchAll(/['"]([^'"]+)['"]/g), (match) => match[1]);
  };
  const mirroredRegistries = [
    ['runtime theme registry', parseStringArray(themeSource, /export const THEMES\s*=\s*\[([\s\S]*?)\];/)],
    ['render-blocking preload registry', parseStringArray(preloadSource, /var VALID\s*=\s*\[([\s\S]*?)\];/)],
    ['CSS build registry', parseStringArray(buildCssSource, /const THEMES\s*=\s*\[([\s\S]*?)\];/)],
    ['generated-surface registry', parseStringArray(generatedSource, /const THEME_NAMES\s*=\s*\[([\s\S]*?)\];/)],
    ['landing-page registry', Array.from(
      (landingSource.match(/var THEMES\s*=\s*\{([\s\S]*?)\n\s*\};/)?.[1] || '').matchAll(/^\s*([a-z][a-z0-9-]*)\s*:/gim),
      (match) => match[1]
    )]
  ];
  for (const [label, themes] of mirroredRegistries) {
    if (themes.filter((theme) => theme === 'valley').length !== 1) {
      fail(`Valley must appear exactly once in the ${label}`);
    }
  }
  const canonicalThemes = mirroredRegistries[0][1];
  for (const [label, themes] of mirroredRegistries.slice(1)) {
    if (themes.join('\n') !== canonicalThemes.join('\n')) {
      fail(`Valley theme registry drifted between the runtime list and ${label}`);
    }
  }
  for (const [label, source] of [
    ['theme picker colors', themeSource.match(/export const THEME_COLORS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || ''],
    ['theme picker vibe', themeSource.match(/const THEME_VIBES\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || ''],
    ['runtime font registry', themeSource.match(/const THEME_FONT_FAMILIES\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || ''],
    ['preload font registry', preloadSource.match(/var THEME_FONTS\s*=\s*\{([\s\S]*?)\n\s*\};/)?.[1] || '']
  ]) {
    if (!/['"]?valley['"]?\s*:/.test(source)) fail(`Valley is missing from the ${label}`);
  }

  if (!loaderSource) {
    fail('Valley must use a dedicated lazy lifecycle loader');
  } else {
    if (!/import\(\s*['"]\.\/valley-effects\.js(?:\?[^'"]*)?['"]\s*\)/.test(loaderSource)) {
      fail('Valley loader must dynamically import the renderer only when needed');
    }
    if (!/generation|token|requestId|loadId/i.test(loaderSource)
      || !/!==|!=/.test(loaderSource)
      || !/getAttribute\(\s*['"]data-theme['"]\s*\)|dataset\.theme/.test(loaderSource)
      || !/['"]valley['"]/.test(loaderSource)) {
      fail('Valley dynamic import must be guarded against a stale theme or load generation');
    }
    if (!/matchMedia\(\s*['"]\(prefers-reduced-motion:\s*reduce\)['"]\s*\)/.test(loaderSource)
      || !/addEventListener\(\s*['"]change['"]/.test(loaderSource)) {
      fail('Valley loader must avoid animation under reduced motion and react to preference changes');
    }
  }
  if (!indexSource.includes('js/effects/valley-loader.js')) {
    fail('Valley lifecycle loader must be reachable from the app shell');
  }
  if (indexSource.indexOf('<script type="module" src="js/effects/valley-loader.js')
    > indexSource.indexOf('<script type="module" src="js/core/app.js')) {
    fail('Valley lifecycle loader must subscribe before app.js can publish initial cached stats');
  }
  if (!loaderSource.includes('lastStatsDetail')
    || !/addEventListener\(\s*['"]stats-updated['"]\s*,\s*rememberStats/.test(loaderSource)
    || !/effect\?\.seedStats\?\.\(lastStatsDetail\)/.test(loaderSource)
    || /dispatchEvent\(new (?:CustomEvent|Event)\(/.test(loaderSource)
    || !/seedStats\s*\(detail\)/.test(rendererSource)) {
    fail('Valley loader must privately seed the latest stats without rebroadcasting stale app events');
  }

  if (!rendererSource) {
    fail('Valley painterly renderer is missing');
  } else {
    for (const primitive of [
      [/\bfetch\s*\(/, 'fetch'],
      [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
      [/\bWebSocket\b/, 'WebSocket'],
      [/\bEventSource\b/, 'EventSource']
    ]) {
      if (primitive[0].test(rendererSource)) {
        fail(`Valley renderer must consume app events instead of starting its own ${primitive[1]} network source`);
      }
    }
    for (const eventName of ['stats-updated', 'block-pulse']) {
      if (!new RegExp(`addEventListener\\(\\s*['"]${eventName}['"]`).test(rendererSource)) {
        fail(`Valley renderer must listen for ${eventName}`);
      }
      if (!new RegExp(`removeEventListener\\(\\s*['"]${eventName}['"]`).test(rendererSource)) {
        fail(`Valley renderer cleanup must remove its ${eventName} listener`);
      }
    }
    if (!/devicePixelRatio/.test(rendererSource)
      || !/Math\.min\([\s\S]{0,120}(?:devicePixelRatio|DPR)|Math\.min\([\s\S]{0,120}DPR[\s\S]{0,120}devicePixelRatio/.test(rendererSource)) {
      fail('Valley renderer must cap device pixel ratio before sizing its canvas');
    }
    if (!/const DPR_CAP\s*=\s*1\s*;/.test(rendererSource)) {
      fail('Valley decorative raster must stay at 1x so high-DPI screens do not multiply full-viewport paint cost');
    }
    if (!/requestAnimationFrame/.test(rendererSource)
      || !/cancelAnimationFrame/.test(rendererSource)
      || !/(?:FRAME|FPS|frameInterval|lastFrame|lastPaint)/i.test(rendererSource)
      || !/(?:timestamp|time)\s*-/.test(rendererSource)) {
      fail('Valley renderer must use a cancellable, cadence-capped animation frame loop');
    }
    if (!/addEventListener\(\s*['"]visibilitychange['"]/.test(rendererSource)
      || !/removeEventListener\(\s*['"]visibilitychange['"]/.test(rendererSource)
      || !/(?:visibilityState|document\.hidden)/.test(rendererSource)) {
      fail('Valley renderer must pause while hidden and remove its visibility listener on cleanup');
    }
    if (!/valley-background-canvas/.test(rendererSource)
      || !/(?:setAttribute\(\s*['"]aria-hidden['"]\s*,\s*['"]true['"]|ariaHidden\s*=\s*['"]true['"])/.test(rendererSource)
      || !/(?:pointerEvents|pointer-events)\s*(?::|=)\s*['"]?none/.test(rendererSource)) {
      fail('Valley canvas must be decorative, aria-hidden, and click-through');
    }
    if (!/(?:function|const)\s+(?:stop|cleanup|destroy)|\bstop\s*\(/.test(rendererSource)
      || !/\.remove\(\)/.test(rendererSource)) {
      fail('Valley renderer must expose cleanup that removes its canvas');
    }
    if (!/const GRASS_DENSITY_MULTIPLIER\s*=\s*3\s*;/.test(rendererSource)
      || !/extraGrassRandom\s*=\s*seededRandom/.test(rendererSource)
      || !/grassCount\s*\*\s*\(GRASS_DENSITY_MULTIPLIER\s*-\s*1\)/.test(rendererSource)) {
      fail('Valley must triple its grass through an independently seeded meadow population');
    }
    if (!/const TREE_SWAY_RATIO\s*=\s*0\.2\s*;/.test(rendererSource)
      || !/getTreeSway\s*\(/.test(rendererSource)
      || !/grassWaveSpeed\s*\*\s*TREE_SWAY_RATIO/.test(rendererSource)
      || !/grassSwayDistance\s*\*\s*TREE_SWAY_RATIO/.test(rendererSource)
      || !/valleyTreeSwayRatio\s*=\s*TREE_SWAY_RATIO\.toFixed\(2\)/.test(rendererSource)) {
      fail('Valley trees must sway at exactly 20% of the grass wave distance and speed');
    }
    if (!/buildLandscapeGeometry\s*\(\)/.test(rendererSource)
      || !/isPointInPath\(\s*this\.pathwayPath\s*,\s*blade\.x\s*,\s*blade\.y\s*\)/.test(rendererSource)
      || /clip\(\s*this\.grassBankClip/.test(rendererSource)) {
      fail('Valley grass must exclude roots from the path without hard-clipping natural blade overhang');
    }
    if (!/drawHilltopBench\s*\(/.test(rendererSource)
      || !/valleyDestination\s*=\s*['"]hilltop-bench['"]/.test(rendererSource)
      || !/valleyBench\s*=\s*['"]three-quarter-wood['"]/.test(rendererSource)
      || !/valleyGrassProfile\s*=\s*['"]full-depth-meadow['"]/.test(rendererSource)
      || !/valleyFrontMountain\s*=\s*['"]opaque['"]/.test(rendererSource)
      || !/\{\s*color:\s*['"]#445844['"]\s*,\s*alpha:\s*1\s*,/.test(rendererSource)
      || /this\.drawLake\s*\(/.test(rendererSource)
      || /this\.drawWildfireMeadow\s*\(/.test(rendererSource)
      || !/this\.blockImpulse\s*\*\s*Math\.exp/.test(rendererSource)
      || !/earth\.addColorStop/.test(rendererSource)) {
      fail('Valley must end its earthy hill path at a three-quarter wooden bench against an opaque front mountain');
    }
    if (!/grassBankState/.test(smokeSource)
      || !/destination\s*===\s*['"]hilltop-bench['"]/.test(smokeSource)
      || !/bench\s*===\s*['"]three-quarter-wood['"]/.test(smokeSource)
      || !/grassProfile\s*===\s*['"]full-depth-meadow['"]/.test(smokeSource)
      || !/frontMountain\s*===\s*['"]opaque['"]/.test(smokeSource)
      || !/treeSwayRatio\s*===\s*0\.2/.test(smokeSource)
      || !/Math\.abs\(state\.treeSwayDistanceRatio\s*-\s*0\.2\)\s*<\s*0\.000001/.test(smokeSource)
      || !/farGrassCount\s*>\s*state\.expectedCandidates\s*\*\s*0\.18/.test(smokeSource)
      || !/midGrassCount\s*>\s*state\.expectedCandidates\s*\*\s*0\.15/.test(smokeSource)
      || !/rootsOnPath\s*===\s*0/.test(smokeSource)
      || !/pathTouchesBench\s*===\s*true/.test(smokeSource)
      || !/pathwayEdgeChangedSamples\s*>\s*0/.test(smokeSource)
      || !/expectedCandidates:\s*3750/.test(smokeSource)
      || !/expectedCandidates:\s*1440/.test(smokeSource)
      || !/expectedCandidates:\s*2340/.test(smokeSource)) {
      fail('Valley smoke must prove full-depth grass, a grounded hilltop destination, path-root exclusion, and natural overhang');
    }
  }

  const valleyBlock = stylesSource.match(/\[data-theme=["']valley["']\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  const fallbackBlock = stylesSource.match(/body\[data-theme=["']valley["']\]::before\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  for (const token of ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--text-primary', '--text-tertiary', '--text-muted']) {
    if (!new RegExp(`${token}\\s*:`).test(valleyBlock)) fail(`Valley palette is missing ${token}`);
  }
  if (!/background\s*:/.test(fallbackBlock) || !/(?:linear|radial)-gradient/.test(fallbackBlock)) {
    fail('Valley needs a static CSS landscape fallback when canvas motion is unavailable');
  }
  if (!valleyBundle || !valleyMinBundle) {
    fail('Valley source and minified lazy CSS bundles must both be generated');
  } else if (!/valley/.test(valleyBundle) || !/valley/.test(valleyMinBundle)
    || !/::before/.test(valleyBundle) || !/::before/.test(valleyMinBundle)) {
    fail('Valley lazy CSS bundles must retain the static fallback');
  }
  for (const selector of ['[data-theme="valley"] .visit-streak-toast', '[data-theme="valley"] .comparison-col-tezos']) {
    if (!stylesSource.includes(selector)) fail(`Valley component coverage is missing ${selector}`);
  }
  if (!landingSource.includes('15 Themes') || /14 Themes|14 themes/.test(landingSource)
    || /'14 themes'/.test(smokeSource)
    || !/theme-row['"]\s*,\s*15/.test(smokeSource)) {
    fail('Valley must update landing and browser checks from 14 to the canonical 15-theme catalog');
  }

  const variables = Object.fromEntries(
    Array.from(valleyBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi), (match) => [match[1], match[2].trim()])
  );
  const resolveVariable = (value, depth = 0) => {
    const variable = String(value || '').match(/^var\((--[a-z0-9-]+)\)$/i)?.[1];
    if (!variable || depth > 4) return value;
    return resolveVariable(variables[variable], depth + 1);
  };
  const normalizeHex = (value) => /^#[0-9a-f]{3}$/i.test(value || '')
    ? `#${value.slice(1).split('').map((character) => character.repeat(2)).join('')}`
    : value;
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255);
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const contrastRatio = (left, right) => {
    const light = Math.max(luminance(left), luminance(right));
    const dark = Math.min(luminance(left), luminance(right));
    return (light + 0.05) / (dark + 0.05);
  };
  for (const textToken of ['--text-tertiary', '--text-muted']) {
    const textColor = normalizeHex(resolveVariable(variables[textToken]));
    for (const backgroundToken of ['--bg-primary', '--bg-secondary', '--bg-tertiary']) {
      const backgroundColor = normalizeHex(resolveVariable(variables[backgroundToken]));
      if (!/^#[0-9a-f]{6}$/i.test(textColor || '') || !/^#[0-9a-f]{6}$/i.test(backgroundColor || '')) {
        fail(`Valley contrast contract could not resolve ${textToken} on ${backgroundToken}`);
        continue;
      }
      const ratio = contrastRatio(textColor, backgroundColor);
      if (ratio < 4.5) {
        fail(`Valley ${textToken} contrast is ${ratio.toFixed(2)}:1 on ${backgroundToken}; small text needs at least 4.5:1`);
      }
    }
  }

  if (!smokeSource.includes("name: 'valley-theme'")) {
    fail('smoke catalog must include the focused Valley lifecycle suite');
  }
  pass('Valley registry, bank density, grounded pathway, destination, lazy renderer, lifecycle, accessibility, fallback, and contrast contracts checked');
}

async function checkPortableTooling() {
  const packageJson = JSON.parse(await readText('package.json'));
  const gitignore = await readText('.gitignore');
  const hook = await readText('.githooks/pre-commit').catch(() => '');
  const hookStat = await statOrNull('.githooks/pre-commit');

  if (!(await pathExists('package-lock.json'))) {
    fail('package-lock.json must be tracked so fresh clones can use npm ci');
  }
  if (/^package-lock\.json$/m.test(gitignore)) {
    fail('.gitignore must not ignore package-lock.json; reproducible test tooling depends on it');
  }

  const expectedScripts = {
    'install-hooks': 'git config core.hooksPath .githooks',
    'guard:readme': 'node scripts/guard-readme-sync.mjs',
    'check:readme': 'node tests/static-checks.mjs --readme-only',
    'refresh:generated': 'node scripts/refresh-generated-surfaces.mjs --all',
    'refresh:generated:commit': 'node scripts/refresh-generated-surfaces.mjs --mode precommit',
    'refresh:generated:scheduled': 'node scripts/refresh-scheduled-data.mjs',
    'check:generated:freshness': 'node scripts/check-generated-freshness.mjs',
    'refresh:milestones': 'node scripts/generate-milestone-catalog.mjs --force',
    'refresh:nakamoto': 'node scripts/refresh-nakamoto-sources.mjs',
    test: 'npm run test:static && npm run test:smoke',
    'test:static': 'node tests/static-checks.mjs && node tests/scheduled-refresh-check.mjs && node tests/generated-freshness-check.mjs && node tests/supabase-write-check.mjs && node tests/anniversary-check.mjs && node tests/ledger-flow-check.mjs && node tests/pulse-history-check.mjs && node tests/personal-signal-relevance-check.mjs && node tests/live-pulse-curio-check.mjs && node tests/release-radar-check.mjs && node tests/baker-governance-signals-check.mjs && node tests/tezoscrp-check.mjs && node tests/ecosystem-stats-check.mjs && node tests/uranium-check.mjs && node tests/metals-check.mjs && node tests/minerals-check.mjs && node tests/chamber-polling-check.mjs && node tests/service-worker-cache-check.mjs && npm run check:routes:chambers',
    'test:scheduled-refresh': 'node tests/scheduled-refresh-check.mjs && node tests/generated-freshness-check.mjs',
    'test:smoke': 'node tests/smoke.mjs',
    'test:smoke:list': 'node tests/smoke.mjs --list',
    'test:smoke:headed': 'node tests/smoke.mjs --headed',
    'test:smoke:strict': 'node tests/smoke.mjs --strict-external',
    'test:smoke:live': 'node tests/smoke.mjs --base-url https://tezos.systems',
    'test:ledger-flow': 'node tests/ledger-flow-check.mjs',
    'test:baker-governance-signals': 'node tests/baker-governance-signals-check.mjs',
    'test:chamber-polling': 'node tests/chamber-polling-check.mjs',
    'test:service-worker-cache': 'node tests/service-worker-cache-check.mjs'
  };

  for (const [name, command] of Object.entries(expectedScripts)) {
    if (packageJson.scripts?.[name] !== command) {
      fail(`package.json script ${name} should be "${command}"`);
    }
  }

  if (!hookStat) {
    fail('.githooks/pre-commit must exist as the shared hook wrapper');
  } else if ((hookStat.mode & 0o111) === 0) {
    fail('.githooks/pre-commit must keep executable mode');
  }
  if (!(await pathExists('scripts/guard-readme-sync.mjs'))) {
    fail('scripts/guard-readme-sync.mjs must exist for the README pre-commit guard');
  }
  if (!(await pathExists('scripts/refresh-generated-surfaces.mjs'))) {
    fail('scripts/refresh-generated-surfaces.mjs must exist for generated-surface refreshes');
  }
  if (!hook.includes('refresh-generated-surfaces.mjs') || !hook.includes('stamp-version.sh')) {
    fail('.githooks/pre-commit must refresh generated surfaces and stamp version metadata');
  }
  if (!hook.includes('guard-readme-sync.mjs') || !hook.includes('static-checks.mjs') || !hook.includes('--readme-only')) {
    fail('.githooks/pre-commit must guard README sync and run focused README contract checks');
  }
  const generatedRefresh = await readText('scripts/refresh-generated-surfaces.mjs');
  if (!generatedRefresh.includes("selected === 'scheduled'") || !generatedRefresh.includes('refresh-scheduled-data.mjs')) {
    fail('manual/pre-commit orchestrator must reject the retired all-or-nothing scheduled mode');
  }
  for (const expected of ['refresh-governance-data.mjs', 'generate-milestone-catalog.mjs', 'data/milestone-catalog.json', 'refresh-nakamoto-sources.mjs', 'data/nakamoto-sources.json', 'refresh-chain-comparison.mjs', 'data/chain-comparison-verification.json', 'build-css.mjs', 'generate-chamber-routes.mjs', 'generate-chamber-og-images.mjs', 'generate-og-image.js', 'bake-compare-pages.mjs', 'sitemap.xml', 'og-image.png']) {
    if (!generatedRefresh.includes(expected)) {
      fail(`scripts/refresh-generated-surfaces.mjs must coordinate ${expected}`);
    }
  }
  const rootOgGenerator = await readText('scripts/generate-og-image.js');
  if (rootOgGenerator.includes('Math.random')) {
    fail('scripts/generate-og-image.js must be deterministic when commit hooks regenerate og-image.png');
  }
  const rootOgContracts = [
    ["../js/effects/valley-effects.js", 'reuse the real Valley renderer'],
    ['class="valley-wash"', 'protect foreground contrast over the Valley scene'],
    ['font-size: 64px', 'keep the root social-card title readable after feed downscaling'],
    ['font-size: 18px; line-height: 1.05', 'keep root social-card metric labels readable after feed downscaling'],
    ['<div class="stat-label">Issuance</div>', 'replace the raw tz4-key count with current issuance'],
    ['current_issuance_rate', 'compare issuance against the retained 30-day history ledger'],
    ['tz4_percentage', 'compare tz4 adoption against the retained 30-day history ledger'],
    ['staking_ratio', 'compare staking against the retained 30-day history ledger'],
    ["percentChange(tz4PctValue, closestHistoricalValue(history, 'tz4_percentage'))", 'calculate tz4 adoption change from the unrounded live ratio'],
    ["percentChange(stakingRatioValue, closestHistoricalValue(history, 'staking_ratio'))", 'calculate staking change from the unrounded live ratio'],
    ['total_bakers', 'compare active bakers against the retained 30-day history ledger'],
    ['<small>30D</small>', 'label compact 30-day percentage deltas beside applicable numeric stats'],
    ['data-og-ready', 'wait for the deterministic Valley frame before capture']
  ];
  for (const [snippet, description] of rootOgContracts) {
    if (!rootOgGenerator.includes(snippet)) {
      fail(`scripts/generate-og-image.js must ${description}`);
    }
  }
  if (rootOgGenerator.includes('<div class="stat-label">TZ4 Keys</div>')) {
    fail('scripts/generate-og-image.js must not restore the raw tz4-key count to the root social card');
  }

  if (!(await pathExists('scripts/lib/playwright-browser.cjs'))) {
    fail('scripts/lib/playwright-browser.cjs must exist as the shared Playwright browser launcher');
  } else {
    const launcher = await readText('scripts/lib/playwright-browser.cjs');
    if (!launcher.includes('SYSTEM_BROWSER_CANDIDATES') || !launcher.includes('BROWSER_EXECUTABLE_PATH')) {
      fail('shared Playwright browser launcher must preserve system-browser fallback and explicit executable support');
    }
  }

  const playwrightCallers = [
    ['tests/smoke.mjs', '../scripts/lib/playwright-browser.cjs'],
    ['scripts/generate-og-image.js', './lib/playwright-browser.cjs'],
    ['scripts/generate-chamber-og-images.mjs', './lib/playwright-browser.cjs']
  ];
  for (const [file, importPath] of playwrightCallers) {
    const source = await readText(file);
    if (!source.includes(importPath)) {
      fail(`${file} must use scripts/lib/playwright-browser.cjs for Chromium fallback`);
    }
    if (/chromium\.launch\s*\(/.test(source)) {
      fail(`${file} must not launch Chromium directly; use the shared Playwright browser launcher`);
    }
    if (/systemBrowserCandidates|SYSTEM_BROWSER_CANDIDATES|function findSystemBrowser/.test(source)) {
      fail(`${file} must not carry a copied system-browser candidate list`);
    }
  }

  pass('portable npm scripts, lockfile, and shared git hook checked');
}

async function checkRepositoryLicense() {
  const license = await readText('LICENSE');
  const notice = await readText('NOTICE');
  const readme = await readText('README.md');
  const agentMap = await readText('AGENTS.md');
  const index = await readText('index.html');
  const changelog = await readText('js/features/changelog.js');
  const landing = await readText('landing.html');
  const landingNav = await readText('js/landing/site-nav.js');
  const share = await readText('js/ui/share.js');
  const stateOfTezos = await readText('js/features/state-of-tezos.js');
  const aiPlugin = JSON.parse(await readText('.well-known/ai-plugin.json'));
  const packageJson = JSON.parse(await readText('package.json'));
  const packageLock = JSON.parse(await readText('package-lock.json'));
  const normalizedLicense = license
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  const officialMplHash = '1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5';
  const actualMplHash = createHash('sha256').update(normalizedLicense).digest('hex');

  if (actualMplHash !== officialMplHash) {
    fail('LICENSE must remain the unmodified Mozilla Public License 2.0 text');
  }
  if (packageJson.license !== 'MPL-2.0' || packageLock?.packages?.['']?.license !== 'MPL-2.0') {
    fail('package.json and the root package-lock entry must declare MPL-2.0');
  }
  if (packageJson.author !== 'Primate') {
    fail('package.json must preserve the Primate project authorship');
  }

  const noticeSnippets = [
    'Tezos Systems',
    'Copyright (c) 2026 Primate',
    'https://github.com/Primate411/tezos.systems',
    'developed by Primate',
    'primate@tez.capital',
    'Baking Benjamins (https://x.com/BakingBenjamins)',
    'https://x.com/BakingBenjamins',
    'Mozilla Public License, v. 2.0',
    'https://mozilla.org/MPL/2.0/',
    'Third-party software',
    'separately offered under CC BY 4.0',
    'extent Primate owns those rights',
    'co-founding member of',
    'Tez Capital name and brand are',
    "repository's current copyright holder",
    'earlier revisions carried MIT or ISC declarations'
  ];
  for (const snippet of noticeSnippets) {
    if (!notice.includes(snippet)) fail(`NOTICE missing license contract text: ${snippet}`);
  }

  const readmeSnippets = [
    '## License',
    'Mozilla Public License 2.0',
    '`MPL-2.0`',
    '[NOTICE](NOTICE)',
    'file-level copyleft',
    'modified covered files must remain available under MPL-2.0',
    'Third-party software',
    '[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)',
    'Primate owns those rights',
    'co-founding member of',
    'Tez Capital brand is represented',
    'RPC infrastructure: [Tez Capital](https://tez.capital)',
    'Built by: [Primate](mailto:primate@tez.capital)',
    '[Baking Benjamins](https://x.com/BakingBenjamins)',
    'copyright notice in [NOTICE](NOTICE)',
    'current copyright holder',
    'earlier revisions carried MIT or ISC declarations'
  ];
  for (const snippet of readmeSnippets) {
    if (!readme.includes(snippet)) fail(`README missing license contract text: ${snippet}`);
  }

  const agentMapSnippets = [
    'License: Mozilla Public License 2.0 (`MPL-2.0`)',
    '`LICENSE`: unmodified Mozilla Public License 2.0 terms',
    '`NOTICE`: Tezos Systems / Primate attribution',
    'Tezos Systems is built by Primate, whose public contact is',
    '`primate@tez.capital`',
    '[Baking Benjamins](https://x.com/BakingBenjamins)',
    'Represent Tez Capital as the affiliated brand and RPC',
    "keep Primate as the repository's current copyright holder",
    'and site/schema creator, and as publisher where publisher metadata is present',
    'live footer and document metadata must retain public Source and MPL-2.0'
  ];
  for (const snippet of agentMapSnippets) {
    if (!agentMap.includes(snippet)) fail(`AGENTS.md missing license handoff text: ${snippet}`);
  }

  const deployedNoticeSnippets = [
    '<link rel="license" href="/LICENSE">',
    '<meta name="author" content="Primate">',
    'href="https://github.com/Primate411/tezos.systems" target="_blank" rel="noopener">Source</a>',
    'href="/LICENSE" rel="license">MPL-2.0</a>',
    'Built by <a href="mailto:primate@tez.capital">Primate</a> — baker behind <a href="https://x.com/BakingBenjamins" target="_blank" rel="noopener"><strong>Baking Benjamins</strong></a> and co-founding member of <a href="https://tez.capital" target="_blank" rel="noopener">Tez Capital</a>',
    'Support this work: delegate or stake to <a href="/#my-baker=bakingbenjamins.tez">BakingBenjamins.tez</a> or <a href="/#my-baker=baking.tez">baking.tez</a>',
    'RPC by <a href="https://eu.rpc.tez.capital" target="_blank" rel="noopener">Tez Capital</a>',
    '"license": "https://creativecommons.org/licenses/by/4.0/"'
  ];
  for (const snippet of deployedNoticeSnippets) {
    if (!index.includes(snippet)) fail(`index.html missing deployed license text: ${snippet}`);
  }
  if ((index.match(/"name": "Primate"/g) || []).length < 2
    || (index.match(/"email": "primate@tez\.capital"/g) || []).length < 2
    || (index.match(/"sameAs": \[[\s\S]*?"https:\/\/x\.com\/BakingBenjamins"/g) || []).length < 2) {
    fail('index.html must credit Primate by email and identify Baking Benjamins on X for both WebApplication and Dataset creator');
  }
  if ((index.match(/"affiliation": \{/g) || []).length < 2
    || (index.match(/"name": "Tez Capital"/g) || []).length < 2) {
    fail('index.html must represent Tez Capital as Primate\'s WebApplication and Dataset affiliation');
  }
  if (index.includes('Powered by <a href="https://tez.capital"') || index.includes('"sourceOrganization"')) {
    fail('index.html must not present Tez Capital as the product owner or source organization');
  }
  for (const route of CHAMBER_ROUTES) {
    const routeShell = await readText(`${route.slug}/index.html`);
    for (const snippet of deployedNoticeSnippets.filter((item) => !item.includes('creativecommons.org'))) {
      if (!routeShell.includes(snippet)) fail(`${route.slug}/index.html missing deployed license text: ${snippet}`);
    }
    if ((routeShell.match(/"name": "Primate"/g) || []).length < 1
      || (routeShell.match(/"email": "primate@tez\.capital"/g) || []).length < 1
      || (routeShell.match(/"https:\/\/x\.com\/BakingBenjamins"/g) || []).length < 1
      || (routeShell.match(/"affiliation": \{/g) || []).length < 1
      || (routeShell.match(/"name": "Tez Capital"/g) || []).length < 1
      || !routeShell.includes('"@type": "WebPage"')
      || !routeShell.includes('"@type": "BreadcrumbList"')
      || routeShell.includes('Powered by <a href="https://tez.capital"')
      || routeShell.includes('"sourceOrganization"')) {
      fail(`${route.slug}/index.html has stale product ownership attribution`);
    }
  }
  if (!changelog.includes('Primate project authorship, Tez Capital co-founding affiliation and RPC credit')) {
    fail('changelog must disclose the public MPL-2.0 source-license change');
  }

  const standalonePages = ['staking/index.html', 'governance/index.html', 'bakers/index.html'];
  for (const file of standalonePages) {
    const page = await readText(file);
    if (!/"publisher":\s*\{\s*"@type": "Person",\s*"name": "Primate",\s*"url": "https:\/\/tezos\.systems\/",\s*"email": "primate@tez\.capital",\s*"sameAs": "https:\/\/github\.com\/Primate411",\s*"affiliation":\s*\{\s*"@type": "Organization",\s*"name": "Tez Capital",\s*"url": "https:\/\/tez\.capital"\s*\}\s*\}/s.test(page)) {
      fail(`${file} must identify Primate by email as its publisher and retain Tez Capital affiliation`);
    }
    if (!page.includes('Built by <a href="mailto:primate@tez.capital">Primate</a> — baker behind <a href="https://x.com/BakingBenjamins"><strong>Baking Benjamins</strong></a> and co-founding member of <a href="https://tez.capital">Tez Capital</a>')
      || !page.includes('Support this work: delegate or stake to <a href="/#my-baker=bakingbenjamins.tez">BakingBenjamins.tez</a> or <a href="/#my-baker=baking.tez">baking.tez</a>')
      || !page.includes('<a href="https://tez.capital">RPC by Tez Capital</a>')
      || page.includes('Powered by Tez Capital')) {
      fail(`${file} must show Primate authorship, Baking Benjamins baker identity and support paths, Tez Capital affiliation, and Tez Capital RPC credit`);
    }
  }
  if (!landing.includes('Built by <a href="mailto:primate@tez.capital">Primate</a>')
    || !landing.includes('— baker behind <a href="https://x.com/BakingBenjamins"')
    || !landing.includes('Support this work: delegate or stake to <a href="/#my-baker=bakingbenjamins.tez">BakingBenjamins.tez</a> or <a href="/#my-baker=baking.tez">baking.tez</a>')
    || !landing.includes('co-founding member of <a href="https://tez.capital"')
    || !landing.includes('RPC by <a href="https://tez.capital"')
    || landing.includes('Powered by <a href="https://tez.capital"')) {
    fail('landing.html must show Primate authorship, Baking Benjamins baker identity and support paths, Tez Capital affiliation, and Tez Capital RPC credit');
  }
  if (!landingNav.includes('Built by <a href="mailto:primate@tez.capital">Primate</a>')
    || !landingNav.includes('— baker behind <a href="https://x.com/BakingBenjamins"')
    || !landingNav.includes('Support this work: delegate or stake to <a href="/#my-baker=bakingbenjamins.tez">BakingBenjamins.tez</a> or <a href="/#my-baker=baking.tez">baking.tez</a>')
    || !landingNav.includes('co-founding member of <a href="https://tez.capital"')
    || !landingNav.includes('RPC by <a href="https://tez.capital"')) {
    fail('landing footer runtime must show Primate authorship, Baking Benjamins baker identity and support paths, Tez Capital affiliation, and Tez Capital RPC credit');
  }
  if (!share.includes('Built by <span style="color:${brandColor};font-weight:600;">Primate</span> · RPC by')) {
    fail('share cards must credit Primate and retain the Tez Capital RPC brand credit');
  }
  if (!stateOfTezos.includes("'PRIMATE · RPC BY TEZ CAPITAL'")) {
    fail('State of Tezos cards must credit Primate and retain the Tez Capital RPC brand credit');
  }
  if (!aiPlugin.description_for_model.includes('co-founding member of Tez Capital')
    || !aiPlugin.description_for_model.includes('Tez Capital RPC infrastructure')
    || aiPlugin.contact_email !== 'primate@tez.capital'
    || aiPlugin.legal_info_url !== 'https://tezos.systems/LICENSE') {
    fail('AI plugin metadata must show Tez Capital affiliation and RPC infrastructure and link the repository license');
  }

  pass('MPL-2.0 text, package metadata, attribution, and repository docs agree');
}

async function checkSmokeSuiteCatalogContracts() {
  const smoke = await readText('tests/smoke.mjs');

  if (smoke.includes('const suiteNames = [')) {
    fail('tests/smoke.mjs --list must not maintain a separate hard-coded suite list');
  }
  if (!/if \(cli\.list\) \{\s*for \(const \{ name, description \} of getSuiteCatalog\(null, ''\)\)/.test(smoke)) {
    fail('tests/smoke.mjs --list must derive from getSuiteCatalog so every runnable suite is discoverable');
  }

  pass('smoke suite list derives from the executable catalog');
}

async function checkTourAndShareCaptureContracts() {
  const themeSource = await readText('js/ui/theme.js');
  const tour = await readText('js/features/tooltip-tour.js');
  const app = await readText('js/core/app.js');
  const styles = await readText('css/styles.css');
  const themeMatch = themeSource.match(/const THEMES = \[([^\]]+)\]/);
  const themes = themeMatch ? Array.from(themeMatch[1].matchAll(/['"]([^'"]+)['"]/g)).map((match) => match[1]) : [];
  if (!themes.length) {
    fail('js/ui/theme.js theme list could not be parsed for tour copy checks');
  }

  if (/12 themes/i.test(tour)) {
    fail('tooltip tour must not retain stale 12 themes copy');
  }
  if (!tour.includes(`${themes.length} themes`)) {
    fail(`tooltip tour theme count must agree with theme.js (${themes.length} themes)`);
  }
  for (const snippet of [
    'Find anything',
    'Quick tour',
    'Start with mainnet history',
    'Read the latest blocks',
    'Protocol Anthology',
    'Network Context',
    'Follow the lifeline',
    'complete map stays folded',
    'Explore leads with all topics, Network Pulse, Staking, and Maxis',
    'Optional Tezos Systems tour',
    '<span>Quick tour</span>',
    'Dismiss tour offer'
  ]) {
    if (!tour.includes(snippet)) fail(`tooltip tour must retain passive search-help copy: ${snippet}`);
  }
  for (const selector of [
    '#top-continuity-history',
    '#live-head-button',
    '#hero-search-form',
    '#chambers-section .section-header',
    '#my-tezos-btn',
    '#recruit-section .site-handoff-head',
    '#features-gear',
    '#settings-gear'
  ]) {
    if (!tour.includes(`target: '${selector}'`)) fail(`tooltip tour must cover current help target ${selector}`);
  }
  if (!tour.includes('window.innerWidth - (VIEWPORT_PAD * 2)')) {
    fail('tooltip tour must size its tooltip from the viewport so mobile help never starts off-screen');
  }
  for (const snippet of [
    'Focus command bar',
    'Open selected command result',
    'Open Cycle History Chamber'
  ]) {
    if (!app.includes(snippet)) fail(`keyboard help overlay must include current command shortcut copy: ${snippet}`);
  }

  const upgradeNumberBlock = styles.match(/\.upgrade-number\s*\{[^}]*\}/)?.[0] || '';
  if (!upgradeNumberBlock) {
    fail('css/styles.css missing .upgrade-number block for share capture guard');
  } else if (/color-mix|oklch|(?<!-)lch\(|lab\(/i.test(upgradeNumberBlock)) {
    fail('.upgrade-number must avoid html2canvas-unsupported color functions because protocol timeline sharing captures this live DOM');
  } else {
    pass('tour theme copy and protocol timeline share CSS contracts checked');
  }
}

async function checkDailyBriefingPriceContracts() {
  const briefing = await readText('js/features/daily-briefing.js');
  const requiredSnippets = [
    "import { fetchXTZPrice } from './price.js';",
    'resolvePriceContext',
    'priceChange24h: currentChange24h',
    'cached.priceChange24h',
    'BRIEFING_SCHEMA_VERSION',
    'activityNarrative',
    'ACTIVITY_MEANINGFUL_PCT',
    'baselineText',
    'cached.schema !== BRIEFING_SCHEMA_VERSION'
  ];

  for (const snippet of requiredSnippets) {
    if (!briefing.includes(snippet)) fail(`daily briefing price contract missing: ${snippet}`);
  }
  if (briefing.includes('if (cached?.cycle === stats.cycle)')) {
    fail('daily briefing update must not reuse same-cycle cache without price-movement stale checks');
  }
  if (!/absPct24h\s*<\s*0\.4\s*\?\s*TEMPLATES\.price\[2\]/.test(briefing)) {
    fail('daily briefing steady-price template must stay gated behind sub-0.4% 24h movement');
  }
  if (/dir\s*===\s*['"]above['"]\s*\?\s*['"]busy['"]/.test(briefing)) {
    fail('daily briefing activity copy must not label every above-baseline move as busy');
  }
  if (briefing.includes('the 7-day average')) {
    fail('daily briefing activity copy must not claim a 7-day average when using the saved activity baseline');
  }

  pass('daily briefing price and activity movement cache contracts checked');
}

async function checkNetworkContextNavigationContracts() {
  const briefing = await readText('js/features/daily-briefing.js');
  const pulseTicker = await readText('js/ui/pulse-ticker.js');
  const curio = await readText('js/core/live-pulse-curio.mjs');
  const myTezos = await readText('js/features/my-tezos.js');
  const siteJourney = await readText('js/core/site-journey.js');
  const shellExtras = await readText('css/shell-extras.css');
  const styles = await readText('css/styles.css');
  const requiredSiteMapRoutes = {
    staking: 'staking-chamber',
    governance: 'chamber',
    collector: 'hen',
    creator: 'hen',
    nft: 'hen',
    domains: 'domains',
    lb: 'liquidity-baking',
    tz4: 'tz4',
    etherlink: 'tezosx',
    ledger: 'ledger-flow',
    maxis: 'maxis',
    network: 'pulse'
  };

  for (const [key, siteMapId] of Object.entries(requiredSiteMapRoutes)) {
    const pattern = new RegExp(`${key}:\\s*['"]${siteMapId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
    if (!pattern.test(briefing)) {
      fail(`Network Context site-map route missing ${key} -> ${siteMapId}`);
    }
  }

  const requiredSnippets = [
    "import { findSiteMapEntry } from '../core/site-map.js';",
    'NETWORK_FEATURE_SITE_MAP_IDS',
    'routeFromSiteMapEntry',
    'window.addEventListener(\'hot-signal\', receiveHotSignal)',
    'window.addEventListener(\'governance-alert-state\'',
    'hotPoolSignals()',
    'LS_DAILY_SNAPSHOT',
    'HOT_SIGNAL_RENDER_CAP = 12',
    'HOT_SIGNAL_VISIBLE_MIN = 4',
    'HOT_SIGNAL_CATEGORY_BUDGET = 2',
    'HOT_SIGNAL_EVENT_DECAY_PER_HOUR = 8',
    'HOT_SIGNAL_PERSONAL_BONUS = 6',
    'hotSignalPersonalRibbon',
    "return 'Your stake';",
    "return 'Your baker';",
    "return 'Your position';",
    "return 'Your collection';",
    "return 'Your .tez name';",
    "left?.spectacle !== 'quiet'",
    "if (value == null || value === '') return null;",
    'MILESTONE_MOMENT_TTL_MS',
    'advanceMilestoneTrack(momentStore',
    '...lifecycle.activeMoments',
    "milestoneStatus: 'crossed'",
    "milestoneStatus: 'near'",
    'shortLabel: milestoneShortLabel',
    'claimMilestoneArrival(seenMilestoneArrivals',
    "signal?.tone === 'milestone' && signal?.milestoneStatus === 'crossed'",
    'scheduleHotSignalExpiryRefresh(hotTodaySignals)',
    'milestone: hotSignalPayload(milestoneSignal)',
    'dailySnapshotReference',
    'captureDailySnapshot(stats)',
    'const kind = normalizeSignalKind',
    'SPECTACLE_LEVELS',
    'normalizeSpectacle',
    'selectHotSignalSet',
    'scoreBoostFor(category, profile)',
    'fetchNftPulse',
    'chooseDailyCurio',
    'LIVE_PULSE_CURIO_MAX_BASE_SIGNALS',
    'LIVE_PULSE_CURIO_SCORE',
    'shouldOfferDailyCurio',
    'LS_DAILY_CURIO_DAY',
    'freshHistoryRowsForDailyCurio',
    'prepareDailyCurio',
    'appendDailyCurio',
    'delta: normalizeDelta',
    'BRIEFING_SCHEMA_VERSION = 14',
    'renderHotTodayState',
    "data-pulse-state', 'stale'",
    'getLiveCandidateSignals',
    'getPulseHistoryReceipt',
    'getPulseDomainReceipt',
    'network-context-milestone-line',
    'MILESTONE_NEAR_MAX_DAYS = 30',
    'MILESTONE_CATALOG_URL',
    'mergedMilestoneThresholds',
    'generatedMilestoneAnchor',
    'resolveExactBlockMilestoneMoment',
    'resolveExactCycleMilestoneMoment',
    'data-hot-milestone-share',
    'captureNetworkMomentShare',
    '<a class="network-focus-chip"',
    '<a class="network-signal',
    'network-personal-spotlight',
    'network-personal-fact',
    'buildPersonalSpotlight',
    'buildPersonalFacts',
    'selectDrawerNetworkSignals',
    'personalSignalContext',
    'personalSignalRelevance',
    'rankSignalsByPersonalRelevance(selected, relevanceContext, effectiveHotScore)',
    'data-network-away-slot',
    "window.dispatchEvent(new Event('my-tezos-network-context-rendered'))",
    'const since = snapshotSinceLabel(snapshot)',
    'referenceAt',
    'countExplicitLinkedEtherlinkAccounts(data?.fullAddress)',
    'data-personal-relevance="true"',
    'valueXtz: whales.top',
    'network-context-columns',
    'network-live-column',
    "window.addEventListener('my-tezos-portfolio-ready'",
    "window.addEventListener('my-tezos-memory-ready'",
    "window.addEventListener('my-tezos-linked-l2-changed'",
    'data-my-tezos-view-route',
    'data-network-route',
    'wireNetworkContextNavigation(container)',
    'closeDrawerForNetworkRoute(route)',
    'window.location.assign(route)',
    "window.dispatchEvent(new Event('hashchange'))"
  ];
  for (const snippet of requiredSnippets) {
    if (!briefing.includes(snippet)) fail(`Network Context clickable contract missing snippet: ${snippet}`);
  }
  for (const snippet of [
    'data-hot-personal="1"',
    'hot-today-you',
    'data-milestone-status=',
    'data-hot-spectacle=',
    'data-hot-visual=',
    'data-hot-signal-id=',
    'data-hot-curio="1"',
    'data-hot-age',
    'pulse-ticker-mark',
    'pulse-ticker-weight',
    "['headliner', 'peacock', 'historic']",
    "if (weight === 'priority') return { mark: '', word: 'PRIORITY' };",
    "return { mark: '', word: '' };",
    'pulseItemSignalId(item)',
    'setHeldSignal(pulseItemSignalId(item), { anchorItem: item })'
  ]) {
    if (!pulseTicker.includes(snippet)) fail(`Live Pulse ticker presentation contract missing snippet: ${snippet}`);
  }
  for (const snippet of [
    'LIVE_PULSE_CURIO_SCORE = 58',
    'LIVE_PULSE_CURIO_MAX_BASE_SIGNALS = 8',
    "source: 'protocol'",
    "source: 'month'",
    "source: 'continuity'",
    'Active baker addresses numbered',
    'adopted protocol upgrades',
    'storedDay !== today'
  ]) {
    if (!curio.includes(snippet)) fail(`Live Pulse daily Curio contract missing snippet: ${snippet}`);
  }
  if (/\bfetch\s*\(|localStorage|sessionStorage/.test(curio)) {
    fail('Live Pulse Curio selection must remain a pure projection of already-loaded data');
  }
  if (!shellExtras.includes('.hot-today-you') || !shellExtras.includes('.hot-today-you + .hot-today-age')) {
    fail('Live Pulse personal ribbon must remain compact and preserve the age label lane');
  }
  for (const snippet of [
    '.pulse-ticker-item',
    'min-width: min(78vw, 330px)',
    '.pulse-ticker-shelf',
    '.pulse-ticker-clock',
    '-webkit-mask-image: linear-gradient(to right, transparent 0, #000 14px',
    'mask-image: linear-gradient(to right, transparent 0, #000 14px',
    '-webkit-mask-image: none;',
    'mask-image: none;'
  ]) {
    if (!shellExtras.includes(snippet)) fail(`Live Pulse mobile reading-lane CSS missing: ${snippet}`);
  }
  const smoke = await readText('tests/smoke.mjs');
  if (!smoke.includes("name: 'live-pulse-personal-ribbons'")) {
    fail('smoke catalog must include the Live Pulse personal ribbon desktop/mobile suite');
  }
  if (!smoke.includes("name: 'live-pulse-daily-curio'")) {
    fail('smoke catalog must include the Live Pulse daily Curio desktop/mobile suite');
  }
  for (const snippet of [
    'function renderWhileAwayNetworkCard()',
    'getDailyDeltaSignalSummaries(2)',
    'accountBullets.slice(0, 3)',
    'networkBullets.slice(0, 2)',
    'if (!accountBullets.length && !networkBullets.length) return null;',
    'quietlySyncHtml(slot, html)',
    "window.addEventListener('my-tezos-network-context-rendered', renderWhileAwayNetworkCard)"
  ]) {
    if (!myTezos.includes(snippet)) fail(`My Tezos away-report contract missing: ${snippet}`);
  }
  if (myTezos.includes('cards.push(_activeOvernightCard)')) {
    fail('My Tezos away report must render in Network Context, not the general Morning Brief');
  }
  for (const snippet of [
    'export function countExplicitLinkedEtherlinkAccounts',
    'return countExplicitLinkedEtherlinkAccounts(activeAddress) > 0'
  ]) {
    if (!siteJourney.includes(snippet)) fail(`My Tezos explicit Etherlink link-count contract missing: ${snippet}`);
  }
  for (const snippet of [
    '.network-personal-spotlight',
    '.network-personal-facts',
    '.network-personal-fact',
    '.network-context-columns',
    '.network-live-column',
    '.network-away-slot:empty',
    '.network-away-card',
    '.network-away-sections',
    '.network-context-now-heading',
    '.network-signal.is-network-lead',
    '.network-signal-relevance'
  ]) {
    if (!styles.includes(snippet)) fail(`My Tezos personalized Network Context CSS missing: ${snippet}`);
  }
  if (briefing.includes('Earlier today') || shellExtras.includes('.hot-today-earlier')) {
    fail('What is hot today must not render a dead earlier-category breadcrumb');
  }

  for (const snippet of [
    '[data-pulse-weight="state"]',
    '[data-pulse-weight="priority"]',
    '[data-pulse-weight="event"]',
    '[data-pulse-weight="milestone"]',
    '.pulse-ticker-mark',
    '.pulse-ticker-shelf'
  ]) {
    if (!shellExtras.includes(snippet)) fail(`Live Pulse ticker weight CSS missing: ${snippet}`);
  }
  if (/\.pulse-ticker-item\[data-pulse-weight="(?:priority|event|milestone)"\][\s\S]{0,300}?background:/.test(shellExtras)) {
    fail('Live Pulse weight tiers must use words, glyphs, and type color without persistent card highlighting');
  }

  const chamberSignalContracts = [
    ['js/features/staking-chamber.js', "visual: 'staking'", "route: '/stake/'"],
    ['js/features/liquidity-baking.js', 'dispatchLiquidityBakingHotSignal', "visual: 'lb'"],
    ['js/features/maxis.js', 'dispatchMaxisHotSignals', "spectacle: 'historic'"],
    ['js/features/whales.js', "visual: 'whale'", "spectacle: amountXtz >= 1_000_000 ? 'peacock' : 'headliner'", 'valueXtz: amountXtz'],
    ['js/features/tezos-domains.js', "visual: 'domains'", "spectacle: 'headliner'"],
    ['js/features/tezlink.js', "visual: 'etherlink'", "transactionsToday >= 100_000 ? 'headliner' : 'curious'"]
  ];
  for (const [file, ...snippets] of chamberSignalContracts) {
    const source = await readText(file);
    for (const snippet of snippets) {
      if (!source.includes(snippet)) fail(`${file} missing What is hot today signal contract: ${snippet}`);
    }
  }

  pass('Network Context feature routes and spectacle signals stay clickable');
}

function checkMilestoneLifecycleBehavior() {
  try {
    const now = 1_700_000_000_000;
    const ttlMs = 72 * 60 * 60 * 1000;
    const thresholds = [100, 200];
    const legacyStore = normalizeMilestoneStore({
      'blocks:100': { track: 'blocks', target: '100', createdAt: now - 1000 }
    });
    const baseline = advanceMilestoneTrack(legacyStore, {
      trackId: 'blocks',
      currentValue: 105,
      thresholds,
      now,
      ttlMs
    });
    assert.equal(baseline.baseline, true);
    assert.equal(baseline.activeMoments.length, 0);
    assert.equal(legacyStore.tracks.blocks.celebratedTargets['100'].baseline, true);

    const store = normalizeMilestoneStore(null);
    const first = advanceMilestoneTrack(store, {
      trackId: 'blocks',
      currentValue: 95,
      thresholds,
      now,
      ttlMs
    });
    assert.equal(first.activeMoments.length, 0);
    const crossing = advanceMilestoneTrack(store, {
      trackId: 'blocks',
      currentValue: 101,
      thresholds,
      now: now + 1000,
      ttlMs
    });
    assert.equal(crossing.newlyCrossed.length, 1);
    assert.equal(crossing.activeMoments[0].expiresAt, now + 1000 + ttlMs);

    const movedAway = advanceMilestoneTrack(store, {
      trackId: 'blocks',
      currentValue: 150,
      thresholds,
      now: now + ttlMs - 1000,
      ttlMs
    });
    assert.equal(movedAway.activeMoments.length, 1);
    const expired = advanceMilestoneTrack(store, {
      trackId: 'blocks',
      currentValue: 99,
      thresholds,
      now: now + ttlMs + 1001,
      ttlMs
    });
    assert.equal(expired.activeMoments.length, 0);
    assert.ok(store.tracks.blocks.celebratedTargets['100']);
    const noRearm = advanceMilestoneTrack(store, {
      trackId: 'blocks',
      currentValue: 101,
      thresholds,
      now: now + ttlMs + 2000,
      ttlMs
    });
    assert.equal(noRearm.newlyCrossed.length, 0);
    assert.equal(noRearm.activeMoments.length, 0);

    const arrivals = new Set();
    assert.equal(claimMilestoneArrival(arrivals, 'blocks|100|event'), true);
    assert.equal(claimMilestoneArrival(arrivals, 'blocks|100|event'), false);
    assert.equal(claimMilestoneArrival(arrivals, 'blocks|200|event'), true);

    const catalogMoments = deriveMilestoneMoments({
      currentValue: 112,
      thresholds,
      now: now + (24 * 60 * 60 * 1000),
      ttlMs,
      anchorValue: 95,
      anchorObservedAt: now
    });
    assert.equal(catalogMoments.length, 1);
    assert.equal(catalogMoments[0].target, 100);
    assert.ok(catalogMoments[0].createdAt > now);
    assert.equal(catalogMoments[0].expiresAt, catalogMoments[0].createdAt + MILESTONE_MOMENT_TTL_MS);
    const staleCatalogMoments = deriveMilestoneMoments({
      currentValue: 180,
      thresholds,
      now: now + (10 * 24 * 60 * 60 * 1000),
      ttlMs,
      anchorValue: 95,
      anchorObservedAt: now
    });
    assert.equal(staleCatalogMoments.length, 0);

    const tooEarly = qualifyMilestoneNearState({
      currentValue: 2852,
      thresholds: [3000],
      nearWindow: 180,
      dailyRate: 1,
      maxLeadDays: 14,
      absoluteMaxDays: 30
    });
    assert.equal(tooEarly, null);
    const withinTwoWeeks = qualifyMilestoneNearState({
      currentValue: 2988,
      thresholds: [3000],
      nearWindow: 180,
      dailyRate: 1,
      maxLeadDays: 14,
      absoluteMaxDays: 30
    });
    assert.equal(Math.ceil(withinTwoWeeks.etaDays), 12);
    const beyondAbsoluteCap = qualifyMilestoneNearState({
      currentValue: 2969,
      thresholds: [3000],
      nearWindow: 180,
      dailyRate: 1,
      maxLeadDays: 45,
      absoluteMaxDays: 30
    });
    assert.equal(beyondAbsoluteCap, null);
    const insideAbsoluteCap = qualifyMilestoneNearState({
      currentValue: 2971,
      thresholds: [3000],
      nearWindow: 180,
      dailyRate: 1,
      maxLeadDays: 45,
      absoluteMaxDays: 30
    });
    assert.equal(Math.ceil(insideAbsoluteCap.etaDays), 29);
    pass('milestone lifecycle behavior covers shared receipts, baseline, crossing, TTL, tombstones, one-time arrival, and the 30-day near cap');
  } catch (error) {
    fail(`milestone lifecycle behavior failed: ${error.message}`);
  }
}

async function checkMilestoneCatalogContracts() {
  try {
    const catalog = JSON.parse(await readText('data/milestone-catalog.json'));
    assert.equal(catalog.schema, MILESTONE_CATALOG_SCHEMA);
    assert.equal(catalog.cadence?.days, MILESTONE_REFRESH_DAYS);
    assert.equal(catalog.cadence?.commits, MILESTONE_REFRESH_COMMITS);
    assert.ok(Number.isFinite(Number(catalog.generatedAtCommitCount)));
    assert.ok(Number.isFinite(Date.parse(catalog.generatedAt)));
    assert.ok(generatedMilestoneAnchor(catalog, 'blocks'));
    assert.ok(Array.isArray(generatedMilestoneMoments(catalog, 'blocks')));

    for (const trackId of Object.keys(MILESTONE_BASE_THRESHOLDS)) {
      const generated = generatedMilestoneThresholds(catalog, trackId);
      const base = MILESTONE_BASE_THRESHOLDS[trackId];
      assert.ok(generated.length >= base.length, `${trackId} generated thresholds should preserve the base catalog`);
      assert.deepEqual(generated.slice(0, base.length), [...base]);
      assert.ok(catalog.tracks?.[trackId]?.nextTarget == null || generated.includes(catalog.tracks[trackId].nextTarget));
    }

    assert.ok(MILESTONE_BASE_THRESHOLDS.cycle.includes(1250));
    assert.ok(MILESTONE_BASE_THRESHOLDS.cycle.includes(1300));
    assert.ok(MILESTONE_BASE_THRESHOLDS.cycle.includes(1400));
    const staleCycleCatalog = {
      schema: MILESTONE_CATALOG_SCHEMA,
      tracks: { cycle: { thresholds: [1000, 1250, 1500] } }
    };
    assert.ok(mergedMilestoneThresholds(staleCycleCatalog, 'cycle').includes(1300));
    assert.equal(cycleMilestoneStartLevel({
      currentCycle: 1300,
      currentCycleStartLevel: 14174689,
      targetCycle: 1300,
      blocksPerCycle: 14400
    }), 14174689);
    assert.equal(cycleMilestoneStartLevel({
      currentCycle: 1302,
      currentCycleStartLevel: 14203489,
      targetCycle: 1300,
      blocksPerCycle: 14400
    }), 14174689);
    const extendedCycles = extendMilestoneThresholds('cycle', 2601);
    assert.ok(extendedCycles.includes(2700) && extendedCycles.includes(2800));
    assert.equal(extendedCycles[extendedCycles.indexOf(2700) + 1] - 2700, 100);
    const extendedBlocks = extendMilestoneThresholds('blocks', 31_200_000);
    assert.ok(extendedBlocks.at(-1) > 31_200_000);
    const cadenceBase = Date.parse('2026-07-01T00:00:00Z');
    assert.equal(milestoneCatalogCadence({ generatedAt: new Date(cadenceBase).toISOString(), generatedAtCommitCount: 700, now: cadenceBase + (13 * 86400000), commitCount: 799 }).due, false);
    assert.equal(milestoneCatalogCadence({ generatedAt: new Date(cadenceBase).toISOString(), generatedAtCommitCount: 700, now: cadenceBase + (14 * 86400000), commitCount: 799 }).due, true);
    assert.equal(milestoneCatalogCadence({ generatedAt: new Date(cadenceBase).toISOString(), generatedAtCommitCount: 700, now: cadenceBase + (13 * 86400000), commitCount: 800 }).due, true);
    const generator = await readText('scripts/generate-milestone-catalog.mjs');
    const orchestrator = await readText('scripts/refresh-generated-surfaces.mjs');
    for (const snippet of ['MILESTONE_REFRESH_DAYS', 'MILESTONE_REFRESH_COMMITS', '--project-next-commit']) {
      assert.ok(generator.includes(snippet) || orchestrator.includes(snippet), `milestone cadence missing ${snippet}`);
    }
    assert.ok(generator.includes('recentCrossings'));
    assert.ok(generator.includes('MILESTONE_MOMENT_TTL_MS'));
    assert.ok(generator.includes("const OCTEZ = 'https://eu.rpc.tez.capital'"));
    assert.ok(generator.includes("const OCTEZ_ARCHIVE = 'https://tezos-mainnet.octez.io'"));
    assert.ok(generator.includes('fetchJson(OCTEZ_ARCHIVE, headerPath)'));
    assert.ok(generator.includes('exactCycleMilestoneMoment'));
    assert.ok(generator.includes('Octez mainnet head and cycle with TzKT indexed statistics'));
    assert.ok(orchestrator.includes("MILESTONE_TARGETS = ['data/milestone-catalog.json']"));
    pass('milestone catalog preserves curated thresholds and regenerates after 14 days or 100 commits');
  } catch (error) {
    fail(`milestone catalog contracts failed: ${error.message}`);
  }
}

async function checkVisitStreakBehavior() {
  const originalGlobals = new Map();
  const rememberGlobal = (key) => {
    originalGlobals.set(key, {
      exists: Object.prototype.hasOwnProperty.call(globalThis, key),
      value: globalThis[key]
    });
  };
  const restoreGlobals = () => {
    for (const [key, original] of originalGlobals) {
      if (original.exists) globalThis[key] = original.value;
      else delete globalThis[key];
    }
  };
  const createStorage = (seed = {}) => {
    const values = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
    return {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value))
    };
  };

  for (const key of ['__visitStreakEnqueue', 'document', 'localStorage', 'requestAnimationFrame', 'setTimeout']) {
    rememberGlobal(key);
  }

  try {
    const source = await readText('js/features/streak.js');
    const styles = `${await readText('css/styles.css')}\n${await readText('css/shell-extras.css')}`;
    const queueImport = "import { enqueueToast } from '../ui/toast-queue.js';";
    assert.ok(source.includes(queueImport), 'visit streak must keep using the shared toast queue');
    assert.doesNotMatch(source, /STREAK_SCOPE_COPY|Browser-local · Details in Settings/, 'signal toasts must not expose storage mechanics');
    for (const contract of [
      '.visit-streak-toast.signal-bloom',
      '.signal-bloom-sigil',
      '.signal-bloom-number',
      '.signal-bloom-share',
      '@keyframes signal-bloom-digit-enter',
      '@media (prefers-reduced-motion: reduce)'
    ]) {
      assert.ok(styles.includes(contract), `Signal Bloom CSS missing ${contract}`);
    }
    const testSource = source.replace(
      queueImport,
      'const enqueueToast = (item) => globalThis.__visitStreakEnqueue(item);'
    );
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(testSource).toString('base64')}`;
    const { initStreak } = await import(moduleUrl);
    const now = new Date(2026, 6, 10, 12, 0, 0);
    const today = '2026-07-10';
    const yesterday = '2026-07-09';

    const runVisit = (seed = {}) => {
      const queued = [];
      const current = { textContent: '' };
      globalThis.localStorage = createStorage(seed);
      globalThis.__visitStreakEnqueue = (item) => queued.push(item);
      globalThis.document = {
        getElementById: (id) => id === 'visit-streak-current' ? current : null
      };
      initStreak(now);
      return { current, queued, storage: globalThis.localStorage };
    };

    const renderToast = (item) => {
      const appended = [];
      class FakeElement {
        constructor(tagName) {
          this.tagName = tagName;
          this.children = [];
          this.listeners = new Map();
          this.classNames = new Set();
          this.classList = {
            add: (...names) => names.forEach((name) => this.classNames.add(name)),
            remove: (...names) => names.forEach((name) => this.classNames.delete(name))
          };
          this.textContent = '';
          this.isConnected = false;
        }
        setAttribute(name, value) { this[name] = String(value); }
        addEventListener(name, listener) { this.listeners.set(name, listener); }
        append(...children) { this.children.push(...children); }
        remove() { this.isConnected = false; }
      }
      globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
        body: {
          appendChild: (node) => {
            node.isConnected = true;
            appended.push(node);
          }
        }
      };
      globalThis.requestAnimationFrame = (callback) => callback();
      globalThis.setTimeout = (callback) => {
        callback();
        return 0;
      };
      item.show(() => {}, item.duration);
      return appended[0];
    };
    const findByClass = (node, className) => {
      if (!node) return null;
      if (String(node.className || '').split(/\s+/).includes(className)) return node;
      for (const child of node.children || []) {
        const found = findByClass(child, className);
        if (found) return found;
      }
      return null;
    };

    const firstVisit = runVisit();
    assert.equal(firstVisit.queued.length, 0, 'first visit must start silently without a welcome toast');
    assert.equal(firstVisit.current.textContent, 'Current streak: 1 day');
    assert.equal(firstVisit.storage.getItem('tezos_streak_count'), '1');
    assert.equal(firstVisit.storage.getItem('tezos_streak_last_visit'), today);

    const sameDayReload = runVisit({
      tezos_streak_count: 2,
      tezos_streak_last_visit: today
    });
    assert.equal(sameDayReload.queued.length, 0, 'same-day reload must not replay the streak toast');
    assert.equal(sameDayReload.current.textContent, 'Current streak: 2 days');

    const nextDayVisit = runVisit({
      tezos_streak_count: 1,
      tezos_streak_last_visit: yesterday
    });
    assert.equal(nextDayVisit.queued.length, 0, 'ordinary advancing days must stay silent');
    assert.equal(nextDayVisit.storage.getItem('tezos_streak_count'), '2');

    const resetVisit = runVisit({
      tezos_streak_count: 8,
      tezos_streak_last_visit: '2026-07-01'
    });
    assert.equal(resetVisit.storage.getItem('tezos_streak_count'), '1');
    assert.equal(resetVisit.queued.length, 0, 'a missed-day reset must stay silent');

    for (const ordinaryCount of [8, 14, 30, 60, 99, 101, 364, 366]) {
      const ordinaryVisit = runVisit({
        tezos_streak_count: ordinaryCount - 1,
        tezos_streak_last_visit: yesterday
      });
      assert.equal(ordinaryVisit.queued.length, 0, `ordinary Day ${ordinaryCount} must stay silent`);
      assert.equal(ordinaryVisit.storage.getItem('tezos_streak_count'), String(ordinaryCount));
    }

    const signalCounts = [7, 10, 11, 22, 33, 100, 111, 222, 333, 365, 444, 555, 666, 777, 888, 999, 1000, 1111];
    for (const signalCount of signalCounts) {
      const signalVisit = runVisit({
        tezos_streak_count: signalCount - 1,
        tezos_streak_last_visit: yesterday
      });
      assert.equal(signalVisit.queued.length, 1, `Day ${signalCount} must enqueue one hidden signal`);
      assert.equal(signalVisit.queued[0].duration, 11000, `Day ${signalCount} signal duration mismatch`);
      const signalToast = renderToast(signalVisit.queued[0]);
      assert.match(signalToast.className, /\bsignal-bloom\b/);
      assert.match(signalToast.className, /\bmilestone\b/);
      assert.equal(signalToast['data-streak-count'], String(signalCount));
      assert.ok(signalToast['data-signal-kind'], `Day ${signalCount} signal kind missing`);
      const announcement = findByClass(signalToast, 'signal-bloom-announcement');
      assert.match(announcement?.textContent || '', new RegExp(`Day ${signalCount.toLocaleString('en-US')}`));
      assert.doesNotMatch(announcement?.textContent || '', /browser-local|stored locally|Settings → Visit streak/i);
      const number = findByClass(signalToast, 'signal-bloom-number');
      assert.equal((number?.children || []).map((child) => child.textContent).join(''), signalCount.toLocaleString('en-US'));
      const share = findByClass(signalToast, 'signal-bloom-share');
      assert.equal(share?.textContent, 'Share the signal');
      assert.match(share?.['aria-label'] || '', new RegExp(`Day ${signalCount.toLocaleString('en-US')}`));
    }

    pass('visit streak advances quietly and blooms only for the hidden numerology and landmark signal catalog');
  } catch (error) {
    fail(`visit streak behavior failed: ${error.message}`);
  } finally {
    restoreGlobals();
  }
}

async function checkReadmeContracts() {
  const readme = await readText('README.md');
  const themeSource = await readText('js/ui/theme.js');
  const index = await readText('index.html');
  const themeMatch = themeSource.match(/const THEMES = \[([^\]]+)\]/);
  const themes = themeMatch ? Array.from(themeMatch[1].matchAll(/['"]([^'"]+)['"]/g)).map((match) => match[1]) : [];

  if (!themes.length) {
    fail('js/ui/theme.js theme list could not be parsed for README contract checks');
  }

  const stalePatterns = [
    [/Zero dependencies/i, 'README must not claim zero dependencies'],
    [/every 2 minutes/i, 'README must not claim the main refresh runs every 2 minutes'],
    [/60s refresh/i, 'README must not claim price refresh is 60s'],
    [/localhost:8888|http\.server 8888/i, 'README must not mention the old local dev port 8888'],
    [/12 visual themes/i, 'README must not claim 12 visual themes while theme.js defines a different count']
  ];
  for (const [pattern, message] of stalePatterns) {
    if (pattern.test(readme)) fail(message);
  }

  const requiredSnippets = [
    `${themes.length} visual themes`,
    'npm ci',
    'npm run install-hooks',
    'npm run serve',
    'http://localhost:9000',
    'npm run build:css',
    'npm run refresh:generated',
    'npm run refresh:milestones',
    'npm run refresh:maxis',
    'npm run check:maxis',
    'npm run routes:chambers',
    'npm run og:chambers',
    'npm run bake:compare',
    'npm run refresh:governance',
    'npm run guard:readme',
    'npm run check:readme',
    'npm run test:smoke:list',
    'SKIP_README_GUARD=1',
    'Headline telemetry refresh: 15 minutes; full dashboard refresh: 2 hours',
    'Sparkline refresh: 10 minutes',
    'Price refresh: 30 minutes',
    'Memory cache TTL: 1 minute',
    'Storage cache TTL: 4 hours',
    'css/styles.min.css',
    'scripts/lib/playwright-browser.cjs',
    'BROWSER_EXECUTABLE_PATH',
    'CACHE_NAME',
    'version.json',
    'June 30, 2018'
  ];
  for (const snippet of requiredSnippets) {
    if (!readme.includes(snippet)) fail(`README missing current contract text: ${snippet}`);
  }

  for (const theme of themes) {
    if (!readme.includes(`\`${theme}\``)) fail(`README theme table missing ${theme}`);
  }

  if (!index.includes(`${themes.length} visual themes`)) {
    fail(`index.html schema featureList must agree with theme.js count (${themes.length} visual themes)`);
  }

  pass(`README contracts checked against package/config/theme reality (${themes.length} themes)`);
}

async function checkMaxisContracts() {
  const config = JSON.parse(await readText('data/maxis-contracts.json'));
  const careerArtifact = JSON.parse(await readText('data/maxis-careers.json'));
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
    const actualShardHash = createHash('sha256').update(rawShard).digest('hex');
    if (!/^[0-9a-f]{64}$/.test(expectedShardHash || '') || actualShardHash !== expectedShardHash) {
      fail(`maxis Passport shard ${shard} does not match its SHA-256 receipt`);
    }
    verifiedShardHashes[shard] = actualShardHash;
    const payload = JSON.parse(rawShard);
    if (seasonSummary?.passports?.algorithm === 'sha256-compact-json-v1' && rawShard !== `${JSON.stringify(payload)}\n`) {
      fail(`maxis Passport shard ${shard} is not canonical compact JSON`);
    }
    passportShardPayloads.set(shard, payload);
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
    ['maxis app import', 'initMaxisChamber', app],
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
    ['feature initializer', 'initTezosCrpChamber', app],
    ['pretty route opener', "case 'tezoscrp':", app],
    ['hash route', "hash === 'tezoscrp'", app],
    ['close cleanup', 'closeTezosCrpChamber', app],
    ['People category facet', "id: 'tezoscrp'", siteMap],
    ['category target', "tezoscrp: { selector: '#tezoscrp-entry-card', layout: 'featured' }", app],
    ['site-map destination', "href: '/tezoscrp/'", siteMap],
    ['site-map records intent', "view=records", siteMap],
    ['site-map archive intent', "view=archive", siteMap],
    ['pretty route metadata', "slug: 'tezoscrp'", routes],
    ['generated data target', "'data/tezoscrp-summary.json'", generatedSurfaces],
    ['central summary version stamp', "versionedAsset('/data/tezoscrp-summary.json')", feature],
    ['central archive version stamp', "versionedAsset('/data/tezoscrp-awards.json')", feature],
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
  for (const selector of ['.tezoscrp-entry-card', '.tezoscrp-entry-identity-strip', '.tezoscrp-entry-pulse', '.tezoscrp-system-strip', '.tezoscrp-hero-badges', '.tezoscrp-overlay', '.tezoscrp-tabs', '.tezoscrp-ranking', '.tezoscrp-record-board', '.tezoscrp-record-holder-grid', '.tezoscrp-category-grid', '.tezoscrp-archive-list']) {
    if (!css.includes(selector)) fail(`TezosCRP CSS is missing ${selector}`);
  }
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

async function checkLiveNumberMotionContracts() {
  const [magic, animations, app, smoke, styles, ledgerFlowCss, tezosDomainsCss] = await Promise.all([
    readText('js/effects/data-magic.js'),
    readText('js/ui/animations.js'),
    readText('js/core/app.js'),
    readText('tests/smoke.mjs'),
    readText('css/styles.css'),
    readText('css/ledger-flow.css'),
    readText('css/tezos-domains.css')
  ]);

  const expectedThemeModes = {
    aurora: 'resolve',
    matrix: 'scramble',
    hen: 'scramble',
    default: 'focus',
    void: 'focus',
    ember: 'kindle',
    signal: 'sweep',
    nerv: 'scramble',
    clean: 'delta',
    dark: 'focus',
    bubblegum: 'scramble',
    abyss: 'sonar',
    moss: 'growth',
    valley: 'growth',
    warzone: 'lock'
  };
  for (const [theme, mode] of Object.entries(expectedThemeModes)) {
    const personality = new RegExp(`\\b${theme}:\\s*\\{[^}]*\\bmode:\\s*['"]${mode}['"]`, 's');
    if (!personality.test(magic)) fail(`live number motion must retain the explicit ${theme} → ${mode} personality`);
  }

  for (const hook of ['window.__DATA_MAGIC_TEST__', 'flushAmbientForTest']) {
    if (!magic.includes(hook)) fail(`live number motion deterministic browser hook missing ${hook}`);
  }

  for (const rule of [
    '.dm-glyph-word{display:inline-block!important;white-space:nowrap!important}',
    '.dm-delta-char{display:inline-block!important;',
    '.dm-mycelial-char{display:inline-block!important;',
    '.dm-lock-char{display:inline-block!important;'
  ]) {
    if (!magic.includes(rule)) fail(`character reveal geometry guard missing ${rule}`);
  }
  const directMetricSelectors = [
    ['Tezos X launcher', styles, '.tezlink-entry-metric > span'],
    ['shared Chamber launcher', styles, '.chamber-entry-metric > span'],
    ['governance now card', styles, '.chamber-now-card > span'],
    ['governance watch card', styles, '.chamber-now-watch > div > span'],
    ['ctez console', styles, '.ctez-console-metric > span'],
    ['shared room metric grid', styles, '.lb-metric-grid > div > span'],
    ['Ledger Flow launcher', ledgerFlowCss, '.ledger-flow-entry-metrics .chamber-entry-metric > span'],
    ['Tezos Domains launcher', tezosDomainsCss, '.td-entry-metric > span'],
    ['Tezos Domains room pulse', tezosDomainsCss, '.td-pulse-metric > span']
  ];
  for (const [label, source, selector] of directMetricSelectors) {
    if (!source.includes(selector)) fail(`${label} labels must target direct children so reveal glyphs keep settled geometry`);
  }
  const broadGlyphSelectors = [
    ['Tezos X launcher', styles, /\.tezlink-entry-metric\s+(?!>)span\b/],
    ['shared Chamber launcher', styles, /\.chamber-entry-metric\s+(?!>)span\b/],
    ['governance now card', styles, /\.chamber-now-card\s+(?!>)span\b/],
    ['governance watch card', styles, /\.chamber-now-watch\s+(?!>)span\b/],
    ['ctez console', styles, /\.ctez-console-metric\s+(?!>)span\b/],
    ['shared room metric grid', styles, /\.lb-metric-grid\s+(?!>)span\b/],
    ['Ledger Flow launcher', ledgerFlowCss, /\.ledger-flow-entry-metrics\s+\.chamber-entry-metric\s+(?!>)span\b/],
    ['Tezos Domains launcher', tezosDomainsCss, /\.td-entry-metric\s+(?!>)span\b/],
    ['Tezos Domains room pulse', tezosDomainsCss, /\.td-pulse-metric\s+(?!>)span\b/]
  ];
  for (const [label, source, selector] of broadGlyphSelectors) {
    if (selector.test(source)) fail(`${label} regained a descendant span selector that can stack temporary reveal glyphs vertically`);
  }

  const setterStart = magic.indexOf('export function setMagicNumber');
  const setterEnd = magic.indexOf('/**\n * One-shot accent shimmer', setterStart);
  const setter = magic.slice(setterStart, setterEnd);
  if (setterStart < 0 || setterEnd < 0) {
    fail('live number motion setter contract could not be located');
  } else {
    if (!/previousText\s*===\s*text/.test(setter) || !/return false;/.test(setter)) {
      fail('live number setter must make exact text equality authoritative and skip unchanged animation');
    }
    if (/queueVisibleMagic\(/.test(setter)) {
      fail('hidden/offscreen live-number changes must commit silently, never queue an old reveal for later');
    }
    if (
      !/if\s*\(unchanged\)\s*\{[\s\S]*?opts\.animate\s*===\s*false[\s\S]*?settleMagicText\(el,\s*text/.test(setter)
    ) {
      fail('explicit animate:false must settle and cancel an equal in-flight target inside the unchanged branch');
    }
    for (const token of ['aria-label', 'aria-busy']) {
      if (!setter.includes(token) && !magic.includes(token)) {
        fail(`live number animation must shield intermediate glyph frames with a stable ${token}`);
      }
    }
  }

  const ambientStart = magic.indexOf('function ambientTick');
  const ambientEnd = magic.indexOf('function scheduleAmbient', ambientStart);
  const ambient = magic.slice(ambientStart, ambientEnd);
  if (ambientStart < 0 || ambientEnd < 0) {
    fail('live number ambient contract could not be located');
  } else {
    const textRevealCalls = [
      'scrambleText(',
      'auroraResolve(',
      'kindleReveal(',
      'sweepLockReveal(',
      'deltaTickReveal(',
      'sonarEchoReveal(',
      'mycelialBloomReveal(',
      'targetLockReveal(',
      'focusReveal(',
      'revealValue(',
      'setMagicNumber('
    ];
    if (textRevealCalls.some((call) => ambient.includes(call)) || /textContent\s*=/.test(ambient)) {
      fail('ambient personality may decorate a stable value but must never mutate unchanged text');
    }
    if (!ambient.includes('pulseFresh(')) {
      fail('ambient live-number personality must retain a decorative non-text freshness pulse');
    }
  }

  const viewportStart = magic.indexOf('function inViewport');
  const viewportEnd = magic.indexOf('function isLeafMagicNumberCandidate', viewportStart);
  const viewport = magic.slice(viewportStart, viewportEnd);
  if (!/rect\.right\s*<=\s*0/.test(viewport) || !/rect\.left\s*>=\s*window\.innerWidth/.test(viewport)) {
    fail('live number viewport gate must treat horizontally clipped values as offscreen');
  }

  const mutationStart = magic.indexOf('function onMagicMutations');
  const mutationEnd = magic.indexOf('export function observeMagic', mutationStart);
  const mutation = magic.slice(mutationStart, mutationEnd);
  if (!mutation.includes('__dmMagicFinalText')) {
    fail('offscreen external number mutations must update the adopted final text without queuing a reveal');
  }
  const settleStart = magic.indexOf('function settleMagicText');
  const settleEnd = magic.indexOf('function applyFlair', settleStart);
  const settle = magic.slice(settleStart, settleEnd);
  if (!mutation.includes('settleMagicText(el, text') || !settle.includes('cancelMagic(el, { completeOwner })')) {
    fail('a newer offscreen external number must cancel any visible reveal already in flight');
  }
  if (
    !setter.includes('if (!opts.observer) el.__dmExplicitMagic = true')
    || !mutation.includes('if (el.__dmExplicitMagic)')
    || mutation.includes('setTimeout(reveal')
  ) {
    fail('explicit live-number setters and observer-managed legacy text must retain one writer per node');
  }
  if (
    !/if\s*\(el\.matches\(MAGIC_EXCLUDE\)\)\s*\{[\s\S]*?settleMagicText\(el,\s*text/.test(mutation)
  ) {
    fail('external loading or error text must cancel an older numeric animation before excluded targets are skipped');
  }
  for (const token of [
    'export function setMagicValue',
    'allowText: true',
    'completeOwner: true',
    '__dmMagicCancel',
    'force: true'
  ]) {
    if (!magic.includes(token)) fail(`generic live-value ownership contract missing ${token}`);
  }

  for (const token of [
    'selectionIntersects(el)',
    'captureTargetSelection(el)',
    'restoreTargetSelection(el, selection)',
    "document.addEventListener('selectionchange', guardSelectedMagic)"
  ]) {
    if (!magic.includes(token)) fail(`live number selection-preservation contract missing ${token}`);
  }
  for (const token of [
    'clippingValues',
    'ancestor.clientWidth',
    'ancestor.clientHeight',
    'visibleRight <= visibleLeft',
    'visibleBottom <= visibleTop'
  ]) {
    if (!viewport.includes(token)) fail(`live number overflow-clipping contract missing ${token}`);
  }

  for (const token of [
    'setMagicValue(frontValue, finalStr',
    'animateInitial: true',
    'sameActiveTarget',
    'sameSettledTarget',
    'cancelFresh(statFreshSurface(frontValue))'
  ]) {
    if (!animations.includes(token)) fail(`stat-card stale reveal ownership contract missing ${token}`);
  }
  const instantWriteStart = animations.indexOf('function writeStatInstant');
  const instantWriteEnd = animations.indexOf('/**', instantWriteStart);
  const instantWrite = animations.slice(instantWriteStart, instantWriteEnd);
  if (
    !instantWrite.includes('cancelFresh(statFreshSurface(element))')
    || !instantWrite.includes('setMagicValue(element, String(text)')
    || !instantWrite.includes('animate: false')
  ) {
    fail('an instant stat write must cancel active motion and freshness even when its formatted text is unchanged');
  }
  if (/await\s+flipCard\(/.test(app)) {
    fail('background card deltas must not await independent animations sequentially');
  }

  for (const snippet of [
    "name: 'live-number-motion'",
    'smokeLiveNumberShellMotion(browser, baseUrl, issues)',
    "observerValue.textContent = '82%'",
    "movingValue.textContent = '301'",
    'motion.statusRecovery.started',
    'motion.sameValueRace.active.flipStarted === false',
    'const characterLayoutFamilies =',
    "clean: '.dm-delta-char'",
    "moss: '.dm-mycelial-char'",
    "valley: '.dm-mycelial-char'",
    "warzone: '.dm-lock-char'",
    'family.rootHeightDelta <= 1',
    "result.readingState.selection === 'Selected reader text stays put'"
  ]) {
    if (!smoke.includes(snippet)) fail(`live number browser regression contract missing: ${snippet}`);
  }

  pass('live number exact-delta, settled Chamber geometry, view-state, stale-work, concurrency, selection, clipping, visibility, cancellation, accessibility, reduced-motion, ambient, and theme contracts checked');
}

async function checkQuietRefreshContracts() {
  const [quiet, app, daily, pulseTicker, myTezos, myBaker, tezlink, capital, minerals, uranium, metals, ecosystem, etherlink, domains, tz4, whales, giants, hen, health, lb, styles, smoke] = await Promise.all([
    readText('js/core/quiet-refresh.js'),
    readText('js/core/app.js'),
    readText('js/features/daily-briefing.js'),
    readText('js/ui/pulse-ticker.js'),
    readText('js/features/my-tezos.js'),
    readText('js/features/my-baker.js'),
    readText('js/features/tezlink.js'),
    readText('js/features/capital-chamber.js'),
    readText('js/features/minerals-chamber.js'),
    readText('js/features/uranium-chamber.js'),
    readText('js/features/metals-chamber.js'),
    readText('js/features/ecosystem-chamber.js'),
    readText('js/features/etherlink-governance.js'),
    readText('js/features/tezos-domains.js'),
    readText('js/features/tz4-adoption.js'),
    readText('js/features/whales.js'),
    readText('js/features/sleeping-giants.js'),
    readText('js/features/hen-mode.js'),
    readText('js/features/network-health.js'),
    readText('js/features/liquidity-baking.js'),
    readText('css/styles.css'),
    readText('tests/smoke.mjs')
  ]);

  const requiredQuietHelpers = ['quietlyMutate', 'quietlySyncHtml', 'quietlySyncElement', 'captureSelection', 'captureViewportAnchor'];
  for (const helper of requiredQuietHelpers) {
    if (!quiet.includes(helper)) fail(`quiet refresh helper missing ${helper}`);
  }
  for (const snippet of [
    'data-pulse-motion',
    'capturePhase',
    'restorePhase',
    'window.requestAnimationFrame',
    "matchMedia('(prefers-reduced-motion: reduce)')",
    'IntersectionObserver'
  ]) {
    if (!pulseTicker.includes(snippet)) fail(`Live Pulse ticker motion contract is missing ${snippet}`);
  }
  if ((pulseTicker.match(/requestAnimationFrame/g) || []).length !== 1 || /scrollLeft\s*[+-]?=/.test(pulseTicker)) {
    fail('Live Pulse ticker must use one frame-synchronized phase restore while drifting through one CSS animation, not a scripted loop');
  }
  if (!pulseTicker.includes('quietlySyncHtml(viewport, tickerHtml)')) fail('Live Pulse background signals must reconcile inside the stable ticker viewport');
  if (!daily.includes('quietlySyncHtml(container, html)')) fail('My Tezos network context must reconcile in place after its first render');
  if ((app.match(/document\.visibilityState === 'visible'\) refreshInBackground/g) || []).length < 2) {
    fail('headline and heavy dashboard timers must both defer while the tab is hidden');
  }
  const quietSurfaces = [myTezos, myBaker, tezlink, capital, minerals, uranium, metals, ecosystem, etherlink, domains, tz4, whales, giants, health, lb];
  if (quietSurfaces.some((source) => !source.includes('quiet-refresh.js'))) {
    fail('every audited live surface must import the shared quiet refresh contract');
  }
  const mintInsertStart = hen.indexOf('// Reverse so newest ends up at top');
  const mintInsertEnd = hen.indexOf('offset += fresh.length', mintInsertStart);
  const mintInsert = hen.slice(mintInsertStart, mintInsertEnd);
  if (!/feed\.scrollTop\s*=\s*previousScrollTop\s*\+\s*\(feed\.scrollHeight\s*-\s*previousScrollHeight\)/.test(mintInsert)
    || /feed\.scrollTo\(/.test(mintInsert)) {
    fail('HEN new mints must preserve the existing feed viewport at every scroll position');
  }
  const quietStyles = `${styles}\n${await readText('css/shell-extras.css')}`;
  if (!quietStyles.includes('[data-quiet-refreshing="true"]') || !quietStyles.includes('[data-quiet-refresh-settled="true"]')) {
    fail('quiet refresh CSS must suppress scroll animation and replayed entrances');
  }
  for (const snippet of ['drawer-live-columns', 'drawer-live-column-primary', 'columns.appendChild(network)', 'seedDrawerLoadingState', 'drawerLoadingCard']) {
    if (!myTezos.includes(snippet)) fail(`My Tezos stable loading/layout contract is missing ${snippet}`);
  }
  for (const snippet of ['.drawer-live-columns', '.drawer-live-columns > #drawer-network', '.network-context-columns', '@container (min-width: 720px)', '.drawer-loading-card', '.my-baker-loading-grid', '.my-baker-load-state']) {
    if (!styles.includes(snippet)) fail(`My Tezos stable loading/layout CSS is missing ${snippet}`);
  }
  if (!myBaker.includes('my-baker-loading-stat') || !myBaker.includes('Retry account stats')) {
    fail('My Baker first-load geometry and recoverable error state are missing');
  }
  if (!smoke.includes('first account read did not hold a shape-correct two-column frame')
    || !smoke.includes('full-width account journeys or independent stacks regressed')) {
    fail('My Tezos loading geometry regression coverage is missing');
  }
  if (!smoke.includes("name: 'quiet-refresh'")) fail('smoke catalog must include the quiet-refresh browsing-state suite');
  pass('quiet background refresh scroll, focus, selection, animation, and hidden-tab contracts checked');
}

async function checkMetalsIntegrationContracts() {
  const [
    snapshotText,
    entryText,
    feature,
    css,
    generator,
    packageText,
    generatedSurfaces,
    siteMap,
    app,
    routeHtml,
    ogGenerator,
    sw,
    openApiText,
    smoke
  ] = await Promise.all([
    readText('data/metals-snapshot.json'),
    readText('data/metals-entry-summary.json'),
    readText('js/features/metals-chamber.js'),
    readText('css/metals-chamber.css'),
    readText('scripts/refresh-metals-data.mjs'),
    readText('package.json'),
    readText('scripts/refresh-generated-surfaces.mjs'),
    readText('js/core/site-map.js'),
    readText('js/core/app.js'),
    readText('metals/index.html'),
    readText('scripts/generate-chamber-og-images.mjs'),
    readText('sw.js'),
    readText('.well-known/openapi.json'),
    readText('tests/smoke.mjs')
  ]);
  const snapshot = JSON.parse(snapshotText);
  const entry = JSON.parse(entryText);
  const packageJson = JSON.parse(packageText);
  const openApi = JSON.parse(openApiText);
  const expectedMetals = ['gold', 'silver', 'platinum', 'palladium', 'rhodium', 'ruthenium', 'iridium', 'osmium'];
  const expectedSymbols = ['Au', 'Ag', 'Pt', 'Pd', 'Rh', 'Ru', 'Ir', 'Os'];
  const metalIds = (snapshot.metals || []).map((row) => row.id);
  const metalSymbols = (snapshot.metals || []).map((row) => row.symbol);

  const { contentHash: snapshotHash, ...unsignedSnapshot } = snapshot;
  const { contentHash: entryHash, ...unsignedEntry } = entry;
  if (snapshot.schemaVersion !== 1
      || stableJsonHash(unsignedSnapshot) !== snapshotHash
      || JSON.stringify(metalIds) !== JSON.stringify(expectedMetals)
      || JSON.stringify(metalSymbols) !== JSON.stringify(expectedSymbols)
      || JSON.stringify(snapshot.taxonomy?.includedSymbols) !== JSON.stringify(expectedSymbols)) {
    fail('Precious Metals snapshot must retain one valid stable receipt for the canonical ordered eight-metal assay');
  }
  if (entry.schemaVersion !== 1
      || stableJsonHash(unsignedEntry) !== entryHash
      || entry.source?.path !== 'data/metals-snapshot.json'
      || entry.source?.contentHash !== snapshot.contentHash
      || !Array.isArray(entry.metals)
      || entry.metals.length !== expectedMetals.length) {
    fail('Precious Metals launcher projection must match the complete snapshot receipt and retain all eight availability rows');
  }

  const route = CHAMBER_ROUTES.find(({ slug }) => slug === 'metals');
  if (!route
      || route.hash !== '#metals'
      || routeUrl(route) !== 'https://tezos.systems/metals/'
      || !/eight/i.test(route.title)
      || !/without inferring backing/i.test(route.description)) {
    fail('Precious Metals canonical route metadata must retain its eight-metal and non-backing identity');
  }
  for (const [label, snippet, source] of [
    ['site-map destination', "id: 'metals'", siteMap],
    ['site-map canonical route', "href: '/metals/'", siteMap],
    ['site-map Assay view', "href: '/metals/?view=assay'", siteMap],
    ['site-map Markets view', "href: '/metals/?view=markets'", siteMap],
    ['site-map VNXAU view', "href: '/metals/?view=vnxau'", siteMap],
    ['site-map Proofbook view', "href: '/metals/?view=proofbook'", siteMap],
    ['app feature import', 'initMetalsChamber', app],
    ['app pretty-route opener', "case 'metals':", app],
    ['app hash alias', "params.has('precious-metals')", app],
    ['app modal cleanup', 'closeMetalsChamber', app],
    ['app routed overlay', "'metals-modal': { entryIds: ['metals']", app],
    ['app featured launcher target', "metals: { selector: '#metals-entry-card', layout: 'featured' }", app],
    ['explicit OG content', 'metals: {', ogGenerator]
  ]) {
    if (!source.includes(snippet)) fail(`Precious Metals ${label} contract is missing`);
  }
  if (!routeHtml.includes('data-chamber-route="metals"')
      || !routeHtml.includes('<link rel="canonical" href="https://tezos.systems/metals/">')
      || !routeHtml.includes('/og/metals.png')
      || !routeHtml.includes('Precious Metals')) {
    fail('Precious Metals generated route must retain its identity, canonical URL, title, and dedicated OG image');
  }

  const snapshotOperation = openApi.paths?.['/data/metals-snapshot.json']?.get;
  const entryOperation = openApi.paths?.['/data/metals-entry-summary.json']?.get;
  if (snapshotOperation?.operationId !== 'getMetalsSnapshot'
      || entryOperation?.operationId !== 'getMetalsEntrySummary'
      || !/complete Precious Metals/i.test(snapshotOperation?.summary || '')
      || !/compact Precious Metals/i.test(entryOperation?.summary || '')) {
    fail('OpenAPI must expose distinct complete and compact Precious Metals read-only artifacts');
  }
  for (const dataPath of ['/data/metals-entry-summary.json', '/data/metals-snapshot.json']) {
    if (!sw.includes(`'${dataPath}'`)) fail(`service worker network-only data inventory is missing ${dataPath}`);
  }
  if (!sw.includes('isNetworkOnlyDataPath(url.pathname)')) {
    fail('Precious Metals generated receipts must use the service worker network-only data branch');
  }

  if (packageJson.scripts?.['refresh:metals'] !== 'node scripts/refresh-metals-data.mjs'
      || packageJson.scripts?.['check:metals'] !== 'node scripts/refresh-metals-data.mjs --check'
      || packageJson.scripts?.['test:metals'] !== 'node tests/metals-check.mjs') {
    fail('package scripts must expose Precious Metals refresh, offline validation, and focused data checks');
  }
  for (const snippet of [
    "const METALS_TARGETS = ['data/metals-snapshot.json', 'data/metals-entry-summary.json']",
    "nodeScript('scripts/refresh-metals-data.mjs', ['--check'])",
    "nodeScript('scripts/refresh-metals-data.mjs')",
    'stageTargets(METALS_TARGETS)'
  ]) {
    if (!generatedSurfaces.includes(snippet)) fail(`generated-surface orchestration is missing Precious Metals contract ${snippet}`);
  }
  if (!generator.includes('data/metals-snapshot.json')
      || !generator.includes('data/metals-entry-summary.json')
      || !generator.includes('--check')) {
    fail('Precious Metals generator must own both bounded artifacts and an offline check mode');
  }

  for (const snippet of [
    "const METALS_SNAPSHOT_URL = '/data/metals-snapshot.json'",
    "const METALS_ENTRY_SUMMARY_URL = '/data/metals-entry-summary.json'",
    "['XAU', 'XAG', 'XPT', 'XPD', 'XRH', 'XRU', 'XIR', 'XOS']",
    "{ id: 'assay'",
    "{ id: 'markets'",
    "{ id: 'vnxau'",
    "{ id: 'proofbook'",
    'quietlySyncHtml(body, markup)',
    'quietlySyncHtml(front, markup)',
    'document.visibilityState',
    'visibilitychange',
    '__METALS_CHAMBER_REFRESH_MS__',
    '__METALS_ENTRY_REFRESH_MS__',
    'Last good',
    'No backing ratio or present redemption claim is calculated here.'
  ]) {
    if (!feature.includes(snippet)) fail(`Precious Metals browser truth/refresh contract is missing ${snippet}`);
  }
  const entryMarkupBlock = feature.match(/function entryMarkup\(snapshot\)[\s\S]*?(?=\nfunction wireEntry\()/)?.[0] || '';
  const entryTimerBlock = feature.match(/function startEntryRefreshTimer\(\)[\s\S]*?(?=\nfunction bindVisibilityRefresh\()/)?.[0] || '';
  const visibilityBlock = feature.match(/function bindVisibilityRefresh\(\)[\s\S]*?(?=\nasync function refreshMetalsEntry\()/)?.[0] || '';
  const entryRefreshBlock = feature.match(/async function refreshMetalsEntry\([\s\S]*?(?=\nasync function refreshMetalsChamber\()/)?.[0] || '';
  if (!entry.sourceStatuses?.imfPcps || !entry.sourceStatuses?.blockscoutVnxau
      || !entryMarkupBlock.includes("retainedSourceState(snapshot, 'imfPcps'")
      || !entryMarkupBlock.includes("retainedSourceState(snapshot, 'blockscoutVnxau'")
      || !entryMarkupBlock.includes('IMF last-good history')
      || !entryMarkupBlock.includes('VNXAU last-good holder addresses')) {
    fail('Precious Metals compact launcher must retain independent IMF and Blockscout receipts with explicit last-good labels');
  }
  if (!entryTimerBlock.includes("document.visibilityState !== 'visible'")
      || !entryTimerBlock.includes('entryRefreshDeferred = true')
      || !entryTimerBlock.includes("classList.contains('active')")
      || !entryTimerBlock.includes('refreshMetalsEntry({ quiet: true })')
      || !visibilityBlock.includes('entryRefreshDeferred && !overlayOpen')
      || !visibilityBlock.includes('refreshMetalsEntry({ quiet: true })')) {
    fail('Precious Metals compact timer must be room-aware, visibility-gated, and perform one compact catch-up');
  }
  if (!entryRefreshBlock.includes('markEntryRefreshFailure(error, { quiet })')
      || entryRefreshBlock.includes('refreshMetalsChamber')
      || entryRefreshBlock.includes('METALS_SNAPSHOT_URL')) {
    fail('Precious Metals compact-summary failure must retain or mark the launcher without falling back to the full snapshot');
  }
  for (const smokeContract of [
    '__METALS_ENTRY_REFRESH_MS__',
    'compact failure fetched the full room or remained in verification',
    'hidden launcher timer polled or mutated the closed card',
    'catch-up hid stale IMF/Blockscout clocks behind fresh Gold'
  ]) {
    if (!smoke.includes(smokeContract)) fail(`Precious Metals smoke is missing compact-launcher contract ${smokeContract}`);
  }
  if (/fetch\(\s*['"`]https?:/i.test(feature)
      || /data-metals-(?:buy|sell|trade|swap|bridge|redeem)|tradeUrl/i.test(feature)) {
    fail('Precious Metals browser must stay on same-origin generated receipts and expose no execution CTA contract');
  }
  for (const selector of [
    '.metals-entry-card',
    '.metals-content',
    '.metals-body',
    '.metals-tab',
    '.metals-metal-switch',
    '.metals-assay-grid',
    '.metals-clock-pair',
    '.metals-chain-grid',
    '.metals-proof-grid'
  ]) {
    if (!css.includes(selector)) fail(`Precious Metals CSS is missing ${selector}`);
  }
  const entryPerimeterBlock = css.match(/\.metals-entry-card::before\s*\{[^}]*\}/)?.[0] || '';
  if (!entryPerimeterBlock || /\banimation\s*:/.test(entryPerimeterBlock)) {
    fail('Precious Metals ordinary launcher perimeter must remain static; continuous attention is risk-only');
  }
  if (!smoke.includes("name: 'metals-chamber'")) {
    fail('smoke catalog must include the focused Precious Metals Chamber suite');
  }

  pass('Precious Metals route, artifacts, compact-only timers/failures, source clocks, and quiet-refresh integration contracts checked');
}

async function checkCapitalContracts() {
  const [snapshotText, feature, css, capitalGenerator, packageText, generatedSurfaces, chamberRoutes, siteMap, app, smoke] = await Promise.all([
    readText('data/capital-snapshot.json'),
    readText('js/features/capital-chamber.js'),
    readText('css/capital.css'),
    readText('scripts/refresh-capital-data.mjs'),
    readText('package.json'),
    readText('scripts/refresh-generated-surfaces.mjs'),
    readText('scripts/lib/chamber-routes.mjs'),
    readText('js/core/site-map.js'),
    readText('js/core/app.js'),
    readText('tests/smoke.mjs')
  ]);
  const snapshot = JSON.parse(snapshotText);
  const packageJson = JSON.parse(packageText);
  const { contentHash, ...unsignedSnapshot } = snapshot;

  if (snapshot.schemaVersion !== 1 || !Number.isFinite(Date.parse(snapshot.generatedAt || ''))) {
    fail('Capital snapshot must use schemaVersion 1 with an ISO generatedAt receipt');
  }
  if (!/^[0-9a-f]{64}$/.test(contentHash || '') || stableJsonHash(unsignedSnapshot) !== contentHash) {
    fail('Capital snapshot contentHash must match the stable unsigned snapshot payload');
  }
  if (Buffer.byteLength(snapshotText) > 2 * 1024 * 1024) {
    fail(`Capital snapshot exceeds the 2 MiB browser payload budget: ${Buffer.byteLength(snapshotText)} bytes`);
  }

  const defiChains = new Map((snapshot.defi?.chains || []).map((chain) => [chain.id, chain]));
  for (const chainId of ['tezos', 'etherlink']) {
    const chain = defiChains.get(chainId);
    if (!chain || !Array.isArray(chain.tvl?.history) || !chain.tvl.history.length
      || !Array.isArray(chain.stablecoins?.history) || !chain.stablecoins.history.length) {
      fail(`Capital snapshot must retain public TVL and stablecoin history for ${chainId}`);
    }
  }
  if (!Array.isArray(snapshot.network?.tezos?.transactions?.daily) || !snapshot.network.tezos.transactions.daily.length
    || !Array.isArray(snapshot.network?.etherlink?.series?.newTransactions) || !snapshot.network.etherlink.series.newTransactions.length
    || !Array.isArray(snapshot.network?.etherlink?.series?.newAccounts) || !snapshot.network.etherlink.series.newAccounts.length) {
    fail('Capital snapshot must retain explicitly labeled Tezos and Etherlink transaction histories');
  }
  if (!Array.isArray(snapshot.network?.tezos?.fees?.daily)
      || snapshot.network.tezos.fees.daily.length < 28
      || snapshot.network.tezos.fees.daily.some((row) => !Number.isFinite(row.totalMutez) || !Number.isFinite(row.blockCount))) {
    fail('Capital snapshot must retain at least 28 completed days of numeric Tezos L1 block-fee pools');
  }
  for (const key of ['transactionFees', 'averageTransactionFee', 'averageGasPrice']) {
    if (!Array.isArray(snapshot.network?.etherlink?.series?.[key]) || snapshot.network.etherlink.series[key].length < 300) {
      fail(`Capital snapshot must retain a long Etherlink ${key} daily series`);
    }
  }
  const capitalStats = snapshot.network?.tezos?.statistics || {};
  const expectedStakingRatio = ((capitalStats.ownStakedMutez + capitalStats.externalStakedMutez) / capitalStats.totalSupplyMutez) * 100;
  if (![capitalStats.ownStakedMutez, capitalStats.externalStakedMutez, capitalStats.totalSupplyMutez, capitalStats.stakingRatioPct].every(Number.isFinite)
    || Math.abs(capitalStats.stakingRatioPct - expectedStakingRatio) > 0.0001) {
    fail('Capital snapshot staking ratio must be own plus external staked XTZ divided by total supply');
  }
  for (const currency of ['usd', 'btc', 'eth']) {
    if (!Array.isArray(snapshot.markets?.xtz?.priceHistory?.[currency]) || snapshot.markets.xtz.priceHistory[currency].length < 365) {
      fail(`Capital snapshot must retain a 365-day XTZ/${currency.toUpperCase()} return input series`);
    }
  }
  if (snapshot.markets?.xtz?.tickers?.length !== 100 || snapshot.markets?.xtz?.coverage?.tickerHardCap !== 100) {
    fail('Capital snapshot must retain the complete disclosed first page of 100 CoinGecko ticker rows');
  }
  if (!capitalGenerator.includes('tickers.length !== COINGECKO_TICKER_PAGE_SIZE')
    || !capitalGenerator.includes('expected the complete first page of ${COINGECKO_TICKER_PAGE_SIZE}')) {
    fail('Capital generator must reject incomplete CoinGecko ticker pages so the last-known-good section survives');
  }
  const xu3o8 = (snapshot.rwa?.assets || []).find((asset) => asset.id === 'xu3o8');
  if (xu3o8?.contract?.toLowerCase() !== '0x79052ab3c166d4899a1e0dd033ac3b379af0b1fd'
    || xu3o8?.issuer !== 'Uranium.io' || xu3o8?.decimals !== 18) {
    fail('Capital snapshot must preserve the issuer-confirmed Etherlink xU3O8 contract receipt');
  }
  if (!Array.isArray(snapshot.art?.marketplaces) || snapshot.art.marketplaces.length < 3
    || !Array.isArray(snapshot.art?.topCollections30d) || !snapshot.art.topCollections30d.length
    || !Array.isArray(snapshot.art?.topBuyers30d) || !snapshot.art.topBuyers30d.length
    || !Array.isArray(snapshot.art?.topArtists30d) || !snapshot.art.topArtists30d.length
    || !/gross sales, not creator earnings or trader profit/i.test(snapshot.art?.coverage?.saleVolumeDefinition || '')) {
    fail('Capital snapshot must retain marketplace, collection, buyer, and artist coverage without a net-earnings claim');
  }
  if (!Array.isArray(snapshot.development?.octez?.daily) || !snapshot.development.octez.daily.length
    || snapshot.development?.octez?.windowDays !== 28
    || !/not all Tezos ecosystem development/i.test(snapshot.development?.octez?.scope || '')) {
    fail('Capital snapshot must retain a scoped 28-day Octez development receipt');
  }
  const unavailableById = new Map((snapshot.unavailable || []).map((item) => [item.id, item]));
  for (const id of ['comprehensive-cex-net-flows', 'proprietary-community-composite', 'xu3o8-sruuf-return-spread']) {
    const receipt = unavailableById.get(id);
    if (receipt?.status !== 'unavailable' || receipt?.methodology !== 'not-calculated' || !receipt?.reason) {
      fail(`Capital snapshot must carry an explicit unavailable methodology receipt for ${id}`);
    }
  }

  if (packageJson.scripts?.['refresh:capital'] !== 'node scripts/refresh-capital-data.mjs'
    || packageJson.scripts?.['check:capital'] !== 'node scripts/refresh-capital-data.mjs --check') {
    fail('package scripts must expose Capital snapshot refresh and offline validation');
  }
  const capitalCheckIndex = generatedSurfaces.indexOf("nodeScript('scripts/refresh-capital-data.mjs', ['--check'])");
  const capitalRefreshIndex = generatedSurfaces.indexOf("nodeScript('scripts/refresh-capital-data.mjs')");
  const milestoneIndex = generatedSurfaces.indexOf("nodeScript('scripts/generate-milestone-catalog.mjs'");
  if (capitalCheckIndex < 0 || capitalRefreshIndex < 0 || milestoneIndex < 0
    || capitalCheckIndex > milestoneIndex || capitalRefreshIndex > milestoneIndex
    || !generatedSurfaces.includes("const CAPITAL_TARGETS = ['data/capital-snapshot.json']")
    || !generatedSurfaces.includes('stageTargets(CAPITAL_TARGETS)')) {
    fail('generated surfaces must check/refresh and optionally stage Capital data before downstream generated outputs');
  }

  const routeContracts = [
    ['Capital Chamber route metadata', "slug: 'capital'", chamberRoutes],
    ['Capital Chamber site-map destination', "href: '/capital/'", siteMap],
    ['Capital Chamber site-map direct Markets view', "href: '/capital/?view=markets'", siteMap],
    ['Capital Chamber site-map direct network-fees view', "href: '/capital/?view=system&focus=fees'", siteMap],
    ['Capital Chamber app import', 'initCapitalChamber', app],
    ['Capital Chamber pretty route opener', "case 'capital':", app],
    ['Capital Chamber hash route', "hash === 'capital'", app],
    ['Capital Chamber close cleanup', 'closeCapitalChamber', app],
    ['Capital Chamber routed overlay', "'capital-modal': { entryIds: ['capital']", app],
    ['Capital Chamber category membership', "entryIds: Object.freeze(['capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber'])", siteMap]
  ];
  for (const [label, needle, source] of routeContracts) {
    if (!source.includes(needle)) fail(`${label} contract is missing`);
  }

  if (!feature.includes('data/capital-snapshot.json')) {
    fail('Capital Chamber must render from the first-party committed Capital snapshot');
  }
  if (!capitalGenerator.includes("select: 'fees'")
      || !capitalGenerator.includes("['transactionFees', 'txnsFee'")
      || !capitalGenerator.includes("['averageTransactionFee', 'averageTxnFee'")
      || !capitalGenerator.includes("['averageGasPrice', 'averageGasPrice'")) {
    fail('Capital generator must retain source-native L1 block fees plus Etherlink transaction-fee and gas histories');
  }
  for (const view of ['system', 'markets', 'assets', 'art']) {
    if (!new RegExp(`["']${view}["']`).test(feature)) fail(`Capital Chamber must expose the ${view} view`);
  }
  if (!/isStale|isAnomaly|trustScore/.test(feature) || !/quarantin|quality/i.test(feature)) {
    fail('Capital Markets must visibly quarantine low-quality, stale, or anomalous venue rows');
  }
  if (/\.tradeUrl\b|data-capital-trade|>\s*Trade\s*</i.test(feature)) {
    fail('Capital Markets must not ship direct exchange trading CTAs');
  }
  if (!feature.includes('RANGES.filter((range) => available.has(range.id))')
      || !feature.includes('source window')
      || !feature.includes('capital-network-costs')
      || !feature.includes('No fictional combined total')) {
    fail('Capital Chamber must expose only valid view ranges and keep network fees layer-separated');
  }
  if (!feature.includes('quiet-refresh.js') || !feature.includes('quietlySyncHtml')
    || !feature.includes("document.visibilityState === 'visible'")
    || !feature.includes('visibilitychange')
    || !feature.includes('__CAPITAL_CHAMBER_REFRESH_MS__')
    || !/lastGood|last-good|last good/i.test(feature)) {
    fail('Capital Chamber must use quiet reconciliation, a visibility gate/catch-up, test interval override, and last-good data');
  }
  for (const selector of ['.capital-entry-card', '.capital-entry-price-chart', '.capital-overlay', '.capital-tabs', '.capital-tab', '.capital-range-wrap', '.capital-range-static', '.capital-cost-section', '.capital-market-price-panel', '.capital-featured-price-chart', '.capital-quality', '.capital-source-receipt']) {
    if (!css.includes(selector)) fail(`Capital Chamber CSS is missing ${selector}`);
  }
  if (!smoke.includes("name: 'capital-chamber'")
      || !smoke.includes('window.__CAPITAL_CHAMBER_REFRESH_MS__')
      || !smoke.includes('window.__capitalSmokeTimerTick')) {
    fail('smoke catalog must include the focused Capital Chamber quiet-refresh suite');
  }

  if (!(await pathExists('capital/index.html')) || !(await pathExists('og/capital.png'))) {
    fail('Capital Chamber generated pretty route and OG image must exist');
  } else {
    const capitalRoute = await readText('capital/index.html');
    if (!capitalRoute.includes('<link rel="canonical" href="https://tezos.systems/capital/">')
      || !capitalRoute.includes('/og/capital.png')) {
      fail('Capital Chamber generated route must retain its canonical URL and dedicated OG image');
    }
  }

  pass(`Capital Chamber snapshot, source, route, quality, and quiet-refresh contracts checked (${snapshot.markets.xtz.tickers.length} venue rows)`);
}

async function checkEcosystemActivityContracts() {
  const [
    manifestText,
    snapshotText,
    feature,
    css,
    generator,
    library,
    packageText,
    generatedSurfaces,
    chamberRoutes,
    siteMap,
    app,
    smoke
  ] = await Promise.all([
    readText('data/ecosystem-apps.json'),
    readText('data/ecosystem-stats.json'),
    readText('js/features/ecosystem-chamber.js'),
    readText('css/ecosystem.css'),
    readText('scripts/refresh-ecosystem-stats.mjs'),
    readText('scripts/lib/ecosystem-stats.mjs'),
    readText('package.json'),
    readText('scripts/refresh-generated-surfaces.mjs'),
    readText('scripts/lib/chamber-routes.mjs'),
    readText('js/core/site-map.js'),
    readText('js/core/app.js'),
    readText('tests/smoke.mjs')
  ]);
  const manifest = JSON.parse(manifestText);
  const snapshot = JSON.parse(snapshotText);
  const packageJson = JSON.parse(packageText);
  const { contentHash, ...unsigned } = snapshot;

  if (manifest.schemaVersion !== 1
    || manifest.weekStartsOn !== 'monday'
    || manifest.rankingMetric !== 'active_wallets'
    || manifest.apps?.length < 10) {
    fail('Ecosystem manifest must disclose a Monday-based active-wallet universe with at least 10 apps');
  }
  if (snapshot.schemaVersion !== 1
    || !Number.isFinite(Date.parse(snapshot.generatedAt || ''))
    || stableJsonHash(unsigned) !== contentHash
    || snapshot.manifestHash !== stableJsonHash(manifest)
    || !/^[0-9a-f]{64}$/.test(snapshot.contractUniverseHash || '')) {
    fail('Ecosystem snapshot must retain valid generatedAt, manifest, contract-universe, and stable content-hash receipts');
  }
  if (Buffer.byteLength(snapshotText) > 4 * 1024 * 1024) {
    fail(`Ecosystem snapshot exceeds the 4 MiB browser payload budget: ${Buffer.byteLength(snapshotText)} bytes`);
  }
  if (snapshotText.includes('"wallets":')) {
    fail('Ecosystem browser artifact must publish aggregate counts, never raw wallet cohorts');
  }
  const catalogReceipts = snapshot.sourceReceipts?.tzkt?.catalog || [];
  if (!['asset', 'smart_contract'].every((kind) => catalogReceipts.some((receipt) => (
    receipt.kind === kind
    && receipt.aliasedContracts > 0
    && receipt.pagination === 'id.gt keyset'
    && receipt.pageSize > 0
  )))) {
    fail('Ecosystem snapshot must publish exhaustive TzKT asset and smart-contract catalog pagination receipts');
  }
  if (!Array.isArray(snapshot.weeks) || snapshot.weeks.length < 52
    || !Array.isArray(snapshot.apps) || snapshot.apps.length !== manifest.apps.length
    || !Array.isArray(snapshot.rankings?.all) || snapshot.rankings.all.length < 10) {
    fail('Ecosystem snapshot must retain at least one year, every manifested app, and an all-layer top 10');
  }
  const networkWeeks = snapshot.networkActivity?.weeks || [];
  const networkLatest = networkWeeks.at(-1);
  if (!networkWeeks.length
    || snapshot.networkActivity?.coverageStart !== networkWeeks[0]?.weekStart
    || networkLatest?.weekStart !== snapshot.completeWeek?.weekStart
    || snapshot.networkActivity?.partialWeek?.weekStart !== snapshot.partialWeek?.weekStart
    || snapshot.networkActivity?.partialWeek?.observedAt !== snapshot.partialWeek?.observedAt) {
    fail('Ecosystem network-wide activity must cover the latest completed week and aligned partial week');
  }
  for (const [label, row, status] of [
    ['completed', networkLatest, 'complete'],
    ['partial', snapshot.networkActivity?.partialWeek, 'partial']
  ]) {
    const tezos = row?.layers?.tezos;
    const etherlink = row?.layers?.etherlink;
    if (row?.status !== status
      || tezos?.status !== status
      || etherlink?.status !== status
      || !Number.isSafeInteger(tezos?.activeWallets)
      || !Number.isSafeInteger(etherlink?.activeWallets)
      || row?.all?.activeWallets !== tezos.activeWallets + etherlink.activeWallets
      || typeof row?.all?.approximate !== 'boolean') {
      fail(`Ecosystem network-wide ${label} wallet-layer total is invalid`);
    }
  }
  if (snapshot.sourceReceipts?.tzkt?.networkActivity?.pagination !== 'daily id.gt keyset'
    || snapshot.sourceReceipts?.etherlink?.networkActivity?.chart !== 'activeAccounts'
    || snapshot.sourceReceipts?.etherlink?.networkActivity?.resolution !== 'WEEK') {
    fail('Ecosystem network-wide TzKT and Etherlink source receipts are incomplete');
  }
  if (snapshot.completeWeek?.weekEnd !== snapshot.partialWeek?.weekStart
    || snapshot.partialWeek?.status !== 'partial'
    || Date.parse(snapshot.partialWeek?.observedAt) < Date.parse(snapshot.partialWeek?.weekStart)) {
    fail('Ecosystem completed-week ranking boundary and partial current-week pulse must remain distinct');
  }
  if (!['all', 'tezos', 'etherlink'].every((layer) => {
    const metric = layer === 'all' ? snapshot.partialWeek?.all : snapshot.partialWeek?.layers?.[layer];
    return metric?.status === 'partial'
      && Number.isSafeInteger(metric.activeWallets)
      && metric.activeWallets >= 0
      && Number.isSafeInteger(metric.interactions)
      && metric.interactions >= 0;
  })) {
    fail('Ecosystem current-week aggregate and layer metrics must remain explicitly partial');
  }
  const firstLayerActivity = Object.fromEntries(['tezos', 'etherlink'].map((layer) => [
    layer,
    Math.min(...manifest.apps.flatMap((app) => app.layers
      .filter((item) => item.id === layer)
      .map((item) => Date.parse(item.since))))
  ]));
  for (const [index, week] of snapshot.weeks.entries()) {
    for (const layer of ['tezos', 'etherlink']) {
      const metric = week.layers?.[layer];
      const active = Date.parse(week.weekEnd) > firstLayerActivity[layer];
      if (active && (metric?.status !== 'complete'
        || !Number.isSafeInteger(metric.activeWallets)
        || metric.activeWallets < 0
        || !Number.isSafeInteger(metric.interactions)
        || metric.interactions < 0)) {
        fail(`Ecosystem week ${index} must retain complete ${layer} coverage after its first tracked contract`);
      }
      if (!active && (metric?.status !== 'not-active'
        || metric.activeWallets !== null
        || metric.interactions !== null
        || metric.callsPerWallet !== null
        || metric.returningWalletRate !== null)) {
        fail(`Ecosystem week ${index} must label pre-${layer} coverage as not-active, never as zero`);
      }
    }
  }
  for (const layer of ['all', 'tezos', 'etherlink']) {
    const ranking = snapshot.rankings?.[layer] || [];
    if (ranking.some((row, index) => row.rank !== index + 1
      || (index > 0 && row.activeWallets > ranking[index - 1].activeWallets))) {
      fail(`Ecosystem ${layer} ranking must be dense and descending by active wallets`);
    }
  }
  for (const tracked of snapshot.apps) {
    if (!tracked.id
      || tracked.weekly?.length !== snapshot.weeks.length
      || !tracked.layers?.length
      || tracked.layers.some((layer) => layer.contractCount < 1 || layer.contracts?.length !== layer.contractCount)) {
      fail(`Ecosystem app ${tracked.id || '<unknown>'} is missing complete weekly or frozen-contract coverage`);
    }
  }

  if (packageJson.scripts?.['refresh:ecosystem'] !== 'node scripts/refresh-ecosystem-stats.mjs'
    || packageJson.scripts?.['check:ecosystem'] !== 'node scripts/refresh-ecosystem-stats.mjs --check'
    || packageJson.scripts?.['test:ecosystem'] !== 'node tests/ecosystem-stats-check.mjs') {
    fail('package scripts must expose Ecosystem refresh, offline check, and deterministic unit contracts');
  }
  for (const snippet of [
    "const ECOSYSTEM_TARGETS = ['data/ecosystem-stats.json']",
    "nodeScript('scripts/refresh-ecosystem-stats.mjs', ['--check'])",
    "nodeScript('scripts/refresh-ecosystem-stats.mjs')",
    'stageTargets(ECOSYSTEM_TARGETS)'
  ]) {
    if (!generatedSurfaces.includes(snippet)) fail(`Ecosystem generated-surface orchestration is missing: ${snippet}`);
  }
  for (const snippet of [
    "'target.in'",
    "'timestamp.ge'",
    "status: 'applied'",
    "select: 'id,nonce,sender,target,timestamp'",
    "'alias.null': 'false'",
    "'sort.asc': 'id'",
    'catalog keyset did not advance',
    "filter_by: 'to'",
    "row?.isError === '0'",
    'blockscoutRateLimited',
    'extendBlockscoutCooldown',
    'Blockscout request exhausted',
    'BLOCKSCOUT_REQUEST_GAP_MS',
    'BLOCKSCOUT_MAX_QUERY_RANGE_MS',
    'prepareBlockscoutHistory',
    '/transactions/csv',
    'from_period',
    'complete CSV exports',
    "execFileAsync('curl'",
    'RECENT_WEEKS_TO_REBUILD = 3',
    'private warm-up row',
    'earliestNewContract',
    'normalizeEcosystemCoverage',
    'contractUniverseHash',
    'Raw wallet sets are aggregate-only',
    "'initiator.null': 'true'",
    "'select.values': 'id,sender'",
    'daily id.gt keyset',
    '/lines/activeAccounts',
    "resolution: 'WEEK'",
    'combineNetworkActivity'
  ]) {
    if (!generator.includes(snippet)) fail(`Ecosystem source/continuity contract is missing: ${snippet}`);
  }
  const blockscoutSliceStart = generator.indexOf('async function fetchBlockscoutSlice');
  const blockscoutPreSplit = generator.indexOf('if (toMs - fromMs > BLOCKSCOUT_MAX_QUERY_RANGE_MS)', blockscoutSliceStart);
  const blockscoutRequest = generator.indexOf('const payload = await requestBlockscoutJson', blockscoutSliceStart);
  if (blockscoutSliceStart < 0 || blockscoutPreSplit < blockscoutSliceStart || blockscoutPreSplit > blockscoutRequest) {
    fail('Ecosystem incremental Blockscout scans must subdivide oversized time ranges before making the request');
  }
  for (const snippet of ['combineNetworkActivity', 'contractUniverseHash', 'retentionRate', 'summarizeApp', 'tezosNetworkWallet', 'rankApps', 'snapshotContentHash', 'validateManifest', 'validateSnapshot']) {
    if (!library.includes(snippet)) fail(`Ecosystem deterministic library contract is missing: ${snippet}`);
  }

  const routeContracts = [
    ['route metadata', "slug: 'ecosystem'", chamberRoutes],
    ['site-map destination', "href: '/ecosystem/'", siteMap],
    ['site-map L1 intent', "href: '/ecosystem/?layer=tezos'", siteMap],
    ['site-map all-history intent', "href: '/ecosystem/?range=all'", siteMap],
    ['feature initializer', 'initEcosystemChamber', app],
    ['pretty route opener', "case 'ecosystem':", app],
    ['hash route', "hash === 'ecosystem'", app],
    ['close cleanup', 'closeEcosystemChamber', app],
    ['routed overlay', "'ecosystem-activity-modal': { entryIds: ['ecosystem']", app],
    ['category target', "ecosystem: { selector: '#ecosystem-entry-card', layout: 'featured' }", app]
  ];
  for (const [label, needle, source] of routeContracts) {
    if (!source.includes(needle)) fail(`Ecosystem ${label} contract is missing`);
  }
  for (const snippet of [
    "const ECOSYSTEM_SNAPSHOT_URL = '/data/ecosystem-stats.json'",
    'last completed Monday-to-Monday UTC week',
    'All active addresses',
    'Tracked-app wallets',
    'network-wide + app activity',
    "const RANGES = Object.freeze([",
    'data-ecosystem-category',
    'data-ecosystem-app',
    'data-ecosystem-leader-rank',
    'All active addresses plus the reviewed-dapp subset',
    'Download full JSON',
    'Contract-universe SHA-256',
    'quietlySyncHtml(body, markup)',
    "document.visibilityState !== 'visible'",
    "document.addEventListener('visibilitychange'",
    '__ECOSYSTEM_CHAMBER_REFRESH_MS__',
    'Last good'
  ]) {
    if (!feature.includes(snippet)) fail(`Ecosystem browser truth/quiet contract is missing: ${snippet}`);
  }
  for (const selector of [
    '.ecosystem-entry-card',
    '.ecosystem-entry-grid',
    '.ecosystem-entry-tile',
    '.ecosystem-overlay',
    '.ecosystem-overlay.active .ecosystem-content',
    '.ecosystem-tabs',
    '.ecosystem-kpis',
    '.ecosystem-kpis article.is-network-primary',
    '.ecosystem-chart-grid',
    '.ecosystem-table',
    '.ecosystem-directory',
    '.ecosystem-proof-grid',
    '.ecosystem-methodology'
  ]) {
    if (!css.includes(selector)) fail(`Ecosystem CSS is missing ${selector}`);
  }
  if (!css.includes('@media (max-width: 720px)')
    || !css.includes('animation: none;')
    || !css.includes('position: relative;')) {
    fail('Ecosystem mobile shell must suppress entrance geometry and let the header scroll with the room');
  }
  if (!css.includes('.ecosystem-entry-leader:nth-child(2)')
    || !smoke.includes('Ecosystem launcher desktop grid must show three ranked apps above three equal summary tiles')
    || !smoke.includes('Ecosystem launcher mobile grid must retain only the lead app and three summary tiles')) {
    fail('Ecosystem launcher must retain its six-tile desktop ranking and compact mobile layout contract');
  }
  if (!smoke.includes("name: 'ecosystem-activity'")
    || !smoke.includes('window.__ECOSYSTEM_CHAMBER_REFRESH_MS__')
    || !smoke.includes('window.__ecosystemSmokeTimerTick')
    || !smoke.includes("window.__ecosystemSmokeVisibility = 'hidden'")) {
    fail('smoke catalog must include the focused Ecosystem Activity quiet-refresh suite');
  }

  if (!(await pathExists('ecosystem/index.html')) || !(await pathExists('og/ecosystem.png'))) {
    fail('Ecosystem generated pretty route and OG image must exist');
  } else {
    const route = await readText('ecosystem/index.html');
    if (!route.includes('<link rel="canonical" href="https://tezos.systems/ecosystem/">')
      || !route.includes('/og/ecosystem.png')
      || !route.includes('data-chamber-route="ecosystem"')) {
      fail('Ecosystem generated route must retain its route identity, canonical URL, and dedicated OG image');
    }
  }

  pass(`Ecosystem Activity all-address monitor, ${snapshot.weeks.length}-week reviewed-app history, rankings, source receipts, route, and quiet-refresh contracts checked`);
}

async function checkChamberCategoryContracts() {
  const [siteMapSource, app, styles, shellStyles, index, preload, manager, tour, readme, changelog, smoke, routeGenerator] = await Promise.all([
    readText('js/core/site-map.js'),
    readText('js/core/app.js'),
    readText('css/styles.css'),
    readText('css/shell-extras.css'),
    readText('index.html'),
    readText('js/core/home-layout-preload.js'),
    readText('js/ui/chamber-categories.js'),
    readText('js/features/tooltip-tour.js'),
    readText('README.md'),
    readText('js/features/changelog.js'),
    readText('tests/smoke.mjs'),
    readText('scripts/generate-chamber-routes.mjs')
  ]);
  const expectedCategories = [
    {
      key: 'ecosystem',
      label: 'Ecosystem',
      question: 'How many addresses are active, and which apps are they using?',
      entryIds: ['ecosystem']
    },
    {
      key: 'network',
      label: 'Network',
      question: 'What is the chain doing now?',
      entryIds: ['pulse', 'health', 'tezosx']
    },
    {
      key: 'capital',
      label: 'Capital',
      question: 'Where is value sitting and moving?',
      entryIds: ['capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber']
    },
    {
      key: 'bakers',
      label: 'Bakers',
      question: 'Who is securing Tezos and upgrading its keys?',
      entryIds: ['leaderboard', 'tz4']
    },
    {
      key: 'governance',
      label: 'Governance',
      question: 'What is Tezos deciding?',
      entryIds: ['chamber', 'l2-governance', 'liquidity-baking']
    },
    {
      key: 'people',
      label: 'People & Accounts',
      question: 'Who is here, and what have they done?',
      entryIds: ['ledger-flow', 'domains', 'maxis', 'tezoscrp']
    },
    {
      key: 'history',
      label: 'History',
      question: 'What happened before now?',
      entryIds: ['anthology', 'history']
    }
  ];
  const expectedEntries = expectedCategories.flatMap(({ key, entryIds }) => (
    entryIds.map((id) => ({ id, category: key }))
  ));
  const expectedLayouts = {
    pulse: 'featured',
    health: 'standard',
    tezosx: 'standard',
    capital: 'featured',
    minerals: 'featured',
    uranium: 'featured',
    metals: 'featured',
    ecosystem: 'featured',
    whales: 'wide',
    'staking-chamber': 'compact',
    leaderboard: 'wide',
    tz4: 'compact',
    chamber: 'standard',
    'l2-governance': 'standard',
    'liquidity-baking': 'featured',
    'ledger-flow': 'featured',
    domains: 'featured',
    maxis: 'featured',
    tezoscrp: 'featured',
    anthology: 'standard',
    history: 'standard'
  };

  const destinationBlocks = siteMapSource.split(/\n    \{\n        id:\s*/).slice(1);
  const categorizedEntries = destinationBlocks
    .map((block) => ({
      id: block.match(/^'([^']+)'/)?.[1] || '',
      category: block.match(/\n        chamberCategory:\s*'([^']+)'/)?.[1] || ''
    }))
    .filter(({ category }) => category);
  assert.deepEqual(
    categorizedEntries.toSorted((left, right) => left.id.localeCompare(right.id)),
    expectedEntries.toSorted((left, right) => left.id.localeCompare(right.id)),
    'site-map Chamber facets must define exactly one category for each of the 21 entry points'
  );
  assert.equal(new Set(categorizedEntries.map(({ id }) => id)).size, 21);

  const metadataSource = siteMapSource
    .split('export const CHAMBER_CATEGORY_META = Object.freeze([')[1]
    ?.split('export const SITE_MAP_NAV_GROUPS')[0] || '';
  assert.deepEqual(
    [...metadataSource.matchAll(/\n        key:\s*'([^']+)'/g)].map((match) => match[1]),
    expectedCategories.map(({ key }) => key),
    'Chamber metadata order must remain the canonical dashboard order'
  );
  for (const category of expectedCategories) {
    for (const contract of [
      `key: '${category.key}'`,
      `label: '${category.label}'`,
      `question: '${category.question}'`,
      `entryIds: Object.freeze([${category.entryIds.map((id) => `'${id}'`).join(', ')}])`
    ]) {
      assert(metadataSource.includes(contract), `missing Chamber category metadata contract: ${contract}`);
    }
  }

  const targetSource = app
    .split('const CHAMBER_CARD_TARGETS = Object.freeze({')[1]
    ?.split('});')[0] || '';
  const targetIds = [...targetSource.matchAll(/^\s{4}(?:'([^']+)'|([a-z][\w-]*)):\s*/gm)]
    .map((match) => match[1] || match[2]);
  assert.deepEqual(
    targetIds,
    expectedEntries.map(({ id }) => id),
    'every categorized site-map ID must have one ordered Chamber card target'
  );
  for (const [entryId, layout] of Object.entries(expectedLayouts)) {
    const key = entryId.includes('-') ? `'${entryId}'` : entryId;
    assert(
      new RegExp(`${key}: \\{ selector: [^\\n]+, layout: '${layout}' \\}`).test(targetSource),
      `Chamber launcher ${entryId} must use the ${layout} layout`
    );
  }
  for (const obsolete of ['CHAMBER_CARD_PAIRS', 'data-chamber-pair', 'dataset.chamberPair']) {
    assert(!app.includes(obsolete), `legacy Chamber pair configuration remains: ${obsolete}`);
  }
  assert(siteMapSource.includes("href: '/chambers/'"), 'Explore Tezos must expose the canonical /chambers/ route');
  assert(
    CHAMBER_ROUTES.some((route) => route.slug === 'chambers' && route.hash === '#chambers'),
    'generated Chamber routes must include the Explore Tezos dashboard directory'
  );

  for (const contract of [
    "document.createElement('section')",
    "document.createElement('button')",
    "category.className = 'chamber-card-pair chamber-category'",
    "const DEFAULT_CHAMBER_CATEGORY_KEY = 'ecosystem'",
    'primeChamberCategoryFromRoute',
    'const expanded = chamberCategoryShouldStartExpanded(categoryConfig.key)',
    'setChamberCategoryExpanded(category, chamberCategoryShouldStartExpanded(categoryConfig.key))',
    'setChamberCategoryExpanded(category, true)',
    "setChamberCategoryVisible(categoryKey, true, 'deep-link')",
    "setChamberRoomVisible(entry.id, true, 'deep-link')",
    'card.dataset.chamberEntryId = entryId',
    'card.dataset.chamberLayout = target.layout',
    'quietlyMutate(grid, () => {',
    'grid.querySelector(',
    'grid.insertBefore(category, expectedNode)'
  ]) {
    assert(app.includes(contract), `reusable Chamber category DOM contract is missing: ${contract}`);
  }
  for (const selector of [
    '.chamber-category-head',
    '.chamber-category-name',
    '.chamber-category-question',
    '.chamber-category-count',
    '.chamber-category[data-chamber-expanded="false"] > .chamber-category-cards',
    '#chambers-grid > .stat-card',
    '.chamber-entry-card[data-chamber-layout="featured"]',
    '.chamber-entry-card[data-chamber-layout="wide"]',
    '.chamber-entry-card[data-chamber-layout="compact"]'
  ]) {
    assert(styles.includes(selector), `Chamber category CSS is missing ${selector}`);
  }
  for (const selector of ['.chamber-category-toggle', '.chamber-category[data-chamber-expanded="false"] > .chamber-category-head .chamber-category-count', '.chamber-category-hide', '.chamber-room-hide', '.home-layout-topic-group']) {
    assert(shellStyles.includes(selector), `Chamber category shell CSS is missing ${selector}`);
  }

  const categoryIds = expectedCategories.map(({ key }) => key);
  const staticCategoryState = [...index.matchAll(/<section class="chamber-card-pair chamber-category" data-chamber-category="([^"]+)" data-chamber-shell="1" data-chamber-expanded="(true|false)">/g)]
    .map((match) => ({ key: match[1], expanded: match[2] === 'true' }));
  assert.deepEqual(
    staticCategoryState.map(({ key }) => key),
    categoryIds,
    'root Chamber shell order must put Ecosystem first before JavaScript runs'
  );
  assert.deepEqual(
    staticCategoryState.filter(({ expanded }) => expanded).map(({ key }) => key),
    ['ecosystem'],
    'root Chamber shell must expose only Ecosystem before JavaScript runs'
  );
  for (const source of [preload, manager]) {
    assert(source.includes('tezos-systems-explore-layout-v1'), 'Explore layout preload and manager must share one storage key');
    assert(source.includes('version: 1') && source.includes('hiddenCategories') && source.includes('hiddenRooms'), 'Explore layout preference must retain the version 1 category and room schema');
  }
  for (const id of categoryIds) {
    const startsExpanded = id === 'ecosystem';
    assert(index.includes(`data-chamber-category-hide="${id}"`), `missing inline Hide control for Chamber category ${id}`);
    assert(index.includes(`data-chamber-category-toggle="${id}"`), `missing Customize home switch for Chamber category ${id}`);
    assert(index.includes(`data-chamber-category="${id}" data-chamber-shell="1" data-chamber-expanded="${startsExpanded}"`), `Chamber category ${id} shell has the wrong first-paint disclosure state`);
    assert(index.includes(`aria-expanded="${startsExpanded}" aria-controls="chamber-category-${id}-cards"`), `Chamber category ${id} disclosure has the wrong accessible first-paint state`);
    assert(index.includes(`id="chamber-category-${id}-cards"${startsExpanded ? '>' : ' hidden>'}`), `Chamber category ${id} cards have the wrong first-paint visibility`);
    assert(shellStyles.includes(`[data-chamber-categories-hidden~="${id}"]`), `missing first-paint CSS token for Chamber category ${id}`);
  }
  for (const contract of [
    'CHAMBER_CATEGORY_BY_ROUTE_HASH',
    "'#domains': 'people'",
    "'#history': 'history'",
    "CHAMBER_CATEGORY_BY_ROUTE_HASH[route.hash] || 'ecosystem'",
    'setInitialChamberCategory('
  ]) {
    assert(routeGenerator.includes(contract), `generated Chamber route disclosure contract is missing: ${contract}`);
  }
  for (const [slug, expandedKey] of [
    ['chambers', 'ecosystem'],
    ['ecosystem', 'ecosystem'],
    ['domains', 'people'],
    ['history', 'history'],
    ['ctez', 'ecosystem']
  ]) {
    const routeShell = await readText(`${slug}/index.html`);
    const routeCategoryState = [...routeShell.matchAll(/<section class="chamber-card-pair chamber-category" data-chamber-category="([^"]+)" data-chamber-shell="1" data-chamber-expanded="(true|false)">/g)]
      .map((match) => ({ key: match[1], expanded: match[2] === 'true' }));
    assert.deepEqual(routeCategoryState.map(({ key }) => key), categoryIds, `${slug} route shell must preserve Ecosystem-first category order`);
    assert.deepEqual(
      routeCategoryState.filter(({ expanded }) => expanded).map(({ key }) => key),
      [expandedKey],
      `${slug} route shell must expose only ${expandedKey} before JavaScript runs`
    );
  }
  for (const { id } of expectedEntries) {
    assert(index.includes(`data-chamber-room-toggle="${id}"`), `missing Customize home switch for Chamber room ${id}`);
    assert(shellStyles.includes(`[data-chamber-rooms-hidden~="${id}"]`), `missing first-paint CSS token for Chamber room ${id}`);
  }
  assert(app.includes('createChamberRoomHideButton(entryId)')
    && app.includes('button.dataset.chamberRoomHide = entryId'), 'every rendered Chamber footer must receive an accessible inline Hide control');
  for (const contract of [
    'data-chamber-categories-hidden',
    'data-chamber-rooms-hidden',
    'data-chamber-categories-preview',
    'setHomeBlockVisible',
    "window.addEventListener('storage', syncFromStorage)",
    "window.dispatchEvent(new CustomEvent('tezos:explore-layout-change'",
    'showAllChamberCategories',
    'showUndoToast'
  ]) {
    assert(preload.includes(contract) || manager.includes(contract) || shellStyles.includes(contract), `missing Chamber category visibility contract: ${contract}`);
  }
  assert(index.includes('id="chamber-category-show-all"')
    && index.includes('data-chamber-category-count')
    && index.includes('data-chamber-room-count')
    && index.includes('Show all Chambers'), 'Customize home must provide topic and room counts plus Show all recovery');
  assert(tour.includes("tezosSystemsChamberCategories?.beginPreview?.('guided-tour')")
    && tour.includes("tezosSystemsChamberCategories?.endPreview?.('guided-tour')"), 'guided tour must temporarily reveal saved-hidden Chamber categories');
  assert(readme.includes('tezos-systems-explore-layout-v1')
    && readme.includes('tezos-systems-chamber-categories-v1')
    && changelog.includes('each of its 21 Chamber launchers'), 'README and user-facing changelog must document Explore layout visibility and migration');
  assert(smoke.includes('tezos-systems-explore-layout-v1') && smoke.includes('Show all Chambers'), 'browser suite must cover Explore layout persistence and recovery');

  const perimeterAnimationSelectors = [...styles.matchAll(/([^{}]+)\{[^{}]*animation:\s*entryCardPulse\b[^{}]*\}/g)]
    .map((match) => match[1].trim());
  assert.deepEqual(
    perimeterAnimationSelectors,
    ['.chamber-entry-card.chamber-entry-risk::before'],
    'infinite Chamber perimeter animation must be reserved for explicit risk/watch state'
  );

  pass('seven persistent Chamber categories, 21 individually hideable entry facets, progressive recovery, and risk-only attention checked');
}

async function checkPromotedChamberContracts() {
  const [
    artifactText,
    whale,
    whaleCss,
    whaleGenerator,
    legacyWhales,
    giants,
    leaderboard,
    leaderboardCss,
    history,
    historyCss,
    app,
    siteMap,
    chamberRoutes,
    generatedSurfaces,
    packageText,
    smoke,
    wallet,
    myTezos
  ] = await Promise.all([
    readText('data/whale-watch.json'),
    readText('js/features/whale-chamber.js'),
    readText('css/whale-chamber.css'),
    readText('scripts/refresh-whale-watch-data.mjs'),
    readText('js/features/whales.js'),
    readText('js/features/sleeping-giants.js'),
    readText('js/features/leaderboard.js'),
    readText('css/leaderboard.css'),
    readText('js/features/history.js'),
    readText('css/history-chamber.css'),
    readText('js/core/app.js'),
    readText('js/core/site-map.js'),
    readText('scripts/lib/chamber-routes.mjs'),
    readText('scripts/refresh-generated-surfaces.mjs'),
    readText('package.json'),
    readText('tests/smoke.mjs'),
    readText('js/core/wallet.js'),
    readText('js/features/my-tezos.js')
  ]);
  const artifact = JSON.parse(artifactText);
  const packageJson = JSON.parse(packageText);

  if (artifact.kind !== 'tezos-whale-watch' || artifact.version !== 1 || !Number.isFinite(Date.parse(artifact.generatedAt))) {
    fail('Whale Watch must publish a timestamped tezos-whale-watch v1 artifact');
  }
  if (artifact.coverage?.largeAccounts?.complete !== true || artifact.coverage?.transfers24h?.complete !== true) {
    fail('Whale Watch large-account and 24-hour transfer ledgers must both declare complete pagination');
  }
  if (artifact.coverage?.largeAccounts?.eligibleCount < (artifact.dormant?.records?.length || 0)
    || artifact.coverage?.transfers24h?.eligibleCount !== artifact.transfers24h?.operationCount) {
    fail('Whale Watch coverage counts must reconcile with its displayed cohorts and complete transfer count');
  }
  const expectedThresholds = [1000, 10000, 100000, 1000000];
  const thresholdRows = artifact.transfers24h?.thresholds || [];
  if (JSON.stringify(thresholdRows.map((row) => row.thresholdXtz)) !== JSON.stringify(expectedThresholds)
    || thresholdRows.some((row, index) => index > 0 && (
      row.operationCount > thresholdRows[index - 1].operationCount
      || row.operationGroupCount > thresholdRows[index - 1].operationGroupCount
      || row.grossObservedMutez > thresholdRows[index - 1].grossObservedMutez
    ))) {
    fail('Whale Watch threshold ladder must cover 1K through 1M XTZ and remain monotonically narrowing');
  }
  if (!/not economic volume/i.test(artifact.transfers24h?.semantics || '')
    || JSON.stringify(artifact).includes('economicVolume')) {
    fail('Whale Watch must describe summed legs as gross observed transfers, never economic volume');
  }
  for (const record of artifact.dormant?.records || []) {
    if (!record.address
      || !Number.isFinite(Date.parse(record.lastActivityTime))
      || !Number.isFinite(Number(record.lastActivityLevel))
      || Number(record.dormantDays) < Number(artifact.methodology?.minimumDormantDays || 365)) {
      fail(`Whale Watch dormant receipt is incomplete or below threshold: ${record.address || 'unknown'}`);
    }
  }
  const flowOperationIds = new Set();
  for (const story of artifact.transfers24h?.topFlowStories || []) {
    const operations = story.operations || [];
    const gross = operations.reduce((sum, operation) => sum + Number(operation.amountMutez || 0), 0);
    if (!story.hash || story.operationCount !== operations.length || gross !== story.grossObservedMutez
      || operations.some((operation) => operation.hash !== story.hash || operation.id == null)) {
      fail(`Whale Watch flow story does not reconcile operation ids, shared hash, and gross legs: ${story.hash || 'unknown'}`);
    }
    for (const operation of operations) {
      const key = String(operation.id);
      if (flowOperationIds.has(key)) fail(`Whale Watch flow operation id is duplicated across published stories: ${key}`);
      flowOperationIds.add(key);
    }
  }
  for (const event of artifact.awakenings || []) {
    const previousActivity = Date.parse(event.previousActivityTime || '');
    const awakenedAt = Date.parse(event.awakenedAt || '');
    const receiptDormantDays = Math.floor((awakenedAt - previousActivity) / (24 * 60 * 60 * 1000));
    if (!event.receipt?.hash
      || !Number.isFinite(Date.parse(event.receipt.timestamp))
      || event.awakenedAt !== event.receipt.timestamp
      || !Number.isFinite(previousActivity)
      || previousActivity >= awakenedAt
      || Number(event.dormantDays) !== receiptDormantDays
      || (event.movedAmountMutez ?? null) !== (event.receipt.amountMutez ?? null)) {
      fail(`Whale Watch awakening must use matching prior/current receipt timestamps, derived dormancy, and moved amount: ${event.id || 'unknown'}`);
    }
  }
  if (!Array.isArray(artifact.sources) || artifact.sources.length < 2
    || artifact.sources.some((source) => !/^https:\/\/api\.tzkt\.io\/v1\//.test(source.url || ''))) {
    fail('Whale Watch artifact must retain explicit TzKT source receipts for both complete ledgers');
  }

  const whaleGeneratorContracts = [
    "const THRESHOLDS_XTZ = [1_000, 10_000, 100_000, 1_000_000]",
    "select: 'address,alias,type,balance,lastActivity,lastActivityTime'",
    "'sort.asc': 'id'",
    'offset += pageSize',
    'TzKT pagination exceeded',
    'if (id > 0) return `op:${id}`',
    'groups.get(hash)',
    'movedAmountMutez: receipt.amountMutez ?? null',
    'previousActivityTime: iso(prior.lastActivityTime)',
    'Number(event.dormantDays) !== dormantDays',
    "JSON.stringify(snapshot).includes('economicVolume')"
  ];
  for (const snippet of whaleGeneratorContracts) {
    if (!whaleGenerator.includes(snippet)) fail(`Whale Watch generator contract missing: ${snippet}`);
  }
  if (packageJson.scripts?.['refresh:whales'] !== 'node scripts/refresh-whale-watch-data.mjs'
    || packageJson.scripts?.['check:whales'] !== 'node scripts/refresh-whale-watch-data.mjs --check') {
    fail('package scripts must expose Whale Watch refresh and offline validation');
  }
  if (!generatedSurfaces.includes("const WHALE_WATCH_TARGETS = ['data/whale-watch.json']")
    || !generatedSurfaces.includes("nodeScript('scripts/refresh-whale-watch-data.mjs', ['--check'])")
    || !generatedSurfaces.includes("nodeScript('scripts/refresh-whale-watch-data.mjs')")
    || !generatedSurfaces.includes('stageTargets(WHALE_WATCH_TARGETS)')) {
    fail('generated surfaces must check, refresh, and optionally stage the Whale Watch artifact');
  }

  const integrationContracts = [
    ['Whale route metadata', "slug: 'whales'", chamberRoutes],
    ['Baker route metadata', "slug: 'leaderboard'", chamberRoutes],
    ['Cycle History route metadata', "slug: 'history'", chamberRoutes],
    ['Whale site-map route', "href: '/whales/'", siteMap],
    ['Baker site-map route', "href: '/leaderboard/'", siteMap],
    ['Cycle History site-map route', "href: '/history/'", siteMap],
    ['legacy giants canonical hash alias', "hashAliases: ['#giants']", siteMap],
    ['legacy giants direct dormant view', "href: '/whales/?view=dormant'", siteMap],
    ['Whale Watch Capital category facet', "id: 'whales'", siteMap],
    ['Baker Directory Bakers category facet', "id: 'leaderboard'", siteMap],
    ['Ledger Flow People category facet', "id: 'ledger-flow'", siteMap],
    ['Anthology and Cycle History category membership', "entryIds: Object.freeze(['anthology', 'history'])", siteMap],
    ['Whale routed overlay ownership', "'whale-watch-modal': { entryIds: ['whales'], hashes: ['whales', 'giants']", app],
    ['Baker routed overlay ownership', "'baker-directory-modal': { entryIds: ['leaderboard']", app],
    ['Cycle History routed overlay ownership', "'history-modal': { entryIds: ['history']", app],
    ['legacy giants Chamber handoff', "openChamberFeature('whales', 'dormant')", app],
    ['Baker router-owned close preserves canonical route', "leaderboard: {\n        modulePath: '../features/leaderboard.js'", app],
    ['Whale router-owned close preserves canonical route', 'closeArgs: [{ preserveRoute: true }]', app]
  ];
  for (const [label, snippet, source] of integrationContracts) {
    if (!source.includes(snippet)) fail(`${label} contract is missing`);
  }

  for (const view of ['overview', 'live', 'flows', 'dormant', 'awakenings']) {
    if (!whale.includes(`{ id: '${view}'`)) fail(`Whale Watch must expose the ${view} view`);
  }
  for (const snippet of [
    "ARTIFACT_URL = '/data/whale-watch.json'",
    'export function getWhaleWatchArtifact',
    "const FILTER_TYPES = new Set(['all', 'transaction', 'stake', 'unstake', 'delegation'])",
    'quietlySyncHtml(body, markup)',
    'document.visibilityState !== \'visible\'',
    "document.addEventListener('visibilitychange'",
    '__WHALE_WATCH_REFRESH_MS__',
    'captureLiveTapeAnchor',
    'restoreLiveTapeAnchor',
    'last-good retained',
    'operation ids remain distinct receipts',
    'namedEndpointSample',
    'current TzKT alias receipts',
    'does not infer exchange ownership or beneficial control',
    'Observed holdings',
    'Holding before',
    'Archive generated ${ageLabel(lastArtifact.generatedAt)}',
    'Archive freshness unavailable'
  ]) {
    if (!whale.includes(snippet)) fail(`Whale Watch quiet/truth contract missing: ${snippet}`);
  }
  if (/type\s*:\s*['"]exchange['"]|FILTER_TYPES[^\n]*exchange/i.test(whale)) {
    fail('Whale Watch route and filter state must not accept an inferred exchange type');
  }
  if (/\b(?:Binance|Coinbase|Kraken|Gate\.io)\b/i.test(legacyWhales)) {
    fail('Whale Watch must not ship hardcoded exchange ownership labels');
  }
  if (!legacyWhales.includes('byId.set(whaleOperationId(operation), operation)')
    || !legacyWhales.includes('groupWhaleOperations')
    || !legacyWhales.includes("if (document.visibilityState !== 'visible')")
    || !legacyWhales.includes("mode: 'all-or-nothing'")
    || !legacyWhales.includes("lanes: ['transactions', 'delegations', 'stake', 'unstake']")
    || !legacyWhales.includes('const [transfers, delegations, staking] = await Promise.all([')
    || (legacyWhales.match(/params\.set\('timestamp\.ge', since\)/g) || []).length !== 3
    || legacyWhales.includes("params.set('timestamp.gt', since)")
    || !giants.includes('lastActivityTime')) {
    fail('legacy Whale and Sleeping Giants data helpers must preserve operation-id identity, hash grouping, four-lane atomic refresh, overlapping cursors, visibility gating, and timestamp dormancy');
  }
  for (const selector of ['.whale-watch-entry-card', '.whale-watch-overlay', '.whale-watch-tabs', '.whale-watch-tape-row', '.whale-watch-story', '.whale-watch-dormant-row', '.whale-watch-awakening']) {
    if (!whaleCss.includes(selector)) fail(`Whale Watch CSS is missing ${selector}`);
  }

  for (const view of ['discover', 'directory', 'signals']) {
    if (!leaderboard.includes(`{ id: '${view}'`)) fail(`Baker Directory must expose the ${view} view`);
  }
  for (const snippet of [
    'while (true)',
    'offset += limit',
    'positive current baking power',
    'Complete funded set',
    'not a hidden quality score',
    'function bakerMatchesFit',
    'function compareBakerFit',
    'function factualBakerFits',
    'No blended score or inferred quality grade is calculated',
    'not uptime, payout, or performance grades',
    'quietlySyncHtml(body, html)',
    "document.visibilityState !== 'visible'",
    "document.addEventListener('visibilitychange'",
    '__BAKER_DIRECTORY_REFRESH_MS__',
    'last-good baker set remains in place',
    'last-good governance receipts',
    "if (searchInput) searchInput.value = ''",
    'leaveBakerDirectoryRoute',
    "findChamberLauncher('#baker-directory-entry-card')",
    'bakerDirectoryFocusedBeforeOpen',
    'bakerDirectoryEntryFreshnessLabel',
    'TzKT freshness unavailable'
  ]) {
    if (!leaderboard.includes(snippet)) fail(`Baker Directory complete-set/quiet/truth contract missing: ${snippet}`);
  }
  for (const snippet of [
    'data-baker-action="delegate"',
    'data-baker-action="stake"',
    'Baker switching is intentionally not offered here.',
    'Leave at least 1 XTZ liquid for fees',
    'requestConnectedWalletDelegation(baker.address)',
    'requestConnectedWalletStake(amountMutez.toString())'
  ]) {
    if (!leaderboard.includes(snippet)) fail(`Baker Directory wallet-action contract missing: ${snippet}`);
  }
  for (const snippet of [
    "kind: delegationKind",
    "destination: account.address",
    "entrypoint: 'stake'",
    "value: { prim: 'Unit' }"
  ]) {
    if (!wallet.includes(snippet)) fail(`Octez.Connect baker-action operation contract missing: ${snippet}`);
  }
  for (const snippet of [
    'Delegate to an active baker you trust',
    'Delegate to the builder of this site',
    'Compare all active bakers',
    'reported delegation room',
    'data-my-tezos-bb-delegate',
    '/leaderboard/?view=directory'
  ]) {
    if (!myTezos.includes(snippet)) fail(`My Tezos undelegated guidance contract missing: ${snippet}`);
  }
  if (/computeBakerScores|scoreBakerFit|overallScore|reliabilityScore|fitScore|compositeFitScore/.test(leaderboard)) {
    fail('Baker Directory must not restore a synthetic baker fit, performance, or reliability score');
  }
  if (!leaderboard.includes('delegationUsage,') || leaderboard.includes('Math.min(delegationUsage')) {
    fail('Baker Directory must expose raw delegation usage above 100%, never clamp it for presentation');
  }
  if (!leaderboard.includes('careerByAddress: governanceSignals.careerByAddress')
    || !leaderboard.includes('acceptedByAddress: governanceSignals.acceptedByAddress')
    || !leaderboard.includes('const next = {\n        ...governanceSignals,')) {
    fail('Baker Directory governance refresh must begin from the last validated career/proposal maps');
  }
  for (const selector of ['.baker-directory-entry-front', '.baker-directory-overlay', '.baker-directory-tabs', '.baker-directory-search', '.baker-directory-table', '.baker-directory-signal-grid']) {
    if (!leaderboardCss.includes(selector)) fail(`Baker Directory CSS is missing ${selector}`);
  }
  if (!leaderboardCss.includes(':is(#whale-watch-entry-card, #baker-directory-entry-card)[data-chamber-layout="wide"]')
    || !leaderboardCss.includes('min-height: 320px')) {
    fail('Whale Watch and Baker Directory must retain one shared desktop launcher height floor');
  }

  for (const snippet of [
    "const CYCLE_HISTORY_CSS_URL = versionedAsset('/css/history-chamber.min.css')",
    "const CYCLE_HISTORY_RANGES = new Set(['24h', '7d', '30d', 'all'])",
    'CYCLE_HISTORY_METRICS',
    'data-history-metric',
    'syncCycleHistoryRouteState',
    'cycleHistoryRenderedRange',
    'restoreCycleHistoryRangeAfterFailure',
    'Showing last-good',
    'focusCycleHistoryMetric',
    'openCycleHistoryChamber',
    'closeCycleHistoryChamber',
    'uncaptured intervals are never invented',
    'scheduleCycleHistoryEntryFreshness',
    "document.visibilityState !== 'visible'",
    'cycleHistoryPendingFreshnessRows',
    'History · oldest source'
  ]) {
    if (!history.includes(snippet)) fail(`Cycle History route/focus contract missing: ${snippet}`);
  }
  for (const id of ['whale-watch-entry-card', 'baker-directory-entry-card', 'cycle-history-entry-card']) {
    if (!smoke.includes(`'${id}'`)) fail(`promoted Chamber semantic freshness smoke is missing ${id}`);
  }
  for (const selector of ['.cycle-history-entry-card', '.cycle-history-chamber', '.cycle-history-route-controls', '.chart-section.is-route-focus']) {
    if (!historyCss.includes(selector)) fail(`Cycle History CSS is missing ${selector}`);
  }

  for (const route of [
    ['history', 'Cycle History', 'og/history.png'],
    ['leaderboard', 'Baker Directory', 'og/leaderboard.png'],
    ['whales', 'Whale Watch', 'og/whales.png']
  ]) {
    const [slug, title, og] = route;
    const html = await readText(`${slug}/index.html`);
    if (!html.includes(`data-chamber-route="${slug}"`)
      || !html.includes(`<link rel="canonical" href="https://tezos.systems/${slug}/">`)
      || !html.includes(`/${og}`)
      || !html.includes(title)) {
      fail(`${title} generated route must retain its route identity, canonical URL, title, and dedicated OG image`);
    }
  }

  for (const suite of ["name: 'baker-directory'", "name: 'baker-wallet-actions'", "name: 'whale-watch-chamber'", "name: 'cycle-history-chamber'"]) {
    if (!smoke.includes(suite)) fail(`smoke catalog must include focused promoted-Chamber suite ${suite}`);
  }
  for (const snippet of [
    'window.__BAKER_DIRECTORY_REFRESH_MS__ = 1000',
    'window.__WHALE_WATCH_REFRESH_MS__ = 1000',
    'sampleWhaleWatchArtifact',
    'sameHashDistinctOperationIds',
    'lastActivityTime',
    'movedAmountMutez',
    "#giants",
    'assertPromotedLauncherGeometry',
    'frontScrollHeight <= card.frontClientHeight + 1',
    'Whale Watch and Baker Directory desktop pair heights differ',
    'raw delegation use above 100% must remain visible instead of being clamped',
    'compact signal refresh failures must retain validated badge maps and label them last-good',
    'sameFooter',
    'timestamp.ge',
    '__cycleHistoryKeyboardLauncher',
    'smoke forced Cycle History range refresh failure',
    'failed range refresh drifted the last-good range'
  ]) {
    if (!smoke.includes(snippet)) fail(`promoted-Chamber browser regression contract missing: ${snippet}`);
  }

  pass(`Whale Watch, Baker Directory, and Cycle History full-Chamber contracts checked (${artifact.transfers24h.operationCount} complete-window transfers)`);
}

async function main() {
  if (process.argv.includes('--readme-only')) {
    await checkPortableTooling();
    await checkRepositoryLicense();
    await checkReadmeContracts();

    for (const message of passes) console.log(`ok - ${message}`);
    for (const message of warnings) console.warn(`warn - ${message}`);
    for (const message of failures) console.error(`fail - ${message}`);

    console.log(`\nREADME checks: ${passes.length} passed, ${warnings.length} warnings, ${failures.length} failed`);
    if (failures.length) process.exit(1);
    return;
  }

  await checkRequiredFiles();
  await checkHomeLayoutContracts();
  checkLiveHeadPureContracts();
  await checkJsonFiles();
  await checkGovernanceVotes();
  await checkLocalReferences();
  await checkSiteMapGraphContracts();
  await checkCacheBustAlignment();
  await checkCsp();
  await checkSitemapCoverage();
  await checkSelectorContracts();
  await checkUxAuditContracts();
  await checkWidgetRuntimeContracts();
  await checkMainnetLaunchCopy();
  await checkPublicDataDiscoveryContracts();
  await checkInitialLoadMeasurementContracts();
  await checkChamberEfficiencyContracts();
  await checkLauncherProjectionContracts();
  await checkModuleImportVersions();
  await checkHistoricalPagination();
  await checkLiquidityBakingIssuanceState();
  await checkTruthSurfaceContracts();
  await checkStylesheetFreshness();
  await checkAuroraDesktopTitleTreatment();
  await checkValleyThemeContracts();
  await checkPortableTooling();
  await checkRepositoryLicense();
  await checkSmokeSuiteCatalogContracts();
  await checkTourAndShareCaptureContracts();
  await checkDailyBriefingPriceContracts();
  await checkNetworkContextNavigationContracts();
  await checkChamberCategoryContracts();
  await checkPromotedChamberContracts();
  await checkMyTezosPortfolioContracts();
  await checkCapitalContracts();
  await checkEcosystemActivityContracts();
  await checkLiveNumberMotionContracts();
  await checkQuietRefreshContracts();
  await checkMetalsIntegrationContracts();
  checkMilestoneLifecycleBehavior();
  await checkMilestoneCatalogContracts();
  await checkVisitStreakBehavior();
  await checkMaxisContracts();
  await checkTezosCrpContracts();
  await checkReadmeContracts();

  for (const message of passes) console.log(`ok - ${message}`);
  for (const message of warnings) console.warn(`warn - ${message}`);
  for (const message of failures) console.error(`fail - ${message}`);

  console.log(`\nStatic checks: ${passes.length} passed, ${warnings.length} warnings, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
