import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('.github/actions/upload-artifact/action.yml', root), 'utf8');
const blocks = source.split('\n    - name: ').slice(1);
assert.equal(blocks.length, 5, 'three uploads and two bounded backoffs');
const steps = blocks.map(block => ({
  id: block.match(/\n      id: (\w+)/)?.[1],
  condition: block.match(/\n      if: \$\{\{ (.+) \}\}/)?.[1],
  tolerated: block.includes('continue-on-error: true'),
  delay: Number(block.match(/run: sleep (\d+)/)?.[1] || 0),
  block
}));
const uploads = steps.filter(step => step.id);
assert.deepEqual(uploads.map(step => step.id), ['first', 'second', 'third']);
assert.deepEqual(steps.filter(step => step.delay).map(step => step.delay), [20, 60]);
assert.deepEqual(uploads.map(step => step.tolerated), [true, true, false], 'exhausted delivery remains a job failure');
assert.deepEqual(uploads.map(step => step.block.includes('overwrite: true')), [false, true, true], 'only retries replace partial uploads');
for (const { block } of uploads) {
  assert.match(block, /uses: actions\/upload-artifact@v6/);
  for (const name of ['name', 'path', 'if-no-files-found', 'retention-days', 'compression-level', 'include-hidden-files']) {
    assert(block.includes(`${name}: \${{ inputs.${name} }}`), `preserve ${name} on every attempt`);
  }
}

// Exercise the actual workflow expressions with injected storage outcomes.
// The final upload's failure is deliberately not continue-on-error.
function simulate(outcomes, cancelAfter = Infinity) {
  const receipts = Object.fromEntries(uploads.map(step => [step.id, { outcome: 'skipped' }]));
  const called = [];
  const waits = [];
  let failed = false;
  for (const step of steps) {
    assert(step.condition?.includes('!cancelled()'), 'diagnostics run after test failure but stop on cancellation');
    const eligible = new Function('steps', 'cancelled', `return (${step.condition});`)(receipts, () => called.length >= cancelAfter);
    if (!eligible) continue;
    if (step.delay) { waits.push(step.delay); continue; }
    const outcome = outcomes[called.length] || 'failure';
    called.push(step.id);
    receipts[step.id].outcome = outcome;
    if (outcome === 'failure' && !step.tolerated) failed = true;
  }
  return { called, waits, failed };
}
assert.deepEqual(simulate(['success']), { called: ['first'], waits: [], failed: false });
assert.deepEqual(simulate(['failure', 'success']), { called: ['first', 'second'], waits: [20], failed: false });
assert.deepEqual(simulate(['failure', 'failure', 'success']), { called: ['first', 'second', 'third'], waits: [20, 60], failed: false });
assert.deepEqual(simulate(['failure', 'failure', 'failure']), { called: ['first', 'second', 'third'], waits: [20, 60], failed: true });
assert.deepEqual(simulate(['failure'], 1), { called: ['first'], waits: [], failed: false });
assert.deepEqual(simulate([], 0), { called: [], waits: [], failed: false });

let callers = 0;
for (const file of await readdir(new URL('.github/workflows/', root))) {
  if (!file.endsWith('.yml')) continue;
  const workflow = await readFile(new URL(`.github/workflows/${file}`, root), 'utf8');
  assert(!workflow.includes('uses: actions/upload-artifact@'), `${file}: ordinary uploads share the bounded recovery action`);
  for (const match of workflow.matchAll(/uses: \.\/\.github\/actions\/upload-artifact\n([\s\S]*?)(?=\n      - |\n  [a-z]|$)/g)) {
    callers++;
    assert.match(match[1], /\n\s+name: \S+/, `${file}: explicit job-unique name`);
    assert.match(match[1], /\n\s+path: \S+/, `${file}: explicit upload source`);
    assert(!match[1].includes('overwrite:'), 'replacement is controlled only inside failed retries');
  }
}
assert.equal(callers, 9, 'CI, nightly, scheduled-refresh and recovery report uploads are covered');
console.log('ok - artifact uploads recover bounded failures, stop after success/cancellation, and fail on exhaustion');
