import { CHAMBER_FEATURES } from '../../js/core/chamber-features.mjs';
import { FUNDING_SOURCES, fundingPreviewPath } from '../../js/core/community-funding.mjs';
import { getChamberCategories } from './chamber-catalog.mjs';

const categories = getChamberCategories().map(category => ({ id: category.key, launcherIds: category.entryIds }));
const launcherIds = categories.flatMap(category => category.launcherIds);
const categoryIds = categories.map(category => category.id);

// These modules have legitimate dashboard responsibilities, even though they
// also expose standalone rooms. In particular, app.js owns two registry entries.
const dashboardFeatures = new Set(['health', 'history', 'my', 'anthology', 'chambers']);
const owners = new Map(Object.entries(CHAMBER_FEATURES)
  .filter(([id]) => !dashboardFeatures.has(id))
  .map(([id, feature]) => [
    new URL(feature.modulePath, 'https://tezos.systems/js/core/chamber-features.mjs').pathname, [id]
  ]));
const launcherAssets = {
  capital: ['/css/capital.min.css', '/data/capital-entry-summary.json'],
  ecosystem: ['/css/ecosystem.min.css', '/data/ecosystem-entry-summary.json'],
  maxis: ['/css/maxis.min.css', '/data/maxis/entry-summary.json'],
  leaderboard: ['/css/leaderboard.min.css', '/data/baker-governance-signals.json'],
  minerals: ['/css/minerals-chamber.min.css', '/data/minerals-entry-summary.json'],
  metals: ['/css/metals-chamber.min.css', '/data/metals-entry-summary.json'],
  uranium: ['/css/uranium-chamber.min.css', '/data/uranium-entry-summary.json'],
  'ledger-flow': ['/css/ledger-flow.min.css'],
  pulse: ['/css/network-pulse.min.css'],
  'staking-chamber': ['/css/staking-chamber.min.css'],
  domains: ['/css/tezos-domains.min.css'],
  tezoscrp: ['/css/tezoscrp.min.css', '/data/tezoscrp-summary.json'],
  whales: ['/css/whale-chamber.min.css'],
  funding: ['/js/core/community-funding.mjs', '/css/community-funding.min.css', ...Object.keys(FUNDING_SOURCES).map(fundingPreviewPath)]
};
for (const [id, paths] of Object.entries(launcherAssets)) {
  for (const path of paths) owners.set(path, [id]);
}
owners.set('/css/market-room.min.css', ['capital', 'minerals', 'metals', 'uranium']);

const heavyPaths = new Set([
  '/data/capital-snapshot.json', '/data/ecosystem-stats.json',
  '/data/minerals-snapshot.json', '/data/metals-snapshot.json', '/data/uranium-snapshot.json',
  '/data/tezoscrp-awards.json', '/data/tezoscrp-awards.compact.json', '/data/whale-watch.json',
  '/data/maxis-leaders.json', '/data/maxis-careers.json', '/data/maxis-l2-governance.json', '/data/maxis/manifest.json',
  ...Object.values(FUNDING_SOURCES).map(source => source.path)
]);

function resourcePath(resource) {
  try {
    const url = new URL(resource.path, 'https://tezos.systems');
    return { pathname: url.pathname, specifier: `${url.pathname}${url.search}${url.hash}` };
  } catch {
    return { pathname: '', specifier: '' };
  }
}

function isHeavyResource(pathname) {
  // Every versioned transport is a complete room or Passport receipt, never a
  // launcher projection. Apply this rule to request starts, not just responses.
  return heavyPaths.has(pathname) || pathname.startsWith('/data/transports/')
    || /^\/data\/maxis\/seasons\/[^/]+\/.*\.json$/.test(pathname);
}

export function getInitialLoadExpectations() {
  return {
    launcherIds: [...launcherIds],
    categoryIds: [...categoryIds],
    launcherCount: launcherIds.length,
    categoryCount: categoryIds.length,
    categories: categories.map(category => ({ id: category.id, launcherIds: [...category.launcherIds] }))
  };
}

function validateIds(label, actual, expected, { ordered = false } = {}) {
  if (!Array.isArray(actual)) return [`${label} must be an array of IDs`];
  const errors = [];
  const counts = new Map();
  for (const id of actual) counts.set(id, (counts.get(id) || 0) + 1);
  const duplicate = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  const missing = expected.filter(id => !counts.has(id));
  const unexpected = [...counts.keys()].filter(id => !expected.includes(id));
  if (duplicate.length) errors.push(`${label} contains duplicate IDs: ${duplicate.join(', ')}`);
  if (missing.length) errors.push(`${label} is missing IDs: ${missing.join(', ')}`);
  if (unexpected.length) errors.push(`${label} contains unexpected IDs: ${unexpected.map(id => JSON.stringify(id)).join(', ')}`);
  if (actual.length !== expected.length) errors.push(`${label} has ${actual.length} IDs; expected ${expected.length}`);
  if (ordered && !errors.length && actual.some((id, index) => id !== expected[index])) errors.push(`${label} is not in catalog order`);
  return errors;
}

