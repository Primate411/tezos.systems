#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  acceptableCompletedEcosystemWeeks,
  evaluateGeneratedFreshness,
  expectedCompletedEcosystemWeek
} from '../scripts/lib/generated-freshness.mjs';

function fixtures(now, overrides = {}) {
  const recent = new Date(new Date(now).getTime() - (2 * 60 * 60 * 1000)).toISOString();
  const expectedWeek = expectedCompletedEcosystemWeek(now);
  const base = {
    governance: { generatedAt: recent },
    maxisSeason: { generatedAt: recent },
    maxisManifest: { generatedAt: recent },
    maxisCareers: { generatedAt: recent },
    maxisL2Governance: { generatedAt: recent },
    nakamoto: { updatedAt: recent },
    capital: { generatedAt: recent },
    capitalEntry: { generatedAt: recent },
    minerals: { generatedAt: recent },
    mineralsEntry: { generatedAt: recent },
    uranium: { generatedAt: recent },
    uraniumEntry: { generatedAt: recent },
    metals: { generatedAt: recent },
    metalsEntry: { generatedAt: recent },
    fundingTeztree: { generatedAt: recent },
    fundingTtcrowd: { generatedAt: recent },
    fundingTtcrowdPreview: { generatedAt: recent },
    fundingHacktez: { generatedAt: recent, sourceGeneratedAt: recent },
    fundingTeztreePreview: { generatedAt: recent },
    fundingHacktezPreview: { generatedAt: recent, sourceGeneratedAt: recent },
    ecosystem: { generatedAt: recent, completeWeek: expectedWeek },
    ecosystemEntry: { generatedAt: recent },
    whales: { generatedAt: recent },
    maxisEntry: { generatedAt: recent },
    bakerSignals: { generatedAt: recent },
    releaseRadar: { updatedAt: recent, staleAfterHours: 36, expiresAt: '2026-09-01T00:00:00.000Z' },
    comparison: { lastVerified: '2026-07-15', policy: { maxAgeDays: 45 } },
    milestones: { generatedAt: '2026-08-01T00:00:00.000Z', generatedAtCommitCount: 950, cadence: { days: 14, commits: 100 } },
    tezoscrp: { generated_at: '2026-07-21T00:00:00.000Z' }
  };
  return { ...base, ...overrides };
}

const beforeGrace = '2026-08-03T12:00:00.000Z';
assert.deepEqual(expectedCompletedEcosystemWeek(beforeGrace), {
  weekStart: '2026-07-20T00:00:00.000Z',
  weekEnd: '2026-07-27T00:00:00.000Z'
});
assert.deepEqual(acceptableCompletedEcosystemWeeks(beforeGrace), [
  {
    weekStart: '2026-07-20T00:00:00.000Z',
    weekEnd: '2026-07-27T00:00:00.000Z'
  },
  {
    weekStart: '2026-07-27T00:00:00.000Z',
    weekEnd: '2026-08-03T00:00:00.000Z'
  }
]);
const afterGrace = '2026-08-03T19:00:00.000Z';
assert.deepEqual(expectedCompletedEcosystemWeek(afterGrace), {
  weekStart: '2026-07-27T00:00:00.000Z',
  weekEnd: '2026-08-03T00:00:00.000Z'
});

const healthy = evaluateGeneratedFreshness({ artifacts: fixtures(afterGrace), now: afterGrace, commitCount: 960 });
assert.equal(healthy.ok, true, JSON.stringify(healthy.issues));

const earlyCompletedWeek = evaluateGeneratedFreshness({
  artifacts: fixtures(beforeGrace, {
    ecosystem: {
      generatedAt: '2026-08-03T02:00:00.000Z',
      completeWeek: acceptableCompletedEcosystemWeeks(beforeGrace)[1]
    }
  }),
  now: beforeGrace,
  commitCount: 960
});
assert.equal(earlyCompletedWeek.ok, true, JSON.stringify(earlyCompletedWeek.issues));

const dailyNakamoto = evaluateGeneratedFreshness({
  artifacts: fixtures(afterGrace, { nakamoto: { updatedAt: '2026-08-02T19:00:00.000Z' } }),
  now: afterGrace,
  commitCount: 960
});
assert.equal(dailyNakamoto.issues.some((issue) => issue.id === 'nakamoto'), false);

const staleNakamoto = evaluateGeneratedFreshness({
  artifacts: fixtures(afterGrace, { nakamoto: { updatedAt: '2026-08-02T12:00:00.000Z' } }),
  now: afterGrace,
  commitCount: 960
});
assert(staleNakamoto.issues.some((issue) => issue.id === 'nakamoto' && issue.limitHours === 30));

