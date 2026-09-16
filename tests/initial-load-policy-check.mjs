import assert from 'node:assert/strict';
import {
  assessInitialLoadResources,
  classifyLauncherResources,
  duplicateModuleRequests,
  getInitialLoadExpectations,
  normalizeInitialLoadRequestStarts,
  validateInitialLoadReadiness
} from '../scripts/lib/initial-load-policy.mjs';
import { FUNDING_SOURCES, fundingPreviewPath } from '../js/core/community-funding.mjs';

const expectations = getInitialLoadExpectations();
const ready = () => ({
  mainVisible: true,
  dashboardReady: true,
  launcherIds: [...expectations.launcherIds],
  categoryIds: [...expectations.categoryIds],
  orderedLauncherIds: [...expectations.launcherIds],
  categoryLaunchers: structuredClone(expectations.categories)
});
assert.equal(expectations.launcherIds.length, expectations.launcherCount);
assert.equal(expectations.categoryIds.length, expectations.categoryCount);
assert(expectations.launcherIds.includes('funding'), 'Funding belongs to the canonical home catalog');
assert.deepEqual(expectations.categories.find(category => category.id === 'people').launcherIds.slice(-1), ['funding']);
assert.deepEqual(validateInitialLoadReadiness(ready()), []);
assert.deepEqual(validateInitialLoadReadiness(null), ['readiness must be an object']);
const modifiedExpectations = getInitialLoadExpectations();
modifiedExpectations.launcherIds.length = 0;
modifiedExpectations.categories[0].launcherIds.length = 0;
assert.deepEqual(getInitialLoadExpectations(), expectations, 'consumers cannot mutate the canonical expectations');

for (const field of ['launcherIds', 'categoryIds', 'orderedLauncherIds']) {
  const missing = ready();
  const missingId = missing[field].pop();
  assert(validateInitialLoadReadiness(missing).some(error => error.includes('missing IDs') && error.includes(missingId)), `${field}: missing IDs fail`);

  const duplicate = ready();
  duplicate[field][duplicate[field].length - 1] = duplicate[field][0];
  assert(validateInitialLoadReadiness(duplicate).some(error => error.includes('duplicate IDs')), `${field}: duplicates fail even at the expected count`);

  const replacement = ready();
  replacement[field][0] = 'unexpected-equal-count-replacement';
  assert(validateInitialLoadReadiness(replacement).some(error => error.includes('unexpected IDs')), `${field}: equal-count substitution cannot pass`);

  const malformed = ready();
  malformed[field][0] = '';
  assert(validateInitialLoadReadiness(malformed).some(error => error.includes('unexpected IDs')), `${field}: an unlabelled rendered node cannot count as ready`);

  const absent = ready();
  delete absent[field];
  assert(validateInitialLoadReadiness(absent).some(error => error.includes(`${field} must be an array`)));
}
for (const field of ['mainVisible', 'dashboardReady']) {
  const incomplete = ready();
  incomplete[field] = false;
  assert(validateInitialLoadReadiness(incomplete).length, `${field} is required`);
}
for (const field of ['categoryIds', 'orderedLauncherIds']) {
  const reordered = ready();
  reordered[field].reverse();
  assert(validateInitialLoadReadiness(reordered).some(error => error.includes('catalog order')), `${field}: layout order is checked`);
}
const wrongCategory = ready();
[wrongCategory.categoryLaunchers[0].launcherIds, wrongCategory.categoryLaunchers[1].launcherIds]
  = [wrongCategory.categoryLaunchers[1].launcherIds, wrongCategory.categoryLaunchers[0].launcherIds];
assert(validateInitialLoadReadiness(wrongCategory).some(error => error.includes('category ecosystem launcherIds')), 'correct total IDs in the wrong topic cannot pass');
const missingCategory = ready();
missingCategory.categoryLaunchers.pop();
assert(validateInitialLoadReadiness(missingCategory).some(error => error.includes('categoryLaunchers is missing IDs')));

