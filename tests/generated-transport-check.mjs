import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { encodeGeneratedTransport, decodeGeneratedTransport, generatedTransportPath, MAX_GENERATED_SOURCE_BYTES } from '../js/core/generated-transport.mjs';
import { transportSources, generateChamberTransports } from '../scripts/generate-chamber-transports.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const digest = text => createHash('sha256').update(text).digest('hex');
const read = relative => fs.readFile(path.join(ROOT, relative), 'utf8');
const sources = await transportSources();
let originalBytes = 0, transportBytes = 0, originalGzip = 0, transportGzip = 0;
for (const source of sources) {
    const original = await read(source);
    const compact = await read(generatedTransportPath(source).slice(1));
    assert.equal(compact, `${JSON.stringify(await encodeGeneratedTransport(original, source, digest))}\n`, `${source}: deterministic transport`);
    const decoded = await decodeGeneratedTransport(compact, source, digest);
    assert.equal(decoded.text, original, `${source}: exact source serialization and SHA receipt`);
    assert.deepEqual(decoded.value, JSON.parse(original), `${source}: every observation, null, unit, qualifier, link and receipt survives`);
    assert.equal((await decodeGeneratedTransport(original, source, digest)).text, original, `${source}: expanded compatibility`);
    const before = Buffer.byteLength(original), after = Buffer.byteLength(compact);
    assert(after < before, `${source}: transport must save decoded response bytes`);
    originalBytes += before; transportBytes += after;
    originalGzip += gzipSync(original).length; transportGzip += gzipSync(compact).length;
}
assert(transportGzip < originalGzip, 'combined transport must also save real gzip transfer bytes');

// The fixture includes hostile property names as data, heterogeneous arrays,
// empty containers, Unicode, large integer strings, missing keys and real zero.
const sample = JSON.parse('{"__proto__":{"safe":true},"constructor":null,"zero":0,"false":false,"empty":"","rows":[[],{},null,[0,-1],{"missing":null},{"unit":"μg/t","raw":"<0.01","qualifier":"XX","n":"900719925474099312345"}],"url":"https://example.test/source?a=1&b=2"}');
for (const indent of [0, 2]) {
    const source = `${JSON.stringify(sample, null, indent)}\n`;
    const packed = await encodeGeneratedTransport(source, 'data/fixture.json', digest);
    const before = JSON.stringify(packed);
    const decoded = await decodeGeneratedTransport(before, 'data/fixture.json', digest);
    assert.equal(decoded.text, source);
    assert.deepEqual(decoded.value, sample);
    assert.equal(Object.getPrototypeOf(decoded.value), Object.prototype);
    assert.equal(JSON.stringify(packed), before, 'decoding does not mutate or freeze caller-owned data');
}
const source = `${JSON.stringify({ rows: [{ x: 1 }, { x: null }], title: 'receipt' })}\n`;
const valid = await encodeGeneratedTransport(source, 'data/fixture.json', digest);
for (const [name, mutate] of [
    ['unsupported transport version', value => { value.transport = 'future'; }],
    ['wrong source identity', value => { value.source.path = 'data/elsewhere.json'; }],
    ['wrong source hash', value => { value.source.sha256 = '0'.repeat(64); }],
    ['wrong source length', value => { value.source.bytes++; }],
    ['oversized source claim', value => { value.source.bytes = MAX_GENERATED_SOURCE_BYTES + 1; }],
    ['unknown source formatting', value => { value.source.indent = 8; }],
    ['missing dictionary', value => { value.shapes = null; }],
    ['unknown object reference', value => { value.data[0] = value.shapes.length; }],
    ['negative object reference', value => { value.data[0] = -2; }],
    ['fractional object reference', value => { value.data[0] = .5; }],
    ['truncated row', value => { value.data.pop(); }],
    ['extra row value', value => { value.data.push(null); }],
    ['duplicate shape keys', value => { value.shapes[0][1] = value.shapes[0][0]; }],
    ['unencoded object value', value => { value.data[1] = {}; }],
    ['wrong observation', value => { value.data[2] = 'modified'; }],
    ['oversized decoded row', value => { value.data[2] = 'x'.repeat(5000); }],
    ['excessive nesting', value => { let deep = null; for (let n = 0; n < 70; n++) deep = [-1, deep]; value.data[1] = deep; value.source.bytes = 10000; }]
]) {
    const bad = structuredClone(valid); mutate(bad);
    await assert.rejects(() => decodeGeneratedTransport(JSON.stringify(bad), 'data/fixture.json', digest), /Generated transport:/, name);
}
await assert.rejects(() => decodeGeneratedTransport(' '.repeat(MAX_GENERATED_SOURCE_BYTES + 1), 'data/fixture.json', digest), /byte budget/);
assert.throws(() => generatedTransportPath('data/../secret.json'), /invalid source path/);
assert.throws(() => generatedTransportPath('https://example.test/data/fixture.json'), /invalid source path/);

