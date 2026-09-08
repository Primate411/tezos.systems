import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const read = file => fs.readFile(new URL(file, root), 'utf8');
const [app, share, renderer, shared] = await Promise.all(['js/core/app.js', 'js/ui/share.js', 'js/ui/share-renderer.js', 'js/ui/share-state.js'].map(read));
for (const source of [app, share, renderer, shared]) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
assert(Buffer.byteLength(share) + Buffer.byteLength(shared) < 12_000, 'synchronous public share entry must remain small');
assert(!/^import\s.*share-renderer/m.test(share), 'image rendering must stay outside the static import graph');
assert.match(share, /rendererPromise = null;[\s\S]*importAttempt \+= 1/);
assert.match(share, /share-retry=/);
assert.match(share, /pendingActions.has\(opener\)/);
assert.match(share, /location.href === route/);
assert.match(renderer, /liveShareAPY as _liveAPY/);
assert(!/let _liveAPY/.test(renderer), 'lazy captures must use the same live APY values as the dashboard');
for (const name of ['appendCardSeal', 'setLiveAPY', 'trackedTezosUrl', 'loadHtml2Canvas', 'showShareModal', 'captureBrandedChamberShare', 'captureNetworkMomentShare', 'captureProtocol', 'captureTimeline', 'initShare', 'initProtocolShare', 'ensureCardShareButton']) assert(share.includes(name), name);
for (const name of ['captureProtocol', 'captureProtocolHistory', 'captureHistoricalData']) assert(share.includes('window.' + name + ' ='), `early global ${name}`);
for (const id of ['calculator', 'comparison', 'state-of-tezos', 'native-explorer']) assert(app.includes(`'${id}'`));
assert.match(app, /filter\(id => !OPTIONAL_APP_FEATURES.has\(id\)\)/);
assert.match(app, /button\._prepareDeferredFeature = prepare/);
assert.match(app, /await toggle\?\._prepareDeferredFeature\?\.\(\)/);
assert.match(app, /await dashboardInitialization/);
assert.match(app, /app-retry=/);
assert(!app.includes("safe('calculator', initCalculator)"));
assert(!app.includes("safe('stateOfTezos', initStateOfTezos)"));
assert(!app.includes("safe('nativeExplorer', initNativeExplorer)"));
// Execute the public share loader with controlled imports: concurrent intents
// share one attempt; a failed URL is retried once under a new specifier; the
// successful module remains the owner for subsequent entry points.
const attempts = [];
const context = vm.createContext({ window: {}, importModule: specifier => new Promise((resolve, reject) => attempts.push({ specifier, resolve, reject })) });
const source = share.replace(/^import\s+[^;]+;\s*$/gm, '').replace(/^export\s+\{[^;]+\}[^;]*;\s*$/gm, '')
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|(?:const|let|class)\b)/g, '').replace(/\bimport\(/g, 'importModule(');
new vm.Script(source + '\nglobalThis.load = loadShareRenderer;').runInContext(context);
const first = context.load(), same = context.load();
assert.equal(first, same);
assert.equal(attempts.length, 1);
attempts[0].reject(new Error('offline'));
await assert.rejects(first, /offline/);
const retry = context.load();
assert.equal(attempts.length, 2);
assert.equal(attempts[1].specifier, './share-renderer.js?share-retry=1');
const owner = { marker: 'one renderer' };
attempts[1].resolve(owner);
assert.equal(await retry, owner);
assert.equal(await context.load(), owner);
assert.equal(attempts.length, 2);
console.log('ok - optional controller boundaries and small retryable share facade preserve public APIs and state ownership');
