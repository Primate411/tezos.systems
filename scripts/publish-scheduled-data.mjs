#!/usr/bin/env node
// Publish only a fully validated tree. A moving main requires new observations,
// never a blind rebase/overlay of snapshots collected with older source code.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function command(cwd, program, args, { allowFailure = false, inherit = false } = {}) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(`${program} ${args.join(' ')} failed (${result.status}): ${result.stderr || ''}`);
  return { status: result.status, text: (result.stdout || '').trim(), error: (result.stderr || '').trim() };
}
const withinTargets = (file, targets) => [...targets].some(target => file === target || file.startsWith(`${target}/`));
const git = (cwd, ...args) => command(cwd, 'git', args).text;
function changes(cwd) {
  return [...new Set([
    ...git(cwd, 'diff', '--name-only', '-z', 'HEAD').split('\0'),
    ...git(cwd, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')
  ].filter(Boolean))];
}
async function receipt(file) {
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  if (data.schemaVersion !== 1 || data.fatal || !Array.isArray(data.lanes) || !data.lanes.length
      || data.summary?.total !== data.lanes.length
      || !data.lanes.every(lane => ['succeeded', 'failed', 'skipped'].includes(lane.status))) {
    throw new Error('Missing, fatal or incomplete scheduled refresh report; refusing to publish');
  }
  for (const status of ['succeeded', 'failed', 'skipped']) {
    if (data.summary[status] !== data.lanes.filter(lane => lane.status === status).length) {
      throw new Error('Scheduled refresh report totals disagree; refusing to publish');
    }
  }
  return data;
}
const defaults = {
  targets: cwd => command(cwd, 'node', ['scripts/refresh-scheduled-data.mjs', '--print-targets']).text.split('\n'),
  prepare: cwd => command(cwd, 'npm', ['ci'], { inherit: true }),
  refresh: (cwd, report) => command(cwd, 'node', ['scripts/refresh-scheduled-data.mjs', '--report', report], { allowFailure: true, inherit: true }),
  validate: cwd => command(cwd, 'npm', ['run', 'test:static'], { inherit: true }),
  stamp: cwd => command(cwd, 'sh', ['scripts/stamp-version.sh'], { inherit: true }),
  push: cwd => command(cwd, 'git', ['push', 'origin', 'HEAD:refs/heads/main'], { allowFailure: true })
};

export async function publishScheduledData({ root, reportPath, publicationPath, operations = {} }) {
  const ops = { ...defaults, ...operations };
  const base = git(root, 'rev-parse', 'HEAD');
  const initialReport = await receipt(reportPath);
  const publication = { schemaVersion: 1, base, initialRefreshReport: initialReport, attempts: [], published: false };
  const originalChanges = changes(root);
  const targets = new Set(await ops.targets(root));
  if (originalChanges.some(file => !withinTargets(file, targets))) throw new Error('Unexpected checkout changes; refusing to publish');
  let temporary;
  try {
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tezos-systems-publish-'));
    // Three publication attempts; every changed base requires complete recollection.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      git(root, 'fetch', '--no-tags', 'origin', 'refs/heads/main');
      const parent = git(root, 'rev-parse', 'FETCH_HEAD');
      if (command(root, 'git', ['merge-base', '--is-ancestor', base, parent], { allowFailure: true }).status !== 0) {
        throw new Error('Remote main no longer descends from the scan base; refusing to publish');
      }
      const workspace = path.join(temporary, `attempt-${attempt}`);
      const recollect = parent !== base;
      const entry = { attempt, parent, recollect, refreshReport: initialReport };
      publication.attempts.push(entry);
      git(root, 'worktree', 'add', '--detach', workspace, parent);
      try {
        await ops.prepare(workspace);
        if (recollect) {
          console.log(`Main advanced during collection; rebuilding requested lanes on ${parent} (attempt ${attempt}/3)`);
          const freshReport = path.join(temporary, `refresh-${attempt}.json`);
          await ops.refresh(workspace, freshReport);
          // Preserve even a fatal report before refusing publication.
          entry.refreshReport = JSON.parse(await fs.readFile(freshReport, 'utf8'));
          await fs.copyFile(freshReport, reportPath);
          await receipt(freshReport);
        } else {
          for (const file of originalChanges) {
            const source = path.join(root, file);
            if (!(await fs.stat(source)).isFile()) throw new Error(`Generated target is not a file: ${file}`);
            await fs.mkdir(path.dirname(path.join(workspace, file)), { recursive: true });
            await fs.copyFile(source, path.join(workspace, file));
          }
        }
        const allowed = new Set(await ops.targets(workspace));
        const assertScope = () => {
          const unexpected = changes(workspace).filter(file => !withinTargets(file, allowed));
          if (unexpected.length) throw new Error(`Undeclared publication changes: ${unexpected.join(', ')}`);
        };
        assertScope();
        await ops.validate(workspace);
        entry.validated = true;
        assertScope();
        if (!changes(workspace).length) {
          publication.noChanges = true;
          return publication;
        }
        await ops.stamp(workspace);
        allowed.add('version.json');
        assertScope();
        git(workspace, 'add', '--', ...changes(workspace));
        // The full static gate already ran against this exact source/data tree.
        // Local pre-commit generators must not mutate it after validation.
        git(workspace, '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'Refresh generated data lanes');
        entry.commit = git(workspace, 'rev-parse', 'HEAD');
        const push = await ops.push(workspace);
        if (push.status === 0) {
          publication.published = true;
          publication.commit = entry.commit;
          return publication;
        }
        entry.pushError = push.error;
        git(root, 'fetch', '--no-tags', 'origin', 'refs/heads/main');
        const actual = git(root, 'rev-parse', 'FETCH_HEAD');
        // An ambiguous transport result may still have delivered this exact commit.
        if (command(root, 'git', ['merge-base', '--is-ancestor', entry.commit, actual], { allowFailure: true }).status === 0) {
          publication.published = true;
          publication.commit = entry.commit;
          entry.deliveryConfirmedAfterPushError = true;
          return publication;
        }
        if (actual === parent) throw new Error(`Push failed without main advancing: ${push.error}`);
        console.log('Main advanced again before push; recollecting against its new head');
      } finally {
        git(root, 'worktree', 'remove', '--force', workspace);
      }
    }
    throw new Error('Main advanced during all three publication attempts; no unvalidated or forced push was made');
  } catch (error) {
    publication.error = error.message;
    throw error;
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
    await fs.writeFile(publicationPath, `${JSON.stringify(publication, null, 2)}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = name => process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes('--report') || !process.argv.includes('--publication-report')) throw new Error('Both report paths are required');
  publishScheduledData({ root: process.cwd(), reportPath: path.resolve(argument('--report')), publicationPath: path.resolve(argument('--publication-report')) })
    .then(async result => {
      console.log(JSON.stringify({ published: result.published, commit: result.commit, attempts: result.attempts.length }));
      if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `published=${result.published}\n`);
    }).catch(error => { console.error(error); process.exitCode = 1; });
}
