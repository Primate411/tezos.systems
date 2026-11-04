#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function command(cwd, program, args, { allowFailure = false, inherit = false } = {}) {
  const r = spawnSync(program, args, { cwd, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
  if (r.error) throw r.error;
  if (r.status !== 0 && !allowFailure) throw new Error(`${program} failed (${r.status}): ${r.stderr || ''}`);
  return { status: r.status, text: (r.stdout || '').trim(), error: (r.stderr || '').trim() };
}
const git = (cwd, ...args) => command(cwd, 'git', args).text;
const changes = cwd => [...new Set([
  ...git(cwd, 'diff', '--name-only', '-z', 'HEAD').split('\0'),
  ...git(cwd, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')
].filter(Boolean))];
const defaults = {
  prepare: cwd => command(cwd, 'npm', ['ci'], { inherit: true }),
  review: (cwd, report, force) => command(cwd, 'node', ['scripts/review-release-radar.mjs', '--apply', '--report', report, ...(force ? ['--force-review'] : [])], { inherit: true }),
  validate: cwd => command(cwd, 'npm', ['run', 'test:static'], { inherit: true }),
  stamp: cwd => command(cwd, 'sh', ['scripts/stamp-version.sh'], { inherit: true }),
  push: cwd => command(cwd, 'git', ['push', 'origin', 'HEAD:refs/heads/main'], { allowFailure: true })
};

export async function publishReleaseRadar({ root, reportPath, force = false, operations = {} }) {
  const ops = { ...defaults, ...operations };
  const report = { schemaVersion: 1, base: git(root, 'rev-parse', 'HEAD'), attempts: [], published: false, status: 'error' };
  let temporary;
  try {
    if (changes(root).length) throw new Error('Checkout must be clean; refusing to publish');
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tezos-radar-publish-'));
    for (let attempt = 1; attempt <= 3; attempt++) {
      git(root, 'fetch', '--no-tags', 'origin', 'refs/heads/main');
      const parent = git(root, 'rev-parse', 'FETCH_HEAD');
      if (command(root, 'git', ['merge-base', '--is-ancestor', report.base, parent], { allowFailure: true }).status !== 0) throw new Error('Main no longer descends from the review base');
      const workspace = path.join(temporary, `attempt-${attempt}`);
      const entry = { attempt, parent };report.attempts.push(entry);
      git(root, 'worktree', 'add', '--detach', workspace, parent);
      try {
        await ops.prepare(workspace);
        const evidencePath = path.join(temporary, `review-${attempt}.json`);
        // Run the freshly fetched source code and review every source anew on
        // every attempt. Never overlay old observations or rebase generated data.
        await ops.review(workspace, evidencePath, force);
        entry.review = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
        if (entry.review.schemaVersion !== 1 || !['not_due', 'review_required', 'reviewed'].includes(entry.review.status)) throw new Error('Invalid source review report');
        const allowed = new Set(['data/release-radar.json']);
        const assertScope = () => { if (changes(workspace).some(f => !allowed.has(f))) throw new Error('Unexpected publication changes'); };
        assertScope();
        if (entry.review.status !== 'reviewed') {
          if (changes(workspace).length) throw new Error('Incomplete review changed last-good data');
          report.status = entry.review.status;return report;
        }
        if (entry.review.problems?.length || !entry.review.sources?.length || !changes(workspace).includes('data/release-radar.json')) throw new Error('Reviewed outcome lacks evidence or a renewed receipt');
        await ops.validate(workspace);entry.validated = true;assertScope();
        await ops.stamp(workspace);allowed.add('version.json');assertScope();
        git(workspace, 'add', '--', ...changes(workspace));
        // The exact source/data tree already passed the full static gate. Do not
        // let local generators mutate unrelated data after this validation.
        git(workspace, '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'Review unchanged Release Radar sources');
        entry.commit = git(workspace, 'rev-parse', 'HEAD');
        const pushed = await ops.push(workspace);
        if (pushed.status !== 0) {
          entry.pushError = pushed.error;
          git(root, 'fetch', '--no-tags', 'origin', 'refs/heads/main');
          const actual = git(root, 'rev-parse', 'FETCH_HEAD');
          if (command(root, 'git', ['merge-base', '--is-ancestor', entry.commit, actual], { allowFailure: true }).status !== 0) {
            if (actual === parent) throw new Error(`Push failed without main advancing: ${pushed.error}`);
            continue;
          }
          entry.deliveryConfirmedAfterPushError = true;
        }
        report.published = true;report.commit = entry.commit;report.status = 'reviewed';return report;
      } finally { command(root, 'git', ['worktree', 'remove', '--force', workspace], { allowFailure: true }); }
    }
    throw new Error('Main moved during all three publication attempts');
  } catch (error) { report.error = error.message;throw error; }
  finally {
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);const reportPath = args[args.indexOf('--report') + 1];
  if (!args.includes('--report') || !reportPath) throw new Error('--report is required');
  publishReleaseRadar({ root: process.cwd(), reportPath: path.resolve(reportPath), force: args.includes('--force-review') }).then(async r => {
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `published=${r.published}\ncommit=${r.commit || ''}\nstatus=${r.status}\n`);
    console.log(JSON.stringify({ status: r.status, published: r.published, commit: r.commit }));
  }).catch(e => { console.error(e);process.exitCode = 1; });
}
