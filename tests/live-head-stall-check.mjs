import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/features/network-health.js', import.meta.url), 'utf8');
const formatter = source.match(/function formatLiveHeadStallDuration\(milliseconds\) \{[\s\S]*?\n\}/)?.[0];
assert(formatter, 'the stall duration formatter must exist');
const format = vm.runInNewContext(`(${formatter})`);
for (const [seconds, expected] of [
    [-1, '0 seconds'], [0, '0 seconds'], [1, '1 second'], [59, '59 seconds'],
    [60, '1 minute'], [61, '1 minute 1 second'], [134, '2 minutes 14 seconds'],
    [3599, '59 minutes 59 seconds'], [3600, '1 hour'], [3660, '1 hour 1 minute'],
    [86399, '23 hours 59 minutes'], [86400, '1 day'], [90000, '1 day 1 hour'],
    [183600, '2 days 3 hours'], [31536000, '1 year'], [31622400, '1 year 1 day']
]) assert.equal(format(seconds * 1000), expected);
assert.equal(format(NaN), '0 seconds');
assert.equal(format(Infinity), '0 seconds');

function createDetector() {
    let now = Date.parse('2026-09-19T12:00:00Z');
    const nodes = new Map();
    const node = key => {
        if (!nodes.has(key)) nodes.set(key, {
            dataset: {}, textContent: '', hidden: true,
            setAttribute() {}, addEventListener() {}, querySelector: node
        });
        return nodes.get(key);
    };
    class Clock extends Date { static now() { return now; } }
    const extract = name => {
        const declaration = source.match(new RegExp(`(?:const|let) ${name} = [^;]+;`))?.[0];
        assert(declaration, `missing detector declaration: ${name}`);
        return declaration;
    };
    const functionSource = name => {
        const declaration = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0];
        assert(declaration, `missing detector function: ${name}`);
        return declaration;
    };
    const detector = vm.runInNewContext(`
        ${['LIVE_REFRESH_INTERVAL', 'LIVE_HEAD_DELAYED_AFTER', 'LIVE_HEAD_STALLED_AFTER',
        'LIVE_HEAD_CONFIRMATION_MAX_AGE', 'liveHeadConfirmedAt', 'liveHeadConfirmedLevel',
        'liveHeadStallLatchedLevel', 'liveHeadResumePendingLevel'].map(extract).join('\n')}
        ${formatter}
        ${functionSource('confirmLiveHeadObservation')}
        ${functionSource('updateLiveHeadStallAlert')}
        ({ confirm: confirmLiveHeadObservation, update: updateLiveHeadStallAlert })
    `, { Date: Clock, document: { getElementById: node }, formatCount: String, openNetworkHealthChamber() {} });
    return {
        ...detector, node,
        advance(milliseconds) { now += milliseconds; },
        head(age, level = 100) { return { blocks: [{ level, timestamp: new Date(now - age).toISOString() }] }; },
        state() { return node('live-head').dataset.chainState; }
    };
}

for (const [age, expected] of [[0, 'live'], [17999, 'live'], [18000, 'delayed'], [23999, 'delayed'], [24000, 'stalled']]) {
    const detector = createDetector();
    const head = detector.head(age);
    detector.confirm(head);
    detector.update(head);
    assert.equal(detector.state(), expected, `confirmed head age ${age}ms`);
    assert.equal(detector.node('[data-live-head-alert-label]').textContent === 'CHAIN STALLED', expected === 'stalled');
    assert.equal(detector.node('chain-stall-announcer').textContent.includes('chain stalled'), expected === 'stalled');
}

const detector = createDetector();
const oldHead = detector.head(24000);
detector.update(oldHead);
assert.equal(detector.state(), 'warming', 'cached timestamps cannot establish a stall');
detector.confirm(oldHead);
detector.update(oldHead, { error: true });
assert.equal(detector.state(), 'source-delayed', 'a source failure cannot establish a stall');
detector.advance(14001);
detector.update(oldHead);
assert.equal(detector.state(), 'warming', 'expired confirmation cannot establish a stall');
detector.confirm(oldHead);
detector.update(oldHead);
assert.equal(detector.state(), 'stalled');
detector.advance(20000);
detector.update(oldHead, { error: true });
assert.equal(detector.state(), 'stalled', 'a confirmed stall stays latched through source failures');
detector.confirm(oldHead);
detector.update(oldHead);
assert.equal(detector.state(), 'stalled', 'reconfirming the same head cannot clear a stall');
const freshHead = detector.head(0, 101);
detector.confirm(freshHead);
detector.update(freshHead);
assert.equal(detector.state(), 'live', 'a confirmed newer block clears the stall');
assert.equal(detector.node('live-head-alert').hidden, true);
assert.match(detector.node('chain-stall-announcer').textContent, /resumed at block 101/);
console.log('Live Head stall duration, 24-second boundary, source confirmation, latching and recovery passed');
