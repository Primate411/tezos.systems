import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('js/effects/vibes.js', 'utf8');
const transition = source.match(/function doThemeTransition\([^]*?\n\}/)?.[0];
assert(transition, 'the actual theme transition must be tested');

function harness() {
    const overlays = [], frames = [], timers = [];
    const context = vm.createContext({
        transitionOverlay: null,
        window: { innerWidth: 390, innerHeight: 844 },
        document: {
            documentElement: {},
            createElement() {
                const classes = new Set();
                const overlay = {
                    isConnected: false, classes,
                    classList: { add: value => classes.add(value) },
                    style: { setProperty() {} },
                    remove() { this.isConnected = false; }
                };
                overlays.push(overlay);
                return overlay;
            },
            body: { appendChild: overlay => { overlay.isConnected = true; } }
        },
        getComputedStyle: () => ({ getPropertyValue: () => '#00d4ff' }),
        requestAnimationFrame: callback => frames.push(callback),
        setTimeout: (callback, delay) => timers.push({ callback, delay })
    });
    return { overlays, frames, timers, context, start: vm.runInContext(`${transition}; doThemeTransition`, context) };
}

const normal = harness();
normal.start('dark');
normal.start('light');
assert.equal(normal.overlays.length, 1, 'active transitions do not overlap');
normal.frames[0]();
assert(normal.overlays[0].classes.has('wipe-in'));
normal.timers.find(timer => timer.delay === 250).callback();
assert(normal.overlays[0].classes.has('wipe-out'));
normal.timers.find(timer => timer.delay === 600).callback();
assert.equal(normal.overlays[0].isConnected, false);
assert.equal(normal.context.transitionOverlay, null);

for (const startAnother of [false, true]) {
    const delayed = harness();
    delayed.start('dark');
    const oldFrame = delayed.frames[0];
    const oldExit = delayed.timers.find(timer => timer.delay === 250).callback;
    delayed.timers.find(timer => timer.delay === 600).callback();
    if (startAnother) delayed.start('light');
    assert.doesNotThrow(oldFrame, 'a delayed frame must tolerate an already removed overlay');
    assert.doesNotThrow(oldExit, 'an obsolete exit callback must tolerate cleanup');
    assert.equal(delayed.overlays[0].classes.size, 0, 'removed overlays are never animated');
    if (startAnother) {
        assert.equal(delayed.overlays[1].classes.size, 0, 'old callbacks cannot animate a newer overlay');
        assert.equal(delayed.context.transitionOverlay, delayed.overlays[1]);
        delayed.frames[1]();
        assert(delayed.overlays[1].classes.has('wipe-in'), 'the new transition retains its own frame');
    }
}
console.log('ok - theme transitions retain overlay ownership through delayed frames and cleanup');
