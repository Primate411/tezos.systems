import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Exercise the served utility against real Text nodes without starting the app. */
export async function smokeLiveTimeLabels(browser, baseUrl, { artifactsDir = '' } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await context.route('**/__live_time_label_contract', route => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Live time label contract</title></head><body><button id="reader">Reader focus</button><main id="labels"></main></body></html>'
    }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/__live_time_label_contract`, { waitUntil: 'domcontentloaded' });
    const evidence = await page.evaluate(async () => {
      const { refreshLiveTimeLabels, setDataFreshnessState, startLiveTimeTicker } = await import('/js/core/utils.js');
      const root = document.getElementById('labels');
      const originalNow = Date.now;
      const base = Date.parse('2026-09-17T12:00:00Z');
      const day = 86_400_000;
      let now = base;
      Date.now = () => now;
      // Freshness attributes have their own contract. This observer measures
      // only writes that replace reader text or its underlying Text nodes.
      const observer = new MutationObserver(() => {});
      observer.observe(root, { subtree: true, childList: true, characterData: true });
      const receipts = [];
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      const iso = value => new Date(value).toISOString();
      const label = (id, dataset) => {
        const element = document.createElement('span');
        element.id = id;
        Object.assign(element.dataset, dataset);
        element.textContent = 'Not rendered';
        root.append(element);
        return element;
      };
      const refresh = () => {
        observer.takeRecords();
        refreshLiveTimeLabels(root);
        return observer.takeRecords().length;
      };
      const oneLabel = (id, dataset) => {
        root.replaceChildren();
        const element = label(id, dataset);
        observer.takeRecords();
        return element;
      };
      const expectLabel = (element, expected, description) => {
        const previous = element.textContent;
        const mutations = refresh();
        check(element.textContent === expected, `${description}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(element.textContent)}`);
        check(mutations === (previous === expected ? 0 : 1), `${description}: expected ${previous === expected ? 0 : 1} text mutation(s), got ${mutations}`);
        const text = element.firstChild;
        check(refresh() === 0 && element.firstChild === text, `${description}: a repeated tick must preserve the Text node`);
        receipts.push({ description, label: expected, mutations });
      };
      try {
        const age = label('steady-age', { liveAge: iso(base - 5 * 60_000), livePrefix: 'Observed ', liveSuffix: ' · source' });
        const countdown = label('steady-countdown', { liveCountdown: iso(base + 330_000), liveSeconds: 'false', livePrefix: 'Next ', liveSuffix: ' remaining' });
        const since = label('steady-since', { liveDurationSince: iso(base - day - 2 * 3_600_000), livePrefix: 'For ', liveSuffix: ' total' });
        const until = label('steady-until', { liveDurationUntil: iso(base + 2 * day + 6 * 3_600_000 + 30_000), livePrefix: 'In ', liveSuffix: ' total' });
        refresh();
        const steadyLabels = [age, countdown, since, until];
        const textNodes = steadyLabels.map(element => element.firstChild);
        const focus = document.getElementById('reader');
        focus.focus();
        const range = document.createRange();
        range.setStart(textNodes[0], 9);
        range.setEnd(textNodes[0], 15);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const selectedText = selection.toString();
        let unchangedMutations = 0;
        for (let tick = 0; tick < 100; tick++) {
          now = base + tick * 10;
          unchangedMutations += refresh();
        }
        check(unchangedMutations === 0, `Unchanged live labels: expected 0 text mutations across 100 refreshes, got ${unchangedMutations}`);
        check(steadyLabels.every((element, index) => element.firstChild === textNodes[index]), 'Unchanged live labels replaced Text node identity');
        check(document.activeElement === focus, 'Unchanged live labels moved reader focus');
        check(selection.toString() === selectedText && selection.anchorNode === textNodes[0] && selection.anchorOffset === 9 && selection.focusNode === textNodes[0] && selection.focusOffset === 15,
          'Unchanged live labels disturbed the exact reader text selection');
        const unchanged = { refreshes: 100, labels: steadyLabels.length, textMutations: unchangedMutations, retainedTextNodes: true, retainedFocus: true, retainedSelection: true, selectedText };

        // Affixes are part of the final displayed string, including whitespace.
        const affix = oneLabel('affix', { liveAge: iso(base - 300_000), livePrefix: 'Seen ', liveSuffix: ' ago source' });
        now = base;
        expectLabel(affix, 'Seen 5m ago ago source', 'initial prefix and suffix');
        affix.dataset.livePrefix = 'Updated: ';
        expectLabel(affix, 'Updated: 5m ago ago source', 'changed prefix');
        affix.dataset.liveSuffix = ' · TzKT';
        expectLabel(affix, 'Updated: 5m ago · TzKT', 'changed suffix');
        affix.dataset.livePrefix = '  ';
        affix.dataset.liveSuffix = ' ';
        expectLabel(affix, '  5m ago ', 'whitespace affixes');
        affix.textContent = 'Externally changed';
        expectLabel(affix, '  5m ago ', 'externally drifted text is corrected');
        // A last-rendered-string cache could miss this second independent drift.
        affix.firstChild.data = 'Externally changed again';
        expectLabel(affix, '  5m ago ', 'externally drifted Text data is corrected');
        delete affix.dataset.livePrefix;
        delete affix.dataset.liveSuffix;
        expectLabel(affix, '5m ago', 'removed affixes');

        const ageBoundary = oneLabel('age-boundary', { liveAge: iso(base) });
        for (const [elapsed, expected] of [
          [-1000, 'just now'], [0, 'just now'], [9999, 'just now'], [10_000, '10s ago'], [10_999, '10s ago'], [11_000, '11s ago'],
          [59_999, '59s ago'], [60_000, '1m ago'], [119_999, '1m ago'], [120_000, '2m ago'],
          [3_599_999, '59m ago'], [3_600_000, '1h ago'], [7_199_999, '1h ago'], [7_200_000, '2h ago'],
          [day - 1, '23h ago'], [day, '1d ago'], [2 * day - 1, '1d ago'], [2 * day, '2d ago'],
          [365 * day - 1, '364d ago'], [365 * day, '1y ago'], [730 * day - 1, '1y ago'], [730 * day, '2y ago']
        ]) {
          now = base + elapsed;
          expectLabel(ageBoundary, expected, `age boundary ${elapsed}ms`);
        }
        for (const invalid of ['', 'invalid timestamp']) {
          ageBoundary.dataset.liveAge = invalid;
          expectLabel(ageBoundary, 'time unknown', `invalid age ${JSON.stringify(invalid)}`);
        }

        const durations = [
          [0, '0s', '0s'], [999, '0s', '0s'], [1000, '1s', '1s'], [59_999, '59s', '59s'],
          [60_000, '1m 0s', '1m'], [61_000, '1m 1s', '1m'], [119_999, '1m 59s', '1m'], [120_000, '2m 0s', '2m'],
          [3_599_999, '59m 59s', '59m'], [3_600_000, '1h 0m 0s', '1h 0m'], [3_601_000, '1h 0m 1s', '1h 0m'],
          [day - 1, '23h 59m 59s', '23h 59m'], [day, '1d 0h', '1d 0h'],
          [day + 3_599_999, '1d 0h', '1d 0h'], [day + 3_600_000, '1d 1h', '1d 1h'], [365 * day, '365d 0h', '365d 0h']
        ];
        for (const seconds of ['true', 'false']) {
          for (const attribute of ['liveDurationSince', 'liveDurationUntil']) {
            const duration = oneLabel(`${attribute}-${seconds}`, { [attribute]: iso(base), liveSeconds: seconds });
            for (const [elapsed, withSeconds, withoutSeconds] of durations) {
              now = attribute === 'liveDurationSince' ? base + elapsed : base - elapsed;
              expectLabel(duration, seconds === 'true' ? withSeconds : withoutSeconds, `${attribute} seconds=${seconds} boundary ${elapsed}ms`);
            }
            now = attribute === 'liveDurationSince' ? base - 61_000 : base + 61_000;
            expectLabel(duration, seconds === 'true' ? '1m 1s' : '1m', `${attribute} keeps absolute elapsed duration after crossing zero`);
            duration.dataset[attribute] = 'invalid timestamp';
            expectLabel(duration, 'unknown', `${attribute} invalid timestamp`);
          }
          const remaining = oneLabel(`countdown-${seconds}`, { liveCountdown: iso(base), liveSeconds: seconds, liveEnded: 'Complete', liveEmpty: 'Not scheduled' });
          for (const [duration, withSeconds, withoutSeconds] of [...durations].reverse()) {
            now = base - duration;
            expectLabel(remaining, duration === 0 ? 'Complete' : seconds === 'true' ? withSeconds : withoutSeconds, `countdown seconds=${seconds} remaining ${duration}ms`);
          }
          now = base + 1000;
          expectLabel(remaining, 'Complete', `countdown seconds=${seconds} remains ended`);
          delete remaining.dataset.liveEnded;
          expectLabel(remaining, 'Ended', `countdown seconds=${seconds} default ended label`);
          remaining.dataset.liveCountdown = 'invalid timestamp';
          expectLabel(remaining, 'Not scheduled', `countdown seconds=${seconds} custom invalid label`);
          delete remaining.dataset.liveEmpty;
          expectLabel(remaining, 'Timing unknown', `countdown seconds=${seconds} default invalid label`);
        }
        const defaultSeconds = oneLabel('default-countdown-seconds', { liveCountdown: iso(base) });
        now = base - 61_000;
        expectLabel(defaultSeconds, '1m 1s', 'countdown includes seconds by default');

        // A stale threshold can fall inside one age-label bucket. Skipping text
        // writes must not skip independent freshness state or its exact boundary.
        const freshness = oneLabel('freshness', { liveAge: iso(base) });
        now = base + 60_000;
        setDataFreshnessState(freshness, iso(base), 90_000);
        expectLabel(freshness, '1m ago', 'freshness initial label');
        const freshnessText = freshness.firstChild;
        now = base + 90_000;
        expectLabel(freshness, '1m ago', 'freshness exact stale threshold');
        check(freshness.dataset.freshnessState === 'fresh' && !freshness.classList.contains('chamber-data-stale'), 'Exact stale threshold must remain fresh');
        now++;
        expectLabel(freshness, '1m ago', 'freshness crosses stale threshold without changing age label');
        check(freshness.dataset.freshnessState === 'stale' && freshness.classList.contains('chamber-data-stale'), 'Freshness must turn stale even when visible text is unchanged');
        check(freshness.firstChild === freshnessText, 'Freshness-only transition replaced the Text node');
        now = base + 60_000;
        expectLabel(freshness, '1m ago', 'freshness returns to fresh without changing age label');
        check(freshness.dataset.freshnessState === 'fresh' && !freshness.classList.contains('chamber-data-stale'), 'Freshness recovery must still clear stale styling');

        const tickerLabel = oneLabel('ticker', { liveAge: iso(base) });
        const originalInterval = window.setInterval;
        const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
        let visibility = 'visible';
        let timerCalls = 0;
        let callback;
        let interval;
        const tickerMutations = {};
        try {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
          window.setInterval = (fn, delay) => { timerCalls++; callback = fn; interval = delay; return 4242; };
          now = base + 10_000;
          observer.takeRecords();
          const timer = startLiveTimeTicker(root);
          tickerMutations.initial = observer.takeRecords().length;
          check(tickerLabel.textContent === '10s ago' && tickerMutations.initial === 1, 'Starting the ticker must immediately render current time');
          check(interval === 1000 && typeof callback === 'function', 'Ticker must retain its one-second callback');
          const sameTimer = startLiveTimeTicker(root);
          tickerMutations.duplicateStart = observer.takeRecords().length;
          check(timer === 4242 && sameTimer === timer && timerCalls === 1, 'Repeated ticker setup must retain one registered interval');
          check(tickerMutations.duplicateStart === 0, 'Repeated ticker setup must not rewrite unchanged labels');
          const tick = () => { observer.takeRecords(); callback(); return observer.takeRecords().length; };
          now = base + 11_000;
          tickerMutations.visible = tick();
          check(tickerLabel.textContent === '11s ago' && tickerMutations.visible === 1, 'Visible ticker updates a changed label once');
          const hiddenText = tickerLabel.firstChild;
          visibility = 'hidden';
          now = base + 13_000;
          tickerMutations.hidden = tick();
          check(tickerLabel.textContent === '11s ago' && tickerLabel.firstChild === hiddenText && tickerMutations.hidden === 0, 'Hidden ticker does not update text');
          visibility = 'visible';
          tickerMutations.catchUp = tick();
          check(tickerLabel.textContent === '13s ago' && tickerMutations.catchUp === 1, 'Next visible tick catches up exactly once');
          tickerMutations.unchanged = tick();
          check(tickerMutations.unchanged === 0, 'Next unchanged ticker callback preserves text');
        } finally {
          window.setInterval = originalInterval;
          if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
          else delete document.visibilityState;
        }
        return { unchanged, checkedTransitions: receipts.length, transitions: receipts, ticker: { interval, registrations: timerCalls, textMutations: tickerMutations }, freshnessTransition: { retainedTextNode: true, exactThresholdFresh: true, crossedThresholdStale: true, recoveredFresh: true } };
      } finally {
        observer.disconnect();
        Date.now = originalNow;
      }
    });
    assert.deepEqual(errors, [], 'isolated live-time label test has no browser errors');
    if (artifactsDir) {
      await mkdir(artifactsDir, { recursive: true });
      await writeFile(path.join(artifactsDir, 'live-time-labels.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    }
    console.log(`ok - live-time labels: ${evidence.unchanged.refreshes} unchanged refreshes preserve ${evidence.unchanged.labels} Text nodes, selection and focus; ${evidence.checkedTransitions} time/affix/freshness transitions`);
    return evidence;
  } finally {
    await context.close();
  }
}
