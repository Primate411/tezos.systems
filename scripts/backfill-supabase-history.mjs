#!/usr/bin/env node

const TZKT_API = 'https://api.tzkt.io/v1';
const OCTEZ_RPC = 'https://eu.rpc.tez.capital';
const LB_EMA_DISABLE_THRESHOLD = 1000000000;
const LB_EMA_DENOMINATOR = 2000000000;
const REPAIRABLE_COLUMNS = [
  'total_staked',
  'total_delegated',
  'total_baking_power',
  'staking_apy_stake',
  'staking_apy_delegate',
  'protocol_issuance_rate',
  'lb_issuance_rate',
  'lb_ema',
  'lb_ema_pct',
  'lb_subsidy_disabled'
];
const QUERY_COLUMNS = [
  'total_staked',
  'total_delegated',
  'total_baking_power',
  'lb_ema',
  'lb_ema_pct',
  'lb_subsidy_disabled'
];

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundOrNull(value, decimals = 2) {
  const number = numberOrNull(value);
  return number === null ? null : Number(number.toFixed(decimals));
}

function xtzFromMutez(value) {
  const number = numberOrNull(value);
  return number === null ? null : number / 1e6;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function cleanTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function fetchJson(url, options = {}, retries = 4) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...options.headers
        }
      });
      if (!response.ok) {
        const text = await response.text();
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        const error = new Error(`HTTP ${response.status} ${text}`);
        error.retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0;
        throw error;
      }
      if (response.status === 204) return null;
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === retries - 1) break;
      const delay = error.retryAfterMs || 750 * (attempt + 1);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function fetchText(url, options = {}, retries = 4) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        const error = new Error(`HTTP ${response.status} ${text}`);
        error.retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0;
        throw error;
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt === retries - 1) break;
      const delay = error.retryAfterMs || 750 * (attempt + 1);
      await sleep(delay);
    }
  }
  throw lastError;
}

function buildHistoryQuery(baseUrl, limit) {
  const params = new URLSearchParams();
  params.set(
    'select',
    [
      'id',
      'timestamp',
      'total_supply',
      'current_issuance_rate',
      ...REPAIRABLE_COLUMNS
    ].join(',')
  );
  params.set('or', `(${QUERY_COLUMNS.map(column => `${column}.is.null`).join(',')})`);
  params.set('order', 'timestamp.asc');
  params.set('limit', String(limit));

  const start = cleanTimestamp(process.env.BACKFILL_START);
  const end = cleanTimestamp(process.env.BACKFILL_END);
  if (start) params.append('timestamp', `gte.${start}`);
  if (end) params.append('timestamp', `lte.${end}`);

  return `${baseUrl}/rest/v1/tezos_history?${params.toString()}`;
}

