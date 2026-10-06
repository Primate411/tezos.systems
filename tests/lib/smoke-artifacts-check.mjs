import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { instrumentBrowserForArtifacts } from './smoke-artifacts.mjs';

export async function checkSmokeArtifacts() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smoke-artifacts-test-'));
  try {
    for (const retain of [true, false]) {
      let started = 0;
      const raw = { newContext: async () => ({
        tracing: { start: async () => { started++; }, stop: async ({ path: file }) => writeFile(file, 'trace evidence') },
        pages: () => [{ url: () => 'https://fixture.invalid', isClosed: () => false,
          screenshot: async ({ path: file }) => writeFile(file, 'pixels'), content: async () => '<main>Original failure</main>' }],
        close: async () => {}
      }) };
      const runtime = await instrumentBrowserForArtifacts(raw, { artifactRoot: root, suiteName: 'first-failure', iteration: 1, attempt: 1 });
      const closed = await runtime.browser.newContext();
      await closed.close();
      await runtime.browser.newContext();
      assert.equal(started, 2, 'capture starts before the first attempt, even without retries');
      await runtime.flush({ retain });
      const dir = path.join(root, 'first-failure/iteration-1/attempt-1');
      if (retain) {
        assert.equal(await readFile(path.join(dir, 'context-01-trace.zip'), 'utf8'), 'trace evidence', 'retain earlier closed contexts');
        assert.match(await readFile(path.join(dir, 'context-02-page-01.html'), 'utf8'), /Original failure/);
      } else await assert.rejects(stat(dir), { code: 'ENOENT' }, 'discard successful trace payloads');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
}
