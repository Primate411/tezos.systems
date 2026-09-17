import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileHtml, compileJavaScript, createKnipConfig } from '../scripts/lib/knip-config.mjs';
import { runUnusedCodeAudit } from '../scripts/audit-unused-code.mjs';

const require = createRequire(import.meta.url);
const knipCli = path.resolve(path.dirname(require.resolve('knip')), '../bin/knip.js');
const configModule = new URL('../scripts/lib/knip-config.mjs', import.meta.url).href;
const auditCli = fileURLToPath(new URL('../scripts/audit-unused-code.mjs', import.meta.url));
const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tezos-unused-code-check-')));
const root = path.join(temporary, 'site');
const chambers = {
  fixture: {
    modulePath: '../features/fixture-chamber.js',
    init: 'initFixture', open: 'openFixture', close: 'closeFixture'
  },
  // Escaped namespaces are conservative. Keep this separate from the catalog-
  // only chamber so the test does not claim to prove every namespace export dead.
  loaded: { modulePath: '../features/loaded-chamber.js' }
};
const staticChecks = [{ script: 'tests/catalog-only.mjs', args: [] }];
const lanes = [{
  id: 'fixture',
  refresh: [{ script: 'scripts/refresh-only.mjs', args: [] }],
  validate: [{ script: 'tests/validate-only.mjs', args: [] }]
}];

async function write(relative, source) {
  const filename = path.join(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, source);
}

async function fingerprint(directory = root) {
  const records = [];
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) records.push(...await fingerprint(filename));
    else records.push([path.relative(root, filename), createHash('sha256').update(await fs.readFile(filename)).digest('hex')]);
  }
  return records;
}

function configuration(catalog = chambers) {
  return `module.exports = async () => {
    const { createKnipConfig } = await import(${JSON.stringify(configModule)});
    return createKnipConfig(${JSON.stringify({ root, chambers: catalog, staticChecks, lanes })});
  };\n`;
}

function runKnip(extraArgs = []) {
  const result = spawnSync(process.execPath, [
    knipCli, '--config', 'knip.config.js', '--no-progress', '--no-exit-code', '--reporter', 'json', ...extraArgs
  ], { cwd: root, encoding: 'utf8', timeout: 45_000, maxBuffer: 16 * 1024 * 1024 });
  assert.ifError(result.error);
  return result;
}

function parseKnip(result) {
  assert.equal(result.status, 0, `Knip must complete: ${result.stderr}\n${result.stdout}`);
  const report = JSON.parse(result.stdout);
  assert(Array.isArray(report.issues), 'the real reporter supplies issue rows');
  return report.issues;
}

const fileIssues = issues => new Set(issues.filter(issue => issue.files?.length).map(issue => issue.file));
const names = (issues, filename, category) => issues.filter(issue => issue.file === filename).flatMap(issue => (issue[category] || []).map(value => value.name));

