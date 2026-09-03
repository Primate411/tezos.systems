/** Shared, bounded Octez software receipts. No Network Health UI or polling. */
import { API_URLS } from './config.js';
import { fetchWithRetry } from './api.js';
const TZKT = API_URLS.tzkt;
const OCTEZ_VERSIONS_TTL = 30 * 60 * 1000;
const OCTEZ_VERSION_PAGE_LIMIT = 500;
let octezVersionsCache = null;
let octezVersionsCacheAt = 0;
let octezVersionsInFlight = null;
let octezVersionsInFlightPriority = 'normal';
let octezVersionsRequestSequence = 0;
let octezVersionsAppliedSequence = 0;

async function fetchJson(url, retries = 2, { priority = 'normal' } = {}) {
    return fetchWithRetry(url, {
        cache: 'no-store',
        memoryCache: false,
        ...(priority === 'interactive' ? { __tezosSystemsPriority: 'interactive' } : {})
    }, retries + 1);
}

function normalizeOctezSoftware(software) {
    const rawVersion = typeof software === 'string' ? software : software?.version;
    const rawDate = typeof software === 'object' && software ? software.date : null;
    const version = String(rawVersion || '').trim();
    const known = Boolean(version) && !/^unknown$/i.test(version) && !/^octez$/i.test(version);
    return {
        known,
        version: known ? version : 'Unknown',
        date: rawDate || null
    };
}

function versionParts(version) {
    const parts = String(version || '').match(/\d+/g);
    return parts ? parts.map((part) => Number(part)) : [];
}

function compareVersionLabels(a, b) {
    const left = versionParts(a);
    const right = versionParts(b);
    if (!left.length && !right.length) return String(a || '').localeCompare(String(b || ''));
    if (!left.length) return -1;
    if (!right.length) return 1;
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const delta = (left[index] || 0) - (right[index] || 0);
        if (delta) return delta;
    }
    return String(a || '').localeCompare(String(b || ''));
}

export function classifyOctezVersion(version, latestVersion) {
    const current = String(version || '').trim();
    const latest = String(latestVersion || '').trim();
    if (!current || /^unknown$/i.test(current) || !latest || /^unknown$/i.test(latest)) {
        return {
            state: 'unknown',
            className: 'unknown',
            label: 'Unknown',
            latestVersion: latest || 'Unknown'
        };
    }

    const comparison = compareVersionLabels(current, latest);
    if (comparison >= 0) {
        return {
            state: 'ok',
            className: 'current',
            label: current === latest ? 'Latest observed' : 'Newer than latest observed',
            latestVersion: latest
        };
    }

    const currentParts = versionParts(current);
    const latestParts = versionParts(latest);
    const currentMajor = currentParts[0] || 0;
    const latestMajor = latestParts[0] || 0;
    if (latestMajor > currentMajor) {
        return {
            state: 'issue',
            className: 'critical',
            label: 'Major upgrade behind',
            latestVersion: latest
        };
    }

    return {
        state: 'watch',
        className: 'watch',
        label: 'Behind latest observed',
        latestVersion: latest
    };
}

function normalizeOctezVersionBaker(row) {
    const software = normalizeOctezSoftware(row?.software);
    return {
        address: row?.address || '',
        alias: row?.alias || '',
        bakingPower: Math.max(0, Number(row?.bakingPower) || 0),
        software
    };
}

export function octezVersionsFallback(error = '') {
    return {
        available: false,
        label: 'Unavailable',
        className: 'unknown',
        error,
        latestVersion: 'Unknown',
        latestPowerShare: null,
        totalBakers: 0,
        knownBakers: 0,
        totalPower: 0,
        latestPower: 0,
        outdatedPower: 0,
        bakers: [],
        versionRows: [],
        laggingBakers: [],
        freshestDate: null
    };
}

