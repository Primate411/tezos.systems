// Static contracts owned by harness. Shared dependencies remain explicit.
export function createHarnessStaticChecks({
  fail,
  pass,
  readText
}) {
  async function checkSmokeSuiteCatalogContracts() {
    const smoke = await readText('tests/smoke.mjs');
    const affected = await readText('tests/lib/smoke-affected.mjs');
    const metadata = await readText('tests/lib/smoke-metadata.mjs');
    const costUpdater = await readText('scripts/update-smoke-costs.mjs');
    const versionResolver = await readText('scripts/resolve-playwright-version.mjs');
    const ciWorkflow = await readText('.github/workflows/ci.yml');
    const canaryWorkflow = await readText('.github/workflows/smoke-canary.yml');
    const intentionalWaits = JSON.parse(await readText('tests/fixtures/smoke-intentional-waits.json'));
    const suiteCosts = JSON.parse(await readText('tests/fixtures/smoke-suite-costs.json'));

    if (smoke.includes('const suiteNames = [')) {
      fail('tests/smoke.mjs --list must not maintain a separate hard-coded suite list');
    }
    if (!/if \(cli\.list\) \{\s*for \(const \{ name, description \} of selectSuites\(getSuiteCatalog\(null, ''\)\)/.test(smoke)) {
      fail('tests/smoke.mjs --list must derive from the selected executable catalog so focused shards are discoverable');
    }
    if (!smoke.includes("require('./fixtures/smoke-suite-costs.json')")
      || !smoke.includes('suiteCosts: smokeSuiteCosts')) {
      fail('tests/smoke.mjs must apply the measured suite-cost ledger when selecting CI shards');
    }
    for (const snippet of [
      'metadataForSmokeSuite(suite.name)',
      'selectAffectedSmokeSuites',
      'affectedHighRiskRepeat',
      'instrumentBrowserForHermeticNetwork',
      'fulfillHermeticSharedAsset',
      'fulfillHermeticSharedWebSocket',
      "['127.0.0.1', 'localhost', '::1', '[::1]']",
      "context.routeWebSocket('**/*'",
      'SmokeInfrastructureError',
      'page.clock.fastForward(8500)',
      'page.clock.fastForward(10250)'
    ]) {
      if (!smoke.includes(snippet)) fail(`tests/smoke.mjs must preserve hardening contract ${snippet}`);
    }
    for (const snippet of ['GLOBAL_SMOKE_PATTERNS', 'NO_BROWSER_IMPACT_PATTERNS', "mode: 'full'", 'not mapped to a bounded smoke owner']) {
      if (!affected.includes(snippet)) fail(`affected smoke selection must remain conservative through ${snippet}`);
    }
    for (const snippet of ['files, risk, tags', "risk: 'high'", "tags: ['live-canary']"]) {
      if (!metadata.includes(snippet)) fail(`smoke catalog metadata must preserve ${snippet}`);
    }
    for (const snippet of ['githubActions', 'result.status !== \'passed\'', 'median(values)', 'planSuiteShards', 'observed * 0.7']) {
      if (!costUpdater.includes(snippet)) fail(`hosted smoke timing learner must preserve ${snippet}`);
    }
    for (const [label, workflow] of [['CI', ciWorkflow], ['nightly canary', canaryWorkflow]]) {
      if (!workflow.includes('run: node scripts/resolve-playwright-version.mjs')) {
        fail(`${label} must resolve the installed Playwright version through the tested portable helper`);
      }
      if (workflow.includes('node -p \\"require(')) {
        fail(`${label} must not restore the nested shell quoting that breaks Playwright version resolution`);
      }
    }
    for (const snippet of ['process.env.GITHUB_OUTPUT', "new URL('../node_modules/playwright/package.json'", 'appendFileSync(outputPath', 'Invalid installed Playwright version']) {
      if (!versionResolver.includes(snippet)) fail(`Playwright version resolver must preserve ${snippet}`);
    }
    for (const snippet of ["cron: '17 9 * * *'", '--risk high', '--repeat-each 5', '--hermetic', '--allow-live-network', 'octez-connect-sdk-loader,kraken-websocket-canary', 'if: always()']) {
      if (!canaryWorkflow.includes(snippet)) fail(`nightly smoke canary must include ${snippet}`);
    }
    for (const snippet of ['needs: smoke-costs', 'actions/cache/restore@v5', 'actions/download-artifact@v5', 'name: nightly-smoke-costs', 'include-hidden-files: true', 'cp tests/fixtures/smoke-suite-costs.json .cache/smoke-suite-costs.json', '--suite-costs .cache/smoke-suite-costs.json']) {
      if (!canaryWorkflow.includes(snippet)) fail(`nightly shards must share adaptive timings with a cold-cache fallback through ${snippet}`);
    }

    const directLongWaits = Array.from(smoke.matchAll(/waitForTimeout\(\s*([\d_]+)\s*\)/g))
      .map((match) => ({ literal: match[1], milliseconds: Number(match[1].replaceAll('_', '')) }))
      .filter((wait) => wait.milliseconds >= 1000);
    if (directLongWaits.length) {
      fail(`browser smoke contains undocumented direct waits >=1s: ${JSON.stringify(directLongWaits)}`);
    }
    for (const [key, receipt] of Object.entries(intentionalWaits)) {
      if (!Number.isInteger(receipt?.milliseconds) || receipt.milliseconds < 1000 || typeof receipt.reason !== 'string' || receipt.reason.length < 20) {
        fail(`intentional smoke wait ${key} needs a >=1s duration and specific reason`);
      }
      if (!smoke.includes(`'${key}'`)) {
        fail(`intentional smoke wait ${key} is not referenced by the executable runner`);
      }
    }
    const catalogStart = smoke.indexOf('function getSuiteCatalog(browser, baseUrl)');
    const catalogEnd = smoke.indexOf('\nfunction selectSuites(catalog)', catalogStart);
    const catalogSource = catalogStart >= 0 && catalogEnd > catalogStart
      ? smoke.slice(catalogStart, catalogEnd)
      : '';
    const suiteNames = Array.from(catalogSource.matchAll(/\{ name: '([^']+)'/g), (match) => match[1]);
    const missingCosts = suiteNames.filter((name) => !Object.hasOwn(suiteCosts, name));
    const unknownCosts = Object.keys(suiteCosts).filter((name) => !suiteNames.includes(name));
    const invalidCosts = Object.entries(suiteCosts)
      .filter(([, seconds]) => !Number.isInteger(seconds) || seconds <= 0)
      .map(([name]) => name);
    if (!suiteNames.length || missingCosts.length || unknownCosts.length || invalidCosts.length) {
      fail(`smoke suite cost ledger drifted ${JSON.stringify({ suiteCount: suiteNames.length, missingCosts, unknownCosts, invalidCosts })}`);
    }

    for (const oldName of ['hero-command-bar', 'my-tezos-deep-link-override', 'governance-lb', 'feature-workflows']) {
      if (suiteNames.includes(oldName)) fail(`oversized smoke suite ${oldName} must stay split into independent failure domains`);
    }
    for (const splitName of ['hero-command-bar-first-paint', 'hero-command-bar-desktop', 'hero-command-bar-mobile', 'my-tezos-deep-link-hash', 'my-tezos-deep-link-path', 'governance-lb-active', 'governance-lb-quiet', 'feature-workflows-desktop', 'feature-workflows-mobile']) {
      if (!suiteNames.includes(splitName)) fail(`split smoke catalog is missing ${splitName}`);
    }

    pass(`hardened smoke catalog, intentional waits, affected ownership, canaries, and measured costs derive from ${suiteNames.length} executable suites`);
  }

  return { checkSmokeSuiteCatalogContracts };
}
