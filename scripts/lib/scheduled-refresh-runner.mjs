import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

function errorText(error) {
  return String(error?.message || error || 'Unknown refresh failure').replace(/\s+/g, ' ').trim();
}

export function assertSafeTarget(target) {
  const normalized = String(target || '').replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized === '.' || normalized.includes('\0')) {
    throw new Error(`Unsafe scheduled-refresh target: ${target}`);
  }
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe scheduled-refresh target: ${target}`);
  }
  return normalized;
}

export function pathMatchesTarget(file, target) {
  const normalizedFile = String(file || '').replaceAll('\\', '/').replace(/^\.\//, '');
  const normalizedTarget = assertSafeTarget(target);
  return normalizedFile === normalizedTarget || normalizedFile.startsWith(`${normalizedTarget}/`);
}

export function validateLaneDefinitions(lanes) {
  const ids = new Set();
  const targets = [];
  for (const lane of lanes) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lane.id || '')) throw new Error(`Invalid scheduled-refresh lane id: ${lane.id}`);
    if (ids.has(lane.id)) throw new Error(`Duplicate scheduled-refresh lane id: ${lane.id}`);
    ids.add(lane.id);
    if (!Array.isArray(lane.targets) || !lane.targets.length) throw new Error(`${lane.id} has no declared targets`);
    const sharedTargets = new Set((lane.sharedTargets || []).map(assertSafeTarget));
    if ([...sharedTargets].some(target => !lane.targets.includes(target))) {
      throw new Error(`${lane.id} shared targets must also be declared targets`);
    }
    for (const target of lane.targets) {
      const normalized = assertSafeTarget(target);
      const overlap = targets.find((existing) =>
        (pathMatchesTarget(normalized, existing.target) || pathMatchesTarget(existing.target, normalized))
        && !(existing.lane !== lane.id && existing.target === normalized && existing.shared && sharedTargets.has(normalized)));
      if (overlap) {
        throw new Error(`${lane.id} target ${normalized} overlaps ${overlap.lane} target ${overlap.target}`);
      }
      targets.push({ lane: lane.id, target: normalized, shared: sharedTargets.has(normalized) });
    }
    for (const step of [...(lane.refresh || []), ...(lane.validate || [])]) {
      if (!/^(?:scripts|tests)\/[a-z0-9/_-]+\.m?js$/i.test(step?.script || '')) throw new Error(`${lane.id} has an unsafe script path`);
      if (!Array.isArray(step.args) || step.args.some((arg) => typeof arg !== 'string')) throw new Error(`${lane.id} has invalid script arguments`);
      if (step.attempts != null && (!Number.isInteger(step.attempts) || step.attempts < 1 || step.attempts > 5)) {
        throw new Error(`${lane.id} has invalid step attempts`);
      }
      for (const field of ['retryBaseMs', 'retryCapMs']) {
        if (step[field] != null && (!Number.isInteger(step[field]) || step[field] < 0 || step[field] > 300_000)) {
          throw new Error(`${lane.id} has invalid ${field}`);
        }
      }
      if ((step.retryBaseMs != null || step.retryCapMs != null) && (!step.attempts || step.attempts < 2)) {
        throw new Error(`${lane.id} retry timing requires multiple attempts`);
      }
    }
  }
  return true;
}

async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function copyExact(source, destination, { allowMissing = false } = {}) {
  const sourceExists = await exists(source);
  if (!sourceExists && !allowMissing) throw new Error(`Successful scheduled-refresh target is missing: ${source}`);
  await fs.rm(destination, { recursive: true, force: true });
  if (!sourceExists) return;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true, preserveTimestamps: true });
}

async function snapshotTargets(root, backupRoot, targets) {
  for (const target of targets) {
    const source = path.join(root, target);
    if (!(await exists(source))) continue;
    const destination = path.join(backupRoot, target);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: true, preserveTimestamps: true });
  }
}

async function restoreTargets(root, backupRoot, targets) {
  for (const target of targets) await copyExact(path.join(backupRoot, target), path.join(root, target), { allowMissing: true });
}

async function executeNodeStepAttempt(step, { cwd, env, forwardOutput }) {
  await new Promise((resolve, reject) => {
    let stdoutTail = '';
    let stderrTail = '';
    const retainTail = (current, chunk) => `${current}${chunk}`.slice(-4_000);
    const child = spawn(process.execPath, [step.script, ...step.args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutTail = retainTail(stdoutTail, text);
      if (forwardOutput) process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrTail = retainTail(stderrTail, text);
      if (forwardOutput) process.stderr.write(text);
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else {
        const detail = (stderrTail || stdoutTail).trim().replace(/\s+/g, ' ').slice(-1_500);
        reject(new Error(`${step.script} ${step.args.join(' ')} failed (${signal ? `signal ${signal}` : `exit ${code}`})${detail ? `: ${detail}` : ''}`));
      }
    });
  });
}

export async function executeNodeStep(step, {
  cwd,
  env = process.env,
  forwardOutput = true,
  waitForRetry = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) {
  const attempts = step.attempts || 1;
  const retryBaseMs = step.retryBaseMs || 0;
  const retryCapMs = step.retryCapMs ?? retryBaseMs;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await executeNodeStepAttempt(step, { cwd, env, forwardOutput });
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      const delay = Math.min(retryCapMs, retryBaseMs * (2 ** (attempt - 1)));
      process.stderr.write(`Scheduled refresh step ${step.script} failed; retrying in ${Math.round(delay / 1000)}s (${attempt}/${attempts})\n`);
      await waitForRetry(delay);
    }
  }
}

export async function runRefreshLanes({
  lanes,
  workspaceRoot,
  publishRoot,
  backupRoot,
  executeStep = executeNodeStep,
  listChangedPaths = async () => [],
  now = () => new Date()
}) {
  validateLaneDefinitions(lanes);
  const startedAt = now();
  const results = [];
  const successfulTargets = [];
  let fatal = null;

  for (const lane of lanes) {
    const laneStartedAt = now();
    const laneBackup = path.join(backupRoot, lane.id);
    await snapshotTargets(workspaceRoot, laneBackup, lane.targets);
    process.stdout.write(`\n=== ${lane.label || lane.id} (${lane.id}) ===\n`);
    try {
      for (const step of lane.refresh || []) await executeStep(step, { cwd: workspaceRoot });
      for (const step of lane.validate || []) await executeStep(step, { cwd: workspaceRoot });
      const allowedTargets = [...successfulTargets, ...lane.targets];
      const unexpected = (await listChangedPaths(workspaceRoot)).filter((file) => !allowedTargets.some((target) => pathMatchesTarget(file, target)));
      if (unexpected.length) {
        fatal = `${lane.id} changed undeclared paths: ${unexpected.join(', ')}`;
        throw new Error(fatal);
      }
      successfulTargets.push(...lane.targets);
      results.push({
        id: lane.id,
        label: lane.label || lane.id,
        status: 'succeeded',
        durationMs: Math.max(0, now() - laneStartedAt),
        error: null
      });
    } catch (error) {
      try {
        const allowedTargets = [...successfulTargets, ...lane.targets];
        const unexpected = (await listChangedPaths(workspaceRoot)).filter((file) => !allowedTargets.some((target) => pathMatchesTarget(file, target)));
        if (unexpected.length) fatal = `${lane.id} changed undeclared paths: ${unexpected.join(', ')}`;
      } catch (scopeError) {
        fatal = `${lane.id} write-scope audit failed: ${errorText(scopeError)}`;
      }
      await restoreTargets(workspaceRoot, laneBackup, lane.targets);
      results.push({
        id: lane.id,
        label: lane.label || lane.id,
        status: fatal ? 'fatal' : 'failed',
        durationMs: Math.max(0, now() - laneStartedAt),
        error: fatal || errorText(error)
      });
      process.stderr.write(`Scheduled refresh lane ${lane.id} failed: ${fatal || errorText(error)}\n`);
      if (fatal) break;
    }
  }

  if (!fatal) {
    for (const target of new Set(successfulTargets)) {
      await copyExact(path.join(workspaceRoot, target), path.join(publishRoot, target));
    }
  }

  const succeeded = results.filter((result) => result.status === 'succeeded').length;
  const failed = results.length - succeeded;
  return {
    schemaVersion: 1,
    startedAt: startedAt.toISOString(),
    completedAt: now().toISOString(),
    summary: {
      total: lanes.length,
      attempted: results.length,
      succeeded,
      failed,
      skipped: lanes.length - results.length
    },
    fatal,
    lanes: results
  };
}
