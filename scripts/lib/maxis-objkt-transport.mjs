import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const ENDPOINT = 'https://data.objkt.com/v3/graphql';
const TRANSIENT = 'MAXIS_OBJKT_TRANSIENT';
const MAX_CHECKPOINT_BYTES = 8 * 1024 * 1024;
const CHECKPOINT_TTL_MS = 20 * 60 * 1000;
// Reviewed exact frozen documents. Only keyset limit/after may change; the
// document, time window, eligibility filters and returned rows stay unchanged.
const DOCUMENTS = new Map([
  ['8d856c3e7580fa5d7fe8c29245eafa74920433ad9814aa90cfc38bbe3fbca7b8', { field: 'event', keyset: true }],
  ['b79f5fcd697b56b189a78769106b794b2e26266a7377123932013e579132a68f', { field: 'event', keyset: true }],
  ['12da3dc9f65b2795f14510cc30b81e26dd1fcf803b30f497116ec18ced941fe3', { field: 'listing_sale', keyset: true }],
  ['45b007a78cbc28229b2c3e24ebe4bd6ac866b88eef43169d3b06bfc69faa35fa', { field: 'sales_stat', keyset: false }]
]);

const hash = value => createHash('sha256').update(value).digest('hex');
const transient = (message, cause) => Object.assign(new Error(message, { cause }), { code: TRANSIENT, retryable: true });
export const isTransientObjktError = error => error?.code === TRANSIENT;

function cursor(value) {
  if ((typeof value !== 'string' && !Number.isSafeInteger(value)) || !/^\d+$/.test(String(value))) throw new Error('OBJKT cursor must be an exact nonnegative integer');
  return BigInt(value);
}

function validateRows(rows, after, limit, keyset) {
  if (!Array.isArray(rows) || rows.length > limit) throw new Error('OBJKT returned a missing or oversized row collection');
  if (!keyset) return;
  let previous = cursor(after);
  for (const row of rows) {
    const next = cursor(row?.id);
    if (next <= previous) throw new Error('OBJKT returned a duplicate or non-increasing cursor');
    previous = next;
  }
}

