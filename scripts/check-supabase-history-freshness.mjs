#!/usr/bin/env node
import { readHistoryFreshness } from './lib/history-freshness.mjs';

try {
  const rows = await readHistoryFreshness();
  for (const row of rows) {
    const detail = row.error || `${Math.round(row.ageMs / 60_000)}m old, latest ${row.timestamp}`;
    console[row.ok ? 'log' : 'error'](`${row.ok ? 'ok' : 'fail'} - ${row.table}: ${detail}`);
  }
  if (rows.some(row => !row.ok)) {
    console.error('Supabase history freshness failed');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`fail - ${error.message}`);
  process.exitCode = 1;
}
