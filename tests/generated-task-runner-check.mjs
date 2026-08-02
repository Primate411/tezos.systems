#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RETRYABLE_TEMP_FAILURE_EXIT_CODE,
  runGeneratedTask,
  throwIfGeneratedTaskFailures
} from '../scripts/lib/generated-task-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const silentLogger = { warn() {}, error() {} };

function commandError(exitCode, message = `exit ${exitCode}`) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

let retryAttempts = 0;
const retryDelays = [];
const retryFailures = [];
const recovered = await runGeneratedTask({
  name: 'maxis',
  execute: () => {
    retryAttempts += 1;
    if (retryAttempts === 1) throw commandError(RETRYABLE_TEMP_FAILURE_EXIT_CODE);
    return 'ready';
  },
  failures: retryFailures,
  maxAttempts: 2,
  retryExitCodes: [RETRYABLE_TEMP_FAILURE_EXIT_CODE],
  retryDelayMs: 30_000,
  wait: async (milliseconds) => retryDelays.push(milliseconds),
  logger: silentLogger
});
assert.equal(recovered.ok, true);
assert.equal(recovered.value, 'ready');
assert.equal(recovered.attempts, 2);
assert.equal(retryAttempts, 2);
assert.deepEqual(retryDelays, [30_000]);
assert.deepEqual(retryFailures, []);

let terminalAttempts = 0;
const terminalFailures = [];
const terminal = await runGeneratedTask({
  name: 'capital',
  execute: () => {
    terminalAttempts += 1;
    throw commandError(1, 'terminal schema failure');
  },
  failures: terminalFailures,
  maxAttempts: 2,
  retryExitCodes: [RETRYABLE_TEMP_FAILURE_EXIT_CODE],
  wait: async () => assert.fail('terminal failures must not wait or retry'),
  logger: silentLogger
});
assert.equal(terminal.ok, false);
assert.equal(terminal.attempts, 1);
assert.equal(terminalAttempts, 1);
assert.deepEqual(terminalFailures, [{ name: 'capital', exitCode: 1, message: 'terminal schema failure' }]);

let exhaustedAttempts = 0;
let whaleRuns = 0;
const isolatedFailures = [];
const exhausted = await runGeneratedTask({
  name: 'maxis',
  execute: () => {
    exhaustedAttempts += 1;
    throw commandError(RETRYABLE_TEMP_FAILURE_EXIT_CODE, 'OBJKT database query error');
  },
  failures: isolatedFailures,
  maxAttempts: 2,
  retryExitCodes: [RETRYABLE_TEMP_FAILURE_EXIT_CODE],
  retryDelayMs: 30_000,
  wait: async () => {},
  logger: silentLogger
});
const whale = await runGeneratedTask({
  name: 'whale-watch',
  execute: () => {
    whaleRuns += 1;
    return 'fresh';
  },
  failures: isolatedFailures,
  logger: silentLogger
});
assert.equal(exhausted.ok, false);
assert.equal(exhausted.attempts, 2);
assert.equal(exhaustedAttempts, 2);
assert.equal(whale.ok, true);
assert.equal(whaleRuns, 1);
assert.deepEqual(isolatedFailures, [{
  name: 'maxis',
  exitCode: RETRYABLE_TEMP_FAILURE_EXIT_CODE,
  message: 'OBJKT database query error'
}]);

await assert.rejects(
  runGeneratedTask({
    name: 'precommit-check',
    execute: () => { throw commandError(1, 'fail fast'); },
    logger: silentLogger
  }),
  (error) => error.exitCode === 1 && error.message === 'fail fast'
);
assert.throws(
  () => throwIfGeneratedTaskFailures(isolatedFailures),
  (error) => error.failures === isolatedFailures && /maxis \(exit 75\)/.test(error.message)
);
assert.doesNotThrow(() => throwIfGeneratedTaskFailures([]));

const [orchestrator, maxisGenerator, workflow] = await Promise.all([
  fs.readFile(path.join(ROOT, 'scripts/refresh-generated-surfaces.mjs'), 'utf8'),
  fs.readFile(path.join(ROOT, 'scripts/refresh-maxis-data.mjs'), 'utf8'),
  fs.readFile(path.join(ROOT, '.github/workflows/refresh-governance-surfaces.yml'), 'utf8')
]);

assert.match(orchestrator, /const scheduledFailures = modeName === 'scheduled' \? \[\] : null/);
assert.match(orchestrator, /maxAttempts:\s*2/);
assert.match(orchestrator, /retryExitCodes:\s*\[RETRYABLE_TEMP_FAILURE_EXIT_CODE\]/);
assert.match(orchestrator, /retryDelayMs:\s*30_000/);
assert.match(orchestrator, /throwIfGeneratedTaskFailures\(scheduledFailures\)/);
assert.match(orchestrator, /const governanceOk = await runTask\('governance',[\s\S]*if \(governanceOk && shouldStage\) stageTargets\(GOVERNANCE_TARGETS\)/);
assert.doesNotMatch(orchestrator, /refresh-governance-data\.mjs', shouldStage \? \['--stage'\]/);
assert.match(orchestrator, /whaleArtifact\?\.balanceExits\?\.complete !== true[\s\S]*name: 'whale-watch-balance-exits'/);
assert.match(maxisGenerator, /error\?\.retryable === true \? RETRYABLE_TEMP_FAILURE_EXIT_CODE : 1/);

assert.match(workflow, /id: refresh_generated\n\s+continue-on-error: true/);
assert.match(workflow, /npm run refresh:generated:scheduled -- --stage/);
assert.match(workflow, /Discard failed-task output before validation[\s\S]*git restore --worktree[\s\S]*git clean -fd/);
assert.match(workflow, /id: validate_generated\n\s+continue-on-error: true/);
assert.match(workflow, /if: steps\.validate_generated\.outcome == 'success'/);
assert.match(workflow, /git diff --cached --quiet/);
assert.doesNotMatch(workflow, /git add -- \$\(node scripts\/refresh-generated-surfaces\.mjs --print-targets\)/);
assert.match(workflow, /if: steps\.refresh_generated\.outcome != 'success' \|\| steps\.validate_generated\.outcome != 'success'/);
assert.match(workflow, /needs: refresh\n\s+if: always\(\) && github\.event_name == 'schedule'/);
assert.match(workflow, /actions: read[\s\S]*issues: write/);
assert.match(workflow, /const FAILURE_THRESHOLD = 3/);
assert.match(workflow, /currentConclusion === 'success'[\s\S]*state: 'closed'/);

console.log('ok - scheduled generated tasks retry temporary Maxis failures once, isolate terminal failures, validate partial output, and alert after three failed runs');
