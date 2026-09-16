import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

async function waitFor(check, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function bounded(promise, label, timeoutMs = 10000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

function readHttp(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { agent: false }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject);
    request.setTimeout(2000, () => request.destroy(new Error(`HTTP request timed out: ${url}`)));
  });
}

async function stopOwnedChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  try { await bounded(exited, 'owned child cleanup', 7000); }
  catch {
    // Only this test's own child is a fallback target; never signal a preview
    // selected by a port, process name or global browser process search.
    child.kill('SIGKILL');
    await bounded(exited, 'forced owned child cleanup', 3000);
  }
}

if (process.platform === 'win32') {
  console.log('skip - initial-load cancellation uses POSIX signals (supported CI/developer platforms are Linux/macOS)');
} else {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'initial-load-cancellation-'));
  const artifacts = path.join(ROOT, 'test-artifacts/initial-load/cancellation', path.basename(temporary));
  let unrelated;
  try {
    // Observe the real server's navigation request without modifying HTML,
    // browser timing, or the measurement implementation. The message proves
    // the CLI has entered its final measurement, rather than only launched a
    // browser; cancelling earlier would miss the swallowed-final-run bug.
    const preload = path.join(temporary, 'observe-server.cjs');
    await fs.writeFile(preload, `
      const http = require('node:http');
      const createServer = http.createServer;
      http.createServer = function (...args) {
        const server = createServer.apply(this, args);
        server.on('request', request => {
          if (request.method === 'GET' && request.url === '/' && process.send) {
            const address = server.address();
            process.send({ type: 'measurement-navigation', origin: 'http://127.0.0.1:' + address.port });
          }
        });
        return server;
      };
    `);
    unrelated = spawn(process.execPath, ['-e', `
      const http = require('node:http');
      const server = http.createServer((_request, response) => response.end('unrelated process is still serving'));
      server.listen(0, '127.0.0.1', () => process.send({ origin: 'http://127.0.0.1:' + server.address().port }));
    `], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const [unrelatedReceipt] = await bounded(once(unrelated, 'message'), 'unrelated local server startup');
    assert.equal((await readHttp(unrelatedReceipt.origin)).status, 200);

    for (const signalName of ['SIGINT', 'SIGTERM']) {
      const output = path.join(temporary, `${signalName.toLowerCase()}-report.json`);
      const environment = { ...process.env };
      delete environment.BASE_URL;
      const runner = spawn(process.execPath, ['--require', preload, 'scripts/measure-initial-load.mjs',
        '--profile', 'desktop-anonymous-cold', '--runs', '1', '--warmup-runs', '0',
        '--settle-ms', '15000', '--output', output, '--label', `cancellation-${signalName}`], {
        cwd: ROOT, env: environment, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
      });
      const exited = once(runner, 'exit');
      let logs = '';
      let navigation;
      runner.stdout.on('data', chunk => { logs = (logs + chunk).slice(-64000); });
      runner.stderr.on('data', chunk => { logs = (logs + chunk).slice(-64000); });
      runner.on('message', message => { if (message.type === 'measurement-navigation') navigation = message; });
      try {
        const startup = await waitFor(async () => {
          if (runner.exitCode !== null || runner.signalCode !== null) throw new Error(`Measurement exited before cancellation: ${logs}`);
          if (!navigation) return null;
          try {
            const report = JSON.parse(await fs.readFile(output, 'utf8'));
            return report.browser && report.baseUrl === navigation.origin ? report : null;
          } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
          }
        }, `active final measurement and persisted startup report (${signalName})`);
        assert.equal(startup.selectedProfileIds.length, 1);
        assert.equal(startup.runsPerProfile, 1);
        assert.equal(runner.kill(signalName), true);
        const [code, signal] = await bounded(exited, `${signalName} CLI exit`, 10000);
        assert.equal(signal, null, `${signalName} must be handled rather than terminate by signal\n${logs}`);
        const final = JSON.parse(await fs.readFile(output, 'utf8'));
        await assert.rejects(readHttp(startup.baseUrl), /ECONNREFUSED/, 'the owned HTTP listener must be closed');
        assert.equal((await readHttp(unrelatedReceipt.origin)).body, 'unrelated process is still serving', 'cancelling measurement must not stop another local process');
        assert.equal(code, signalName === 'SIGINT' ? 130 : 143, `exit code preserves ${signalName}\n${logs}\n${JSON.stringify(final.errors)}`);
        assert.equal(final.exitCode, code, `persisted diagnostics agree with the process exit code\n${logs}\n${JSON.stringify(final)}`);
        assert.equal(final.passed, false, 'cancellation cannot be reported as success');
        assert(final.errors.some(error => error.includes(signalName)), 'persisted errors retain the cancellation reason');
        assert(Number.isFinite(Date.parse(final.completedAt)), 'interrupted reports have a completion timestamp');
        assert(!await fs.stat(`${output}.tmp`).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error)), 'atomic report writing leaves no partial output');
      } finally {
        await stopOwnedChild(runner);
        await fs.writeFile(path.join(temporary, `${signalName.toLowerCase()}.log`), logs);
      }
    }
  } finally {
    await stopOwnedChild(unrelated);
    await fs.mkdir(path.dirname(artifacts), { recursive: true });
    await fs.cp(temporary, artifacts, { recursive: true });
    await fs.rm(temporary, { recursive: true, force: true });
    console.log(`Initial-load cancellation evidence: ${artifacts}`);
  }
  console.log('ok - real initial-load CLI SIGINT/SIGTERM retain exit codes and reports, close owned HTTP, and preserve unrelated local processes');
}
