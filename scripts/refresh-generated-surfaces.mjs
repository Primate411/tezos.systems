#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CHAMBER_ROUTES } from './lib/chamber-routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME_NAMES = ['aurora', 'matrix', 'hen', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'valley', 'warzone'];
const COMPARE_PAGES = [
  'compare/index.html',
  'compare/tezos-vs-ethereum.html',
  'compare/tezos-vs-solana.html',
  'compare/tezos-vs-cardano.html',
  'compare/tezos-vs-algorand.html'
];

const GOVERNANCE_TARGETS = [
  'data/governance-votes.json',
  'data/governance-refresh-report.json',
  'feed.xml'
];
const LAZY_SURFACE_STYLES = [
  'capital.css',
  'ecosystem.css',
  'history-chamber.css',
  'leaderboard.css',
  'ledger-flow.css',
  'maxis.css',
  'metals-chamber.css',
  'minerals-chamber.css',
  'network-health.css',
  'network-pulse.css',
  'staking-chamber.css',
  'tezos-domains.css',
  'tezoscrp.css',
  'uranium-chamber.css',
  'whale-chamber.css'
];
const CSS_TARGETS = [
  'css/styles.min.css',
  'css/my-tezos.min.css',
  'css/shell-extras.min.css',
  ...LAZY_SURFACE_STYLES.map((file) => `css/${file.replace(/\.css$/, '.min.css')}`),
  ...THEME_NAMES.flatMap((theme) => [`css/themes/${theme}.css`, `css/themes/${theme}.min.css`])
];
const CSS_SOURCE_PATTERNS = [
  /^css\/styles\.css$/,
  /^css\/my-tezos\.css$/,
  /^css\/shell-extras\.css$/,
  ...LAZY_SURFACE_STYLES.map((file) => new RegExp(`^css/${file.replace('.', '\\.')}$`)),
  /^scripts\/build-css\.mjs$/,
  /^package(?:-lock)?\.json$/
];
const ROUTE_TARGETS = CHAMBER_ROUTES.map((route) => `${route.slug}/index.html`);
const ANTHOLOGY_ROUTE_TARGETS = ['anthology'];
const CHAMBER_OG_TARGETS = CHAMBER_ROUTES.map((route) => `og/${route.slug}.png`);
const SITEMAP_TARGETS = ['sitemap.xml'];
const LLMS_TARGETS = ['llms.txt'];
const ROOT_OG_TARGETS = ['og-image.png'];
const MILESTONE_TARGETS = ['data/milestone-catalog.json'];
const NAKAMOTO_TARGETS = ['data/nakamoto-sources.json'];
const CHAIN_COMPARISON_TARGETS = ['data/chain-comparison-verification.json', 'js/core/config.js'];
const MAXIS_TARGETS = ['data/maxis-leaders.json', 'data/maxis'];
const MAXIS_CAREER_TARGETS = ['data/maxis-careers.json'];
const MAXIS_L2_GOVERNANCE_TARGETS = ['data/maxis-l2-governance.json'];
const CAPITAL_TARGETS = ['data/capital-snapshot.json'];
const MINERALS_TARGETS = ['data/minerals-snapshot.json', 'data/minerals-entry-summary.json'];
const URANIUM_TARGETS = ['data/uranium-snapshot.json', 'data/uranium-entry-summary.json'];
const METALS_TARGETS = ['data/metals-snapshot.json', 'data/metals-entry-summary.json'];
const ECOSYSTEM_TARGETS = ['data/ecosystem-stats.json'];
const LAUNCHER_PROJECTION_TARGETS = [
  'data/maxis/entry-summary.json',
  'data/capital-entry-summary.json',
  'data/ecosystem-entry-summary.json',
  'data/baker-governance-signals.json'
];
const WHALE_WATCH_TARGETS = ['data/whale-watch.json'];
const TEZOSCRP_TARGETS = ['data/tezoscrp-awards.json', 'data/tezoscrp-summary.json'];
const SEARCH_CATALOG_TARGETS = ['data/search-catalog.json'];

