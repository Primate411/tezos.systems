export const COINGECKO_TICKER_PAGE_SIZE = 100;

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > COINGECKO_TICKER_PAGE_SIZE) {
    throw new Error('CoinGecko ticker page must contain 1 to 100 rows');
  }
  if (rows.some(row => typeof row?.base !== 'string' || !row.base.trim()
    || typeof row?.target !== 'string' || !row.target.trim())) {
    throw new Error('CoinGecko ticker page contains an invalid currency pair');
  }
}

export function validateCoinGeckoTickerCoverage(rows, coverage) {
  validateRows(rows);
  if (coverage?.tickerPage !== 1 || coverage.tickerHardCap !== COINGECKO_TICKER_PAGE_SIZE
    || coverage.tickerRows !== rows.length) {
    throw new Error('CoinGecko ticker coverage does not match its rows');
  }
  const capped = rows.length === COINGECKO_TICKER_PAGE_SIZE;
  if (coverage.tickerTruncated !== capped
    || (!capped && (coverage.tickerNextPageChecked !== 2 || coverage.tickerNextPageRows !== 0))) {
    throw new Error('CoinGecko short ticker page requires a confirmed empty next page');
  }
}

export async function readCoinGeckoTickerPage(firstPage, fetchNextPage) {
  const rows = firstPage?.tickers;
  validateRows(rows);
  const capped = rows.length === COINGECKO_TICKER_PAGE_SIZE;
  if (!capped) {
    const next = await fetchNextPage();
    if (!Array.isArray(next?.tickers) || next.tickers.length !== 0) {
      throw new Error('CoinGecko short ticker page requires a confirmed empty next page');
    }
  }
  const coverage = {
    tickerPage: 1,
    tickerHardCap: COINGECKO_TICKER_PAGE_SIZE,
    tickerRows: rows.length,
    tickerTruncated: capped,
    tickerNextPageChecked: capped ? null : 2,
    tickerNextPageRows: capped ? null : 0
  };
  return { rows, coverage };
}
