#!/usr/bin/env node
import { readSmokeTestSource } from './lib/test-source.mjs';
import { STATIC_CHECKS } from './lib/static-test-catalog.mjs';
import { CSS_THEMES, CSS_TARGETS, LAZY_SURFACE_STYLES } from '../scripts/lib/css-bundles.mjs';

import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHAMBER_ROUTES, routeUrl } from '../scripts/lib/chamber-routes.mjs';
import { CHAMBER_FEATURES, standaloneFeatureForRoute } from '../js/core/chamber-features.mjs';
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
} from '../scripts/lib/maxis-storage.mjs';
import { readStoredPassport } from '../scripts/lib/maxis-storage.mjs';
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
import { createHomeStaticChecks } from './static/home.mjs';
import { createMyTezosStaticChecks } from './static/my-tezos.mjs';
import { createRepositoryStaticChecks } from './static/repository.mjs';
import { createRoutingStaticChecks } from './static/routing.mjs';
import { createShellStaticChecks } from './static/shell.mjs';
import { createLoadingStaticChecks } from './static/loading.mjs';
import { createDataStaticChecks } from './static/data.mjs';
import { createThemesStaticChecks } from './static/themes.mjs';
import { createHarnessStaticChecks } from './static/harness.mjs';
import { createMilestonesStaticChecks } from './static/milestones.mjs';
import { createMaxisStaticChecks } from './static/maxis.mjs';
import { createQuietRefreshStaticChecks } from './static/quiet-refresh.mjs';
import { createChambersStaticChecks } from './static/chambers.mjs';

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

// This process only reads repository sources; share reads across contracts.
const sourceReads = new Map();
function readText(file) {
  if (!sourceReads.has(file)) sourceReads.set(file, file === 'tests/smoke.mjs' ? readSmokeTestSource() : fs.readFile(path.join(ROOT, file), 'utf8'));
  return sourceReads.get(file);
}

