import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function smokeLiveHeadReadability(browser, baseUrl, { installFeatureMocks, artifactsDir }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'no-preference'
  });
  await installFeatureMocks(context, { blockHeadAutoAdvance: false });
  let head = 12345678;
  let round = 0;
  let bakingUnavailable = false;
  let omitRoundOne = false;
  await context.route('**/v1/blocks?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('limit') !== '26' || !params.get('select')?.includes('attestationCommittee')) return route.fallback();
    const blocks = Array.from({ length: 26 }, (_, i) => ({
      level: head - i, cycle: 1143, proto: 25,
      timestamp: new Date(Date.now() - i * 6000).toISOString(),
      producer: { address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb', alias: 'QA Baker' },
      attestationPower: [7000, 6997, 6890, 4667, 4500, 0, null][i % 7],
      attestationCommittee: 7000, blockRound: i === 0 ? round : i % 3, payloadRound: 0
    }));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(blocks) });
  });
  await context.route('**/v1/rights?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('type') !== 'baking' || !params.has('level.in')) return route.fallback();
    if (bakingUnavailable) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    const rights = params.get('level.in').split(',').flatMap((level) => [1, 0, 2].map((rightRound) => ({
      type: 'baking', status: omitRoundOne && rightRound === 1 ? 'realized' : 'missed',
      level: Number(level), round: rightRound,
      baker: {
        address: rightRound === 0 ? 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb' : 'tz1aWXP237BLwNHJcCD4b3DutCevhqq2T1Z9',
        alias: `Round ${rightRound} Baker`
      }
    })));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rights) });
  });
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'clean');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    localStorage.setItem('tezos-systems-live-head-depth-v1', JSON.stringify({ version: 1, expanded: true }));
    localStorage.setItem('tezos-systems-live-head-activity-filter-v3', '[]');
    localStorage.setItem('tezos-systems-contested-round-hot-signal-at', String(Date.now()));
    window.__roundAlerts = [];
    window.addEventListener('hot-signal', ({ detail }) => {
      if (detail?.id?.startsWith('contested-round-')) window.__roundAlerts.push(detail);
    });
    // Observe every paint from initial insertion through new-row arrival. A delayed
    // full -> zero -> full sweep used to flash the rail backing at its right edge.
    window.__railPaints = {};
    const sampleRailPaint = (now) => {
      for (const row of document.querySelectorAll('#live-head-stack [data-safety-margin]')) {
        const fill = row.querySelector('.live-head-power-fill');
        if (!fill) continue;
        const style = getComputedStyle(fill);
        const actual = parseFloat(style.width);
        const expected = Number(style.getPropertyValue('--live-head-margin'));
        const sample = window.__railPaints[row.dataset.liveHeadLevel] ||= {
          first: now, last: now, frames: 0, maxWidthError: 0, maxAnimations: 0
        };
        sample.last = now;
        sample.frames += 1;
        sample.maxWidthError = Math.max(sample.maxWidthError, Math.abs(actual - expected * fill.parentElement.clientWidth));
        sample.maxAnimations = Math.max(sample.maxAnimations, fill.getAnimations().length);
      }
      requestAnimationFrame(sampleRailPaint);
    };
    requestAnimationFrame(sampleRailPaint);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#live-head-stack [data-safety-margin]').length === 10);
  const assertStablePaint = async (level) => {
    await page.waitForFunction((key) => {
      const sample = window.__railPaints[key];
      return sample?.frames >= 10 && sample.last - sample.first >= 600;
    }, level);
    const paints = await page.evaluate((key) => window.__railPaints[key], level);
    assert(paints.maxWidthError < 0.05 && paints.maxAnimations === 0,
      `Rail ${level} must keep its factual width from first paint through row entrance: ${JSON.stringify(paints)}`);
  };
  await assertStablePaint(head);
  await page.evaluate(async () => {
    const { versionedAsset } = await import('/js/core/asset-version.js');
    const { refreshNetworkHealth } = await import(versionedAsset('/js/features/network-health.js'));
    window.__refreshReadableHead = refreshNetworkHealth;
    await refreshNetworkHealth();
  });
  const alertState = () => page.evaluate(() => ({
    alerts: window.__roundAlerts,
    cooldown: localStorage.getItem('tezos-systems-contested-round-r2-signal-at')
  }));
  assert.deepEqual(await alertState(), { alerts: [], cooldown: null }, 'R0 head stays out of Live Pulse even with older R2 receipts');
  console.log('ok - R0 stays out of round news');
  for (const nextRound of [1, 2, 3]) {
    round = nextRound;
    head += 1;
    await page.evaluate(() => window.__refreshReadableHead());
    await page.waitForFunction(({ level, expectedRound }) => {
      const row = document.querySelector('#live-head-stack [data-live-head-level]');
      return Number(row?.dataset.liveHeadLevel) === level
        && row.querySelector('.health-round-badge')?.textContent.trim() === `R${expectedRound}`;
    }, { level: head, expectedRound: round });
    await assertStablePaint(head);
    const state = await alertState();
    if (round === 1) {
      assert.deepEqual(state, { alerts: [], cooldown: null }, 'R1 is a receipt only and does not consume the news cooldown');
    } else {
      assert.equal(state.alerts.length, 1, 'R2 emits once; supplemental updates and R3 respect the existing cooldown');
      assert.equal(state.alerts[0].detail, 'R2');
      assert.equal(state.alerts[0].kind, 'event');
      assert(Number(state.cooldown) > 0);
    }
    await page.waitForFunction((level) => {
      const row = document.querySelector(`[data-live-head-level="${level}"]`);
      return row && [...row.querySelectorAll('[data-missed-round]')].every((pill) => pill.dataset.roundMissState === 'missed');
    }, head);
    const rounds = await page.locator(`[data-live-head-level="${head}"] [data-missed-round]`).evaluateAll((pills) => pills.map((pill) => ({
      round: Number(pill.dataset.missedRound), text: pill.textContent, hidden: pill.hidden
    })));
    assert.deepEqual(rounds.map((miss) => miss.round), Array.from({ length: round }, (_, i) => i), 'Earlier missed rounds remain separate and sorted, never including the successful round');
    assert(rounds.every((miss) => !miss.hidden && miss.text === `Missed R${miss.round} · Round ${miss.round} Baker`));
  }
  console.log('ok - R1/R2/R3 news thresholds and ordered missed-round identities');
  console.log('ok - initial and incoming health rails never flash a delayed refill');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // A partial index must never assign the producer or a realized right as a missed baker.
  omitRoundOne = true;
  head += 1;
  round = 2;
  await page.evaluate(() => window.__refreshReadableHead());
  await page.waitForFunction((level) => document.querySelector(`[data-live-head-level="${level}"] [data-missed-round="1"]`)?.dataset.roundMissState === 'unavailable', head);
  assert.match(await page.locator(`[data-live-head-level="${head}"] [data-missed-round="0"]`).textContent(), /Round 0 Baker/);
  assert.equal(await page.locator(`[data-live-head-level="${head}"] [data-missed-round="1"]`).textContent(), 'R1 unavailable');
  console.log('ok - partial baking receipts do not blame realized rights');
  omitRoundOne = false;
  bakingUnavailable = true;
  head += 1;
  await page.evaluate(() => window.__refreshReadableHead());
  await page.waitForFunction((level) => [...document.querySelectorAll(`[data-live-head-level="${level}"] [data-missed-round]`)]
    .filter((pill) => pill.dataset.roundMissState === 'unavailable').length === 2, head);
  assert.match(await page.locator(`[data-live-head-level="${head - 1}"] [data-missed-round="0"]`).textContent(), /Round 0 Baker/, 'Failed rights retain earlier confirmed identities');
  console.log('ok - failed baking receipts retain last-good identities');
  bakingUnavailable = false;
  head += 1;
  await page.evaluate(() => window.__refreshReadableHead());
  await page.waitForFunction((level) => [...document.querySelectorAll(`[data-live-head-level="${level}"] [data-round-miss-state="missed"]`)].length === 2, head);
  console.log('ok - new head recovers complete missed baking rights');
  const inspectedLevel = head;
  const inspectedRow = page.locator(`[data-live-head-level="${inspectedLevel}"]`);
  await inspectedRow.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await inspectedRow.locator('.live-head-info').focus();
  await page.locator('#live-head-inspector').waitFor({ state: 'visible' });
  console.log('ok - keyboard opens missed baking-round inspector');
  const bakingReceipt = page.locator('[data-inspector-baking-misses]');
  assert.equal(await bakingReceipt.locator('[data-inspector-missed-round]').count(), 2);
  assert.equal(await bakingReceipt.locator('a[href^="https://tzkt.io/"]').count(), 4);
  assert.equal(await bakingReceipt.locator('a[href^="/#my-baker="]').count(), 2);
  const lockedText = await bakingReceipt.textContent();
  head += 1;
  await page.evaluate(() => window.__refreshReadableHead());
  assert.equal(await page.locator('#live-head-stack [data-live-head-level]').first().getAttribute('data-live-head-level'), String(inspectedLevel));
  assert.equal(await bakingReceipt.textContent(), lockedText, 'An open inspector freezes its missed-round receipt during background refresh');
  console.log('ok - newer head queues behind the inspector');
  await page.mouse.move(0, 0);
  await page.locator('#live-head-filter-toggle').focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction((level) => Number(document.querySelector('#live-head-stack [data-live-head-level]')?.dataset.liveHeadLevel) === level, head);
  console.log('ok - inspector close applies the queued head');
  await page.waitForFunction((level) => document.querySelectorAll(`[data-live-head-level="${level}"] [data-round-miss-state="missed"]`).length === 2, head);
  console.log('ok - missed baking rounds respect the inspector reading lock');

  const themes = ['aurora', 'matrix', 'hen', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'valley', 'warzone'];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of themes) {
      await page.evaluate(async (nextTheme) => {
        const { setTheme } = await import('/js/ui/theme.js');
        setTheme(nextTheme);
      }, theme);
      await page.waitForFunction((expected) => document.body.dataset.theme === expected
        && Boolean(document.getElementById(`theme-css-${expected}`)?.sheet), theme);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const state = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const rgba = (color) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data];
        };
        const luminance = (rgb) => rgb.slice(0, 3).reduce((sum, c, i) => {
          const value = c / 255;
          return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
        }, 0);
        const contrast = (a, b) => {
          const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
          return (values[0] + 0.05) / (values[1] + 0.05);
        };
        const background = (node) => {
          let result = rgba(getComputedStyle(document.body).getPropertyValue('--bg-primary'));
          const ancestors = [];
          for (let current = node; current; current = current.parentElement) ancestors.unshift(current);
          for (const current of ancestors) {
            const layer = rgba(getComputedStyle(current).backgroundColor);
            result = result.map((c, i) => i === 3 ? 255 : layer[i] * layer[3] / 255 + c * (1 - layer[3] / 255));
          }
          return result;
        };
        const rows = [...document.querySelectorAll('#live-head-stack [data-safety-margin]')];
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          rows: rows.map((row) => {
            const track = row.querySelector('.live-head-power-track');
            const fill = row.querySelector('.live-head-power-fill');
            const label = row.querySelector('.live-head-margin');
            const trackRect = track.getBoundingClientRect();
            const fillRect = fill.getBoundingClientRect();
            const labelRect = label.getBoundingClientRect();
            const labelStyle = getComputedStyle(label);
            const expectedFillRatio = Number(getComputedStyle(fill).getPropertyValue('--live-head-margin'));
            return {
              margin: row.dataset.safetyMargin,
              fillHeight: fillRect.height, innerHeight: track.clientHeight,
              fullHeight: Math.abs(fillRect.top - trackRect.top - 1) < 1 && Math.abs(fillRect.height - track.clientHeight) < 1,
              fillWidthAccurate: Math.abs(fillRect.width - track.clientWidth * expectedFillRatio) <= 1,
              contained: labelRect.left >= trackRect.left && labelRect.right <= trackRect.right
                && labelRect.top >= trackRect.top && labelRect.bottom <= trackRect.bottom,
              labelContrast: contrast(rgba(labelStyle.color), rgba(labelStyle.backgroundColor)),
              opaque: rgba(labelStyle.backgroundColor)[3] === 255 && labelStyle.opacity === '1',
              bakingMisses: [...row.querySelectorAll('[data-missed-round]')].map((pill) => ({
                hidden: pill.hidden, width: pill.getBoundingClientRect().width,
                left: pill.getBoundingClientRect().left, right: pill.getBoundingClientRect().right,
                containerRight: pill.parentElement.getBoundingClientRect().right
              })),
              receipts: [...row.querySelectorAll('.health-round-badge, .health-interval, .health-power, .health-power small')]
                .filter((node) => node.getClientRects().length)
                .map((node) => ({ text: node.textContent, contrast: contrast(rgba(getComputedStyle(node).color), background(node)) }))
            };
          })
        };
      });
      assert.equal(state.rows.length, 10);
      assert(state.rows.some((row) => row.margin === '') && state.rows.some((row) => Number(row.margin) < 0)
        && state.rows.some((row) => row.margin === '0'), 'Missing, deficit, and exact-quorum receipts are covered');
      assert(state.overflow <= 1, `${theme}/${width}: page overflow`);
      for (const row of state.rows) {
        assert(row.fullHeight && row.fillWidthAccurate && row.contained && row.opaque && row.labelContrast >= 4.5,
          `${theme}/${width}: full-height rail and opaque readable number ${JSON.stringify(row)}`);
        if (theme === 'clean') {
          assert(row.receipts.every((receipt) => receipt.contrast >= 4.5), `${theme}/${width}: readable nearby receipts ${JSON.stringify(row.receipts)}`);
        }
        if (row.bakingMisses.length <= 2) {
          assert(row.bakingMisses.every((pill) => !pill.hidden && pill.width > 40 && pill.right <= pill.containerRight + 1),
            `${theme}/${width}: both missed baking-round pills remain visible ${JSON.stringify(row.bakingMisses)}`);
        }
      }
      if (artifactsDir && ['clean', 'dark'].includes(theme)) {
        await mkdir(artifactsDir, { recursive: true });
        await page.locator('#live-head').screenshot({ path: path.join(artifactsDir, `live-head-readable-${theme}-${width}.png`) });
      }
    }
  }
  await context.close();
}
