/** Request identity and bounded lifetimes, shared by the API cache and broker. */
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
}

export function requestFingerprint(url, init = {}, scope = {}) {
    if (typeof url !== 'string' && !(url instanceof URL)) return null;
    const headers = [...new Headers(init.headers || {}).entries()].sort(([a], [b]) => a.localeCompare(b));
    let body = init.body;
    if (body == null) body = null;
    else if (body instanceof URLSearchParams) body = ['urlencoded', body.toString()];
    else if (typeof body === 'string') body = ['text', body];
    else if (Array.isArray(body) || Object.getPrototypeOf(body) === Object.prototype) body = ['json', canonical(body)];
    // Streams, blobs and multipart forms do not have a synchronous, repeatable
    // identity. They must never share an unrelated response.
    else return null;
    const options = Object.fromEntries([
        'credentials', 'mode', 'cache', 'redirect', 'referrer', 'referrerPolicy', 'integrity', 'keepalive', 'duplex'
    ].filter(key => init[key] !== undefined).map(key => [key, init[key]]));
    return JSON.stringify([String(init.method || 'GET').toUpperCase(), String(url), headers, body, canonical(options), canonical(scope)]);
}

export function requestTimeoutError(timeoutMs) {
    return new DOMException(`Request timed out after ${timeoutMs}ms.`, 'TimeoutError');
}

/** Even a non-cooperative fetch/body reader cannot keep an owner pending forever. */
export async function withRequestDeadline(operation, { timeoutMs, signal, deferUntilDispatch = false } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('A positive request deadline is required');
    const controller = new AbortController();
    let timer, started = false, rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const onAbort = () => {
        const reason = signal?.reason || new DOMException('Request aborted', 'AbortError');
        controller.abort(reason);
        rejectAbort(reason);
    };
    const expire = (ms) => {
        const reason = requestTimeoutError(ms);
        controller.abort(reason);
        rejectAbort(reason);
    };
    const onDispatch = () => {
        if (started || controller.signal.aborted) return;
        started = true;
        clearTimeout(timer);
        timer = setTimeout(() => expire(timeoutMs), timeoutMs);
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    // Pacing is outside the network deadline, but has its own finite ceiling.
    if (deferUntilDispatch) timer = setTimeout(() => expire(60_000), 60_000);
    else onDispatch();
    try {
        return await Promise.race([
            aborted,
            controller.signal.aborted ? aborted : operation(controller.signal, onDispatch)
        ]);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}
