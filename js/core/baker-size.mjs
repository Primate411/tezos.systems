export const BAKER_SIZE_MEDIUM_SHARE = 0.001;
export const BAKER_SIZE_LARGE_SHARE = 0.01;

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function bakerSizeTier(bakingPower, totalBakingPower, context = 'current network baking power') {
    const power = finiteNumber(bakingPower);
    const total = finiteNumber(totalBakingPower);
    if (power === null || power <= 0 || total === null || total <= 0) return null;
    const share = power / total;
    const key = share >= BAKER_SIZE_LARGE_SHARE
        ? 'large'
        : share >= BAKER_SIZE_MEDIUM_SHARE
            ? 'medium'
            : 'small';
    const percentage = share * 100;
    const formattedShare = percentage < 0.01
        ? percentage.toFixed(3)
        : percentage < 1
            ? percentage.toFixed(2)
            : percentage.toFixed(1);
    return {
        key,
        label: key[0].toUpperCase() + key.slice(1),
        detail: `${formattedShare}% of ${context}`,
        share
    };
}

function rightIdentity(right) {
    const baker = right?.baker || {};
    const address = String(baker.address || '');
    if (!address) return null;
    return { address, name: String(baker.alias || address) };
}

export function buildQuietBakerNotice({
    attestationRights = [],
    bakingRights = [],
    powerByDelegate = {},
    totalPower = null,
    maxNames = 3,
    sampleClipped = false
} = {}) {
    const bakers = new Map();
    const ensure = (right) => {
        const identity = rightIdentity(right);
        if (!identity) return null;
        if (!bakers.has(identity.address)) {
            const power = powerByDelegate instanceof Map
                ? powerByDelegate.get(identity.address)
                : powerByDelegate?.[identity.address];
            bakers.set(identity.address, {
                ...identity,
                slots: 0,
                missedBlock: false,
                tier: bakerSizeTier(power, totalPower)
            });
        }
        return bakers.get(identity.address);
    };

    for (const right of Array.isArray(attestationRights) ? attestationRights : []) {
        const baker = ensure(right);
        if (baker) baker.slots += Math.max(0, Number(right?.slots) || 0);
    }
    for (const right of Array.isArray(bakingRights) ? bakingRights : []) {
        const baker = ensure(right);
        if (baker) baker.missedBlock = true;
    }

    const tierRank = { large: 0, medium: 1, small: 2 };
    const rows = [...bakers.values()].sort((left, right) => (
        Number(right.missedBlock) - Number(left.missedBlock)
        || (tierRank[left.tier?.key] ?? 3) - (tierRank[right.tier?.key] ?? 3)
        || right.slots - left.slots
        || left.address.localeCompare(right.address)
    ));
    if (!rows.length) return null;

    const material = rows.filter((row) => row.missedBlock || row.tier?.key === 'large' || row.tier?.key === 'medium');
    if (!material.length) return null;
    const selected = rows.slice(0, Math.max(1, Number(maxNames) || 3));
    const baking = selected.filter((row) => row.missedBlock);
    const attesting = selected.filter((row) => !row.missedBlock && row.slots > 0);
    const parts = [];
    if (baking.length) parts.push(`${baking.map((row) => row.name).join(' · ')} missed ${baking.length === 1 ? 'the block' : 'blocks'}`);
    if (attesting.length) parts.push(`${attesting.map((row) => row.name).join(' · ')} missed attestations`);
    const remainder = Math.max(0, rows.length - selected.length);
    if (remainder) parts.push(`+${remainder} smaller`);

    return Object.freeze({
        text: parts.join(' · '),
        signature: rows.map((row) => `${row.address}:${row.missedBlock ? 1 : 0}:${row.slots}`).join('|'),
        rows: Object.freeze(rows.map(Object.freeze)),
        sampleClipped: Boolean(sampleClipped)
    });
}
