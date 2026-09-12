#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { blockscoutRetryDelay, createBlockscoutClient } from '../scripts/lib/blockscout-client.mjs';
import { fetchBlockscoutHistory } from '../scripts/lib/blockscout-history.mjs';
import {
  addWeeks,
  combineNetworkActivity,
  contractUniverseHash,
  emptyMetric,
  mergeMetric,
  mergeResolvedContracts,
  networkRebuildStart,
  pctChange,
  publicMetric,
  rankApps,
  retentionRate,
  stableHash,
  tezosNetworkWallet,
  utcWeekStart,
  validateManifest
} from '../scripts/lib/ecosystem-stats.mjs';

const manifest = JSON.parse(await fs.readFile(new URL('../data/ecosystem-apps.json', import.meta.url), 'utf8'));

assert.equal(blockscoutRetryDelay(new Headers({ 'x-ratelimit-reset': '1750735' })), 1750735,
  'Blockscout reset is a duration in milliseconds, not seconds or an epoch');
assert.equal(blockscoutRetryDelay(new Headers({ 'retry-after': '90', 'x-ratelimit-reset': '120000' })), 120000);
assert.equal(blockscoutRetryDelay(new Headers({ 'retry-after': 'Fri, 11 Sep 2026 22:01:00 GMT' }), Date.parse('2026-09-11T22:00:00Z')), 60000);
assert.equal(blockscoutRetryDelay(new Headers({ 'retry-after': 'invalid', 'x-ratelimit-reset': '-1' })), 0);

function clientFixture(responses, options = {}) {
  let time = 0;
  const calls = [];
  const client = createBlockscoutClient({
    apiKey: '', now: () => time, wait: async (ms) => {
      time += ms;
      await new Promise(setImmediate);
    }, warn: () => {},
    fetchImpl: async (url) => {
      calls.push({ url, time });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      assert(response, 'unexpected extra Blockscout request');
      return response;
    }, ...options
  });
  return { client, calls };
}
const endpoint = 'https://explorer.etherlink.com/api?module=account&action=txlist&address=0x123';
const success = () => Response.json({ status: '1', result: [{ hash: '0xabc' }] });
const throttled = (reset, status = 429) => Response.json({ message: 'Too many requests', result: null, status: '0' },
  { status, headers: { 'x-ratelimit-reset': String(reset) } });