const request = (path, extra = {}) => ({ path, startTime: 100, ...extra });
const ecosystem = request('/js/features/ecosystem-chamber.js?v=1');
assert.equal(classifyLauncherResources([ecosystem], []).premature.length, 1);
assert.equal(classifyLauncherResources([ecosystem], [{ id: 'capital', at: 99 }]).premature.length, 1);
assert.equal(classifyLauncherResources([ecosystem], [{ id: 'ecosystem', at: 101 }]).premature.length, 1, 'later hydration cannot excuse an early request');
assert.equal(classifyLauncherResources([ecosystem], [{ id: 'ecosystem', at: 100 }]).hydrated.length, 1);
for (const at of [NaN, Infinity, -1]) {
  assert.equal(classifyLauncherResources([ecosystem], [{ id: 'ecosystem', at }]).premature.length, 1, 'invalid intent clocks cannot authorize loading');
}
assert.equal(classifyLauncherResources([request(ecosystem.path, { startTime: undefined })], [{ id: 'ecosystem', at: 99 }]).premature.length, 1);

const startupModules = [
  '/js/core/app.js?v=1', '/js/features/network-health.js?v=1', '/js/features/history.js?v=1',
  '/js/features/my-tezos.js?v=1', '/js/features/whales.js', '/js/features/search.js', '/js/features/daily-briefing.js'
];
const startupAssessment = assessInitialLoadResources(startupModules.map(path => request(path)), []);
assert.deepEqual(startupAssessment.deferredChamberResources, [], 'shared homepage modules are not mislabeled as deferred room loads');
assert.deepEqual(startupAssessment.forbiddenHeavyResources, []);

const fundingPreviewResources = [
  '/js/features/community-funding.js?v=1', '/js/core/community-funding.mjs', '/css/community-funding.min.css?v=1',
  ...Object.keys(FUNDING_SOURCES).map(fundingPreviewPath)
].map(path => request(path));
assert.equal(assessInitialLoadResources(fundingPreviewResources, []).deferredChamberResources.length, fundingPreviewResources.length);
assert.equal(assessInitialLoadResources(fundingPreviewResources, [{ id: 'funding', at: 99 }]).visibleLauncherResources.length, fundingPreviewResources.length);
assert.equal(assessInitialLoadResources(fundingPreviewResources, [{ id: 'maxis', at: 99 }]).deferredChamberResources.length, fundingPreviewResources.length);

const fullArtifacts = [
  ...Object.values(FUNDING_SOURCES).map(source => source.path),
  '/data/capital-snapshot.json', '/data/ecosystem-stats.json', '/data/minerals-snapshot.json',
  '/data/metals-snapshot.json', '/data/uranium-snapshot.json', '/data/whale-watch.json',
  '/data/tezoscrp-awards.json', '/data/tezoscrp-awards.compact.json', '/data/maxis-leaders.json',
  '/data/maxis-careers.json', '/data/maxis-l2-governance.json', '/data/maxis/manifest.json',
  '/data/maxis/seasons/test/summary.json', '/data/maxis/seasons/test/passports/0a.json',
  '/data/maxis/seasons/test/transaction-state.json'
];
const everyLauncherVisible = expectations.launcherIds.map(id => ({ id, at: 1 }));
for (const path of fullArtifacts) {
  for (const candidate of [path, `${path}?v=42`, `/data/transports/v1${path}`, `/data/transports/v2${path}?v=42`]) {
    for (const status of ['pending', 'failed', 'finished']) {
      const resources = [request(candidate, { status, decodedBodySize: 0 })];
      assert.equal(assessInitialLoadResources(resources, everyLauncherVisible).forbiddenHeavyResources.length, 1, `${status} full artifact is forbidden at request start: ${candidate}`);
      assert.equal(classifyLauncherResources(resources, everyLauncherVisible).premature.length, 1, 'launcher visibility never authorizes full data');
    }
  }
}
assert.equal(assessInitialLoadResources([request('/css/market-room.min.css')], [{ id: 'metals', at: 99 }]).visibleLauncherResources.length, 1, 'shared market stylesheet accepts any actual owner');
assert.equal(assessInitialLoadResources([request('/css/market-room.min.css')], [{ id: 'ecosystem', at: 99 }]).deferredChamberResources.length, 1);

const queryVariants = [
  request('/js/features/community-funding.js', { status: 'failed' }),
  request('/js/features/community-funding.js?v=1', { status: 'pending' }),
  request('/js/features/community-funding.js?v=2', { status: 'finished' })
];
assert.deepEqual(assessInitialLoadResources(queryVariants, everyLauncherVisible).duplicateModuleRequests,
  [['/js/features/community-funding.js', '/js/features/community-funding.js?v=1', '/js/features/community-funding.js?v=2']],
  'failed and unfinished query variants cannot evade duplicate-module checks');
