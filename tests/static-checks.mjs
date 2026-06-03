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
    'sw.js',
    'version.json',
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
  const cssMatch = index.match(/css\/styles\.min\.css\?v=(\d+)/);
  const appPreloadMatch = index.match(/js\/core\/app\.js\?v=(\d+)/);
  const appScriptMatch = index.match(/<script[^>]+src=["']js\/core\/app\.js\?v=(\d+)["']/);
  const cacheMatch = sw.match(/CACHE_NAME\s*=\s*['"]tezos-systems-v(\d+)['"]/);

  if (!cssMatch) fail('index.html must serve css/styles.min.css with a ?v= cache stamp');
  if (!appPreloadMatch) fail('index.html modulepreload for js/core/app.js must carry a ?v= cache stamp');
  if (!appScriptMatch) fail('index.html app module script must carry a ?v= cache stamp');
  if (!cacheMatch) fail('sw.js CACHE_NAME must be tezos-systems-vNN');

  const versions = [cssMatch?.[1], appPreloadMatch?.[1], appScriptMatch?.[1], cacheMatch?.[1]].filter(Boolean);
  if (new Set(versions).size > 1) {
    fail(`cache stamps are out of sync: ${versions.join(', ')}`);
  } else if (versions.length === 4) {
    pass(`cache stamps aligned at v${versions[0]}`);
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
  const requiredConnect = [
    'api.coingecko.com',
    '*.tzkt.io',
    'api.tezos.domains',
    '*.rpc.tez.capital',
    '*.supabase.co',
    'data.objkt.com',
    'api.github.com',
    'cdn.jsdelivr.net',
    '*.octez.io'
  ];
  for (const domain of requiredConnect) {
    if (!csp.includes(domain)) fail(`CSP connect-src is missing ${domain}`);
  }
  pass('CSP includes required live-data domains');
}

async function checkSelectorContracts() {
  const index = await readText('index.html');
  const requiredIds = [
    'price-bar',
    'features-gear',
    'features-dropdown',
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

  const app = await readText('js/core/app.js');
  const chamber = await readText('js/features/chamber.js');
  const lb = await readText('js/features/liquidity-baking.js');
  const deepLinkContracts = [
    ['Chamber hash route', "hash === 'chamber'", app],
    ['LB tile hash route', "hash === 'lb-tile'", app],
    ['Chamber card copy link', 'data-copy-hash="#chamber"', chamber],
    ['LB tile copy link', 'data-copy-hash="#lb-tile"', lb]
  ];
  for (const [label, snippet, text] of deepLinkContracts) {
    if (!text.includes(snippet)) fail(`missing deep-link contract: ${label}`);
  }
  pass(`deep-link selector contracts checked: ${deepLinkContracts.length}`);

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
  if (!api.includes('HISTORICAL_PAGE_SIZE')) {
    fail('fetchHistoricalData must page Supabase history results; default REST responses are capped at 1,000 rows');
  }
  if (!api.includes('&limit=${HISTORICAL_PAGE_SIZE}&offset=${offset}')) {
    fail('fetchHistoricalData must request paged Supabase results so all-time charts include recent rows');
  }

  pass('historical data fetch paginates Supabase rows');
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
  await checkSelectorContracts();
  await checkMainnetLaunchCopy();
  await checkModuleImportVersions();
  await checkHistoricalPagination();
  await checkLiquidityBakingIssuanceState();
  await checkStylesheetFreshness();
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
