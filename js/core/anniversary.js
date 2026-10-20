import { MAINNET_LAUNCH } from './config.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function ordinal(value) {
    const number = Math.abs(Math.trunc(Number(value) || 0));
    const mod100 = number % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
    switch (number % 10) {
        case 1: return `${number}st`;
        case 2: return `${number}nd`;
        case 3: return `${number}rd`;
        default: return `${number}th`;
    }
}

function timestamp(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    return new Date(value).getTime();
}

function utcAnniversaryAt(launch, year) {
    return Date.UTC(
        year,
        launch.getUTCMonth(),
        launch.getUTCDate(),
        launch.getUTCHours(),
        launch.getUTCMinutes(),
        launch.getUTCSeconds(),
        launch.getUTCMilliseconds()
    );
}

function emptyElapsedTime() {
    return {
        valid: false,
        years: 0,
        months: 0,
        daysAfterMonths: 0,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalDays: 0,
        anniversaryAt: 0
    };
}

export function getCalendarElapsedTime(now = Date.now(), launchIso = MAINNET_LAUNCH) {
    const nowMs = timestamp(now);
    const launchMs = timestamp(launchIso);
    if (!Number.isFinite(nowMs) || !Number.isFinite(launchMs) || nowMs < launchMs) {
        return emptyElapsedTime();
    }

    const launch = new Date(launchMs);
    const current = new Date(nowMs);
    let years = current.getUTCFullYear() - launch.getUTCFullYear();
    let anniversaryAt = utcAnniversaryAt(launch, launch.getUTCFullYear() + years);
    if (nowMs < anniversaryAt) {
        years -= 1;
        anniversaryAt = utcAnniversaryAt(launch, launch.getUTCFullYear() + years);
    }

    const remainder = nowMs - anniversaryAt;
    // Anchor each month to the anniversary date, clamping short months without
    // carrying February's shorter day into March. Keep `days` below as the
    // full remainder after years for the Network Health seconds clock.
    const anniversary = new Date(anniversaryAt);
    const monthAt = (offset) => {
        const date = new Date(anniversaryAt);
        date.setUTCDate(1);
        date.setUTCMonth(anniversary.getUTCMonth() + offset);
        const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(anniversary.getUTCDate(), lastDay));
        return date.getTime();
    };
    let months = (current.getUTCFullYear() - anniversary.getUTCFullYear()) * 12
        + current.getUTCMonth() - anniversary.getUTCMonth();
    if (nowMs < monthAt(months)) months -= 1;
    const daysAfterMonths = Math.floor((nowMs - monthAt(months)) / DAY_MS);
    const days = Math.floor(remainder / DAY_MS);
    const hours = Math.floor((remainder % DAY_MS) / (60 * 60 * 1000));
    const minutes = Math.floor((remainder % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((remainder % (60 * 1000)) / 1000);

    return {
        valid: true,
        years,
        months,
        daysAfterMonths,
        days,
        hours,
        minutes,
        seconds,
        totalDays: Math.floor((nowMs - launchMs) / DAY_MS),
        anniversaryAt
    };
}

export function getTezosUptimeAnniversary(now = Date.now(), launchIso = MAINNET_LAUNCH) {
    const nowMs = timestamp(now);
    const elapsed = getCalendarElapsedTime(now, launchIso);
    if (!elapsed.valid || !Number.isFinite(nowMs)) {
        return {
            isAnniversary: false,
            years: 0,
            ordinalYears: '0th',
            totalDays: 0,
            startsAt: 0,
            endsAt: 0,
            claimText: 'mainnet age',
            originText: 'since 2018',
            message: '',
            hotText: '',
            detail: ''
        };
    }

    const years = elapsed.years;
    const startsAt = elapsed.anniversaryAt;
    const endsAt = startsAt + DAY_MS;
    const isAnniversary = years > 0 && nowMs >= startsAt && nowMs < endsAt;
    const totalDays = elapsed.totalDays;
    const ordinalYears = ordinal(years);
    const formattedDays = totalDays.toLocaleString('en-US');

    return {
        isAnniversary,
        years,
        ordinalYears,
        totalDays,
        startsAt,
        endsAt,
        dayKey: new Date(startsAt).toISOString().slice(0, 10),
        monthDay: new Date(startsAt).toISOString().slice(5, 10),
        claimText: `${ordinalYears} anniversary`,
        originText: `happy ${ordinalYears}, Tezos`,
        message: `Happy ${ordinalYears} anniversary, Tezos. ${formattedDays} days of mainnet history since launch.`,
        hotText: `Tezos turns ${years} today: ${formattedDays} days of mainnet history and protocol upgrades adopted on-chain.`,
        detail: `${formattedDays} days of mainnet history`
    };
}
