import assert from 'node:assert/strict';

// Success-path screenshots must not certify a partially populated dashboard.
// Source-failure suites exercise unavailable/last-good states separately.
export async function observeHomeData(context) {
  await context.addInitScript(() => {
    window.addEventListener('stats-updated', event => {
      window.__smokeHomeData = event.detail?.stats || null;
    });
  });
}

export async function assertPopulatedHome(page, label) {
  await page.waitForFunction(() => Boolean(window.__smokeHomeData?._quality), null, { timeout: 30000 });
  const receipt = await page.evaluate(() => ({
    quality: window.__smokeHomeData._quality,
    status: document.querySelector('#data-status')?.innerText || '',
    statusVisible: Boolean(document.querySelector('#data-status')?.getClientRects().length)
  }));
  assert.equal(receipt.quality.status, 'live', `${label}: healthy inputs must produce complete data: ${JSON.stringify(receipt)}`);
  assert.equal(receipt.statusVisible, false, `${label}: unexpected unavailable-data banner: ${JSON.stringify(receipt)}`);
  await page.waitForFunction(() => (
    document.querySelector('#pulse-ticker-strip')?.dataset.pulseState === 'ready'
    && document.querySelectorAll('#pulse-ticker-strip [data-hot-signal-id]').length >= 4
    && document.querySelector('#header-activity-button')?.getAttribute('aria-busy') === 'false'
    && Boolean(document.querySelector('#header-activity-line')?.dataset.usagePulseStamp)
    && document.querySelectorAll('.live-head-row').length >= 3
    && !document.querySelector('.live-head-story.is-loading')
  ), null, { timeout: 30000 });
}
