import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInitialLoadServer, createInitialLoadDenyProxy, FIXTURE_PATH } from '../scripts/lib/initial-load-server.mjs';
import { FIXTURE_WALLET, INITIAL_LOAD_EXPECTATIONS } from './fixtures/initial-load-network.mjs';

// Real loopback HTTP proves the transport contract without browser interception.
function request(origin, pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(origin);
    const req = http.request({ hostname: target.hostname, port: target.port, path: pathname, method, headers, agent: false }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error(`HTTP test timed out: ${method} ${pathname}`)));
    req.end(body);
  });
}

async function diskReceipt(directory) {
  const result = {};
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    result[entry.name] = entry.isSymbolicLink() ? { link: await fs.readlink(filename) }
      : entry.isDirectory() ? await diskReceipt(filename) : (await fs.readFile(filename)).toString('base64');
  }
  return result;
}

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'initial-load-server-check-'));
let server, proxy, targetServer;
try {
  const root = path.join(temporary, 'site');
  await fs.mkdir(root);
  await fs.mkdir(path.join(root, 'room'));
  const html = '<!doctype html><title>Fixture shell</title>';
  const script = 'export const nativeBytes = "unchanged";\n';
  const data = '{"bounded":true}\n';
  await fs.writeFile(path.join(root, 'index.html'), html);
  await fs.writeFile(path.join(root, 'app.mjs'), script);
  await fs.writeFile(path.join(root, 'data.json'), data);
  await fs.writeFile(path.join(root, 'room/index.html'), '<title>Room</title>');
  await fs.writeFile(path.join(temporary, 'outside.txt'), 'OUTSIDE_ROOT_SENTINEL');
  await fs.mkdir(path.join(temporary, 'site-neighbor'));
  await fs.writeFile(path.join(temporary, 'site-neighbor/index.html'), 'PREFIX_NEIGHBOR_SENTINEL');
  await fs.symlink(path.join(temporary, 'outside.txt'), path.join(root, 'outside-link.txt'));
  await fs.symlink(path.join(temporary, 'site-neighbor'), path.join(root, 'outside-directory'));
  await fs.symlink(path.join(root, 'app.mjs'), path.join(root, 'inside-link.mjs'));
  const before = await diskReceipt(temporary);

  server = await createInitialLoadServer({ root });
  const shell = await request(server.origin, '/');
  assert.equal(shell.status, 200);
  assert.equal(shell.body.toString(), html, 'the server serves unmodified file bytes');
  assert.equal(shell.headers['content-type'], 'text/html');
  assert.equal(shell.headers['cache-control'], 'no-cache');
  assert.equal((await request(server.origin, '/room/')).body.toString(), '<title>Room</title>');
  const javascript = await request(server.origin, '/app.mjs?build=fixture');
  assert.equal(javascript.body.toString(), script);
  assert.equal(javascript.headers['content-type'], 'text/javascript');
  assert.equal(javascript.headers['cache-control'], 'public, max-age=600');
  assert.match(javascript.headers.etag, /^"[a-f0-9]{64}"$/);
  assert.equal((await request(server.origin, '/inside-link.mjs')).body.toString(), script, 'in-root symlinks preserve native bytes');
  const json = await request(server.origin, '/data.json');
  assert.equal(json.body.toString(), data);
  assert.equal(json.headers['cache-control'], 'no-cache', 'generated data revalidates even in warm profiles');
  const cached = await request(server.origin, '/app.mjs?build=fixture', { headers: { 'If-None-Match': javascript.headers.etag } });
  assert.equal(cached.status, 304);
  assert.equal(cached.body.length, 0);
  assert.equal(cached.headers.etag, javascript.headers.etag);
  assert(server.requests.some(item => item.path === '/app.mjs?build=fixture' && item.status === 304 && item.bytes === 0));
  const changedTag = await request(server.origin, '/app.mjs', { headers: { 'If-None-Match': '"different"' } });
  assert.equal(changedTag.status, 200);
  assert.equal(changedTag.body.toString(), script);
  const head = await request(server.origin, '/app.mjs', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers.etag, javascript.headers.etag);

  for (const pathname of ['/outside-link.txt', '/outside-directory/', '/..%2Foutside.txt', '/%2e%2e%2foutside.txt', '/..%2Fsite-neighbor/index.html']) {
    const denied = await request(server.origin, pathname);
    assert.equal(denied.status, 403, `${pathname} cannot escape the physical root`);
    assert(!denied.body.toString().includes('SENTINEL'));
  }
  for (const pathname of ['/missing.json', '/%00', '/%ZZ']) {
    assert.equal((await request(server.origin, pathname)).status, 404, 'malformed or absent paths do not crash the server');
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await request(server.origin, '/app.mjs', { method, body: 'OVERWRITE_ATTEMPT' })).status, 405);
  }
  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
    assert.equal((await request(server.origin, FIXTURE_PATH, { method })).status, 405, 'fixtures require a POST envelope');
  }
  const fixture = async input => request(server.origin, FIXTURE_PATH, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const headFixture = await fixture({ url: 'https://api.tzkt.io/v1/head', method: 'GET' });
  assert.equal(headFixture.status, 200);
  assert.equal(JSON.parse(headFixture.body).level, INITIAL_LOAD_EXPECTATIONS.headLevel);
  assert(headFixture.headers['cache-control'].split(',').every(value => value.trim() === 'no-store'), 'API fixture responses never populate the HTTP asset cache');
  assert.equal(headFixture.headers['x-initial-load-fixture'], 'matched');
  assert.equal(headFixture.headers.etag, undefined);
  const accountUrl = `https://api.tzkt.io/v1/accounts/${FIXTURE_WALLET}`;
  assert.equal((await fixture({ url: accountUrl })).status, 404);
  assert.equal(JSON.parse((await fixture({ url: accountUrl, savedWallet: true })).body).balance / 1e6, INITIAL_LOAD_EXPECTATIONS.walletBalanceXtz);
  const graph = await fixture({ url: 'https://api.tezos.domains/graphql', method: 'POST',
    postData: JSON.stringify({ query: 'query ReverseLookupBatch { reverseRecord }', variables: { address0: FIXTURE_WALLET } }) });
  assert.equal(graph.status, 200, 'source POST bodies survive the transport envelope');
  assert.deepEqual(JSON.parse(graph.body), { data: { record0: null } });
  const unknown = await fixture({ url: 'https://unmapped.invalid/new', method: 'GET' });
  assert.equal(unknown.status, 501);
  assert.equal(unknown.headers['x-initial-load-fixture'], 'unexpected');
  assert(unknown.headers['cache-control'].split(',').every(value => value.trim() === 'no-store'));
  assert(server.fixtureRequests.some(item => item.url === 'https://unmapped.invalid/new' && item.classification === 'unexpected'));
  assert(server.fixtureRequests.every(item => Number.isInteger(item.bytes) && item.bytes > 0));
  for (const body of ['{invalid', 'null', '{}']) {
    assert((await request(server.origin, FIXTURE_PATH, { method: 'POST', body })).status >= 400, 'invalid envelopes fail closed');
  }
  const oversized = await request(server.origin, FIXTURE_PATH, { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) });
  assert.equal(oversized.status, 413, 'fixture envelopes are bounded before JSON parsing');
  assert.equal((await request(server.origin, '/')).status, 200, 'bad envelopes do not poison the next request');
  assert.deepEqual(await diskReceipt(temporary), before, 'static and fixture HTTP requests must not write or cache files');

  // A real target would expose accidental forwarding without needing internet.
  let forwarded = 0;
  targetServer = http.createServer((_request, response) => { forwarded++; response.end('FORWARDED'); });
  await new Promise(resolve => targetServer.listen(0, '127.0.0.1', resolve));
  const targetOrigin = `http://127.0.0.1:${targetServer.address().port}`;
  proxy = await createInitialLoadDenyProxy();
  const deniedHttp = await request(proxy.origin, `${targetOrigin}/must-not-forward`);
  assert.equal(deniedHttp.status, 502);
  assert.equal(deniedHttp.headers['cache-control'], 'no-store');
  const connectStatus = await new Promise((resolve, reject) => {
    const address = new URL(proxy.origin);
    const req = http.request({ hostname: address.hostname, port: address.port, method: 'CONNECT', path: new URL(targetOrigin).host, agent: false });
    req.on('connect', (response, socket) => { socket.destroy(); resolve(response.statusCode); });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Deny proxy CONNECT timed out')));
    req.end();
  });
  assert.equal(connectStatus, 502, 'CONNECT never establishes a tunnel');
  assert.equal(forwarded, 0, 'the deny proxy never touches the requested upstream');
  assert.deepEqual(proxy.requests.map(item => item.method), ['GET', 'CONNECT']);
  const serverOrigin = server.origin;
  const proxyOrigin = proxy.origin;
  await server.close(); server = null;
  await proxy.close(); proxy = null;
  await assert.rejects(request(serverOrigin, '/'), /ECONNREFUSED/);
  await assert.rejects(request(proxyOrigin, '/'), /ECONNREFUSED/);
} finally {
  await Promise.allSettled([server?.close(), proxy?.close(), targetServer && new Promise(resolve => targetServer.close(resolve))]);
  await fs.rm(temporary, { recursive: true, force: true });
}

console.log('ok - real HTTP asset bytes/cache, bounded POST fixtures, physical-root isolation, no writes, denied proxy forwarding and teardown');
