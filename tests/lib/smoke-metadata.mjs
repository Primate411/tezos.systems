const RULES = [
  {
    suites: /^(standalone-chamber-boot|tezoscrp|release-update|route-search-state|overlay-stack)$/,
    files: ['js/core/standalone-chamber.js', 'js/core/shell-lifecycle.js', 'scripts/lib/standalone-chamber-shell.mjs', 'scripts/generate-chamber-routes.mjs', 'tezoscrp/index.html'],
    tags: ['shell', 'navigation', 'tezoscrp'],
    risk: 'high'
  },
  {
    suites: /^(optional-startup|hen-mode)$/,
    files: ['js/core/hen-init.js', 'js/features/hen-mode.js', 'js/ui/changelog-launcher.js', 'js/features/changelog.js', 'css/protocol-anthology.css', 'hen/index.html'],
    tags: ['shell', 'navigation'],
    risk: 'high'
  },
  {
    suites: /^(my-tezos-|octez-connect-sdk-loader)/,
    files: [
      'js/features/my-tezos*',
      'js/features/my-baker.js',
      'js/features/rewards-tracker.js',
      'js/core/my-tezos*',
      'js/core/wallet.js',
      'css/my-tezos*'
    ],
    tags: ['my-tezos'],
    risk: 'high'
  },
  {
    suites: /^(network-health|my-tezos-block-monitor|quiet-refresh)$/,
    files: [
      'js/features/network-health.js',
      'js/core/block-story.mjs',
      'css/network-health*'
    ],
    tags: ['live-data', 'network-health'],
    risk: 'high'
  },
  {
    suites: /^(governance-lb-|hash-modal-cleanup|baker-directory|baker-wallet-actions)/,
    files: [
      'js/features/governance*',
      'js/features/etherlink-governance.js',
      'js/features/liquidity-baking.js',
      'js/features/tz4-adoption.js',
      'js/features/chamber.js',
      'data/governance-*'
    ],
    tags: ['governance', 'live-data'],
    risk: 'high'
  },
  {
    suites: /^(live-pulse-|release-radar-pulse|hero-command-bar-desktop|cycle-milestone)/,
    files: [
      'js/features/daily-briefing.js',
      'js/ui/pulse-ticker.js',
      'js/core/pulse-history*',
      'js/core/release-radar.mjs',
      'js/features/milestone-*',
      'css/live-pulse*'
    ],
    tags: ['live-pulse', 'live-data'],
    risk: 'high'
  },
  {
    suites: /^(hero-command-bar-|route-search-state|home-layout|first-visit-tour|handoff-question-field)$/,
    files: [
      'js/features/search.js',
      'js/core/search-*',
      'js/ui/home-layout.js',
      'js/features/tooltip-tour.js',
      'css/hero-search*',
      'css/shell-extras*'
    ],
    tags: ['shell', 'navigation']
  },
  {
    suites: /^(themes|valley-theme|live-number-motion|visit-signal-bloom)$/,
    files: [
      'js/ui/theme.js',
      'js/effects/*',
      'css/themes/*',
      'css/valley*'
    ],
    tags: ['themes', 'motion'],
    risk: 'high'
  },
  {
    suites: /^(capital-chamber|launcher-projections)$/,
    files: ['js/features/capital-chamber.js', 'css/capital*', 'data/capital-*'],
    tags: ['chamber', 'capital']
  },
  {
    suites: /^(minerals-chamber|launcher-projections)$/,
    files: ['js/features/minerals-chamber.js', 'css/minerals*', 'data/minerals-*'],
    tags: ['chamber', 'minerals']
  },
  {
    suites: /^(uranium-chamber|launcher-projections)$/,
    files: ['js/features/uranium-chamber.js', 'css/uranium*', 'data/uranium-*'],
    tags: ['chamber', 'uranium']
  },
  {
    suites: /^(metals-chamber|launcher-projections)$/,
    files: ['js/features/metals-chamber.js', 'css/metals*', 'data/metals-*'],
    tags: ['chamber', 'metals']
  },
  {
    suites: /^(ecosystem-activity|launcher-projections)$/,
    files: ['js/features/ecosystem-chamber.js', 'css/ecosystem*', 'data/ecosystem-*'],
    tags: ['chamber', 'ecosystem']
  },
  {
    suites: /^staking-chamber$/,
    files: ['js/features/staking-chamber.js', 'css/staking*'],
    tags: ['chamber', 'staking'],
    risk: 'high'
  },
  {
    suites: /^(whale-watch-chamber|feature-workflows-desktop)$/,
    files: ['js/features/whale*', 'js/features/sleeping-giants.js', 'data/whale-watch.json', 'css/whale*'],
    tags: ['chamber', 'whales'],
    risk: 'high'
  },
  {
    suites: /^(maxis|launcher-projections|maxis-domain-passport)$/,
    files: ['js/features/maxis.js', 'css/maxis*', 'data/maxis*', 'data/maxis/**'],
    tags: ['chamber', 'maxis'],
    risk: 'high'
  },
  {
    suites: /^tezoscrp$/,
    files: ['js/features/tezoscrp.js', 'css/tezoscrp*', 'data/tezoscrp-*'],
    tags: ['chamber', 'tezoscrp']
  },
  {
    suites: /^ledger-flow$/,
    files: ['js/features/ledger-flow.js', 'css/ledger-flow*'],
    tags: ['chamber', 'ledger-flow'],
    risk: 'high'
  },
  {
    suites: /^cycle-history-chamber$/,
    files: ['js/features/history.js', 'css/history*'],
    tags: ['chamber', 'history']
  },
  {
    suites: /^(tezos-domains|my-tezos-subdomain-input)$/,
    files: ['js/core/tezos-domains.js', 'js/features/tezos-domains.js', 'css/tezos-domains*'],
    tags: ['domains']
  },
  {
    suites: /^(route-formatting|standalone-links|route-crawl)$/,
    files: ['landing.html', '**/*.html', 'css/landing*', 'js/landing/*'],
    tags: ['routes']
  },
  {
    suites: /^app-shell$/,
    files: ['version.json', 'site.webmanifest', 'offline.html', 'robots.txt', 'sitemap.xml', '.well-known/*'],
    tags: ['shell']
  },
  {
    suites: /^octez-connect-sdk-loader$/,
    files: ['package.json', 'package-lock.json'],
    tags: ['live-canary'],
    risk: 'high'
  },
  {
    suites: /^kraken-websocket-canary$/,
    files: ['js/features/uranium-chamber.js'],
    tags: ['live-canary', 'uranium'],
    risk: 'high'
  }
];