async function readInitialLoadMeasurementSource() {
  return (await Promise.all([
    'scripts/measure-initial-load.mjs',
    'scripts/lib/initial-load-runner.mjs',
    'scripts/lib/initial-load-server.mjs',
    'scripts/lib/initial-load-config.mjs',
    'scripts/lib/initial-load-report.mjs',
    'scripts/lib/initial-load-policy.mjs'
  ].map(readText))).join('\n');
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

const WALK_IGNORED_DIR_NAMES = new Set([
  '.cache',
  '.git',
  'node_modules',
  'test-artifacts'
]);

async function walk(dir, predicate, results = []) {
  const entries = await fs.readdir(path.join(ROOT, dir), { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (WALK_IGNORED_DIR_NAMES.has(entry.name)) continue;
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


function openApiPathPattern(dataPath) {
  const escaped = dataPath
    .replace(/^\//, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{seasonId\\\}/g, '[^/]+')
    .replace(/\\\{shard\\\}/g, '[0-9a-f]{2}');
  return new RegExp(`^${escaped}$`);
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
  await checkChamberFirstPaintContracts();
  await checkChamberReadingContracts();
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


const { checkHomeLayoutContracts, checkLiveHeadPureContracts, checkUxAuditContracts, checkMainnetLaunchCopy, checkTourAndShareCaptureContracts, checkDailyBriefingPriceContracts, checkNetworkContextNavigationContracts } = createHomeStaticChecks({
  CHAMBER_ROUTES,
  CSS_TARGETS,
  ETHERLINK_ROLLUP_ADDRESS,
  assert,
  buildQuietBakerNotice,
  classifyBlockStory,
  compileBlockStoryCatalog,
  fail,
  pass,
  pathExists,
  readText,
  standaloneFeatureForRoute
});

const { checkMyTezosPortfolioContracts } = createMyTezosStaticChecks({
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
});

const { checkRequiredFiles, checkJsonFiles, checkLocalReferences, checkModuleImportVersions, checkPortableTooling, checkRepositoryLicense, checkReadmeContracts } = createRepositoryStaticChecks({
  CHAMBER_ROUTES,
  collectCssRefs,
  collectHtmlRefs,
  collectJsImports,
  createHash,
  fail,
  pass,
  pathExists,
  readText,
  statOrNull,
  walk
});

const { checkSiteMapGraphContracts, checkSitemapCoverage, checkPublicDataDiscoveryContracts } = createRoutingStaticChecks({
  CHAMBER_ROUTES,
  ROOT,
  assert,
  fail,
  openApiPathPattern,
  pass,
  path,
  pathExists,
  pathToFileURL,
  readText,
  renderLlmsTxt,
  walk
});

const { checkCacheBustAlignment, checkCsp, checkSelectorContracts, checkWidgetRuntimeContracts } = createShellStaticChecks({
  CHAMBER_FEATURES,
  CHAMBER_ROUTES,
  ROOT,
  assert,
  fail,
  fs,
  pass,
  path,
  pathExists,
  readText,
  standaloneFeatureForRoute,
  vm,
  walk
});

const { checkInitialLoadMeasurementContracts, checkChamberEfficiencyContracts, checkLauncherProjectionContracts, checkChamberFirstPaintContracts, checkChamberReadingContracts } = createLoadingStaticChecks({
  CHAMBER_FEATURES,
  CHAMBER_ROUTES,
  ROOT,
  STATIC_CHECKS,
  assert,
  createHash,
  fail,
  fs,
  pass,
  path,
  readInitialLoadMeasurementSource,
  readText,
  stableJsonHash,
  standaloneFeatureForRoute
});

const { checkGovernanceVotes, checkHistoricalPagination, checkLiquidityBakingIssuanceState, checkTruthSurfaceContracts } = createDataStaticChecks({
  STATIC_CHECKS,
  countProtocolUpgrades,
  fail,
  hoursSince,
  pass,
  protocolHashMatches,
  readText
});

const { checkStylesheetFreshness, checkAuroraDesktopTitleTreatment, checkValleyThemeContracts } = createThemesStaticChecks({
  CSS_TARGETS,
  CSS_THEMES,
  LAZY_SURFACE_STYLES,
  fail,
  pass,
  readText,
  statOrNull,
  walk,
  warn
});

const { checkSmokeSuiteCatalogContracts } = createHarnessStaticChecks({
  fail,
  pass,
  readText
});

const { checkMilestoneLifecycleBehavior, checkMilestoneCatalogContracts, checkVisitStreakBehavior } = createMilestonesStaticChecks({
  MILESTONE_BASE_THRESHOLDS,
  MILESTONE_CATALOG_SCHEMA,
  MILESTONE_MOMENT_TTL_MS,
  MILESTONE_REFRESH_COMMITS,
  MILESTONE_REFRESH_DAYS,
  advanceMilestoneTrack,
  assert,
  claimMilestoneArrival,
  cycleMilestoneStartLevel,
  deriveMilestoneMoments,
  extendMilestoneThresholds,
  fail,
  generatedMilestoneAnchor,
  generatedMilestoneMoments,
  generatedMilestoneThresholds,
  mergedMilestoneThresholds,
  milestoneCatalogCadence,
  normalizeMilestoneStore,
  pass,
  qualifyMilestoneNearState,
  readText
});

const { checkMaxisContracts, checkTezosCrpContracts } = createMaxisStaticChecks({
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
});

const { checkLiveNumberMotionContracts, checkQuietRefreshContracts } = createQuietRefreshStaticChecks({
  assert,
  fail,
  pass,
  readText
});

const { checkMetalsIntegrationContracts, checkCapitalContracts, checkEcosystemActivityContracts, checkChamberCategoryContracts, checkPromotedChamberContracts } = createChambersStaticChecks({
  CHAMBER_ROUTES,
  assert,
  fail,
  pass,
  pathExists,
  readText,
  routeUrl,
  stableJsonHash,
  standaloneFeatureForRoute,
  vm
});

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
