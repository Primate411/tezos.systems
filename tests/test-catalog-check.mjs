import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { STATIC_CHECKS } from './lib/static-test-catalog.mjs';

const root = new URL('../', import.meta.url);
const identities = STATIC_CHECKS.map(entry => JSON.stringify([entry.script, entry.args]));
assert.equal(new Set(identities).size, identities.length, 'static commands must not run twice');
for (const entry of STATIC_CHECKS) {
    assert.match(entry.script, /^(tests|scripts)\/[a-z0-9/-]+\.mjs$/);
    assert(entry.args.every(arg => typeof arg === 'string'));
    await fs.access(new URL(entry.script, root));
}
const listed = execFileSync(process.execPath, ['tests/run-static.mjs', '--list'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
assert.deepEqual(listed, STATIC_CHECKS.map(entry => [entry.script, ...entry.args].join(' ')), 'CLI listing and execution use the same catalog');
for (const required of [
    'static-checks', 'smoke-harness-check', 'scheduled-refresh-check', 'source-payload-check',
    'widget-refresh-check', 'generated-transport-check', 'service-worker-cache-check',
    'initial-load-policy-check', 'initial-load-network-check', 'initial-load-report-check', 'initial-load-server-check'
]) {
    assert(STATIC_CHECKS.some(entry => entry.script === `tests/${required}.mjs`), `required safety gate ${required} is present`);
}
const packageJson = JSON.parse(await fs.readFile(new URL('package.json', root), 'utf8'));
assert.equal(packageJson.scripts['test:static'], 'node tests/run-static.mjs');
assert.equal(packageJson.scripts.test, 'npm run test:static && npm run test:smoke:ci');
assert.equal(packageJson.scripts['test:initial-load'], 'node tests/initial-load-check.mjs && node tests/initial-load-cancellation-check.mjs');
assert.equal(packageJson.scripts['measure:load:ci'], 'node scripts/measure-initial-load.mjs --matrix --runs 3 --warmup-runs 1 --budgets tests/fixtures/initial-load-budgets.json --output test-artifacts/initial-load/report.json');
for (const script of ['tests/initial-load-check.mjs', 'tests/initial-load-cancellation-check.mjs']) {
    assert(!STATIC_CHECKS.some(entry => entry.script === script), 'browser-backed load checks stay out of the static gate');
    await fs.access(new URL(script, root));
}
const ciWorkflow = await fs.readFile(new URL('.github/workflows/ci.yml', root), 'utf8');
const jobSource = name => {
    const marker = `\n  ${name}:\n`;
    const start = ciWorkflow.indexOf(marker);
    assert(start >= 0, `required CI job ${name} exists`);
    return ciWorkflow.slice(start + marker.length).split(/\n  [a-z][a-z0-9-]*:\n/)[0];
};
const initialLoadJob = jobSource('initial-load');
assert.match(initialLoadJob, /\n    needs: static-contracts\n/, 'load measurement follows static validation');
const harnessStep = initialLoadJob.indexOf('run: npm run test:initial-load');
const measurementStep = initialLoadJob.indexOf('run: npm run measure:load:ci');
assert(harnessStep >= 0 && measurementStep > harnessStep, 'CI checks the browser harness before measuring budgets');
assert(initialLoadJob.includes('run: node scripts/resolve-playwright-version.mjs'), 'load CI shares the portable Playwright version resolver');
assert.match(initialLoadJob, /if: always\(\)\s+uses: actions\/upload-artifact@v5\s+with:\s+name: initial-load\s+path: test-artifacts\/initial-load\n/, 'load reports upload on measurement failure');
const deployNeeds = jobSource('deploy-pages').match(/\n    needs: \[([^\]]+)\]/)?.[1].split(',').map(value => value.trim());
assert(deployNeeds?.includes('browser-smoke') && deployNeeds.includes('initial-load'), 'Pages requires both the full smoke catalog and the load budget gate');
console.log('ok - shared static catalog, local/hosted entry points, load artifacts and Pages dependency gates');
