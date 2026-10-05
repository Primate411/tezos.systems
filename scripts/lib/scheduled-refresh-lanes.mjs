const command = (script, args = [], options = {}) => ({ script, args, ...options });

// A source and its launcher projection are one rollback unit. Shared previews
// are rebuilt after either input changes; each lane snapshots the latest pair.
export const SCHEDULED_REFRESH_LANES = Object.freeze([
  {
    id: 'governance',
    label: 'Tezos governance',
    targets: ['data/governance-votes.json', 'data/governance-refresh-report.json', 'feed.xml', 'data/baker-governance-signals.json'],
    sharedTargets: ['data/baker-governance-signals.json'],
    refresh: [command('scripts/refresh-governance-data.mjs'), command('scripts/generate-baker-governance-signals.mjs')],
    validate: [command('scripts/generate-baker-governance-signals.mjs', ['--check']), command('tests/baker-governance-signals-check.mjs')]
  },
  {
    id: 'maxis-l2-governance',
    label: 'Maxis L2 governance career',
    targets: ['data/maxis-l2-governance.json', 'data/maxis/entry-summary.json'],
    sharedTargets: ['data/maxis/entry-summary.json'],
    refresh: [command('scripts/refresh-maxis-l2-governance.mjs'), command('scripts/generate-maxis-entry-summary.mjs')],
    validate: [command('scripts/refresh-maxis-l2-governance.mjs', ['--check']), command('scripts/generate-maxis-entry-summary.mjs', ['--check'])]
  },
  {
    id: 'maxis-season',
    label: 'Maxis crowns and protocol season',
    targets: ['data/maxis-leaders.json', 'data/maxis/manifest.json', 'data/maxis/seasons', 'data/transports/v1/data/maxis/seasons', 'data/maxis/entry-summary.json'],
    sharedTargets: ['data/maxis/entry-summary.json'],
    refresh: [command('scripts/refresh-maxis-data.mjs', [], {
      attempts: 3,
      retryBaseMs: 60_000,
      retryCapMs: 120_000
    }), command('scripts/generate-chamber-transports.mjs', ['--only', 'maxis']), command('scripts/generate-maxis-entry-summary.mjs')],
    validate: [
      command('scripts/refresh-maxis-data.mjs', ['--check']),
      command('scripts/generate-chamber-transports.mjs', ['--only', 'maxis', '--check']),
      command('scripts/generate-maxis-entry-summary.mjs', ['--check'])
    ]
  },
  {
    id: 'maxis-careers',
    label: 'Maxis governance careers',
    targets: ['data/maxis-careers.json', 'data/baker-governance-signals.json'],
    sharedTargets: ['data/baker-governance-signals.json'],
    refresh: [command('scripts/refresh-maxis-careers.mjs'), command('scripts/generate-baker-governance-signals.mjs')],
    validate: [command('scripts/refresh-maxis-careers.mjs', ['--check']), command('scripts/generate-baker-governance-signals.mjs', ['--check']), command('tests/baker-governance-signals-check.mjs')]
  },
  {
    id: 'nakamoto',
    label: 'Nakamoto source ledger',
    targets: ['data/nakamoto-sources.json'],
    refresh: [command('scripts/refresh-nakamoto-sources.mjs')],
    validate: [command('scripts/refresh-nakamoto-sources.mjs', ['--check'])]
  },
  {
    id: 'capital',
    label: 'Capital Chamber',
    targets: ['data/capital-snapshot.json', 'data/transports/v1/data/capital-snapshot.json', 'data/capital-entry-summary.json'],
    refresh: [command('scripts/refresh-capital-data.mjs'), command('scripts/generate-chamber-transports.mjs', ['--only', 'capital']), command('scripts/generate-capital-entry-summary.mjs')],
    validate: [command('scripts/refresh-capital-data.mjs', ['--check']), command('scripts/generate-chamber-transports.mjs', ['--only', 'capital', '--check']), command('scripts/generate-capital-entry-summary.mjs', ['--check'])]
  },
  {
    id: 'minerals',
    label: 'Critical Minerals Chamber',
    targets: ['data/minerals-snapshot.json', 'data/minerals-entry-summary.json', 'data/transports/v1/data/minerals-snapshot.json'],
    refresh: [command('scripts/refresh-minerals-data.mjs'), command('scripts/generate-chamber-transports.mjs', ['--only', 'minerals'])],
    validate: [
      command('scripts/refresh-minerals-data.mjs', ['--check']),
      command('scripts/generate-chamber-transports.mjs', ['--only', 'minerals', '--check']),
      command('tests/minerals-check.mjs')
    ]
  },
  {
    id: 'uranium',
    label: 'Uranium Chamber',
    targets: ['data/uranium-snapshot.json', 'data/uranium-entry-summary.json'],
    refresh: [command('scripts/refresh-uranium-data.mjs')],
    validate: [
      command('scripts/refresh-uranium-data.mjs', ['--check']),
      command('tests/uranium-check.mjs')
    ]
  },
  {
    id: 'metals',
    label: 'Precious Metals Chamber',
    targets: ['data/metals-snapshot.json', 'data/metals-entry-summary.json'],
    refresh: [command('scripts/refresh-metals-data.mjs')],
    validate: [
      command('scripts/refresh-metals-data.mjs', ['--check']),
      command('tests/metals-check.mjs')
    ]
  },
  ...['teztree', 'ttcrowd', 'hacktez'].map(source => ({
    id: `community-funding-${source}`,
    label: `Community Funding: ${source}`,
    targets: [`data/community-funding-${source}.json`, `data/community-funding-${source}-preview.json`],
    refresh: [command('scripts/refresh-community-funding.mjs', [`--source=${source}`])],
    validate: [command('scripts/refresh-community-funding.mjs', [`--source=${source}`, '--check'])]
  })),
  {
    id: 'ecosystem',
    label: 'Ecosystem Activity',
    targets: ['data/ecosystem-stats.json', 'data/transports/v1/data/ecosystem-stats.json', 'data/ecosystem-entry-summary.json'],
    refresh: [command('scripts/refresh-ecosystem-stats.mjs'), command('scripts/generate-chamber-transports.mjs', ['--only', 'ecosystem']), command('scripts/generate-ecosystem-entry-summary.mjs')],
    validate: [
      command('scripts/refresh-ecosystem-stats.mjs', ['--check']),
      command('scripts/generate-chamber-transports.mjs', ['--only', 'ecosystem', '--check']),
      command('tests/ecosystem-stats-check.mjs'),
      command('scripts/generate-ecosystem-entry-summary.mjs', ['--check'])
    ]
  },
  {
    id: 'whales',
    label: 'Whale Watch',
    targets: ['data/whale-watch.json'],
    refresh: [command('scripts/refresh-whale-watch-data.mjs')],
    validate: [command('scripts/refresh-whale-watch-data.mjs', ['--check'])]
  },
  {
    id: 'milestones',
    label: 'Milestone catalog',
    targets: ['data/milestone-catalog.json'],
    refresh: [command('scripts/generate-milestone-catalog.mjs')],
    validate: []
  },
  {
    id: 'search-catalog',
    label: 'Search catalog',
    targets: ['data/search-catalog.json'],
    refresh: [command('scripts/generate-search-catalog.mjs')],
    validate: [command('scripts/generate-search-catalog.mjs', ['--check'])]
  }
]);

export function scheduledRefreshTargets(lanes = SCHEDULED_REFRESH_LANES) {
  return [...new Set(lanes.flatMap((lane) => lane.targets))];
}
