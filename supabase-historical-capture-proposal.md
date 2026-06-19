# Proposal: Expand Supabase Historical Capture for the Chambers

**Status:** Draft for review
**Prepared:** 2026-06-18
**Scope:** Read-only evaluation of the live site, all chambers, and the
Supabase capture pipeline. No code changed.
**Audience:** tezos.systems maintainers

---

## Executive summary

The historical layer — a single `tezos_history` table, written every 2 hours —
was built for the **legacy "Network Stats" sparkline cards** and still serves
only those. The site has since pivoted to be **chamber-first**, but *every
chamber recomputes its state live and persists nothing*. The result: our
differentiated surfaces (the ones meant to displace TzKT) have **no memory**,
and several valuable series are computed during collection and then **discarded
before the insert**.

Expanding capture is not polish. It is the prerequisite for the roadmap chambers
(Decentralization / Nakamoto coefficient, Supply / HODL waves, Usage) — each of
those *is* a time series and cannot exist without it.

**Recommendation:** ship Tier 1 (free, already-computed series) immediately,
then add the Tier 2 domain tables (`network_health_history`, `market_history`,
`tezosx_history`, `governance_period_history`).

---

## 1. What we capture today

One table, `tezos_history`, written every 2h by `.github/scripts/collect-data.js`
(`.github/workflows/collect-data.yml`), read by `fetchHistoricalData()` in
`js/core/api.js`, and drawn by `js/features/history.js`.

Columns: `cycle`, `tz4_bakers`, `tz4_percentage`, `total_bakers`,
`staking_ratio`, `delegated_ratio`, `total_supply`, `current_issuance_rate`,
`total_burned`, `tx_volume_24h`, `contract_calls_24h`, `funded_accounts`,
`new_accounts_24h`, `smart_contracts`, `active_contracts_24h`, `tokens`,
`rollups`.

These map ~1:1 to the sparkline cards (`js/features/history.js:576`). That is the
*entire* historical footprint of the site. (`delegated_ratio` is even stored but
never charted.)

---

## 2. Why expand

1. **The chambers are the bet to beat TzKT, and they have zero memory.** Network
   Health, tz4, LB, and L1 Governance all fetch from TzKT/RPC on each open and
   render "now." "How has network health / tz4 power / quorum participation
   trended over 90 days?" is unanswerable — making the chamber no better than the
   explorer it aims to replace. History is the one thing that would make these
   surfaces *more* useful than TzKT.

2. **Tezos X "has" history, but we don't own it.** `js/features/tezlink.js:305`
   borrows TVL / tx / active-address history straight from DefiLlama and
   Blockscout at render time — a retention, availability, and granularity
   dependency on third parties for our flagship L2 chamber. Mirroring to Supabase
   makes it ours.

3. **We already compute series and drop them** — the cheapest possible wins (see
   Tier 1).

4. **The roadmap is blocked on this.** The next chambers — Decentralization
   (Nakamoto coefficient), Supply (HODL waves), Usage (labeled-contract activity)
   — are inherently time series. They do not exist without historical capture.
   Building capture now is the unblock.

---

## 3. Gap analysis, chamber by chamber

