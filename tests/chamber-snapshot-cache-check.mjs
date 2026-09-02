import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const digest = value => createHash('sha256').update(String(value)).digest('hex');
const records = new Map();
let blocked = false;
let denied = false;
const indexedDB = {
  open() {
    if (denied) throw new Error('Storage denied');
    const request = {};
    if (blocked) return request;
    queueMicrotask(() => {
      request.result = {
        close() {},
        transaction() {
          const transaction = {
            abort() { transaction.onabort?.(); },
            objectStore: () => ({
              get(key) {
                const read = {};
                queueMicrotask(() => {
                  read.result = structuredClone(records.get(key));
                  try { read.onsuccess(); } catch { transaction.onabort?.(); return; }
                  queueMicrotask(() => transaction.oncomplete?.());
                });
                return read;
              },
              put(record, key) { records.set(key, structuredClone(record)); }
            })
          };
          return transaction;
        }
      };
      request.onsuccess();
    });
    return request;
  }
};
const context = vm.createContext({ indexedDB, Date, TextEncoder, setTimeout, clearTimeout, sha256Text: async value => digest(value) });
for (const name of ['snapshot-receipt', 'chamber-snapshot-cache']) {
  const source = (await readFile(new URL(`../js/core/${name}.js`, import.meta.url), 'utf8'))
    .replace(/^import[^;]+;\s*$/gm, '').replace(/export /g, '');
  vm.runInContext(source, context);
}
const createCache = vm.runInContext('createChamberSnapshotCache', context);
const snapshot = { schemaVersion: 1, generatedAt: '2026-09-02T12:00:00Z', contentHash: 'a'.repeat(64), complete: true };
const text = JSON.stringify(snapshot);
const summary = { source: { contentHash: snapshot.contentHash, fileSha256: digest(text) }, verified: true };
const options = {
  key: 'capital',
  validateSnapshot: async value => { assert(value.schemaVersion === 1 && value.complete === true); return value; },
  validateSummary: async value => { assert(value.verified); return value; },
  receiptFor: value => value.source
};
const fresh = () => createCache(options);
await fresh().save(text, summary);
const good = structuredClone(records.get('capital'));
assert.deepEqual(JSON.parse(JSON.stringify(await fresh().read())), { snapshot, summary });
assert.equal(records.size, 1, 'one bounded slot per room, no generation accumulation');
for (const [name, mutate] of [
  ['wrong raw digest', record => { record.text += ' '; }],
  ['invalid schema', record => { record.text = JSON.stringify({ ...snapshot, schemaVersion: 2 }); record.fileSha256 = digest(record.text); }],
  ['incomplete receipts', record => { record.text = JSON.stringify({ ...snapshot, complete: false }); record.fileSha256 = digest(record.text); }],
  ['invalid summary', record => { record.summary.verified = false; }],
  ['mismatched semantic receipt', record => { record.summary.source.contentHash = 'b'.repeat(64); }],
  ['mismatched exact-file receipt', record => { record.summary.source.fileSha256 = 'b'.repeat(64); }],
  ['mismatched generation', record => { record.generatedAt = '2026-09-01T00:00:00Z'; }],
  ['expired retention', record => { record.storedAt = Date.now() - 8 * 86_400_000; }],
  ['future cache clock', record => { record.storedAt = Date.now() + 86_400_000; }],
  ['unsupported envelope', record => { record.version = 2; }],
  ['oversized cache', record => { record.text = 'x'.repeat(4 * 1024 * 1024 + 1); record.fileSha256 = digest(record.text); }]
]) {
  const bad = structuredClone(good); mutate(bad); records.set('capital', bad);
  assert.equal(await fresh().read(), null, `${name} must be a cold cache miss`);
}
records.set('capital', good);
await fresh().save(JSON.stringify({ ...snapshot, generatedAt: '2026-09-01T00:00:00Z' }), null);
assert.equal(records.get('capital').text, text, 'a delayed older tab must not overwrite a newer generation');
await fresh().save('x'.repeat(4 * 1024 * 1024 + 1));
assert.equal(records.get('capital').text, text, 'oversized writes do not replace the last good record');
denied = true;
assert.equal(await fresh().read(), null, 'private/storage-denied mode falls back to normal loading');
await fresh().save(text, summary);
denied = false; blocked = true;
assert.equal(await fresh().read(), null, 'blocked IndexedDB opens time out instead of stranding a room');
blocked = false;
assert.throws(() => createCache({ ...options, key: 'live-api' }), /Unknown/);
console.log('ok - generated snapshot cache: integrity, projection binding, schema, clock, size, monotonic writes, and storage failure checks');