const loaderSource = (await read('js/core/generated-snapshot.js')).replace(/^import[^;]+;\s*$/gm, '').replace(/export /g, '');
const requests = [];
let responses = [];
const context = vm.createContext({ decodeGeneratedTransport, generatedTransportPath, sha256Text: digest,
    fetch: async (url, options) => {
        requests.push({ url, options });
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return { ok: response.status === 200, status: response.status, text: async () => response.text };
    }
});
vm.runInContext(`${loaderSource}\nglobalThis.load = fetchGeneratedSnapshot;`, context);
const run = async (next, options) => { requests.length = 0; responses = next; return context.load('/data/fixture.json', options); };
assert.equal((await run([{ status: 200, text: JSON.stringify(valid) }])).text, source);
assert.deepEqual(requests.map(row => row.url), ['/data/transports/v1/data/fixture.json'], 'encoded success never fetches full expanded source');
for (const status of [404, 410]) {
    assert.equal((await run([{ status }, { status: 200, text: source }], { cache: 'default' })).text, source);
    assert.deepEqual(requests.map(row => row.url), ['/data/transports/v1/data/fixture.json', '/data/fixture.json']);
    assert(requests.every(row => row.options.cache === 'default'), 'Passport transport and fallback retain normal HTTP caching');
}
for (const failure of [{ status: 503 }, new Error('network unavailable'), { status: 200, text: JSON.stringify({ ...valid, transport: 'bad' }) }]) {
    await assert.rejects(() => run([failure]));
    assert.equal(requests.length, 1, 'failure and corruption must not silently bypass the transport receipt');
}
assert.equal((await run([{ status: 200, text: JSON.stringify(valid) }])).text, source, 'explicit retry recovers after a failed request');

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'chamber-transport-check-'));
try {
    await fs.mkdir(path.join(temporary, 'data'));
    const original = await read('data/capital-snapshot.json');
    await fs.writeFile(path.join(temporary, 'data/capital-snapshot.json'), original);
    await assert.rejects(() => generateChamberTransports({ root: temporary, only: 'capital', check: true }), /missing transport/);
    await generateChamberTransports({ root: temporary, only: 'capital' });
    await generateChamberTransports({ root: temporary, only: 'capital', check: true });
    assert.equal(await fs.readFile(path.join(temporary, 'data/capital-snapshot.json'), 'utf8'), original, 'derivation never edits original source or its receipt');
    await fs.writeFile(path.join(temporary, generatedTransportPath('data/capital-snapshot.json').slice(1)), '{}\n');
    await assert.rejects(() => generateChamberTransports({ root: temporary, only: 'capital', check: true }), /Stale or missing/);
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
console.log(`ok - ${sources.length} exact source round trips; ${originalBytes} -> ${transportBytes} bytes, gzip ${originalGzip} -> ${transportGzip}`);
console.log('ok - source identity, corruption, expansion limits, hostile keys, rollout fallback, explicit recovery, and read-only generator checks');
