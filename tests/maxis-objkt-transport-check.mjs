#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createMaxisObjktFetch, isTransientObjktError } from '../scripts/lib/maxis-objkt-transport.mjs';
import { fetchKeysetPages } from '../scripts/lib/maxis-pagination.mjs';

const endpoint = 'https://data.objkt.com/v3/graphql';
const source = await fs.readFile(new URL('../scripts/refresh-maxis-data.mjs', import.meta.url), 'utf8');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'maxis-objkt-transport-'));
const documents = [];
// Extract the actual frozen adapters: equivalence tests must follow the source
// documents, including the season-only token creation filter, without copies.
for (const [name, field] of [['fetchObjktMints', 'event'], ['fetchObjktListingSales', 'listing_sale'], ['fetchObjktSales', 'sales_stat']]) {
  const code = source.slice(source.indexOf(`async function ${name}(`)).split('\nasync function ')[0];
  for (const tokenCreatedWithinWindow of name === 'fetchObjktMints' ? [false, true] : [false]) {
    let document;
    const adapter = new Function('objkt', 'fetchKeysetPages', 'OBJKT_PAGE_SIZE', 'OBJKT_MAX_PAGES', `${code}; return ${name};`)(
      async (query, variables) => { document = { query, variables, field }; return {}; },
      async callback => callback({ limit: 500, after: '0' }), 500, 1000);
    await adapter('2026-10-01T00:00:00.000Z', '2026-10-05T00:00:00.000Z', { tokenCreatedWithinWindow });
    documents.push(document);
  }
}
const request = (document, variables = document.variables, signal) => ({ method: 'POST', body: JSON.stringify({ query: document.query, variables }), signal });
const response = (field, rows) => Response.json({ data: { [field]: rows } });
const retryable = () => Response.json({ errors: [{ message: 'database query error' }] });
let time = Date.now();
const delays = [];
const options = { spacingMs: 1, now: () => time, wait: async ms => { delays.push(ms); time += ms; }, log: () => {} };
const rows = Array.from({ length: 537 }, (_, i) => ({ id: String(9007199254740993n + BigInt(i)), timestamp: '2026-10-02T12:00:00Z', token: { timestamp: '2026-10-01T12:00:00Z' }, creator: null, amount: '2' }));
const page = (data, variables) => data.filter(row => BigInt(row.id) > BigInt(variables.after)).slice(0, variables.limit);
try {
  for (const document of documents.filter(item => item.field !== 'sales_stat')) {
    const calls = [];
    const transport = createMaxisObjktFetch({ ...options, checkpointDir: temporary, fetch: async (url, init) => {
      const payload = JSON.parse(init.body);
      calls.push(payload);
      assert.equal(url, endpoint);
      assert.equal(payload.query, document.query);
      assert.equal(payload.variables.from, document.variables.from);
      assert.equal(payload.variables.to, document.variables.to);
      if (payload.variables.limit > 25) return retryable();
      return response(document.field, page(rows, payload.variables));
    } });
    const recovered = await fetchKeysetPages(async variables => (await (await transport(endpoint,
      request(document, { ...document.variables, ...variables }))).json()).data[document.field], { pageSize: 500, maxPages: 1000 });
    const baseline = await fetchKeysetPages(async variables => page(rows, variables), { pageSize: 500, maxPages: 1000 });
    assert.deepEqual(recovered, baseline, 'physical pages must preserve the entire frozen logical pagination receipt and every row');
    assert.deepEqual(calls.slice(0, 3).map(item => item.variables.limit), [500, 100, 25]);
    assert.equal(calls.filter(item => item.variables.limit > 25).length, 2, 'learn the safe size for subsequent logical requests');
    assert.deepEqual(await fs.readdir(temporary), [], 'completed requests must leave no reusable historical cache');
  }

  const document = documents[0];
  const numericRows = [{ id: 1, creator: null }, { id: 2, creator: { alias: 'same' } }];
  const numeric = createMaxisObjktFetch({ ...options, fetch: async () => response('event', numericRows) });
  assert.deepEqual((await (await numeric(endpoint, request(document))).json()).data.event, numericRows, 'safe numeric cursor types remain unchanged');

  // A single first-seek outage must not pin an entire season to tiny pages.
  const longRows = Array.from({ length: 9001 }, (_, i) => ({ id: String(i + 1) }));
  for (const staysConstrained of [false, true]) {
    const pageLimits = [];
    let requests = 0;
    const adaptive = createMaxisObjktFetch({ ...options, fetch: async (url, init) => {
      const variables = JSON.parse(init.body).variables;
      pageLimits.push(variables.limit);
      if (++requests === 1 || (staysConstrained && variables.limit > 100)) return retryable();
      return response('event', page(longRows, variables));
    } });
    const complete = await fetchKeysetPages(async variables => (await (await adaptive(endpoint,
      request(document, { ...document.variables, ...variables }))).json()).data.event, { pageSize: 500, maxPages: 1000 });
    assert.deepEqual(complete.rows, longRows);
    assert(pageLimits.includes(200), 'probe larger requests after sustained complete pages');
    if (staysConstrained) {
      assert(!pageLimits.slice(1).includes(500), 'repeated probe failures must not escalate to full pages');
    } else {
      assert(pageLimits.slice(1).includes(500), 'return to the original page size after recovery');
      assert(requests < 75, 'one outage must not multiply the whole season request count');
    }
  }

  const calls = [];
  const interrupted = createMaxisObjktFetch({ ...options, checkpointDir: temporary, fetch: async (url, init) => {
    const variables = JSON.parse(init.body).variables;
    calls.push(variables);
    if (variables.limit > 100 || variables.after !== '0') return retryable();
    return response('event', page(rows, variables));
  } });
  await assert.rejects(interrupted(endpoint, request(document)), isTransientObjktError, 'never return a partial logical page');
  assert.equal((await fs.readdir(temporary)).length, 1);
  const checkpointName = (await fs.readdir(temporary))[0];
  const checkpointText = await fs.readFile(path.join(temporary, checkpointName), 'utf8');
  const sameProcessCallsStart = calls.length;
  await assert.rejects(interrupted(endpoint, request(document)), isTransientObjktError);
  assert.equal(calls[sameProcessCallsStart].limit, 25, 'resume must retain the smaller size already learned after the checkpoint was written');
  const resumedCalls = [];
  const resumed = createMaxisObjktFetch({ ...options, checkpointDir: temporary, fetch: async (url, init) => {
    const variables = JSON.parse(init.body).variables; resumedCalls.push(variables);
    return response('event', page(rows, variables));
  } });
  assert.deepEqual((await (await resumed(endpoint, request(document))).json()).data.event, rows.slice(0, 500));
  assert.equal(resumedCalls[0].after, rows[99].id, 'a new transport instance resumes validated progress for the exact request');
  assert.equal((await fs.readdir(temporary)).length, 0);

  for (const change of ['window', 'document', 'cursor', 'limit', 'corrupt', 'expired', 'bad-order']) {
    await fs.writeFile(path.join(temporary, checkpointName), checkpointText);
    const changed = JSON.parse(checkpointText);
    if (change === 'corrupt') changed.digest = 'bad';
    if (change === 'expired') changed.createdAt -= 21 * 60 * 1000;
    if (change === 'bad-order') {
      changed.rows.reverse();
      changed.digest = createHash('sha256').update(JSON.stringify(changed.rows)).digest('hex');
    }
    if (['corrupt', 'expired', 'bad-order'].includes(change)) await fs.writeFile(path.join(temporary, checkpointName), JSON.stringify(changed));
    const otherDocument = change === 'document' ? documents[1] : document;
    const variables = { ...otherDocument.variables, ...(change === 'window' ? { to: '2026-10-05T01:00:00.000Z' } : {}), ...(change === 'cursor' ? { after: '1' } : {}), ...(change === 'limit' ? { limit: 400 } : {}) };
    let first;
    const fresh = createMaxisObjktFetch({ ...options, checkpointDir: temporary, fetch: async (url, init) => {
      const vars = JSON.parse(init.body).variables; first ??= vars.after; return response('event', []);
    } });
    await fresh(endpoint, request(otherDocument, variables));
    assert.equal(first, variables.after, `${change} must not reuse a checkpoint`);
    await fs.rm(path.join(temporary, checkpointName), { force: true });
  }

  for (const bad of [Response.json({ data: {} }), response('event', [{ id: '1' }, { id: '1' }]), response('event', [{ id: 9007199254740992 }]), Response.json({ errors: 'malformed' }), Response.json({ errors: [{ message: 'database query error' }, { message: 'field does not exist' }] }), new Response('', { status: 403 })]) {
    let count = 0;
    const invalid = createMaxisObjktFetch({ ...options, fetch: async () => { count += 1; return bad; } });
    await assert.rejects(invalid(endpoint, request(document)), error => !isTransientObjktError(error));
    assert.equal(count, 1, 'schema, authorization and cursor errors are not treated as temporary outages');
  }
  const oversized = createMaxisObjktFetch({ ...options, fetch: async () => response('event', rows.slice(0, 501)) });
  await assert.rejects(oversized(endpoint, request(document)), /oversized/);
  const unknown = createMaxisObjktFetch({ ...options, fetch: async () => assert.fail('unreviewed query reached upstream') });
  await assert.rejects(unknown(endpoint, request({ query: document.query + ' ', variables: document.variables })), /Unreviewed/);

  let count = 0;
  const beforeRetry = delays.length;
  const statsDocument = documents.at(-1);
  const stats = createMaxisObjktFetch({ ...options, fetch: async (url, init) => {
    assert.deepEqual(JSON.parse(init.body).variables, statsDocument.variables, 'non-keyset ranking requests must never be split');
    return ++count === 1 ? new Response('', { status: 429, headers: { 'retry-after': '7' } }) : response('sales_stat', [{ rank: 1 }]);
  } });
  assert.deepEqual((await (await stats(endpoint, request(statsDocument))).json()).data.sales_stat, [{ rank: 1 }]);
  assert(delays.slice(beforeRetry).some(ms => ms >= 7000), 'honor provider Retry-After');
  const outage = createMaxisObjktFetch({ ...options, fetch: async () => new Response('', { status: 503 }) });
  await assert.rejects(outage(endpoint, request(document)), isTransientObjktError);

  let active = 0; let maximum = 0;
  const serialized = createMaxisObjktFetch({ ...options, fetch: async () => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1; return response('event', []);
  } });
  const abort = new AbortController();
  const pending = serialized(endpoint, request(document));
  const cancelled = serialized(endpoint, request(document, document.variables, abort.signal));
  abort.abort();
  await assert.rejects(cancelled, isTransientObjktError);
  await pending;
  await Promise.all([serialized(endpoint, request(document)), serialized(endpoint, request(document))]);
  assert.equal(maximum, 1, 'physical requests serialize and a cancelled waiter must release its queue slot');

  const passOptions = { headers: { accept: 'application/json' } };
  const passthrough = createMaxisObjktFetch({ ...options, fetch: async (url, init) => { assert.equal(url, 'https://api.tzkt.io/v1/head'); assert.equal(init, passOptions); return response('head', []); } });
  await passthrough('https://api.tzkt.io/v1/head', passOptions);
  assert.match(source, /process\.exit\(isTransientObjktError\(error\) \? 75 : 1\)/, 'the scheduled runner must distinguish temporary OBJKT outages');
  console.log('OBJKT transport contracts passed: exact pagination, adaptive recovery, checkpoint identity/integrity, fail-closed errors, pacing and cancellation');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
