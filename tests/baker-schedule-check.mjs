import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildBakerSchedule, isBakerScheduleFresh, planBakerMaintenance, readBakerRewardThresholds } from '../js/core/baker-schedule.mjs';

const now = Date.parse('2026-09-14T12:00:00Z');
const thresholds = readBakerRewardThresholds({ minimal_participation_ratio: { numerator: 2, denominator: 3 }, dal_parametric: { incentives_enable: true, minimal_participation_ratio: { numerator: '16', denominator: '25' } } });
assert.deepEqual(thresholds, { consensus: { numerator: 2, denominator: 3 }, dal: { numerator: 16, denominator: 25 } });
assert.equal(readBakerRewardThresholds(null), null, 'Unknown participation constants stay unknown');
assert.equal(readBakerRewardThresholds({ minimal_participation_ratio: { numerator: 2, denominator: 0 } }), null);
const head = { level: 1000, timestamp: new Date(now).toISOString(), synced: true };
const row = level => ({ level, round: 0, status: 'future', type: 'baking' });
const build = (rights, extra = {}) => buildBakerSchedule({ rights, head, blockDelaySeconds: 6, observedAt: now, ...extra });
const schedule = build([row(1100), row(1300), row(1900)]);
assert.equal(schedule.assignments[0].at, now + 600_000, 'ETA anchors to the confirmed head timestamp');
const plan = planBakerMaintenance(schedule, { durationMinutes: 15, now });
assert.equal(plan.earliest.afterLevel, 1100);
assert.equal(plan.earliest.beforeLevel, 1300);
assert.equal(plan.earliest.start, now + 12 * 60_000);
assert.equal(plan.earliest.outageEnd, now + 27 * 60_000);
assert.equal(plan.earliest.end, now + 28 * 60_000, 'Two minutes reserved before the next right');
assert.equal(plan.longest.durationMs, 56 * 60_000);
assert.equal(plan.longest.beforeLevel, 1900, 'Never invent a gap after the final returned assignment');
const fractionalClock = now + 30_000;
const minutePlan = planBakerMaintenance(build([row(1100), row(1300)], { head: { ...head, timestamp: new Date(fractionalClock).toISOString() }, observedAt: fractionalClock }), { now: fractionalClock });
assert.equal(minutePlan.earliest.start, now + 13 * 60_000, 'Displayed start rounds up to preserve the full buffer');
assert.equal(minutePlan.earliest.end, now + 28 * 60_000, 'Displayed return deadline rounds down');
assert.equal(planBakerMaintenance(schedule, { durationMinutes: 60, now }).earliest, null);
const currentGap = planBakerMaintenance(schedule, { durationMinutes: 5, now }).earliest;
assert.equal(currentGap.start, now, 'An already-open gap is available immediately');
assert.equal(currentGap.afterLevel, null, 'The chain head must not be presented as this baker’s preceding assignment');
const shortOpening = planBakerMaintenance(build([row(1030)]), { durationMinutes: 5, now });
assert.equal(shortOpening.earliest, null, 'A three-minute opening cannot fit five minutes plus the return buffer');
assert.equal(shortOpening.longest.durationMs, 60_000, 'The current opening reserves its buffer before the next right');

// Hosted canary 39617317776 crossed a minute boundary with a 1.875s-old
// head. An 18-minute head-relative ETA rounded down to a 14m58.706s gap.
// Preserve that conservative rejection instead of making the planner looser.
const canaryNow = Date.parse('2026-10-21T14:49:01.294Z');
const canarySchedule = build([row(12345858), row(12346458)], {
    head: { level: 12345678, timestamp: '2026-10-21T14:48:59.419Z' },
    observedAt: canaryNow
});
assert.equal(planBakerMaintenance(canarySchedule, { now: canaryNow }).earliest.afterLevel, 12345858,
    'A rounded current gap shorter than 15 minutes must defer to the next real gap');

