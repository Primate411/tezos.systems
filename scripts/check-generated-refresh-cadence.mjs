#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { GENERATED_WORKFLOW } from './lib/actions-recovery.mjs';
import { SCHEDULED_REFRESH_LANES, scheduledRefreshTargets } from './lib/scheduled-refresh-lanes.mjs';

const WINDOW_MS = 2 * 3_600_000;
export function isRecentCompleteRefresh({ run, report, repository, now = Date.now() }) {
  const started = Date.parse(report?.startedAt);
  const completed = Date.parse(report?.completedAt);
  if (run?.path !== `.github/workflows/${GENERATED_WORKFLOW}` || run.head_branch !== 'main'
      || run.head_repository?.full_name !== repository || !['schedule', 'workflow_dispatch'].includes(run.event)
      || run.status !== 'completed' || run.conclusion !== 'success'
      || report?.schemaVersion !== 1 || report.fatal || !Number.isFinite(started) || !Number.isFinite(completed)
      || !Number.isFinite(Date.parse(run.created_at)) || !Number.isFinite(Date.parse(run.updated_at))
      || started < Date.parse(run.created_at) || completed > Date.parse(run.updated_at)
      || started > completed || completed > now || now - started >= WINDOW_MS) return false;
  const count = SCHEDULED_REFRESH_LANES.length;
  const expected = { total: count, attempted: count, succeeded: count, failed: 0, skipped: 0 };
  return Object.entries(expected).every(([key, value]) => report.summary?.[key] === value)
    && Array.isArray(report.lanes) && report.lanes.length === count
    && new Set(report.lanes.map(lane => lane?.id)).size === count
    && report.lanes.every(lane => lane?.status === 'succeeded'
      && SCHEDULED_REFRESH_LANES.some(item => item.id === lane.id));
}

export function onlyGeneratedChanges(files) {
  const targets = [...scheduledRefreshTargets(), 'version.json'];
  return files.every(file => targets.some(target => file === target || file.startsWith(`${target}/`)));
}

// GitHub schedules can arrive late, immediately after the supervisor has
// completed a catch-up. Coalesce only that redundant scheduled scan. Explicit
// dispatches, failures, code changes and uncertain evidence always run normally.
export async function checkCadence({ event = process.env.GITHUB_EVENT_NAME,
  repository = process.env.GITHUB_REPOSITORY, runId = process.env.GITHUB_RUN_ID } = {}) {
  if (event !== 'schedule') return { skip: false, reason: 'Explicit refresh requested' };
  const exec = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'generated-cadence-'));
  try {
    const runs = JSON.parse(exec('gh', ['api', `repos/${repository}/actions/workflows/${GENERATED_WORKFLOW}/runs?per_page=30`])).workflow_runs;
    const recent = runs.filter(run => String(run.id) !== String(runId) && run.head_branch === 'main')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!recent || recent.conclusion !== 'success' || Date.now() - Date.parse(recent.created_at) >= WINDOW_MS) {
      return { skip: false, reason: 'No recent complete successful refresh' };
    }
    exec('gh', ['run', 'download', String(recent.id), '--repo', repository, '--name', 'generated-refresh-report', '--dir', temporary]);
    const file = path.join(temporary, 'generated-refresh-report.json');
    if ((await fs.stat(file)).size > 2 * 1024 * 1024) throw new Error('Oversized cadence report');
    const report = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!isRecentCompleteRefresh({ run: recent, report, repository })) return { skip: false, reason: 'Prior report does not prove a fresh complete scan' };
    exec('git', ['merge-base', '--is-ancestor', recent.head_sha, 'HEAD']);
    const changed = exec('git', ['diff', '--name-only', recent.head_sha, 'HEAD']).trim().split('\n').filter(Boolean);
    if (!onlyGeneratedChanges(changed)) return { skip: false, reason: 'Source or validation code changed since the prior scan' };
    return { skip: true, reason: `All ${report.lanes.length} families already refreshed successfully in run ${recent.id} within two hours; source code unchanged` };
  } catch (error) {
    return { skip: false, reason: `Cadence evidence unavailable; performing the full refresh: ${error.message.split('\n')[0]}` };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkCadence();
  console.log(result.reason);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `skip=${result.skip}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${result.reason}\n`);
}