for (const status of [200, 429]) {
  const { client, calls } = clientFixture([throttled(120000, status), success()]);
  assert.equal((await client.requestJson(endpoint)).result[0].hash, '0xabc');
  assert.deepEqual(calls.map((call) => call.time), [0, 120000], 'HTTP and payload throttling both respect the reset');
}
{
  const { client, calls } = clientFixture([throttled(1750735)]);
  await assert.rejects(client.requestJson(endpoint), /Public Blockscout.*Last-good Ecosystem/);
  await assert.rejects(client.requestJson(endpoint), /Public Blockscout/);
  assert.equal(calls.length, 1, 'an unaffordable quota window stops every worker without repeated requests');
}
{
  const { client, calls } = clientFixture([throttled(1750735)]);
  const outcomes = await Promise.allSettled([client.requestJson(endpoint), client.requestJson(endpoint)]);
  assert(outcomes.every((outcome) => outcome.status === 'rejected'));
  assert.equal(calls.length, 1, 'a queued concurrent worker stops when its peer discovers exhausted quota');
}
{
  const { client, calls } = clientFixture([new Error('network down'), new Error('network down'), success()]);
  await client.requestJson(endpoint);
  assert.deepEqual(calls.map((call) => call.time), [0, 1200, 3200], 'network retries preserve exponential backoff and request spacing');
}
{
  const { client, calls } = clientFixture([
    Response.json({ status: '1', result: [] }, { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '120000' } }), success()
  ]);
  await client.requestJson(endpoint);
  await client.requestJson(endpoint);
  assert.deepEqual(calls.map((call) => call.time), [0, 120000], 'the final successful allowance sets the next cooldown');
}
{
  const key = 'test +/secret';
  const { client, calls } = clientFixture([success(), new Error(`failed ${endpoint}&apikey=${encodeURIComponent(key)}`)], { apiKey: key });
  await client.requestJson(endpoint);
  assert.equal(new URL(calls[0].url).searchParams.get('apikey'), key);
  assert.equal(new URL(calls[0].url).origin, 'https://api.blockscout.com');
  assert.equal(new URL(calls[0].url).pathname, '/42793/api', 'PRO credentials use the Etherlink multichain proxy');
  await assert.rejects(client.requestJson(endpoint, { attempts: 1 }), (error) => {
    assert(!error.message.includes(key) && !error.message.includes(encodeURIComponent(key)));
    return error.message.includes('[redacted]');
  });
  await assert.rejects(client.requestJson('https://example.com/api'), /Unexpected Blockscout origin/);
  await assert.rejects(client.requestJson('https://user:pass@explorer.etherlink.com/api'), /Unexpected Blockscout origin/);
  await assert.rejects(client.requestJson('https://explorer.etherlink.com/api/v2/transactions'), /Unexpected Blockscout API path/);
  assert.equal(calls.length, 2, 'credentials cannot be sent to another origin');
}
{
  const query = '&start_timestamp=1787529600&end_timestamp=1788134399&filter_by=to&page=1&offset=10000&sort=asc';
  for (const apiKey of ['', 'proapi_test']) {
    const { client, calls } = clientFixture([success()], { apiKey });
    await client.requestJson(`${endpoint}${query}&apikey=obsolete`);
    const request = new URL(calls[0].url);
    assert.equal(request.searchParams.get('apikey'), apiKey || null);
    request.searchParams.delete('apikey');
    assert.equal(request.search, new URL(`${endpoint}${query}`).search, 'proxy migration preserves exhaustive query bounds and direction');
    assert.equal(request.origin, apiKey ? 'https://api.blockscout.com' : 'https://explorer.etherlink.com');
  }
}
{
  const { client, calls } = clientFixture([Response.json({ error: 'Invalid API key', source: 'internal' })], { apiKey: 'proapi_test' });
  await assert.rejects(client.requestJson(endpoint), /Invalid API key/);
  assert.equal(calls.length, 1, 'a PRO error envelope must never become an empty successful scan');
}
{
  const { client, calls } = clientFixture([
    Response.json({ error: 'Rate limit reached', source: 'internal' }, { status: 429, headers: { 'retry-after': '90' } }), success()
  ], { apiKey: 'proapi_test' });
  await client.requestJson(endpoint);
  assert.deepEqual(calls.map((call) => call.time), [0, 90000], 'PRO throttling observes Retry-After');
}
{
  const { client, calls } = clientFixture([Response.json({ message: 'Invalid API key' }, { status: 401 })]);
  await assert.rejects(client.requestJson(endpoint), /HTTP 401/);
  assert.equal(calls.length, 1, 'permanent credential errors are not retried');
}
{
  let time = 0;
  let client;
  let extended = false;
  client = createBlockscoutClient({ apiKey: '', now: () => time, wait: async (ms) => {
    time += ms;
    if (!extended) { extended = true; client.extendCooldown(60000); }
  } });
  client.extendCooldown(1200);
  await client.pace();
  assert.equal(time, 61200, 'a worker rechecks a cooldown extended while it was asleep');
}
const workflow = await fs.readFile(new URL('../.github/workflows/refresh-governance-surfaces.yml', import.meta.url), 'utf8');
assert(workflow.includes('BLOCKSCOUT_API_KEY: ${{ secrets.BLOCKSCOUT_API_KEY }}'), 'scheduled refresh receives the private API credential');
{
  const address = `0x${'1'.repeat(40)}`;
  const from = '2026-09-07T00:00:00Z';
  const to = '2026-09-12T00:00:00Z';
  const row = (block, timestamp, status = 'ok') => ({ block_number: block, position: 0, timestamp, status,
    hash: `0x${block.toString(16).padStart(64, '0')}`, from: { hash: `0x${'2'.repeat(40)}` }, to: { hash: address } });
  const next = { block_number: 9, index: 0, items_count: 50, filter: 'to' };
  const pages = [
    { items: [row(12, to), row(11, '2026-09-11T00:00:00Z')], next_page_params: next },
    { items: [row(10, from, 'error'), row(9, '2026-09-06T23:59:59Z')], next_page_params: { ...next, block_number: 8 } }
  ];
  const calls = [];
  const history = await fetchBlockscoutHistory(address, from, to, async (url) => { calls.push(new URL(url)); return pages.shift(); });
  assert.deepEqual(history.map(({ timestamp, isError }) => [timestamp, isError]), [[Date.parse('2026-09-11T00:00:00Z'), '0'], [Date.parse(from), '1']]);
  assert.equal(calls.length, 2, 'short pages continue until the fixed lower bound is crossed');
  assert.equal(calls[1].searchParams.get('filter'), 'to');
  assert.equal(calls[1].searchParams.get('block_number'), '9');
  assert(calls.every((url) => !url.searchParams.has('apikey') && url.pathname.endsWith('/transactions')));
  assert.deepEqual(await fetchBlockscoutHistory(address, from, to, async () => ({ items: [], next_page_params: null })), []);
  assert.deepEqual(await fetchBlockscoutHistory(address, from, to, async () => ({ items: [
    { ...row(11, from), to: null, created_contract: { hash: address } }
  ], next_page_params: null })), [], 'contract creation is not an inbound call to an existing reviewed contract');
  for (const page of [
    { items: [] },
    { items: [], next_page_params: next },
    { items: [row(11, from), row(11, from)], next_page_params: null },
    { items: [{ ...row(11, from), status: 'unknown' }], next_page_params: null },
    { items: [{ ...row(11, from), to: { hash: `0x${'3'.repeat(40)}` } }], next_page_params: null },
    { items: [row(11, from)], next_page_params: { apikey: 'unexpected' } },
    { items: [row(11, from)], next_page_params: { ...next, filter: 'from' } }
  ]) await assert.rejects(fetchBlockscoutHistory(address, from, to, async () => page));
  let count = 0;
  await assert.rejects(fetchBlockscoutHistory(address, from, to, async () => ({ items: [row(20 - count++, from)], next_page_params: next })), /continuation did not advance/);
  const { client, calls: restCalls } = clientFixture([Response.json({ items: [], next_page_params: null })]);
  await fetchBlockscoutHistory(address, from, to, client.requestJson);
  assert.equal(new URL(restCalls[0].url).origin, 'https://explorer.etherlink.com', 'normal REST refresh needs no credential');
}
assert.deepEqual(validateManifest(manifest), [], 'reviewed app manifest should validate');
assert.equal(manifest.apps.length, 23, 'the launch universe should retain 23 disclosed apps');
assert(['objkt', 'fxhash', 'teia', 'tezos-domains', 'morpho-blue', 'oku-uniswap-v3', 'curve', 'hanji', 'iguanadex', 'etherlink-bridge']
  .every((id) => manifest.apps.some((app) => app.id === id)),
'the reviewed universe should retain representative L1, L2, NFT, identity, DeFi, and bridge apps');

