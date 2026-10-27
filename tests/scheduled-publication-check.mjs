#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { publishScheduledData } from '../scripts/publish-scheduled-data.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tezos-publication-check-'));
const env = { ...process.env, GIT_AUTHOR_NAME: 'Publication test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Publication test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = async (cwd, file, value) => { await fs.mkdir(path.dirname(path.join(cwd, file)), { recursive: true }); await fs.writeFile(path.join(cwd, file), value); };
function report(failed = false) {
  return { schemaVersion: 1, fatal: null, summary: { total: 2, succeeded: failed ? 1 : 2, failed: failed ? 1 : 0, skipped: 0 }, lanes: [{ id: 'one', status: 'succeeded' }, { id: 'two', status: failed ? 'failed' : 'succeeded', transient: failed }] };
}
async function scenario(name, { advanced = false, race = false, alwaysRace = false, invalid = false, partial = false, unrelated = false, ambiguous = false, denied = false, noop = false, fatal = false } = {}) {
  const dir = path.join(temporary, name); await fs.mkdir(dir);
  const remote = path.join(dir, 'remote.git'); const checkout = path.join(dir, 'checkout'); const writer = path.join(dir, 'writer');
  git(dir, 'init', '--bare', '--initial-branch=main', remote);
  git(dir, 'clone', remote, checkout);
  git(checkout, 'config', 'user.name', 'Publication test'); git(checkout, 'config', 'user.email', 'test@example.invalid');
  await write(checkout, 'source.txt', 'v1'); await write(checkout, 'data/snapshot.txt', 'old-v1'); await write(checkout, 'data/failed.txt', 'last-good-v1');
  await write(checkout, 'version.json', '{}');
  git(checkout, 'add', '.'); git(checkout, 'commit', '-m', 'base'); git(checkout, 'push', 'origin', 'main');
  const base = git(checkout, 'rev-parse', 'HEAD');
  git(dir, 'clone', remote, writer);
  let advanceCount = 0; let collections = 0; let validations = 0; let pushes = 0;
  const advance = async () => {
    advanceCount += 1;
    await write(writer, 'source.txt', `v${advanceCount + 1}`);
    await write(writer, 'data/snapshot.txt', `newer-v${advanceCount + 1}`);
    await write(writer, 'data/failed.txt', `last-good-v${advanceCount + 1}`);
    await write(writer, 'review.json', `human review ${advanceCount}`);
    git(writer, 'add', '.'); git(writer, 'commit', '-m', `concurrent-${advanceCount}`); git(writer, 'push', 'origin', 'main');
  };
  if (!noop) await write(checkout, 'data/snapshot.txt', 'collected-v1');
  if (unrelated) await write(checkout, 'source.txt', 'uncommitted-user-work');
  if (advanced) await advance();
  const reportPath = path.join(dir, 'report.json'); const publicationPath = path.join(dir, 'publication.json');
  await fs.writeFile(reportPath, JSON.stringify(report()));
  const options = { root: checkout, reportPath, publicationPath, operations: {
    targets: () => ['data'], prepare: () => {},
    refresh: async (cwd, file) => {
      collections += 1;
      const source = await fs.readFile(path.join(cwd, 'source.txt'), 'utf8');
      await write(cwd, 'data/snapshot.txt', `recollected-${source}`);
      await fs.writeFile(file, JSON.stringify(fatal ? { ...report(), fatal: 'scope violation' } : report(partial)));
    },
    validate: async cwd => {
      validations += 1;
      if (invalid) throw new Error('static gate failed');
      if (race && (validations === 1 || alwaysRace)) await advance();
    },
    stamp: async cwd => {
      await write(cwd, 'version.json', JSON.stringify({ build: Number(git(cwd, 'rev-list', '--count', 'HEAD')) + 1, commit: git(cwd, 'rev-parse', 'HEAD') }));
    },
    push: cwd => {
      pushes += 1;
      if (denied) return { status: 1, error: 'permission denied' };
      const result = spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/main'], { cwd, env, encoding: 'utf8' });
      return { status: ambiguous ? 1 : result.status, error: ambiguous ? 'connection lost after delivery' : result.stderr };
    }
  } };
  const original = git(checkout, 'diff');
  if (invalid || unrelated || alwaysRace || denied || fatal) {
    await assert.rejects(publishScheduledData(options), /static gate failed|Unexpected checkout changes|all three publication attempts|Push failed without main advancing|fatal or incomplete/);
    const main = git(remote, 'rev-parse', 'main');
    assert.equal(main, git(writer, 'rev-parse', 'HEAD'), 'a refused publication must leave remote at its independent writer');
    if (invalid || unrelated || fatal) assert.equal(pushes, 0);
    if (alwaysRace) assert.equal(pushes, 3);
    if (denied) assert.equal(pushes, 1, 'an authorization failure is not a publication race');
    if (fatal) assert.equal(JSON.parse(await fs.readFile(reportPath)).fatal, 'scope violation');
  } else {
    const result = await publishScheduledData(options);
    assert.equal(result.published, !noop);
    if (!noop) {
      const main = git(remote, 'rev-parse', 'main'); assert.equal(main, result.commit);
      const stamp = JSON.parse(git(remote, 'show', `${main}:version.json`));
      assert.equal(stamp.commit, git(remote, 'rev-parse', `${main}^`));
      assert.equal(stamp.build, Number(git(remote, 'rev-list', '--count', main)));
      if (advanced || race) {
        assert.equal(git(remote, 'show', `${main}:source.txt`), 'v2');
        assert.equal(git(remote, 'show', `${main}:review.json`), 'human review 1');
        assert.equal(git(remote, 'show', `${main}:data/snapshot.txt`), 'recollected-v2');
        assert.equal(git(remote, 'show', `${main}:data/failed.txt`), 'last-good-v2');
        assert.equal(collections, 1);
      } else assert.equal(collections, 0);
      if (ambiguous) assert.equal(result.attempts[0].deliveryConfirmedAfterPushError, true);
      if (partial) {
        assert.equal(JSON.parse(await fs.readFile(reportPath)).summary.failed, 1, 'terminal lane failures stay red');
        assert.equal(result.attempts.at(-1).refreshReport.summary.failed, 1);
      }
    }
  }
  assert.equal(git(checkout, 'rev-parse', 'HEAD'), base);
  assert.equal(git(checkout, 'diff'), original, 'publication leaves the original checkout untouched');
  assert.equal(git(checkout, 'worktree', 'list', '--porcelain').split('\n').filter(line => line.startsWith('worktree ')).length, 1, 'owned publication worktrees are cleaned up');
  console.log(`ok - scheduled publication: ${name}`);
}
try {
  await scenario('unchanged-main');
  await scenario('main-advanced-before-publish', { advanced: true });
  await scenario('race-after-validation', { race: true });
  await scenario('three-race-limit', { race: true, alwaysRace: true });
  await scenario('static-failure', { advanced: true, invalid: true });
  await scenario('last-good-partial-success', { advanced: true, partial: true });
  await scenario('fatal-refresh', { advanced: true, fatal: true });
  await scenario('unrelated-local-work', { unrelated: true });
  await scenario('ambiguous-accepted-push', { ambiguous: true });
  await scenario('permission-denied', { denied: true });
  await scenario('no-data-change', { noop: true });
  const workflow = await fs.readFile(new URL('../.github/workflows/refresh-governance-surfaces.yml', import.meta.url), 'utf8');
  assert(workflow.includes('node scripts/publish-scheduled-data.mjs'));
  assert(workflow.includes('generated-publication-report.json'));
  assert(workflow.includes("if: steps.publish.outputs.published == 'true'"));
  assert.match(workflow, /id: publish[\s\S]*?GENERATED_REFRESH_LANES: \$\{\{ inputs.lanes \}\}/);
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
