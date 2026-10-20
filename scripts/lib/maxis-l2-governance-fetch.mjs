const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

function temporaryNetworkError(error) {
  return ['AbortError', 'TimeoutError'].includes(error?.name)
    || (error instanceof TypeError && ['fetch failed', 'terminated'].includes(error.message))
    || NETWORK_CODES.has(error?.cause?.code);
}

// Keep full-history validation separate from transport recovery. A malformed
// response or incomplete ledger must never qualify for a deferred lane retry.
export async function fetchL2GovernanceJson(url, {
  request = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now,
  warn = console.warn,
  timeoutMs = 30_000
} = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    let delay = 2000 * (2 ** (attempt - 1));
    try {
      const response = await request(url, {
        headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
          const seconds = Number(retryAfter);
          const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now();
          if (Number.isFinite(ms)) delay = Math.max(delay, ms);
        }
        await response.body?.cancel().catch(() => {});
        const temporary = response.status === 429 || (response.status >= 500 && response.status <= 599);
        // Do not let lane recovery shorten a provider's long cooldown.
        const longCooldown = delay > 60_000;
        throw Object.assign(new Error(`${url}: HTTP ${response.status}${longCooldown ? '; Retry-After exceeds the bounded recovery window' : ''}`), {
          exitCode: temporary && !longCooldown ? 75 : 1
        });
      }
      return await response.json();
    } catch (error) {
      if (temporaryNetworkError(error)) error.exitCode = 75;
      if (error.exitCode !== 75 || attempt === 4) throw error;
      warn(`L2 governance source retry ${attempt + 1}/4 after ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }
}