const staleScheduled = evaluateGeneratedFreshness({
  artifacts: fixtures(afterGrace, { ecosystem: { generatedAt: '2026-08-02T00:00:00.000Z', completeWeek: expectedCompletedEcosystemWeek(afterGrace) } }),
  now: afterGrace,
  commitCount: 960
});
assert(staleScheduled.issues.some((issue) => issue.id === 'ecosystem'));

const wrongWeek = evaluateGeneratedFreshness({
  artifacts: fixtures(afterGrace, { ecosystem: { generatedAt: '2026-08-03T18:00:00.000Z', completeWeek: expectedCompletedEcosystemWeek(beforeGrace) } }),
  now: afterGrace,
  commitCount: 960
});
assert(wrongWeek.issues.some((issue) => issue.id === 'ecosystem-week'));

const staleReview = evaluateGeneratedFreshness({
  artifacts: fixtures(afterGrace, { releaseRadar: { updatedAt: '2026-08-01T00:00:00.000Z', staleAfterHours: 36, expiresAt: '2026-09-01T00:00:00.000Z' } }),
  now: afterGrace,
  commitCount: 960
});
assert(staleReview.issues.some((issue) => issue.id === 'release-radar'));

const milestoneCommits = evaluateGeneratedFreshness({ artifacts: fixtures(afterGrace), now: afterGrace, commitCount: 1050 });
assert(milestoneCommits.issues.some((issue) => issue.id === 'milestones' && issue.overdueByCommits));

const milestoneTime = evaluateGeneratedFreshness({ artifacts: fixtures('2026-08-20T00:00:00.000Z'), now: '2026-08-20T00:00:00.000Z', commitCount: 960 });
assert(milestoneTime.issues.some((issue) => issue.id === 'milestones' && issue.overdueByTime));

console.log('ok - generated freshness contracts cover source-specific age, Monday rollover, manual review, and milestone cadence');

