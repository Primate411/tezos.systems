import { CHAMBER_FEATURES } from '../../js/core/chamber-features.mjs';

const moduleOwners = new Map(Object.entries(CHAMBER_FEATURES).map(([id, feature]) => [
  new URL(feature.modulePath, 'https://tezos.systems/js/core/chamber-features.mjs').pathname, id
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
  tezoscrp: ['/css/tezoscrp.min.css'],
  whales: ['/css/whale-chamber.min.css']
};
const owners = new Map([...moduleOwners, ...Object.entries(launcherAssets).flatMap(([id, paths]) => paths.map(path => [path, id]))]);

/** Only a recorded intersection before a request permits launcher hydration.
 * Full room artifacts are independently forbidden by the measurement harness. */
export function classifyLauncherResources(resources, intersections) {
  const hydrated = [], premature = [];
  for (const resource of resources) {
    const owner = owners.get(resource.path.split('?')[0]);
    const visibleBeforeRequest = owner && intersections.some(entry => entry.id === owner
      && Number.isFinite(entry.at) && Number.isFinite(resource.startTime) && entry.at <= resource.startTime);
    (visibleBeforeRequest ? hydrated : premature).push(resource);
  }
  return { hydrated, premature };
}

export function duplicateModuleRequests(resources) {
  const paths = new Map();
  for (const resource of resources) {
    const pathname = resource.path.split('?')[0];
    if (!/\.(?:js|mjs)$/.test(pathname)) continue;
    if (!paths.has(pathname)) paths.set(pathname, new Set());
    paths.get(pathname).add(resource.path);
  }
  return [...paths.values()].filter(specifiers => specifiers.size > 1).map(specifiers => [...specifiers]);
}
