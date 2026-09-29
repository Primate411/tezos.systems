import assert from 'node:assert/strict';
import { readCoinGeckoTickerPage, validateCoinGeckoTickerCoverage } from '../scripts/lib/coingecko-ticker-page.mjs';

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
console.log('ok - bounded ticker pages preserve rows and require empty-page evidence for a shorter provider catalog');
