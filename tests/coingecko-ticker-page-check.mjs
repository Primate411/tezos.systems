import assert from 'node:assert/strict';
import { readCoinGeckoTickerPage, validateCoinGeckoTickerCoverage, fetchCoinGeckoTickerCatalog } from '../scripts/lib/coingecko-ticker-page.mjs';

const rows = count => Array.from({ length: count }, (_, i) => ({ base: 'XTZ', target: `USD-${i}`, is_stale: i === 0, is_anomaly: i === 1, last: 0 }));
for (const count of [1, 96, 100]) {
  let calls = 0;
  const input = rows(count);
  const result = await readCoinGeckoTickerPage({ tickers: input }, async () => {
    calls += 1;
    return { tickers: [] };
  });
  assert.equal(result.rows, input, 'retain every source row, including zero values and quality flags');
  assert.equal(calls, count === 100 ? 0 : 1, 'look ahead only for a short page');
  assert.equal(result.coverage.tickerRows, count);
  assert.equal(result.coverage.tickerTruncated, count === 100);
  assert.doesNotThrow(() => validateCoinGeckoTickerCoverage(input, result.coverage));
  assert.throws(() => validateCoinGeckoTickerCoverage(input, { ...result.coverage, tickerRows: count + 1 }), /coverage/);
  if (count < 100) {
    assert.throws(() => validateCoinGeckoTickerCoverage(input, { ...result.coverage, tickerNextPageChecked: null }), /empty next page/);
    assert.throws(() => validateCoinGeckoTickerCoverage(input, { ...result.coverage, tickerNextPageRows: 1 }), /empty next page/);
  }
}
for (const input of [null, {}, { tickers: null }, { tickers: [] }, { tickers: rows(101) },
  { tickers: [...rows(95), {}] }, { tickers: [{ base: ' ', target: 'USD' }] }, { tickers: [{ base: 'XTZ', target: 1 }] }]) {
  let lookedAhead = false;
  await assert.rejects(readCoinGeckoTickerPage(input, async () => { lookedAhead = true; return { tickers: [] }; }), /ticker page/);
  assert.equal(lookedAhead, false, 'reject malformed data before any completeness probe');
}
for (const next of [null, {}, { tickers: null }, { tickers: rows(1) }]) {
  await assert.rejects(readCoinGeckoTickerPage({ tickers: rows(96) }, async () => next), /empty next page/);
}
await assert.rejects(readCoinGeckoTickerPage({ tickers: rows(96) }, async () => { throw new Error('HTTP 503'); }), /HTTP 503/);
const enriched = rows(96).map(row => ({ ...row, cost_to_move_up_usd: 50, cost_to_move_down_usd: 100 }));
const full = await fetchCoinGeckoTickerCatalog(async ({ page, depth }) => {
  assert.equal(depth, true);
  return { tickers: page === 1 ? enriched : [] };
});
assert.equal(full.rows, enriched);
assert(!full.coverage.tickerDepthError);
for (const failurePage of [1, 2]) {
  const calls = [];
  const basic = await fetchCoinGeckoTickerCatalog(async ({ page, depth }) => {
    calls.push({ page, depth });
    if (depth && page === failurePage) throw new Error('ticker request returned HTTP 429');
    return { tickers: page === 1 ? enriched : [] };
  });
  assert.deepEqual(calls.slice(-2), [{ page: 1, depth: false }, { page: 2, depth: false }]);
  assert.equal(basic.rows.length, 96);
  assert(basic.rows.every(row => row.cost_to_move_up_usd === null && row.cost_to_move_down_usd === null));
  assert.equal(basic.rows[0].is_stale, true);
  assert.equal(basic.rows[1].is_anomaly, true);
  assert.match(basic.coverage.tickerDepth, /unavailable/);
  assert.match(basic.coverage.tickerDepthError, /HTTP 429/);
  validateCoinGeckoTickerCoverage(basic.rows, basic.coverage);
}
await assert.rejects(fetchCoinGeckoTickerCatalog(async ({ depth }) => {
  if (depth) throw new Error('HTTP 503');
  throw new Error('basic catalog failed');
}), /basic catalog failed/);
for (const hardFailure of ['HTTP 403', 'HTTP 401', 'invalid payload']) {
  let calls = 0;
  await assert.rejects(fetchCoinGeckoTickerCatalog(async () => { calls++; throw new Error(hardFailure); }));
  assert.equal(calls, 1, 'hard failures are not retried through another request shape');
}
await assert.rejects(fetchCoinGeckoTickerCatalog(async ({ depth }) => {
  assert.equal(depth, true, 'malformed enrichment cannot silently trigger a basic fallback');
  return { tickers: [] };
}), /ticker page/);
console.log('ok - optional depth failures use a validated basic catalog with unavailable depth; incomplete catalogs and hard errors still fail');
console.log('ok - bounded ticker pages preserve rows and require empty-page evidence for a shorter provider catalog');
