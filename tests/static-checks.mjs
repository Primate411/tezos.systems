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

async function main() {
  await checkRequiredFiles();
  await checkJsonFiles();
  await checkGovernanceVotes();
  await checkLocalReferences();
  await checkCacheBustAlignment();
  await checkCsp();
  await checkSelectorContracts();
  await checkMainnetLaunchCopy();
  await checkModuleImportVersions();
  await checkStylesheetFreshness();

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
