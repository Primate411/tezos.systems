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

// Read-only Octez simulation, pinned to Ushuaia. Re-review after upgrades;
// never carry a previous protocol's transfer cost into a new one.
// Reproduction inputs and receipts: tests/fixtures/throughput-batch-receipt.json.
export const TRANSFER_BATCH = Object.freeze({
    protocol: 'PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY',
    level: 15643273,
    count: 250,
    gas: 525540.61,
    followingGas: 2100.04,
    bytes: 14096
});

// A named FA2 example, never a network-wide token-transfer ceiling. Pack only
// measured list sizes rather than extrapolate arbitrary contract execution.
// Same pinned block/protocol as TRANSFER_BATCH; reproduction receipt in tests.
export const FA2_TRANSFER_LISTS = Object.freeze([
    Object.freeze({ count: 250, gas: 295687.761, bytes: 12971 }),
    Object.freeze({ count: 100, gas: 119657.114, bytes: 5321 }),
    Object.freeze({ count: 10, gas: 14040.449, bytes: 731 }),
    Object.freeze({ count: 1, gas: 3479.088, bytes: 272 })
]);

function receiptGas(result) {
    const milligas = finiteNonNegative(result?.consumed_milligas);
    if (milligas !== null) return milligas / 1000;
    return finiteNonNegative(result?.consumed_gas);
}

/**
 * Bound the wire bytes conservatively without maintaining a second protocol
 * encoder in the dashboard. For this reviewed protocol the UTF-8 JSON of the
 * signed inputs is larger than their binary encoding (hex/base58, named fields,
 * decimal integers, Micheline JSON). Metadata is execution output, not payload.
 * This can UNDERSTATE available byte capacity; it never supplies extra room.
 */
function inputByteBound(value) {
    return new TextEncoder().encode(JSON.stringify(value, (key, entry) =>
        key === 'metadata' ? undefined : entry)).length;
}

export function measureCapacityWorkloads(groups, metadata) {
    if (!Array.isArray(groups) || metadata?.protocol !== TRANSFER_BATCH.protocol) return null;
    const byteLimit = finitePositive(metadata?.max_operation_list_length?.[3]?.max_size);
    const operationByteLimit = finitePositive(metadata?.max_operation_data_length);
    if (byteLimit === null || operationByteLimit === null) return null;
    let calls = 0;
    let callGas = 0;
    let callBytes = 0;
    let bytes = 0;
    for (const group of groups) {
        if (!Array.isArray(group?.contents) || !group.contents.length || !group.signature || !group.branch) return null;
        bytes += inputByteBound(group);
        const overhead = inputByteBound({ branch: group.branch, signature: group.signature }) / group.contents.length;
        for (const content of group.contents) {
            const result = content?.metadata?.operation_result;
            if (content.kind !== 'transaction' || !String(content.destination || '').startsWith('KT1')
                || result?.status !== 'applied') continue;
            let gas = receiptGas(result);
            if (gas === null) return null;
            for (const internal of content.metadata.internal_operation_results || []) {
                const cost = receiptGas(internal.result);
                if (cost === null) return null;
                gas += cost;
            }
            calls += 1;
            callGas += gas;
            callBytes += inputByteBound(content) + overhead;
        }
    }
    return { protocol: metadata.protocol, calls, callGas, callBytes, bytes, byteLimit, operationByteLimit };
}

function capacityHeadroom(rows, seconds) {
    const receipts = rows.map(({ activity }) => activity.capacity);
    if (rows.some(({ activity }) => activity.capacityProtocol && activity.capacityProtocol !== TRANSFER_BATCH.protocol)) {
        return { state: 'unsupported', calls: null, transfers: null, fa2Transfers: null, sampledCalls: 0 };
    }
    if (!receipts.length || receipts.some(receipt => !receipt || receipt.protocol !== TRANSFER_BATCH.protocol)) {
        return { state: 'unavailable', calls: null, transfers: null, fa2Transfers: null, sampledCalls: 0 };
    }
    const sampledCalls = receipts.reduce((sum, receipt) => sum + receipt.calls, 0);
    const callGas = receipts.reduce((sum, receipt) => sum + receipt.callGas, 0) / sampledCalls;
    const callBytes = receipts.reduce((sum, receipt) => sum + receipt.callBytes, 0) / sampledCalls;
    let calls = 0;
    let transfers = 0;
    let fa2Transfers = 0;
    for (const { activity } of rows) {
        const receipt = activity.capacity;
        const gas = Math.max(0, activity.gasLimit - activity.gasUsed);
        const bytes = Math.max(0, receipt.byteLimit - receipt.bytes);
        // A JSON bound exceeding the quota does not prove the real block is
        // full. Refuse the estimate instead of reporting a false zero.
        if (receipt.bytes > receipt.byteLimit) return { state: 'bounded-out', calls: null, transfers: null, fa2Transfers: null, sampledCalls };
        if (callGas > 0 && callBytes > 0) calls += Math.floor(Math.min(gas / callGas, bytes / callBytes));
        if (TRANSFER_BATCH.bytes > receipt.operationByteLimit || TRANSFER_BATCH.gas > activity.gasLimit) {
            return { state: 'unsupported', calls: null, transfers: null, fa2Transfers: null, sampledCalls };
        }
        // Allow partial batches but charge every started batch its full
        // measured overhead. Count transfers, never batch envelopes.
        const perTransferGas = TRANSFER_BATCH.followingGas;
        const batchGasOverhead = TRANSFER_BATCH.gas - perTransferGas * TRANSFER_BATCH.count;
        const batchByteOverhead = 96; // 32-byte branch + 64-byte signature
        const perTransferBytes = (TRANSFER_BATCH.bytes - batchByteOverhead) / TRANSFER_BATCH.count;
        let count = Math.floor(Math.min(gas / perTransferGas, bytes / perTransferBytes));
        while (count > 0 && (count * perTransferGas + Math.ceil(count / TRANSFER_BATCH.count) * batchGasOverhead > gas
            || count * perTransferBytes + Math.ceil(count / TRANSFER_BATCH.count) * batchByteOverhead > bytes)) count -= 1;
        transfers += count;
        let fa2Gas = gas;
        let fa2Bytes = bytes;
        for (const list of FA2_TRANSFER_LISTS) {
            if (list.bytes > receipt.operationByteLimit) continue;
            const lists = Math.floor(Math.min(fa2Gas / list.gas, fa2Bytes / list.bytes));
            fa2Transfers += lists * list.count;
            fa2Gas -= lists * list.gas;
            fa2Bytes -= lists * list.bytes;
        }
    }
    return { state: 'resolved', calls: sampledCalls && callGas > 0 ? calls / seconds : null, transfers: transfers / seconds,
        fa2Transfers: fa2Transfers / seconds, sampledCalls, callGas: Number.isFinite(callGas) ? callGas : null };
}

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
    const capacityRows = [];

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
        capacityRows.push({ activity });
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
    const room = capacityHeadroom(capacityRows, seconds);

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
        room,
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
            room.state,
            room.calls,
            room.transfers,
            room.fa2Transfers,
            room.sampledCalls,
            room.callGas,
            atFloor ? 'floor' : 'exact'
        ].join(':')
    };
}
