import fs from 'node:fs/promises';
import path from 'node:path';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const SCHEDULED_FRESHNESS_HOURS = 18;
export const SCHEDULED_FRESHNESS_HOURS_BY_ARTIFACT = Object.freeze({
  // The Edinburgh EDI source normally advances once per UTC day. Its
  // content-change clock must tolerate that source cadence plus scheduler
  // jitter without masking a missed daily publication.
  nakamoto: 30
});
export const ECOSYSTEM_MONDAY_GRACE_HOURS = 18;

export const GENERATED_FRESHNESS_FILES = Object.freeze({
  governance: 'data/governance-refresh-report.json',
  maxisSeason: 'data/maxis-leaders.json',
  maxisManifest: 'data/maxis/manifest.json',
  maxisCareers: 'data/maxis-careers.json',
  maxisL2Governance: 'data/maxis-l2-governance.json',
  nakamoto: 'data/nakamoto-sources.json',
  capital: 'data/capital-snapshot.json',
  capitalEntry: 'data/capital-entry-summary.json',
  minerals: 'data/minerals-snapshot.json',
  mineralsEntry: 'data/minerals-entry-summary.json',
  uranium: 'data/uranium-snapshot.json',
  uraniumEntry: 'data/uranium-entry-summary.json',
  metals: 'data/metals-snapshot.json',
  metalsEntry: 'data/metals-entry-summary.json',
  fundingTeztree: 'data/community-funding-teztree.json',
  fundingTtcrowd: 'data/community-funding-ttcrowd.json',
  fundingTtcrowdPreview: 'data/community-funding-ttcrowd-preview.json',
  fundingHacktez: 'data/community-funding-hacktez.json',
  fundingTeztreePreview: 'data/community-funding-teztree-preview.json',
  fundingHacktezPreview: 'data/community-funding-hacktez-preview.json',
  ecosystem: 'data/ecosystem-stats.json',
  ecosystemEntry: 'data/ecosystem-entry-summary.json',
  whales: 'data/whale-watch.json',
  maxisEntry: 'data/maxis/entry-summary.json',
  bakerSignals: 'data/baker-governance-signals.json',
  releaseRadar: 'data/release-radar.json',
  comparison: 'data/chain-comparison-verification.json',
  milestones: 'data/milestone-catalog.json',
  tezoscrp: 'data/tezoscrp-awards.json'
});

const SCHEDULED_TIMESTAMPS = Object.freeze([
  ['governance', 'generatedAt'],
  ['maxisSeason', 'generatedAt'],
  ['maxisManifest', 'generatedAt'],
  ['maxisCareers', 'generatedAt'],
  ['maxisL2Governance', 'generatedAt'],
  ['nakamoto', 'updatedAt'],
  ['capital', 'generatedAt'],
  ['capitalEntry', 'generatedAt'],
  ['minerals', 'generatedAt'],
  ['mineralsEntry', 'generatedAt'],
  ['uranium', 'generatedAt'],
  ['uraniumEntry', 'generatedAt'],
  ['metals', 'generatedAt'],
  ['metalsEntry', 'generatedAt'],
  ['fundingTeztree', 'generatedAt'],
  ['fundingTtcrowd', 'generatedAt'],
  ['fundingTtcrowdPreview', 'generatedAt'],
  ['fundingHacktez', 'generatedAt'],
  ['fundingHacktez', 'sourceGeneratedAt'],
  ['fundingTeztreePreview', 'generatedAt'],
  ['fundingHacktezPreview', 'generatedAt'],
  ['fundingHacktezPreview', 'sourceGeneratedAt'],
  ['ecosystem', 'generatedAt'],
  ['ecosystemEntry', 'generatedAt'],
  ['whales', 'generatedAt'],
  ['maxisEntry', 'generatedAt'],
  ['bakerSignals', 'generatedAt']
]);

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value) {
  return new Date(value).toISOString();
}

function mondayUtcAtOrBefore(nowMs) {
  const now = new Date(nowMs);
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = new Date(midnight).getUTCDay();
  return midnight - (((day + 6) % 7) * DAY_MS);
}

export function expectedCompletedEcosystemWeek(nowValue, graceHours = ECOSYSTEM_MONDAY_GRACE_HOURS) {
  const nowMs = new Date(nowValue).getTime();
  if (!Number.isFinite(nowMs)) throw new Error(`Invalid freshness clock: ${nowValue}`);
  const currentMonday = mondayUtcAtOrBefore(nowMs);
  const requiredEnd = nowMs >= currentMonday + (graceHours * HOUR_MS)
    ? currentMonday
    : currentMonday - (7 * DAY_MS);
  return {
    weekStart: iso(requiredEnd - (7 * DAY_MS)),
    weekEnd: iso(requiredEnd)
  };
}

export function acceptableCompletedEcosystemWeeks(nowValue, graceHours = ECOSYSTEM_MONDAY_GRACE_HOURS) {
  const nowMs = new Date(nowValue).getTime();
  if (!Number.isFinite(nowMs)) throw new Error(`Invalid freshness clock: ${nowValue}`);
  const currentMonday = mondayUtcAtOrBefore(nowMs);
  const currentCompleted = {
    weekStart: iso(currentMonday - (7 * DAY_MS)),
    weekEnd: iso(currentMonday)
  };
  if (nowMs >= currentMonday + (graceHours * HOUR_MS)) return [currentCompleted];
  return [
    {
      weekStart: iso(currentMonday - (14 * DAY_MS)),
      weekEnd: iso(currentMonday - (7 * DAY_MS))
    },
    currentCompleted
  ];
}

