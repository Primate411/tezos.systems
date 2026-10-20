import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const MAINNET_LAUNCH = '2018-06-30T17:39:57Z';
const source = await fs.readFile(new URL('../js/core/anniversary.js', import.meta.url), 'utf8');
const testableSource = source.replace(
    "import { MAINNET_LAUNCH } from './config.js';",
    `const MAINNET_LAUNCH = '${MAINNET_LAUNCH}';`
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(testableSource).toString('base64')}`;
const { getCalendarElapsedTime, getTezosUptimeAnniversary } = await import(moduleUrl);

function clock(value) {
    const elapsed = getCalendarElapsedTime(value);
    return {
        years: elapsed.years,
        days: elapsed.days,
        hours: elapsed.hours,
        minutes: elapsed.minutes,
        seconds: elapsed.seconds
    };
}

assert.deepEqual(
    clock('2026-06-30T17:39:56Z'),
    { years: 7, days: 364, hours: 23, minutes: 59, seconds: 59 },
    'the eighth anniversary must not arrive one second early'
);
assert.deepEqual(
    clock('2026-06-30T17:39:57Z'),
    { years: 8, days: 0, hours: 0, minutes: 0, seconds: 0 },
    'the eighth anniversary must turn over at the exact Block 1 UTC timestamp'
);
assert.deepEqual(
    clock('2024-06-30T17:39:56Z'),
    { years: 5, days: 365, hours: 23, minutes: 59, seconds: 59 },
    'calendar decomposition must preserve the leap day before the sixth anniversary'
);
assert.deepEqual(
    clock('2018-06-30T17:39:56Z'),
    { years: 0, days: 0, hours: 0, minutes: 0, seconds: 0 },
    'pre-launch values must fail closed at zero'
);

for (const [now, expected] of [
    ['2026-10-20T17:39:56Z', [8, 3, 19]],
    ['2026-10-20T17:39:57Z', [8, 3, 20]],
    ['2026-10-30T17:39:56Z', [8, 3, 29]],
    ['2026-10-30T17:39:57Z', [8, 4, 0]],
    ['2027-02-28T17:39:56Z', [8, 7, 28]],
    ['2027-02-28T17:39:57Z', [8, 8, 0]],
    ['2027-03-30T17:39:57Z', [8, 9, 0]],
    ['2024-02-29T17:39:56Z', [5, 7, 29]],
    ['2024-02-29T17:39:57Z', [5, 8, 0]],
    ['2024-03-30T17:39:57Z', [5, 9, 0]],
    ['2026-06-30T17:39:56Z', [7, 11, 30]],
    ['2026-06-30T17:39:57Z', [8, 0, 0]],
    ['2026-10-20T13:39:57-04:00', [8, 3, 20]],
    ['2018-06-30T17:39:56Z', [0, 0, 0]],
    ['not-a-timestamp', [0, 0, 0]]
]) {
    const age = getCalendarElapsedTime(now);
    assert.deepEqual(
        [age.years, age.months, age.daysAfterMonths],
        expected,
        `calendar age must respect UTC day, month and anniversary boundaries at ${now}`
    );
}

const yearNine = getTezosUptimeAnniversary('2027-06-30T17:39:57Z');
assert.equal(yearNine.isAnniversary, true, 'the year-nine pulse must activate at the exact anniversary');
assert.equal(yearNine.years, 9);
assert.equal(yearNine.ordinalYears, '9th');
assert.equal(yearNine.startsAt, Date.parse('2027-06-30T17:39:57Z'));
assert.equal(yearNine.endsAt, Date.parse('2027-07-01T17:39:57Z'));
assert.equal(yearNine.claimText, '9th anniversary');
assert.equal(yearNine.originText, 'happy 9th, Tezos');
assert.match(yearNine.message, /^Happy 9th anniversary, Tezos\./);
assert.match(yearNine.hotText, /^Tezos turns 9 today:/);

assert.equal(
    getTezosUptimeAnniversary('2027-06-30T13:39:57-04:00').isAnniversary,
    true,
    'timezone offsets representing the same instant must share the UTC boundary'
);
assert.equal(
    getTezosUptimeAnniversary('2027-07-01T17:39:56.999Z').isAnniversary,
    true,
    'the existing anniversary pulse must remain active for the full 24-hour window'
);
assert.equal(
    getTezosUptimeAnniversary('2027-07-01T17:39:57Z').isAnniversary,
    false,
    'the anniversary pulse must expire exactly 24 hours after Block 1 time'
);

const invalid = getCalendarElapsedTime('2027-06-30T17:39:57Z', 'not-a-timestamp');
assert.equal(invalid.valid, false);
assert.deepEqual(
    { years: invalid.years, days: invalid.days, hours: invalid.hours, minutes: invalid.minutes, seconds: invalid.seconds },
    { years: 0, days: 0, hours: 0, minutes: 0, seconds: 0 },
    'invalid launch input must fail closed'
);
assert.equal(getTezosUptimeAnniversary('2027-06-30T17:39:57Z', 'not-a-timestamp').isAnniversary, false);

console.log('ok - Block 1 calendar age and dynamic mainnet anniversary contracts');
