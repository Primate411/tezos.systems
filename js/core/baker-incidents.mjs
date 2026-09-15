// TzKT rights describe the level at which an attestation must be sent. Keep
// those levels intact and show only missed duties behind the finalized head.
// https://github.com/baking-bad/tzkt/blob/master/Tzkt.Api/Models/Baking/BakingRight.cs
export const BAKER_INCIDENT_LIMIT = 3;

export function buildBakerIncidents({ rows, head, bakerAddr, observedAt = Date.now() }) {
    if (!Array.isArray(rows) || rows.length > BAKER_INCIDENT_LIMIT
        || !Number.isSafeInteger(head?.level) || head.level < 3
        || !Number.isSafeInteger(head?.cycle) || head.cycle < 0 || !bakerAddr) return null;
    const throughLevel = head.level - 2;
    const seen = new Set();
    const incidents = [];
    for (const row of rows) {
        if (row?.type !== 'attestation' || row.status !== 'missed'
            || row.cycle !== head.cycle || row.baker?.address !== bakerAddr
            || !Number.isSafeInteger(row.level) || row.level <= 0 || row.level > throughLevel
            || !Number.isSafeInteger(row.slots) || row.slots <= 0
            || typeof row.timestamp !== 'string' || !Number.isFinite(Date.parse(row.timestamp))
            || seen.has(row.level)) return null;
        seen.add(row.level);
        incidents.push({ level: row.level, power: row.slots, timestamp: row.timestamp });
    }
    return { bakerAddr, cycle: head.cycle, throughLevel, observedAt, incidents: incidents.sort((a, b) => b.level - a.level) };
}

// The RPC clamps exhausted allowance to zero. It is attestation power, not
// minutes of downtime; an inactive delegate's all-zero response is unusable.
// https://github.com/tezos/tezos-mirror/blob/master/src/proto_025_PsUshuai/lib_protocol/delegate_missed_attestations_storage.ml
export function readAttestationAllowance(participation) {
    if (!Number.isSafeInteger(participation?.expected_cycle_activity) || participation.expected_cycle_activity <= 0
        || !Number.isSafeInteger(participation.remaining_allowed_missed_slots)
        || participation.remaining_allowed_missed_slots < 0) return null;
    const remaining = participation.remaining_allowed_missed_slots;
    return { remaining, state: remaining === 0 ? 'watch' : 'ok' };
}
