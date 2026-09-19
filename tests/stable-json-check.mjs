import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/core/sha256.js', import.meta.url), 'utf8');
const { stableJsonValue } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const input = Object.freeze({ z: null, a: Object.freeze([{ z: 0, a: false }, 'second', null]), n: '9007199254740993' });
assert.equal(JSON.stringify(stableJsonValue(input)), '{"a":[{"a":false,"z":0},"second",null],"n":"9007199254740993","z":null}');
assert.equal(input.a[1], 'second');
assert.notEqual(stableJsonValue(input), input);
assert.equal(JSON.stringify(stableJsonValue({ x: undefined, a: [undefined, , NaN], b: -0 })), '{"a":[null,null,null],"b":0}');
const hostile = JSON.parse('{"constructor":{"z":2,"a":1},"__proto__":{"polluted":true},"a":0}');
const normalized = stableJsonValue(hostile);
assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
assert.equal(Object.hasOwn(normalized, '__proto__'), true);
assert.equal({}.polluted, undefined);
assert.equal(JSON.stringify(normalized), '{"__proto__":{"polluted":true},"a":0,"constructor":{"a":1,"z":2}}');
assert.equal(JSON.stringify(stableJsonValue({ '10': 'ten', '2': 'two', z: 1, a: 2 })), '{"2":"two","10":"ten","a":2,"z":1}');
assert.throws(() => JSON.stringify(stableJsonValue({ amount: 1n })), TypeError);

// Published generator receipts are independent of the shared browser helper.
// Any semantic change here must fail against real populated artifacts.
const files = [
  'capital-snapshot', 'capital-entry-summary', 'minerals-snapshot', 'minerals-entry-summary',
  'metals-snapshot', 'metals-entry-summary', 'uranium-snapshot', 'uranium-entry-summary',
  'ecosystem-stats', 'ecosystem-entry-summary', 'baker-governance-signals',
  'maxis-l2-governance', 'maxis-careers', 'maxis/entry-summary'
];
for (const file of files) {
  const artifact = JSON.parse(await readFile(new URL(`../data/${file}.json`, import.meta.url), 'utf8'));
  const { contentHash, integrity, ...unsigned } = artifact;
  const expected = contentHash || integrity?.contentHash;
  assert.match(expected, /^[a-f0-9]{64}$/i, `${file}: requires a generator receipt`);
  const actual = createHash('sha256').update(JSON.stringify(stableJsonValue(unsigned))).digest('hex');
  assert.equal(actual, expected.toLowerCase(), `${file}: preserved published content hash`);
}
console.log(`ok - stable JSON preserves array/value/hostile-key semantics and ${files.length} real artifact hashes`);
