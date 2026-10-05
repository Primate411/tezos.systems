import assert from 'node:assert/strict';
import vm from 'node:vm';
import { waitForStableClickTarget } from './smoke-click-ready.mjs';

export async function checkStableClickTarget() {
  async function fixture({ moveAfterScroll = false, blocked = false, moving = false } = {}) {
    let time = 0;
    let top = 400;
    let scrolls = 0;
    const info = {
      getBoundingClientRect() {
        const box = { x: 20, y: top, left: 20, right: 50, top, bottom: top + 30, width: 30, height: 30 };
        return { ...box, toJSON: () => box };
      },
      contains: hit => hit === info,
      scrollIntoView: () => { top = 400; scrolls += 1; },
      getAnimations: () => []
    };
    const context = vm.createContext({
      innerWidth: 900, innerHeight: 1000, window: { scrollY: 0 },
      performance: { now: () => time },
      document: {
        querySelector: () => info,
        elementFromPoint: (_, y) => blocked ? { outerHTML: '<dialog>blocking overlay</dialog>' } : y < 0 || y > 1000 ? null : info
      }
    });
    const page = {
      async waitForFunction(predicate, selector) {
        for (time = 0; time <= 10000; time += 50) {
          if (moveAfterScroll && time === 50) top = 1200;
          if (moving) top += 0.1;
          context.selector = selector;
          if (vm.runInContext(`(${predicate.toString()})(selector)`, context)) return;
        }
        throw new Error('fixture timeout');
      },
      locator: () => ({ evaluate: async operation => {
        context.info = info;
        return vm.runInContext(`(${operation.toString()})(info)`, context);
      } })
    };
    await waitForStableClickTarget(page, '#fixture', 'fixture');
    return { scrolls, time };
  }
  assert.deepEqual(await fixture(), { scrolls: 0, time: 250 });
  assert.deepEqual(await fixture({ moveAfterScroll: true }), { scrolls: 1, time: 350 }, 'late hydration must re-establish visibility before the full stable interval');
  await assert.rejects(fixture({ blocked: true }), /blocking overlay/, 'an overlay must remain a failure with useful diagnostics');
  await assert.rejects(fixture({ moving: true }), /click target did not settle/, 'continuous movement must remain a failure');
  console.log('ok - click preparation follows late layout shifts without accepting blocked or moving targets');
}
