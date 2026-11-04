#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { publishReleaseRadar } from '../scripts/publish-release-radar.mjs';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-publish-check-'));
const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (cwd, file, value) => fs.writeFile(path.join(cwd, file), value);
async function scenario(name, options = {}) {
 const dir = path.join(temp, name);await fs.mkdir(dir);
 const remote = path.join(dir, 'remote.git'), root = path.join(dir, 'root'), writer = path.join(dir, 'writer'), reportPath = path.join(dir, 'report.json');
 git(dir, 'init', '--bare', '--initial-branch=main', remote);git(dir, 'clone', remote, root);
 git(root, 'config', 'user.name', 'Test');git(root, 'config', 'user.email', 'test@example.invalid');
 await fs.mkdir(path.join(root, 'data'));await write(root, 'source.txt', 'v1');await write(root, 'data/release-radar.json', 'last-good');await write(root, 'data/release-radar-review.json', 'human-baseline');
 git(root, 'add', '.');git(root, 'commit', '-m', 'base');git(root, 'push', 'origin', 'main');git(dir, 'clone', remote, writer);
 const initial = git(root, 'rev-parse', 'HEAD');let reviews = 0, validations = 0, pushes = 0, advances = 0;
 const advance = async () => { await write(writer, 'source.txt', `v${++advances + 1}`);git(writer, 'add', '.');git(writer, 'commit', '-m', 'independent change');git(writer, 'push', 'origin', 'main'); };
 if (options.dirty) await write(root, 'source.txt', 'user work');
 const original = git(root, 'diff');
 const args = { root, reportPath, operations: {
  prepare() {},
  async review(cwd, file) {
   reviews++;
   const status = options.reviewRequired ? 'review_required' : options.notDue ? 'not_due' : 'reviewed';
   await write(cwd, 'data/release-radar.json', status === 'reviewed' ? `reviewed-${await fs.readFile(path.join(cwd, 'source.txt'), 'utf8')}` : 'last-good');
   if (options.scope) await write(cwd, 'source.txt', 'unrelated mutation');
   await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, status, sources: status === 'reviewed' ? [{ url: 'complete-test-review' }] : [], problems: options.reviewRequired ? [{ reason: 'Changed evidence' }] : [] }));
  },
  async validate() { validations++;if (options.invalid) throw new Error('static gate failed');if (options.race && (validations === 1 || options.alwaysRace)) await advance(); },
  async stamp(cwd) { await write(cwd, 'version.json', JSON.stringify({ commit: git(cwd, 'rev-parse', 'HEAD') })); },
  push(cwd) { pushes++;if (options.denied) return { status: 1, error: 'permission denied' };const r = spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/main'], { cwd, env, encoding: 'utf8' });return { status: options.ambiguous ? 1 : r.status, error: r.stderr }; }
 } };
 if (options.invalid || options.scope || options.dirty || options.denied || options.alwaysRace) {
  await assert.rejects(publishReleaseRadar(args), /static gate failed|Unexpected publication changes|Checkout must be clean|Push failed without main advancing|all three publication attempts/);
  assert.equal(git(remote, 'rev-parse', 'main'), git(writer, 'rev-parse', 'HEAD'));
  if (options.invalid || options.scope || options.dirty) assert.equal(pushes, 0);
  if (options.alwaysRace) assert.equal(reviews, 3);
  assert(JSON.parse(await fs.readFile(reportPath)).error, 'Terminal failure remains in artifact');
 } else {
  const result = await publishReleaseRadar(args);
  if (options.reviewRequired || options.notDue) { assert.equal(result.published, false);assert.equal(pushes, 0);assert.equal(validations, 0);assert.equal(git(remote, 'rev-parse', 'main'), initial); }
  else {
   assert(result.published);assert.equal(result.commit, git(remote, 'rev-parse', 'main'));
   assert.equal(reviews, options.race ? 2 : 1);assert.equal(validations, reviews);
   assert.equal(git(remote, 'show', 'main:data/release-radar.json'), options.race ? 'reviewed-v2' : 'reviewed-v1');
   assert.equal(git(remote, 'show', 'main:data/release-radar-review.json'), 'human-baseline', 'Automated publication cannot accept changed baseline');
   assert.equal(result.attempts.length, reviews);
   if (options.ambiguous) assert(result.attempts[0].deliveryConfirmedAfterPushError);
  }
 }
 assert.equal(git(root, 'diff'), original, 'Publisher preserves the invoking checkout');
 assert.equal(git(root, 'worktree', 'list', '--porcelain').split('worktree ').length - 1, 1, 'Temporary worktrees are removed');
}
try {
 for (const [name, options] of Object.entries({ normal: {}, changed: { reviewRequired: true }, notDue: { notDue: true }, race: { race: true }, racesExhausted: { race: true, alwaysRace: true }, validationFailure: { invalid: true }, scopeLeak: { scope: true }, dirty: { dirty: true }, permission: { denied: true }, ambiguous: { ambiguous: true } })) await scenario(name, options);
} finally { await fs.rm(temp, { recursive: true, force: true }); }
console.log('ok - Radar publication recollects on moving main, validates exact trees, never forces or rebases, and retains terminal reports');
