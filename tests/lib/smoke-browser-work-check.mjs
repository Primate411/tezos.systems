import assert from 'node:assert/strict';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { evaluateBrowserWork } from './smoke-browser-work.mjs';

export async function checkAsyncBrowserWork() {
  const context = vm.createContext({ window: {}, Promise });
  let calls = 0;
  const evaluate = async (operation, argument) => {
    assert.equal(typeof operation, 'function');
    context.argument = argument;
    const result = vm.runInContext(`(${operation.toString()})(argument)`, context);
    assert.equal(typeof result?.then, 'undefined', 'The protocol must only receive synchronous evaluations');
    calls += 1;
    return result;
  };
  const page = {
    async waitForFunction(predicate, argument) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await evaluate(predicate, argument)) return;
        await setImmediate();
      }
      throw new Error('Fixture timed out');
    }
  };

  const first = evaluateBrowserWork(page, evaluate, async (input) => {
    window.executions = (window.executions || 0) + 1;
    await new Promise(resolve => { window.finishFirst = resolve; });
    return { answer: input };
  }, 42);
  const second = evaluateBrowserWork(page, evaluate, async () => {
    window.executions = (window.executions || 0) + 1;
    return 'second';
  });
  assert.equal(await second, 'second', 'Concurrent work must retain independent results');
  assert.equal(context.window.executions, 2);
  context.window.finishFirst();
  assert.equal((await first).answer, 42);
  assert.equal(Object.keys(context.window.__smokeBrowserWork).length, 0, 'Completed receipts must be released');

  await assert.rejects(evaluateBrowserWork(page, evaluate, async () => {
    throw new Error('Fixture assertion failed');
  }), /Fixture assertion failed/);
  assert.equal(Object.keys(context.window.__smokeBrowserWork).length, 0, 'Failed receipts must be released');

  const lostDocument = evaluateBrowserWork(page, evaluate, async () => {
    window.executions += 1;
    await new Promise(resolve => { window.finishLost = resolve; });
  });
  const rejection = assert.rejects(lostDocument, /lost its document/);
  await setImmediate();
  delete context.window.__smokeBrowserWork;
  await rejection;
  context.window.finishLost();
  assert.equal(context.window.executions, 3, 'Document replacement must fail without replaying the operation');
  assert(calls > 0);
  console.log('ok - async browser work preserves results, errors, concurrency, cleanup, and exactly-once execution without protocol promises');
}
