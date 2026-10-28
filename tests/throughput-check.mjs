/**
 * Contract for the measured throughput/capacity model shared by the home TPS
 * surface. The model may only report what the heartbeat actually measured, so
 * these cases pin the window boundaries, the derived-ceiling qualifier, and
 * every way a partially enriched window must refuse to report.
 */
import assert from 'node:assert/strict';
import {
    summarizeThroughput,
    throughputBand,
    THROUGHPUT_WINDOW_BLOCKS,
    THROUGHPUT_TX_PAGE_LIMIT
} from '../js/core/throughput.mjs';

const near = (actual, expected, tolerance = 1e-9) =>
    assert(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

function window(rows) {
    const activity = new Map();
    const blocks = rows.map((row, index) => {
        const level = 1000 - index;
        if (row.activity !== null) activity.set(level, row.activity);
        return { level, intervalSeconds: row.intervalSeconds };
    });
    return { blocks, lookup: level => activity.get(level) ?? null };
}

const steady = count => Array.from({ length: count }, () => ({
    intervalSeconds: 6,
    activity: { txCount: 183, gasUsed: 807741, gasLimit: 1040000 }
}));

// Measured mainnet shape: ~183 applied transactions per 6s block at ~78% gas.
{
    const { blocks, lookup } = window(steady(10));
    const summary = summarizeThroughput(blocks, lookup);
    assert.equal(summary.state, 'resolved');
    assert.equal(summary.blocks, 10);
    assert.equal(summary.transactions, 1830);
    near(summary.seconds, 60);
    near(summary.tps, 30.5);
    near(summary.fullness, 8077410 / 10400000);
    // The ceiling is exactly the measured rate scaled by the unused gas share.
    near(summary.ceilingTps, summary.tps / summary.fullness);
    near(summary.headroomTps, summary.ceilingTps - summary.tps);
    near(summary.gasPerTransaction, 807741 / 183);
    assert.equal(summary.band, 'busy');
    assert.equal(summary.atFloor, false);
    assert.equal(summary.headLevel, 1000);
    assert.equal(summary.oldestLevel, 991);
}

// The window never runs past its documented depth even with more enriched blocks.
{
    const { blocks, lookup } = window(steady(THROUGHPUT_WINDOW_BLOCKS + 8));
    assert.equal(summarizeThroughput(blocks, lookup).blocks, THROUGHPUT_WINDOW_BLOCKS);
    assert.equal(summarizeThroughput(blocks, lookup, { maxBlocks: 3 }).blocks, 3);
}

// A gap stops the run. Transactions behind an unmeasured block must not be
// folded into a shorter elapsed time, which would overstate the rate.
for (const broken of [
    { intervalSeconds: 6, activity: null },
    { intervalSeconds: null, activity: { txCount: 183, gasUsed: 807741, gasLimit: 1040000 } },
    { intervalSeconds: 6, activity: { txCount: null, gasUsed: 807741, gasLimit: 1040000 } },
    { intervalSeconds: 6, activity: { txCount: 183, gasUsed: null, gasLimit: 1040000 } },
    { intervalSeconds: 6, activity: { txCount: 183, gasUsed: 807741, gasLimit: 0 } }
]) {
    const { blocks, lookup } = window([...steady(2), broken, ...steady(4)]);
    const summary = summarizeThroughput(blocks, lookup);
    assert.equal(summary.blocks, 2, 'the window stops at the first unmeasured block');
    assert.equal(summary.transactions, 366);
    near(summary.seconds, 12);
}

// Nothing enriched yet is loading, not a zero reading.
{
    assert.equal(summarizeThroughput([], () => null).state, 'loading');
    assert.equal(summarizeThroughput(null, null).state, 'loading');
    const { blocks, lookup } = window([{ intervalSeconds: 6, activity: null }]);
    assert.equal(summarizeThroughput(blocks, lookup).state, 'loading');
}

// A genuinely empty block is a real zero reading with no ceiling to derive.
{
    const { blocks, lookup } = window([
        { intervalSeconds: 6, activity: { txCount: 0, gasUsed: 0, gasLimit: 1040000 } }
    ]);
    const summary = summarizeThroughput(blocks, lookup);
    assert.equal(summary.state, 'resolved');
    assert.equal(summary.tps, 0);
    assert.equal(summary.fullness, 0);
    assert.equal(summary.ceilingTps, null, 'no gas burned means no measured cost per transaction');
    assert.equal(summary.headroomTps, null);
    assert.equal(summary.gasPerTransaction, null);
    assert.equal(summary.band, 'open');
}

// A clipped transaction page makes the count a floor, and it must say so.
{
    const { blocks, lookup } = window([{
        intervalSeconds: 6,
        activity: { txCount: THROUGHPUT_TX_PAGE_LIMIT, gasUsed: 1000000, gasLimit: 1040000 }
    }]);
    assert.equal(summarizeThroughput(blocks, lookup).atFloor, true);
    const smaller = summarizeThroughput(blocks, lookup, { txPageLimit: THROUGHPUT_TX_PAGE_LIMIT + 1 });
    assert.equal(smaller.atFloor, false);
}

// Over-limit gas keeps the exact ratio and clamps only the drawing fraction.
{
    const { blocks, lookup } = window([
        { intervalSeconds: 6, activity: { txCount: 200, gasUsed: 1144000, gasLimit: 1040000 } }
    ]);
    const summary = summarizeThroughput(blocks, lookup);
    near(summary.fullness, 1.1);
    assert.equal(summary.fill, 1);
    assert.equal(summary.band, 'peak');
    assert(summary.ceilingTps < summary.tps, 'an over-limit window has no headroom left');
    assert.equal(summary.headroomTps, 0);
}

// Band boundaries are inclusive at their lower edge and shared with the row pill.
for (const [fullness, band] of [
    [0, 'open'], [0.249, 'open'], [0.25, 'active'], [0.599, 'active'],
    [0.6, 'busy'], [0.849, 'busy'], [0.85, 'hot'], [0.969, 'hot'], [0.97, 'peak'], [2, 'peak']
]) assert.equal(throughputBand(fullness), band, `fullness ${fullness}`);
assert.equal(throughputBand(NaN), 'unknown');
assert.equal(throughputBand(null), 'unknown');

// The signature changes with every measured input so quiet refresh can dedupe
// without ever holding a stale reading.
{
    const base = window(steady(4));
    const first = summarizeThroughput(base.blocks, base.lookup).signature;
    const moved = window([...steady(1), ...steady(4)]);
    assert.notEqual(summarizeThroughput(moved.blocks, moved.lookup).signature, first);
    const repeat = window(steady(4));
    assert.equal(summarizeThroughput(repeat.blocks, repeat.lookup).signature, first);
}

console.log('ok - measured throughput window, derived capacity ceiling and refusal boundaries');
