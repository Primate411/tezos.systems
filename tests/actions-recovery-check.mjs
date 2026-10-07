import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planActionsRecovery, temporaryFailedLanes, GENERATED_WORKFLOW, HISTORY_WORKFLOW } from '../scripts/lib/actions-recovery.mjs';
import { isRecentCompleteRefresh, onlyGeneratedChanges, checkCadence } from '../scripts/check-generated-refresh-cadence.mjs';
import { selectScheduledRefreshLanes } from '../scripts/lib/scheduled-refresh-lanes.mjs';
import { readHistoryFreshness } from '../scripts/lib/history-freshness.mjs';

const now = Date.parse('2026-10-06T20:00:00Z');
const ago = hours => new Date(now - hours * 3_600_000).toISOString();
const repository = 'Primate411/tezos.systems';
const run = (id, options = {}) => ({ id, path: `.github/workflows/${GENERATED_WORKFLOW}`, head_branch: 'main',
  head_repository: { full_name: repository }, event: 'schedule', status: 'completed', conclusion: 'failure',
  created_at: ago(2), updated_at: ago(1), display_title: 'Refresh generated data (all)', ...options });
const report = (options = {}) => ({ schemaVersion: 1, fatal: null,
  summary: { total: 1, attempted: 1, failed: 1, succeeded: 0, skipped: 0 },
  lanes: [{ id: 'maxis-season', status: 'failed', transient: true, attempts: [{ transient: true }], ...options }] });
const plan = (runs, reports = { 100: report() }, history = []) => planActionsRecovery({ runs, reports, history, now, repository });
const root = run(100);
assert.deepEqual(plan([root]).actions[0].inputs, { lanes: 'maxis-season', recovery_of: '100', recovery_attempt: '1' });
assert.equal(plan([run(100, { updated_at: ago(0.49) })]).actions.length, 0, 'respect first cooldown');
assert.equal(plan([run(100, { conclusion: 'success' })]).actions.length, 0);
assert.equal(plan([run(100, { status: 'in_progress' })]).actions.length, 0);
assert.equal(plan([root, run(101, { status: 'queued', created_at: ago(0.1) })]).actions.length, 0);
for (const bad of [report({ transient: false }), report({ attempts: [{ transient: false }] }), report({ id: 'capital' }),
  report({ attempts: {} }), { ...report(), lanes: [null] },
  { ...report(), fatal: 'out of scope' }, { ...report(), summary: {} }, { ...report(), lanes: [] }, {}, null]) {
  assert.deepEqual(temporaryFailedLanes(bad), []);
  assert.equal(plan([root], { 100: bad }).actions.length, 0, 'unknown/hard/scope/validation failures never retry');
}
const recovery = run(101, { display_title: 'Recover generated data 100 attempt 1', created_at: ago(0.8), updated_at: ago(0.7), event: 'workflow_dispatch' });
assert.equal(plan([root, recovery], { 100: report(), 101: report() }).actions.length, 0, 'second cooldown is one hour');
const retry = plan([root, { ...recovery, updated_at: ago(1) }], { 101: report() });
assert.equal(retry.actions[0].inputs.recovery_attempt, '2');
assert.equal(plan([root, { ...recovery, display_title: 'Recover generated data 100 attempt 2' }], { 101: report() }).actions.length, 0, 'no runaway third attempt');
assert.equal(plan([root, { ...recovery, conclusion: 'success' }]).actions.length, 0, 'successful recovery stops');
assert.equal(plan([root, recovery, run(102, { created_at: ago(0.1), conclusion: 'success' })]).actions.length, 0, 'new full run supersedes an old incident');
assert.deepEqual(plan([run(100, { created_at: ago(8) })]).actions[0].inputs, {}, 'missed full schedule catches up');
assert.equal(plan([root, run(200, { event: 'pull_request', created_at: ago(0.1) })]).actions[0].inputs.recovery_of, '100');
assert.equal(plan([root, run(200, { head_repository: { full_name: 'fork/repo' }, created_at: ago(0.1) })]).actions[0].inputs.recovery_of, '100');
const healthyRoot = run(100, { conclusion: 'success' });
const history = [{ table: 'market_history', timestamp: ago(2) }];
assert.equal(plan([healthyRoot], {}, history).actions[0].workflow, HISTORY_WORKFLOW);
assert.equal(plan([healthyRoot], {}, [{ table: 'bad', timestamp: null }]).actions.length, 0);
const collector = run(110, { path: `.github/workflows/${HISTORY_WORKFLOW}`, created_at: ago(0.2), updated_at: ago(0.1) });
assert.equal(plan([healthyRoot, collector], {}, history).actions.length, 0, 'prevent repeated failed history dispatches');
assert.equal(plan([healthyRoot, { ...collector, status: 'queued' }], {}, history).actions.length, 0);
assert.deepEqual(selectScheduledRefreshLanes('maxis-season').map(lane => lane.id), ['maxis-season']);
for (const value of ['unknown', 'maxis-season,maxis-season', '../secrets', 'maxis-season,']) assert.throws(() => selectScheduledRefreshLanes(value));