// The live reader-state fixture must fit for every minute phase and throughout
// the entire permitted head-age range, independent of hosted scheduling speed.
for (const phaseMs of [0, 1, 30_000, 59_999]) {
    for (const headAgeMs of [0, 1_875, 60_000, 90_000]) {
        const readAt = now + phaseMs;
        const safeFixture = build([row(1200), row(1800)], {
            head: { ...head, timestamp: new Date(readAt - headAgeMs).toISOString() },
            observedAt: readAt
        });
        const fit = planBakerMaintenance(safeFixture, { now: readAt }).earliest;
        assert.equal(fit.start, readAt, 'The 20-minute fixture always fits while its head is fresh');
        assert.equal(fit.afterLevel, null);
        assert(fit.outageEnd <= fit.end && fit.end <= safeFixture.assignments[0].at - 120_000);
    }
}

// Reproduce the 1h47m-to-next-block screenshot, including refreshes that used
// to keep moving an artificial three-minute start into the future.
const screenshotNow = Date.parse('2026-10-20T11:17:10-04:00');
for (const elapsedMinutes of [0, 1, 3, 10]) {
    const refreshedNow = screenshotNow + elapsedMinutes * 60_000;
    const refreshed = build([row(15457683), row(15457709), row(15457982)], {
        head: { level: 15456612 + elapsedMinutes * 10, timestamp: new Date(refreshedNow).toISOString() },
        observedAt: refreshedNow
    });
    const fit = planBakerMaintenance(refreshed, { durationMinutes: 60, now: refreshedNow }).earliest;
    assert.equal(fit.start, refreshedNow, 'Each fresh head keeps the current gap available now');
    assert.equal(fit.outageEnd, refreshedNow + 60 * 60_000);
    assert.equal(fit.afterLevel, null);
    assert.equal(fit.beforeLevel, 15457683);
    assert(fit.outageEnd <= fit.end, 'The complete outage fits before the buffered return deadline');
    assert(fit.end <= refreshed.assignments[0].at - 120_000);
    assert.equal(planBakerMaintenance(refreshed, { durationMinutes: 60, now: refreshedNow + 15_000 }).earliest.start,
        refreshedNow + 15_000, 'Re-rendering the same fresh receipt also adds no wait');
}
const exactHour = build([row(1620)]);
assert.equal(planBakerMaintenance(exactHour, { durationMinutes: 60, now }).earliest.start, now,
    'A full hour plus the two-minute return buffer fits exactly');
assert.equal(planBakerMaintenance(exactHour, { durationMinutes: 60, now: now + 1 }).earliest, null,
    'Never round a current start backwards to fit an outage that is now too long');
assert.equal(planBakerMaintenance(build([]), { now }).longest, null, 'An empty published schedule does not mean unlimited downtime');
assert.equal(planBakerMaintenance(build([row(1100)]), { durationMinutes: 15, now }).earliest, null, 'Short scan remains bounded');
assert.equal(build(Array.from({ length: 100 }, (_, index) => row(1100 + index * 100))).assignments.length, 100);
for (const rights of [null, {}, [row(1000)], [row(1100), row(1100)], [row(1200), row(1100)], [{ ...row(1100), round: 1 }], [{ ...row(1100), status: 'realized' }], [{ ...row(1100), type: 'attestation' }], [{ ...row(1100), level: '1100' }], Array.from({ length: 101 }, (_, i) => row(1100 + i))]) {
    assert.equal(build(rights), null, 'Malformed, unfiltered or oversized receipts fail closed');
}
for (const extra of [{ blockDelaySeconds: null }, { blockDelaySeconds: 0 }, { head: { ...head, synced: false } }, { head: { ...head, timestamp: null } }]) assert.equal(build([row(1100)], extra), null);
assert.equal(planBakerMaintenance(schedule, { now: now + 61_000 }), null, 'Expired receipt withholds suggestions');
assert.equal(isBakerScheduleFresh(build([row(1100)], { head: { ...head, timestamp: new Date(now - 91_000).toISOString() } }), now), false, 'Stalled head cannot authorize a window');
assert.equal(isBakerScheduleFresh(build([row(1001)], { head: { ...head, timestamp: new Date(now - 10_000).toISOString() } }), now), false, 'Elapsed estimates are not silently dropped');
assert.equal(isBakerScheduleFresh(build([row(1100)], { head: { ...head, timestamp: new Date(now + 31_000).toISOString() } }), now), false, 'Clock skew fails closed');

