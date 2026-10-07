#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { planActionsRecovery, GENERATED_WORKFLOW } from './lib/actions-recovery.mjs';
import { readHistoryFreshness } from './lib/history-freshness.mjs';
import { dispatchRecoveryWorkflow, retryGitHubRead } from './lib/github-recovery-transport.mjs';

const gh = args => execFileSync('gh', args, { encoding: 'utf8', timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });

export async function superviseActions({ apply = false, repository = process.env.GITHUB_REPOSITORY || 'Primate411/tezos.systems',
  command = gh, readHistory = readHistoryFreshness, sleep, clock = Date.now } = {}) {
  const now = clock();
  const api = endpoint => retryGitHubRead(() => JSON.parse(command(['api', endpoint])), { sleep });
  const runs = [];
  // Date-filtered Actions searches have omitted recent runs. Inventory pages
  // directly and refuse to dispatch if the bounded inventory is incomplete.
  for (let page = 1; ; page++) {
    if (page > 10) throw new Error('Actions inventory exceeded the ten-page safety bound');
    const batch = (await api(`repos/${repository}/actions/runs?per_page=100&page=${page}`)).workflow_runs;
    runs.push(...batch);
    if (batch.length < 100 || batch.every(run => now - Date.parse(run.created_at) > 24 * 3_600_000)) break;
  }
  const reports = {};
  const reportErrors = [];
  const candidates = runs.filter(run => run.path === `.github/workflows/${GENERATED_WORKFLOW}`
    && run.head_branch === 'main' && run.head_repository?.full_name === repository
    && ['schedule', 'workflow_dispatch'].includes(run.event) && run.conclusion === 'failure'
    && now - Date.parse(run.created_at) < 8 * 3_600_000);
  for (const run of candidates) {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'actions-recovery-'));
    try {
      const jobs = (await api(`repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`)).jobs;
      if (!jobs.some(job => job.steps.some(step => step.name === 'Audit complete site contracts' && step.conclusion === 'success'))) {
        throw new Error('Full site validation did not pass; automated source recovery refused');
      }
      command(['run', 'download', String(run.id), '--repo', repository, '--name', 'generated-refresh-report', '--dir', temporary]);
      const file = path.join(temporary, 'generated-refresh-report.json');
      if ((await fs.stat(file)).size > 2 * 1024 * 1024) throw new Error('Oversized recovery report');
      reports[run.id] = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      reportErrors.push(`Run ${run.id}: ${error.message}`);
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
  const history = await readHistory();
  const plan = planActionsRecovery({ runs, reports, history, now, repository });
  plan.history = history;
  plan.notes.push(...reportErrors);
  plan.mode = apply ? 'apply' : 'read-only';
  const dispatchErrors = [];
  for (const action of plan.actions) {
    if (!apply) continue;
    try {
      if ((await api(`repos/${repository}/actions/workflows/${action.workflow}`)).state !== 'active') {
        action.result = 'Workflow disabled; preserved operator setting';
        continue;
      }
      const args = ['workflow', 'run', action.workflow, '--repo', repository, '--ref', 'main'];
      for (const [key, value] of Object.entries(action.inputs)) args.push('-f', `${key}=${value}`);
      Object.assign(action, await dispatchRecoveryWorkflow({
        action, repository, knownRunIds: new Set(runs.map(run => String(run.id))),
        dispatch: () => command(args), sleep, now: clock,
        listRuns: async () => (await api(`repos/${repository}/actions/workflows/${action.workflow}/runs?branch=main&event=workflow_dispatch&per_page=100`)).workflow_runs
      }));
    } catch (error) {
      action.result = 'failed';
      action.error = error.message;
      dispatchErrors.push(error);
    }
  }
  if (process.env.ACTIONS_RECOVERY_REPORT) await fs.writeFile(process.env.ACTIONS_RECOVERY_REPORT, `${JSON.stringify(plan, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `### Actions recovery (${plan.mode})\n\n${plan.actions.map(a => `- ${a.reason}: ${a.result || 'would dispatch'}`).concat(plan.notes.map(n => `- ${n}`)).join('\n') || 'No recovery due.'}\n`);
  }
  if (dispatchErrors.length) throw new AggregateError(dispatchErrors, `${dispatchErrors.length} recovery dispatch(es) failed after bounded confirmation; see the recovery report`);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await superviseActions({ apply: process.argv.includes('--apply') }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