function retryAfter(value, now) {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

/** Operational transport only: one complete frozen logical response or an error.
 * Checkpoints resume the identical in-flight request, never a new source clock.
 * No cache of completed history, altered scoring, or partial publication.
 */
export function createMaxisObjktFetch({
  fetch: upstream = globalThis.fetch,
  checkpointDir,
  // https://data.objkt.com/docs/: 120 requests/minute. One serialized request
  // plus 650ms after completion keeps even tiny/instant pages at most 93/minute.
  spacingMs = 650,
  requestTimeoutMs = 12_000,
  now = Date.now,
  wait = (ms, signal) => sleep(ms, undefined, { signal }),
  log = message => console.log(message)
} = {}) {
  let queue = Promise.resolve();
  let notBefore = 0;
  let initialization;
  const pageSizes = new Map();
  const healthyPages = new Map();
  const failureTimes = [];
  let circuitError = null;

  function recordFailure(error) {
    const time = now();
    failureTimes.push(time);
    while (failureTimes.length && time - failureTimes[0] > 120_000) failureTimes.shift();
    if (!circuitError && failureTimes.length >= 8) {
      circuitError = transient('OBJKT remains unstable: eight transient failures within two minutes; defer lane recovery until independent families finish', error);
      log(circuitError.message);
    }
    return circuitError || error;
  }

  async function initialize() {
    if (!checkpointDir) return;
    if (initialization) return initialization;
    initialization = prepareDirectory();
    return initialization;
  }

  async function prepareDirectory() {
    await fs.mkdir(checkpointDir, { recursive: true });
    const entries = [];
    for (const name of await fs.readdir(checkpointDir)) {
      if (!/^[a-f0-9]{64}\.json(?:\.[\w-]+\.tmp)?$/.test(name)) continue;
      const file = path.join(checkpointDir, name);
      const stat = await fs.stat(file);
      entries.push({ file, time: stat.mtimeMs });
    }
    entries.sort((a, b) => b.time - a.time);
    await Promise.all(entries.filter((entry, i) => i >= 64 || now() - entry.time > CHECKPOINT_TTL_MS)
      .map(entry => fs.rm(entry.file, { force: true })));
  }

  async function physical(url, options, request, descriptor) {
    const preceding = queue;
    let release;
    let requestStarted = false;
    queue = new Promise(resolve => { release = resolve; });
    try {
      await preceding;
      if (circuitError) throw circuitError;
      options.signal?.throwIfAborted();
      // Another queued caller may extend the shared cooldown while we wait.
      while (notBefore > now()) await wait(notBefore - now(), options.signal);
      const timeout = AbortSignal.timeout(requestTimeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      requestStarted = true;
      const response = await upstream(url, { ...options, body: JSON.stringify(request), signal });
      if (!response.ok) {
        notBefore = Math.max(notBefore, now() + retryAfter(response.headers.get('retry-after'), now()));
        await response.body?.cancel();
        const message = `${ENDPOINT} returned HTTP ${response.status}`;
        if (response.status === 429 || response.status >= 500) throw Object.assign(transient(message), { status: response.status });
        throw new Error(message);
      }
      const payload = await response.json();
      if (payload?.errors != null && !Array.isArray(payload.errors)) throw new Error('OBJKT returned a malformed error collection');
      if (payload?.errors?.length) {
        const messages = payload.errors.map(error => String(error?.message));
        const message = messages.join('; ');
        if (messages.every(item => /database query error|statement timeout|temporarily unavailable|too many requests/i.test(item))) {
          throw Object.assign(transient(`OBJKT: ${message}`), { status: messages.every(item => /too many requests/i.test(item)) ? 429 : null });
        }
        throw new Error(`OBJKT GraphQL rejected the query: ${message}`);
      }
      const rows = payload?.data?.[descriptor.field];
      validateRows(rows, request.variables.after, request.variables.limit, descriptor.keyset);
      return rows;
    } catch (error) {
      const failure = options.signal?.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError' || error instanceof TypeError
        ? transient('OBJKT transport interrupted before a complete response', error) : error;
      throw requestStarted && isTransientObjktError(failure) ? recordFailure(failure) : failure;
    } finally {
      notBefore = Math.max(notBefore, now() + spacingMs);
      release();
    }
  }

  return async function maxisObjktFetch(url, options = {}) {
    if (String(url) !== ENDPOINT) return upstream(url, options);
    if (circuitError) throw circuitError;
    const request = JSON.parse(options.body);
    const documentHash = hash(request.query);
    const descriptor = DOCUMENTS.get(documentHash);
    if (!descriptor) throw new Error('Unreviewed OBJKT document: transport equivalence must be checked before use');
    const { limit, after } = request.variables;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid OBJKT logical page size');
    if (descriptor.keyset) cursor(after);
    await initialize();
    const identity = hash(JSON.stringify([ENDPOINT, request]));
    const file = checkpointDir && descriptor.keyset ? path.join(checkpointDir, `${identity}.json`) : null;
    let rows = [];
    let size = Math.min(limit, pageSizes.get(documentHash) || limit);
    let createdAt = now();
    if (file) {
      try {
        const stat = await fs.stat(file);
        if (stat.size > MAX_CHECKPOINT_BYTES) throw new Error('oversized checkpoint');
        const checkpoint = JSON.parse(await fs.readFile(file, 'utf8'));
        if (checkpoint.schema !== 1 || checkpoint.identity !== identity || !Number.isFinite(checkpoint.createdAt)
            || now() - checkpoint.createdAt > CHECKPOINT_TTL_MS || checkpoint.createdAt > now()
            || checkpoint.digest !== hash(JSON.stringify(checkpoint.rows))
            || !Number.isInteger(checkpoint.size) || checkpoint.size < 1 || checkpoint.size > limit) throw new Error('invalid checkpoint');
        validateRows(checkpoint.rows, after, limit, true);
        if (checkpoint.rows.length >= limit) throw new Error('completed checkpoint');
        rows = checkpoint.rows;
        size = Math.min(size, checkpoint.size);
        createdAt = checkpoint.createdAt;
        log(`OBJKT transport resumed ${rows.length} validated rows for the identical request`);
      } catch (error) {
        if (error.code !== 'ENOENT') await fs.rm(file, { force: true });
      }
    }
    let failures = 0;
    while (rows.length < limit) {
      const physicalLimit = descriptor.keyset ? Math.min(size, limit - rows.length) : limit;
      const variables = descriptor.keyset ? { ...request.variables, limit: physicalLimit, after: String(rows.at(-1)?.id ?? after) } : request.variables;
      let page;
      try {
        page = await physical(url, options, { ...request, variables }, descriptor);
      } catch (error) {
        if (circuitError || !isTransientObjktError(error) || options.signal?.aborted || ++failures >= 3) throw circuitError || error;
        healthyPages.set(documentHash, 0);
        if (descriptor.keyset && error.status !== 429) {
          size = Math.min(size, Math.max(Math.min(25, limit), Math.floor(size / 5)));
          pageSizes.set(documentHash, size);
        }
        notBefore = Math.max(notBefore, now() + 1000 * (2 ** (failures - 1)));
        log(`OBJKT transport retry ${failures}/2; physical page ${descriptor.keyset ? size : limit}; ${rows.length} validated rows retained; ${request.query.match(/^query (\w+)/)?.[1]} after ${variables.after ?? 'none'}: ${error.message}`);
        continue;
      }
      rows.push(...page);
      if (page.length < physicalLimit || rows.length === limit || !descriptor.keyset) break;
      if (file) {
        const text = JSON.stringify({ schema: 1, identity, createdAt, size, rows, digest: hash(JSON.stringify(rows)) });
        if (Buffer.byteLength(text) > MAX_CHECKPOINT_BYTES) throw new Error('OBJKT checkpoint exceeds its bounded storage allowance');
        const temporary = `${file}.${randomUUID()}.tmp`;
        await fs.writeFile(temporary, text);
        await fs.rename(temporary, file);
      }
    }
    if (file) await fs.rm(file, { force: true });
    // Probe upward only after four complete logical pages. A transient first
    // seek must not force thousands of tiny requests after the provider heals.
    if (descriptor.keyset && rows.length === limit && size < limit) {
      const healthy = (healthyPages.get(documentHash) || 0) + 1;
      healthyPages.set(documentHash, healthy);
      if (healthy >= 4) {
        const nextSize = Math.min(limit, size * 2);
        pageSizes.set(documentHash, nextSize);
        healthyPages.set(documentHash, 0);
        log(`OBJKT transport recovered four complete pages; next physical page ${nextSize}`);
      }
    }
    return Response.json({ data: { [descriptor.field]: rows } });
  };
}