export const GLOBAL_SMOKE_PATTERNS = [
  '.github/workflows/ci.yml',
  'index.html',
  'package.json',
  'package-lock.json',
  'sw.js',
  'tests/smoke.mjs',
  'tests/lib/smoke-*',
  'tests/fixtures/smoke-*',
  'js/core/app.js',
  'js/core/api.js',
  'js/core/config.js',
  'js/core/quiet-refresh.js',
  'js/core/utils.js',
  'css/styles.css',
  'css/styles.min.css'
];

export const NO_BROWSER_IMPACT_PATTERNS = [
  'AGENTS.md',
  'README.md',
  'LICENSE',
  'NOTICE',
  'docs/**',
  '*.md'
];

const RISK_WEIGHT = { low: 0, normal: 1, high: 2 };

export function metadataForSmokeSuite(name) {
  const matching = RULES.filter((rule) => rule.suites.test(name));
  const files = [...new Set(matching.flatMap((rule) => rule.files || []))];
  const tags = [...new Set(['browser', ...matching.flatMap((rule) => rule.tags || [])])];
  const risk = matching.reduce((current, rule) => (
    (RISK_WEIGHT[rule.risk || 'normal'] || 0) > (RISK_WEIGHT[current] || 0)
      ? rule.risk
      : current
  ), 'normal');
  return { files, risk, tags };
}