| Chamber | Rich live metrics shown | Captured? | Notable orphans |
|---|---|---|---|
| **Network Health** (`js/features/network-health.js`) | health score, avg block seconds, max consensus round, missed blocks / attestation slots / baking rights, network load | None | All of it. No way to trend reliability. |
| **tz4 Adoption** (`js/features/tz4-adoption.js`) | baker-count % **and** power-weighted `activePowerPct`, milestones | Count only | **Power-weighted adoption** (`tz4-adoption.js:181`) — the more meaningful metric — is never stored. |
| **LB Monitor** (`js/features/liquidity-baking.js`) | EMA %, drift, threshold forecast | Boolean only | Collector fetches `lbToggleEma` only to decide on/off (`collect-data.js:92`) and discards the number. No EMA history → forecast can't be validated. |
| **L1 Governance** (`js/features/chamber.js`) | participation %, quorum, supermajority, voter ramp per period | Outcomes only | `governance-votes.json` stores *results*, not the *within-period ramp*. Can't chart "participation by day-of-window." |
| **Tezos X** (`js/features/tezlink.js`) | TVL, TVL share, 24h tx, gas gwei, addresses, protocol TVL | Via 3rd parties | Owned by DefiLlama / Blockscout, not us. |
| **Tezos X Governance** (`js/features/etherlink-governance.js`) | FAST / SLOW / Sequencer track state, proposal timeline | None | Track period outcomes. |
| **ctez EOL** (`js/features/ctez.js`) | oven state (sunsetting) | None | Low priority — winding down. |
| **Price bar / calculator** (`js/features/price.js`, `js/core/api.js:745`) | price USD/EUR/BTC, market cap, volume, 24h change; staking APY (stake + delegate) | None | Price history would let us overlay price on *every* chart. APY is computed in `fetchStakingAPY` and dropped. |

---

## 4. Expansion plan

### Tier 1 — already computed, just persist (do first, ~hours)

Add columns to `tezos_history`; **no new upstream calls**:

- `total_staked` — computed in `collect-data.js:60`, then dropped from the
  insert (only the *ratio* survives).
- `lb_ema` — already fetched at `collect-data.js:95`; store the number, not just
  the boolean.
- `staking_apy_stake`, `staking_apy_delegate` — `fetchStakingAPY` already derives
  these (`js/core/api.js:745`).
- `tz4_power_pct`, `tz4_power_active`, `tz4_power_total` — near-free: the tz4
  delegates select just needs `bakingPower` added (one field on an existing call).

### Tier 2 — new domain tables (the real value)

These do not fit the 2h heartbeat shape, so they get their own tables:

- **`network_health_history`** → `health_score, avg_block_seconds, max_round,
  missed_blocks, missed_attestation_slots, missed_baking_rights`.
- **`governance_period_history`** → keyed by `epoch, period_index, period_kind`,
  plus `proposal, participation_pct, quorum_pct, supermajority_pct,
  voters_voted, voters_total, voting_power_voted`. Snapshot **more often during
  active periods** to capture the ramp, not just the result.
- **`market_history`** → `price_usd, price_btc, market_cap, volume_24h,
  change_24h` (CoinGecko; cheap).
- **`tezosx_history`** → `tvl, tvl_share, tx_24h, gas_gwei, total_addresses,
  active_addresses, top_protocol_tvl` — mirror L2 so we stop depending on
  DefiLlama / Blockscout retention.

### Tier 3 — roadmap enablers (capture before/with the chamber)

Start writing these even before the UI ships, so the chamber launches with real
depth:

- **Decentralization:** `nakamoto_coefficient`, `top10_power_share`, Gini/HHI
  (needs entity grouping).
- **Supply / HODL waves:** balance-band buckets over time.
- **Usage:** labeled-contract activity buckets.

---

## 5. Architecture & integrity notes

- **Cadence is one-size-fits-all and wrong for some series.** 2h is fine for
  supply / staking / accounts; too coarse for block cadence and EMA; governance
  needs denser sampling during live windows. Consider a second lighter job for
  fast-movers rather than forcing everything onto the 2h cron.
- **Drop the "retry with legacy payload" hack** (`collect-data.js:420`). It
  *silently* strips columns when the schema lags the code, so a missed migration
  becomes silent data loss. Replace with real migration discipline (a tracked
  `schema.sql` / migration files in the repo).
- **Verify the write key is `service_role`, not the anon key.** Reads use the
  public anon key (correct). If the collector's `SUPABASE_KEY` is also anon, RLS
  must allow public inserts — meaning anyone with the public key can poison the
  history. Writes should use a service-role secret; anon should be read-only.
- **Plan for read-side weight.** `fetchHistoricalData()` paginates **every row**
  for the range (`js/core/api.js:998`), and `all` starts 2024-01-01. As tables
  widen, add a **daily rollup view** and serve long ranges from it so the browser
  isn't pulling thousands of wide rows. Index every table on `timestamp` (and
  `period_index` for governance).

