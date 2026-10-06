#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectScheduledRefreshLanes, scheduledRefreshTargets } from './lib/scheduled-refresh-lanes.mjs';
import { runRefreshLanes } from './lib/scheduled-refresh-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name) {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || null : null;
}

function run(command, args, { cwd = ROOT, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
  if (result.status !== 0) {
    const detail = capture ? String(result.stderr || result.stdout || '').trim() : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return capture ? String(result.stdout || '').trim() : '';
}

function git(args, options = {}) {
  return run('git', args, options);
}

function changedPaths(worktree) {
  const tracked = run('git', ['diff', '--name-only', '--relative', 'HEAD'], { cwd: worktree, capture: true });
  const untracked = run('git', ['ls-files', '--others', '--exclude-standard'], { cwd: worktree, capture: true });
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
}

async function writeReport(file, report) {
  if (!file) return;
  const resolved = path.resolve(file);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote scheduled refresh report to ${resolved}`);
}

async function checkReport(file) {
  if (!file) throw new Error('--check-report requires a report path');
  const report = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
  if (report?.fatal || Number(report?.summary?.failed) > 0 || Number(report?.summary?.skipped) > 0) {
    const failed = (report?.lanes || []).filter((lane) => lane.status !== 'succeeded').map((lane) => `${lane.id}: ${lane.error}`).join('; ');
    throw new Error(`Scheduled refresh completed with failures${failed ? `: ${failed}` : ''}`);
  }
  console.log(`All ${report.summary.succeeded} scheduled refresh lanes succeeded`);
}

async function main() {
  if (process.argv.includes('--print-targets')) {
    console.log(scheduledRefreshTargets().join('\n'));
    return;
  }
  if (process.argv.includes('--check-report')) {
    await checkReport(argValue('--check-report'));
    return;
  }

  const dirty = git(['status', '--porcelain', '--untracked-files=all'], { capture: true });
  if (dirty) throw new Error('Scheduled refresh requires a clean checkout so last-good rollback cannot overwrite local work');
  const lanes = selectScheduledRefreshLanes(argValue('--lanes') || process.env.GENERATED_REFRESH_LANES || '');

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tezos-systems-refresh-'));
  const worktree = path.join(temporaryRoot, 'worktree');
  const backups = path.join(temporaryRoot, 'backups');
  const reportPath = argValue('--report') || process.env.GENERATED_REFRESH_REPORT || null;
  let report;
  try {
    git(['worktree', 'add', '--detach', worktree, 'HEAD']);
    report = await runRefreshLanes({
      lanes,
      workspaceRoot: worktree,
      publishRoot: ROOT,
      backupRoot: backups,
      listChangedPaths: changedPaths
    });
    await writeReport(reportPath, report);
  } finally {
    try {
      git(['worktree', 'remove', '--force', worktree]);
    } catch (error) {
      console.warn(`Could not remove scheduled-refresh worktree cleanly: ${error.message}`);
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }

  console.log(`Scheduled refresh: ${report.summary.succeeded}/${report.summary.total} lanes succeeded`);
  if (report.fatal || report.summary.failed || report.summary.skipped) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
