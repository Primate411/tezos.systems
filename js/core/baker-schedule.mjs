// A bounded round-0 schedule is a baking-risk aid, never an all-duties clearance.
export const BAKER_SCHEDULE_LIMIT = 100;
export const MAINTENANCE_BUFFER_MINUTES = 2;
export const MAINTENANCE_DURATIONS = Object.freeze([5, 15, 30, 60]);
const MAX_HEAD_AGE_MS = 90_000;
const MAX_RECEIPT_AGE_MS = 60_000;

export function readBakerRewardThresholds(constants) {
    const ratio = value => {
        const numerator = Number(value?.numerator);
        const denominator = Number(value?.denominator);
        return Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator)
            && numerator > 0 && denominator >= numerator ? { numerator, denominator } : null;
    };
    const consensus = ratio(constants?.minimal_participation_ratio);
    const dal = ratio(constants?.dal_parametric?.minimal_participation_ratio);
    return consensus && dal && constants?.dal_parametric?.incentives_enable === true ? { consensus, dal } : null;
}

export function buildBakerSchedule({ rights, head, blockDelaySeconds, rewardThresholds = null, observedAt = Date.now() }) {
    const headLevel = head?.level;
    const headTime = Date.parse(head?.timestamp);
    if (!Number.isSafeInteger(headLevel) || headLevel < 1 || !Number.isFinite(headTime)
        || !Number.isFinite(blockDelaySeconds) || blockDelaySeconds <= 0
        || !Number.isFinite(observedAt) || head?.synced === false
        || !Array.isArray(rights) || rights.length > BAKER_SCHEDULE_LIMIT) return null;
    let previous = headLevel;
    const assignments = [];
    for (const right of rights) {
        // A malformed, repeated, out-of-order or unfiltered row invalidates the
        // complete receipt. Silently dropping it could invent a maintenance gap.
        if (!Number.isSafeInteger(right?.level) || right.level <= previous
            || right.round !== 0 || right.type !== 'baking' || right.status !== 'future') return null;
        const at = headTime + (right.level - headLevel) * blockDelaySeconds * 1000;
        if (!Number.isFinite(at) || !Number.isFinite(new Date(at).getTime())) return null;
        assignments.push({ level: right.level, round: 0, at });
        previous = right.level;
    }
    return { headLevel, headTime, blockDelaySeconds, rewardThresholds, observedAt, assignments };
}

export function isBakerScheduleFresh(schedule, now = Date.now()) {
    return Boolean(schedule && Number.isFinite(now)
        && now - schedule.headTime >= -30_000 && now - schedule.headTime <= MAX_HEAD_AGE_MS
        && now - schedule.observedAt >= 0 && now - schedule.observedAt <= MAX_RECEIPT_AGE_MS
        // An unproduced right whose earliest estimate has elapsed means the
        // chain timing has slipped. Wait for a newer head before suggesting work.
        && (!schedule.assignments.length || schedule.assignments[0].at > now));
}

export function planBakerMaintenance(schedule, { durationMinutes = 15, now = Date.now() } = {}) {
    if (!isBakerScheduleFresh(schedule, now) || !MAINTENANCE_DURATIONS.includes(durationMinutes)) return null;
    const bufferMs = MAINTENANCE_BUFFER_MINUTES * 60_000;
    const durationMs = durationMinutes * 60_000;
    const gaps = [];
    let previous = null;
    for (const assignment of schedule.assignments) {
        // The UI displays whole minutes: round inward so its clock labels never
        // invite starting before, or returning after, the reserved buffers.
        const start = Math.ceil((Math.max(now, previous?.at ?? schedule.headTime) + bufferMs) / 60_000) * 60_000;
        const end = Math.floor((assignment.at - bufferMs) / 60_000) * 60_000;
        if (end > start) gaps.push({ start, end, durationMs: end - start, afterLevel: previous?.level ?? schedule.headLevel, beforeLevel: assignment.level });
        previous = assignment;
    }
    // Deliberately stop at the final returned assignment. An exhausted/short
    // published schedule is not proof of a free interval beyond its last row.
    const earliest = gaps.find(gap => gap.durationMs >= durationMs) || null;
    const longest = gaps.reduce((best, gap) => !best || gap.durationMs > best.durationMs ? gap : best, null);
    return {
        earliest: earliest ? { ...earliest, outageEnd: earliest.start + durationMs } : null,
        longest,
        durationMinutes,
        bufferMinutes: MAINTENANCE_BUFFER_MINUTES
    };
}