const receipts = await readHistoryFreshness({ config: { url: 'https://fixture.invalid', key: 'test' }, now,
  fetch: async (url, options) => {
    assert(options.signal, 'each independent source probe must have a deadline');
    if (url.includes('/market_history?')) return Response.json([{ timestamp: ago(6) }]);
    if (url.includes('/network_health_history?')) return new Response('', { status: 503 });
    if (url.includes('/tezosx_history?')) return Response.json([{ timestamp: ago(-1) }]);
    return Response.json([{ timestamp: ago(1) }]);
  }
});
assert.equal(receipts.length, 5, 'one failed probe must not hide the remaining clocks');
assert.equal(receipts.filter(row => row.ok).length, 2);
assert.equal(receipts.find(row => row.table === 'market_history').timestamp, ago(6));
assert.equal(receipts.find(row => row.table === 'tezosx_history').timestamp, null, 'future clocks fail closed');
const workflow = await readFile(new URL('../.github/workflows/actions-recovery.yml', import.meta.url), 'utf8');
assert.match(workflow, /workflows:.*Audit Generated Freshness/, 'the independent audit must wake catch-up even when collector schedules disappear');
assert.match(workflow, /workflows:.*Nightly Smoke Canary/, 'long-running canaries provide another delivery checkpoint');
assert.equal(plan([healthyRoot], { 100: { lanes: [null] } }, history).actions[0].workflow, HISTORY_WORKFLOW);
console.log('ok - recovery cooldowns, caps, trusted runs, missed schedules, source selection and independent history clocks');

const complete = { schemaVersion: 1, fatal: null, startedAt: ago(0.8), completedAt: ago(0.5),
  summary: { total: 16, attempted: 16, succeeded: 16, failed: 0, skipped: 0 },
  lanes: selectScheduledRefreshLanes().map(lane => ({ id: lane.id, status: 'succeeded' })) };
const completeRun = run(999, { conclusion: 'success', created_at: ago(0.9), updated_at: ago(0.4) });
const canCoalesce = (overrides = {}) => isRecentCompleteRefresh({ run: completeRun, report: complete, now, repository, ...overrides });
assert(canCoalesce(), 'a completed full catch-up can absorb an immediately following scheduled scan');
for (const patch of [
  { startedAt: ago(2) }, { startedAt: 'bad' }, { completedAt: ago(-1) },
  { startedAt: ago(0.1) }, { completedAt: ago(0.3) }, { fatal: 'scope error' },
  { summary: { ...complete.summary, failed: 1 } },
  { lanes: complete.lanes.slice(1) }, { lanes: complete.lanes.map(() => complete.lanes[0]) },
  { lanes: complete.lanes.map((lane, i) => i ? lane : { ...lane, status: 'failed' }) }
]) assert.equal(canCoalesce({ report: { ...complete, ...patch } }), false);
for (const patch of [{ conclusion: 'failure' }, { status: 'in_progress' }, { event: 'pull_request' },
  { head_branch: 'other' }, { head_repository: { full_name: 'fork/repo' } }]) {
  assert.equal(canCoalesce({ run: { ...completeRun, ...patch } }), false);
}
assert(onlyGeneratedChanges(['data/maxis-leaders.json', 'data/maxis/seasons/season/summary.json', 'version.json']));
for (const file of ['scripts/refresh-maxis-data.mjs', 'tests/maxis-check.mjs', 'package-lock.json', 'data/maxis/seasons-other/file.json']) {
  assert.equal(onlyGeneratedChanges([file]), false, 'source changes require a new full scan');
}
assert.equal((await checkCadence({ event: 'workflow_dispatch' })).skip, false, 'manual and recovery dispatches never coalesce');
console.log('ok - redundant schedule guard requires fresh full success and unchanged source code');
