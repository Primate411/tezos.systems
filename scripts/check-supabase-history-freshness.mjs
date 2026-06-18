#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLES = [
  { table: 'tezos_history', label: 'global history', maxAgeMs: 3 * 60 * 60 * 1000 },
  { table: 'market_history', label: 'market history', maxAgeMs: 90 * 60 * 1000 },
  { table: 'network_health_history', label: 'network health history', maxAgeMs: 90 * 60 * 1000 },
  { table: 'tezosx_history', label: 'Tezos X history', maxAgeMs: 90 * 60 * 1000 },
  { table: 'governance_period_history', label: 'governance period history', maxAgeMs: 90 * 60 * 1000 }
];

async function readPublicConfig() {
  const source = await fs.readFile(path.join(ROOT, 'js/core/config.js'), 'utf8');
  const url = process.env.SUPABASE_URL || source.match(/url:\s*'([^']+)'/)?.[1];
  const key = process.env.SUPABASE_ANON_KEY || source.match(/key:\s*'([^']+)'/)?.[1];

  if (!url || !key) {
    throw new Error('Could not find Supabase url/key in js/core/config.js or env');
  }

  return { url: url.replace(/\/$/, ''), key };
}

function formatAge(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';
  const minutes = Math.round(ageMs / 60000);
  if (minutes < 90) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

async function fetchLatest({ url, key }, table) {
  const response = await fetch(`${url}/rest/v1/${table}?select=timestamp&order=timestamp.desc&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${table} freshness fetch failed: HTTP ${response.status} ${body}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function main() {
  const config = await readPublicConfig();
  const now = Date.now();
  const failures = [];

  for (const item of TABLES) {
    const latest = await fetchLatest(config, item.table);
    const timestamp = latest?.timestamp ? new Date(latest.timestamp) : null;
    const ageMs = timestamp && !Number.isNaN(timestamp.getTime()) ? now - timestamp.getTime() : null;
    const age = formatAge(ageMs);

    if (ageMs === null) {
      failures.push(`${item.label} has no readable timestamp`);
      console.error(`fail - ${item.label}: no readable timestamp`);
      continue;
    }

    if (ageMs > item.maxAgeMs) {
      failures.push(`${item.label} is stale (${age})`);
      console.error(`fail - ${item.label}: ${age} old, latest ${timestamp.toISOString()}`);
    } else {
      console.log(`ok - ${item.label}: ${age} old, latest ${timestamp.toISOString()}`);
    }
  }

  if (failures.length) {
    console.error(`\nSupabase history freshness failed: ${failures.join('; ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`fail - ${error.message}`);
  process.exit(1);
});
