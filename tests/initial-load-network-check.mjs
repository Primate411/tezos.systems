import assert from 'node:assert/strict';
import {
  createInitialLoadFixtureResponder,
  FIXTURE_TIME,
  FIXTURE_WALLET,
  INITIAL_LOAD_EXPECTATIONS
} from './fixtures/initial-load-network.mjs';
import {
  validateBakers, validateStatistics, validateConstants, validateHeader,
  validateMetadata, validatePriceSpot, validatePriceHorizons, validateVotingPeriod,
  validateLbBlocks, validateRpcAmount, validateRpcScalar
} from '../js/core/source-payloads.mjs';

const respond = createInitialLoadFixtureResponder({ savedWallet: true });
const json = url => {
  const result = respond({ url });
  assert.equal(result.status, 200, url);
  assert.equal(result.headers['x-initial-load-fixture'], 'matched', url);
  return JSON.parse(result.body);
};
const rpc = 'https://eu.rpc.tez.capital/chains/main/blocks';
const tzkt = 'https://api.tzkt.io/v1';

// Exercise the actual application validators, not a duplicate fixture schema.
validateBakers(json(`${tzkt}/delegates?active=true&select=address,consensusAddress,bakingPower&limit=10000`));
validateStatistics(json(`${tzkt}/statistics/current`));
validateConstants(json(`${rpc}/head/context/constants`));
validateHeader(json(`${rpc}/head/header`));
validateMetadata(json(`${rpc}/15000000/metadata`));
validateVotingPeriod(json(`${tzkt}/voting/periods/current`));
validateLbBlocks(json(`${tzkt}/blocks?limit=1&select=level,lbToggleEma`));
validatePriceSpot(json('https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd'));
validatePriceHorizons(json('https://api.coingecko.com/api/v3/coins/markets?ids=tezos&vs_currency=usd'));
validateRpcAmount(respond({ url: `${rpc}/head/context/total_supply` }).body);
validateRpcScalar(respond({ url: `${rpc}/head/context/issuance/current_yearly_rate` }).body);

assert.equal(json(`${rpc}/14999000/header`).level, 14_999_000, 'historical receipts must remain pinned to their requested block');
assert.equal(json(`${rpc}/14999000/metadata`).level_info.cycle_position, 234);
assert.equal(json(`${rpc}/14988000/metadata`).level_info.cycle, INITIAL_LOAD_EXPECTATIONS.cycle - 1);
assert.equal(json(`${tzkt}/head`).level, INITIAL_LOAD_EXPECTATIONS.headLevel);
assert.equal(json(`${tzkt}/delegates`).length, INITIAL_LOAD_EXPECTATIONS.bakerCount);
const account = json(`${tzkt}/accounts/${FIXTURE_WALLET}`);
assert.equal(account.alias, INITIAL_LOAD_EXPECTATIONS.walletAlias);
assert.equal(account.balance / 1e6, INITIAL_LOAD_EXPECTATIONS.walletBalanceXtz);
assert.equal(createInitialLoadFixtureResponder()({ url: `${tzkt}/accounts/${FIXTURE_WALLET}` }).status, 404, 'the new-visitor fixture must not invent a saved account');

const historyUrl = 'https://iijpfczftroespicmufb.supabase.co/rest/v1/tezos_history';
assert.equal(json(historyUrl).length, 31);
assert.equal(json(`${historyUrl}?order=timestamp.desc&limit=1`)[0].timestamp, FIXTURE_TIME);
assert.equal(json(`${historyUrl}?timestamp=gte.${FIXTURE_TIME}`).length, 1);
for (const [table, field, expected] of [
  ['market_history', 'price_usd', 0.74],
  ['network_health_history', 'head_level', INITIAL_LOAD_EXPECTATIONS.headLevel],
  ['tezosx_history', 'tvl_usd', 19_000_000],
  ['governance_period_history', 'period_index', 174]
]) {
  const url = `https://iijpfczftroespicmufb.supabase.co/rest/v1/${table}`;
  assert.equal(json(url).length, 31, `${table} has bounded daily receipts`);
  assert.deepEqual(json(`${url}?select=timestamp&order=timestamp.desc&limit=1`), [{ timestamp: FIXTURE_TIME }], `${table} latest receipt respects projection`);
  assert.equal(json(`${url}?select=*&timestamp=gte.2026-09-09T12:00:00.000Z&order=timestamp.asc&limit=1000&offset=0`).length, 8, `${table} range applies the source timestamp`);
  assert.equal(json(`${url}?order=timestamp.desc&limit=1`)[0][field], expected, `${table} current observation matches fixture values`);
  assert.equal(json(`${url}?order=timestamp.asc&limit=1000&offset=31`).length, 0, `${table} pagination terminates`);
  assert.equal(respond({ url: `${url}?select=nonexistent` }).status, 501, 'unknown source columns must fail closed');
}
assert.deepEqual(respond({ url: `${tzkt}/head` }), respond({ url: `${tzkt}/head` }), 'repeated requests must not advance head/time');
const nextEpoch = createInitialLoadFixtureResponder({ epoch: Date.parse(FIXTURE_TIME) + 60_000 });
assert.equal(Date.parse(JSON.parse(nextEpoch({ url: `${tzkt}/head` }).body).timestamp) - Date.parse(json(`${tzkt}/head`).timestamp), 60_000);
assert.throws(() => createInitialLoadFixtureResponder({ epoch: 'invalid' }), /epoch/);

for (const request of [
  { url: 'https://unexpected.example/head' },
  { url: `${tzkt}/new-endpoint` },
  { url: `${tzkt}/head`, method: 'POST' },
  { url: `${tzkt}/head`, method: 'DELETE' },
  { url: 'https://api.tezos.domains/graphql', method: 'POST', postData: '{invalid' },
  { url: 'https://data.objkt.com/v3/graphql', method: 'POST', postData: JSON.stringify({ query: 'query NewUnmappedQuery { unknown }' }) }
]) {
  const result = respond(request);
  assert.equal(result.status, 501);
  assert.equal(result.headers['x-initial-load-fixture'], 'unexpected');
}
assert.equal(respond({ url: 'https://teztale-server-mainnet-ro-prd.octez.tech/head.json' }).headers['x-initial-load-fixture'], 'unavailable');
assert.deepEqual(JSON.parse(respond({ url: 'https://api.tezos.domains/graphql', method: 'POST', postData: JSON.stringify({ query: 'query ReverseLookupBatch { reverseRecord }', variables: { address0: FIXTURE_WALLET } }) }).body), { data: { record0: null } });

for (const [url, minimumBytes] of [
  ['https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', 100_000],
  ['https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js', 10_000],
  ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 100_000]
]) {
  const result = respond({ url });
  assert.equal(result.contentType, 'application/javascript');
  assert.ok(result.body.length >= minimumBytes, 'use the installed library, not a stub');
}
console.log('ok - deterministic populated startup fixtures validate source receipts, pinned levels, saved accounts, and fail-closed routing');
