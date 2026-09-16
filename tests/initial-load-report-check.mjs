import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATRIX_PROFILES, parseInitialLoadArgs, resolveInitialLoadOutput } from '../scripts/lib/initial-load-config.mjs';
import { BUDGET_METRICS, checkInitialLoadBudgets, summarizeInitialLoadRuns, validateInitialLoadWorkload } from '../scripts/lib/initial-load-report.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const originalBaseUrl = process.env.BASE_URL;
delete process.env.BASE_URL;
try {
  assert.equal(MATRIX_PROFILES.length, 12);
  assert.equal(new Set(MATRIX_PROFILES.map(profile => profile.id)).size, 12);
  assert.equal(new Set(MATRIX_PROFILES.map(profile => `${profile.device}:${profile.savedWallet}:${profile.cache}`)).size, 12);
  const defaults = parseInitialLoadArgs([]);
  assert.equal(defaults.network, 'blocked');
  assert.equal(defaults.theme, 'clean');
  assert.equal(defaults.profiles[0].id, 'desktop-anonymous-cold');
  const matrix = parseInitialLoadArgs(['--matrix']);
  assert.equal(matrix.network, 'populated');
  assert.equal(matrix.theme, 'aurora');
  assert.equal(matrix.profiles.length, 12);
  matrix.profiles[0].viewport.width = 1;
  assert.equal(MATRIX_PROFILES[0].viewport.width, 1440, 'parsed options cannot change the canonical viewport');
  assert.equal(parseInitialLoadArgs(['--help']).help, true);
  assert.equal(parseInitialLoadArgs(['--mode', 'installed-worker']).profiles[0].cache, 'installed-worker');
  assert.equal(parseInitialLoadArgs(['--profile', 'mobile-saved-wallet-warm']).profiles[0].savedWallet, true);
  assert.equal(parseInitialLoadArgs(['--base-url', 'http://127.0.0.1:9000/']).baseUrl, 'http://127.0.0.1:9000');
  assert.equal(parseInitialLoadArgs(['--base-url', 'http://[::1]:9000/']).baseUrl, 'http://[::1]:9000');
  assert.equal(parseInitialLoadArgs(['--runs', '2', '--warmup-runs', '0', '--settle-ms', '0', '--timeout-ms', '100', '--require-stable']).runs, 2);
  assert.throws(() => parseInitialLoadArgs(['--unknown']), /Unknown argument/);
  for (const flag of ['--base-url', '--output', '--label', '--mode', '--profile', '--network', '--theme', '--budgets', '--runs', '--warmup-runs', '--settle-ms', '--timeout-ms']) {
    assert.throws(() => parseInitialLoadArgs([flag]), /needs a value/, flag);
    assert.throws(() => parseInitialLoadArgs([flag, '--matrix']), /needs a value/, flag);
    assert.throws(() => parseInitialLoadArgs([flag, ' ']), /needs a value/, flag);
  }
  for (const [flag, values] of [
    ['--runs', ['0', '-1', '21', '1.5', 'NaN', 'Infinity']],
    ['--warmup-runs', ['-1', '4', '0.5', 'NaN']],
    ['--settle-ms', ['-1', '15001', '1.5', 'NaN']],
    ['--timeout-ms', ['99', '120001', '-1', 'NaN']]
  ]) for (const value of values) assert.throws(() => parseInitialLoadArgs([flag, value]), /must be an integer/);
  for (const argv of [
    ['--mode', 'warm'], ['--theme', 'unknown'], ['--network', 'live'],
    ['--matrix', '--profile', 'desktop-anonymous-cold'],
    ['--matrix', '--mode', 'installed-worker'],
    ['--profile', 'desktop-anonymous-cold', '--mode', 'installed-worker'],
    ['--profile', 'not-a-profile'], ['--profile', 'desktop-anonymous-cold,'],
    ['--profile', 'desktop-anonymous-cold,desktop-anonymous-cold'],
    ['--profile', 'desktop-saved-wallet-cold', '--network', 'blocked'],
    ['--matrix', '--network', 'blocked'], ['--runs', '1', '--require-stable']
  ]) assert.throws(() => parseInitialLoadArgs(argv), Error, argv.join(' '));
  for (const url of ['https://tezos.systems', 'http://localhost/path', 'http://localhost/?q=1', 'http://localhost/#x', 'http://user:pass@localhost/', 'file:///tmp/']) {
    assert.throws(() => parseInitialLoadArgs(['--base-url', url]), /loopback HTTP/);
  }
  assert.throws(() => parseInitialLoadArgs(['--network', 'populated', '--base-url', 'http://localhost:9000']), /owned server/);

  const baseline = path.join(ROOT, 'tests/fixtures/initial-load-baseline.json');
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'initial-load-output-test-'));
  const originalCwd = process.cwd();
  try {
    symlinkSync(baseline, path.join(temporary, 'baseline-alias.json'));
    symlinkSync(path.dirname(baseline), path.join(temporary, 'fixture-alias'));
    for (const output of [baseline, 'tests/fixtures/initial-load-baseline.json', 'tests/fixtures/../fixtures/initial-load-baseline.json', path.join(temporary, 'baseline-alias.json'), path.join(temporary, 'fixture-alias/initial-load-baseline.json')]) {
      assert.throws(() => parseInitialLoadArgs(['--output', output]), /historical baseline is immutable/);
    }
    process.chdir(temporary);
    assert.throws(() => parseInitialLoadArgs(['--output', 'tests/fixtures/initial-load-baseline.json']), /historical baseline is immutable/, 'cwd cannot bypass repository-relative baseline protection');
    assert.equal(resolveInitialLoadOutput('new-report.json'), path.join(ROOT, 'new-report.json'));
    assert.equal(parseInitialLoadArgs(['--output', path.join(temporary, 'new-report.json')]).output, path.join(temporary, 'new-report.json'));
  } finally {
    process.chdir(originalCwd);
    rmSync(temporary, { recursive: true, force: true });
  }
} finally {
  if (originalBaseUrl === undefined) delete process.env.BASE_URL;
  else process.env.BASE_URL = originalBaseUrl;
}

