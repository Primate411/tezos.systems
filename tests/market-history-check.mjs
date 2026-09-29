import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../.github/scripts/collect-chamber-history.js', import.meta.url), 'utf8');
const valid = {
  id: 'tezos', last_updated: '2026-09-29T13:03:40.000Z',
  market_data: { current_price: { usd: 0.321903, eur: 0.28376, btc: 0.00000382 },
    market_cap: { usd: 345678901.125 }, total_volume: { usd: 0 }, price_change_percentage_24h: 2.63567 }
};
async function collect(payload, status = 200) {
  let calls = 0;
  const context = vm.createContext({
    Date, console, setTimeout: callback => callback(),
    require: () => ({}),
    fetch: async url => {
      calls += 1;
      const endpoint = new URL(url);
      assert.equal(endpoint.pathname, '/api/v3/coins/tezos', 'use the documented coin-detail endpoint');
      assert.equal(endpoint.searchParams.get('tickers'), 'false');
      assert.equal(endpoint.searchParams.get('market_data'), 'true');
      return Response.json(payload, { status });
    }
  });
  const fn = vm.runInContext(`${source.slice(0, source.indexOf('async function main()'))}\ncollectMarketHistory;`, context);
  const result = JSON.parse(JSON.stringify(await fn()));
  assert.equal(calls, 1);
  return result;
}
assert.deepEqual(await collect(valid), {
  timestamp: valid.last_updated, source: 'coingecko', price_usd: 0.321903, price_eur: 0.28376,
  price_btc: 0.00000382, price_sats: 382, market_cap_usd: 345678901.13, volume_24h_usd: 0, change_24h_pct: 2.6357
});
const missingOptional = structuredClone(valid);
delete missingOptional.market_data.market_cap;
missingOptional.market_data.total_volume.usd = null;
missingOptional.market_data.price_change_percentage_24h = null;
const partial = await collect(missingOptional);
assert.equal(partial.market_cap_usd, null);
assert.equal(partial.volume_24h_usd, null);
assert.equal(partial.change_24h_pct, null);
for (const mutate of [
  d => { d.id = 'bitcoin'; },
  d => { delete d.market_data; },
  d => { d.market_data.current_price.usd = null; },
  d => { d.market_data.current_price.btc = 0; },
  d => { d.market_data.current_price.eur = 'invalid'; },
  d => { d.last_updated = 'invalid'; },
  d => { d.last_updated = new Date(Date.now() + 3600000).toISOString(); }
]) {
  const data = structuredClone(valid); mutate(data);
  await assert.rejects(collect(data), /invalid.*market|market.*invalid/i);
}
await assert.rejects(collect({}, 403), /HTTP 403/);
console.log('ok - market history uses coin-detail prices, preserves the provider clock and missing values, and rejects unusable observations');
