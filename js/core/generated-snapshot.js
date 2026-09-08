import { sha256Text } from './sha256.js';
import { decodeGeneratedTransport, generatedTransportPath } from './generated-transport.mjs';

export async function fetchGeneratedSnapshot(path, { cache = 'no-cache' } = {}) {
    const canonicalPath = String(path).replace(/^\//, '');
    const options = { cache, headers: { Accept: 'application/json' } };
    let response = await fetch(generatedTransportPath(canonicalPath), options);
    // A source without a newly generated transport remains readable during a
    // rollout. Corruption, transient failures, and hash skew must fail closed.
    if (response.status === 404 || response.status === 410) response = await fetch(`/${canonicalPath}`, options);
    if (!response.ok) throw new Error(`${canonicalPath} returned HTTP ${response.status}`);
    return decodeGeneratedTransport(await response.text(), canonicalPath, sha256Text);
}