assert.equal(utcWeekStart('2026-07-26T23:59:59Z').toISOString(), '2026-07-20T00:00:00.000Z');
assert.equal(utcWeekStart('2026-07-27T00:00:00Z').toISOString(), '2026-07-27T00:00:00.000Z');
assert.equal(addWeeks('2026-07-20T00:00:00Z', -52).toISOString(), '2025-07-21T00:00:00.000Z');
assert.equal(networkRebuildStart([
  { weekEnd: '2026-08-24T00:00:00.000Z' }
], '2026-09-07T00:00:00.000Z').toISOString(), '2026-08-24T00:00:00.000Z',
'network activity should backfill any completed weeks missed by scheduled refreshes');
assert.equal(networkRebuildStart([
  { weekEnd: '2026-08-24T00:00:00.000Z' }
], '2026-08-17T00:00:00.000Z').toISOString(), '2026-08-17T00:00:00.000Z',
'network activity should recompute the latest completed week during routine refreshes');
assert.equal(pctChange(150, 100), 50);
assert.equal(pctChange(0, 0), null);

assert.equal(tezosNetworkWallet({
  sender: { address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton' },
  initiator: { address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb' }
}), 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb', 'internal L1 transactions should resolve to their external initiator');
assert.equal(tezosNetworkWallet({
  sender: { address: 'tz1aZqaWzV9hi2hxRNdRfQrMep1fvLJ2N5Xj' },
  initiator: null
}), 'tz1aZqaWzV9hi2hxRNdRfQrMep1fvLJ2N5Xj', 'top-level L1 transactions should resolve to their external sender');
assert.equal(tezosNetworkWallet({ sender: { address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton' } }), null,
  'contract addresses should not be presented as external Tezos wallets');

assert.deepEqual(combineNetworkActivity({
  tezos: { activeWallets: 4, approximate: false },
  etherlink: { activeWallets: 3, approximate: false }
}, 'complete'), {
  status: 'complete',
  activeWallets: 7,
  approximate: false
}, 'network-wide all-layer totals should sum source-native wallet-layer addresses');
assert.equal(combineNetworkActivity({
  tezos: { activeWallets: 4, approximate: false },
  etherlink: { activeWallets: 3, approximate: true }
}, 'partial').approximate, true, 'a source-approximate partial layer should keep the all-layer total approximate');

const previous = new Set(['a', 'b', 'c', 'd']);
const current = new Set(['b', 'd', 'e']);
assert.equal(retentionRate(current, previous), 50);

const tezos = emptyMetric();
tezos.wallets.add('tz1-a');
tezos.operations.add('tezos:1');
tezos.operations.add('tezos:2');
const etherlink = emptyMetric();
etherlink.wallets.add('tz1-a');
etherlink.wallets.add('0x-b');
etherlink.operations.add('etherlink:0x1');
const combined = emptyMetric();
mergeMetric(combined, tezos, 'tezos:');
mergeMetric(combined, etherlink, 'etherlink:');
assert.deepEqual(publicMetric(combined), {
  activeWallets: 3,
  interactions: 3,
  callsPerWallet: 1,
  returningWalletRate: null
}, 'cross-layer totals should preserve source-native wallet identities');

const apps = Array.from({ length: 10 }, (_, index) => ({
  id: `app-${index}`,
  name: `App ${index}`,
  category: 'fixture',
  layers: [{ id: index === 9 ? 'etherlink' : 'tezos' }],
  weekly: [{
    weekStart: '2026-07-13T00:00:00.000Z',
    status: 'complete',
    all: { activeWallets: index + 1, interactions: index + 2 },
    layers: {
      tezos: index === 9 ? { status: 'not-tracked' } : { status: 'complete', activeWallets: index + 1, interactions: index + 2 },
      etherlink: index === 9 ? { status: 'complete', activeWallets: index + 1, interactions: index + 2 } : { status: 'not-tracked' }
    }
  }],
  summary: {
    weekStart: '2026-07-13T00:00:00.000Z',
    activeWallets: index + 1,
    interactions: index + 2
  }
}));
const ranking = rankApps(apps);
assert.equal(ranking[0].id, 'app-9');
assert.equal(ranking[0].rank, 1);
assert.equal(rankApps(apps, 'etherlink').length, 1);
assert.equal(stableHash({ b: 2, a: 1 }), stableHash({ a: 1, b: 2 }));
assert.equal(
  contractUniverseHash([{ id: 'app', layers: [{ id: 'tezos', contracts: [{ address: 'KT1B' }, { address: 'KT1A' }] }] }]),
  contractUniverseHash([{ id: 'app', layers: [{ id: 'tezos', contracts: [{ address: 'kt1a' }, { address: 'kt1b' }] }] }]),
  'contract-universe receipts should be address-order and case independent'
);

const mergedContracts = mergeResolvedContracts([
  { address: 'KT1Current', alias: 'Current alias', lastActivityTime: '2026-08-07T12:00:00Z' },
  { address: 'KT1New', alias: 'New alias', lastActivityTime: '2026-08-07T11:00:00Z' }
], [
  { address: 'kt1current', alias: 'Stale alias', lastActivityTime: '2026-07-25T12:00:00Z' },
  { address: 'KT1Retained', alias: 'Historical alias', lastActivityTime: '2025-01-01T00:00:00Z' }
]);
assert.equal(mergedContracts.length, 3, 'previously resolved addresses should remain append-only');
assert.equal(
  mergedContracts.find((contract) => contract.address.toLowerCase() === 'kt1current')?.lastActivityTime,
  '2026-08-07T12:00:00Z',
  'fresh TzKT contract metadata should replace the previous snapshot receipt'
);
assert(mergedContracts.some((contract) => contract.address === 'KT1Retained'), 'historical aliases should remain retained');

console.log('ok - ecosystem stats boundaries, identity model, retention, ranking, contract receipts, and manifest');
