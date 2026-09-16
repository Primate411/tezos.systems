import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createInitialLoadFixtureResponder } from '../../tests/fixtures/initial-load-network.mjs';

export const FIXTURE_PATH = '/__initial_load_fixture';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });

/** Real HTTP cache semantics, unmodified production bytes. API fixtures are
 * delivered through a separate POST endpoint, never Playwright request routing. */
export async function createInitialLoadServer({ root, transform } = {}) {
  const directory = await fs.realpath(root);
  const requests = [], fixtureRequests = [];
  const responders = new Map([false, true].map(savedWallet => [savedWallet, createInitialLoadFixtureResponder({ savedWallet })]));
  const server = http.createServer(async (request, response) => {
    let url;
    try {
      url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === FIXTURE_PATH) {
        if (request.method !== 'POST') { response.writeHead(405).end(); return; }
        const chunks = []; let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 1024 * 1024) { response.writeHead(413).end(); return; }
          chunks.push(chunk);
        }
        const input = JSON.parse(Buffer.concat(chunks));
        const result = responders.get(input.savedWallet === true)(input);
        fixtureRequests.push({ url: input.url, method: input.method, status: result.status,
          classification: result.headers['x-initial-load-fixture'], bytes: Buffer.byteLength(result.body), at: Date.now() });
        response.writeHead(result.status, { ...result.headers, 'Content-Type': result.contentType, 'Cache-Control': 'no-store' });
        response.end(result.body); return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      let filename = path.resolve(directory, `.${decodeURIComponent(url.pathname)}`);
      if ((await fs.stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
      filename = await fs.realpath(filename);
      if (!filename.startsWith(`${directory}${path.sep}`)) { response.writeHead(403).end(); return; }
      let bytes = await fs.readFile(filename);
      if (transform) bytes = Buffer.from(await transform(url.pathname, bytes));
      const etag = `"${createHash('sha256').update(bytes).digest('hex')}"`;
      const status = request.headers['if-none-match'] === etag ? 304 : 200;
      requests.push({ path: `${url.pathname}${url.search}`, status, bytes: status === 304 ? 0 : bytes.length, method: request.method });
      response.writeHead(status, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': ['.html', '.json', '.webmanifest'].includes(path.extname(filename)) ? 'no-cache' : 'public, max-age=600', ETag: etag });
      response.end(status === 304 || request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      requests.push({ path: request.url, status: 404, error: error.code || error.name });
      response.writeHead(404).end('Not found');
    }
  });
  await listen(server);
  return { origin: `http://127.0.0.1:${server.address().port}`, requests, fixtureRequests, close: () => close(server) };
}

/** A deny-only browser proxy makes external egress impossible, including from
 * service workers. There is deliberately no forwarding or CONNECT tunnel. */
export async function createInitialLoadDenyProxy() {
  const requests = [], sockets = new Set();
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.writeHead(502, { 'Cache-Control': 'no-store' }).end('External networking disabled for initial-load measurement');
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('connect', (request, socket) => {
    requests.push({ method: 'CONNECT', url: request.url });
    socket.end('HTTP/1.1 502 External networking disabled\r\nConnection: close\r\n\r\n');
  });
  await listen(server);
  return { origin: `http://127.0.0.1:${server.address().port}`, requests,
    close: () => { for (const socket of sockets) socket.destroy(); return close(server); } };
}
