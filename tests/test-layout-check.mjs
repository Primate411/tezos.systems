import assert from 'node:assert/strict';
import { readdir, readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readSmokeTestSource } from './lib/test-source.mjs';
import { SMOKE_MODULE_RULES } from './lib/smoke-module-owners.mjs';
import { metadataForSmokeSuite } from './lib/smoke-metadata.mjs';
import { selectAffectedSmokeSuites } from './lib/smoke-affected.mjs';

const root = new URL('../', import.meta.url);
const run = spawnSync(process.execPath, ['tests/smoke.mjs', '--list'], { cwd: root, encoding: 'utf8' });
assert.equal(run.status, 0, run.stderr);
const catalog = run.stdout.trim().split('\n').map(line => ({ name: line.split(' - ')[0], ...metadataForSmokeSuite(line.split(' - ')[0]) }));
const costs = JSON.parse(await readFile(new URL('./fixtures/smoke-suite-costs.json', import.meta.url)));
assert.deepEqual(catalog.map(s => s.name).sort(), Object.keys(costs).sort());
for (const kind of ['smoke', 'static']) {
  const entry = await readFile(new URL(kind === 'smoke' ? './smoke.mjs' : './static-checks.mjs', import.meta.url), 'utf8');
  const modules = (await readdir(new URL(`./${kind}/`, import.meta.url))).filter(file => file.endsWith('.mjs'));
  for (const file of modules) {
    const relative = `tests/${kind}/${file}`;
    assert.ok(entry.includes(`from './${kind}/${file}'`), `${relative}: must be imported by the executable entry`);
    const source = await readFile(new URL(`./${kind}/${file}`, import.meta.url), 'utf8');
    const factory = source.match(/export function (\w+)\(/)?.[1];
    assert.ok(factory && entry.includes(`= ${factory}({`), `${relative}: must initialize its executable checks`);
    if (kind === 'smoke') {
      const rule = SMOKE_MODULE_RULES.find(rule => rule.files.includes(relative));
      assert.ok(rule, `${relative}: missing affected-suite owner`);
      const selected = selectAffectedSmokeSuites(catalog, [relative]);
      assert.equal(selected.mode, 'affected', `${relative}: use bounded ownership`);
      assert.deepEqual(selected.suites.map(s => s.name), catalog.filter(s => rule.suites.test(s.name)).map(s => s.name));
      assert.ok(selected.suites.length > 0);
    }
  }
}
const temporary = await mkdtemp(path.join(tmpdir(), 'tezos-test-source-'));
try {
  await mkdir(path.join(temporary, 'smoke'));
  const entry = pathToFileURL(path.join(temporary, 'smoke.mjs'));
  await writeFile(entry, "import { createOwned } from './smoke/owned.mjs';\n");
  await writeFile(path.join(temporary, 'smoke/owned.mjs'), 'export function createOwned() { /* reachable assertion */ }');
  await writeFile(path.join(temporary, 'smoke/orphan.mjs'), '/* orphan assertion */');
  const source = await readSmokeTestSource(entry);
  assert.ok(source.includes('reachable assertion'));
  assert.ok(!source.includes('orphan assertion'), 'unimported files must not count as regression coverage');
  await rm(path.join(temporary, 'smoke/owned.mjs'));
  await assert.rejects(readSmokeTestSource(entry), /ENOENT/, 'missing executable coverage must fail closed');
} finally { await rm(temporary, { recursive: true, force: true }); }
console.log(`ok - feature module wiring, unchanged catalog/cost ownership, and fail-closed test source discovery (${catalog.length} suites)`);
