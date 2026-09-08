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
for (const required of ['static-checks', 'smoke-harness-check', 'scheduled-refresh-check', 'source-payload-check', 'widget-refresh-check', 'generated-transport-check', 'service-worker-cache-check']) {
    assert(STATIC_CHECKS.some(entry => entry.script === `tests/${required}.mjs`), `required safety gate ${required} is present`);
}
const packageJson = JSON.parse(await fs.readFile(new URL('package.json', root), 'utf8'));
assert.equal(packageJson.scripts['test:static'], 'node tests/run-static.mjs');
assert.equal(packageJson.scripts.test, 'npm run test:static && npm run test:smoke:ci');
console.log('ok - shared static catalog, executable files, command listing and local/hosted entry point');
