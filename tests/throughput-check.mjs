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
    THROUGHPUT_TX_PAGE_LIMIT,
    THROUGHPUT_MAX_LEADING_SKIP
} from '../js/core/throughput.mjs';

assert.equal(THROUGHPUT_MAX_LEADING_SKIP, 3, 'the head-skip bound is part of the contract');

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

// Regression: enrichment trails the head by a few seconds, so the newest row
// is routinely still bare. Anchoring the window on the head made the whole
// reading blank once per block. Bare leading rows are stepped over, bounded,
// and a gap inside a started run still stops it.
{
    const bare = { intervalSeconds: 6, activity: null };
    for (const [lead, expected] of [[0, 6], [1, 6], [2, 6], [3, 6]]) {
        const { blocks, lookup } = window([...Array.from({ length: lead }, () => bare), ...steady(6)]);
        const summary = summarizeThroughput(blocks, lookup);
        assert.equal(summary.state, 'resolved', `${lead} bare leading blocks must still measure`);
        assert.equal(summary.blocks, expected);
        assert.equal(summary.skippedLeadingBlocks, lead);
        near(summary.tps, 30.5);
    }
    // Past the bound the reading refuses rather than drifting away from the head.
    const tooFar = window([bare, bare, bare, bare, ...steady(6)]);
    assert.equal(summarizeThroughput(tooFar.blocks, tooFar.lookup).state, 'loading');
    assert.equal(summarizeThroughput(tooFar.blocks, tooFar.lookup, { maxLeadingSkip: 4 }).blocks, 6);
    // A gap after the run has started is still fatal to the rest of the window.
    const inner = window([bare, ...steady(2), bare, ...steady(4)]);
    const innerSummary = summarizeThroughput(inner.blocks, inner.lookup);
    assert.equal(innerSummary.blocks, 2, 'a gap inside a started run stops it');
    assert.equal(innerSummary.skippedLeadingBlocks, 1);
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

/* ---------------------------------------------------------------------------
 * Surface contracts for the home Live Head throughput rail.
 *
 * The two regression blocks below each reproduce a defect found during
 * rendered browser QA that nothing in the harness had caught.
 * ------------------------------------------------------------------------ */
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const index = read('index.html');
const health = read('js/features/network-health.js');
const heroCss = read('css/hero-search.css');
const styles = read('css/styles.css');
const cleanTheme = read('css/themes/clean.css');

// The rail is a real control with its own receipt, not decoration.
assert(index.includes('id="chain-throughput"'), 'index.html must carry the throughput control');
assert(index.includes('aria-describedby="chain-throughput-legend"'), 'the rail must point at its legend');
assert(index.includes('id="chain-throughput-legend"'), 'the legend must exist');
assert(
    /derived estimate, not a measurement/.test(index),
    'the legend must say the ceiling is derived rather than observed'
);
assert(
    index.indexOf('id="chain-throughput"') < index.indexOf('id="chain-health"'),
    'the throughput rail leads the chain health readout in the controls row'
);

// No new clock and no new fetch: it rides the one heartbeat render path, which
// is already visibility-gated, and reconciles in place.
{
    const updater = health.match(/function updateThroughputRail[\s\S]*?\n\}/)?.[0] || '';
    assert(updater, 'the throughput updater must exist');
    assert(updater.includes('quietlySyncHtml('), 'the rail must reconcile through quiet refresh');
    assert(
        updater.includes('rail.dataset.throughputSignature === signature'),
        'the rail must dedupe on its measured signature'
    );
    for (const banned of ['setInterval', 'setTimeout', 'fetch(', 'scrollIntoView', 'scrollTo']) {
        assert(!updater.includes(banned), `the rail must not ${banned} on a background update`);
    }
    // Regression: a window that cannot measure yet must keep the last good
    // figures instead of blanking them, which happened once per block.
    assert(
        updater.includes("rail.dataset.throughputResolved === 'true'"),
        'the rail must remember that it has resolved before'
    );
    assert(
        /const retaining = summary\.state !== 'resolved' && rail\.dataset\.throughputResolved === 'true';[\s\S]*?if \(retaining\) \{[\s\S]*?rail\.dataset\.feedState = 'stale';[\s\S]*?return;/.test(updater),
        'a pending window must retain the last good reading and mark the surface stale'
    );
    const ticker = health.match(/function updateBlockTicker[\s\S]*?\n\}/)?.[0] || '';
    assert(
        ticker.includes("document.visibilityState !== 'visible'") && ticker.includes('updateThroughputRail(data'),
        'the rail must render only from the visibility-gated heartbeat path'
    );
    assert(
        !/fetchJson\([^)]*\)/.test(health.match(/function liveHeadThroughput[\s\S]*?\n\}/)?.[0] || ''),
        'the throughput window must be read from the existing activity cache, never fetched'
    );
}

