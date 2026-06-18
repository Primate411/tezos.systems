#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HISTORY_COLUMNS = [
  'new_accounts_24h',
  'active_contracts_24h',
  'total_staked',
  'total_delegated',
  'total_baking_power',
  'staking_apy_stake',
  'staking_apy_delegate',
  'protocol_issuance_rate',
  'lb_issuance_rate',
  'lb_ema',
  'lb_ema_pct',
  'lb_subsidy_disabled',
  'tz4_power_pct',
  'tz4_power_active',
  'tz4_power_total'
];

const DOMAIN_TABLES = [
  'market_history',
  'network_health_history',
  'governance_period_history',
  'tezosx_history'
];

async function readPublicConfig() {
  const source = await fs.readFile(path.join(ROOT, 'js/core/config.js'), 'utf8');
  const url = process.env.SUPABASE_URL || source.match(/url:\s*'([^']+)'/)?.[1];
  const key = process.env.SUPABASE_ANON_KEY || source.match(/key:\s*'([^']+)'/)?.[1];

  if (!url || !key) {
    throw new Error('Could not find Supabase url/key in js/core/config.js or env');
  }

  return { url, key };
}

async function requestTable({ url, key }, table, select) {
  const endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });
  const body = await response.text();
  return { response, body };
}

function parseMissingColumn(body) {
  try {
    const parsed = JSON.parse(body);
    const match = String(parsed.message || '').match(/column\s+[^.]+\.([a-zA-Z0-9_]+)\s+does not exist/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

async function main() {
  const config = await readPublicConfig();
  const failures = [];

  const history = await requestTable(config, 'tezos_history', HISTORY_COLUMNS.join(','));
  if (!history.response.ok) {
    const missing = parseMissingColumn(history.body);
    failures.push(missing
      ? `tezos_history is missing column ${missing}`
      : `tezos_history check failed: HTTP ${history.response.status} ${history.body}`);
  }

  for (const table of DOMAIN_TABLES) {
    const result = await requestTable(config, table, 'id,timestamp');
    if (!result.response.ok) {
      failures.push(`${table} check failed: HTTP ${result.response.status} ${result.body}`);
    }
  }

  if (failures.length) {
    for (const failure of failures) console.error(`fail - ${failure}`);
    console.error('\nApply supabase/migrations/20260618190000_expand_historical_capture.sql, then rerun npm run check:supabase.');
    process.exit(1);
  }

  console.log(`ok - Supabase historical schema exposes ${HISTORY_COLUMNS.length} expanded tezos_history columns`);
  console.log(`ok - Supabase historical schema exposes ${DOMAIN_TABLES.join(', ')}`);
}

main().catch((error) => {
  console.error(`fail - ${error.message}`);
  process.exit(1);
});