/** IDs must come from actual rendered cards/categories, not an expected count
 * read from that same DOM. Optional categoryLaunchers verifies room ownership. */
export function validateInitialLoadReadiness(readiness = {}) {
  if (!readiness || typeof readiness !== 'object' || Array.isArray(readiness)) return ['readiness must be an object'];
  const errors = [];
  if (readiness.mainVisible !== true) errors.push('main is not visible');
  if (readiness.dashboardReady !== true) errors.push('dashboard initialization is incomplete');
  errors.push(...validateIds('launcherIds', readiness.launcherIds, launcherIds));
  errors.push(...validateIds('categoryIds', readiness.categoryIds, categoryIds, { ordered: true }));
  errors.push(...validateIds('orderedLauncherIds', readiness.orderedLauncherIds, launcherIds, { ordered: true }));
  if (readiness.categoryLaunchers !== undefined) {
    if (!Array.isArray(readiness.categoryLaunchers)) errors.push('categoryLaunchers must be an array');
    else {
      errors.push(...validateIds('categoryLaunchers', readiness.categoryLaunchers.map(category => category?.id), categoryIds, { ordered: true }));
      for (const category of categories) {
        const observed = readiness.categoryLaunchers.find(entry => entry?.id === category.id);
        errors.push(...validateIds(`category ${category.id} launcherIds`, observed?.launcherIds, category.launcherIds, { ordered: true }));
      }
    }
  }
  return errors;
}

/** Only a recorded intersection before a request permits launcher hydration.
 * A full room artifact is never eligible for launcher hydration. */
export function classifyLauncherResources(resources, intersections) {
  const hydrated = [], premature = [];
  for (const resource of resources) {
    const { pathname } = resourcePath(resource);
    const ownerIds = owners.get(pathname);
    const visibleBeforeRequest = !isHeavyResource(pathname) && ownerIds && intersections.some(entry => ownerIds.includes(entry.id)
      && Number.isFinite(entry.at) && entry.at >= 0
      && Number.isFinite(resource.startTime) && resource.startTime >= 0 && entry.at <= resource.startTime);
    (visibleBeforeRequest ? hydrated : premature).push(resource);
  }
  return { hydrated, premature };
}

export function duplicateModuleRequests(resources) {
  const paths = new Map();
  for (const resource of resources) {
    const { pathname, specifier } = resourcePath(resource);
    if (!/\.(?:js|mjs)$/.test(pathname)) continue;
    if (!paths.has(pathname)) paths.set(pathname, new Set());
    paths.get(pathname).add(specifier);
  }
  return [...paths.values()].filter(specifiers => specifiers.size > 1).map(specifiers => [...specifiers]);
}

/** Match completed resources to request receipts in occurrence order. Native
 * performance entries share the intersection observer's clock; CDP wall time
 * can differ fractionally after privacy rounding. Keep every request receipt,
 * including failed/pending requests without a native entry, and its CDP clock. */
export function normalizeInitialLoadRequestStarts(requests, resources, timeOrigin) {
  const nativeStarts = new Map();
  for (const resource of resources) {
    if (!nativeStarts.has(resource.path)) nativeStarts.set(resource.path, []);
    nativeStarts.get(resource.path).push(resource.startTime);
  }
  return requests.map(receipt => {
    const cdpStartTime = Math.max(0, receipt.wallTime - timeOrigin);
    return {
      ...receipt,
      cdpStartTime,
      startTime: nativeStarts.get(receipt.path)?.shift() ?? cdpStartTime
    };
  });
}

/** The runner passes same-origin request-start receipts, including pending and
 * failed requests. Completion/status never excuses an early or duplicate load. */
export function assessInitialLoadResources(resources, intersections = []) {
  const deferred = resources.filter(resource => owners.has(resourcePath(resource).pathname));
  const { hydrated, premature } = classifyLauncherResources(deferred, intersections);
  return {
    visibleLauncherResources: hydrated,
    deferredChamberResources: premature,
    forbiddenHeavyResources: resources.filter(resource => isHeavyResource(resourcePath(resource).pathname)),
    duplicateModuleRequests: duplicateModuleRequests(resources)
  };
}
