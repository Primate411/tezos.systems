#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  executeSuiteCatalog,
  formatSuiteSummary,
  isSmokeInfrastructureError,
  parseShard,
  planSuiteShards,
  selectSuiteCatalog,
  summarizeSuiteResults,
  SmokeInfrastructureError,
  unstableSuiteResults
} from './lib/smoke-harness.mjs';
import { selectAffectedSmokeSuites, smokeGlobMatches } from './lib/smoke-affected.mjs';

function expectThrow(run, pattern) {
  assert.throws(run, pattern);
}

async function main() {
  assert.deepEqual(parseShard('2/4'), { index: 2, total: 4, value: '2/4' });
  assert.equal(parseShard(''), null);
  expectThrow(() => parseShard('2'), /expected <index>\/<total>/);
  expectThrow(() => parseShard('5/4'), /exceeds total/);

  const catalog = Array.from({ length: 11 }, (_, index) => ({
    name: `suite-${index + 1}`,
    description: `Suite ${index + 1}`
  }));
  const shards = Array.from({ length: 4 }, (_, index) => (
    selectSuiteCatalog(catalog, { shard: parseShard(`${index + 1}/4`) })
  ));
  assert.deepEqual(
    shards.flat().map((suite) => suite.name).sort(),
    catalog.map((suite) => suite.name).sort(),
    'every suite must belong to exactly one shard'
  );
  assert.ok(
    Math.max(...shards.map((shard) => shard.length)) - Math.min(...shards.map((shard) => shard.length)) <= 1,
    'round-robin shards must remain balanced'
  );
  for (const shard of shards) {
    const positions = shard.map((suite) => catalog.findIndex((entry) => entry.name === suite.name));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'shards must preserve catalog order');
  }
  const weightedCosts = {
    'suite-1': 100,
    'suite-2': 80,
    'suite-3': 60,
    'suite-4': 40,
    'suite-5': 20
  };
  const weightedShards = planSuiteShards(catalog, 4, weightedCosts);
  const heavyShardIndexes = ['suite-1', 'suite-2', 'suite-3', 'suite-4'].map((name) => (
    weightedShards.findIndex((shard) => shard.suites.some((suite) => suite.name === name))
  ));
  assert.equal(new Set(heavyShardIndexes).size, 4, 'long suites must be distributed before cheap suites');
  assert.ok(
    Math.max(...weightedShards.map((shard) => shard.estimatedCost))
      - Math.min(...weightedShards.map((shard) => shard.estimatedCost)) <= 100,
    'greedy runtime sharding must stay within one longest-suite cost'
  );
  for (let index = 0; index < weightedShards.length; index += 1) {
    assert.deepEqual(
      selectSuiteCatalog(catalog, {
        shard: parseShard(`${index + 1}/4`),
        suiteCosts: weightedCosts
      }).map((suite) => suite.name),
      weightedShards[index].suites.map((suite) => suite.name),
      'selected runtime shard must match the deterministic plan'
    );
  }
  assert.deepEqual(
    selectSuiteCatalog(catalog, { onlySuites: ['suite-7', 'suite-2'] }).map((suite) => suite.name),
    ['suite-2', 'suite-7'],
    'focused selection must preserve canonical execution order'
  );
  expectThrow(
    () => selectSuiteCatalog(catalog, { onlySuites: ['missing-suite'] }),
    /unknown smoke suite/
  );
  expectThrow(
    () => selectSuiteCatalog([{ name: 'duplicate' }, { name: 'duplicate' }]),
    /duplicate smoke suite/
  );

  const attemptCounts = new Map();
  const executionCatalog = [
    { name: 'pass', description: 'passes immediately' },
    { name: 'flake', description: 'passes only on diagnostic retry' },
    { name: 'fail', description: 'fails both attempts' },
    { name: 'after-failure', description: 'still runs after another suite fails' }
  ];
  const results = await executeSuiteCatalog(executionCatalog, {
    continueOnFailure: true,
    retryFailures: 1,
    runAttempt: async (suite) => {
      const count = (attemptCounts.get(suite.name) || 0) + 1;
      attemptCounts.set(suite.name, count);
      if (suite.name === 'flake' && count === 1) throw new Error('transient fixture race');
      if (suite.name === 'fail') throw new Error(`deterministic failure ${count}`);
    }
  });
  assert.deepEqual(results.map((result) => result.status), ['passed', 'flaky', 'failed', 'passed']);
  assert.equal(attemptCounts.get('pass'), 1);
  assert.equal(attemptCounts.get('flake'), 2);
  assert.equal(attemptCounts.get('fail'), 2);
  assert.equal(attemptCounts.get('after-failure'), 1);
  assert.equal(results[1].iterations[0].attempts[0].error.message, 'transient fixture race');
  assert.equal(results[2].iterations[0].attempts[1].error.message, 'deterministic failure 2');
  assert.deepEqual(summarizeSuiteResults(results), {
    selected: 4,
    executed: 4,
    passed: 2,
    flaky: 1,
    failed: 1,
    skipped: 0
  });
  assert.equal(formatSuiteSummary(results), '2 passed, 1 flaky, 1 failed, 0 not run (4 selected)');
  assert.deepEqual(unstableSuiteResults(results).map((result) => result.name), ['flake', 'fail']);

  const failFastRuns = [];
  const failFast = await executeSuiteCatalog(executionCatalog, {
    runAttempt: async (suite) => {
      failFastRuns.push(suite.name);
      if (suite.name === 'flake') throw new Error('stop here');
    }
  });
  assert.deepEqual(failFastRuns, ['pass', 'flake']);
  assert.deepEqual(failFast.map((result) => result.status), ['passed', 'failed']);
  assert.equal(summarizeSuiteResults(failFast, executionCatalog.length).skipped, 2);

  let repeatRuns = 0;
  const repeated = await executeSuiteCatalog([{ name: 'repeat' }], {
    repeatEach: 3,
    runAttempt: async () => { repeatRuns += 1; }
  });
  assert.equal(repeatRuns, 3);
  assert.equal(repeated[0].iterations.length, 3);
  assert.equal(repeated[0].status, 'passed');

  let infrastructureRuns = 0;
  const infrastructureEvents = [];
  const infrastructureRecovered = await executeSuiteCatalog([{ name: 'infra-recovery' }], {
    retryInfrastructure: 1,
    runAttempt: async () => {
      infrastructureRuns += 1;
      if (infrastructureRuns === 1) throw new SmokeInfrastructureError('browser did not launch');
    },
    onEvent: async (event) => infrastructureEvents.push(event.type)
  });
  assert.equal(infrastructureRuns, 2);
  assert.equal(infrastructureRecovered[0].status, 'passed', 'pre-test infrastructure recovery must not be reported as a flaky assertion');
  assert.equal(infrastructureRecovered[0].iterations[0].attempts.length, 1);
  assert.equal(infrastructureRecovered[0].iterations[0].attempts[0].infrastructureRetries, 1);
  assert.ok(infrastructureEvents.includes('infrastructure-retry'));
  assert.ok(isSmokeInfrastructureError(new SmokeInfrastructureError('typed')));

  const infrastructureExhausted = await executeSuiteCatalog([{ name: 'infra-exhausted' }], {
    retryInfrastructure: 1,
    runAttempt: async () => { throw new SmokeInfrastructureError('still unavailable'); }
  });
  assert.equal(infrastructureExhausted[0].status, 'failed');
  assert.equal(infrastructureExhausted[0].iterations[0].attempts[0].infrastructureFailure, true);
  assert.equal(infrastructureExhausted[0].iterations[0].attempts[0].infrastructureRetries, 1);

  assert.ok(smokeGlobMatches('js/features/my-tezos*', 'js/features/my-tezos-memory.mjs'));
  assert.ok(smokeGlobMatches('data/maxis/**', 'data/maxis/seasons/season-1/summary.json'));
  assert.ok(!smokeGlobMatches('js/features/my-tezos*', 'js/core/my-tezos-db.mjs'));
  const ownershipCatalog = [
    { name: 'owned-a', files: ['js/features/a.js'], risk: 'normal' },
    { name: 'owned-b', files: ['js/features/b*'], risk: 'high' }
  ];
  assert.deepEqual(
    selectAffectedSmokeSuites(ownershipCatalog, ['js/features/b-room.js']).suites.map((suite) => suite.name),
    ['owned-b']
  );
  assert.equal(selectAffectedSmokeSuites(ownershipCatalog, ['README.md']).mode, 'none');
  assert.equal(selectAffectedSmokeSuites(ownershipCatalog, ['tests/smoke.mjs']).mode, 'full');
  assert.equal(selectAffectedSmokeSuites(ownershipCatalog, ['js/core/chamber-features.mjs']).mode, 'full');
  assert.equal(selectAffectedSmokeSuites(ownershipCatalog, ['js/features/unmapped.js']).mode, 'full');

  let overrideRuns = 0;
  const suiteRepeatOverride = await executeSuiteCatalog([{ name: 'high-risk', repeatEach: 3 }], {
    repeatEach: 1,
    runAttempt: async () => { overrideRuns += 1; }
  });
  assert.equal(overrideRuns, 3);
  assert.equal(suiteRepeatOverride[0].repeatEach, 3);

  const versionOutputDir = await mkdtemp(path.join(os.tmpdir(), 'tezos-playwright-version-'));
  try {
    const versionOutputPath = path.join(versionOutputDir, 'github-output');
    const resolver = spawnSync(process.execPath, ['scripts/resolve-playwright-version.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, GITHUB_OUTPUT: versionOutputPath },
      encoding: 'utf8'
    });
    assert.equal(resolver.status, 0, resolver.stderr || resolver.stdout);
    const packageJson = JSON.parse(await readFile('node_modules/playwright/package.json', 'utf8'));
    assert.equal(
      await readFile(versionOutputPath, 'utf8'),
      `version=${packageJson.version}\n`,
      'workflow helper must publish the installed Playwright version through GITHUB_OUTPUT'
    );
  } finally {
    await rm(versionOutputDir, { recursive: true, force: true });
  }

  console.log('ok - smoke harness sharding, affected ownership, repetition, assertion/infra retry classification, continuation, and summaries');
}

main().catch((error) => {
  console.error(`fail - ${error.stack || error.message}`);
  process.exit(1);
});
