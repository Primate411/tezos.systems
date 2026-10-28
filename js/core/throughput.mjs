/**
 * Measured Tezos L1 throughput and block-capacity pressure.
 *
 * Everything here is reconstructed from receipts the Live Head heartbeat has
 * already fetched: applied transaction counts per block, exact outer plus
 * internal manager-operation gas, the active `hard_gas_limit_per_block`, and
 * the real wall-clock interval between consecutive block timestamps. No clock
 * is assumed and no protocol target is substituted for a measurement.
 *
 * The capacity ceiling is a derived estimate, not an observation. It answers
 * one narrow question: if the chain kept accepting the exact transaction mix
 * it is processing right now, how many of those transactions per second would
 * fill the block gas limit? A different mix has a different ceiling, so every
 * surface that renders it must keep the "at this mix" qualifier attached.
 */

export const THROUGHPUT_WINDOW_BLOCKS = 10;

/**
 * How many unenriched blocks at the head the window may step over.
 *
 * Enrichment lands a few seconds behind each new block, so the newest row is
 * routinely still bare. Anchoring the window on the head would blank the whole
 * reading once per block; stepping over a bounded number of bare leading rows
 * keeps the measurement continuous without ever drifting far from the head.
 */
export const THROUGHPUT_MAX_LEADING_SKIP = 3;

/** Matches the Live Head per-level applied-transaction page size. */
export const THROUGHPUT_TX_PAGE_LIMIT = 10000;

/**
 * Shared display bands. These mirror the per-row Live Head gas pill so one
 * block reading and the aggregate reading never disagree about what "hot"
 * means. `peak` only exists on the aggregate, where a sustained window sitting
 * against the limit is a different statement from one full block.
 */
export const THROUGHPUT_BANDS = [
    { band: 'open', minFullness: 0 },
    { band: 'active', minFullness: 0.25 },
    { band: 'busy', minFullness: 0.6 },
    { band: 'hot', minFullness: 0.85 },
    { band: 'peak', minFullness: 0.97 }
];

export function throughputBand(fullness) {
    if (!Number.isFinite(fullness)) return 'unknown';
    let resolved = 'open';
    for (const entry of THROUGHPUT_BANDS) {
        if (fullness >= entry.minFullness) resolved = entry.band;
    }
    return resolved;
}

/**
 * A missing receipt is null or undefined, never a measured zero. `Number(null)`
 * is 0, so the absent-value guard has to come before any numeric coercion or a
 * failed fetch would silently read as an empty block.
 */
function measured(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function finitePositive(value) {
    const number = measured(value);
    return number !== null && number > 0 ? number : null;
}

function finiteNonNegative(value) {
    const number = measured(value);
    return number !== null && number >= 0 ? number : null;
}

/**
 * Fold the newest contiguous run of fully-measured blocks into one window.
 *
 * A block contributes only when it carries all three of its own receipts: an
 * applied transaction count, an exact gas pair, and a measured interval to the
 * block before it. Once the run has started it stops at the first block missing
 * any of them, so a half-enriched tail can never quietly shorten the measured
 * seconds while keeping the transactions that belong to it. Before the run
 * starts, a bounded number of still-bare blocks at the head may be stepped over.
 */
export function summarizeThroughput(blocks, activityFor, options = {}) {
    const maxBlocks = Number.isFinite(options.maxBlocks) && options.maxBlocks > 0
        ? Math.floor(options.maxBlocks)
        : THROUGHPUT_WINDOW_BLOCKS;
    const txPageLimit = Number.isFinite(options.txPageLimit) && options.txPageLimit > 0
        ? options.txPageLimit
        : THROUGHPUT_TX_PAGE_LIMIT;
    const maxLeadingSkip = Number.isFinite(options.maxLeadingSkip) && options.maxLeadingSkip >= 0
        ? Math.floor(options.maxLeadingSkip)
        : THROUGHPUT_MAX_LEADING_SKIP;
    const rows = Array.isArray(blocks) ? blocks : [];
    const lookup = typeof activityFor === 'function' ? activityFor : () => null;

    let transactions = 0;
    let seconds = 0;
    let gasUsed = 0;
    let gasLimit = 0;
    let counted = 0;
    let skipped = 0;
    let atFloor = false;
    let headLevel = null;
    let oldestLevel = null;

    for (const block of rows) {
        if (counted >= maxBlocks) break;
        const level = Number(block?.level);
        const interval = finitePositive(block?.intervalSeconds);
        const activity = Number.isFinite(level) ? lookup(level) || null : null;
        const txCount = finiteNonNegative(activity?.txCount);
        const blockGasUsed = finiteNonNegative(activity?.gasUsed);
        const blockGasLimit = finitePositive(activity?.gasLimit);
        const measurable = Number.isFinite(level)
            && interval !== null
            && txCount !== null
            && blockGasUsed !== null
            && blockGasLimit !== null;

        if (!measurable) {
            // Enrichment trails the head by a few seconds. Step over those bare
            // rows, but never over a gap inside a run already being measured.
            if (counted === 0 && skipped < maxLeadingSkip) {
                skipped += 1;
                continue;
            }
            break;
        }

        if (txCount >= txPageLimit) atFloor = true;
        transactions += txCount;
        seconds += interval;
        gasUsed += blockGasUsed;
        gasLimit += blockGasLimit;
        counted += 1;
        if (headLevel === null) headLevel = level;
        oldestLevel = level;
    }

    if (!counted || seconds <= 0 || gasLimit <= 0) {
        return {
            state: counted ? 'unavailable' : 'loading',
            blocks: counted,
            skippedLeadingBlocks: skipped,
            signature: counted ? `tps:unavailable:${counted}` : 'tps:loading'
        };
    }

    const tps = transactions / seconds;
    const fullness = gasUsed / gasLimit;
    // The ceiling only means something while the window actually burned gas.
    // An empty window has no measured gas cost per transaction to extrapolate.
    const ceilingTps = fullness > 0 ? tps / fullness : null;
    const band = throughputBand(fullness);

    return {
        state: 'resolved',
        blocks: counted,
        headLevel,
        oldestLevel,
        transactions,
        seconds,
        gasUsed,
        gasLimit,
        tps,
        fullness,
        // Clamped only for geometry. `fullness` keeps the exact measured ratio.
        fill: Math.max(0, Math.min(1, fullness)),
        ceilingTps,
        headroomTps: ceilingTps === null ? null : Math.max(0, ceilingTps - tps),
        gasPerTransaction: transactions > 0 ? gasUsed / transactions : null,
        band,
        atFloor,
        skippedLeadingBlocks: skipped,
        signature: [
            'tps',
            counted,
            headLevel,
            transactions,
            seconds.toFixed(3),
            Math.round(gasUsed),
            gasLimit,
            atFloor ? 'floor' : 'exact'
        ].join(':')
    };
}
