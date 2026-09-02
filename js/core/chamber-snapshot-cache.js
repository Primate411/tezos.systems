import { sha256Text } from './sha256.js';
import { assertSnapshotMatchesProjection } from './snapshot-receipt.js';

// An optional, application-owned last-good store, not an HTTP or service-worker
// response cache. Never put live API responses here. One bounded record per room.
const DATABASE = 'tezos-chamber-snapshots-v1';
const STORE = 'snapshots';
const ROOMS = new Set(['capital', 'ecosystem', 'minerals', 'metals', 'uranium', 'whales']);
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_TIMEOUT_MS = 350;

function accessRecord(key, record) {
    return new Promise((resolve) => {
        let database;
        let transaction;
        let finished = false;
        const finish = (value = null) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            database?.close();
            resolve(value);
        };
        const timeout = setTimeout(() => {
            try { transaction?.abort(); } catch { /* already complete */ }
            finish();
        }, STORAGE_TIMEOUT_MS);
        try {
            const request = indexedDB.open(DATABASE, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE);
            request.onerror = request.onblocked = () => finish();
            request.onsuccess = () => {
                database = request.result;
                if (finished) { database.close(); return; }
                try {
                    transaction = database.transaction(STORE, record ? 'readwrite' : 'readonly');
                    const store = transaction.objectStore(STORE);
                    const read = store.get(key);
                    let value = null;
                    read.onsuccess = () => {
                        value = read.result || null;
                        // A slower tab must not overwrite a newer saved generation.
                        if (record && (!value || Date.parse(record.generatedAt) >= Date.parse(value.generatedAt))) {
                            store.put(record, key);
                        }
                    };
                    transaction.oncomplete = () => finish(value);
                    transaction.onerror = transaction.onabort = () => finish();
                } catch { finish(); }
            };
        } catch { finish(); } // Private mode, quota, or unavailable IndexedDB.
    });
}

export function createChamberSnapshotCache({ key, validateSnapshot, validateSummary, receiptFor }) {
    if (!ROOMS.has(key)) throw new Error('Unknown generated-snapshot cache key.');
    let readPromise;
    return {
        read() {
            if (readPromise) return readPromise;
            readPromise = (async () => {
                try {
                    const record = await accessRecord(key);
                    const age = Date.now() - record?.storedAt;
                    if (record?.version !== 1 || !Number.isFinite(age) || age < 0 || age > MAX_AGE_MS
                        || typeof record.text !== 'string' || new TextEncoder().encode(record.text).length > MAX_BYTES
                        || await sha256Text(record.text) !== record.fileSha256) return null;
                    const snapshot = await validateSnapshot(JSON.parse(record.text));
                    if (snapshot.generatedAt !== record.generatedAt) return null;
                    const summary = record.summary && validateSummary ? await validateSummary(record.summary) : null;
                    await assertSnapshotMatchesProjection(snapshot, record.text, summary && receiptFor(summary));
                    return { snapshot, summary };
                } catch { return null; } // A corrupt cache is a miss, never a broken room.
            })();
            return readPromise;
        },
        // Call only after the normal schema, semantic hash, and exact projection
        // checks have succeeded. Retain original bytes and clocks for rechecking.
        async save(text, summary = null) {
            try {
                if (new TextEncoder().encode(text).length > MAX_BYTES) return;
                const snapshot = JSON.parse(text);
                await accessRecord(key, {
                    version: 1, text, summary,
                    generatedAt: snapshot.generatedAt,
                    storedAt: Date.now(),
                    fileSha256: await sha256Text(text)
                });
            } catch { /* Storage is an optimization, never a rendering dependency. */ }
        }
    };
}