// Exercise the actual workflow reconciler with a recording GitHub client. An
// unrelated successful collector must not close a still-stale generated lane.
const { default: reconcileIncident } = await import('../.github/scripts/reconcile-freshness-incident.js');
const { readFile } = await import('node:fs/promises');
async function reconcile({ incident, generated = 'success', history = 'success', detail = '' } = {}) {
  const calls = [];
  const summary = { addHeading() { return this; }, addLink() { return this; }, addCodeBlock() { return this; }, async write() {} };
  const github = { rest: { issues: {
    async listForRepo() { return { data: incident ? [incident] : [] }; },
    async create(input) { calls.push({ action: 'create', ...input }); },
    async update(input) { calls.push({ action: 'update', ...input }); },
    async createComment() { assert.fail('Incident changes must not post redundant comments'); }
  } } };
  await reconcileIncident({ github, core: { summary, info() {}, warning() {} },
    context: { repo: { owner: 'fixture', repo: 'site' }, sha: 'current-main', runId: 123 },
    env: { GENERATED_OUTCOME: generated, HISTORY_OUTCOME: history, GITHUB_SERVER_URL: 'https://github.com' },
    readLogOverride: () => detail
  });
  return calls;
}
assert.deepEqual(await reconcile(), [], 'healthy data without an incident needs no write');
const [created] = await reconcile({ history: 'failure', detail: 'fail - tezos_history: 345m old' });
assert.equal(created.action, 'create');
assert.match(created.body, /tezos_history: 345m old/);
const incident = { number: 1, state: 'open', body: created.body };
assert.deepEqual(await reconcile({ incident, history: 'failure', detail: 'fail - tezos_history: 350m old' }), [], 'changing age alone must not update or notify');
const [changed] = await reconcile({ incident, generated: 'failure', detail: 'stale - maxis-season: 20h old' });
assert.equal(changed.action, 'update');
assert.match(changed.body, /maxis-season/);
assert.equal(changed.state, undefined, 'healthy history cannot close a generated-data failure');
const [unverified] = await reconcile({ incident, generated: 'skipped' });
assert.notEqual(unverified.state, 'closed', 'a missing or skipped check cannot prove recovery');
const [closed] = await reconcile({ incident });
assert.equal(closed.state, 'closed');
assert.equal(closed.state_reason, 'completed');
assert(closed.body.startsWith(incident.body), 'preserve the incident receipt');
assert.match(closed.body, /Both generated artifacts and historical ledgers passed in https:\/\/github.com\/fixture\/site\/actions\/runs\/123/);
assert.deepEqual(await reconcile({ incident: { ...incident, state: 'closed', body: closed.body } }), []);
const [reopened] = await reconcile({ incident: { ...incident, state: 'closed', body: closed.body }, history: 'failure', detail: 'fail - tezos_history: 310m old' });
assert.equal(reopened.state, 'open');
assert(!reopened.body.includes('## Recovered'), 'a new failure cannot retain the prior recovered state');
const auditWorkflow = await readFile(new URL('../.github/workflows/audit-generated-freshness.yml', import.meta.url), 'utf8');
for (const trigger of ['Refresh Generated Surfaces', 'Collect Tezos Stats']) assert(auditWorkflow.includes(trigger));
for (const boundary of ["conclusion == 'success'", 'head_repository.full_name == github.repository', "head_branch == 'main'", "event == 'schedule'", "event == 'workflow_dispatch'", 'ref: main', 'persist-credentials: false']) assert(auditWorkflow.includes(boundary));
assert.match(auditWorkflow, /require\('\.\/\.github\/scripts\/reconcile-freshness-incident\.js'\)/);
// Recovery-dispatched collectors must prove delivery inside their own run;
// a downstream workflow_run event is not a dependable completion receipt.
assert.match(auditWorkflow, /^  workflow_call:/m);
assert.match(auditWorkflow, /cron: '47 3,9,15,21 \* \* \*'/);
assert(!auditWorkflow.includes('Collect Chamber History'), 'The collector calls the audit directly, without a duplicate completion trigger');
assert(!/^concurrency:/m.test(auditWorkflow), 'Reusable audits must not cancel their caller through workflow-level concurrency');
assert.match(auditWorkflow, /    concurrency:\n      group: tezos-systems-generated-freshness-audit\n      cancel-in-progress: false/);
const collectorWorkflow = await readFile(new URL('../.github/workflows/collect-chamber-history.yml', import.meta.url), 'utf8');
const deliveryAudit = collectorWorkflow.split('  audit-delivery:\n')[1];
assert(deliveryAudit, 'History collection must audit delivered receipts in the same run');
assert.match(deliveryAudit, /needs: \[global-history, collect\]/);
assert.match(deliveryAudit, /uses: \.\/\.github\/workflows\/audit-generated-freshness\.yml/);
assert.match(deliveryAudit, /permissions:\n      contents: read\n      issues: write/);
const deliveryCondition = deliveryAudit.match(/^    if: (.+)$/m)?.[1].replace(/^\$\{\{\s*|\s*\}\}$/g, '');
assert(deliveryCondition);
assert.match(deliveryCondition, /always\(\)/, 'Collector failure must not skip the independent delivery check');
const evaluateDelivery = new Function('always', 'cancelled', 'github', `return (${deliveryCondition});`);
for (const event of ['schedule', 'workflow_dispatch', 'pull_request', 'push']) {
  for (const actor of ['Primate411', 'github-actions[bot]']) {
    for (const repository of ['Primate411/tezos.systems', 'fixture/fork']) {
      for (const ref of ['refs/heads/main', 'refs/heads/feature']) {
        for (const cancelled of [false, true]) {
          assert.equal(evaluateDelivery(() => true, () => cancelled, { event_name: event, actor, repository, ref }),
            !cancelled && repository === 'Primate411/tezos.systems' && ref === 'refs/heads/main' && ['schedule', 'workflow_dispatch'].includes(event),
            `Delivery audit: ${event}, ${actor}, ${repository}, ${ref}, cancelled=${cancelled}`);
        }
      }
    }
  }
}
console.log('ok - scheduled and bot-dispatched history audit both delivered ledgers without relying on downstream events');

// Evaluate the workflow's actual follow-up conditions against the hosted
// cancellation regression. A failed generated check must still allow history
// and incident reconciliation; a cancelled run must stop even during checkout.
for (const name of ['Audit historical ledgers', 'Reconcile one freshness incident']) {
  const block = auditWorkflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  assert(block, `Missing workflow step: ${name}`);
  const condition = block.match(/^        if: (.+)$/m)?.[1].replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  assert(condition, `Missing explicit follow-up condition: ${name}`);
  assert.match(condition, /(?:cancelled|always|failure|success)\(\)/, 'Override the implicit success gate so failed checks remain independent');
  const evaluate = new Function('cancelled', 'always', 'success', 'steps', `return (${condition});`);
  for (const [cancelled, checkout, generated, history, expected] of [
    [true, 'cancelled', 'skipped', 'skipped', false],
    [true, 'success', 'success', 'success', false],
    [false, 'failure', 'skipped', 'skipped', false],
    [false, 'success', 'failure', 'skipped', true],
    [false, 'success', 'success', 'failure', true],
    [false, 'success', 'success', 'success', true]
  ]) {
    assert.equal(evaluate(() => cancelled, () => true,
      () => [checkout, generated, history].every(outcome => outcome === 'success'),
      { checkout: { outcome: checkout }, generated: { outcome: generated }, history: { outcome: history } }),
    expected, `${name}: cancelled=${cancelled}, checkout=${checkout}, generated=${generated}, history=${history}`);
  }
}
console.log('ok - cancelled audits stop while real freshness failures retain independent checks');
console.log('ok - freshness recovery requires both current checks, reuses one issue and records recovery without comments');