const GENERATED_TARGETS = unique([
  ...GOVERNANCE_TARGETS,
  ...CSS_TARGETS,
  ...ROUTE_TARGETS,
  ...ANTHOLOGY_ROUTE_TARGETS,
  ...CHAMBER_OG_TARGETS,
  ...COMPARE_PAGES,
  ...SITEMAP_TARGETS,
  ...LLMS_TARGETS,
  ...ROOT_OG_TARGETS,
  ...MILESTONE_TARGETS,
  ...NAKAMOTO_TARGETS,
  ...CHAIN_COMPARISON_TARGETS,
  ...MAXIS_TARGETS,
  ...MAXIS_CAREER_TARGETS,
  ...MAXIS_L2_GOVERNANCE_TARGETS,
  ...CAPITAL_TARGETS,
  ...MINERALS_TARGETS,
  ...URANIUM_TARGETS,
  ...METALS_TARGETS,
  ...ECOSYSTEM_TARGETS,
  ...LAUNCHER_PROJECTION_TARGETS,
  ...WHALE_WATCH_TARGETS,
  ...TEZOSCRP_TARGETS,
  ...SEARCH_CATALOG_TARGETS
]);

function unique(values) {
  return [...new Set(values)];
}

function argValue(name, fallback = null) {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function mode() {
  if (hasFlag('--all')) return 'all';
  if (hasFlag('--precommit')) return 'precommit';
  const selected = argValue('--mode', 'all');
  if (selected === 'scheduled') {
    throw new Error('Scheduled data must use scripts/refresh-scheduled-data.mjs so source-family failures stay isolated');
  }
  if (!['all', 'precommit'].includes(selected)) throw new Error(`Unknown generated-surface mode: ${selected}`);
  return selected;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
  }
  return options.capture ? result.stdout.trim() : '';
}

function git(args, options = {}) {
  return run('git', args, options);
}

function nodeScript(script, args = []) {
  run(process.execPath, [script, ...args]);
}

function stagedFiles() {
  const output = git(['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB'], { capture: true });
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => (pattern instanceof RegExp ? pattern.test(file) : pattern === file));
}

function anyTouched(files, patterns) {
  return files.some((file) => matchesAny(file, patterns));
}

function stageTargets(targets) {
  const existingTargets = targets.filter(Boolean);
  if (existingTargets.length) git(['add', '--', ...existingTargets]);
}

function shouldRun(modeName, touched, patterns) {
  return modeName === 'all' || anyTouched(touched, patterns);
}