assert.deepEqual(duplicateModuleRequests([request('/same.mjs'), request('/same.mjs'), request('/data.json'), request('/data.json?v=2')]), [], 'same-URL retries and JSON revalidation do not create duplicate module identities');
assert.deepEqual(duplicateModuleRequests([request('https://tezos.systems/a.mjs?b=1&a=2'), request('/a.mjs?a=2&b=1')]), [['/a.mjs?b=1&a=2', '/a.mjs?a=2&b=1']], 'query ordering still creates distinct module URLs');

const timeOrigin = 1_789_560_000_000;
const clockRequests = [
  { path: '/repeat.js?v=1', wallTime: timeOrigin + 100, status: 'finished', requestId: 'first' },
  { path: '/failed.js', wallTime: timeOrigin + 110, status: 'failed', failure: 'connection reset' },
  { path: '/repeat.js?v=1', wallTime: timeOrigin + 120, status: 'finished', requestId: 'second' },
  { path: '/repeat.js?v=2', wallTime: timeOrigin + 130, status: 'pending' },
  { path: '/repeat.js?v=1', wallTime: timeOrigin + 140, status: 'pending', requestId: 'third' }
];
const nativeResources = [
  { path: '/repeat.js?v=1', startTime: 100.125 },
  { path: '/repeat.js?v=1', startTime: 120.25 },
  { path: '/unrelated.js', startTime: 125 }
];
const requestsBefore = structuredClone(clockRequests);
const resourcesBefore = structuredClone(nativeResources);
const normalized = normalizeInitialLoadRequestStarts(clockRequests, nativeResources, timeOrigin);
assert.deepEqual(normalized.map(row => row.startTime), [100.125, 110, 120.25, 130, 140], 'same-path native starts are consumed once in occurrence order; unmatched requests retain their fallback clocks');
assert.deepEqual(normalized.map(row => row.cdpStartTime), [100, 110, 120, 130, 140], 'CDP clock remains available for diagnostics');
assert.equal(normalized.length, clockRequests.length, 'native completion count must never discard failed or pending request receipts');
assert.deepEqual(normalized[1], { ...clockRequests[1], cdpStartTime: 110, startTime: 110 }, 'unmatched failures retain their full evidence');
assert.deepEqual(clockRequests, requestsBefore, 'request inputs are not mutated');
assert.deepEqual(nativeResources, resourcesBefore, 'native-resource inputs are not mutated');
assert.equal(normalizeInitialLoadRequestStarts([{ path: '/at-origin.js', wallTime: timeOrigin - 1 }], [], timeOrigin)[0].startTime, 0, 'fallback clocks are bounded at navigation origin');

const fractionalPath = '/js/features/ecosystem-chamber.js?v=1';
const intersectionAt = 163.100000143;
const fractionalRequest = { path: fractionalPath, wallTime: timeOrigin + 163.0859375, status: 'finished' };
const corrected = normalizeInitialLoadRequestStarts([fractionalRequest], [{ path: fractionalPath, startTime: intersectionAt }], timeOrigin);
assert.equal(corrected[0].cdpStartTime, 163.0859375, 'reproduce CDP wall-clock precision loss');
assert.equal(corrected[0].startTime, intersectionAt, 'retain the native fractional clock without rounding');
assert.equal(classifyLauncherResources(corrected, [{ id: 'ecosystem', at: intersectionAt }]).premature.length, 0, 'rounding between CDP and native clocks must not invent premature hydration');
const genuinelyEarly = normalizeInitialLoadRequestStarts([fractionalRequest], [{ path: fractionalPath, startTime: 163.05 }], timeOrigin);
assert.equal(classifyLauncherResources(genuinelyEarly, [{ id: 'ecosystem', at: intersectionAt }]).premature.length, 1, 'a true early native request still fails; no timing tolerance excuses it');
const failedEarly = normalizeInitialLoadRequestStarts([{ ...fractionalRequest, status: 'failed' }], [], timeOrigin);
assert.equal(classifyLauncherResources(failedEarly, [{ id: 'ecosystem', at: intersectionAt }]).premature.length, 1, 'unmatched failures retain the request-start gate');

console.log('ok - initial-load catalog readiness, launcher intent, complete artifact exclusions, request clocks, and duplicate policy');
