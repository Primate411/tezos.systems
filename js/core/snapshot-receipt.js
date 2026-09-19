import { sha256Text } from './sha256.js?serialization=1';

const SHA256_HEX = /^[0-9a-f]{64}$/i;

/**
 * Bind a parsed generated snapshot to the exact source receipt carried by its
 * already-validated launcher projection. This deliberately checks both the
 * semantic content hash and the byte-for-byte file digest: either mismatch can
 * indicate a partial deploy, proxy skew, or a stale intermediary response.
 */
export async function assertSnapshotMatchesProjection(snapshot, sourceText, receipt, { label = 'Snapshot' } = {}) {
    if (!receipt) return snapshot;

    const expectedContentHash = String(receipt.contentHash || '');
    const expectedFileSha256 = String(receipt.fileSha256 || '');
    if (!SHA256_HEX.test(expectedContentHash) || !SHA256_HEX.test(expectedFileSha256)) {
        throw new Error(`${label} launcher projection source receipt is incomplete.`);
    }

    const actualContentHash = String(snapshot?.contentHash || '');
    if (!SHA256_HEX.test(actualContentHash)
        || actualContentHash.toLowerCase() !== expectedContentHash.toLowerCase()) {
        throw new Error(`${label} does not match the launcher projection content receipt.`);
    }

    const actualFileSha256 = await sha256Text(sourceText);
    if (actualFileSha256.toLowerCase() !== expectedFileSha256.toLowerCase()) {
        throw new Error(`${label} does not match the launcher projection exact-file receipt.`);
    }

    return snapshot;
}
