-- Expand the historical capture contract for tezos.systems.
--
-- Apply from the Supabase SQL editor or with a database owner connection.
-- The browser anon key should have SELECT only. GitHub Actions should write with
-- a service-role secret in SUPABASE_KEY.

alter table public.tezos_history
  add column if not exists new_accounts_24h bigint,
  add column if not exists active_contracts_24h bigint,
  add column if not exists total_staked numeric,
  add column if not exists total_delegated numeric,
  add column if not exists total_baking_power numeric,
  add column if not exists staking_apy_stake numeric,
  add column if not exists staking_apy_delegate numeric,
  add column if not exists protocol_issuance_rate numeric,
  add column if not exists lb_issuance_rate numeric,
  add column if not exists lb_ema numeric,
  add column if not exists lb_ema_pct numeric,
  add column if not exists lb_subsidy_disabled boolean,
  add column if not exists tz4_power_pct numeric,
  add column if not exists tz4_power_active numeric,
  add column if not exists tz4_power_total numeric;

create index if not exists tezos_history_timestamp_idx
  on public.tezos_history (timestamp);

create table if not exists public.market_history (
  id bigint generated always as identity primary key,
  timestamp timestamptz not null default now(),
  source text not null default 'coingecko',
  price_usd numeric,
  price_eur numeric,
  price_btc numeric,
  price_sats numeric,
  market_cap_usd numeric,
  volume_24h_usd numeric,
  change_24h_pct numeric
);

create index if not exists market_history_timestamp_idx
  on public.market_history (timestamp);

create table if not exists public.network_health_history (
  id bigint generated always as identity primary key,
  timestamp timestamptz not null default now(),
  head_level bigint,
  head_timestamp timestamptz,
  sample_blocks int,
  health_score numeric,
  total_attestation_power numeric,
  total_committee_power numeric,
  missing_attestation_power numeric,
  avg_block_seconds numeric,
  max_block_seconds numeric,
  on_target_blocks int,
  round_zero_pct numeric,
  max_round int,
  missed_blocks int,
  missed_attestation_slots int,
  missed_attestation_rights int
);

create index if not exists network_health_history_timestamp_idx
  on public.network_health_history (timestamp);

create index if not exists network_health_history_head_level_idx
  on public.network_health_history (head_level);

create table if not exists public.governance_period_history (
  id bigint generated always as identity primary key,
  timestamp timestamptz not null default now(),
  head_level bigint,
  epoch int,
  period_index int,
  period_kind text,
  period_status text,
  proposal text,
  participation_pct numeric,
  quorum_pct numeric,
  supermajority_pct numeric,
  yay_power numeric,
  nay_power numeric,
  pass_power numeric,
  voting_power_voted numeric,
  voters_voted int,
  voters_total int,
  period_start timestamptz,
  period_end timestamptz,
  unique (period_index, head_level)
);

create index if not exists governance_period_history_timestamp_idx
  on public.governance_period_history (timestamp);

create index if not exists governance_period_history_period_idx
  on public.governance_period_history (period_index, timestamp);

create table if not exists public.tezosx_history (
  id bigint generated always as identity primary key,
  timestamp timestamptz not null default now(),
  tvl_usd numeric,
  tezos_l1_tvl_usd numeric,
  tvl_share_pct numeric,
  transactions_24h bigint,
  total_transactions bigint,
  total_addresses bigint,
  active_addresses bigint,
  gas_gwei numeric,
  average_block_time_ms numeric,
  explorer_head bigint,
  rpc_head bigint,
  top_protocol_tvl_usd numeric
);

create index if not exists tezosx_history_timestamp_idx
  on public.tezosx_history (timestamp);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tezos_history',
    'market_history',
    'network_health_history',
    'governance_period_history',
    'tezosx_history'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' public read', table_name);
    execute format('create policy %I on public.%I for select to anon using (true)', table_name || ' public read', table_name);
  end loop;
end $$;

do $$
declare
  policy record;
begin
  for policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'tezos_history',
        'market_history',
        'network_health_history',
        'governance_period_history',
        'tezosx_history'
      ])
      and cmd in ('INSERT', 'ALL')
      and (
        'anon' = any (roles)
        or 'authenticated' = any (roles)
        or 'public' = any (roles)
      )
  loop
    execute format('drop policy if exists %I on %I.%I', policy.policyname, policy.schemaname, policy.tablename);
  end loop;
end $$;