const source = await fs.readFile(new URL('../js/features/my-tezos.js', import.meta.url), 'utf8');
const refresh = source.slice(source.indexOf('async function refreshOperatorSignal('), source.indexOf('async function refreshDrawerStats('));
assert.match(refresh, /!isDrawerOpen\(\) \|\| document.visibilityState !== 'visible'/, 'Schedule uses the visibility-gated operator timer');
assert.match(source, /limit: String\(BAKER_SCHEDULE_LIMIT\)/);
assert.match(source, /RIGHTS_FETCH_TIMEOUT_MS, \{ visibleOnly: true \}/, 'Queued schedule reads cancel when the page becomes hidden');
assert.match(source, /document.removeEventListener\('visibilitychange', stopWhenHidden\)/, 'Each visibility listener is released after its request');
assert.match(source, /const next = renderBakerSchedule\(status.schedule\)/);
assert.match(source, /if \(container.children.length\) quietlySyncHtml\(container, html\)/, 'Subsequent schedule renders preserve the reading surface');
assert.match(source, /Attestation and DAL duties continue; later-round baking is possible/);
assert.match(source, /_lastGoodBakerSchedules.get\(bakerAddr\)/, 'Failure retention is scoped to the inspected baker');
assert.match(source, /data-chamber-disclosure data-quiet-key="schedule-method"/, 'The quiet updater preserves the user-owned disclosure');
console.log('ok - bounded baker schedules, confirmed timing, buffered windows, partial/failed receipts, and quiet-refresh integration');

const healthSource = source.slice(source.indexOf('function calcBakerHealth('), source.indexOf('function healthLabel('));
const gradeScore = new Function(`${healthSource}; return calcBakerHealth;`)();
for (const participation of [null, {}, { expected_cycle_activity: 0, missed_slots: 0 }, { expected_cycle_activity: 100 }, { expected_cycle_activity: 100, missed_slots: -1 }, { expected_cycle_activity: 100, missed_slots: 101 }]) assert.equal(gradeScore(participation), null);
for (const [missed, score] of [[0, 100], [1, 100], [3, 95], [5, 90], [10, 75], [33, 50], [34, 25]]) assert.equal(gradeScore({ expected_cycle_activity: 100, missed_slots: missed }), score);
assert.match(source, /data-chamber-disclosure data-quiet-key="baker-grade-method"/);
const briefRenderer = source.slice(source.indexOf('function renderBakerBrief('), source.indexOf('function renderBriefTabs('));
assert.match(briefRenderer, /quietlySyncHtml\(bakerBrief,/);
assert.match(briefRenderer, /renderBakerStatusCard\(data\)/);
assert.match(briefRenderer, /\+ renderBakerGrade\(data\)/);
console.log('ok - evidence-based cycle grade and quiet disclosure');

const snapshotSource = source.slice(source.indexOf('function bakerParticipationSnapshot('), source.indexOf('function renderBakerGrade('));
const emptySnapshot = new Function('window', `${snapshotSource}; return bakerParticipationSnapshot(null, undefined);`)({ _myTezosData: null });
assert.equal(emptySnapshot.participation, null, 'An account without a baker has no previous participation');
const previous = { bakerAddr: 'baker-a', participation: { expected_cycle_activity: 100, missed_slots: 1 }, participationObservedAt: 123 };
const retainSnapshot = new Function('window', 'baker', `${snapshotSource}; return bakerParticipationSnapshot(null, baker);`);
assert.equal(retainSnapshot({ _myTezosData: previous }, 'baker-a').participationStale, true);
assert.equal(retainSnapshot({ _myTezosData: previous }, 'baker-b').participation, null, 'Never retain another baker score');

const reportSource = await fs.readFile(new URL('../js/features/baker-report-card.js', import.meta.url), 'utf8');
assert.match(reportSource, /__tezosSystemsPriority: 'interactive'/, 'The user-triggered report has priority over timed refresh traffic');
assert.equal((reportSource.match(/fetchWithDeadline\([^;]*?interactive/g) || []).length, 4, 'All report reads use interactive priority');
