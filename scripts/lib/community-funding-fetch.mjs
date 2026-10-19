const MAX_BYTES = 4 * 1024 * 1024;
const MAX_RETRY_AFTER_MS = 60_000;
const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

function temporaryNetworkError(error) {
    return ['AbortError', 'TimeoutError'].includes(error?.name)
        || (error instanceof TypeError && ['fetch failed', 'terminated'].includes(error.message))
        || NETWORK_CODES.has(error?.cause?.code);
}

function retryAfterMs(value, now) {
    if (!value) return 0;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - now()) : 0;
}

// Retry only transport outages. Parsing, response budgets and downstream catalog
// validation stay hard failures; no partial response can advance a source clock.
export async function fetchFundingJson(url, {
    request = globalThis.fetch,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = Date.now,
    warn = console.warn
} = {}) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        let retryDelay = 0;
        try {
            const response = await request(url, { signal: AbortSignal.timeout(25_000), redirect: 'error',
                headers: { Accept: 'application/json', 'User-Agent': 'TezosSystems/1.0 (+https://tezos.systems/funding/; primate@tez.capital)' } });
            if (!response.ok) {
                retryDelay = retryAfterMs(response.headers?.get('retry-after'), now);
                await response.body?.cancel().catch(() => {});
                const temporary = response.status === 429 || (response.status >= 500 && response.status <= 599);
                const longCooldown = retryDelay > MAX_RETRY_AFTER_MS;
                throw Object.assign(new Error(`Funding source HTTP ${response.status}: ${url}${longCooldown ? '; Retry-After exceeds the bounded recovery window' : ''}`), {
                    exitCode: temporary && !longCooldown ? 75 : 1
                });
            }
            const reader = response.body.getReader();
            const chunks = [];
            let size = 0;
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    size += value.byteLength;
                    if (size > MAX_BYTES) throw new Error(`Funding source exceeds byte budget: ${url}`);
                    chunks.push(value);
                }
            } finally { await reader.cancel().catch(() => {}); }
            return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch (error) {
            if (temporaryNetworkError(error)) error.exitCode = 75;
            if (error.exitCode !== 75 || attempt === 3) throw error;
            const delay = Math.max(2000 * attempt, retryDelay);
            warn(`Funding source temporary failure: ${url}; retry ${attempt + 1}/3 after ${delay}ms (${error.message})`);
            await sleep(delay);
        }
    }
}
