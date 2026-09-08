let nextWorkId = 0;

// CDP weakly awaits evaluation promises. A GC during an async fixture can
// collect that promise even though the page and operation remain alive.
// Dispatch once, retain the result in the page, and poll a synchronous receipt.
export async function evaluateBrowserWork(page, evaluate, operation, argument) {
  const id = `work-${++nextWorkId}`;
  const source = `({ id, argument }) => {
    const receipts = window.__smokeBrowserWork ||= Object.create(null);
    const receipt = receipts[id] = { done: false };
    receipt.work = Promise.resolve().then(() => (${operation.toString()})(argument)).then(
      value => { receipt.value = value; receipt.done = true; },
      error => { receipt.error = { message: String(error?.message || error), stack: error?.stack }; receipt.done = true; }
    );
  }`;
  // Compile the trusted test callback in Node so Playwright receives a function,
  // not a string expression (which it would evaluate without invoking).
  const dispatch = new Function(`return (${source});`)();
  await evaluate(dispatch, { id, argument });
  try {
    await page.waitForFunction(id => {
      const receipt = window.__smokeBrowserWork?.[id];
      return !receipt || receipt.done;
    }, id, { polling: 50, timeout: 0 });
    const result = await evaluate(id => {
      const receipt = window.__smokeBrowserWork?.[id];
      if (!receipt) throw new Error('Async smoke operation lost its document before completing');
      return { value: receipt.value, error: receipt.error };
    }, id);
    if (result.error) {
      const error = new Error(result.error.message);
      if (result.error.stack) error.stack = result.error.stack;
      throw error;
    }
    return result.value;
  } finally {
    await evaluate(id => { delete window.__smokeBrowserWork?.[id]; }, id).catch(() => {});
  }
}

export function instrumentBrowserForAsyncWork(browser) {
  const instrumentPage = page => {
    const evaluate = page.evaluate.bind(page);
    page.evaluate = (operation, argument) => operation?.constructor?.name === 'AsyncFunction'
      ? evaluateBrowserWork(page, evaluate, operation, argument)
      : evaluate(operation, argument);
  };
  return new Proxy(browser, {
    get(target, property) {
      if (property === 'newContext') return async (...args) => {
        const context = await target.newContext(...args);
        context.on('page', instrumentPage);
        return context;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
