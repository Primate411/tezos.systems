#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    'css/hero-search.css',
    'js/core/app.js',
    'js/core/api.js',
    'js/core/config.js',
    'js/core/tzkt-throttle.js',
    'js/core/wallet.js',
    'js/features/governance-alerts.js',
    'js/features/search.js',
    'sw.js',
    'version.json',
    'widgets/runtime.js',
    'feed.xml',
    'data/governance-votes.json',
    'data/governance-refresh-report.json',
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

async function checkCacheBustAlignment() {
  const index = await readText('index.html');
  const sw = await readText('sw.js');
  const heroSearch = await readText('js/features/search.js');
  const ledgerFlow = await readText('js/features/ledger-flow.js');
  const themePreload = await readText('js/core/theme-preload.js');
  const themeUi = await readText('js/ui/theme.js');
  const cssMatch = index.match(/css\/styles\.min\.css\?v=(\d+)/);
  const heroCssLinkMatch = index.match(/css\/hero-search\.css\?v=(\d+)/);
  const appPreloadMatch = index.match(/js\/core\/app\.js\?v=(\d+)/);
  const appScriptMatch = index.match(/<script[^>]+src=["']js\/core\/app\.js\?v=(\d+)["']/);
  const themePreloadScriptMatch = index.match(/js\/core\/theme-preload\.js\?v=(\d+)/);
  const cacheMatch = sw.match(/CACHE_NAME\s*=\s*['"]tezos-systems-v(\d+)['"]/);
  const heroSearchCssMatch = heroSearch.match(/HERO_SEARCH_CSS_URL\s*=\s*['"]\/css\/hero-search\.css\?v=(\d+)['"]/);
  const ledgerFlowCssMatch = ledgerFlow.match(/LEDGER_FLOW_CSS_URL\s*=\s*['"]\/css\/ledger-flow\.css\?v=(\d+)['"]/);
  const themePreloadMatch = themePreload.match(/THEME_CSS_VERSION\s*=\s*['"](\d+)['"]/);
  const themeUiMatch = themeUi.match(/THEME_CSS_VERSION\s*=\s*['"](\d+)['"]/);

  if (!cssMatch) fail('index.html must serve css/styles.min.css with a ?v= cache stamp');
  if (!heroCssLinkMatch) fail('index.html must serve css/hero-search.css with a ?v= cache stamp');
  if (!appPreloadMatch) fail('index.html modulepreload for js/core/app.js must carry a ?v= cache stamp');
  if (!appScriptMatch) fail('index.html app module script must carry a ?v= cache stamp');
  if (!themePreloadScriptMatch) fail('index.html theme-preload.js script must carry a ?v= cache stamp');
  if (!cacheMatch) fail('sw.js CACHE_NAME must be tezos-systems-vNN');
  if (!heroSearchCssMatch) fail('search.js hero-search.css loader must carry a ?v= cache stamp');
  if (!ledgerFlowCssMatch) fail('ledger-flow.js ledger-flow.css loader must carry a ?v= cache stamp');
  if (!themePreloadMatch) fail('theme-preload.js must expose THEME_CSS_VERSION');
  if (!themeUiMatch) fail('theme.js must expose THEME_CSS_VERSION');

  const versions = [
    cssMatch?.[1],
    heroCssLinkMatch?.[1],
    appPreloadMatch?.[1],
    appScriptMatch?.[1],
    themePreloadScriptMatch?.[1],
    cacheMatch?.[1],
    heroSearchCssMatch?.[1],
    ledgerFlowCssMatch?.[1]
  ].filter(Boolean);
  if (new Set(versions).size > 1) {
    fail(`cache stamps are out of sync: ${versions.join(', ')}`);
  } else if (versions.length === 8) {
    pass(`cache stamps aligned at v${versions[0]}`);
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
    'api.llama.fi',
    'explorer.etherlink.com',
    'node.mainnet.etherlink.com'
  ];
  for (const domain of requiredConnect) {
    if (!csp.includes(domain)) fail(`CSP connect-src is missing ${domain}`);
  }
  pass('CSP includes required live-data domains');
}

async function checkSitemapCoverage() {
  const sitemap = await readText('sitemap.xml');
  const locs = new Set(Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => match[1]));
  const expected = [
    'https://tezos.systems/',
    'https://tezos.systems/staking/',
    'https://tezos.systems/governance/',
    'https://tezos.systems/chamber/',
    'https://tezos.systems/health/',
    'https://tezos.systems/tezosx/',
    'https://tezos.systems/l2chamber/',
    'https://tezos.systems/tz4/',
    'https://tezos.systems/lb/',
    'https://tezos.systems/ctez/',
    'https://tezos.systems/bakers/',
    'https://tezos.systems/hen/',
    'https://tezos.systems/compare/'
  ];

  for (const file of await walk('compare', (name) => name.endsWith('.html'))) {
    expected.push(file.endsWith('/index.html')
      ? 'https://tezos.systems/compare/'
      : `https://tezos.systems/${file}`);
  }
  for (const file of await walk('widgets', (name) => name.endsWith('.html'))) {
    expected.push(`https://tezos.systems/${file}`);
  }

  for (const url of new Set(expected)) {
    if (!locs.has(url)) fail(`sitemap.xml missing ${url}`);
  }
  for (const url of locs) {
    if (url.includes('#')) fail(`sitemap.xml should use crawlable paths instead of hash fragments: ${url}`);
  }

  pass(`sitemap coverage checked: ${locs.size} URLs`);
}

async function checkSelectorContracts() {
  const index = await readText('index.html');
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
    'block-ticker-strip',
    'block-ticker-line',
    'header-protocol-chip',
    'header-current-protocol',
    'upgrade-clock',
    'hero-slot',
    'hero-search-form',
    'hero-search-input',
    'hero-search-panel',
    'recruit-section',
    'tezos-loop-console',
    'tezos-loop-title',
    'tezos-loop-line',
    'tezos-loop-hints',
    'tezos-loop-search',
    'tezos-loop-link',
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
    ['combined chambers launcher copy link', 'data-copy-hash="#chambers"'],
    ['direct feature copy links', 'data-copy-hash="#compare"'],
    ['widget embed utility panel', 'class="widget-utility-panel"'],
    ['widget embed utility hidden by default', 'class="stats-section widget-utility-section toggleable-section"'],
    ['widget builder CTA', 'href="/widgets/builder.html"'],
    ['share picker styles hook', 'section-picker-note'],
    ['price bar change surface', 'class="price-change"'],
    ['Tezos loop console', 'class="tezos-loop-console"'],
    ['Tezos loop aura chip rail', 'class="tezos-loop-chips"'],
    ['Tezos loop search map copy', 'Search is the map'],
    ['Tezos loop accepted inputs', 'Paste a wallet address or .tez name, baker, KT1 contract, operation hash, block, protocol, or slash command'],
    ['hero command bar placeholder copy', 'Search wallet · .tez name · baker · KT1 contract · operation hash · block'],
    ['timeline share fallback host', 'document.querySelector(\'.upgrade-badges\')'],
    ['timeline share protocol history chamber fallback', 'document.querySelector(\'#protocol-history-chamber-modal .protocol-history-chamber-header\')'],
    ['header protocol chip', 'id="header-protocol-chip" href="#protocol-history"'],
    ['command deck shell', 'class="upgrade-clock command-deck"'],
    ['hero command bar slot', 'class="hero-slot" id="hero-slot"'],
    ['hero command bar combobox', 'aria-controls="hero-search-panel"'],
    ['My Tezos recruit prompt', 'data-hero-query="my tezos"'],
    ['Price watcher recruit prompt', 'data-hero-query="price"'],
    ['Governance alert strip shell', 'class="stats-section governance-alert-section"'],
    ['History modal direct link copy button', 'id="history-copy-link" data-copy-hash="#history"'],
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
  const search = await readText('js/features/search.js');
  const heroSearchCss = await readText('css/hero-search.css');
  const henModeCss = await readText('css/hen-mode.css');
  const chamber = await readText('js/features/chamber.js');
  const lb = await readText('js/features/liquidity-baking.js');
  const tezlink = await readText('js/features/tezlink.js');
  const etherlinkGovernance = await readText('js/features/etherlink-governance.js');
  const tz4 = await readText('js/features/tz4-adoption.js');
  const ctez = await readText('js/features/ctez.js');
  const ledgerFlow = await readText('js/features/ledger-flow.js');
  const wallet = await readText('js/core/wallet.js');
  const health = await readText('js/features/network-health.js');
  const share = await readText('js/ui/share.js');
  const governanceAlerts = await readText('js/features/governance-alerts.js');
  const myTezos = await readText('js/features/my-tezos.js');
  const myBaker = await readText('js/features/my-baker.js');
  const comparison = await readText('js/features/comparison.js');
  const compareIndex = await readText('compare/index.html');
  const chamberRoutes = await readText('scripts/lib/chamber-routes.mjs');
  const themeUi = await readText('js/ui/theme.js');
  const styles = await readText('css/styles.css');
  const ledgerFlowCss = await readText('css/ledger-flow.css');
  const deepLinkContracts = [
    ['Chamber hash route', "hash === 'chamber'", app],
    ['Chambers hash route', "hash === 'chambers'", app],
    ['Tezos X Governance hash route', "hash === 'l2chamber'", app],
    ['Tezos X hash route', "hash === 'tezosx'", app],
    ['Legacy Tezlink hash route', "hash === 'tezlink'", app],
    ['Health hash route', "hash === 'health'", app],
    ['Ledger Flow hash route', "hash === 'ledger-flow'", app],
    ['Ledger Flow scoped hash route', "params.has('ledger-flow')", app],
    ['Ledger Flow modal cleanup', 'closeLedgerFlowChamber', app],
    ['Protocol history hash route', "params.has('protocol')", app],
    ['Protocol History Chamber hash route', "hash === 'protocol-history'", app],
    ['Protocol history global opener', 'window.openProtocolHistoryByName = openProtocolHistoryByName', app],
    ['Protocol History Chamber global opener', 'window.openProtocolHistoryChamber = openProtocolHistoryChamber', app],
    ['Protocol History header launcher', 'function initProtocolHistoryHeaderLauncher', app],
    ['Protocol History chamber current-first timeline', 'const displayProtocols = isHistoryChamber ? [...protocols].reverse() : protocols', app],
    ['Protocol History Chamber card', "card.id = 'protocol-history-entry-card'", app],
    ['Protocol Anthology card copy', 'Protocol Anthology', app],
    ['Protocol Anthology card anatomy', 'protocol-history-entry-anthology', app],
    ['Protocol Anthology recent spines', 'protocol-history-entry-spine-item', app],
    ['Protocol Anthology curator board', 'protocol-history-anthology-board', app],
    ['Protocol Anthology real-data renderer', 'function renderProtocolAnthologyBoard', app],
    ['Protocol Anthology protocol open chips', 'data-protocol-open', app],
    ['Protocol Anthology living archive strip', 'protocol-anthology-live', app],
    ['Protocol Anthology clash map renderer', 'protocol-anthology-clash-map', app],
    ['Protocol Anthology metrics styles', '.protocol-anthology-metrics', heroSearchCss],
    ['Protocol Anthology shelves styles', '.protocol-anthology-shelves', heroSearchCss],
    ['Protocol Anthology clash styles', '.protocol-anthology-clash', heroSearchCss],
    ['Protocol Anthology timeline crowd styles', '.contention-crowd', heroSearchCss],
    ['Protocol History Chamber modal', "overlay.id = 'protocol-history-chamber-modal'", app],
    ['Protocol History Chamber timeline launcher', 'data-protocol-history-jump="timeline"', app],
    ['Protocol History Chamber impact launcher', 'data-protocol-history-jump="impact"', app],
    ['Protocol History stable read button', 'history-expand-btn', app],
    ['Protocol History print button', 'history-modal-print', app],
    ['Protocol History print helper', 'function printProtocolHistory', app],
    ['Protocol History Chamber reveal helper', 'function revealProtocolHistorySection', app],
    ['Protocol History Chamber timeline toggle target', 'protocol-timeline-toggle-btn', app],
    ['Protocol History Chamber action styles', '.protocol-history-chamber-action', heroSearchCss],
    ['Hero search mode body class', "document.body.classList.toggle('hero-search-mode'", search],
    ['Hero search dims background content', 'body.hero-search-mode .main-content', heroSearchCss],
    ['Hero search raises command deck', 'body.hero-search-mode .command-deck', heroSearchCss],
    ['Hero search empty-state guide', 'hero-search-guide', search],
    ['Hero search guide styles', '.hero-search-guide', heroSearchCss],
    ['Hero search wallet chip clear copy', 'Wallet or .tez', search],
    ['Hero search Ledger Flow command', 'Ledger Flow', search],
    ['Hero search Ledger Flow scoped account route', '#ledger-flow=${encodeURIComponent(q)}', search],
    ['Hero search KT1 starter route', "['kt1', 'KT1 Contracts']", search],
    ['Tezos loop console initializer', 'function initTezosLoopConsole()', app],
    ['Tezos loop aura persistence', 'TEZOS_LOOP_STORAGE_KEY', app],
    ['Tezos loop console styles', '.tezos-loop-console', heroSearchCss],
    ['Tezos loop active card styles', '.recruit-card.is-active', heroSearchCss],
    ['Hero search price command', "id: 'price'", search],
    ['LB tile hash route', "hash === 'lb-tile'", app],
    ['tz4 hash route', "hash === 'tz4'", app],
    ['comparison summary renderer', 'function renderComparisonSummary', comparison],
    ['comparison summary standing copy', 'Self-upgrading baseline', comparison],
    ['comparison summary grid', 'comparison-standing-grid comparison-grid', comparison],
    ['comparison hub standing summary', 'Where the major proof-of-stake chains stand', compareIndex],
    ['comparison hub all peer links', '/compare/tezos-vs-algorand.html', compareIndex],
    ['Chambers launcher button', 'id="chambers-toggle"', index],
    ['Chambers launcher copy link', 'data-copy-hash="#chambers"', index],
    ['Chambers visibility storage', 'tezos-systems-chambers-visible', app],
    ['Chamber card copy link', 'data-copy-hash="#chamber"', chamber],
    ['Tezos L1 Governance card label', 'Tezos L1 Governance', chamber],
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
    ['Tezos X Governance originator guard', 'GOVERNANCE_CONTRACT_CREATOR', etherlinkGovernance],
    ['Tezos X Governance discovery failure copy', 'contract discovery unavailable', etherlinkGovernance],
    ['Tezos X Governance track rules panel', 'id="etherlink-gov-rules"', etherlinkGovernance],
    ['Tezos X Governance track memory panel', 'id="etherlink-gov-memory"', etherlinkGovernance],
    ['Tezos X Governance merged timeline panel', 'id="etherlink-gov-timeline"', etherlinkGovernance],
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
    ['Ledger Flow card sent metric color hook', 'data-ledger-flow-metric="sent"', ledgerFlow],
    ['Ledger Flow card first metric color hook', 'data-ledger-flow-metric="first"', ledgerFlow],
    ['Ledger Flow card metric color CSS', '.chamber-entry-metric[data-ledger-flow-metric] strong', ledgerFlowCss],
    ['Ledger Flow threshold slider', 'id="ledger-flow-threshold"', ledgerFlow],
    ['Ledger Flow amount-weighted edge width', 'function edgeWidth', ledgerFlow],
    ['Ledger Flow first inbound fetch', 'async function fetchFirstInbound', ledgerFlow],
    ['Ledger Flow TzKT sender query', 'params.sender = address', ledgerFlow],
    ['Ledger Flow TzKT target query', 'params.target = address', ledgerFlow],
    ['Ledger Flow My Tezos counterparty links', '#my-baker=${encodeURIComponent(address)}', ledgerFlow],
    ['Ledger Flow compact TzKT pills', 'ledger-flow-tzkt-pill', ledgerFlow],
    ['Ledger Flow SVG TzKT node pills', 'ledger-flow-node-tzkt-link', ledgerFlow],
    ['Ledger Flow label-aware node width', 'function nodeGeometry', ledgerFlow],
    ['ctez hash route', "hash === 'ctez'", app],
    ['ctez feature copy link', 'data-copy-hash="#ctez"', index],
    ['ctez top-left launcher', 'id="ctez-launcher"', index],
    ['ctez feature launcher', 'id="ctez-feature-btn"', index],
    ['TzSafe top-left launcher', 'id="tzsafe-launcher"', index],
    ['TzSafe feature launcher', 'id="tzsafe-feature-link"', index],
    ['TzSafe canonical external link', 'href="https://tzsafe.tez.page/"', index],
    ['TzSafe feature copy', 'TzSafe Recovery', index],
    ['TzSafe cleanup hint', 'Legacy KT1 multisig cleanup path', index],
    ['TzSafe external action button', 'feature-external-link" href="https://tzsafe.tez.page/"', index],
    ['TzSafe feature row polish', '.tzsafe-feature-link', henModeCss],
    ['TzSafe tray icon style', '.tzsafe-launcher', henModeCss],
    ['TzSafe key mark style', '.tzsafe-logo-key', henModeCss],
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
    ['Octez.Connect SDK pin', '@tezos-x/octez.connect-sdk@${OCTEZ_CONNECT_VERSION}', wallet],
    ['Octez.Connect ESM loader', 'https://esm.sh/@tezos-x/octez.connect-sdk@${OCTEZ_CONNECT_VERSION}?bundle', wallet],
    ['Octez.Connect lazy loader', 'loadOctezConnect', wallet],
    ['Octez.Connect preload helper', 'preloadOctezConnect', wallet],
    ['Octez.Connect My Tezos sync key', 'tezos-systems-my-baker-address', wallet],
    ['Octez.Connect wallet storage key', 'tezos-systems-octez-wallet-address', wallet],
    ['My Tezos wallet connect control', 'id="drawer-wallet-connect-btn"', index],
    ['My Tezos connected wallet control', 'id="my-tezos-wallet-connect"', index],
    ['My Tezos Ledger Flow link control', 'id="my-tezos-ledger-flow-link"', index],
    ['My Tezos Ledger Flow address route', '#ledger-flow=${encodeURIComponent(addr)}', myBaker],
    ['My Tezos Ledger Flow link style', '.drawer-ledger-flow-link', styles],
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
    ['app direct account path handler', 'function getMyTezosPathTarget()', app],
    ['app direct domain resolver', 'function resolveForwardTezDomain(name)', app],
    ['health tile card copy link', 'data-copy-hash="#health"', index],
    ['health tile expand cue', 'data-stat="network-health"', index],
    ['health tile chamber wiring', 'openNetworkHealthChamber', health],
    ['health direct footer link', 'Direct: /health/', health],
    ['health incident memory panel', 'id="health-incident-memory"', health],
    ['health cycle timing panel', 'id="health-cycle-timing"', health],
    ['health cycle timing TzKT source', '/statistics/cyclic', health],
    ['health Teztale consensus panel', 'id="health-teztale-consensus"', health],
    ['health Teztale source URL', 'TEZTALE_REPORT_URL', health],
    ['health Teztale Nomadic Labs credit', 'Teztale by Nomadic Labs', health],
    ['health Teztale config endpoint', "teztale: 'https://teztale-server-mainnet-ro-prd.octez.tech'", await readText('js/core/config.js')],
    ['health Octez versions panel', 'id="health-octez-versions"', health],
    ['health Octez versions TzKT source', '/delegates?active=true', health],
    ['health Octez versions cache TTL', 'OCTEZ_VERSIONS_TTL', health],
    ['health period telemetry panel', 'id="health-period-telemetry"', health],
    ['health network load panel', 'id="health-network-load"', health],
    ['health chain proof panel', 'id="health-chain-proof"', health],
    ['health chain proof slogan', 'zero forks · zero outages', health],
    ['health chain uptime counter', 'id="chain-uptime-counter"', health],
    ['top continuity stat panel', 'id="top-continuity-panel"', index],
    ['top continuity title-stack uptime launcher', 'id="top-continuity-history"', index],
    ['top continuity proof opens Protocol Anthology', 'aria-controls="protocol-history-chamber-modal"', index],
    ['top continuity identity claim', 'top-continuity-claim">uptime:', index],
    ['top continuity fixed grid before counter', 'top-continuity-claim">uptime:</span><strong', index],
    ['top continuity fixed grid before origin', '</strong><span class="top-continuity-origin"', index],
    ['top continuity since-2018 marker', 'top-continuity-origin">&middot; since 2018', index],
    ['top continuity proof baker metric', 'id="hero-chain-uptime-bakers"', index],
    ['top continuity baker all-time pill', 'data-card-history="total-bakers"', index],
    ['top continuity finality all-time pill', 'data-card-history="finality"', index],
    ['top continuity staked all-time pill', 'data-card-history="staking-ratio"', index],
    ['top continuity issuance all-time pill', 'data-card-history="issuance-rate"', index],
    ['live block ticker renderer', 'function updateBlockTicker', health],
    ['live block ticker fixed age formatter', 'function formatTickerAge', health],
    ['live block ticker transition count hook', 'blockTickerTransitionCount', health],
    ['live block ticker Octez slot', 'block-ticker-octez', health],
    ['live block ticker health feed hook', 'updateBlockTicker(data)', health],
    ['live block ticker styles', '.block-ticker-strip', styles],
    ['live block ticker Octez styles', '.block-ticker-octez', styles],
    ['network health continuity panel styles', '.health-continuity-panel', styles],
    ['network health continuity runtime styles', '.health-continuity-runtime', styles],
    ['chain uptime counter updater', "document.getElementById('chain-uptime-counter')", app],
    ['top continuity counter updater', 'setTopContinuityRuntime(years, days, hours, mins);', app],
    ['top continuity decrypt duration', 'TOP_CONTINUITY_SHUFFLE_MS = 1500', app],
    ['top continuity Protocol Anthology launcher wiring', 'openProtocolHistoryChamber();', app],
    ['top continuity Protocol Anthology hash wiring', "window.history.pushState(null, '', '#protocol-history');", app],
    ['top continuity all-time pill history wiring', "openCardHistoryModal(pill.dataset.cardHistory, 'all')", app],
    ['top continuity finality history metric', "metric: 'finality_seconds'", await readText('js/features/history.js')],
    ['chain uptime baker updater', "setChainText('chain-uptime-bakers'", app],
    ['top continuity proof styles', '.top-continuity-panel', styles],
    ['header uptime badge title stack styles', '.header-brand-stack', styles],
    ['top continuity stat rail right aligned', 'justify-content: flex-end', styles],
    ['top continuity rail is borderless tape', 'border: 0;', styles],
    ['top continuity uptime badge glint', '.top-continuity-history::before', styles],
    ['top continuity identity claim styles', '.top-continuity-claim', styles],
    ['top continuity runtime hugs label', 'margin-inline: 0.25ch 1ch;', styles],
    ['top continuity two-digit number slots', '.top-continuity-digits-2', styles],
    ['top continuity three-digit day slot', '.top-continuity-digits-3', styles],
    ['top continuity first year slot puts spare space after number', '.top-continuity-time-segment:first-child .top-continuity-time-number', styles],
    ['top continuity segmented runtime renderer', 'renderTopContinuityRuntime(years, days, hours, mins)', app],
    ['top continuity title theme token', '--header-title-color', styles],
    ['top continuity uptime badge theme bg', 'background: var(--uptime-badge-bg);', styles],
    ['top continuity uptime badge theme border', 'border: 1px solid var(--uptime-badge-border);', styles],
    ['top continuity uptime badge label token', 'color: var(--uptime-badge-label);', styles],
    ['top continuity uptime value token', 'color: var(--uptime-badge-value);', styles],
    ['top continuity value color tokens', 'var(--pill-color, var(--top-pill-bakers))', styles],
    ['top continuity baker color selector', '.top-continuity-stat[data-card-history="total-bakers"]', styles],
    ['top continuity finality color selector', '.top-continuity-stat[data-card-history="finality"]', styles],
    ['top continuity staked color selector', '.top-continuity-stat[data-card-history="staking-ratio"]', styles],
    ['top continuity issuance color selector', '.top-continuity-stat[data-card-history="issuance-rate"]', styles],
    ['top continuity mobile pill grid', 'grid-template-columns: repeat(2, minmax(0, 1fr))', styles],
    ['top continuity decrypt styles', '.top-continuity-panel.is-shuffling', styles],
    ['live block ticker aperture transition styles', 'blockTickerAperture', styles],
    ['health cycle timing styles', '.health-cycle-panel', styles],
    ['health Teztale consensus styles', '.health-consensus-panel', styles],
    ['health Octez versions styles', '.health-octez-panel', styles],
    ['My Tezos Octez warning styles', '.drawer-operator-watch', styles],
    ['My Baker Octez critical styles', '.my-baker-stat.my-baker-octez-critical', styles],
    ['canonical chamber expand cue factory', 'function createChamberExpandCue()', app],
    ['canonical chamber expand cue class', "cue.className = 'chamber-expand-cue'", app],
    ['shared chamber footer rail style', '.chamber-entry-footer', styles],
    ['shared chamber freshness text style', '.chamber-entry-freshness', styles]
  ];
  for (const [label, snippet, text] of deepLinkContracts) {
    if (!text.includes(snippet)) fail(`missing deep-link contract: ${label}`);
  }
  for (const retiredSearchCopy of ['Wallet/.tez', 'wallet/domain retrieval surface', 'TzKT boundary', 'No Tezos.Systems room']) {
    if (search.includes(retiredSearchCopy)) fail(`hero search should not retain confusing copy: ${retiredSearchCopy}`);
  }
  if (index.includes('top-continuity-proof-item') || styles.includes('.top-continuity-proof-item')) {
    fail('top header uptime badge should not retain the old Zero Forks / Zero Outages proof stamps');
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

  const cardControlContracts = [
    ['Health card copy slot', '.health-entry-card .card-copy-link', styles],
    ['Health card camera slot', '.health-entry-card .card-share-btn', styles],
    ['Network Health pre-init camera slot', '.stat-card[data-stat="network-health"] .card-share-btn', styles],
    ['Chamber history/stat slot', '#chambers-grid .chamber-entry-card > .card-history-btn', styles],
    ['Chamber history/stat desktop bottom placement', 'top: calc(0.85rem + 102px);', styles],
    ['Chamber history/stat mobile bottom placement', 'top: calc(0.78rem + 108px);', styles],
    ['Chamber share helper export', 'export function ensureCardShareButton(card)', share],
    ['Chamber share sync call', 'ensureCardShareButton(card);', app],
    ['Chamber rich share capture helper', 'async function captureChamberCard(card)', share],
    ['Chamber rich share clones visible panel', 'cloneChamberPanel(card)', share],
    ['Chamber rich share panel label', 'Visible Chamber Panel', share],
    ['Chamber generated info helper', 'function ensureChamberInfoButton(card)', app],
    ['Chamber generated info copy', 'CHAMBER_INFO_COPY', app],
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
    ...(await walk('js', (file) => file.endsWith('.js') && file !== 'js/core/app.js'))
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
    ['share text tracking rewrite', 'addShareTrackingToText', share],
    ['share modal event tracking', "trackShareEvent('modal_opened'", share],
    ['native share tracked URL', "'native_share'", share],
    ['X post event tracking', "trackShareEvent('post_x'", share],
    ['history share deep link', 'tezos.systems/#history', share],
    ['history copy hidden during capture', 'copyBtn.style.display', share],
    ['GoatCounter event helper', 'trackTezosSystemsEvent', goatcounterInit]
  ];
  for (const [label, snippet, text] of shareTrackingContracts) {
    if (!text.includes(snippet)) fail(`missing share/tracking contract: ${label}`);
  }
  pass(`share and loop tracking contracts checked: ${shareTrackingContracts.length}`);

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
    "trackWidgetEvent('impression'",
    'widget_attribution',
    'widget_markdown'
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
    if (!text.includes('../js/core/goatcounter-init.js')) {
      fail(`${file} must load the shared GoatCounter initializer for widget impressions`);
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

  for (const file of ['widgets/runtime.js', ...htmlFiles]) {
    if (!sw.includes(`'/${file}'`) && !sw.includes(`"/${file}"`)) {
      fail(`sw.js shell assets must include /${file}`);
    }
  }

  pass(`widget runtime contracts checked: ${catalog.length} widgets, ${comboStatKeys.length} combo stat options`);
}

async function checkMainnetLaunchCopy() {
  const config = await readText('js/core/config.js');
  if (!config.includes("MAINNET_LAUNCH = '2018-09-17T00:00:00Z'")) {
    fail('js/core/config.js must keep MAINNET_LAUNCH at 2018-09-17T00:00:00Z');
  }

  const userFacingFiles = [
    'index.html',
    '.well-known/ai-plugin.json',
    'data/tweets.json',
    'js/core/app.js',
    'js/features/state-of-tezos.js',
    'js/landing/live-data.js'
  ];
  const stalePatterns = [
    /June 30, 2018/i,
    /mainnet launch in June 2018/i,
    /since June 2018/i,
    /Proof of Stake from genesis\s+—\s+June 2018/i,
    /already PoS since genesis\.\s+June 2018/i,
    /temporalCoverage["']?\s*:\s*["']2018-06-30\/\.\./i,
    /mainnet launched June 30, 2018/i,
    /refreshed every 2 minutes/i
  ];

  for (const file of userFacingFiles) {
    const text = await readText(file);
    for (const pattern of stalePatterns) {
      if (pattern.test(text)) {
        fail(`${file} contains stale June 2018 mainnet launch wording (${pattern})`);
      }
    }
  }

  const index = await readText('index.html');
  if (!index.includes('September 17, 2018')) {
    fail('index.html should spell out the canonical September 17, 2018 mainnet launch date');
  }

  const aiPlugin = await readText('.well-known/ai-plugin.json');
  if (!aiPlugin.includes('September 17, 2018')) {
    fail('.well-known/ai-plugin.json must use the canonical September 17, 2018 mainnet launch date');
  }
  if (!aiPlugin.includes('visible freshness markers')) {
    fail('.well-known/ai-plugin.json must describe freshness without stale two-minute claims');
  }

  pass('mainnet launch copy uses Sep 17, 2018 in user-facing surfaces');
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
  const history = await readText('js/features/history.js');
  const index = await readText('index.html');
  const collector = await readText('.github/scripts/collect-data.js');
  const backfill = await readText('scripts/backfill-supabase-history.mjs');
  const freshness = await readText('scripts/check-supabase-history-freshness.mjs');
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
  for (const snippet of ['workflow_dispatch:', 'SUPABASE_KEY', 'BACKFILL_DRY_RUN', "node-version: '24'", 'actions/checkout@v7', 'actions/setup-node@v6']) {
    if (!backfillWorkflow.includes(snippet)) {
      fail(`Supabase backfill workflow must include ${snippet}`);
    }
  }
  const workflowFiles = [
    '.github/workflows/backfill-supabase-history.yml',
    '.github/workflows/collect-chamber-history.yml',
    '.github/workflows/collect-data.yml',
    '.github/workflows/refresh-governance-surfaces.yml'
  ];
  for (const file of workflowFiles) {
    const workflow = await readText(file);
    if (workflow.includes('actions/checkout@v4') || workflow.includes('actions/setup-node@v4') || workflow.includes("node-version: '20'")) {
      fail(`${file} must use Node 24-era action pins`);
    }
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
}

async function checkAuroraDesktopTitleTreatment() {
  const css = await readText('css/styles.css');
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
  if (!css.includes('[data-theme="aurora"] .title {\n        animation: auroraTitleShift 9s linear infinite !important;')) {
    fail('aurora title must keep its shared color-shift animation when desktop reduced-motion clamps global animations');
  }

  pass('desktop aurora title shares the mobile multicolor shift treatment');
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
    test: 'npm run test:static && npm run test:smoke',
    'test:static': 'node tests/static-checks.mjs',
    'test:smoke': 'node tests/smoke.mjs',
    'test:smoke:list': 'node tests/smoke.mjs --list',
    'test:smoke:headed': 'node tests/smoke.mjs --headed',
    'test:smoke:strict': 'node tests/smoke.mjs --strict-external',
    'test:smoke:live': 'node tests/smoke.mjs --base-url https://tezos.systems'
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
  if (!hook.includes('refresh-governance-data.mjs') || !hook.includes('stamp-version.sh')) {
    fail('.githooks/pre-commit must refresh governance data and stamp version metadata');
  }
  if (!hook.includes('guard-readme-sync.mjs') || !hook.includes('static-checks.mjs') || !hook.includes('--readme-only')) {
    fail('.githooks/pre-commit must guard README sync and run focused README contract checks');
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
    'Search is the map',
    'Start with live proof',
    'Read the latest head',
    'Protocol Anthology',
    'Network Context',
    'Explore opens optional tools',
    'Help is available when you want it',
    'Show help',
    'Not now'
  ]) {
    if (!tour.includes(snippet)) fail(`tooltip tour must retain passive search-help copy: ${snippet}`);
  }
  for (const selector of [
    '#top-continuity-history',
    '#block-ticker-button',
    '#hero-search-form',
    '#chambers-section .section-header',
    '#my-tezos-btn',
    '#tezos-loop-chips',
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
    'Open Historical Data'
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
    'cached.priceChange24h'
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

  pass('daily briefing price movement cache contracts checked');
}

async function checkNetworkContextNavigationContracts() {
  const briefing = await readText('js/features/daily-briefing.js');
  const requiredRoutes = {
    baker: '#my-baker',
    portfolio: '#price',
    staking: '#calculator',
    governance: '#chamber',
    collector: '#nfts',
    creator: '#nfts',
    price: '#price',
    whales: '#whales',
    volume: '#section=network',
    contracts: '#section=ecosystem',
    ecosystem: '#section=ecosystem',
    network: '#health'
  };

  for (const [key, route] of Object.entries(requiredRoutes)) {
    const pattern = new RegExp(`${key}:\\s*['"]${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
    if (!pattern.test(briefing)) {
      fail(`Network Context route map missing ${key} -> ${route}`);
    }
  }

  const requiredSnippets = [
    '<a class="network-focus-chip"',
    '<a class="network-signal',
    'data-network-route',
    'wireNetworkContextNavigation(container)',
    'closeDrawerForNetworkRoute(route)',
    "window.dispatchEvent(new Event('hashchange'))"
  ];
  for (const snippet of requiredSnippets) {
    if (!briefing.includes(snippet)) fail(`Network Context clickable contract missing snippet: ${snippet}`);
  }

  pass('Network Context feature routes stay clickable');
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
    'npm run routes:chambers',
    'npm run og:chambers',
    'npm run bake:compare',
    'npm run refresh:governance',
    'npm run guard:readme',
    'npm run check:readme',
    'npm run test:smoke:list',
    'SKIP_README_GUARD=1',
    'Main dashboard refresh: 2 hours',
    'Sparkline refresh: 10 minutes',
    'Price refresh: 30 minutes',
    'Memory cache TTL: 1 minute',
    'Storage cache TTL: 4 hours',
    'css/styles.min.css',
    'scripts/lib/playwright-browser.cjs',
    'BROWSER_EXECUTABLE_PATH',
    'CACHE_NAME',
    'version.json',
    'September 17, 2018'
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

async function main() {
  if (process.argv.includes('--readme-only')) {
    await checkPortableTooling();
    await checkReadmeContracts();

    for (const message of passes) console.log(`ok - ${message}`);
    for (const message of warnings) console.warn(`warn - ${message}`);
    for (const message of failures) console.error(`fail - ${message}`);

    console.log(`\nREADME checks: ${passes.length} passed, ${warnings.length} warnings, ${failures.length} failed`);
    if (failures.length) process.exit(1);
    return;
  }

  await checkRequiredFiles();
  await checkJsonFiles();
  await checkGovernanceVotes();
  await checkLocalReferences();
  await checkCacheBustAlignment();
  await checkCsp();
  await checkSitemapCoverage();
  await checkSelectorContracts();
  await checkWidgetRuntimeContracts();
  await checkMainnetLaunchCopy();
  await checkModuleImportVersions();
  await checkHistoricalPagination();
  await checkLiquidityBakingIssuanceState();
  await checkStylesheetFreshness();
  await checkAuroraDesktopTitleTreatment();
  await checkPortableTooling();
  await checkSmokeSuiteCatalogContracts();
  await checkTourAndShareCaptureContracts();
  await checkDailyBriefingPriceContracts();
  await checkNetworkContextNavigationContracts();
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
