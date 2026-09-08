// A transport version, independent of every source schema and frozen evaluator.
// Objects become [shape, ...values]; arrays become [-1, ...values]. Values,
// ordering, and the source serialization survive byte for byte.
export const GENERATED_TRANSPORT_VERSION = 'chamber-json-shapes-v1';
export const GENERATED_TRANSPORT_PREFIX = '/data/transports/v1/';
export const MAX_GENERATED_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_NODES = 500_000;
const MAX_DEPTH = 64;
const MAX_SHAPES = 2048;
const bytes = value => new TextEncoder().encode(value).length;
const assert = (condition, message) => {
    if (!condition) throw new Error(`Generated transport: ${message}`);
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function sourcePath(value) {
    const path = String(value || '').replace(/^\//, '');
    assert(/^data\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.json$/.test(path)
        && !path.split('/').includes('..'), 'invalid source path');
    return path;
}

export function generatedTransportPath(path) {
    return `${GENERATED_TRANSPORT_PREFIX}${sourcePath(path)}`;
}

export async function encodeGeneratedTransport(text, path, sha256Text) {
    assert(typeof text === 'string' && bytes(text) <= MAX_GENERATED_SOURCE_BYTES, 'source exceeds byte budget');
    const value = JSON.parse(text);
    const indent = [0, 2].find(space => `${JSON.stringify(value, null, space)}\n` === text);
    assert(indent !== undefined, 'source must use its canonical compact or two-space JSON envelope');
    const shapes = [], ids = new Map();
    let nodes = 0;
    const encode = (item, depth = 0) => {
        assert(++nodes <= MAX_NODES && depth <= MAX_DEPTH, 'source exceeds structural budget');
        if (item === null || typeof item !== 'object') return item;
        if (Array.isArray(item)) return [-1, ...item.map(child => encode(child, depth + 1))];
        const keys = Object.keys(item), signature = JSON.stringify(keys);
        let id = ids.get(signature);
        if (id === undefined) {
            id = shapes.length;
            assert(id < MAX_SHAPES, 'source exceeds shape budget');
            ids.set(signature, id);
            shapes.push(keys);
        }
        return [id, ...keys.map(key => encode(item[key], depth + 1))];
    };
    const data = encode(value);
    return {
        transport: GENERATED_TRANSPORT_VERSION,
        source: { path: sourcePath(path), bytes: bytes(text), sha256: await sha256Text(text), indent },
        shapes,
        data
    };
}

export async function decodeGeneratedTransport(text, path, sha256Text) {
    assert(typeof text === 'string' && bytes(text) <= MAX_GENERATED_SOURCE_BYTES, 'response exceeds byte budget');
    const envelope = JSON.parse(text);
    // Older deployments and controlled fixtures may still supply expanded JSON.
    // Callers retain their original schema, content, and exact-file checks.
    if (!object(envelope) || !Object.hasOwn(envelope, 'transport')) return { value: envelope, text };
    assert(envelope.transport === GENERATED_TRANSPORT_VERSION, 'unsupported version');
    const source = envelope.source;
    assert(object(source) && source.path === sourcePath(path), 'wrong source identity');
    assert(Number.isSafeInteger(source.bytes) && source.bytes > 0 && source.bytes <= MAX_GENERATED_SOURCE_BYTES,
        'invalid source byte budget');
    assert(/^[a-f0-9]{64}$/.test(source.sha256 || '') && [0, 2].includes(source.indent), 'invalid source receipt');
    assert(Array.isArray(envelope.shapes) && envelope.shapes.length <= MAX_SHAPES, 'invalid shape dictionary');
    const keyCosts = envelope.shapes.map(keys => {
        assert(Array.isArray(keys) && keys.length <= MAX_NODES
            && keys.every(key => typeof key === 'string') && new Set(keys).size === keys.length,
        'invalid or duplicate shape keys');
        return keys.reduce((total, key) => total + JSON.stringify(key).length + 1 + (source.indent ? 1 : 0), 0);
    });
    let nodes = 0, characters = 1; // final source newline
    const charge = count => {
        characters += count;
        // UTF-8 bytes cannot be fewer than UTF-16 JSON characters. Bound
        // expansion before constructing or serializing oversized output.
        assert(characters <= source.bytes, 'decoded source exceeds declared byte budget');
    };
    const decode = (item, depth = 0) => {
        assert(++nodes <= MAX_NODES && depth <= MAX_DEPTH, 'response exceeds structural budget');
        if (!Array.isArray(item)) {
            assert(item === null || ['string', 'boolean'].includes(typeof item)
                || (typeof item === 'number' && Number.isFinite(item)), 'invalid encoded value');
            charge(JSON.stringify(item).length);
            return item;
        }
        const id = item[0], length = item.length - 1;
        assert(Number.isInteger(id) && (id === -1 || (id >= 0 && id < envelope.shapes.length)), 'invalid shape reference');
        const keys = id === -1 ? null : envelope.shapes[id];
        assert(!keys || keys.length === length, 'shape row length mismatch');
        charge(2 + Math.max(0, length - 1) + (keys ? keyCosts[id] : 0)
            + (source.indent && length ? length * (1 + (depth + 1) * source.indent) + 1 + depth * source.indent : 0));
        const result = keys ? {} : [];
        for (let index = 0; index < length; index++) {
            const value = decode(item[index + 1], depth + 1);
            if (!keys) result.push(value);
            else if (keys[index] === '__proto__') Object.defineProperty(result, keys[index], { value, enumerable: true, writable: true, configurable: true });
            else result[keys[index]] = value;
        }
        return result;
    };
    const value = decode(envelope.data);
    const sourceText = `${JSON.stringify(value, null, source.indent)}\n`;
    assert(bytes(sourceText) === source.bytes, 'source byte length mismatch');
    assert(await sha256Text(sourceText) === source.sha256, 'source SHA-256 mismatch');
    return { value, text: sourceText };
}