try {
  await write('package.json', JSON.stringify({
    name: 'unused-code-contract-fixture', private: true, type: 'commonjs',
    devDependencies: { 'unused-fixture-dependency': '1.0.0' }
  }));
  await write('knip.config.js', configuration());
  await write('index.html', `<!doctype html><html><body>
    <!-- <script src="./js/comment-only.js"></script> -->
    <script type="application/ld+json">{"description":"import './js/json-only.js'"}</script>
    <script src="https://example.invalid/external.js"></script>
    <script type="module" src="/js/core/standalone-chamber.js?v=647#entry"></script>
  </body></html>`);
  await write('widgets/fixture.html', `<script type="module">
    import { widgetValue } from './widget.js?v=647'; console.log(widgetValue);
  </script>`);
  await write('widgets/widget.js', 'export const widgetValue = 1;\n');
  await write('sw.js', "self.addEventListener('fetch', () => {});\n");
  await write('js/core/standalone-chamber.js', "const source = new URL('./app.js', import.meta.url); import(source.href);\n");
  await write('js/core/app.js', `
    import { usedValue } from './helper.js?v=647#value';
    import { CHAMBER_FEATURES } from './chamber-features.mjs';
    import './hen-init.js';
    import '../ui/share.js';
    import '../ui/changelog-launcher.js';
    import '../ui/chamber-theme-effects.js';
    console.log(usedValue, CHAMBER_FEATURES);
    function importAppFeatureModule(id, modulePath) { return import(modulePath); }
    function loadChamberFeature(id) { return import(CHAMBER_FEATURES[id].modulePath); }
    function versionedAsset(value) { return value + '?v=647'; }
    importAppFeatureModule('extra', '../features/app-extra.js');
    loadChamberFeature('loaded');
    import(versionedAsset('../features/versioned.js'));
  `);
  await write('js/core/helper.js', 'export const usedValue = 1; export const unusedValue = 2;\n');
  await write('js/core/chamber-features.mjs', `export const CHAMBER_FEATURES = ${JSON.stringify(chambers)};\n`);
  await write('js/features/fixture-chamber.js', `
    export function initFixture() {}
    export function openFixture() {}
    export function closeFixture() {}
    export function unusedChamberHelper() {}
  `);
  await write('js/features/app-extra.js', 'console.log("app loader retains this file");\n');
  await write('js/features/loaded-chamber.js', 'console.log("literal chamber loader retains this file");\n');
  await write('js/features/versioned.js', 'console.log("asset wrapper retains this file");\n');
  await write('js/core/hen-init.js', "const script = document.createElement('script'); const attempt = 0; script.src = '/js/features/hen-mode.js?v=97' + (attempt ? `&retry=${attempt}` : ''); document.head.appendChild(script);\n");
  await write('js/features/hen-mode.js', 'console.log("HEN script-src runtime");\n');
  await write('js/ui/share.js', "const path = './share-renderer.js'; const importAttempt = 0; import(importAttempt ? `${path}?share-retry=${importAttempt}` : path);\n");
  await write('js/ui/share-renderer.js', 'console.log("share retry runtime");\n');
  await write('js/ui/changelog-launcher.js', "const path = '../features/changelog.js'; const importAttempt = 0; import(importAttempt ? `${path}?retry=${importAttempt}` : path);\n");
  await write('js/features/changelog.js', 'console.log("changelog retry runtime");\n');
  const themeLoader = `
    const theme = document.body.dataset.theme;
    const backgroundThemes = new Set(['ember']);
    const unrelated = '/js/effects/string-only.js';
    const attempt = 0;
    function versionedAsset(value) { return value + '?v=651'; }
    const source = theme === 'matrix' ? '/js/effects/matrix-effects.js'
      : backgroundThemes.has(theme) ? '/js/effects/bg-effects.js'
        : theme === 'valley' ? versionedAsset('/js/effects/valley-loader.js') : null;
    const url = attempt ? source + '?theme-retry=' + attempt : source;
    if (source) import(url);
  `;
  await write('js/ui/chamber-theme-effects.js', themeLoader);
  await write('js/effects/matrix-effects.js', 'export function unusedMatrixHelper() {} console.log("conditional Matrix renderer");\n');
  await write('js/effects/bg-effects.js', 'export function unusedBackgroundHelper() {} console.log("conditional background renderer");\n');
  await write('js/effects/valley-loader.js', 'console.log("conditional versioned Valley loader");\n');
  await write('js/effects/string-only.js', 'console.log("an unrelated effect path is not a dynamic import");\n');
  await write('js/features/orphan.js', 'export const orphan = 1;\n');
  await write('js/comment-only.js', 'console.log("commented script remains orphaned");\n');
  await write('js/json-only.js', 'console.log("JSON-LD does not execute imports");\n');
  await write('scripts/refresh-only.mjs', `
    import { getMaxisSource } from './lib/maxis-source.mjs';
    import { getMaxisEvaluator } from './lib/maxis-season.mjs';
    const source = getMaxisSource('maxis-evaluator-v2');
    const evaluator = getMaxisEvaluator('maxis-evaluator-v2');
    console.log(source.buildFullSeasonSnapshot(), evaluator.buildSeasonCompetition());
  `);
  await write('scripts/lib/maxis-source.mjs', `
    import * as sourceV2 from './maxis-source-v2.mjs';
    const SOURCES = new Map([['maxis-evaluator-v2', sourceV2]]);
    export function getMaxisSource(version) { return SOURCES.get(version); }
    export function unusedSourceRegistryHelper() {}
  `);
  await write('scripts/lib/maxis-source-v2.mjs', `
    export const IMMUTABLE_IMPLEMENTATION_FILES = [];
    export const MAXIS_SOURCE_VERSION = 'maxis-source-v2';
    export const EVALUATOR_VERSION = 'maxis-evaluator-v2';
    export function buildFullSeasonSnapshot() { return {}; }
    export function rebuildWithoutTransactionLane() { return {}; }
    export function unusedSourceImplementationHelper() {}
  `);
  await write('scripts/lib/maxis-season.mjs', `
    import * as evaluatorV2 from './maxis-evaluator-v2.mjs';
    const EVALUATORS = new Map([[evaluatorV2.SEASON_EVALUATOR_VERSION, evaluatorV2]]);
    export function getMaxisEvaluator(version) { return EVALUATORS.get(version); }
    export function unusedEvaluatorRegistryHelper() {}
    export * from './maxis-evaluator-v2.mjs';
  `);
  await write('scripts/lib/maxis-evaluator-v2.mjs', `
    export const SEASON_EVALUATOR_VERSION = 'maxis-evaluator-v2';
    export const SEASON_RULES_VERSION = 'protocol-maxis-v2';
    export const LANE_EVALUATOR_SEMANTICS = {};
    export function buildRuleDefinition() { return {}; }
    export function buildSeasonCompetition() { return {}; }
    export function validateSeasonSnapshot() { return []; }
    export function buildLaneRuleHashes() { return {}; }
    export function expandPassportRecord() { return {}; }
    export function truncationCoverageErrors() { return []; }
    export function unusedEvaluatorImplementationHelper() {}
  `);
  await write('tests/catalog-only.mjs', 'console.log("shared static catalog root");\n');
  await write('tests/validate-only.mjs', 'console.log("scheduled validator root");\n');

  const config = await createKnipConfig({ root, chambers, staticChecks, lanes });
  assert(config && typeof config === 'object', 'configuration factory supports an isolated project root');
  assert.throws(() => createKnipConfig({ root, chambers, staticChecks: [{ script: 'tests/missing.mjs' }], lanes }), /Missing tooling entry/, 'stale test-catalog references fail visibly');
  assert.throws(() => createKnipConfig({ root, chambers, staticChecks: [{ script: '../outside.mjs' }], lanes }), /Invalid tooling entry/, 'tooling catalogs cannot silently root files outside the project');
  assert.throws(() => createKnipConfig({ root, chambers: { missing: { modulePath: '../features/missing.js' } }, staticChecks, lanes }), /Missing chamber module/, 'missing dynamic module references fail visibly');
  const aliasedRoot = path.join(temporary, 'site-alias');
  await fs.symlink(root, aliasedRoot, 'dir');
  const aliasConfig = await createKnipConfig({ root: aliasedRoot, chambers, staticChecks, lanes });
  assert.match(aliasConfig.compilers.js(await fs.readFile(path.join(root, 'js/core/app.js'), 'utf8'), path.join(root, 'js/core/app.js')), /import\(["']\.\.\/features\/app-extra\.js["']\)/, 'canonical Knip filenames still match dispatchers when the checkout path is a symlink');
  const html = compileHtml(await fs.readFile(path.join(root, 'index.html'), 'utf8'), path.join(root, 'index.html'), root);
  assert(html.includes('standalone-chamber.js'), 'HTML script src becomes a graph edge');
  assert(!html.includes('?v=647') && !html.includes('#entry'), 'browser cache stamps are removed from imports');
  assert(!html.includes('comment-only') && !html.includes('json-only') && !html.includes('example.invalid'), 'comments, data scripts, and remote URLs do not become local executable roots');
  const inline = compileHtml(await fs.readFile(path.join(root, 'widgets/fixture.html'), 'utf8'), path.join(root, 'widgets/fixture.html'), root);
  assert(inline.includes('widgetValue'), 'inline widget modules remain analyzable');

  const source = `import { value } from './helper.js?v=1#x';
    export { another } from './reexport.js?v=1';
    import('./lazy.js#fragment'); require('./legacy.cjs?v=1');
    const request = '/data/current.json?v=1';`;
  const compiled = compileJavaScript(source, path.join(root, 'js/core/example.js'), { root, chambers });
  for (const specifier of ['./helper.js?v=1#x', './reexport.js?v=1', './lazy.js#fragment', './legacy.cjs?v=1']) {
    assert(!compiled.includes(specifier), `local module cache identity is normalized: ${specifier}`);
  }
  assert(compiled.includes('/data/current.json?v=1'), 'ordinary data-fetch strings retain their meaning');
  for (const [filename, expectedImport] of [
    ['js/core/standalone-chamber.js', /import\(["']\.\/app\.js["']\)/],
    ['js/core/hen-init.js', /import ["']\.\.\/features\/hen-mode\.js["']/],
    ['js/ui/share.js', /import\(["']\.\/share-renderer\.js["']\)/],
    ['js/ui/changelog-launcher.js', /import\(["']\.\.\/features\/changelog\.js["']\)/]
  ]) {
    const adapter = compileJavaScript(await fs.readFile(path.join(root, filename), 'utf8'), path.join(root, filename), { root, chambers });
    assert.match(adapter, expectedImport, `known computed loader has an analyzable local import: ${filename}`);
  }
  const themeAdapter = compileJavaScript(themeLoader, path.join(root, 'js/ui/chamber-theme-effects.js'), { root, chambers });
  for (const file of ['matrix-effects.js', 'bg-effects.js', 'valley-loader.js']) {
    assert(themeAdapter.includes(`import "../effects/${file}";`), `conditional renderer has a side-effect edge: ${file}`);
  }
  assert(!themeAdapter.includes('import "../effects/string-only.js";'), 'unrelated renderer-path strings do not create edges');

  const before = await fingerprint();
  const issues = parseKnip(runKnip());
  assert.deepEqual(await fingerprint(), before, 'Knip analysis never edits sources, configuration, or package metadata');
  const unusedFiles = fileIssues(issues);
  for (const live of [
    'js/core/standalone-chamber.js', 'js/core/app.js', 'js/core/helper.js', 'js/core/chamber-features.mjs',
    'js/features/fixture-chamber.js', 'js/features/loaded-chamber.js', 'js/features/app-extra.js', 'js/features/versioned.js',
    'js/core/hen-init.js', 'js/features/hen-mode.js', 'js/ui/share.js', 'js/ui/share-renderer.js', 'js/ui/changelog-launcher.js', 'js/features/changelog.js',
    'js/ui/chamber-theme-effects.js', 'js/effects/matrix-effects.js', 'js/effects/bg-effects.js', 'js/effects/valley-loader.js',
    'scripts/lib/maxis-source.mjs', 'scripts/lib/maxis-source-v2.mjs', 'scripts/lib/maxis-season.mjs', 'scripts/lib/maxis-evaluator-v2.mjs',
    'widgets/widget.js', 'sw.js', 'scripts/refresh-only.mjs', 'tests/catalog-only.mjs', 'tests/validate-only.mjs'
  ]) assert(!unusedFiles.has(live), `known-live source is retained: ${live}`);
  for (const orphan of ['js/features/orphan.js', 'js/comment-only.js', 'js/json-only.js', 'js/effects/string-only.js']) {
    assert(unusedFiles.has(orphan), `unreachable source is still reported: ${orphan}`);
  }
  assert(names(issues, 'js/core/helper.js', 'exports').includes('unusedValue'), 'unused exports inside a live module remain visible');
  assert(!names(issues, 'js/core/helper.js', 'exports').includes('usedValue'), 'real imports retain the used helper export');
  assert(names(issues, 'js/effects/matrix-effects.js', 'exports').includes('unusedMatrixHelper'), 'theme loading does not suppress Matrix unused exports');
  assert(names(issues, 'js/effects/bg-effects.js', 'exports').includes('unusedBackgroundHelper'), 'theme loading does not suppress background unused exports');
  const chamberExports = names(issues, 'js/features/fixture-chamber.js', 'exports');
  assert(chamberExports.includes('unusedChamberHelper'), `dynamic catalog handling does not suppress every chamber export: ${JSON.stringify(issues.filter(issue => issue.file === 'js/features/fixture-chamber.js'))}`);
  for (const used of ['initFixture', 'openFixture', 'closeFixture']) {
    assert(!chamberExports.includes(used), `computed catalog API use is recognized: ${used}`);
  }
  assert(names(issues, 'package.json', 'devDependencies').includes('unused-fixture-dependency'), 'unused declared dependencies are reported');
  for (const [registry, registryHelper, implementation, implementationHelper, publicApi] of [
    ['scripts/lib/maxis-source.mjs', 'unusedSourceRegistryHelper', 'scripts/lib/maxis-source-v2.mjs', 'unusedSourceImplementationHelper', [
      'IMMUTABLE_IMPLEMENTATION_FILES', 'MAXIS_SOURCE_VERSION', 'EVALUATOR_VERSION', 'buildFullSeasonSnapshot', 'rebuildWithoutTransactionLane'
    ]],
    ['scripts/lib/maxis-season.mjs', 'unusedEvaluatorRegistryHelper', 'scripts/lib/maxis-evaluator-v2.mjs', 'unusedEvaluatorImplementationHelper', [
      'SEASON_EVALUATOR_VERSION', 'SEASON_RULES_VERSION', 'LANE_EVALUATOR_SEMANTICS', 'buildRuleDefinition', 'buildSeasonCompetition',
      'validateSeasonSnapshot', 'buildLaneRuleHashes', 'expandPassportRecord', 'truncationCoverageErrors'
    ]]
  ]) {
    const registryExports = [...names(issues, registry, 'exports'), ...names(issues, registry, 'nsExports')];
    const implementationExports = [...names(issues, implementation, 'exports'), ...names(issues, implementation, 'nsExports')];
    assert(registryExports.includes(registryHelper), `registry adaptation retains genuine dead-export findings: ${registry}`);
    assert(implementationExports.includes(implementationHelper), `registry adaptation does not suppress every implementation export: ${implementation}`);
    for (const method of publicApi) {
      assert(!implementationExports.includes(method) && !registryExports.includes(method), `Map-returned namespace API is recognized: ${implementation}:${method}`);
    }
  }
  assert(issues.every(issue => !issue.unresolved?.length), 'normalized local URLs all resolve without remote-script false positives');

  await write('js/ui/chamber-theme-effects.js', themeLoader.replace("'/js/effects/matrix-effects.js'", 'null'));
  const removedThemeBranch = parseKnip(runKnip());
  assert(fileIssues(removedThemeBranch).has('js/effects/matrix-effects.js'), 'removing a renderer branch makes its orphan visible');
  assert(!fileIssues(removedThemeBranch).has('js/effects/bg-effects.js'), 'remaining renderer branch stays live');
  await write('js/ui/chamber-theme-effects.js', themeLoader);

  await write('knip.config.js', configuration({}));
  const unrooted = parseKnip(runKnip());
  assert(fileIssues(unrooted).has('js/features/fixture-chamber.js'), 'removing the dynamic catalog edge makes its orphan visible');
  await write('knip.config.js', 'module.exports = { entry: 42 };\n');
  const invalid = runKnip();
  assert.notEqual(invalid.status, 0, 'informational mode never swallows invalid Knip configuration');
  await write('knip.config.js', configuration());

  const auditBefore = await fingerprint();
  const outputDir = path.join(temporary, 'reports', 'real');
  const audit = await runUnusedCodeAudit({ root, outputDir, knipCli });
  assert.equal(audit.status, 'completed');
  assert.equal(audit.informational, true);
  assert(audit.counts.files >= 3 && audit.counts.exports >= 2 && audit.counts.devDependencies >= 1, 'informational audit preserves real findings');
  assert(audit.totalFindings > 0, 'findings do not make the audit fail');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(outputDir, 'report.json'), 'utf8')), audit, 'written machine-readable artifact agrees with returned results');
  assert((await fs.readFile(path.join(outputDir, 'report.md'), 'utf8')).includes('orphan.js'), 'human report retains actionable file locations');
  assert.deepEqual(await fingerprint(), auditBefore, 'report generation does not mutate inspected source files');

  const fakeCases = [
    ['invalid-json', 'console.log("not JSON");'],
    ['invalid-schema', 'console.log(JSON.stringify({ issues: "not an array" }));'],
    ['nonzero', 'console.log(JSON.stringify({ issues: [] })); process.exitCode = 2;'],
    ['signal', 'process.kill(process.pid, "SIGTERM");']
  ];
  for (const [name, body] of fakeCases) {
    const fakeCli = path.join(temporary, `${name}.cjs`);
    await fs.writeFile(fakeCli, body);
    const failureDir = path.join(temporary, 'reports', name);
    const failed = await runUnusedCodeAudit({ root, outputDir: failureDir, knipCli: fakeCli });
    assert.equal(failed.status, 'failed', `${name}: incomplete execution cannot appear successful`);
    assert(failed.error?.message, `${name}: report explains the failure`);
    assert.equal(JSON.parse(await fs.readFile(path.join(failureDir, 'report.json'), 'utf8')).status, 'failed', `${name}: saved status remains failed`);
  }
  const overwritten = await runUnusedCodeAudit({ root, outputDir, knipCli: path.join(temporary, 'invalid-json.cjs') });
  assert.equal(overwritten.status, 'failed');
  assert.equal(JSON.parse(await fs.readFile(path.join(outputDir, 'report.json'), 'utf8')).status, 'failed', 'a failed rerun replaces a previous successful artifact');
  assert.equal(overwritten.totalFindings, 0, 'failure does not reuse the previous successful finding counts');
  const missing = await runUnusedCodeAudit({ root, outputDir: path.join(temporary, 'reports', 'missing'), knipCli: path.join(temporary, 'missing-knip.cjs') });
  assert.equal(missing.status, 'failed', 'missing tooling fails visibly');
  const forbidden = spawnSync(process.execPath, [auditCli, '--fix'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.ifError(forbidden.error);
  assert.notEqual(forbidden.status, 0, 'audit CLI rejects mutation flags instead of forwarding them');
  assert.deepEqual(await fingerprint(), auditBefore, 'failure paths and rejected CLI flags do not alter sources');
  console.log('ok - unused-code graph recognizes browser/widget/catalog/tooling roots, computed loaders and versioned registries, detects real unused code, preserves sources, and reports failures honestly');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
