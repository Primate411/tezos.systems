import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const child = spawn('python3', ['tests/lib/smoke-server.py', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', diagnostics = '';
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { diagnostics += chunk; });
try {
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Test server did not start: ${diagnostics}`)), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`Test server exited: ${diagnostics}`)); });
    child.stdout.on('data', () => { const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
  });
  const paths = ['/js/core/app.js', '/js/core/generated-transport.mjs', '/css/styles.min.css', '/index.html'];
  const expected = new Map(await Promise.all(paths.map(async file => [file, await readFile(new URL(`..${file}`, import.meta.url))])));
  await Promise.all(Array.from({ length: 96 }, async (_, i) => {
    const file = paths[i % paths.length];
    const response = await fetch(`${origin}${file}?burst=${i}`, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, file);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected.get(file), `${file}: unchanged served bytes`);
    if (file.endsWith('.mjs')) assert.match(response.headers.get('content-type'), /javascript/);
  }));
  const redirect = await fetch(`${origin}/health?view=test`, { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), '/health/?view=test');
  assert.equal((await fetch(`${origin}/no-such-smoke-file`)).status, 404);
  const head = await fetch(`${origin}/js/core/generated-transport.mjs`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  console.log('ok - 96 concurrent test-server responses preserve exact bytes, JS MIME, redirects, missing files and HEAD');
} finally {
  if (child.exitCode === null && child.signalCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; }
}
