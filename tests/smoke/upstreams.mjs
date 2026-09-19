// Browser workflows owned by upstreams. Shared dependencies remain explicit.
export function createUpstreamsSmokeSuites({
  assert,
  attachIssueCollectors,
  installFeatureMocks,
  log
}) {
  async function smokeTzktThrottle(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
      serviceWorkers: 'block'
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'TzKT throttle', issues);

    const response = await page.goto(`${baseUrl}/tests/fixtures/tzkt-throttle.html`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `TzKT throttle: fixture failed with HTTP ${response?.status()}`);
    await page.waitForFunction(() => window.__tzktThrottle?.patched === true && typeof window.__fetchWithDeadline === 'function', null, { timeout: 5000 });

    const result = await page.evaluate(async () => {
      window.__tzktThrottleStarts.length = 0;
      const start = performance.now();
      const tzktUrls = Array.from(
        { length: 8 },
        (_, index) => `https://api.tzkt.io/v1/head?smoke=${index}`
      );
      const otherUrl = 'https://api.coingecko.com/api/v3/ping';

      await Promise.all([
        ...tzktUrls.map((url) => fetch(url).then((r) => r.json())),
        fetch(otherUrl).then((r) => r.json())
      ]);

      const starts = window.__tzktThrottleStarts.map((entry) => ({
        ...entry,
        delta: entry.at - start
      }));

      return {
        constants: {
          maxRequestsPerSecond: window.__tzktThrottle.maxRequestsPerSecond,
          minSpacingMs: window.__tzktThrottle.minSpacingMs,
          supportsDispatchHook: window.__tzktThrottle.supportsDispatchHook,
          supportsPriority: window.__tzktThrottle.supportsPriority
        },
        other: starts.find((entry) => entry.url.includes('api.coingecko.com')),
        starts,
        tzkt: starts.filter((entry) => entry.url.includes('api.tzkt.io'))
      };
    });

    assert(result.constants.maxRequestsPerSecond === 6, `TzKT throttle: maxRequestsPerSecond mismatch ${result.constants.maxRequestsPerSecond}`);
    assert(result.constants.minSpacingMs >= 167, `TzKT throttle: minSpacingMs should pace six per second, saw ${result.constants.minSpacingMs}`);
    assert(result.constants.supportsDispatchHook === true, 'TzKT throttle: dispatch-aware deadline hook is unavailable');
    assert(result.constants.supportsPriority === true, 'TzKT throttle: interactive priority lane is unavailable');
    assert(result.tzkt.length === 8, `TzKT throttle: expected 8 TzKT starts, saw ${result.tzkt.length}`);
    assert(result.other && result.other.delta < 100, `TzKT throttle: non-TzKT fetch should bypass queue quickly, saw ${JSON.stringify(result.other)}`);

    const tzktDeltas = result.tzkt.map((entry) => entry.delta).sort((a, b) => a - b);
    const firstSevenSpan = tzktDeltas[6] - tzktDeltas[0];
    const totalSpan = tzktDeltas[7] - tzktDeltas[0];
    assert(firstSevenSpan >= 950, `TzKT throttle: seventh request started too soon (${firstSevenSpan.toFixed(1)}ms)`);
    assert(totalSpan >= 1100, `TzKT throttle: eight requests were not paced enough (${totalSpan.toFixed(1)}ms)`);

    for (let i = 0; i < tzktDeltas.length; i += 1) {
      const windowCount = tzktDeltas.filter((delta) => delta >= tzktDeltas[i] && delta < tzktDeltas[i] + 1000).length;
      assert(windowCount <= 6, `TzKT throttle: ${windowCount} requests started inside one second window at ${tzktDeltas[i].toFixed(1)}ms`);
    }

    const deadlineResults = await page.evaluate(async () => {
      const urls = Array.from(
        { length: 8 },
        (_, index) => `https://api.tzkt.io/v1/head?deadline-smoke=${index}`
      );
      return Promise.all(urls.map(async (url) => {
        try {
          await window.__fetchWithDeadline(url, {}, 100);
          return 'ok';
        } catch (error) {
          return error?.name || error?.message || 'error';
        }
      }));
    });
    assert(deadlineResults.every((value) => value === 'ok'), `TzKT throttle: queue wait consumed request deadlines ${JSON.stringify(deadlineResults)}`);

    const priorityStarts = await page.evaluate(async () => {
      window.__tzktThrottleStarts.length = 0;
      const normal = Array.from(
        { length: 4 },
        (_, index) => fetch(`https://api.tzkt.io/v1/head?priority-normal=${index}`)
      );
      const interactive = fetch('https://api.tzkt.io/v1/head?priority-interactive=1', {
        __tezosSystemsPriority: 'interactive'
      });
      await Promise.all([...normal, interactive]);
      return window.__tzktThrottleStarts.map((entry) => entry.url);
    });
    assert(priorityStarts[0]?.includes('priority-interactive=1'), `TzKT throttle: interactive request did not move ahead of queued passive work ${JSON.stringify(priorityStarts)}`);

    const viewportStarts = await page.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', `<section id="priority-top" style="height:200px">Top</section>
        <div style="height:1100px"></div><section id="priority-bottom" style="height:200px">Bottom</section>
        <div id="priority-dialog" role="dialog" hidden style="position:fixed;inset:40px;background:white"><button>Close</button></div>`);
      window.__tzktThrottleStarts.length = 0;
      const work = [
        fetch('https://api.tzkt.io/v1/head?viewport=far', { __tezosSystemsSurface: '#priority-bottom' }),
        fetch('https://api.tzkt.io/v1/head?viewport=detail', { __tezosSystemsSurface: '#priority-top', __tezosSystemsPriority: 'enrichment' }),
        fetch('https://api.tzkt.io/v1/head?viewport=essential', { __tezosSystemsSurface: '#priority-top' })
      ];
      await Promise.all(work);
      return window.__tzktThrottleStarts.map(entry => new URL(entry.url).searchParams.get('viewport'));
    });
    assert(JSON.stringify(viewportStarts) === JSON.stringify(['essential', 'detail', 'far']), `Viewport priority: wrong initial reading order ${JSON.stringify(viewportStarts)}`);

    const scrolledStarts = await page.evaluate(async () => {
      window.__tzktThrottleStarts.length = 0;
      const work = [
        fetch('https://api.tzkt.io/v1/head?scroll=old', { __tezosSystemsSurface: '#priority-top' }),
        fetch('https://api.tzkt.io/v1/head?scroll=new', { __tezosSystemsSurface: '#priority-bottom' })
      ];
      document.querySelector('#priority-bottom').scrollIntoView();
      await Promise.all(work);
      return window.__tzktThrottleStarts.map(entry => new URL(entry.url).searchParams.get('scroll'));
    });
    assert(scrolledStarts[0] === 'new', `Viewport priority: pending requests did not follow scroll ${JSON.stringify(scrolledStarts)}`);

    const chamberStarts = await page.evaluate(async () => {
      const { activateOverlayDialog, deactivateOverlayDialog } = window.__loadTest;
      window.__tzktThrottleStarts.length = 0;
      const background = fetch('https://api.tzkt.io/v1/head?overlay=dashboard', { __tezosSystemsSurface: '#priority-bottom', __tezosSystemsPriority: 'interactive' });
      const dialog = document.querySelector('#priority-dialog');
      dialog.hidden = false;
      activateOverlayDialog(dialog, { dialogSelector: dialog, close: () => deactivateOverlayDialog(dialog), label: 'Priority test' });
      const foreground = fetch('https://api.tzkt.io/v1/head?overlay=chamber');
      await Promise.all([background, foreground]);
      const starts = window.__tzktThrottleStarts.map(entry => new URL(entry.url).searchParams.get('overlay'));
      deactivateOverlayDialog(dialog);
      dialog.hidden = true;
      return starts;
    });
    assert(chamberStarts[0] === 'chamber', `Viewport priority: open chamber lost to dashboard work ${JSON.stringify(chamberStarts)}`);

    const drawerStarts = await page.evaluate(async () => {
      window.__tzktThrottleStarts.length = 0;
      const background = fetch('https://api.tzkt.io/v1/head?drawer=dashboard', { __tezosSystemsSurface: '#priority-bottom' });
      const drawer = document.createElement('aside');
      drawer.id = 'my-tezos-drawer';
      drawer.className = 'open';
      document.body.append(drawer);
      window.dispatchEvent(new Event('my-tezos-drawer-opened'));
      const foreground = fetch('https://api.tzkt.io/v1/head?drawer=dependency');
      await Promise.all([background, foreground]);
      const starts = window.__tzktThrottleStarts.map(entry => new URL(entry.url).searchParams.get('drawer'));
      drawer.remove();
      window.dispatchEvent(new Event('my-tezos-drawer-closed'));
      return starts;
    });
    assert(drawerStarts[0] === 'dependency', `Viewport priority: My Tezos dependency lost to dashboard work ${JSON.stringify(drawerStarts)}`);

    await page.evaluate(() => {
      const { scheduleViewportLoad, beginLoadIntent } = window.__loadTest;
      window.__viewportRuns = [];
      window.__releaseLoadIntent = beginLoadIntent('#priority-dialog');
      scheduleViewportLoad('bottom', '#priority-bottom', () => window.__viewportRuns.push('bottom'));
      scheduleViewportLoad('top', '#priority-top', () => window.__viewportRuns.push('top'));
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert((await page.evaluate(() => window.__viewportRuns.length)) === 0, 'Viewport loading: optional work ran during a chamber open intent');
    await page.evaluate(() => window.__releaseLoadIntent());
    await page.waitForFunction(() => window.__viewportRuns.includes('bottom'));
    assert((await page.evaluate(() => window.__viewportRuns.includes('top'))) === false, 'Viewport loading: far-off section started before the reader approached');
    await page.evaluate(() => document.querySelector('#priority-top').scrollIntoView());
    await page.waitForFunction(() => window.__viewportRuns.includes('top'));

    await page.evaluate(() => {
      const surface = document.querySelector('#priority-top');
      surface.hidden = true;
      window.__hiddenViewportLoad = window.__loadTest.scheduleViewportLoad('reopened', surface, () => window.__viewportRuns.push('reopened'));
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert(!(await page.evaluate(() => window.__viewportRuns.includes('reopened'))), 'Viewport loading: hidden category started optional work');
    const reused = await page.evaluate(() => {
      const surface = document.querySelector('#priority-top');
      surface.hidden = false;
      return window.__hiddenViewportLoad === window.__loadTest.scheduleViewportLoad('reopened', surface, () => {});
    });
    assert(reused, 'Viewport loading: repeated visibility must share the queued work');
    await page.waitForFunction(() => window.__viewportRuns.includes('reopened'));

    const abortedStarts = await page.evaluate(async () => {
      window.__tzktThrottleStarts.length = 0;
      const controller = new AbortController();
      const abandoned = fetch('https://api.tzkt.io/v1/head?cancelled=1', { signal: controller.signal })
        .then(() => 'unexpected', error => error.name);
      controller.abort();
      await fetch('https://api.tzkt.io/v1/head?retained=1');
      return { outcome: await abandoned, urls: window.__tzktThrottleStarts.map(entry => entry.url) };
    });
    assert(abortedStarts.outcome === 'AbortError' && !abortedStarts.urls.some(url => url.includes('cancelled=1')), 'Viewport priority: aborted queued work was still sent');

    await context.close();
    assert(issues.length === 0, `TzKT throttle browser issues:\n${issues.join('\n')}`);
    log('ok - TzKT throttle smoke');
  }

  async function smokeOctezConnectSdkLoader(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    // Keep the real dashboard CSP and wallet loader, but remove unrelated
    // analytics and the worker API that Playwright deliberately blocks. Neither
    // is an SDK upstream; strict collection must still reject every SDK issue.
    await context.route(url => url.hostname === 'gc.zgo.at' && url.pathname === '/count.js', route => route.fulfill({
      status: 200, contentType: 'application/javascript', body: '/* analytics disabled in SDK canary */'
    }));
    await context.addInitScript(() => {
      delete Navigator.prototype.serviceWorker;
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'octez connect sdk loader', issues);
    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `octez connect sdk loader: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    const sdkState = await page.evaluate(async () => {
      const wallet = await import('/js/core/wallet.js');
      const sdk = await wallet.loadOctezConnect();
      const clientPrototype = sdk.DAppClient?.prototype || {};
      return {
        src: wallet.OCTEZ_CONNECT_SRC,
        hasFactory: typeof sdk.getDAppClientInstance === 'function',
        hasDAppClientClass: typeof sdk.DAppClient === 'function',
        network: sdk.NetworkType?.MAINNET,
        transaction: sdk.TezosOperationType?.TRANSACTION,
        delegation: sdk.TezosOperationType?.DELEGATION,
        hasActiveEvent: Boolean(sdk.BeaconEvent?.ACTIVE_ACCOUNT_SET),
        hasPermissionsRequest: typeof clientPrototype.requestPermissions === 'function',
        hasOperationRequest: typeof clientPrototype.requestOperation === 'function',
        hasActiveAccountRead: typeof clientPrototype.getActiveAccount === 'function'
      };
    });

    assert(sdkState.src === 'https://esm.sh/@tezos-x/octez.connect-sdk@4.8.5?bundle', `octez connect sdk loader: unexpected SDK source ${JSON.stringify(sdkState)}`);
    assert(sdkState.hasFactory, `octez connect sdk loader: missing dApp client factory ${JSON.stringify(sdkState)}`);
    assert(sdkState.hasDAppClientClass, `octez connect sdk loader: missing DAppClient class ${JSON.stringify(sdkState)}`);
    assert(sdkState.network === 'mainnet', `octez connect sdk loader: missing mainnet enum ${JSON.stringify(sdkState)}`);
    assert(sdkState.transaction === 'transaction', `octez connect sdk loader: missing transaction operation kind ${JSON.stringify(sdkState)}`);
    assert(sdkState.delegation === 'delegation', `octez connect sdk loader: missing delegation operation kind ${JSON.stringify(sdkState)}`);
    assert(sdkState.hasActiveEvent, `octez connect sdk loader: missing Beacon active account event ${JSON.stringify(sdkState)}`);
    assert(sdkState.hasPermissionsRequest && sdkState.hasOperationRequest && sdkState.hasActiveAccountRead, `octez connect sdk loader: client shape mismatch ${JSON.stringify(sdkState)}`);

    await page.close();
    assert(issues.length === 0, `octez connect sdk loader browser issues:\n${issues.join('\n')}`);

    // A fresh document cannot reuse the successful module. Prove that excluding
    // test-environment noise has not hidden a real upstream import failure.
    const failureIssues = [];
    const failurePage = await context.newPage();
    attachIssueCollectors(failurePage, 'octez connect sdk failure', failureIssues);
    await failurePage.route('https://esm.sh/**', route => route.abort('failed'));
    await failurePage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    const failure = await failurePage.evaluate(async () => {
      const wallet = await import('/js/core/wallet.js');
      try {
        await wallet.loadOctezConnect();
        return '';
      } catch (error) {
        return String(error?.message || error);
      }
    });
    assert(failure, 'octez connect sdk loader: a failed upstream import must reject');
    assert(failureIssues.some(issue => issue.includes('request failed:') && issue.includes('https://esm.sh/')),
      `octez connect sdk loader: upstream failure must reach issue collection ${JSON.stringify(failureIssues)}`);
    await context.close();
    log('ok - octez connect sdk loader');
  }

  async function smokeKrakenWebSocketCanary(browser) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const receipt = await page.evaluate(() => new Promise((resolve, reject) => {
      const socket = new WebSocket('wss://ws.kraken.com/v2');
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        try { socket.close(1000, 'Smoke receipt complete'); } catch {}
        if (error) reject(error);
        else resolve(value);
      };
      const deadline = setTimeout(() => finish(new Error('Kraken ticker snapshot timed out')), 15000);
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({
          method: 'subscribe',
          params: { channel: 'ticker', symbol: ['XU3O8/USD'], event_trigger: 'bbo', snapshot: true },
          req_id: 1
        }));
      });
      socket.addEventListener('message', (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        const row = message?.channel === 'ticker' && Array.isArray(message.data)
          ? message.data.find((entry) => entry?.symbol === 'XU3O8/USD')
          : null;
        if (!row) return;
        finish(null, {
          ask: Number(row.ask),
          bid: Number(row.bid),
          channel: message.channel,
          last: Number(row.last),
          symbol: row.symbol,
          type: message.type
        });
      });
      socket.addEventListener('error', () => finish(new Error('Kraken WebSocket connection failed')));
      socket.addEventListener('close', (event) => {
        if (!settled && event.code !== 1000) finish(new Error(`Kraken WebSocket closed before a ticker snapshot (${event.code})`));
      });
    }));
    await context.close();
    assert(
      receipt.channel === 'ticker'
        && receipt.type === 'snapshot'
        && receipt.symbol === 'XU3O8/USD'
        && [receipt.ask, receipt.bid, receipt.last].every((value) => Number.isFinite(value) && value > 0),
      `Kraken WebSocket canary returned an invalid ticker receipt ${JSON.stringify(receipt)}`
    );
    log('ok - Kraken XU3O8/USD WebSocket ticker canary');
  }

  return { smokeTzktThrottle, smokeOctezConnectSdkLoader, smokeKrakenWebSocketCanary };
}
