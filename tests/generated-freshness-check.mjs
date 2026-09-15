#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  acceptableCompletedEcosystemWeeks,
  evaluateGeneratedFreshness,
  expectedCompletedEcosystemWeek
} from '../scripts/lib/generated-freshness.mjs';

function fixtures(now, overrides = {}) {
  const recent = new Date(new Date(now).getTime() - (2 * 60 * 60 * 1000)).toISOString();
  const expectedWeek = expectedCompletedEcosystemWeek(now);
  const base = {
    governance: { generatedAt: recent },
    maxisSeason: { generatedAt: recent },
    maxisManifest: { generatedAt: recent },
    maxisCareers: { generatedAt: recent },
    maxisL2Governance: { generatedAt: recent },
    nakamoto: { updatedAt: recent },
    capital: { generatedAt: recent },
    capitalEntry: { generatedAt: recent },
    minerals: { generatedAt: recent },
    mineralsEntry: { generatedAt: recent },
    uranium: { generatedAt: recent },
    uraniumEntry: { generatedAt: recent },
    metals: { generatedAt: recent },
    metalsEntry: { generatedAt: recent },
    fundingTeztree: { generatedAt: recent },
    fundingHacktez: { generatedAt: recent, sourceGeneratedAt: recent },
    fundingTeztreePreview: { generatedAt: recent },
    fundingHacktezPreview: { generatedAt: recent, sourceGeneratedAt: recent },
    ecosystem: { generatedAt: recent, completeWeek: expectedWeek },
    ecosystemEntry: { generatedAt: recent },
    whales: { generatedAt: recent },
    maxisEntry: { generatedAt: recent },
    bakerSignals: { generatedAt: recent },
    releaseRadar: { updatedAt: recent, staleAfterHours: 36, expiresAt: '2026-09-01T00:00:00.000Z' },
    comparison: { lastVerified: '2026-07-15', policy: { maxAgeDays: 45 } },
    milestones: { generatedAt: '2026-08-01T00:00:00.000Z', generatedAtCommitCount: 950, cadence: { days: 14, commits: 100 } },
    tezoscrp: { generated_at: '2026-07-21T00:00:00.000Z' }
  };
  return { ...base, ...overrides };
}

const beforeGrace = '2026-08-03T12:00:00.000Z';
assert.deepEqual(expectedCompletedEcosystemWeek(beforeGrace), {
  weekStart: '2026-07-20T00:00:00.000Z',
  weekEnd: '2026-07-27T00:00:00.000Z'
});
assert.deepEqual(acceptableCompletedEcosystemWeeks(beforeGrace), [
  {
    weekStart: '2026-07-20T00:00:00.000Z',
    weekEnd: '2026-07-27T00:00:00.000Z'
  },
  {
    weekStart: '2026-07-27T00:00:00.000Z',
    weekEnd: '2026-08-03T00:00:00.000Z'
  }
]);
const afterGrace = '2026-08-03T19:00:00.000Z';
assert.deepEqual(expectedCompletedEcosystemWeek(afterGrace), {
  weekStart: '2026-07-27T00:00:00.000Z',
  weekEnd: '2026-08-03T00:00:00.000Z'
});

const healthy = evaluateGeneratedFreshness({ artifacts: fixtures(afterGrace), now: afterGrace, commitCount: 960 });
assert.equal(healthy.ok, true, JSON.stringify(healthy.issues));

const earlyCompletedWeek = evaluateGeneratedFreshness({
  artifacts: fixtures(beforeGrace, {
    ecosystem: {
      generatedAt: '2026-08-03T02:00:00.000Z',
      completeWeek: acceptableCompletedEcosystemWeeks(beforeGrace)[1]
    }
  }),
  now: beforeGrace,
  commitCount: 960
});
assert.equal(earlyCompletedWeek.ok, true, JSON.stringify(earlyCompletedWeek.issues));

const dailyNakamoto = evaluateGeneratedFreshness({
  artifacts: fixtures(afterGrace, { nakamoto: { updatedAt: '2026-08-02T19:00:00.000Z' } }),
  now: afterGrace,
  commitCount: 960
});
assert.equal(dailyNakamoto.issues.some((issue) => issue.id === 'nakamoto'), false);

const staleNakamoto = evaluateGeneratedFreshness({
  artifacts: fixtures(afterGrace, { nakamoto: { updatedAt: '2026-08-02T12:00:00.000Z' } }),
  now: afterGrace,
  commitCount: 960
});
assert(staleNakamoto.issues.some((issue) => issue.id === 'nakamoto' && issue.limitHours === 30));

const staleScheduled = evaluateGeneratedFreshness({
  artifacts: fixtures(afterGrace, { ecosystem: { generatedAt: '2026-08-02T00:00:00.000Z', completeWeek: expectedCompletedEcosystemWeek(afterGrace) } }),
  now: afterGrace,
  commitCount: 960
});
assert(staleScheduled.issues.some((issue) => issue.id === 'ecosystem'));

const wrongWeek = evaluateGeneratedFreshness({
  artifacts: fixtures(afterGrace, { ecosystem: { generatedAt: '2026-08-03T18:00:00.000Z', completeWeek: expectedCompletedEcosystemWeek(beforeGrace) } }),
  now: afterGrace,
  commitCount: 960
});
assert(wrongWeek.issues.some((issue) => issue.id === 'ecosystem-week'));

const staleReview = evaluateGeneratedFreshness({
  artifacts: fixtures(afterGrace, { releaseRadar: { updatedAt: '2026-08-01T00:00:00.000Z', staleAfterHours: 36, expiresAt: '2026-09-01T00:00:00.000Z' } }),
  now: afterGrace,
  commitCount: 960
});
assert(staleReview.issues.some((issue) => issue.id === 'release-radar'));

const milestoneCommits = evaluateGeneratedFreshness({ artifacts: fixtures(afterGrace), now: afterGrace, commitCount: 1050 });
assert(milestoneCommits.issues.some((issue) => issue.id === 'milestones' && issue.overdueByCommits));

const milestoneTime = evaluateGeneratedFreshness({ artifacts: fixtures('2026-08-20T00:00:00.000Z'), now: '2026-08-20T00:00:00.000Z', commitCount: 960 });
assert(milestoneTime.issues.some((issue) => issue.id === 'milestones' && issue.overdueByTime));

console.log('ok - generated freshness contracts cover source-specific age, Monday rollover, manual review, and milestone cadence');
