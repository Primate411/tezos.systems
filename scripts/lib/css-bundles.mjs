/** CSS build inputs and outputs shared by generation and commit staging. */
export const CSS_THEMES = ['aurora', 'matrix', 'hen', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'valley', 'warzone'];

export const LAZY_SURFACE_STYLES = [
  'capital.css',
  'ecosystem.css',
  'history-chamber.css',
  'leaderboard.css',
  'ledger-flow.css',
  'maxis.css',
  'market-room.css',
  'metals-chamber.css',
  'minerals-chamber.css',
  'network-health.css',
  'network-pulse.css',
  'protocol-anthology.css',
  'staking-chamber.css',
  'tezos-domains.css',
  'tezoscrp.css',
  'uranium-chamber.css',
  'whale-chamber.css'
];

export const DIRECT_CSS_BUNDLES = ['shell-extras.css', 'hero-search.css', 'hen-mode.css', 'site-map.css', 'landing.css', 'loading.css', ...LAZY_SURFACE_STYLES]
  .map(filename => ({ source: `css/${filename}`, output: `css/${filename.replace(/\.css$/, '.min.css')}` }));

export const CSS_SOURCES = ['css/styles.css', ...DIRECT_CSS_BUNDLES.map(bundle => bundle.source)];
export const CSS_TARGETS = [
  'css/styles.min.css',
  'css/my-tezos.min.css',
  ...DIRECT_CSS_BUNDLES.map(bundle => bundle.output),
  ...CSS_THEMES.flatMap(theme => [`css/themes/${theme}.css`, `css/themes/${theme}.min.css`])
];
export const CSS_SOURCE_PATTERNS = [
  ...CSS_SOURCES.map(file => new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)),
  /^scripts\/build-css\.mjs$/,
  /^scripts\/lib\/css-bundles\.mjs$/,
  /^package(?:-lock)?\.json$/
];