---

## 6. Recommended sequencing

1. **Tier 1** — one migration + a few lines in the collector. Recovers
   `total_staked`, `lb_ema`, APY, and tz4 power immediately and for free;
   unblocks trend lines on three chambers.
2. **`market_history`** and **`network_health_history`** — highest
   value-per-effort new tables.
3. **`tezosx_history`** — removes the third-party history dependency.
4. **`governance_period_history`** — denser sampling during active windows.
5. **Tier 3** — alongside each roadmap chamber.

---

## Appendix A — Proposed schema (illustrative)

```sql
-- Tier 1: extend the existing table (no new upstream calls)
alter table tezos_history
  add column if not exists total_staked          numeric,
  add column if not exists lb_ema                numeric,
  add column if not exists staking_apy_stake     numeric,
  add column if not exists staking_apy_delegate  numeric,
  add column if not exists tz4_power_pct         numeric,
  add column if not exists tz4_power_active      numeric,
  add column if not exists tz4_power_total       numeric;

-- Tier 2: network health
create table network_health_history (
  id                        bigint generated always as identity primary key,
  timestamp                 timestamptz not null default now(),
  head_level                bigint,
  health_score              numeric,
  avg_block_seconds         numeric,
  max_round                 int,
  missed_blocks             int,
  missed_attestation_slots  int,
  missed_baking_rights      int
);
create index on network_health_history (timestamp);

-- Tier 2: governance period ramp (snapshot more often during active periods)
create table governance_period_history (
  id                 bigint generated always as identity primary key,
  timestamp          timestamptz not null default now(),
  epoch              int,
  period_index       int,
  period_kind        text,
  proposal           text,
  participation_pct  numeric,
  quorum_pct         numeric,
  supermajority_pct  numeric,
  voters_voted       int,
  voters_total       int,
  voting_power_voted numeric,
  unique (period_index, timestamp)
);
create index on governance_period_history (period_index);

-- Tier 2: market
create table market_history (
  id          bigint generated always as identity primary key,
  timestamp   timestamptz not null default now(),
  price_usd   numeric,
  price_btc   numeric,
  market_cap  numeric,
  volume_24h  numeric,
  change_24h  numeric
);
create index on market_history (timestamp);

-- Tier 2: Tezos X (own the L2 history)
create table tezosx_history (
  id                bigint generated always as identity primary key,
  timestamp         timestamptz not null default now(),
  tvl               numeric,
  tvl_share         numeric,
  tx_24h            bigint,
  gas_gwei          numeric,
  total_addresses   bigint,
  active_addresses  bigint,
  top_protocol_tvl  numeric
);
create index on tezosx_history (timestamp);

-- RLS pattern for every new table: public read, service-role write
alter table network_health_history enable row level security;
create policy "public read" on network_health_history
  for select to anon using (true);
-- Inserts run with the service_role key, which bypasses RLS.
-- Repeat the enable + policy for each new table.
```

## Appendix B — File reference map

| Concern | File |
|---|---|
| Collector (writes) | `.github/scripts/collect-data.js` |
| Collector schedule (2h cron) | `.github/workflows/collect-data.yml` |
| Reader / pagination | `js/core/api.js` (`fetchHistoricalData`, ~L958) |
| Staking APY (computed, not stored) | `js/core/api.js` (`fetchStakingAPY`, ~L745) |
| Sparkline rendering + metric map | `js/features/history.js` (~L576) |
| Supabase client config (anon read key) | `js/core/config.js` |
| Network Health chamber | `js/features/network-health.js` |
| tz4 Adoption chamber (power %) | `js/features/tz4-adoption.js` (~L181) |
| LB Monitor chamber (EMA) | `js/features/liquidity-baking.js` |
| L1 Governance chamber | `js/features/chamber.js` |
| Tezos X chamber (3rd-party history) | `js/features/tezlink.js` (~L305) |
| Tezos X Governance chamber | `js/features/etherlink-governance.js` |
| Price bar | `js/features/price.js` |
