#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCHEDULED_REFRESH_LANES, scheduledRefreshTargets } from '../scripts/lib/scheduled-refresh-lanes.mjs';
import { assertSafeTarget, executeNodeStep, pathMatchesTarget, runRefreshLanes, validateLaneDefinitions } from '../scripts/lib/scheduled-refresh-runner.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scheduled-refresh-test-'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.join(temporary, 'workspace');
const publish = path.join(temporary, 'publish');
const backups = path.join(temporary, 'backups');

try {
  await fs.mkdir(workspace, { recursive: true });
  await fs.mkdir(publish, { recursive: true });

  assert.equal(validateLaneDefinitions(SCHEDULED_REFRESH_LANES), true);
  const ids = new Set(SCHEDULED_REFRESH_LANES.map((lane) => lane.id));
  for (const required of ['governance', 'maxis-season', 'capital', 'minerals', 'uranium', 'metals', 'ecosystem', 'whales']) {
    assert(ids.has(required), `scheduled refresh is missing the ${required} lane`);
  }
  for (const [id, projection, generator] of [
    ['governance', 'data/baker-governance-signals.json', 'scripts/generate-baker-governance-signals.mjs'],
    ['maxis-careers', 'data/baker-governance-signals.json', 'scripts/generate-baker-governance-signals.mjs'],
    ['maxis-l2-governance', 'data/maxis/entry-summary.json', 'scripts/generate-maxis-entry-summary.mjs'],
    ['maxis-season', 'data/maxis/entry-summary.json', 'scripts/generate-maxis-entry-summary.mjs'],
    ['capital', 'data/capital-entry-summary.json', 'scripts/generate-capital-entry-summary.mjs'],
    ['ecosystem', 'data/ecosystem-entry-summary.json', 'scripts/generate-ecosystem-entry-summary.mjs']
  ]) {
    const lane = SCHEDULED_REFRESH_LANES.find(lane => lane.id === id);
    assert(lane.targets.includes(projection), `${id} must roll back its source and preview together`);
    assert(lane.refresh.some(step => step.script === generator), `${id} must rebuild its preview`);
    assert(lane.validate.some(step => step.script === generator && step.args.includes('--check')), `${id} must validate the source/preview pair`);
  }
  assert(!ids.has('launcher-projections'), 'one failed preview must not roll back unrelated previews after their sources publish');
  const productionTargets = scheduledRefreshTargets();
  for (const required of ['data/ecosystem-stats.json', 'data/ecosystem-entry-summary.json', 'data/whale-watch.json', 'data/maxis-leaders.json']) {
    assert(productionTargets.includes(required), `scheduled target inventory is missing ${required}`);
  }
  const maxisSeasonRefresh = SCHEDULED_REFRESH_LANES.find((lane) => lane.id === 'maxis-season')?.refresh?.[0];
  assert.deepEqual(
    { attempts: maxisSeasonRefresh?.attempts, retryBaseMs: maxisSeasonRefresh?.retryBaseMs, retryCapMs: maxisSeasonRefresh?.retryCapMs },
    { attempts: 3, retryBaseMs: 60_000, retryCapMs: 120_000 },
    'scheduled Maxis refresh must retry a transient source failure outside the frozen evaluator implementation'
  );
  assert.equal(pathMatchesTarget('data/maxis/seasons/example/summary.json', 'data/maxis/seasons'), true);
  assert.equal(pathMatchesTarget('data/maxis-season.json', 'data/maxis/seasons'), false);
  assert.throws(() => assertSafeTarget('../outside'), /Unsafe/);
  assert.throws(() => validateLaneDefinitions([
    { id: 'one', targets: ['data/shared'], refresh: [], validate: [] },
    { id: 'two', targets: ['data/shared/file.json'], refresh: [], validate: [] }
  ]), /overlaps/);
  assert.throws(() => validateLaneDefinitions([
    { id: 'bad-retry', targets: ['data/retry.json'], refresh: [{ script: 'scripts/retry.mjs', args: [], attempts: 1, retryBaseMs: 1_000 }], validate: [] }
  ]), /retry timing requires multiple attempts/);

  const write = async (root, relative, value) => {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.writeFile(path.join(root, relative), value);
  };
  const read = (root, relative) => fs.readFile(path.join(root, relative), 'utf8');
  for (const relative of ['data/one.json', 'data/two.json', 'data/three.json', 'data/four.json']) {
    await write(workspace, relative, `old:${relative}`);
    await write(publish, relative, `old:${relative}`);
  }

  const fixtureLanes = [
    { id: 'one', targets: ['data/one.json'], refresh: [{ script: 'scripts/fixture.mjs', args: ['write', 'data/one.json', 'new-one'] }], validate: [] },
    { id: 'two', targets: ['data/two.json'], refresh: [{ script: 'scripts/fixture.mjs', args: ['fail', 'data/two.json', 'broken-two'] }], validate: [] },
    { id: 'three', targets: ['data/three.json'], refresh: [{ script: 'scripts/fixture.mjs', args: ['write', 'data/three.json', 'new-three'] }], validate: [{ script: 'scripts/fixture.mjs', args: ['fail-check'] }] },
    { id: 'four', targets: ['data/four.json'], refresh: [{ script: 'scripts/fixture.mjs', args: ['write', 'data/four.json', 'new-four'] }], validate: [] }
  ];
  const executeStep = async (step, { cwd }) => {
    const [action, relative, value] = step.args;
    if (relative) await write(cwd, relative, value || action);
    if (action.startsWith('fail')) throw new Error(`injected ${action}`);
  };
  const report = await runRefreshLanes({
    lanes: fixtureLanes,
    workspaceRoot: workspace,
    publishRoot: publish,
    backupRoot: backups,
    executeStep
  });
  assert.deepEqual(report.summary, { total: 4, attempted: 4, succeeded: 2, failed: 2, skipped: 0 });
  assert.equal(await read(publish, 'data/one.json'), 'new-one');
  assert.equal(await read(publish, 'data/two.json'), 'old:data/two.json');
  assert.equal(await read(publish, 'data/three.json'), 'old:data/three.json');
  assert.equal(await read(publish, 'data/four.json'), 'new-four');
  assert.equal(await read(workspace, 'data/two.json'), 'old:data/two.json', 'failed refresh must restore last-good workspace data');
  assert.equal(await read(workspace, 'data/three.json'), 'old:data/three.json', 'failed validation must restore last-good workspace data');

  // Reproduce a preview-size/validation failure after its source and transport
  // changed, and a shared-preview failure after another owner already succeeded.
  for (const failedOwner of ['first', 'second']) {
    const atomicWorkspace = path.join(temporary, `atomic-${failedOwner}`);
    const atomicPublish = path.join(temporary, `published-${failedOwner}`);
    const initial = {
      'data/first.json': 'old-first', 'data/second.json': 'old-second',
      'data/shared-preview.json': 'old-first+old-second',
      'data/ecosystem.json': 'old-ecosystem', 'data/ecosystem-transport.json': 'old-transport',
      'data/ecosystem-preview.json': 'old-preview', 'data/capital.json': 'old-capital',
      'data/capital-preview.json': 'old-capital-preview'
    };
    for (const [file, value] of Object.entries(initial)) {
      await write(atomicWorkspace, file, value); await write(atomicPublish, file, value);
    }
    const sharedLanes = ['first', 'second'].map(id => ({
      id, targets: [`data/${id}.json`, 'data/shared-preview.json'], sharedTargets: ['data/shared-preview.json'],
      refresh: [{ script: 'scripts/fixture.mjs', args: ['shared', id] }],
      validate: id === failedOwner ? [{ script: 'scripts/fixture.mjs', args: ['fail-check'] }] : []
    }));
    assert.throws(() => validateLaneDefinitions([
      sharedLanes[0], { ...sharedLanes[1], sharedTargets: [] }
    ]), /overlaps/, 'every owner must explicitly declare an exact shared preview');
    assert.throws(() => validateLaneDefinitions([
      { ...sharedLanes[0], sharedTargets: ['data/not-owned.json'] }
    ]), /must also be declared/);
    assert.throws(() => validateLaneDefinitions([
      sharedLanes[0], { ...sharedLanes[1], targets: [...sharedLanes[1].targets, 'data/shared-preview.json'] }
    ]), /overlaps/, 'sharing must not permit duplicate targets within a later lane');
    assert.throws(() => validateLaneDefinitions([
      sharedLanes[0], { ...sharedLanes[1], targets: ['data/shared-preview.json/nested.json'], sharedTargets: [] }
    ]), /overlaps/, 'sharing must not permit parent/child overlaps');
    const atomicReport = await runRefreshLanes({
      lanes: [...sharedLanes,
        { id: 'ecosystem', targets: ['data/ecosystem.json', 'data/ecosystem-transport.json', 'data/ecosystem-preview.json'],
          refresh: [{ script: 'scripts/fixture.mjs', args: ['family', 'ecosystem'] }],
          validate: [{ script: 'scripts/fixture.mjs', args: ['fail-check'] }] },
        { id: 'capital', targets: ['data/capital.json', 'data/capital-preview.json'],
          refresh: [{ script: 'scripts/fixture.mjs', args: ['family', 'capital'] }], validate: [] }
      ],
      workspaceRoot: atomicWorkspace, publishRoot: atomicPublish,
      backupRoot: path.join(temporary, `atomic-backup-${failedOwner}`),
      executeStep: async (step, { cwd }) => {
        const [action, id] = step.args;
        if (action === 'fail-check') throw new Error('injected preview validation failure');
        await write(cwd, `data/${id}.json`, `new-${id}`);
        if (action === 'shared') {
          await write(cwd, 'data/shared-preview.json', `${await read(cwd, 'data/first.json')}+${await read(cwd, 'data/second.json')}`);
        } else {
          await write(cwd, `data/${id}-preview.json`, `new-${id}-preview`);
          if (id === 'ecosystem') await write(cwd, 'data/ecosystem-transport.json', 'new-transport');
        }
      }
    });
    assert.equal(atomicReport.summary.failed, 2);
    assert.equal(atomicReport.summary.succeeded, 2);
    for (const file of ['data/ecosystem.json', 'data/ecosystem-transport.json', 'data/ecosystem-preview.json']) {
      assert.equal(await read(atomicPublish, file), initial[file], 'a failed preview preserves the entire source family');
    }
    const expectedFirst = failedOwner === 'first' ? 'old-first' : 'new-first';
    const expectedSecond = failedOwner === 'second' ? 'old-second' : 'new-second';
    for (const dir of [atomicWorkspace, atomicPublish]) {
      assert.equal(await read(dir, 'data/first.json'), expectedFirst);
      assert.equal(await read(dir, 'data/second.json'), expectedSecond);
      assert.equal(await read(dir, 'data/shared-preview.json'), `${expectedFirst}+${expectedSecond}`,
        'shared previews must match successful and restored sources regardless of failure order');
      assert.equal(await read(dir, 'data/capital.json'), 'new-capital');
      assert.equal(await read(dir, 'data/capital-preview.json'), 'new-capital-preview', 'unrelated matching families still publish');
    }
  }

  const retryScript = path.join(temporary, 'retry-step.mjs');
  const retryCounter = path.join(temporary, 'retry-count.txt');
  await fs.writeFile(retryScript, `
    import fs from 'node:fs';
    const file = process.argv[2];
    const count = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) + 1 : 1;
    fs.writeFileSync(file, String(count));
    if (count < 3) process.exit(1);
  `);
  const retryDelays = [];
  await executeNodeStep({
    script: retryScript,
    args: [retryCounter],
    attempts: 3,
    retryBaseMs: 7,
    retryCapMs: 10
  }, {
    cwd: root,
    forwardOutput: false,
    waitForRetry: async (milliseconds) => retryDelays.push(milliseconds)
  });
  assert.deepEqual(retryDelays, [7, 10], 'scheduled step retries must use bounded exponential backoff');
  assert.equal(await fs.readFile(retryCounter, 'utf8'), '3', 'scheduled step retries must stop after the first success');

  const fatalWorkspace = path.join(temporary, 'fatal-workspace');
  const fatalPublish = path.join(temporary, 'fatal-publish');
  await write(fatalWorkspace, 'data/declared.json', 'old');
  await write(fatalPublish, 'data/declared.json', 'old');
  const fatalReport = await runRefreshLanes({
    lanes: [{ id: 'scope', targets: ['data/declared.json'], refresh: [{ script: 'scripts/fixture.mjs', args: ['fail', 'data/declared.json', 'broken'] }], validate: [] }],
    workspaceRoot: fatalWorkspace,
    publishRoot: fatalPublish,
    backupRoot: path.join(temporary, 'fatal-backups'),
    executeStep,
    listChangedPaths: async () => ['data/declared.json', 'data/undeclared.json']
  });
  assert.match(fatalReport.fatal, /undeclared paths/);
  assert.equal(await read(fatalPublish, 'data/declared.json'), 'old', 'fatal scope violations must publish nothing');

  const missingWorkspace = path.join(temporary, 'missing-workspace');
  const missingPublish = path.join(temporary, 'missing-publish');
  await write(missingWorkspace, 'data/required.json', 'old');
  await write(missingPublish, 'data/required.json', 'old');
  await assert.rejects(
    runRefreshLanes({
      lanes: [{ id: 'missing', targets: ['data/required.json'], refresh: [{ script: 'scripts/fixture.mjs', args: ['remove', 'data/required.json'] }], validate: [] }],
      workspaceRoot: missingWorkspace,
      publishRoot: missingPublish,
      backupRoot: path.join(temporary, 'missing-backups'),
      executeStep: async (step, { cwd }) => fs.rm(path.join(cwd, step.args[1]), { force: true })
    }),
    /Successful scheduled-refresh target is missing/,
    'a successful lane may not delete a declared publish target'
  );
  assert.equal(await read(missingPublish, 'data/required.json'), 'old', 'missing success targets must not delete the published last-good file');

  const goodReportPath = path.join(temporary, 'good-report.json');
  const badReportPath = path.join(temporary, 'bad-report.json');
  await fs.writeFile(goodReportPath, JSON.stringify({ summary: { succeeded: 2, failed: 0, skipped: 0 }, lanes: [] }));
  await fs.writeFile(badReportPath, JSON.stringify({ summary: { succeeded: 1, failed: 1, skipped: 0 }, lanes: [{ id: 'broken', status: 'failed', error: 'injected' }] }));
  const goodReportCheck = spawnSync(process.execPath, ['scripts/refresh-scheduled-data.mjs', '--check-report', goodReportPath], { cwd: root, encoding: 'utf8' });
  const badReportCheck = spawnSync(process.execPath, ['scripts/refresh-scheduled-data.mjs', '--check-report', badReportPath], { cwd: root, encoding: 'utf8' });
  assert.equal(goodReportCheck.status, 0, goodReportCheck.stderr);
  assert.notEqual(badReportCheck.status, 0, 'failed lane reports must keep the scheduled Action red after partial publication');
  const retiredMonolith = spawnSync(process.execPath, ['scripts/refresh-generated-surfaces.mjs', '--mode', 'scheduled'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(retiredMonolith.status, 0, 'the old all-or-nothing scheduled mode must fail before running generators');
  assert.match(retiredMonolith.stderr, /refresh-scheduled-data\.mjs/);
  await assert.rejects(
    executeNodeStep({ script: 'scripts/refresh-generated-surfaces.mjs', args: ['--mode', 'scheduled'] }, { cwd: root, forwardOutput: false }),
    /Scheduled data must use scripts\/refresh-scheduled-data\.mjs/,
    'lane reports must retain the upstream error detail, not only an exit code'
  );

  console.log('ok - scheduled refresh lanes isolate failures, preserve last-good data, and enforce declared write scope');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