const selected = MATRIX_PROFILES.find(profile => profile.id === 'desktop-anonymous-cold');
const contract = { network: 'populated', theme: 'aurora', settleMs: 2500, fixtureRevision: 'fixture-test-revision' };
const values = value => Object.fromEntries(BUDGET_METRICS.map(metric => [metric, value]));
const run = (number, value = 80) => ({ run: number, errors: [], ...values(value), longTaskDurationMs: 0, totalBlockingTimeMs: 0 });
const makeReport = () => ({
  schemaVersion: 2, ...contract, runsPerProfile: 3, warmupRuns: 1, selectedProfileIds: [selected.id], errors: [],
  profiles: [{ profile: { ...selected, viewport: { ...selected.viewport }, network: contract.network, theme: contract.theme },
    runs: [run(1), run(2), run(3)], warmupDiagnostics: [run('warmup-1')], errors: [] }]
});
const makeBudgets = () => ({ schemaVersion: 1, profileContract: { ...contract }, profiles: { [selected.id]: values(100) } });
assert.deepEqual(checkInitialLoadBudgets(makeReport(), makeBudgets()), []);
for (const runs of [[], [{ run: 1, errors: ['Renderer unavailable'] }], [run(1), { ...run(2), sameOriginDecodedBytes: NaN, longTaskDurationMs: Infinity, totalBlockingTimeMs: undefined }]]) {
  const summary = summarizeInitialLoadRuns(runs);
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary, 'failure summaries have identical returned and persisted values');
  assert.equal(summary.medians.sameOriginDecodedBytes, null, 'missing telemetry is unavailable, not a zero measurement');
  assert.equal(summary.maxima.sameOriginDecodedBytes, null);
  assert.equal(summary.stability.decodedBytesMaxAdjacentDeltaPct, null);
  assert.equal(summary.stability.decodedBytesWithinFivePct, false, 'missing telemetry cannot certify stability');
  assert.equal(summary.stability.totalBlockingTimeWithinFifteenPct, false);
}
const validSummary = summarizeInitialLoadRuns([run(1), run(2)]);
assert.equal(validSummary.maxima.sameOriginDecodedBytes, 80);
assert.equal(validSummary.medians.sameOriginDecodedBytes, 80);
assert.equal(validSummary.stability.decodedBytesWithinFivePct, true);
assert.equal(validSummary.stability.totalBlockingTimeMaxAdjacentDeltaPct, 0, 'measured zero blocking time remains zero');
for (const invalid of [null, undefined, [], {}, { schemaVersion: 2 }, { schemaVersion: 1, profiles: [], profileContract: contract }]) {
  assert(checkInitialLoadBudgets(makeReport(), invalid).length, 'malformed budget schemas fail without throwing');
}
for (const invalid of [null, undefined, [], {}, { ...makeReport(), schemaVersion: 1 }, { ...makeReport(), profiles: [] }, { ...makeReport(), profiles: {} }]) {
  assert(checkInitialLoadBudgets(invalid, makeBudgets()).length, 'missing/malformed measurement profiles cannot pass');
}
for (const key of Object.keys(contract)) {
  const missing = makeBudgets();
  delete missing.profileContract[key];
  assert(checkInitialLoadBudgets(makeReport(), missing).length, `missing ${key} contract fails`);
  const changed = makeReport();
  changed[key] = key === 'settleMs' ? 3000 : `different-${key}`;
  assert(checkInitialLoadBudgets(changed, makeBudgets()).some(error => error.includes(`contract differs: ${key}`)), `wrong ${key} fails`);
}
for (const value of [-1, NaN, Infinity, '2500']) {
  const malformed = makeBudgets();
  malformed.profileContract.settleMs = value;
  assert(checkInitialLoadBudgets(makeReport(), malformed).some(error => error.includes('Invalid initial-load budget profile contract')));
}
for (const metric of BUDGET_METRICS) {
  for (const value of [undefined, -1, NaN, Infinity, '100']) {
    const malformed = makeBudgets();
    malformed.profiles[selected.id][metric] = value;
    assert(checkInitialLoadBudgets(makeReport(), malformed).some(error => error.includes(`invalid ${metric} budget`)));
    const badRun = makeReport();
    badRun.profiles[0].runs[1][metric] = value;
    assert(checkInitialLoadBudgets(badRun, makeBudgets()).some(error => error.includes(`run 2: ${metric}`)), `invalid run metric ${metric} fails`);
  }
  const regression = makeReport();
  regression.profiles[0].runs[2][metric] = 150;
  assert.equal(summarizeInitialLoadRuns(regression.profiles[0].runs).medians[metric], 80, 'median alone conceals the regressed run');
  assert(checkInitialLoadBudgets(regression, makeBudgets()).some(error => error.includes(`run 3: ${metric}`)), `every-run ${metric} ceiling catches the hidden regression`);
}
const unknownMetric = makeBudgets();
unknownMetric.profiles[selected.id].unreviewedMetric = 99999999;
assert(checkInitialLoadBudgets(makeReport(), unknownMetric).some(error => error.includes('unknown budget metric')));
const absentProfileBudget = makeBudgets();
delete absentProfileBudget.profiles[selected.id];
assert(checkInitialLoadBudgets(makeReport(), absentProfileBudget).some(error => error.includes('No reviewed budget')));
const unknownBudgetProfile = makeBudgets();
unknownBudgetProfile.profiles['unknown-profile'] = values(100);
assert(checkInitialLoadBudgets(makeReport(), unknownBudgetProfile).some(error => error.includes('Unknown budget profile')));
const noRuns = makeReport();
noRuns.profiles[0].runs = [];
assert(checkInitialLoadBudgets(noRuns, makeBudgets()).some(error => error.includes('no successful measurement runs')));
for (const key of ['device', 'cache', 'savedWallet', 'network', 'theme']) {
  const mismatch = makeReport();
  mismatch.profiles[0].profile[key] = key === 'savedWallet' ? true : 'wrong-value';
  assert(checkInitialLoadBudgets(mismatch, makeBudgets()).some(error => error.includes(`profile ${key}`)), `profile ${key} cannot contradict the reported ID/contract`);
}
const wrongViewport = makeReport();
wrongViewport.profiles[0].profile.viewport = { width: 390, height: 844 };
assert(checkInitialLoadBudgets(wrongViewport, makeBudgets()).some(error => error.includes('profile viewport')));
const duplicateProfile = makeReport();
duplicateProfile.profiles.push(structuredClone(duplicateProfile.profiles[0]));
assert(checkInitialLoadBudgets(duplicateProfile, makeBudgets()).some(error => error.includes('Duplicate measurement profile')));
const missingSelected = makeReport();
missingSelected.selectedProfileIds.push('mobile-anonymous-cold');
assert(checkInitialLoadBudgets(missingSelected, makeBudgets()).some(error => error.includes('Missing selected measurement profile')));
for (const selectedProfileIds of [[], undefined, [selected.id, selected.id], ['unknown-profile']]) {
  assert(checkInitialLoadBudgets({ ...makeReport(), selectedProfileIds }, makeBudgets()).some(error => error.includes('selectedProfileIds')));
}
for (const runsPerProfile of [0, 21, 1.5, NaN, undefined]) {
  assert(checkInitialLoadBudgets({ ...makeReport(), runsPerProfile }, makeBudgets()).some(error => error.includes('runsPerProfile')));
}
for (const ids of [[1, 2], [1, 1, 3], [0, 2, 3], [1, 2, 4], ['1', 2, 3]]) {
  const incomplete = makeReport();
  incomplete.profiles[0].runs = ids.map(id => run(id));
  assert(checkInitialLoadBudgets(incomplete, makeBudgets()).some(error => /expected 3 runs|run IDs/.test(error)), 'run count/identity must cover 1 through the requested count');
}
const failedMeasurement = makeReport();
failedMeasurement.profiles[0].errors = ['readiness failed'];
assert(checkInitialLoadBudgets(failedMeasurement, makeBudgets()).some(error => error.includes('measurement reported errors')));
const zeros = makeReport();
zeros.profiles[0].runs = [run(1, 0), run(2, 0), run(3, 0)];
const zeroBudgets = makeBudgets();
zeroBudgets.profiles[selected.id] = values(0);
assert(checkInitialLoadBudgets(zeros, zeroBudgets).some(error => error.includes('positive measurement')), 'zero ceilings cannot legitimize an empty workload');
assert(!checkInitialLoadBudgets(makeReport(), zeroBudgets).some(error => error.includes('invalid') && error.includes('budget')), 'zero is a strict valid ceiling, never an omitted check');
for (const metric of BUDGET_METRICS) {
  const empty = makeReport();
  empty.profiles[0].runs[1][metric] = 0;
  const errors = checkInitialLoadBudgets(empty, makeBudgets());
  if (metric === 'jsonDecodedBytes') assert.deepEqual(errors, [], 'a profile need not load a JSON resource');
  else assert(errors.some(error => error.includes(`run 2: ${metric} must be a finite positive measurement`)), `${metric} must reflect measured work in every run`);
}
assert.deepEqual(validateInitialLoadWorkload(run(1)), []);
assert.equal(validateInitialLoadWorkload(run(1, 0)).length, 5, 'nonempty-workload validation also works without a budget');
assert.equal(validateInitialLoadWorkload(null).length, BUDGET_METRICS.length);
for (const warmupRuns of [-1, 4, 0.5, NaN, undefined]) {
  assert(checkInitialLoadBudgets({ ...makeReport(), warmupRuns }, makeBudgets()).some(error => error.includes('warmupRuns')));
}
const noErrorReceipt = makeReport();
delete noErrorReceipt.profiles[0].errors;
assert(checkInitialLoadBudgets(noErrorReceipt, makeBudgets()).some(error => error.includes('omitted its error receipt')));
for (const errors of [undefined, ['global failure']]) {
  assert(checkInitialLoadBudgets({ ...makeReport(), errors }, makeBudgets()).some(error => error.includes('report contains errors')));
}
for (const errors of [undefined, ['per-run failure']]) {
  const failed = makeReport();
  failed.profiles[0].runs[1].errors = errors;
  assert(checkInitialLoadBudgets(failed, makeBudgets()).some(error => error.includes('run 2: reported errors')), 'run errors cannot disappear through an empty profile errors array');
}
for (const warmupDiagnostics of [undefined, [], [run('warmup-2')], [run('warmup-1'), run('warmup-1')], [{ ...run('warmup-1'), errors: ['warmup failure'] }]]) {
  const failed = makeReport();
  failed.profiles[0].warmupDiagnostics = warmupDiagnostics;
  assert(checkInitialLoadBudgets(failed, makeBudgets()).some(error => /warmup/.test(error)), 'warmup completeness and errors cannot disappear from a report');
}
for (const cache of ['warm', 'installed-worker']) {
  const profile = MATRIX_PROFILES.find(item => item.id === `desktop-anonymous-${cache}`);
  const report = makeReport();
  report.selectedProfileIds = [profile.id];
  report.profiles[0].profile = { ...profile, ...contract };
  for (const receipt of [...report.profiles[0].runs, ...report.profiles[0].warmupDiagnostics]) receipt.seed = run('seed');
  const budgets = makeBudgets();
  budgets.profiles = { [profile.id]: values(100) };
  assert.deepEqual(checkInitialLoadBudgets(report, budgets), [], 'complete cache seed receipts qualify');
  for (const seed of [undefined, { ...run('seed'), errors: ['seed failure'] }, { ...run('seed'), sameOriginDecodedBytes: 0 }]) {
    const failed = structuredClone(report);
    failed.profiles[0].runs[1].seed = seed;
    assert(checkInitialLoadBudgets(failed, budgets).some(error => /run 2.*seed/.test(error)), 'missing, failed or empty seeds must fail independently of aggregate errors');
  }
}

console.log('ok - initial-load CLI, matrix identity, immutable historical output, budget schema, complete coverage, and every-run ceilings');
