import assert from 'node:assert/strict';
import vm from 'node:vm';
import { waitForSettledAnimations } from './smoke-animation-ready.mjs';

export async function checkSettledAnimations() {
  const animation = (playState, iterations = 1, pending = false) => ({
    playState, pending, effect: { getComputedTiming: () => ({ iterations }) },
    get finished() { throw new Error('must not await unbounded animation promises'); }
  });
  async function fixture(animations, { missing = false, settleAfter = 0 } = {}) {
    let polls = 0;
    const root = { getAnimations: options => {
      assert.equal(options.subtree, true);
      return animations;
    } };
    const context = vm.createContext({ document: {
      getAnimations: () => { throw new Error('unrelated page animations must be excluded'); },
      querySelectorAll: selector => { assert.equal(selector, '#surface'); return missing ? [] : [root]; }
    } });
    const page = { async waitForFunction(predicate, selector, options) {
      assert.equal(options.timeout, 5000, 'all waits have a finite deadline');
      assert.equal(options.polling, 50);
      context.selector = selector;
      for (polls = 1; polls <= 100; polls++) {
        if (polls === settleAfter) animations.splice(0);
        if (vm.runInContext(`(${predicate.toString()})(selector)`, context)) return;
      }
      throw new Error('bounded animation timeout');
    } };
    await waitForSettledAnimations(page, '#surface');
    return polls;
  }
  assert.equal(await fixture([animation('paused'), animation('finished'), animation('running', Infinity)]), 1);
  assert.equal(await fixture([animation('running')], { settleAfter: 3 }), 3);
  await assert.rejects(fixture([animation('running')]), /bounded animation timeout/);
  await assert.rejects(fixture([animation('paused', 1, true)]), /bounded animation timeout/);
  await assert.rejects(fixture([], { missing: true }), /bounded animation timeout/);
  console.log('ok - animation readiness is scoped, bounded, and independent of paused or perpetual page effects');
}
