// Blockscout documents X-RateLimit-Reset as a duration in milliseconds:
// https://github.com/blockscout/blockscout/blob/master/apps/block_scout_web/rate_limits.md
export function blockscoutRetryDelay(headers, now = Date.now()) {
  const retryAfter = headers.get('retry-after');
  const seconds = Number(retryAfter);
  const retryMs = retryAfter && Number.isFinite(seconds)
    ? seconds * 1000 : Math.max(0, Date.parse(retryAfter) - now) || 0;
  const resetMs = Number(headers.get('x-ratelimit-reset'));
  return Math.max(0, retryMs, Number.isFinite(resetMs) ? resetMs : 0);
}

function blockscoutRateLimited(payload) {
  return /too many requests|rate limit|limit reached/i.test(
    `${payload?.error || ''} ${payload?.message || ''} ${typeof payload?.result === 'string' ? payload.result : ''}`
  );
}

export function createBlockscoutClient({
  apiKey = process.env.BLOCKSCOUT_API_KEY || '',
  fetchImpl = fetch,
  now = Date.now,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  warn = console.warn,
  gapMs = 1_200,
  maxCooldownMs = 300_000
} = {}) {
  apiKey = apiKey.trim();
  let gate = Promise.resolve();
  let nextRequestAt = 0;
  let quotaError = null;
  const redact = (value) => {
    let text = String(value?.message || value || 'Unknown source error');
    if (apiKey) {
      for (const secret of [apiKey, encodeURIComponent(apiKey), new URLSearchParams({ apikey: apiKey }).toString().slice(7)]) {
        text = text.replaceAll(secret, '[redacted]');
      }
    }
    return text.replace(/([?&]apikey=)[^&\s]+/gi, '$1[redacted]').replace(/\s+/g, ' ').slice(0, 400);
  };
  const extendCooldown = (ms) => { nextRequestAt = Math.max(nextRequestAt, now() + ms); };
  async function pace() {
    const previous = gate;
    let release;
    gate = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      // Another in-flight response can extend the cooldown while this worker sleeps.
      while (nextRequestAt > now()) {
        if (quotaError) throw quotaError;
        await wait(Math.min(30_000, nextRequestAt - now()));
      }
      if (quotaError) throw quotaError;
      nextRequestAt = now() + gapMs;
    } finally {
      release();
    }
  }
  function observeCooldown(ms) {
    if (ms > maxCooldownMs) {
      quotaError = new Error(`Blockscout quota resets in ${Math.ceil(ms / 60_000)} minutes, beyond the 5-minute retry budget. ${apiKey
        ? 'The configured BLOCKSCOUT_API_KEY has insufficient quota; check its Etherlink access and limits.'
        : 'Public Blockscout access is temporarily rate-limited; retry after the reset.'} Last-good Ecosystem data is retained.`);
      throw quotaError;
    }
    extendCooldown(ms);
  }
  async function requestJson(url, { attempts = 10 } = {}) {
    const request = new URL(url);
    if (request.origin !== 'https://explorer.etherlink.com' || request.username || request.password) throw new Error('Unexpected Blockscout origin');
    if (request.pathname !== '/api' && !/^\/api\/v2\/addresses\/0x[\da-f]{40}\/transactions$/i.test(request.pathname)) throw new Error('Unexpected Blockscout API path');
    // PRO keys use the multichain proxy, not the old per-explorer key route.
    // Preserve every timestamp, direction, and row-limit parameter unchanged.
    // https://docs.blockscout.com/devs/pro-api-responses-and-routes
    request.searchParams.delete('apikey');
    if (apiKey) {
      request.hostname = 'api.blockscout.com';
      request.pathname = `/42793${request.pathname}`;
      request.searchParams.set('apikey', apiKey);
    }
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      await pace();
      let retryMs = 0;
      try {
        const response = await fetchImpl(request.href, {
          signal: AbortSignal.timeout(60_000),
          redirect: 'error',
          headers: { Accept: 'application/json', 'User-Agent': 'tezos.systems ecosystem stats generator' }
        });
        const body = await response.text();
        let payload = null;
        try { payload = JSON.parse(body); } catch { /* Preserve the source error below. */ }
        const limited = response.status === 429 || blockscoutRateLimited(payload);
        if (response.ok && payload && !payload.error && !limited) {
          if (response.headers.get('x-ratelimit-remaining') === '0') {
            // Accept this complete response; prevent the next request from exhausting retries.
            const reset = blockscoutRetryDelay(response.headers, now());
            try { observeCooldown(reset); } catch { /* Next request reports the exhausted quota. */ }
          }
          return payload;
        }
        retryMs = limited ? Math.max(60_000, blockscoutRetryDelay(response.headers, now()))
          : Math.max(0, blockscoutRetryDelay(new Headers({ 'retry-after': response.headers.get('retry-after') || '' }), now()));
        lastError = new Error(`HTTP ${response.status}: ${redact(body)}`);
        if (!limited && ![500, 502, 503, 504].includes(response.status)) throw Object.assign(lastError, { permanent: true });
      } catch (error) {
        if (error.permanent) throw new Error(redact(error));
        lastError = error;
      }
      if (attempt < attempts) {
        const delay = Math.max(retryMs, Math.min(30_000, 1_000 * (2 ** (attempt - 1))));
        observeCooldown(delay);
        warn(`Blockscout request failed; retrying in ${Math.ceil(delay / 1000)}s (${attempt}/${attempts})`);
      }
    }
    throw new Error(`Blockscout request exhausted ${attempts} attempts for ${request.searchParams.get('address') || 'request'}: ${redact(lastError)}`);
  }
  return { requestJson, pace, extendCooldown };
}