// Regression: the heat ramp was first declared on .chain-throughput itself, so
// the element-level custom property outranked the inherited per-theme value and
// the light Clean theme kept the dark-theme amber, illegible on white.
{
    const bands = ['open', 'active', 'busy', 'hot', 'peak'];
    // Anchor on the multi-line declaration block, not the one-line media-query
    // placement rules that share the selector.
    const component = heroCss.match(/\.chain-throughput \{\n[\s\S]*?\n\}/)?.[0] || '';
    assert(component, 'the throughput component rule must exist');
    assert(component.includes('--throughput-fill'), 'the component block must be the one carrying the rail geometry');
    const rootBlocks = heroCss.match(/:root \{\n[\s\S]*?\n\}/g) || [];
    assert(rootBlocks.length, 'a :root block must hold the overridable ramp');
    for (const band of bands) {
        assert(
            !component.includes(`--throughput-${band}:`),
            `--throughput-${band} must not be declared on .chain-throughput, where it would outrank the theme`
        );
        assert(
            rootBlocks.some(block => block.includes(`--throughput-${band}:`)),
            `--throughput-${band} must default at :root so a theme can override it`
        );
        assert(
            new RegExp(`--throughput-${band}:\\s*#[0-9A-Fa-f]{6}`).test(cleanTheme),
            `the light Clean theme must override --throughput-${band}`
        );
        assert(
            heroCss.includes(`[data-throughput-band="${band}"] { --throughput-heat: var(--throughput-${band}); }`),
            `band ${band} must resolve its heat through the overridable token`
        );
    }
    assert(
        styles.includes('--throughput-busy: #B45309;'),
        'the Clean override must live in the stylesheet the theme bundle is generated from'
    );
}

// Regression: adding the rail pushed Chain health, then the hide button, onto
// extra rows of the narrow controls grid because placement was left to
// auto-flow. Every control in that band is placed explicitly.
{
    const narrow = heroCss.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}\n\n/)?.[0] || '';
    assert(narrow.includes('grid-template-columns: max-content minmax(0, 1fr) 30px 30px;'),
        'the narrow controls grid must reserve a column for every control');
    for (const [selector, placement] of [
        ['.chain-throughput', 'grid-column: 1; grid-row: 2;'],
        ['.chain-health', 'grid-column: 2; grid-row: 2;'],
        ['.live-head-filter', 'grid-column: 3; grid-row: 2;'],
        ['.live-head-hide', 'grid-column: 4; grid-row: 2;']
    ]) {
        assert(
            new RegExp(`${selector.replace('.', '\\.')} \\{ ${placement.replace(/[()]/g, '\\$&')}`).test(narrow),
            `${selector} must be placed explicitly in the narrow controls grid`
        );
    }
}

// Regression: the phone layout is owned by a dedicated media block that puts
// Activity and Chain health on one row and floats the filter and hide buttons.
// The rail had no placement there, so it auto-flowed into half of a second row
// and sat next to a dead gap instead of reading as a sibling card.
{
    // The authoritative phone block is the one that sizes the two control cards.
    const phone = heroCss
        .match(/@media \(max-width: 719px\) \{[\s\S]*?\n\}\n/g)
        ?.find(block => block.includes('clamp(110px, 29vw, 140px)')) || '';
    assert(phone, 'the phone controls block must still exist');
    const rail = phone.match(/\.chain-throughput \{[\s\S]*?\n    \}/)?.[0] || '';
    assert(rail, 'the rail must be placed in the phone controls block, not left to auto-flow');
    assert(rail.includes('grid-column: 1 / -1'), 'the rail must take the phone row whole');
    assert(rail.includes('width: 100%'), 'the rail must fill that row rather than leave a gap');
    assert(
        /grid-template-columns:\s*max-content minmax\(0, 1fr\) max-content/.test(rail),
        'the phone rail track must flex to the row width instead of staying at its desktop size'
    );
    assert(
        phone.includes('.chain-throughput-heading { display: contents; }'),
        'the phone card splits into a kicker line and a figures line through display: contents'
    );
    // The desktop fixed track must not leak into the phone block.
    assert(!/grid-template-columns:\s*max-content 56px/.test(phone), 'no fixed desktop track on phones');
}

// Heat is never carried by colour alone, and the one moving part stops for a
// reader who asked for less motion.
assert(heroCss.includes('.chain-throughput-ember'), 'the top bands must add a non-colour hatch');
{
    const reduced = heroCss.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?chain-throughput[\s\S]*?\n\}/)?.[0] || '';
    assert(reduced.includes('animation: none'), 'the peak-band animation must stop under reduced motion');
}
assert(
    /@media \(forced-colors: active\) \{[^}]*\.chain-throughput/.test(heroCss),
    'the rail must have a forced-colors fallback'
);

console.log('ok - throughput rail markup, quiet-refresh wiring, theme ramp and narrow-grid placement');
