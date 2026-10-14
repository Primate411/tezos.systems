import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { waitForPagesArtifact } = require('../.github/scripts/pages-artifact-ready/index.cjs');
const expected = { id: 12345, name: 'github-pages', size: 4096 };
async function exercise(listings, options = {}) {
  const waits = [];
  let calls = 0;
  const result = await waitForPagesArtifact({
    expectedId: expected.id,
    listArtifacts: async () => {
      const next = listings[Math.min(calls++, listings.length - 1)];
      if (next instanceof Error) throw next;
      return { artifacts: next };
    },
    sleep: async delay => { waits.push(delay); },
    ...options
  });
  return { result, waits, calls };
}
assert.deepEqual(await exercise([[expected]]), { result: expected, waits: [], calls: 1 });
assert.deepEqual(await exercise([[], [{ id: 7, name: 'browser-smoke-1-of-6', size: 8 }], [expected]]), {
  result: expected, waits: [5000, 5000], calls: 3
});
assert.deepEqual(await exercise([[{ ...expected, id: 999 }], [expected]]), {
  result: expected, waits: [5000], calls: 2
});
let calls = 0;
const waits = [];
await assert.rejects(waitForPagesArtifact({
  expectedId: expected.id,
  listArtifacts: async () => { calls++; return { artifacts: [] }; },
  sleep: async delay => { waits.push(delay); }
}), /not ready after 12 checks/);
assert.equal(calls, 12);
assert.deepEqual(waits, Array(11).fill(5000));
await assert.rejects(exercise([[expected, { ...expected, id: 9 }]]), /ambiguous/);
await assert.rejects(exercise([[{ ...expected, size: 0 }]]), /no verified content/);
await assert.rejects(exercise([null]), /invalid listing/);
await assert.rejects(exercise([new Error('Forbidden')]), /Forbidden/);
await assert.rejects(exercise([[expected]], { expectedId: '' }), /valid artifact ID/);
await assert.rejects(exercise([[expected]], { attempts: 13 }), /bounded/);
await assert.rejects(exercise([[]], { sleep: async () => { throw new Error('cancelled'); } }), /cancelled/);

const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const job = workflow.slice(workflow.indexOf('\n  deploy-pages:'));
const upload = job.indexOf('uses: actions/upload-pages-artifact@v5');
const ready = job.indexOf('name: Wait for the uploaded Pages artifact');
const deploy = job.indexOf('uses: actions/deploy-pages@v5');
assert(upload > 0 && ready > upload && deploy > ready, 'readiness gates deployment after successful upload');
assert.match(job, /PAGES_ARTIFACT_ID: \$\{\{ steps.pages-artifact.outputs.artifact_id \}\}/);
assert.match(job, /timeout-minutes: 3/);
assert(!job.includes('continue-on-error'), 'missing or ambiguous artifacts must keep Pages red');
assert.match(job, /npm ci --prefix \.github\/scripts\/pages-artifact-ready --ignore-scripts/);
const client = await readFile(new URL('../.github/scripts/pages-artifact-ready/run.cjs', import.meta.url), 'utf8');
assert.match(client, /DefaultArtifactClient/);
assert.match(client, /client\.listArtifacts\(\)/, 'use the same artifact service as deploy-pages');
const pkg = JSON.parse(await readFile(new URL('../.github/scripts/pages-artifact-ready/package.json', import.meta.url)));
const lock = JSON.parse(await readFile(new URL('../.github/scripts/pages-artifact-ready/package-lock.json', import.meta.url)));
assert.equal(pkg.dependencies['@actions/artifact'], '2.3.2');
assert.equal(lock.packages['node_modules/@actions/artifact'].version, pkg.dependencies['@actions/artifact']);
console.log('ok - Pages waits for the exact uploaded artifact, recovers delayed listings, and rejects ambiguity, missing data and exhausted waits');
