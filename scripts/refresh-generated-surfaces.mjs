#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CHAMBER_ROUTES } from './lib/chamber-routes.mjs';
import {
  RETRYABLE_TEMP_FAILURE_EXIT_CODE,
  runGeneratedTask,
  throwIfGeneratedTaskFailures
} from './lib/generated-task-runner.mjs';

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
  return argValue('--mode', 'all');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    const error = new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
    error.exitCode = Number.isInteger(result.status) ? result.status : 1;
    error.command = [command, ...args];
    throw error;
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
  return modeName === 'all' || modeName === 'scheduled' || anyTouched(touched, patterns);
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
  const scheduledFailures = modeName === 'scheduled' ? [] : null;
  const ran = [];
  const runTask = async (name, execute, options = {}) => {
    const result = await runGeneratedTask({
      ...options,
      name,
      execute,
      failures: scheduledFailures
    });
    if (result.ok) ran.push(name);
    return result.ok;
  };

  if (modeName === 'all') {
    const comparisonOk = await runTask('comparison', () => nodeScript('scripts/refresh-chain-comparison.mjs'));
    if (comparisonOk && shouldStage) stageTargets(CHAIN_COMPARISON_TARGETS);
  } else {
    await runTask('comparison-check', () => nodeScript('scripts/refresh-chain-comparison.mjs', ['--check']));
  }

  if (modeName !== 'all') {
    await runTask('tezoscrp-check', () => nodeScript('scripts/refresh-tezoscrp-awards.mjs', ['--check']));
  } else {
    const tezoscrpOk = await runTask('tezoscrp', () => nodeScript('scripts/refresh-tezoscrp-awards.mjs'));
    if (tezoscrpOk && shouldStage) stageTargets(TEZOSCRP_TARGETS);
  }

  // Protocol identity is an input to Maxis seasons. Refresh it first so a
  // protocol activation cannot leave Maxis one scheduled run behind.
  const governanceOk = await runTask('governance', () => nodeScript('scripts/refresh-governance-data.mjs'));
  if (governanceOk && shouldStage) stageTargets(GOVERNANCE_TARGETS);

  if (modeName === 'precommit') {
    await runTask('maxis-l2-governance-check', () => nodeScript('scripts/refresh-maxis-l2-governance.mjs', ['--check']));
    await runTask('maxis-check', () => nodeScript('scripts/refresh-maxis-data.mjs', ['--check']));
    await runTask('maxis-careers-check', () => nodeScript('scripts/refresh-maxis-careers.mjs', ['--check']));
    // Governance votes are refreshed above even in pre-commit mode, so this
    // compact projection must be rebuilt before the aggregate projection check.
    const bakerSignalsOk = await runTask('baker-governance-signals', () => nodeScript('scripts/generate-baker-governance-signals.mjs'));
    if (bakerSignalsOk && shouldStage) stageTargets(['data/baker-governance-signals.json']);
    await runTask('nakamoto-check', () => nodeScript('scripts/refresh-nakamoto-sources.mjs', ['--check']));
    await runTask('capital-check', () => nodeScript('scripts/refresh-capital-data.mjs', ['--check']));
    await runTask('minerals-check', () => nodeScript('scripts/refresh-minerals-data.mjs', ['--check']));
    await runTask('uranium-check', () => nodeScript('scripts/refresh-uranium-data.mjs', ['--check']));
    await runTask('metals-check', () => nodeScript('scripts/refresh-metals-data.mjs', ['--check']));
    await runTask('ecosystem-check', () => nodeScript('scripts/refresh-ecosystem-stats.mjs', ['--check']));
    const launcherCheckOk = await runTask('launcher-projections-check', () => nodeScript('scripts/generate-launcher-projections.mjs', ['--check']));
    if (launcherCheckOk) {
      if (shouldStage) stageTargets(LAUNCHER_PROJECTION_TARGETS);
    }
    await runTask('whale-watch-check', () => nodeScript('scripts/refresh-whale-watch-data.mjs', ['--check']));
  } else if (modeName === 'all' || modeName === 'scheduled') {
    const maxisL2Ok = await runTask('maxis-l2-governance', () => nodeScript('scripts/refresh-maxis-l2-governance.mjs'));
    if (maxisL2Ok && shouldStage) stageTargets(MAXIS_L2_GOVERNANCE_TARGETS);
    const maxisOk = await runTask('maxis', () => nodeScript('scripts/refresh-maxis-data.mjs'), modeName === 'scheduled'
      ? {
          maxAttempts: 2,
          retryExitCodes: [RETRYABLE_TEMP_FAILURE_EXIT_CODE],
          retryDelayMs: 30_000
        }
      : {});
    if (maxisOk && shouldStage) stageTargets(MAXIS_TARGETS);
    const maxisCareersOk = await runTask('maxis-careers', () => nodeScript('scripts/refresh-maxis-careers.mjs'));
    if (maxisCareersOk && shouldStage) stageTargets(MAXIS_CAREER_TARGETS);
    const nakamotoOk = await runTask('nakamoto', () => nodeScript('scripts/refresh-nakamoto-sources.mjs'));
    if (nakamotoOk && shouldStage) stageTargets(NAKAMOTO_TARGETS);
    const capitalOk = await runTask('capital', () => nodeScript('scripts/refresh-capital-data.mjs'));
    if (capitalOk && shouldStage) stageTargets(CAPITAL_TARGETS);
    const mineralsOk = await runTask('minerals', () => nodeScript('scripts/refresh-minerals-data.mjs'));
    if (mineralsOk && shouldStage) stageTargets(MINERALS_TARGETS);
    const uraniumOk = await runTask('uranium', () => nodeScript('scripts/refresh-uranium-data.mjs'));
    if (uraniumOk && shouldStage) stageTargets(URANIUM_TARGETS);
    const metalsOk = await runTask('metals', () => nodeScript('scripts/refresh-metals-data.mjs'));
    if (metalsOk && shouldStage) stageTargets(METALS_TARGETS);
    const ecosystemOk = await runTask('ecosystem', () => nodeScript('scripts/refresh-ecosystem-stats.mjs'));
    if (ecosystemOk && shouldStage) stageTargets(ECOSYSTEM_TARGETS);
    const launcherOk = await runTask('launcher-projections', () => nodeScript('scripts/generate-launcher-projections.mjs'));
    if (launcherOk && shouldStage) stageTargets(LAUNCHER_PROJECTION_TARGETS);
    const whaleWatchOk = await runTask('whale-watch', () => nodeScript('scripts/refresh-whale-watch-data.mjs'));
    if (whaleWatchOk && shouldStage) stageTargets(WHALE_WATCH_TARGETS);
    if (modeName === 'scheduled' && whaleWatchOk) {
      try {
        const whaleArtifact = JSON.parse(await fs.readFile(path.join(ROOT, WHALE_WATCH_TARGETS[0]), 'utf8'));
        if (whaleArtifact?.balanceExits?.complete !== true) {
          scheduledFailures.push({
            name: 'whale-watch-balance-exits',
            exitCode: null,
            message: whaleArtifact?.balanceExits?.error || 'required archive balance receipts are incomplete'
          });
          console.error('Generated task whale-watch-balance-exits is degraded; continuing scheduled refresh');
        }
      } catch (error) {
        scheduledFailures.push({
          name: 'whale-watch-balance-exits',
          exitCode: null,
          message: error?.message || 'balance-exit receipt status is unreadable'
        });
      }
    }
  }

  const milestoneArgs = [];
  if (modeName === 'all' || hasFlag('--force-milestones')) milestoneArgs.push('--force');
  if (modeName === 'precommit') milestoneArgs.push('--project-next-commit');
  const milestonesOk = await runTask('milestones', () => nodeScript('scripts/generate-milestone-catalog.mjs', milestoneArgs));
  if (milestonesOk && shouldStage) stageTargets(MILESTONE_TARGETS);

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
    const searchCatalogOk = await runTask('search-catalog', () => nodeScript('scripts/generate-search-catalog.mjs'));
    if (searchCatalogOk && shouldStage) stageTargets(SEARCH_CATALOG_TARGETS);
  } else if (modeName === 'precommit') {
    await runTask('search-catalog-check', () => nodeScript('scripts/generate-search-catalog.mjs', ['--check']));
  }

  if (shouldRun(modeName, touched, CSS_SOURCE_PATTERNS)) {
    const cssOk = await runTask('css', () => nodeScript('scripts/build-css.mjs'));
    if (cssOk && shouldStage) stageTargets(CSS_TARGETS);
  }

  const routeTouched = shouldRun(modeName, touched, [
    /^index\.html$/,
    /^scripts\/generate-chamber-routes\.mjs$/,
    /^scripts\/lib\/chamber-routes\.mjs$/,
    ...ROUTE_TARGETS
  ]);
  if (routeTouched) {
    const routesOk = await runTask('routes', () => nodeScript('scripts/generate-chamber-routes.mjs'));
    if (routesOk && shouldStage) stageTargets(ROUTE_TARGETS);
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
    const sitemapOk = await runTask('sitemap', () => writeSitemap());
    if (sitemapOk && shouldStage) stageTargets(SITEMAP_TARGETS);
  }

  if (shouldRun(modeName, touched, [
    /^scripts\/generate-llms-txt\.mjs$/,
    /^scripts\/refresh-generated-surfaces\.mjs$/,
    /^js\/core\/site-map\.js$/,
    /^\.well-known\/openapi\.json$/,
    /^llms\.txt$/
  ])) {
    const llmsOk = await runTask('llms', () => nodeScript('scripts/generate-llms-txt.mjs'));
    if (llmsOk && shouldStage) stageTargets(LLMS_TARGETS);
  }

  if (shouldRun(modeName, touched, [
    /^scripts\/bake-compare-pages\.mjs$/,
    /^scripts\/refresh-chain-comparison\.mjs$/,
    /^js\/core\/config\.js$/,
    /^data\/chain-comparison-verification\.json$/,
    /^data\/protocol-data\.json$/,
    /^compare\/.*\.html$/
  ])) {
    const compareOk = await runTask('compare', () => nodeScript('scripts/bake-compare-pages.mjs'));
    if (compareOk && shouldStage) stageTargets(COMPARE_PAGES);
  }

  if (shouldRun(modeName, touched, [
    /^scripts\/generate-chamber-og-images\.mjs$/,
    /^scripts\/lib\/chamber-routes\.mjs$/,
    /^data\/governance-refresh-report\.json$/,
    /^data\/protocol-data\.json$/,
    /^og\/.*\.png$/
  ])) {
    const chamberOgOk = await runTask('chamber-og', () => nodeScript('scripts/generate-chamber-og-images.mjs'));
    if (chamberOgOk && shouldStage) stageTargets(CHAMBER_OG_TARGETS);
  }

  const rootOgOk = await runTask('root-og', () => nodeScript('scripts/generate-og-image.js'));
  if (rootOgOk && shouldStage) stageTargets(ROOT_OG_TARGETS);

  console.log(`Generated-surface refresh complete (${modeName}): ${ran.join(', ')}`);
  throwIfGeneratedTaskFailures(scheduledFailures);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