function addIssue(issues, id, message, details = {}) {
  issues.push({ id, message, ...details });
}

export function evaluateGeneratedFreshness({ artifacts, now = new Date(), commitCount = null }) {
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new Error(`Invalid freshness clock: ${now}`);
  const issues = [];

  for (const [id, field] of SCHEDULED_TIMESTAMPS) {
    const observed = timestamp(artifacts[id]?.[field]);
    if (observed === null) {
      addIssue(issues, id, `${id} has no valid ${field}`);
      continue;
    }
    const ageHours = (nowMs - observed) / HOUR_MS;
    const limitHours = SCHEDULED_FRESHNESS_HOURS_BY_ARTIFACT[id] || SCHEDULED_FRESHNESS_HOURS;
    if (ageHours > limitHours) {
      addIssue(issues, id, `${id} is ${ageHours.toFixed(1)} hours old; scheduled limit is ${limitHours} hours`, {
        observedAt: iso(observed),
        ageHours,
        limitHours
      });
    }
  }

  const completeWeek = artifacts.ecosystem?.completeWeek;
  const acceptableWeeks = acceptableCompletedEcosystemWeeks(nowMs);
  const accepted = acceptableWeeks.some((week) => (
    completeWeek?.weekStart === week.weekStart && completeWeek?.weekEnd === week.weekEnd
  ));
  if (!accepted) {
    addIssue(issues, 'ecosystem-week', `Ecosystem completed week is not the required Monday-to-Monday UTC window`, {
      expected: acceptableWeeks,
      actual: completeWeek || null
    });
  }

  const radar = artifacts.releaseRadar || {};
  const radarUpdated = timestamp(radar.updatedAt);
  const staleAfterHours = Number(radar.staleAfterHours);
  if (radarUpdated === null || !Number.isFinite(staleAfterHours) || staleAfterHours <= 0) {
    addIssue(issues, 'release-radar', 'Release Radar has an invalid reviewed freshness receipt');
  } else if (nowMs > radarUpdated + (staleAfterHours * HOUR_MS)) {
    addIssue(issues, 'release-radar', `Release Radar review is older than its ${staleAfterHours}-hour limit`, {
      observedAt: iso(radarUpdated),
      ageHours: (nowMs - radarUpdated) / HOUR_MS
    });
  }
  const radarExpiry = timestamp(radar.expiresAt);
  if (radarExpiry === null || nowMs > radarExpiry) {
    addIssue(issues, 'release-radar-expiry', 'Release Radar receipt is expired or has no valid expiry', {
      expiresAt: radar.expiresAt || null
    });
  }

  const comparison = artifacts.comparison || {};
  const comparisonObserved = timestamp(comparison.lastVerified || comparison.generatedAt);
  const comparisonMaxAgeDays = Number(comparison.policy?.maxAgeDays);
  if (comparisonObserved === null || !Number.isFinite(comparisonMaxAgeDays) || comparisonMaxAgeDays <= 0) {
    addIssue(issues, 'comparison', 'Chain comparison has an invalid verification freshness policy');
  } else if (nowMs > comparisonObserved + (comparisonMaxAgeDays * DAY_MS)) {
    addIssue(issues, 'comparison', `Chain comparison exceeds its ${comparisonMaxAgeDays}-day verification limit`, {
      observedAt: iso(comparisonObserved)
    });
  }

  const milestones = artifacts.milestones || {};
  const milestoneObserved = timestamp(milestones.generatedAt);
  const milestoneDays = Number(milestones.cadence?.days);
  const milestoneCommits = Number(milestones.cadence?.commits);
  const generatedCommitCount = Number(milestones.generatedAtCommitCount);
  if (milestoneObserved === null || !Number.isFinite(milestoneDays) || !Number.isFinite(milestoneCommits)) {
    addIssue(issues, 'milestones', 'Milestone catalog has an invalid cadence receipt');
  } else {
    const overdueByTime = nowMs > milestoneObserved + (milestoneDays * DAY_MS);
    const overdueByCommits = Number.isFinite(Number(commitCount))
      && Number.isFinite(generatedCommitCount)
      && Number(commitCount) - generatedCommitCount >= milestoneCommits;
    if (overdueByTime || overdueByCommits) {
      addIssue(issues, 'milestones', 'Milestone catalog is due by its 14-day or 100-commit policy', {
        overdueByTime,
        overdueByCommits,
        commitsSinceGeneration: Number.isFinite(Number(commitCount)) && Number.isFinite(generatedCommitCount)
          ? Number(commitCount) - generatedCommitCount
          : null
      });
    }
  }

  const tezoscrpObserved = timestamp(artifacts.tezoscrp?.generated_at);
  if (tezoscrpObserved === null || nowMs > tezoscrpObserved + (45 * DAY_MS)) {
    addIssue(issues, 'tezoscrp', 'TezosCRP official-announcement artifact is older than 45 days or lacks a valid generated_at receipt', {
      observedAt: tezoscrpObserved === null ? null : iso(tezoscrpObserved)
    });
  }

  return {
    schemaVersion: 1,
    checkedAt: iso(nowMs),
    ok: issues.length === 0,
    issues
  };
}

export async function loadGeneratedFreshnessArtifacts(root) {
  const entries = await Promise.all(Object.entries(GENERATED_FRESHNESS_FILES).map(async ([id, relative]) => {
    const value = JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
    return [id, value];
  }));
  return Object.fromEntries(entries);
}