function buildOctezVersions(rows) {
    const bakers = (Array.isArray(rows) ? rows : [])
        .map(normalizeOctezVersionBaker)
        .filter((baker) => baker.address && baker.bakingPower > 0);
    if (!bakers.length) return octezVersionsFallback('No active baker software data returned');

    const totalPower = bakers.reduce((sum, baker) => sum + baker.bakingPower, 0);
    const groups = new Map();
    let freshestDate = null;

    for (const baker of bakers) {
        const key = baker.software.version;
        const current = groups.get(key) || {
            version: key,
            known: baker.software.known,
            bakerCount: 0,
            power: 0,
            latestDate: null
        };
        current.bakerCount += 1;
        current.power += baker.bakingPower;
        if (baker.software.date) {
            const dateMs = new Date(baker.software.date).getTime();
            const currentMs = current.latestDate ? new Date(current.latestDate).getTime() : 0;
            const freshestMs = freshestDate ? new Date(freshestDate).getTime() : 0;
            if (Number.isFinite(dateMs) && dateMs > currentMs) current.latestDate = baker.software.date;
            if (Number.isFinite(dateMs) && dateMs > freshestMs) freshestDate = baker.software.date;
        }
        groups.set(key, current);
    }

    const knownVersions = [...groups.values()]
        .filter((group) => group.known)
        .map((group) => group.version)
        .sort(compareVersionLabels);
    const latestVersion = knownVersions[knownVersions.length - 1] || 'Unknown';
    const latestPower = latestVersion === 'Unknown' ? 0 : (groups.get(latestVersion)?.power || 0);
    const latestPowerShare = totalPower > 0 ? (latestPower / totalPower) * 100 : 0;
    const versionRows = [...groups.values()].map((group) => ({
        ...group,
        powerShare: totalPower > 0 ? (group.power / totalPower) * 100 : 0,
        current: group.version === latestVersion && group.known
    })).sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1;
        if (a.known !== b.known) return a.known ? -1 : 1;
        const versionDelta = compareVersionLabels(b.version, a.version);
        return versionDelta || b.power - a.power;
    });

    const laggingBakers = bakers
        .filter((baker) => !baker.software.known || baker.software.version !== latestVersion)
        .sort((a, b) => b.bakingPower - a.bakingPower)
        .slice(0, 5);

    let className = 'degraded';
    let label = 'Upgrade gap';
    if (latestPowerShare >= 90) {
        className = 'peak';
        label = 'Broadly current';
    } else if (latestPowerShare >= 75) {
        className = 'healthy';
        label = 'Mostly current';
    } else if (latestPowerShare >= 50) {
        className = 'watch';
        label = 'Split fleet';
    }

    return {
        available: true,
        className,
        label,
        latestVersion,
        latestPowerShare,
        totalBakers: bakers.length,
        knownBakers: bakers.filter((baker) => baker.software.known).length,
        totalPower,
        latestPower,
        outdatedPower: Math.max(0, totalPower - latestPower),
        bakers,
        versionRows,
        laggingBakers,
        freshestDate
    };
}

function startOctezVersionsRequest(priority) {
    const sequence = ++octezVersionsRequestSequence;
    const request = (async () => {
        const fields = 'address,alias,bakingPower,software';
        const rows = [];
        let offset = 0;
        while (true) {
            const url = `${TZKT}/delegates?active=true&select=${fields}&sort.desc=bakingPower&limit=${OCTEZ_VERSION_PAGE_LIMIT}&offset=${offset}`;
            const page = await fetchJson(url, 1, { priority });
            if (!Array.isArray(page)) break;
            rows.push(...page);
            if (page.length < OCTEZ_VERSION_PAGE_LIMIT) break;
            offset += OCTEZ_VERSION_PAGE_LIMIT;
        }
        return buildOctezVersions(rows);
    })().then((versions) => {
        if (sequence < octezVersionsAppliedSequence) return octezVersionsCache;
        octezVersionsAppliedSequence = sequence;
        octezVersionsCache = versions;
        octezVersionsCacheAt = Date.now();
        return octezVersionsCache;
    }).catch((error) => {
        console.warn('Network Health Octez version telemetry failed:', error);
        return octezVersionsCache || octezVersionsFallback(error?.message || 'TzKT delegate software fetch failed');
    });
    const trackedRequest = request.finally(() => {
        if (octezVersionsInFlight !== trackedRequest) return;
        octezVersionsInFlight = null;
        octezVersionsInFlightPriority = 'normal';
    });

    octezVersionsInFlight = trackedRequest;
    octezVersionsInFlightPriority = priority;
    return trackedRequest;
}

export async function fetchOctezVersions({ force = false, priority = 'normal' } = {}) {
    if (!force && octezVersionsCache && Date.now() - octezVersionsCacheAt < OCTEZ_VERSIONS_TTL) {
        return octezVersionsCache;
    }
    if (octezVersionsInFlight
        && (priority !== 'interactive' || octezVersionsInFlightPriority === 'interactive')) {
        return octezVersionsInFlight;
    }

    return startOctezVersionsRequest(priority);
}
