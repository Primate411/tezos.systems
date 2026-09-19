/**
 * SHA-256 for browser-side integrity receipts.
 *
 * Web Crypto is preferred when the page has access to it. Browsers can withhold
 * `crypto.subtle` on plain-HTTP LAN origins, so the same digest is available
 * through a small synchronous JavaScript implementation instead of skipping
 * verification or rejecting an otherwise valid first-party artifact.
 */

const INITIAL_STATE = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);

const ROUND_CONSTANTS = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotateRight(value, distance) {
    return (value >>> distance) | (value << (32 - distance));
}

function utf8Bytes(value) {
    const text = String(value);
    if (typeof TextEncoder !== 'undefined') {
        try {
            return new TextEncoder().encode(text);
        } catch {
            // Continue with the equivalent UTF-8 encoder below.
        }
    }

    const bytes = [];
    for (let index = 0; index < text.length; index += 1) {
        let codePoint = text.charCodeAt(index);
        if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
            const next = text.charCodeAt(index + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
                index += 1;
            } else {
                codePoint = 0xfffd;
            }
        } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
            codePoint = 0xfffd;
        }

        if (codePoint <= 0x7f) {
            bytes.push(codePoint);
        } else if (codePoint <= 0x7ff) {
            bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
        } else if (codePoint <= 0xffff) {
            bytes.push(
                0xe0 | (codePoint >>> 12),
                0x80 | ((codePoint >>> 6) & 0x3f),
                0x80 | (codePoint & 0x3f)
            );
        } else {
            bytes.push(
                0xf0 | (codePoint >>> 18),
                0x80 | ((codePoint >>> 12) & 0x3f),
                0x80 | ((codePoint >>> 6) & 0x3f),
                0x80 | (codePoint & 0x3f)
            );
        }
    }
    return Uint8Array.from(bytes);
}

function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function sha256FallbackHex(value) {
    const bytes = utf8Bytes(value);
    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;

    const bitLength = bytes.length * 8;
    const highLength = Math.floor(bitLength / 0x100000000);
    const lowLength = bitLength >>> 0;
    for (let index = 0; index < 4; index += 1) {
        const shift = 24 - (index * 8);
        padded[paddedLength - 8 + index] = (highLength >>> shift) & 0xff;
        padded[paddedLength - 4 + index] = (lowLength >>> shift) & 0xff;
    }

    const state = new Uint32Array(INITIAL_STATE);
    const words = new Uint32Array(64);

    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let index = 0; index < 16; index += 1) {
            const wordOffset = offset + (index * 4);
            words[index] = (
                (padded[wordOffset] << 24)
                | (padded[wordOffset + 1] << 16)
                | (padded[wordOffset + 2] << 8)
                | padded[wordOffset + 3]
            ) >>> 0;
        }
        for (let index = 16; index < 64; index += 1) {
            const lower = words[index - 15];
            const upper = words[index - 2];
            const sigma0 = rotateRight(lower, 7) ^ rotateRight(lower, 18) ^ (lower >>> 3);
            const sigma1 = rotateRight(upper, 17) ^ rotateRight(upper, 19) ^ (upper >>> 10);
            words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
        }

        let a = state[0];
        let b = state[1];
        let c = state[2];
        let d = state[3];
        let e = state[4];
        let f = state[5];
        let g = state[6];
        let h = state[7];

        for (let index = 0; index < 64; index += 1) {
            const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
            const choose = (e & f) ^ (~e & g);
            const temp1 = (h + sum1 + choose + ROUND_CONSTANTS[index] + words[index]) >>> 0;
            const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
            const majority = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (sum0 + majority) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        state[0] = (state[0] + a) >>> 0;
        state[1] = (state[1] + b) >>> 0;
        state[2] = (state[2] + c) >>> 0;
        state[3] = (state[3] + d) >>> 0;
        state[4] = (state[4] + e) >>> 0;
        state[5] = (state[5] + f) >>> 0;
        state[6] = (state[6] + g) >>> 0;
        state[7] = (state[7] + h) >>> 0;
    }

    const digest = new Uint8Array(32);
    for (let index = 0; index < state.length; index += 1) {
        digest[index * 4] = state[index] >>> 24;
        digest[(index * 4) + 1] = state[index] >>> 16;
        digest[(index * 4) + 2] = state[index] >>> 8;
        digest[(index * 4) + 3] = state[index];
    }
    return bytesToHex(digest);
}

export async function sha256Text(value, { subtle = globalThis.crypto?.subtle } = {}) {
    const text = String(value);
    if (subtle?.digest) {
        try {
            const digest = new Uint8Array(await subtle.digest('SHA-256', utf8Bytes(text)));
            if (digest.length === 32) return bytesToHex(digest);
        } catch {
            // A deterministic fallback still verifies the exact same receipt.
        }
    }
    return sha256FallbackHex(text);
}

// Consumers use ?serialization=1 to avoid reusing a pre-serializer module in
// long-lived tabs. Keep this interface version separate from the build stamp.
// Canonical object-key order for snapshot hashes; array order is meaningful.
export function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map(stableJsonValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
}
