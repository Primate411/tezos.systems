import fs from 'node:fs/promises';
import { HISTORY_FRESHNESS_LIMITS } from '../../js/core/freshness-contracts.mjs';

export async function readHistoryConfig() {
  const source = await fs.readFile(new URL('../../js/core/config.js', import.meta.url), 'utf8');
  const url = process.env.SUPABASE_URL || source.match(/url:\s*'([^']+)'/)?.[1];
  const key = process.env.SUPABASE_ANON_KEY || source.match(/key:\s*'([^']+)'/)?.[1];
  if (!url || !key) throw new Error('Supabase public history configuration missing');
  return { url: url.replace(/\/$/, ''), key };
}

export async function readHistoryFreshness({ config, now = Date.now(), fetch: request = globalThis.fetch } = {}) {
  config ||= await readHistoryConfig();
  return Promise.all(Object.entries(HISTORY_FRESHNESS_LIMITS).map(async ([table, maxAgeMs]) => {
    try {
      const response = await request(`${config.url}/rest/v1/${table}?select=timestamp&order=timestamp.desc&limit=1`, {
        headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = await response.json();
      const timestamp = Array.isArray(rows) ? rows[0]?.timestamp : null;
      const ageMs = now - Date.parse(timestamp);
      if (!Number.isFinite(ageMs) || ageMs < -60_000) throw new Error('No valid current timestamp');
      return { table, timestamp, ageMs, maxAgeMs, ok: ageMs <= maxAgeMs };
    } catch (error) {
      return { table, timestamp: null, ok: false, error: error.message };
    }
  }));
}
