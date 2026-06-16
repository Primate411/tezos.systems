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
    'js/core/app.js',
    'js/core/api.js',
    'js/core/config.js',
    'js/core/tzkt-throttle.js',
    'js/core/wallet.js',
    'sw.js',
    'version.json',
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
  const themePreload = await readText('js/core/theme-preload.js');
  const themeUi = await readText('js/ui/theme.js');
  const cssMatch = index.match(/css\/styles\.min\.css\?v=(\d+)/);
  const appPreloadMatch = index.match(/js\/core\/app\.js\?v=(\d+)/);
  const appScriptMatch = index.match(/<script[^>]+src=["']js\/core\/app\.js\?v=(\d+)["']/);
  const cacheMatch = sw.match(/CACHE_NAME\s*=\s*['"]tezos-systems-v(\d+)['"]/);
  const themePreloadMatch = themePreload.match(/THEME_CSS_VERSION\s*=\s*['"](\d+)['"]/);
  const themeUiMatch = themeUi.match(/THEME_CSS_VERSION\s*=\s*['"](\d+)['"]/);

  if (!cssMatch) fail('index.html must serve css/styles.min.css with a ?v= cache stamp');
  if (!appPreloadMatch) fail('index.html modulepreload for js/core/app.js must carry a ?v= cache stamp');
  if (!appScriptMatch) fail('index.html app module script must carry a ?v= cache stamp');
  if (!cacheMatch) fail('sw.js CACHE_NAME must be tezos-systems-vNN');
  if (!themePreloadMatch) fail('theme-preload.js must expose THEME_CSS_VERSION');
  if (!themeUiMatch) fail('theme.js must expose THEME_CSS_VERSION');

  const versions = [cssMatch?.[1], appPreloadMatch?.[1], appScriptMatch?.[1], cacheMatch?.[1]].filter(Boolean);
  if (new Set(versions).size > 1) {
    fail(`cache stamps are out of sync: ${versions.join(', ')}`);
  } else if (versions.length === 4) {
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
  const requiredIds = [
    'price-bar',
    'ctez-launcher',
    'features-gear',
    'features-dropdown',
    'ctez-feature-btn',
    'chambers-toggle',
    'chambers-section',
    'chambers-grid',
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
    ['share picker styles hook', 'section-picker-note']
  ];

  for (const [label, snippet] of requiredSnippets) {
    if (!index.includes(snippet) && !(await readText('js/ui/share.js')).includes(snippet)) {
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
  const chamber = await readText('js/features/chamber.js');
  const lb = await readText('js/features/liquidity-baking.js');
  const tezlink = await readText('js/features/tezlink.js');
  const etherlinkGovernance = await readText('js/features/etherlink-governance.js');
  const tz4 = await readText('js/features/tz4-adoption.js');
  const ctez = await readText('js/features/ctez.js');
  const wallet = await readText('js/core/wallet.js');
  const health = await readText('js/features/network-health.js');
  const share = await readText('js/ui/share.js');
  const styles = await readText('css/styles.css');
  const deepLinkContracts = [
    ['Chamber hash route', "hash === 'chamber'", app],
    ['Chambers hash route', "hash === 'chambers'", app],
    ['Tezos X Governance hash route', "hash === 'l2chamber'", app],
    ['Tezos X hash route', "hash === 'tezosx'", app],
    ['Legacy Tezlink hash route', "hash === 'tezlink'", app],
    ['Health hash route', "hash === 'health'", app],
    ['LB tile hash route', "hash === 'lb-tile'", app],
    ['tz4 hash route', "hash === 'tz4'", app],
    ['Chambers launcher button', 'id="chambers-toggle"', index],
    ['Chambers launcher copy link', 'data-copy-hash="#chambers"', index],
    ['Chambers visibility storage', 'tezos-systems-chambers-visible', app],
    ['Chamber card copy link', 'data-copy-hash="#chamber"', chamber],
    ['Chamber current state panel', 'id="chamber-now-panel"', chamber],
    ['Chamber current state watch list', 'chamber-now-watch', chamber],
    ['Chamber current state styles', '.chamber-now-panel', styles],
    ['Chamber proposal intel panel', 'id="chamber-proposal-intel"', chamber],
    ['Chamber gap analysis panel', 'id="chamber-gap-analysis"', chamber],
    ['Chamber promotion delta uses epoch periods', '(epoch.periods || []).find', chamber],
    ['Chamber branded share capture helper', 'captureBrandedChamberShare', share],
    ['Chamber share direct link baked into image', 'tezos.systems/chamber/', chamber],
    ['Tezos X Governance card copy link', 'data-copy-hash="#l2chamber"', etherlinkGovernance],
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
    ['LB EMA forecast panel', 'id="lb-ema-forecast"', lb],
    ['LB EMA history panel', 'id="lb-ema-history"', lb],
    ['LB vote change feed', 'id="lb-vote-change-feed"', lb],
    ['ctez hash route', "hash === 'ctez'", app],
    ['ctez feature copy link', 'data-copy-hash="#ctez"', index],
    ['ctez top-left launcher', 'id="ctez-launcher"', index],
    ['ctez feature launcher', 'id="ctez-feature-btn"', index],
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
    ['health period telemetry panel', 'id="health-period-telemetry"', health],
    ['health network load panel', 'id="health-network-load"', health],
    ['canonical chamber expand cue factory', 'function createChamberExpandCue()', app],
    ['canonical chamber expand cue class', "cue.className = 'chamber-expand-cue'", app],
    ['shared chamber footer rail style', '.chamber-entry-footer', styles],
    ['shared chamber freshness text style', '.chamber-entry-freshness', styles]
  ];
  for (const [label, snippet, text] of deepLinkContracts) {
    if (!text.includes(snippet)) fail(`missing deep-link contract: ${label}`);
  }
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

async function checkMainnetLaunchCopy() {
  const config = await readText('js/core/config.js');
  if (!config.includes("MAINNET_LAUNCH = '2018-09-17T00:00:00Z'")) {
    fail('js/core/config.js must keep MAINNET_LAUNCH at 2018-09-17T00:00:00Z');
  }

  const userFacingFiles = [
    'index.html',
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
    /mainnet launched June 30, 2018/i
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
  const expectedThemes = ['matrix', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'warzone'];
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

  pass('portable npm scripts, lockfile, and shared git hook checked');
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
  await checkMainnetLaunchCopy();
  await checkModuleImportVersions();
  await checkHistoricalPagination();
  await checkLiquidityBakingIssuanceState();
  await checkStylesheetFreshness();
  await checkAuroraDesktopTitleTreatment();
  await checkPortableTooling();
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
