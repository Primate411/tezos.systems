// Static contracts owned by repository. Shared dependencies remain explicit.
export function createRepositoryStaticChecks({
  CHAMBER_ROUTES,
  collectCssRefs,
  collectHtmlRefs,
  collectJsImports,
  createHash,
  fail,
  pass,
  pathExists,
  readText,
  statOrNull,
  walk
}) {
  async function checkRequiredFiles() {
    const required = [
      'index.html',
      'landing.html',
      'css/styles.css',
      'css/styles.min.css',
      'css/my-tezos.min.css',
      'css/hero-search.css',
      'css/site-map.css',
      'css/leaderboard.css',
      'css/history-chamber.css',
      'css/whale-chamber.css',
      'css/network-pulse.css',
      'css/capital.css',
      'css/market-room.css',
      'css/minerals-chamber.css',
      'css/uranium-chamber.css',
      'css/metals-chamber.css',
      'css/staking-chamber.css',
      'css/network-health.css',
      'css/maxis.css',
      'css/tezoscrp.css',
      'js/core/app.js',
      'js/core/api.js',
      'js/core/asset-version.js',
      'js/core/config.js',
      'js/core/mainnet.mjs',
      'js/core/liquidity-baking-vote.js',
    'js/core/quiet-refresh.js',
    'js/core/snapshot-receipt.js',
      'js/core/pulse-history.mjs',
      'js/core/pulse-history-analysis.mjs',
      'js/core/personal-signal-relevance.mjs',
      'js/core/live-pulse-curio.mjs',
      'js/core/search-catalog.js',
      'js/core/search-entities.js',
      'js/core/site-map.js',
      'js/core/site-journey.js',
      'js/core/etherlink-governance-contracts.mjs',
      'js/core/tzkt-throttle.js',
      'js/core/wallet.js',
      'js/core/my-tezos-entries.mjs',
      'js/core/my-tezos-db.mjs',
      'js/core/my-tezos-models.mjs',
      'js/core/my-tezos-request-broker.mjs',
      'js/core/my-tezos-contract-registry.mjs',
      'js/core/objkt-client.mjs',
      'js/core/etherlink-client.mjs',
      'js/features/governance-alerts.js',
      'js/features/staking-chamber.js',
      'js/features/capital-chamber.js',
      'js/features/minerals-chamber.js',
      'js/features/uranium-chamber.js',
      'js/features/metals-chamber.js',
      'js/features/ecosystem-chamber.js',
      'js/features/whale-chamber.js',
      'js/features/tezoscrp.js',
      'js/features/milestone-catalog.mjs',
      'js/features/my-tezos-portfolio.js',
      'js/features/my-tezos-portfolio-model.mjs',
      'js/features/my-tezos-tabs.mjs',
      'js/features/my-tezos-tzkt-adapter.mjs',
      'js/features/my-tezos-activity-model.mjs',
      'js/features/my-tezos-memory.mjs',
      'js/features/my-tezos-collection-model.mjs',
      'js/features/my-tezos-collection.mjs',
      'js/features/my-tezos-tezosx-model.mjs',
      'js/features/my-tezos-tezosx.mjs',
      'js/features/search.js',
      'js/landing/site-nav.js',
      'js/ui/wayfinder.js',
      'js/ui/pulse-ticker.js',
      'js/ui/chamber-styles.js',
      'sw.js',
      'og-image.png',
      'stake/index.html',
      'og/stake.png',
      'capital/index.html',
      'og/capital.png',
      'minerals/index.html',
      'og/minerals.png',
      'assets/minerals/minerals-core.webp',
      'assets/minerals/minerals-core-640.webp',
      'assets/minerals/minerals-launcher.webp',
      'assets/minerals/minerals-launcher-480.webp',
      'uranium/index.html',
      'og/uranium.png',
      'assets/uranium/uranium-core.webp',
      'assets/uranium/uranium-core-640.webp',
      'assets/uranium/uranium-launcher.webp',
      'assets/uranium/uranium-launcher-480.webp',
      'metals/index.html',
      'og/metals.png',
      'assets/metals/metals-core.webp',
      'assets/metals/metals-core-640.webp',
      'assets/metals/metals-launcher.webp',
      'assets/metals/metals-launcher-480.webp',
      'ecosystem/index.html',
      'og/ecosystem.png',
      'history/index.html',
      'og/history.png',
      'leaderboard/index.html',
      'og/leaderboard.png',
      'whales/index.html',
      'og/whales.png',
      'version.json',
      'LICENSE',
      'NOTICE',
      'SECURITY.md',
      '_config.yml',
      '.well-known/ai-plugin.json',
      '.well-known/openapi.json',
      '.well-known/security.txt',
      'llms.txt',
      'widgets/runtime.js',
      'feed.xml',
      'scripts/refresh-generated-surfaces.mjs',
      'scripts/refresh-scheduled-data.mjs',
      'scripts/check-generated-freshness.mjs',
      'scripts/lib/scheduled-refresh-lanes.mjs',
      'scripts/lib/scheduled-refresh-runner.mjs',
      'scripts/lib/generated-freshness.mjs',
      '.github/scripts/supabase-write.js',
      'tests/supabase-write-check.mjs',
      'scripts/generate-llms-txt.mjs',
      'scripts/measure-initial-load.mjs',
      'tests/fixtures/initial-load-baseline.json',
      'scripts/generate-milestone-catalog.mjs',
      'scripts/generate-search-catalog.mjs',
      'scripts/refresh-nakamoto-sources.mjs',
      'scripts/refresh-chain-comparison.mjs',
      'scripts/refresh-capital-data.mjs',
      'scripts/refresh-minerals-data.mjs',
      'scripts/refresh-uranium-data.mjs',
      'scripts/refresh-metals-data.mjs',
      'scripts/generate-capital-entry-summary.mjs',
      'scripts/refresh-ecosystem-stats.mjs',
      'scripts/generate-ecosystem-entry-summary.mjs',
      'scripts/lib/ecosystem-stats.mjs',
      'scripts/generate-maxis-entry-summary.mjs',
      'scripts/generate-baker-governance-signals.mjs',
      'scripts/generate-launcher-projections.mjs',
      'scripts/refresh-whale-watch-data.mjs',
      'scripts/refresh-tezoscrp-awards.mjs',
      'scripts/refresh-maxis-data.mjs',
      'scripts/refresh-maxis-careers.mjs',
      'scripts/refresh-maxis-l2-governance.mjs',
      'scripts/lib/maxis-artifact-budget.mjs',
      'scripts/lib/maxis-coverage-v2.mjs',
      'scripts/lib/maxis-evaluator-v2-primitives.mjs',
      'scripts/lib/maxis-evaluator-v2.mjs',
      'scripts/lib/maxis-governance-career.mjs',
      'scripts/lib/maxis-l2-governance.mjs',
      'scripts/lib/maxis-pagination.mjs',
      'scripts/lib/maxis-season.mjs',
      'scripts/lib/maxis-source.mjs',
      'scripts/lib/maxis-source-v2.mjs',
      'scripts/lib/maxis-transactions-v2.mjs',
      'scripts/lib/tezoscrp-awards.mjs',
      'data/governance-votes.json',
      'data/my-tezos-contracts.json',
      'data/nakamoto-sources.json',
      'data/chain-comparison-verification.json',
      'data/governance-refresh-report.json',
      'data/capital-snapshot.json',
      'data/capital-entry-summary.json',
      'data/minerals-snapshot.json',
      'data/minerals-entry-summary.json',
      'data/uranium-snapshot.json',
      'data/uranium-entry-summary.json',
      'data/metals-snapshot.json',
      'data/metals-entry-summary.json',
      'data/ecosystem-apps.json',
      'data/ecosystem-stats.json',
      'data/ecosystem-entry-summary.json',
      'data/whale-watch.json',
      'data/milestone-catalog.json',
      'data/search-catalog.json',
      'data/maxis-contracts.json',
      'data/maxis-careers.json',
      'data/baker-governance-signals.json',
      'data/maxis-l2-governance.json',
      'data/maxis-leaders.json',
      'data/maxis/entry-summary.json',
      'data/maxis/manifest.json',
      'data/tezoscrp-awards.json',
      'data/tezoscrp-awards.compact.json',
      'js/core/tezoscrp-codec.mjs',
      'data/tezoscrp-identity-aliases.json',
      'data/tezoscrp-summary.json',
      'maxis/index.html',
      'og/maxis.png',
      'tezoscrp/index.html',
      'og/tezoscrp.png',
      '.github/workflows/refresh-tezoscrp.yml',
      '.github/workflows/refresh-chain-comparison.yml',
      '.github/workflows/audit-generated-freshness.yml',
      'tests/scheduled-refresh-check.mjs',
      'tests/generated-freshness-check.mjs',
      'tests/tezoscrp-check.mjs',
      'tests/ecosystem-stats-check.mjs',
      'tests/ledger-flow-check.mjs',
      'tests/pulse-history-check.mjs',
      'tests/personal-signal-relevance-check.mjs',
      'tests/live-pulse-curio-check.mjs',
      'tests/baker-governance-signals-check.mjs',
      'tests/uranium-check.mjs',
      'tests/metals-check.mjs',
      'tests/minerals-check.mjs',
      'tests/service-worker-cache-check.mjs',
      'tests/smoke-harness-check.mjs',
      'tests/lib/smoke-affected.mjs',
      'tests/lib/smoke-harness.mjs',
      'tests/lib/smoke-metadata.mjs',
      'tests/fixtures/smoke-intentional-waits.json',
      'tests/fixtures/smoke-suite-costs.json',
      'scripts/resolve-playwright-version.mjs',
      'scripts/update-smoke-costs.mjs',
      '.github/workflows/smoke-canary.yml',
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
      'refresh:generated': 'node scripts/refresh-generated-surfaces.mjs --all',
      'refresh:generated:commit': 'node scripts/refresh-generated-surfaces.mjs --mode precommit',
      'refresh:generated:scheduled': 'node scripts/refresh-scheduled-data.mjs',
      'check:generated:freshness': 'node scripts/check-generated-freshness.mjs',
      'refresh:milestones': 'node scripts/generate-milestone-catalog.mjs --force',
      'refresh:nakamoto': 'node scripts/refresh-nakamoto-sources.mjs',
      test: 'npm run test:static && npm run test:smoke:ci',
      'test:static': 'node tests/run-static.mjs',
      'test:scheduled-refresh': 'node tests/scheduled-refresh-check.mjs && node tests/generated-freshness-check.mjs',
      'test:smoke': 'node tests/smoke.mjs',
      'test:smoke:ci': 'node tests/smoke.mjs --continue-on-failure --retry-failures 1 --retry-infrastructure 1 --isolate-suites --hermetic',
      'test:affected': 'npm run test:static && node tests/smoke.mjs --affected-since origin/main --affected-high-risk-repeat 3 --continue-on-failure --retry-infrastructure 1 --isolate-suites --hermetic',
      'test:smoke:list': 'node tests/smoke.mjs --list',
      'test:smoke:headed': 'node tests/smoke.mjs --headed',
      'test:smoke:strict': 'node tests/smoke.mjs --strict-external',
      'test:smoke:live': 'node tests/smoke.mjs --base-url https://tezos.systems --allow-live-network --strict-external',
      'test:smoke:costs:update': 'node scripts/update-smoke-costs.mjs',
      'test:ledger-flow': 'node tests/ledger-flow-check.mjs',
      'test:baker-governance-signals': 'node tests/baker-governance-signals-check.mjs',
      'test:chamber-polling': 'node tests/chamber-polling-check.mjs && node tests/chamber-snapshot-cache-check.mjs',
      'test:service-worker-cache': 'node tests/service-worker-cache-check.mjs'
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
    if (!(await pathExists('scripts/refresh-generated-surfaces.mjs'))) {
      fail('scripts/refresh-generated-surfaces.mjs must exist for generated-surface refreshes');
    }
    if (!hook.includes('refresh-generated-surfaces.mjs') || !hook.includes('stamp-version.sh')) {
      fail('.githooks/pre-commit must refresh generated surfaces and stamp version metadata');
    }
    if (!hook.includes('guard-readme-sync.mjs') || !hook.includes('static-checks.mjs') || !hook.includes('--readme-only')) {
      fail('.githooks/pre-commit must guard README sync and run focused README contract checks');
    }
    const generatedRefresh = await readText('scripts/refresh-generated-surfaces.mjs');
    if (!generatedRefresh.includes("selected === 'scheduled'") || !generatedRefresh.includes('refresh-scheduled-data.mjs')) {
      fail('manual/pre-commit orchestrator must reject the retired all-or-nothing scheduled mode');
    }
    for (const expected of ['refresh-governance-data.mjs', 'generate-milestone-catalog.mjs', 'data/milestone-catalog.json', 'refresh-nakamoto-sources.mjs', 'data/nakamoto-sources.json', 'refresh-chain-comparison.mjs', 'data/chain-comparison-verification.json', 'build-css.mjs', 'generate-chamber-routes.mjs', 'generate-chamber-og-images.mjs', 'generate-og-image.js', 'bake-compare-pages.mjs', 'sitemap.xml', 'og-image.png']) {
      if (!generatedRefresh.includes(expected)) {
        fail(`scripts/refresh-generated-surfaces.mjs must coordinate ${expected}`);
      }
    }
    const rootOgGenerator = await readText('scripts/generate-og-image.js');
    if (rootOgGenerator.includes('Math.random')) {
      fail('scripts/generate-og-image.js must be deterministic when commit hooks regenerate og-image.png');
    }
    const rootOgContracts = [
      ["../js/effects/valley-effects.js", 'reuse the real Valley renderer'],
      ['class="valley-wash"', 'protect foreground contrast over the Valley scene'],
      ['font-size: 64px', 'keep the root social-card title readable after feed downscaling'],
      ['font-size: 18px; line-height: 1.05', 'keep root social-card metric labels readable after feed downscaling'],
      ['<div class="stat-label">Issuance</div>', 'replace the raw tz4-key count with current issuance'],
      ['current_issuance_rate', 'compare issuance against the retained 30-day history ledger'],
      ['tz4_percentage', 'compare tz4 adoption against the retained 30-day history ledger'],
      ['staking_ratio', 'compare staking against the retained 30-day history ledger'],
      ["percentChange(tz4PctValue, closestHistoricalValue(history, 'tz4_percentage'))", 'calculate tz4 adoption change from the unrounded live ratio'],
      ["percentChange(stakingRatioValue, closestHistoricalValue(history, 'staking_ratio'))", 'calculate staking change from the unrounded live ratio'],
      ['total_bakers', 'compare active bakers against the retained 30-day history ledger'],
      ['<small>30D</small>', 'label compact 30-day percentage deltas beside applicable numeric stats'],
      ['data-og-ready', 'wait for the deterministic Valley frame before capture']
    ];
    for (const [snippet, description] of rootOgContracts) {
      if (!rootOgGenerator.includes(snippet)) {
        fail(`scripts/generate-og-image.js must ${description}`);
      }
    }
    if (rootOgGenerator.includes('<div class="stat-label">TZ4 Keys</div>')) {
      fail('scripts/generate-og-image.js must not restore the raw tz4-key count to the root social card');
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

  async function checkRepositoryLicense() {
    const license = await readText('LICENSE');
    const notice = await readText('NOTICE');
    const readme = await readText('README.md');
    const agentMap = await readText('AGENTS.md');
    const index = await readText('index.html');
    const changelog = await readText('js/features/changelog.js');
    const landing = await readText('landing.html');
    const landingNav = await readText('js/landing/site-nav.js');
    const share = (await Promise.all(['js/ui/share.js', 'js/ui/share-renderer.js', 'js/ui/share-state.js'].map(readText))).join('\n');
    const stateOfTezos = await readText('js/features/state-of-tezos.js');
    const aiPlugin = JSON.parse(await readText('.well-known/ai-plugin.json'));
    const packageJson = JSON.parse(await readText('package.json'));
    const packageLock = JSON.parse(await readText('package-lock.json'));
    const normalizedLicense = license
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');
    const officialMplHash = '1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5';
    const actualMplHash = createHash('sha256').update(normalizedLicense).digest('hex');

    if (actualMplHash !== officialMplHash) {
      fail('LICENSE must remain the unmodified Mozilla Public License 2.0 text');
    }
    if (packageJson.license !== 'MPL-2.0' || packageLock?.packages?.['']?.license !== 'MPL-2.0') {
      fail('package.json and the root package-lock entry must declare MPL-2.0');
    }
    if (packageJson.author !== 'Primate') {
      fail('package.json must preserve the Primate project authorship');
    }

    const noticeSnippets = [
      'Tezos Systems',
      'Copyright (c) 2026 Primate',
      'https://github.com/Primate411/tezos.systems',
      'developed by Primate',
      'primate@tez.capital',
      'Baking Benjamins (https://x.com/BakingBenjamins)',
      'https://x.com/BakingBenjamins',
      'Mozilla Public License, v. 2.0',
      'https://mozilla.org/MPL/2.0/',
      'Third-party software',
      'separately offered under CC BY 4.0',
      'extent Primate owns those rights',
      'co-founding member of',
      'Tez Capital name and brand are',
      "repository's current copyright holder",
      'earlier revisions carried MIT or ISC declarations'
    ];
    for (const snippet of noticeSnippets) {
      if (!notice.includes(snippet)) fail(`NOTICE missing license contract text: ${snippet}`);
    }

    const readmeSnippets = [
      '## License',
      'Mozilla Public License 2.0',
      '`MPL-2.0`',
      '[NOTICE](NOTICE)',
      'file-level copyleft',
      'modified covered files must remain available under MPL-2.0',
      'Third-party software',
      '[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)',
      'Primate owns those rights',
      'co-founding member of',
      'Tez Capital brand is represented',
      'RPC infrastructure: [Tez Capital](https://tez.capital)',
      'Built by: [Primate](mailto:primate@tez.capital)',
      '[Baking Benjamins](https://x.com/BakingBenjamins)',
      'copyright notice in [NOTICE](NOTICE)',
      'current copyright holder',
      'earlier revisions carried MIT or ISC declarations'
    ];
    for (const snippet of readmeSnippets) {
      if (!readme.includes(snippet)) fail(`README missing license contract text: ${snippet}`);
    }

    const agentMapSnippets = [
      'License: Mozilla Public License 2.0 (`MPL-2.0`)',
      '`LICENSE`: unmodified Mozilla Public License 2.0 terms',
      '`NOTICE`: Tezos Systems / Primate attribution',
      'Tezos Systems is built by Primate, whose public contact is',
      '`primate@tez.capital`',
      '[Baking Benjamins](https://x.com/BakingBenjamins)',
      'Represent Tez Capital as the affiliated brand and RPC',
      "keep Primate as the repository's current copyright holder",
      'and site/schema creator, and as publisher where publisher metadata is present',
      'live footer and document metadata must retain public Source and MPL-2.0'
    ];
    for (const snippet of agentMapSnippets) {
      if (!agentMap.includes(snippet)) fail(`AGENTS.md missing license handoff text: ${snippet}`);
    }

    const deployedNoticeSnippets = [
      '<link rel="license" href="/LICENSE">',
      '<meta name="author" content="Primate">',
      'href="https://github.com/Primate411/tezos.systems" target="_blank" rel="noopener">Source</a>',
      'href="/LICENSE" rel="license">MPL-2.0</a>',
      'Built by <a href="mailto:primate@tez.capital">Primate</a> — baker behind <a href="https://x.com/BakingBenjamins" target="_blank" rel="noopener"><strong>Baking Benjamins</strong></a> and co-founding member of <a href="https://tez.capital" target="_blank" rel="noopener">Tez Capital</a>',
      'Support this work: delegate or stake to <a href="/#my-baker=bakingbenjamins.tez">BakingBenjamins.tez</a> or <a href="/#my-baker=baking.tez">baking.tez</a>',
      'RPC by <a href="https://eu.rpc.tez.capital" target="_blank" rel="noopener">Tez Capital</a>',
      '"license": "https://creativecommons.org/licenses/by/4.0/"'
    ];
    for (const snippet of deployedNoticeSnippets) {
      if (!index.includes(snippet)) fail(`index.html missing deployed license text: ${snippet}`);
    }
    if ((index.match(/"name": "Primate"/g) || []).length < 2
      || (index.match(/"email": "primate@tez\.capital"/g) || []).length < 2
      || (index.match(/"sameAs": \[[\s\S]*?"https:\/\/x\.com\/BakingBenjamins"/g) || []).length < 2) {
      fail('index.html must credit Primate by email and identify Baking Benjamins on X for both WebApplication and Dataset creator');
    }
    if ((index.match(/"affiliation": \{/g) || []).length < 2
      || (index.match(/"name": "Tez Capital"/g) || []).length < 2) {
      fail('index.html must represent Tez Capital as Primate\'s WebApplication and Dataset affiliation');
    }
    if (index.includes('Powered by <a href="https://tez.capital"') || index.includes('"sourceOrganization"')) {
      fail('index.html must not present Tez Capital as the product owner or source organization');
    }
    for (const route of CHAMBER_ROUTES) {
      const routeShell = await readText(`${route.slug}/index.html`);
      for (const snippet of deployedNoticeSnippets.filter((item) => !item.includes('creativecommons.org'))) {
        if (!routeShell.includes(snippet)) fail(`${route.slug}/index.html missing deployed license text: ${snippet}`);
      }
      if ((routeShell.match(/"name": "Primate"/g) || []).length < 1
        || (routeShell.match(/"email": "primate@tez\.capital"/g) || []).length < 1
        || (routeShell.match(/"https:\/\/x\.com\/BakingBenjamins"/g) || []).length < 1
        || (routeShell.match(/"affiliation": \{/g) || []).length < 1
        || (routeShell.match(/"name": "Tez Capital"/g) || []).length < 1
        || !routeShell.includes('"@type": "WebPage"')
        || !routeShell.includes('"@type": "BreadcrumbList"')
        || routeShell.includes('Powered by <a href="https://tez.capital"')
        || routeShell.includes('"sourceOrganization"')) {
        fail(`${route.slug}/index.html has stale product ownership attribution`);
      }
    }
    if (!changelog.includes('Primate project authorship, Tez Capital co-founding affiliation and RPC credit')) {
      fail('changelog must disclose the public MPL-2.0 source-license change');
    }

    const standalonePages = ['governance/index.html', 'bakers/index.html'];
    for (const file of standalonePages) {
      const page = await readText(file);
      if (!/"publisher":\s*\{\s*"@type": "Person",\s*"name": "Primate",\s*"url": "https:\/\/tezos\.systems\/",\s*"email": "primate@tez\.capital",\s*"sameAs": "https:\/\/github\.com\/Primate411",\s*"affiliation":\s*\{\s*"@type": "Organization",\s*"name": "Tez Capital",\s*"url": "https:\/\/tez\.capital"\s*\}\s*\}/s.test(page)) {
        fail(`${file} must identify Primate by email as its publisher and retain Tez Capital affiliation`);
      }
      if (!page.includes('Built by <a href="mailto:primate@tez.capital">Primate</a> — baker behind <a href="https://x.com/BakingBenjamins"><strong>Baking Benjamins</strong></a> and co-founding member of <a href="https://tez.capital">Tez Capital</a>')
        || !page.includes('Support this work: delegate or stake to <a href="/#my-baker=bakingbenjamins.tez">BakingBenjamins.tez</a> or <a href="/#my-baker=baking.tez">baking.tez</a>')
        || !page.includes('<a href="https://tez.capital">RPC by Tez Capital</a>')
        || page.includes('Powered by Tez Capital')) {
        fail(`${file} must show Primate authorship, Baking Benjamins baker identity and support paths, Tez Capital affiliation, and Tez Capital RPC credit`);
      }
    }
    if (!landing.includes('Built by <a href="mailto:primate@tez.capital">Primate</a>')
      || !landing.includes('— baker behind <a href="https://x.com/BakingBenjamins"')
      || !landing.includes('Support this work: delegate or stake to <a href="/#my-baker=bakingbenjamins.tez">BakingBenjamins.tez</a> or <a href="/#my-baker=baking.tez">baking.tez</a>')
      || !landing.includes('co-founding member of <a href="https://tez.capital"')
      || !landing.includes('RPC by <a href="https://tez.capital"')
      || landing.includes('Powered by <a href="https://tez.capital"')) {
      fail('landing.html must show Primate authorship, Baking Benjamins baker identity and support paths, Tez Capital affiliation, and Tez Capital RPC credit');
    }
    if (!landingNav.includes('Built by <a href="mailto:primate@tez.capital">Primate</a>')
      || !landingNav.includes('— baker behind <a href="https://x.com/BakingBenjamins"')
      || !landingNav.includes('Support this work: delegate or stake to <a href="/#my-baker=bakingbenjamins.tez">BakingBenjamins.tez</a> or <a href="/#my-baker=baking.tez">baking.tez</a>')
      || !landingNav.includes('co-founding member of <a href="https://tez.capital"')
      || !landingNav.includes('RPC by <a href="https://tez.capital"')) {
      fail('landing footer runtime must show Primate authorship, Baking Benjamins baker identity and support paths, Tez Capital affiliation, and Tez Capital RPC credit');
    }
    if (!share.includes('Built by <span style="color:${brandColor};font-weight:600;">Primate</span> · RPC by')) {
      fail('share cards must credit Primate and retain the Tez Capital RPC brand credit');
    }
    if (!stateOfTezos.includes("'PRIMATE · RPC BY TEZ CAPITAL'")) {
      fail('State of Tezos cards must credit Primate and retain the Tez Capital RPC brand credit');
    }
    if (!aiPlugin.description_for_model.includes('co-founding member of Tez Capital')
      || !aiPlugin.description_for_model.includes('Tez Capital RPC infrastructure')
      || aiPlugin.contact_email !== 'primate@tez.capital'
      || aiPlugin.legal_info_url !== 'https://tezos.systems/LICENSE') {
      fail('AI plugin metadata must show Tez Capital affiliation and RPC infrastructure and link the repository license');
    }

    pass('MPL-2.0 text, package metadata, attribution, and repository docs agree');
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
      'npm run refresh:generated',
      'npm run refresh:milestones',
      'npm run refresh:maxis',
      'npm run check:maxis',
      'npm run routes:chambers',
      'npm run og:chambers',
      'npm run bake:compare',
      'npm run refresh:governance',
      'npm run guard:readme',
      'npm run check:readme',
      'npm run test:smoke:list',
      'SKIP_README_GUARD=1',
      'Headline telemetry refresh: 15 minutes; full dashboard refresh: 2 hours',
      'Sparkline refresh: 10 minutes',
      'Price refresh: 30 minutes',
      'Memory cache TTL: 1 minute',
      'Storage cache TTL: 4 hours',
      'css/styles.min.css',
      'scripts/lib/playwright-browser.cjs',
      'BROWSER_EXECUTABLE_PATH',
      'CACHE_NAME',
      'version.json',
      'June 30, 2018'
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

  return { checkRequiredFiles, checkJsonFiles, checkLocalReferences, checkModuleImportVersions, checkPortableTooling, checkRepositoryLicense, checkReadmeContracts };
}
