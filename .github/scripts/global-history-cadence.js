const { isRetryableSupabaseStatus } = require('./supabase-write.js');

const GLOBAL_HISTORY_INTERVAL_MS = 2 * 60 * 60 * 1000;

// Both the primary schedule and the chamber catch-up job hold the same Actions
// concurrency lock before checking this receipt and, if due, writing a new row.
async function globalHistoryCollectionDue({
  supabaseUrl,
  supabaseKey,
  fetchImpl = fetch,
  now = Date.now,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
}) {
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/tezos_history?select=timestamp&order=timestamp.desc&limit=1`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      let response;
      try {
        response = await fetchImpl(endpoint, {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
          signal: AbortSignal.timeout(15000)
        });
      } catch {
        throw Object.assign(new Error('Global history cadence read failed temporarily'), { retriable: true });
      }
      if (!response.ok) {
        throw Object.assign(new Error(`Global history cadence read failed: HTTP ${response.status}`), {
          retriable: isRetryableSupabaseStatus(response.status)
        });
      }
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 1) throw new Error('Global history cadence read returned invalid rows');
      if (rows.length === 0) return { due: true, latest: null };
      const latest = rows[0]?.timestamp;
      const timestamp = typeof latest === 'string' ? Date.parse(latest) : NaN;
      const ageMs = now() - timestamp;
      if (!Number.isFinite(timestamp) || ageMs < 0) throw new Error('Global history cadence read returned an invalid or future timestamp');
      return { due: ageMs >= GLOBAL_HISTORY_INTERVAL_MS, latest };
    } catch (error) {
      if (!error.retriable || attempt === 3) throw error;
      await wait(attempt * 2000);
    }
  }
}

module.exports = { GLOBAL_HISTORY_INTERVAL_MS, globalHistoryCollectionDue };
