const HOUR_MS = 60 * 60 * 1000;

/**
 * Historical ledgers arrive through GitHub-hosted collectors whose observed
 * delivery can lag their cron schedule. Keep the observation time visible, but
 * reserve the stale alarm for a genuinely missed delivery.
 */
export const HISTORY_FRESHNESS_LIMITS = Object.freeze({
    tezos_history: 5 * HOUR_MS,
    market_history: 5 * HOUR_MS,
    network_health_history: 5 * HOUR_MS,
    governance_period_history: 5 * HOUR_MS,
    tezosx_history: 5 * HOUR_MS
});

/**
 * Generated proofbooks are rebuilt by Refresh Generated Surfaces.
 * This describes the intended schedule, not a guarantee of delivery time.
 */
export const GENERATED_PROOFBOOK_SCHEDULE_MS = 6 * HOUR_MS;
export const GENERATED_PROOFBOOK_STALE_AFTER_MS = 2 * GENERATED_PROOFBOOK_SCHEDULE_MS;
export const GENERATED_PROOFBOOK_SCHEDULE_LABEL = '6h schedule';

function generatedProofbookAgeLabel(ageMs) {
    if (!Number.isFinite(ageMs) || ageMs < 0) return 'age unavailable';
    if (ageMs < 60_000) return 'just now';
    if (ageMs < HOUR_MS) return `${Math.floor(ageMs / 60_000)}m old`;
    if (ageMs < 72 * HOUR_MS) return `${Math.floor(ageMs / HOUR_MS)}h old`;
    return `${Math.floor(ageMs / (24 * HOUR_MS))}d old`;
}

/**
 * A successful fetch does not make an old generated receipt fresh. Consumers
 * use this artifact clock independently from transport failure state so a
 * delayed scheduled workflow cannot continue to look current.
 */
export function generatedProofbookFreshness(value, options = {}) {
    const generatedAt = value instanceof Date ? value.getTime() : Date.parse(value || '');
    const candidateNow = Number(options.now);
    const now = Number.isFinite(candidateNow) ? candidateNow : Date.now();
    const candidateLimit = Number(options.staleAfterMs);
    const staleAfterMs = Number.isFinite(candidateLimit) && candidateLimit > 0
        ? candidateLimit
        : GENERATED_PROOFBOOK_STALE_AFTER_MS;
    if (!Number.isFinite(generatedAt)) {
        return Object.freeze({
            valid: false,
            generatedAt: null,
            ageMs: null,
            ageLabel: 'age unavailable',
            staleAt: null,
            stale: true
        });
    }
    const ageMs = Math.max(0, now - generatedAt);
    return Object.freeze({
        valid: true,
        generatedAt,
        ageMs,
        ageLabel: generatedProofbookAgeLabel(ageMs),
        staleAt: generatedAt + staleAfterMs,
        stale: ageMs >= staleAfterMs
    });
}