async function loadSiteMapModule() {
  const source = await fs.readFile(path.join(ROOT, 'js/core/site-map.js'), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(moduleUrl);
}

function sitemapUrl(href, changefreq, priority) {
  const url = new URL(href, 'https://tezos.systems');
  url.hash = '';
  return {
    loc: url.toString(),
    changefreq,
    priority
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function renderSitemap() {
  const { siteMapSitemapEntries } = await loadSiteMapModule();
  const entries = [];
  const seen = new Set();
  const add = (entry) => {
    if (seen.has(entry.loc)) return;
    seen.add(entry.loc);
    entries.push(entry);
  };

  siteMapSitemapEntries().forEach((entry) => {
    add(sitemapUrl(entry.href, entry.changefreq, entry.priority));
  });

  const protocolData = JSON.parse(await fs.readFile(path.join(ROOT, 'data/protocol-data.json'), 'utf8'));
  (protocolData.protocols || []).forEach((protocol) => {
    const slug = String(protocol?.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) add(sitemapUrl(`/anthology/${slug}/`, 'monthly', '0.7'));
  });

  const body = entries
    .map((entry) => `  <url><loc>${escapeXml(entry.loc)}</loc><changefreq>${escapeXml(entry.changefreq)}</changefreq><priority>${escapeXml(entry.priority)}</priority></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function writeSitemap() {
  await fs.writeFile(path.join(ROOT, 'sitemap.xml'), await renderSitemap());
  console.log('Wrote sitemap.xml from canonical site map');
}

async function main() {
  if (hasFlag('--print-targets')) {
    console.log(GENERATED_TARGETS.join('\n'));
    return;
  }
  if (hasFlag('--sitemap-only')) {
    await writeSitemap();
    return;
  }
  if (hasFlag('--llms-only')) {
    nodeScript('scripts/generate-llms-txt.mjs');
    return;
  }

  const modeName = mode();
  const shouldStage = hasFlag('--stage');
  const initialStaged = modeName === 'precommit' ? stagedFiles() : [];
  const ran = [];

  if (modeName === 'all') {
    nodeScript('scripts/refresh-chain-comparison.mjs');
    ran.push('comparison');
    if (shouldStage) stageTargets(CHAIN_COMPARISON_TARGETS);
  } else {
    nodeScript('scripts/refresh-chain-comparison.mjs', ['--check']);
    ran.push('comparison-check');
  }

  if (modeName !== 'all') {
    nodeScript('scripts/refresh-tezoscrp-awards.mjs', ['--check']);
    ran.push('tezoscrp-check');
  } else {
    nodeScript('scripts/refresh-tezoscrp-awards.mjs');
    ran.push('tezoscrp');
    if (shouldStage) stageTargets(TEZOSCRP_TARGETS);
  }

  // Protocol identity is an input to Maxis seasons. Refresh it first so a
  // protocol activation cannot leave Maxis one scheduled run behind.
  nodeScript('scripts/refresh-governance-data.mjs', shouldStage ? ['--stage'] : []);
  ran.push('governance');

  if (modeName === 'precommit') {
    nodeScript('scripts/refresh-maxis-l2-governance.mjs', ['--check']);
    ran.push('maxis-l2-governance-check');
    nodeScript('scripts/refresh-maxis-data.mjs', ['--check']);
    ran.push('maxis-check');
    nodeScript('scripts/refresh-maxis-careers.mjs', ['--check']);
    ran.push('maxis-careers-check');
    // Governance votes are refreshed above even in pre-commit mode, so this
    // compact projection must be rebuilt before the aggregate projection check.
    nodeScript('scripts/generate-baker-governance-signals.mjs');
    ran.push('baker-governance-signals');
    if (shouldStage) stageTargets(['data/baker-governance-signals.json']);
    nodeScript('scripts/refresh-nakamoto-sources.mjs', ['--check']);
    ran.push('nakamoto-check');
    nodeScript('scripts/refresh-capital-data.mjs', ['--check']);
    ran.push('capital-check');
    nodeScript('scripts/refresh-minerals-data.mjs', ['--check']);
    ran.push('minerals-check');
    nodeScript('scripts/refresh-uranium-data.mjs', ['--check']);
    ran.push('uranium-check');
    nodeScript('scripts/refresh-metals-data.mjs', ['--check']);
    ran.push('metals-check');
    nodeScript('scripts/refresh-ecosystem-stats.mjs', ['--check']);
    ran.push('ecosystem-check');
    nodeScript('scripts/generate-launcher-projections.mjs', ['--check']);
    ran.push('launcher-projections-check');
    if (shouldStage) stageTargets(LAUNCHER_PROJECTION_TARGETS);
    nodeScript('scripts/refresh-whale-watch-data.mjs', ['--check']);
    ran.push('whale-watch-check');
  } else if (modeName === 'all') {
    nodeScript('scripts/refresh-maxis-l2-governance.mjs');
    ran.push('maxis-l2-governance');
    if (shouldStage) stageTargets(MAXIS_L2_GOVERNANCE_TARGETS);
    nodeScript('scripts/refresh-maxis-data.mjs');
    ran.push('maxis');
    if (shouldStage) stageTargets(MAXIS_TARGETS);
    nodeScript('scripts/refresh-maxis-careers.mjs');
    ran.push('maxis-careers');
    if (shouldStage) stageTargets(MAXIS_CAREER_TARGETS);
    nodeScript('scripts/refresh-nakamoto-sources.mjs');
    ran.push('nakamoto');
    if (shouldStage) stageTargets(NAKAMOTO_TARGETS);
    nodeScript('scripts/refresh-capital-data.mjs');
    ran.push('capital');
    if (shouldStage) stageTargets(CAPITAL_TARGETS);
    nodeScript('scripts/refresh-minerals-data.mjs');
    ran.push('minerals');
    if (shouldStage) stageTargets(MINERALS_TARGETS);
    nodeScript('scripts/refresh-uranium-data.mjs');
    ran.push('uranium');
    if (shouldStage) stageTargets(URANIUM_TARGETS);
    nodeScript('scripts/refresh-metals-data.mjs');
    ran.push('metals');
    if (shouldStage) stageTargets(METALS_TARGETS);
    nodeScript('scripts/refresh-ecosystem-stats.mjs');
    ran.push('ecosystem');
    if (shouldStage) stageTargets(ECOSYSTEM_TARGETS);
    nodeScript('scripts/generate-launcher-projections.mjs');
    ran.push('launcher-projections');
    if (shouldStage) stageTargets(LAUNCHER_PROJECTION_TARGETS);
    nodeScript('scripts/refresh-whale-watch-data.mjs');
    ran.push('whale-watch');
    if (shouldStage) stageTargets(WHALE_WATCH_TARGETS);
  }

  const milestoneArgs = [];
  if (modeName === 'all' || hasFlag('--force-milestones')) milestoneArgs.push('--force');
  if (modeName === 'precommit') milestoneArgs.push('--project-next-commit');
  nodeScript('scripts/generate-milestone-catalog.mjs', milestoneArgs);
  ran.push('milestones');
  if (shouldStage) stageTargets(MILESTONE_TARGETS);

  const touched = unique([...initialStaged, ...(modeName === 'precommit' ? stagedFiles() : [])]);

  if (shouldRun(modeName, touched, [
    /^scripts\/generate-search-catalog\.mjs$/,
    /^scripts\/refresh-generated-surfaces\.mjs$/,
    /^js\/core\/site-map\.js$/,
    /^data\/ecosystem-apps\.json$/,
    /^data\/tezoscrp-awards\.json$/,
    /^data\/protocol-(?:data|debates)\.json$/,
    /^data\/milestone-catalog\.json$/,
    /^data\/search-catalog\.json$/
  ])) {
    ran.push('search-catalog');
    nodeScript('scripts/generate-search-catalog.mjs');
    if (shouldStage) stageTargets(SEARCH_CATALOG_TARGETS);
  } else if (modeName === 'precommit') {
    nodeScript('scripts/generate-search-catalog.mjs', ['--check']);
    ran.push('search-catalog-check');
  }

  if (shouldRun(modeName, touched, CSS_SOURCE_PATTERNS)) {
    ran.push('css');
    nodeScript('scripts/build-css.mjs');
    if (shouldStage) stageTargets(CSS_TARGETS);
  }

  const routeTouched = shouldRun(modeName, touched, [
    /^index\.html$/,
    /^scripts\/generate-chamber-routes\.mjs$/,
    /^scripts\/generate-anthology-routes\.mjs$/,
    /^scripts\/lib\/chamber-routes\.mjs$/,
    /^scripts\/lib\/standalone-chamber-shell\.mjs$/,
    /^js\/core\/chamber-features\.mjs$/,
    /^data\/protocol-data\.json$/,
    ...ROUTE_TARGETS
  ]);
  if (routeTouched) {
    ran.push('routes');
    nodeScript('scripts/generate-chamber-routes.mjs');
    nodeScript('scripts/generate-anthology-routes.mjs');
    if (shouldStage) stageTargets([...ROUTE_TARGETS, ...ANTHOLOGY_ROUTE_TARGETS]);
  }

  if (routeTouched || shouldRun(modeName, touched, [
    /^scripts\/refresh-generated-surfaces\.mjs$/,
    /^scripts\/lib\/chamber-routes\.mjs$/,
    /^js\/core\/site-map\.js$/,
    /^sitemap\.xml$/,
    /^compare\/.*\.html$/,
    /^widgets\/.*\.html$/,
    /^widgets\/runtime\.js$/
  ])) {
    ran.push('sitemap');
    await writeSitemap();
    if (shouldStage) stageTargets(SITEMAP_TARGETS);
  }

  if (shouldRun(modeName, touched, [
    /^scripts\/generate-llms-txt\.mjs$/,
    /^scripts\/refresh-generated-surfaces\.mjs$/,
    /^js\/core\/site-map\.js$/,
    /^data\/protocol-data\.json$/,
    /^\.well-known\/openapi\.json$/,
    /^llms\.txt$/
  ])) {
    ran.push('llms');
    nodeScript('scripts/generate-llms-txt.mjs');
    if (shouldStage) stageTargets(LLMS_TARGETS);
  }

  if (shouldRun(modeName, touched, [
    /^scripts\/bake-compare-pages\.mjs$/,
    /^scripts\/refresh-chain-comparison\.mjs$/,
    /^js\/core\/config\.js$/,
    /^data\/chain-comparison-verification\.json$/,
    /^data\/protocol-data\.json$/,
    /^compare\/.*\.html$/
  ])) {
    ran.push('compare');
    nodeScript('scripts/bake-compare-pages.mjs');
    if (shouldStage) stageTargets(COMPARE_PAGES);
  }

  if (shouldRun(modeName, touched, [
    /^scripts\/generate-chamber-og-images\.mjs$/,
    /^scripts\/lib\/chamber-routes\.mjs$/,
    /^data\/governance-refresh-report\.json$/,
    /^data\/protocol-data\.json$/,
    /^og\/.*\.png$/
  ])) {
    ran.push('chamber-og');
    nodeScript('scripts/generate-chamber-og-images.mjs');
    if (shouldStage) stageTargets(CHAMBER_OG_TARGETS);
  }

  ran.push('root-og');
  nodeScript('scripts/generate-og-image.js');
  if (shouldStage) stageTargets(ROOT_OG_TARGETS);

  console.log(`Generated-surface refresh complete (${modeName}): ${ran.join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
