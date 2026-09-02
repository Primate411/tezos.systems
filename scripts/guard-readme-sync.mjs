#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function stagedFiles() {
  const output = git(['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB']);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function readmeStatus() {
  try {
    return git(['status', '--porcelain', '--', 'README.md']);
  } catch {
    return '';
  }
}

const relevantRules = [
  [/^package(-lock)?\.json$/, 'npm scripts, dependencies, or reproducible setup'],
  [/^\.gitignore$/, 'tracked/ignored setup contract'],
  [/^\.githooks\//, 'shared hook behavior'],
  [/^AGENTS\.md$/, 'agent handoff docs must agree with README'],
  [/^scripts\/(?:refresh-generated-surfaces\.mjs|refresh-scheduled-data\.mjs|check-generated-freshness\.mjs|refresh-governance-data\.mjs|refresh-maxis-data\.mjs|refresh-maxis-careers\.mjs|refresh-nakamoto-sources\.mjs|refresh-ecosystem-stats\.mjs|update-governance-votes\.mjs|stamp-version\.sh|latest-changelog-entry\.mjs|guard-readme-sync\.mjs|generate-og-image\.js|generate-chamber-routes\.mjs|generate-anthology-routes\.mjs|generate-chamber-og-images\.mjs|generate-milestone-catalog\.mjs|generate-capital-entry-summary\.mjs|generate-ecosystem-entry-summary\.mjs|generate-maxis-entry-summary\.mjs|generate-baker-governance-signals\.mjs|generate-launcher-projections\.mjs|generate-llms-txt\.mjs|measure-initial-load\.mjs|bake-compare-pages\.mjs|build-css\.mjs|generate-favicons\.mjs)$/, 'documented automation scripts'],
  [/^scripts\/lib\/(?:scheduled-refresh-[^/]+|generated-freshness)\.mjs$/, 'documented scheduled delivery and freshness contracts'],
  [/^scripts\/lib\/maxis-[^/]+\.mjs$/, 'documented Maxis ranking and protocol-season contracts'],
  [/^tests\/(?:static-checks|scheduled-refresh-check|generated-freshness-check|smoke)\.mjs$/, 'documented QA and smoke-test behavior'],
  [/^\.github\/workflows\/(?:refresh-governance-surfaces|audit-generated-freshness)\.yml$/, 'documented generated-data delivery and freshness automation'],
  [/^QA\.md$/, 'QA docs must agree with README'],
  [/^js\/core\/config\.js$/, 'documented endpoints, refresh intervals, cache TTLs, or constants'],
  [/^js\/ui\/theme\.js$/, 'documented theme list, default theme, or theme storage'],
  [/^js\/core\/app\.js$/, 'documented runtime flow, deep links, or main surfaces'],
  [/^js\/core\/(?:chamber-features\.mjs|standalone-chamber\.js)$/, 'documented Chamber startup and feature registry'],
  [/^scripts\/lib\/standalone-chamber-shell\.mjs$/, 'documented standalone Chamber shell'],
  [/^js\/core\/api\.js$/, 'documented data-source behavior'],
  [/^js\/features\/maxis\.js$/, 'documented Maxis chamber behavior'],
  [/^css\/maxis\.css$/, 'documented Maxis chamber presentation'],
  [/^data\/maxis(?:-|\/)/, 'documented Maxis data and archive contracts'],
  [/^index\.html$/, 'documented shell, CSP, schema, metadata, or cache stamps'],
  [/^sw\.js$/, 'documented service-worker and cache behavior'],
  [/^(?:site\.webmanifest|robots\.txt|sitemap\.xml|llms\.txt|\.well-known\/(?:ai-plugin|openapi)\.json)$/, 'documented PWA/SEO and public-data discovery metadata'],
  [/^widgets\//, 'documented widget inventory'],
  [/^(?:staking|governance|bakers|hen|compare|ecosystem)\//, 'documented standalone page inventory']
];

function readmeRelevant(file) {
  for (const [pattern, reason] of relevantRules) {
    if (pattern.test(file)) return reason;
  }
  return '';
}

function main() {
  if (process.env.SKIP_README_GUARD === '1') {
    console.warn('warn - README guard skipped via SKIP_README_GUARD=1');
    return;
  }

  const root = git(['rev-parse', '--show-toplevel']);
  process.chdir(root);

  const staged = stagedFiles();
  const readmeStaged = staged.includes('README.md');
  const relevant = staged
    .filter((file) => file !== 'README.md')
    .map((file) => ({ file, reason: readmeRelevant(file) }))
    .filter((item) => item.reason);

  if (!relevant.length || readmeStaged) return;

  const status = readmeStatus();
  const readmeHint = status
    ? 'README.md already has working-tree changes; stage it with git add README.md.'
    : 'Update README.md so it agrees with the staged contract changes, then stage it.';

  console.error('fail - README.md is not staged, but staged changes touch README-documented behavior.');
  console.error('');
  console.error('README-relevant staged files:');
  for (const item of relevant) {
    console.error(`  - ${item.file} (${item.reason})`);
  }
  console.error('');
  console.error(readmeHint);
  console.error('If you audited this commit and README truly does not need a change, rerun with SKIP_README_GUARD=1.');
  process.exit(1);
}

main();