async function fetchRows(config) {
  return await fetchJson(buildHistoryQuery(config.supabaseUrl, config.limit), {
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`
    }
  });
}

async function fetchHistoricalStats(timestamp) {
  const fields = [
    'level',
    'timestamp',
    'totalSupply',
    'totalOwnStaked',
    'totalExternalStaked',
    'totalOwnDelegated',
    'totalExternalDelegated',
    'totalBakingPower'
  ].join(',');
  const url = `${TZKT_API}/statistics?timestamp.le=${encodeURIComponent(timestamp)}&sort.desc=level&limit=1&select=${fields}`;
  const rows = await fetchJson(url);
  return Array.isArray(rows) ? rows[0] : null;
}

async function fetchLiquidityBakingState(level) {
  const rows = await fetchJson(`${TZKT_API}/blocks?level=${level}&limit=1&select=level,timestamp,lbToggleEma`);
  const block = Array.isArray(rows) ? rows[0] : null;
  const ema = numberOrNull(block?.lbToggleEma);
  if (ema === null) {
    return { ema: null, emaPct: null, disabled: null, known: false };
  }
  return {
    ema,
    emaPct: (ema / LB_EMA_DENOMINATOR) * 100,
    disabled: ema >= LB_EMA_DISABLE_THRESHOLD,
    known: true
  };
}

async function fetchHistoricalIssuance(level) {
  const [rateText, constants] = await Promise.all([
    fetchText(`${OCTEZ_RPC}/chains/main/blocks/${level}/context/issuance/current_yearly_rate`),
    fetchJson(`${OCTEZ_RPC}/chains/main/blocks/${level}/context/constants`)
  ]);
  return {
    protocolRate: numberOrNull(String(rateText).replace(/"/g, '')),
    constants
  };
}

function calculateStakingApy(protocolRate, stakingData) {
  const totalSupply = Number(stakingData.totalSupply || 0);
  const totalStaked = Number(stakingData.totalStaked || 0);
  const totalDelegated = Number(stakingData.totalDelegated || 0);
  const netIssuance = Number(protocolRate || 0);

  if (!Number.isFinite(netIssuance) || netIssuance <= 0 || totalSupply <= 0 || totalStaked <= 0) {
    return { stakeAPY: null, delegateAPY: null };
  }

  const stakedRatio = totalStaked / totalSupply;
  const delegatedRatio = totalDelegated / totalSupply;
  const edge = 2;
  const effectiveStakeRatio = stakedRatio + delegatedRatio / (1 + edge);

  if (!Number.isFinite(effectiveStakeRatio) || effectiveStakeRatio <= 0) {
    return { stakeAPY: null, delegateAPY: null };
  }

  const stakeAPY = (netIssuance / 100) / effectiveStakeRatio * 100;
  const delegateAPY = stakeAPY / (1 + edge);
  return { stakeAPY, delegateAPY };
}

function buildPatch(row, derived, overwrite) {
  const patch = {};
  const setIfAllowed = (column, value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return;
    if (!overwrite && hasValue(row[column])) return;
    patch[column] = value;
  };

  setIfAllowed('total_staked', roundOrNull(derived.totalStaked));
  setIfAllowed('total_delegated', roundOrNull(derived.totalDelegated));
  setIfAllowed('total_baking_power', roundOrNull(derived.totalBakingPower));
  setIfAllowed('protocol_issuance_rate', roundOrNull(derived.protocolRate, 4));
  setIfAllowed('lb_issuance_rate', roundOrNull(derived.lbRate, 4));
  setIfAllowed('lb_ema', roundOrNull(derived.lbEma, 0));
  setIfAllowed('lb_ema_pct', roundOrNull(derived.lbEmaPct, 2));
  setIfAllowed('lb_subsidy_disabled', derived.lbSubsidyDisabled);
  setIfAllowed('staking_apy_stake', roundOrNull(derived.stakeAPY, 1));
  setIfAllowed('staking_apy_delegate', roundOrNull(derived.delegateAPY, 1));

  return patch;
}

async function deriveRow(row, config) {
  const stats = await fetchHistoricalStats(row.timestamp);
  if (!stats?.level) {
    throw new Error(`No TzKT statistics row at or before ${row.timestamp}`);
  }

  const totalSupply = xtzFromMutez(stats.totalSupply) || numberOrNull(row.total_supply) || 0;
  const totalStaked = (numberOrNull(stats.totalOwnStaked) || 0) / 1e6
    + (numberOrNull(stats.totalExternalStaked) || 0) / 1e6;
  const totalDelegated = (numberOrNull(stats.totalOwnDelegated) || 0) / 1e6
    + (numberOrNull(stats.totalExternalDelegated) || 0) / 1e6;
  const totalBakingPower = xtzFromMutez(stats.totalBakingPower);

  let protocolRate = null;
  let lbRate = null;
  let lbEma = null;
  let lbEmaPct = null;
  let lbSubsidyDisabled = null;

  const lbState = await fetchLiquidityBakingState(stats.level);
  lbEma = lbState.ema;
  lbEmaPct = lbState.emaPct;
  lbSubsidyDisabled = lbState.known ? lbState.disabled : null;

  if (!config.skipIssuance) {
    try {
      const issuance = await fetchHistoricalIssuance(stats.level);
      protocolRate = issuance.protocolRate;
      const lbSubsidyPerMinute = numberOrNull(issuance.constants?.liquidity_baking_subsidy) || 0;
      const minutesPerYear = 365.25 * 24 * 60;
      const lbXTZPerYear = (lbSubsidyPerMinute / 1e6) * minutesPerYear;
      lbRate = lbSubsidyDisabled === false && totalSupply > 0
        ? (lbXTZPerYear / totalSupply) * 100
        : 0;
    } catch (error) {
      console.warn(`issuance unavailable for row ${row.id} level ${stats.level}: ${error.message}`);
    }
  }

  const apyRate = protocolRate ?? numberOrNull(row.protocol_issuance_rate);
  const apy = calculateStakingApy(apyRate, { totalSupply, totalStaked, totalDelegated });

  return {
    level: stats.level,
    totalStaked,
    totalDelegated,
    totalBakingPower,
    protocolRate,
    lbRate,
    lbEma,
    lbEmaPct,
    lbSubsidyDisabled,
    stakeAPY: apy.stakeAPY,
    delegateAPY: apy.delegateAPY
  };
}

async function patchRow(config, rowId, patch) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/tezos_history?id=eq.${rowId}`, {
    method: 'PATCH',
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase patch failed for row ${rowId}: HTTP ${response.status} - ${error}`);
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY are required');
  }

  const config = {
    supabaseUrl,
    supabaseKey,
    limit: Math.min(envInt('BACKFILL_LIMIT', 250), 5000),
    dryRun: envFlag('BACKFILL_DRY_RUN', true),
    overwrite: envFlag('BACKFILL_OVERWRITE', false),
    skipIssuance: envFlag('BACKFILL_SKIP_ISSUANCE', false),
    sleepMs: envInt('BACKFILL_SLEEP_MS', 125)
  };

  console.log('Starting Supabase tezos_history backfill', {
    limit: config.limit,
    dryRun: config.dryRun,
    overwrite: config.overwrite,
    skipIssuance: config.skipIssuance,
    start: cleanTimestamp(process.env.BACKFILL_START),
    end: cleanTimestamp(process.env.BACKFILL_END)
  });

  const rows = await fetchRows(config);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No repairable tezos_history rows found.');
    return;
  }

  let patched = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const derived = await deriveRow(row, config);
      const patch = buildPatch(row, derived, config.overwrite);
      const keys = Object.keys(patch);
      if (keys.length === 0) {
        skipped += 1;
        console.log(`row ${row.id}: nothing to patch`);
      } else if (config.dryRun) {
        patched += 1;
        console.log(`row ${row.id}: dry-run patch from level ${derived.level}`, patch);
      } else {
        await patchRow(config, row.id, patch);
        patched += 1;
        console.log(`row ${row.id}: patched ${keys.join(', ')}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`row ${row.id}: failed - ${error.message}`);
    }

    if (config.sleepMs > 0) await sleep(config.sleepMs);
  }

  console.log(`Backfill complete: ${patched} ${config.dryRun ? 'would be patched' : 'patched'}, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
