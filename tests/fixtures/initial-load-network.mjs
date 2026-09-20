import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// These are synthetic receipts, not a saved production response. Keep source
// shapes compatible with the feature smoke fixtures without importing its runner.
export const FIXTURE_TIME = '2026-09-16T12:00:00.000Z';
export const FIXTURE_WALLET = 'tz1aWXP237BLwNHJcCD4b3DutCevhqq2T1Z9';
const SECOND_WALLET = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const THIRD_WALLET = 'tz1burnburnburnburnburnburnburjAYjjX';
const HEAD_LEVEL = 15_000_000;
const CYCLE = 1_300;
const CYCLE_POSITION = 1_234;
const PROTOCOL = 'PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY';
const DAY = 86_400_000;

export const INITIAL_LOAD_EXPECTATIONS = Object.freeze({
  headLevel: HEAD_LEVEL,
  bakerCount: 3,
  priceUsd: 0.74,
  walletAddress: FIXTURE_WALLET,
  walletAlias: 'Fixture Baker',
  walletBalanceXtz: 1_500_000,
  cycle: CYCLE,
  totalSupplyXtz: 1_050_000_000,
  totalStakedXtz: 290_000_000
});

const require = createRequire(import.meta.url);
const libraryUrls = new Set([
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
]);
// Resolve from the repository rather than a caller's working directory. The
// resolver reads these only if the measured page actually requests a library.
function response(body, { status = 200, contentType = 'application/json', classification = 'matched' } = {}) {
  return {
    status,
    contentType,
    body: contentType === 'application/json' ? JSON.stringify(body) : body,
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'x-initial-load-fixture': classification
    }
  };
}

function unavailable(url) {
  return response({ error: 'Source explicitly unavailable in the startup fixture', url }, { status: 503, classification: 'unavailable' });
}

/**
 * Stateless external-request resolver. Unknown requests fail closed; callers
 * should reject the measurement when x-initial-load-fixture is "unexpected".
 * Local application assets are deliberately outside this resolver's scope.
 */
export function createInitialLoadFixtureResponder({ epoch = FIXTURE_TIME, savedWallet = false } = {}) {
  const now = typeof epoch === 'number' ? epoch : Date.parse(epoch);
  if (!Number.isFinite(now)) throw new TypeError('Initial-load fixture epoch must be a timestamp');
  const iso = (offset = 0) => new Date(now + offset).toISOString();
  const baker = (address, alias, index) => ({
    address, alias, type: 'delegate', active: true,
    balance: index === 0 ? 1_500_000_000_000 : 600_000_000_000,
    stakedBalance: 700_000_000_000 - index * 100_000_000_000,
    stakingBalance: 1_200_000_000_000 - index * 100_000_000_000,
    bakingPower: 950_000_000_000 - index * 100_000_000_000,
    externalStakedBalance: 250_000_000_000,
    externalDelegatedBalance: 180_000_000_000,
    numDelegators: 42, stakersCount: 12,
    limitOfStakingOverBaking: 1_000_000, edgeOfBakingOverStaking: 100_000_000,
    consensusAddress: index === 0 ? `tz4${'A'.repeat(33)}` : null,
    firstActivity: 458753, firstActivityTime: '2019-05-30T00:00:00Z',
    activationLevel: 458753, activationTime: '2019-05-30T00:00:00Z',
    software: { version: 'v25.2', date: '2026-09-01T00:00:00Z' }, softwareUpdateTime: iso(-3 * DAY)
  });
  const bakers = [baker(FIXTURE_WALLET, 'Fixture Baker', 0), baker(SECOND_WALLET, 'Second Fixture Baker', 1), baker(THIRD_WALLET, 'Third Fixture Baker', 2)];
  const statistics = {
    totalSupply: 1_050_000_000_000_000, totalFrozen: 290_000_000_000_000,
    totalOwnStaked: 190_000_000_000_000, totalExternalStaked: 100_000_000_000_000,
    totalOwnDelegated: 80_000_000_000_000, totalExternalDelegated: 170_000_000_000_000,
    totalBakingPower: 500_000_000_000_000, totalDelegators: 52_000, totalStakers: 12_000,
    totalBurned: 600_000_000_000, burnedSupply: 600_000_000_000, totalBootstrapped: 1_050_000_000_000_000
  };
  const constants = {
    blocks_per_cycle: 10_800, minimal_block_delay: '6',
    minimal_participation_ratio: { numerator: 2, denominator: 3 },
    dal_parametric: { incentives_enable: true, minimal_participation_ratio: { numerator: '16', denominator: '25' } },
    hard_gas_limit_per_block: '1040000', consensus_committee_size: 7000,
    edge_of_staking_over_delegation: 3, limit_of_delegation_over_baking: 9,
    liquidity_baking_subsidy: '2500000'
  };
  const levelInfo = level => ({
    level,
    cycle: CYCLE + Math.floor((CYCLE_POSITION + level - HEAD_LEVEL) / 10_800),
    cycle_position: ((CYCLE_POSITION + level - HEAD_LEVEL) % 10_800 + 10_800) % 10_800
  });
  const block = (level = HEAD_LEVEL) => ({
    level, cycle: levelInfo(level).cycle, hash: `BFixture${level}`, proto: 25, protocol: PROTOCOL,
    timestamp: iso(-1_000 - (HEAD_LEVEL - level) * 6_000),
    producer: { address: FIXTURE_WALLET, alias: 'Fixture Baker' },
    proposer: { address: FIXTURE_WALLET, alias: 'Fixture Baker' },
    baker: { address: FIXTURE_WALLET, alias: 'Fixture Baker' },
    attestationPower: 7000, attestationCommittee: 7000, validations: 7000,
    payloadRound: 0, blockRound: 0, round: 0, transactions: 0,
    lbToggle: false, lbToggleEma: 1_030_000_000
  });
  const period = {
    index: 174, kind: 'testing', status: 'active', epoch: 91,
    firstLevel: HEAD_LEVEL - 1000, lastLevel: HEAD_LEVEL + 9800,
    startTime: iso(-6_000_000), endTime: iso(58_800_000), totalVotingPower: 12000
  };
  const history = Array.from({ length: 31 }, (_, index) => ({
    timestamp: iso(-(30 - index) * DAY), tz4_percentage: 30 + index / 10,
    staking_ratio: 27 + index / 100, delegated_ratio: 24, total_bakers: 220 + index,
    tz4_power_pct: 35, tz4_power_active: 175_000_000, tz4_power_total: 500_000_000,
    current_issuance_rate: 4.5, protocol_issuance_rate: 4.5, lb_issuance_rate: 0,
    lb_ema: 1_030_000_000, lb_ema_pct: 51.5, lb_subsidy_disabled: true,
    total_supply: 1_050_000_000 + index, total_staked: 290_000_000, total_delegated: 250_000_000,
    total_baking_power: 500_000_000, staking_apy_stake: 8, staking_apy_delegate: 2.6,
    total_burned: 600_000, tx_volume_24h: 120_000, contract_calls_24h: 9_000,
    funded_accounts: 520_000, new_accounts_24h: 800, smart_contracts: 95_000,
    tokens: 140_000, rollups: 18, active_contracts_24h: 1200
  }));
  const ledgerRows = new Map([
    ['tezos_history', history],
    ['market_history', history.map(({ timestamp }, index) => ({
      timestamp, source: 'coingecko', price_usd: 0.71 + index / 1000,
      price_eur: 0.66 + index / 1000, price_btc: 0.0000067 + index / 100_000_000,
      price_sats: 670 + index, market_cap_usd: 750_000_000 + index * 1_000_000,
      volume_24h_usd: 15_000_000 + index * 100_000, change_24h_pct: -0.5 + index / 10
    }))],
    ['network_health_history', history.map(({ timestamp }, index) => ({
      timestamp, head_level: HEAD_LEVEL - (30 - index) * 14_400,
      head_timestamp: new Date(Date.parse(timestamp) - 1000).toISOString(),
      sample_blocks: 16, health_score: 100, total_attestation_power: 112_000,
      total_committee_power: 112_000, missing_attestation_power: 0,
      avg_block_seconds: 6, max_block_seconds: 6, on_target_blocks: 16,
      round_zero_pct: 100, max_round: 0, missed_blocks: 0,
      missed_attestation_slots: 0, missed_attestation_rights: 0
    }))],
    ['tezosx_history', history.map(({ timestamp }, index) => ({
      timestamp, tvl_usd: 16_000_000 + index * 100_000,
      tezos_l1_tvl_usd: 22_000_000 + index * 100_000,
      tvl_share_pct: (16_000_000 + index * 100_000) / (38_000_000 + index * 200_000) * 100,
      transactions_24h: 300_000 + index * 1000, total_transactions: 80_000_000 + index * 310_000,
      total_addresses: 1_500_000 + index * 1000, active_addresses: 12_000 + index * 100,
      gas_gwei: 1.5, average_block_time_ms: 680,
      explorer_head: 45_000_000 + index * 127_058, rpc_head: 45_000_010 + index * 127_058,
      top_protocol_tvl_usd: 9_000_000 + index * 10_000
    }))],
    ['governance_period_history', history.map(({ timestamp }, index) => {
      const duration = Date.parse(period.endTime) - Date.parse(period.startTime);
      const offset = Math.floor((Date.parse(timestamp) - Date.parse(period.startTime)) / duration);
      const kinds = ['proposal', 'exploration', 'testing', 'promotion', 'adoption'];
      const kind = kinds[((2 + offset) % kinds.length + kinds.length) % kinds.length];
      const ballot = ['exploration', 'promotion'].includes(kind);
      return {
        timestamp, head_level: HEAD_LEVEL - (30 - index) * 14_400,
        epoch: period.epoch + Math.floor((2 + offset) / kinds.length),
        period_index: period.index + offset, period_kind: kind,
        period_status: ballot ? 'voting' : 'quiet', proposal: null,
        participation_pct: ballot ? 0 : null, quorum_pct: ballot ? 45 : null,
        supermajority_pct: null, yay_power: 0, nay_power: 0, pass_power: 0,
        voting_power_voted: 0, voters_voted: 0, voters_total: 3,
        period_start: new Date(Date.parse(period.startTime) + offset * duration).toISOString(),
        period_end: new Date(Date.parse(period.endTime) + offset * duration).toISOString()
      };
    })]
  ]);

  return ({ url, method = 'GET', postData = '' }) => {
    const target = new URL(url);
    const { hostname: host, pathname: route, searchParams: params } = target;
    const unexpected = () => response({ error: 'Unmapped initial-load request', method, url }, { status: 501, classification: 'unexpected' });
    if (!['GET', 'POST'].includes(method)) return unexpected();
    if (method === 'POST' && !((host === 'api.tezos.domains' && route === '/graphql') || (host === 'data.objkt.com' && route === '/v3/graphql'))) return unexpected();
    if (libraryUrls.has(target.href)) {
      const packageName = target.pathname.includes('chartjs-adapter') ? 'chartjs-adapter-date-fns' : target.pathname.includes('html2canvas') ? 'html2canvas' : 'chart.js';
      const filename = packageName === 'chart.js' ? 'chart.umd.js' : packageName === 'html2canvas' ? 'html2canvas.min.js' : 'chartjs-adapter-date-fns.bundle.min.js';
      const packageEntry = pathToFileURL(require.resolve(packageName));
      const installed = JSON.parse(readFileSync(new URL('../package.json', packageEntry), 'utf8'));
      const requestedVersion = target.pathname.match(/@([^/]+)\//)?.[1];
      if (installed.version !== requestedVersion) throw new Error(`Startup fixture needs ${packageName}@${requestedVersion}; installed ${installed.version}`);
      return response(readFileSync(new URL(`./${filename}`, packageEntry)), { contentType: 'application/javascript' });
    }
    // Deterministic measurements use system fallback fonts; no font-network or
    // analytics work is allowed to escape. The runner reports this limitation.
    if (host === 'fonts.googleapis.com' && route === '/css2') return response('/* Fixed benchmark: system fallback fonts. */', { contentType: 'text/css' });
    if (host === 'gc.zgo.at' && route === '/count.js') return response('/* Analytics disabled in startup measurement. */', { contentType: 'application/javascript' });
    if (host === 'api.github.com' && route === '/repos/Primate411/tezos.systems/commits/main') return response({ sha: 'cafebabecafebabecafebabecafebabecafebabe', commit: { committer: { date: iso() } } });
    if (host === 'api.coingecko.com') {
      if (route === '/api/v3/simple/price') return response({ tezos: { usd: 0.74, eur: 0.69, btc: 0.000007, usd_24h_change: 2.5, usd_market_cap: 780_000_000, usd_24h_vol: 18_000_000 } });
      if (route === '/api/v3/coins/markets') return response([{ id: 'tezos', current_price: 0.74, market_cap: 780_000_000, total_volume: 18_000_000, price_change_percentage_24h_in_currency: 2.5, price_change_percentage_7d_in_currency: -4.2, price_change_percentage_30d_in_currency: 9.8 }]);
      if (route === '/api/v3/coins/tezos') return response({ market_data: { price_change_percentage_7d: -4.2 } });
    }
    if (host === 'iijpfczftroespicmufb.supabase.co' && route.startsWith('/rest/v1/')) {
      const table = route.slice('/rest/v1/'.length);
      if (!ledgerRows.has(table)) return unexpected();
      const start = params.get('timestamp')?.replace(/^gte\./, '');
      let rows = ledgerRows.get(table).filter(row => !start || Date.parse(row.timestamp) >= Date.parse(start));
      if (params.get('order')?.includes('desc')) rows = rows.toReversed();
      if (params.has('offset')) rows = rows.slice(Number(params.get('offset')));
      if (params.has('limit')) rows = rows.slice(0, Number(params.get('limit')));
      const select = params.get('select');
      if (select && select !== '*') {
        const keys = select.split(',');
        if (keys.some(key => !Object.hasOwn(ledgerRows.get(table)[0], key))) return unexpected();
        rows = rows.map(row => Object.fromEntries(keys.map(key => [key, row[key]])));
      }
      return response(rows);
    }
    if (['eu.rpc.tez.capital', 'us.rpc.tez.capital', 'tezos-mainnet.octez.io', 'octez-mainnet-archive.octez.io', 'rpc.tzkt.io'].includes(host)) {
      if (route.endsWith('/context/constants')) return response(constants);
      if (route.endsWith('/context/issuance/current_yearly_rate')) return response('4.5', { contentType: 'text/plain' });
      if (route.endsWith('/context/total_supply')) return response('1050000000000000', { contentType: 'text/plain' });
      if (route.endsWith('/context/total_frozen_stake')) return response('290000000000000', { contentType: 'text/plain' });
      if (/\/blocks\/(?:head|\d+)\/header$/.test(route)) return response(block(Number(route.match(/\/blocks\/(\d+)\/header$/)?.[1]) || HEAD_LEVEL));
      if (/\/blocks\/(?:head|\d+)\/metadata$/.test(route)) return response({ level_info: levelInfo(Number(route.match(/\/blocks\/(\d+)\/metadata$/)?.[1]) || HEAD_LEVEL) });
      if (route.endsWith('/helpers/current_level')) return response({ level: HEAD_LEVEL, cycle: CYCLE, cycle_position: CYCLE_POSITION });
      if (/\/operations\/[0-3]$/.test(route)) return response([]);
      if (route.endsWith('/context/delegates')) return response(bakers.map(row => row.address));
      if (route.endsWith('/baking_power_distribution_for_current_cycle')) return response(['300', bakers.map((row, index) => [{ delegate: row.address, consensus_pkh: row.consensusAddress || row.address }, String(110 - index * 10)])]);
      if (route.endsWith('/dal_participation')) return response({ expected_assigned_shards_per_slot: 214, delegate_attested_dal_slots: 14, delegate_attestable_dal_slots: 14, expected_dal_rewards: '277986', sufficient_dal_participation: true, denounced: false });
      if (route.endsWith('/participation')) return response({ expected_cycle_activity: 100, minimal_cycle_activity: 67, missed_slots: 0, missed_levels: 0, remaining_allowed_missed_slots: 33, expected_attesting_rewards: '10000000' });
    }
    if (host === 'api.tzkt.io' && route.startsWith('/v1/')) {
      if (route === '/v1/head') return response(block());
      if (route === '/v1/statistics/current') return response(params.get('select') === 'totalBakingPower' ? statistics.totalBakingPower : statistics);
      if (route === '/v1/statistics/cyclic') return response(Array.from({ length: 8 }, (_, i) => ({ cycle: CYCLE - i, level: HEAD_LEVEL - CYCLE_POSITION - i * 10_800, timestamp: iso(-CYCLE_POSITION * 6000 - i * 64_800_000) })));
      if (route === '/v1/delegates/count') return response(3);
      if (route === '/v1/delegates') {
        if (params.get('active') === 'false' || params.has('sort.desc') && params.get('sort.desc') === 'deactivationLevel') return response([]);
        return response(bakers.slice(Number(params.get('offset')) || 0, (Number(params.get('offset')) || 0) + (Number(params.get('limit')) || 3)));
      }
      const account = route.match(/^\/v1\/(accounts|delegates)\/([^/]+)$/);
      if (account) {
        const row = bakers.find(item => item.address === account[2]);
        if (!row || !savedWallet && account[1] === 'accounts') return response({ error: 'Account not in fixture profile' }, { status: 404 });
        return response({ ...row, delegate: { address: row.address, alias: row.alias, active: true } });
      }
      if (/\/accounts\/[^/]+\/balance_history\/\d+$/.test(route)) return response(1_400_000_000_000);
      if (/\/accounts\/[^/]+\/balance_history$/.test(route)) return response(history.slice(-3).map((row, index) => ({ timestamp: row.timestamp, level: HEAD_LEVEL - (2 - index) * 14_400, balance: 1_400_000_000_000 + index * 50_000_000_000 })));
      if (/\/accounts\/[^/]+\/operations$/.test(route)) return response([]);
      if (route === '/v1/accounts/count') return response(params.has('firstActivity.ge') || params.has('firstActivityTime.gt') ? 800 : 520_000);
      if (route === '/v1/contracts/count') return response(params.has('lastActivity.ge') ? 1200 : 95_000);
      if (route === '/v1/tokens/count') return response(140_000);
      if (route === '/v1/smart_rollups/count') return response(18);
      if (/^\/v1\/blocks\/[^/]+\/level$/.test(route)) return response(HEAD_LEVEL - 14_400);
      if (/^\/v1\/blocks\/\d+$/.test(route)) return response(block(Number(route.split('/').pop())));
      if (route === '/v1/blocks') {
        if (params.has('level.in')) return response(params.get('level.in').split(',').map(Number).map(level => block(level)));
        const first = Number(params.get('level.le')) || Number(params.get('level')) || HEAD_LEVEL;
        return response(Array.from({ length: Math.min(Number(params.get('limit')) || 4, 20) }, (_, i) => block(first - i)));
      }
      if (route === '/v1/protocols/current') return response({ code: 25, hash: PROTOCOL, version: 25, firstLevel: 13_857_889 });
      if (route === '/v1/protocols') return response([{ code: 25, hash: PROTOCOL, version: 25, firstLevel: 13_857_889, extras: { alias: 'Ushuaia' } }]);
      if (route === '/v1/voting/periods/current') return response(period);
      if (/^\/v1\/voting\/periods\/current\/voters\/[^/]+$/.test(route)) return response({ delegate: bakers[0], votingPower: 4000, status: 'none' });
      if (/^\/v1\/voting\/periods\/[^/]+\/voters$/.test(route)) return response([]);
      if (route === '/v1/voting/periods') return response([period]);
      if (/^\/v1\/voting\/epochs\/\d+$/.test(route)) return response({ index: 91, status: 'voting', proposals: [], periods: [period] });
      if (route === '/v1/voting/proposals') return response([]);
      if (route === '/v1/rights/count') return response(0);
      if (route === '/v1/rights') return response(params.get('status') === 'missed' ? [] : [{ level: Number(params.get('level')) || HEAD_LEVEL + 1, cycle: CYCLE, round: 0, timestamp: iso(5000), type: params.get('type') || 'baking', status: 'future', slots: 1, baker: { address: SECOND_WALLET, alias: 'Second Fixture Baker' } }]);
      if (route === '/v1/operations/transactions/count') return response(params.has('entrypoint.null') ? 9000 : params.has('timestamp.gt') || params.has('timestamp.ge') ? 120_000 : 100_000_000);
      if (route === '/v1/tokens/transfers/count') return response(2400);
      if (route === '/v1/tokens/transfers') return response([]);
      if (/^\/v1\/operations\/(transactions|delegations|staking|ballots|proposals|update_consensus_key|originations|endorsements|preendorsements|attestations)$/.test(route)) return response([]);
      if (/^\/v1\/rewards\/(bakers|delegators|stakers)\/[^/]+$/.test(route)) return response([{ cycle: CYCLE - 1, blockRewardsStakedOwn: 6_000_000, attestationRewardsStakedOwn: 3_000_000, dalAttestationRewardsStakedOwn: 0, blockFees: 100_000 }]);
      if (['/v1/accounts', '/v1/tokens/balances', '/v1/smart_rollups'].includes(route)) return response([]);
    }
    if (host === 'api.tezos.domains' && route === '/graphql' && method === 'POST') {
      let query;
      try { query = JSON.parse(postData); } catch { return unexpected(); }
      if (query.query?.includes('ReverseLookupBatch')) return response({ data: Object.fromEntries(Object.keys(query.variables || {}).filter(key => /^address\d+$/.test(key)).map(key => [`record${key.slice(7)}`, null])) });
      if (query.query?.includes('reverseRecord')) return response({ data: { reverseRecord: null, domains: { items: [] } } });
      return unexpected();
    }
    if (host === 'data.objkt.com' && route === '/v3/graphql' && method === 'POST') {
      let query;
      try { query = JSON.parse(postData).query || ''; } catch { return unexpected(); }
      if (query.includes('LivePulseObjktSales')) return response({ data: { recent: [{ id: 3 }, { id: 2 }, { id: 1 }], top: [{ id: 3, timestamp: iso(-60_000), price_xtz: 2_500_000, amount: '1', ophash: 'opFixtureSale', token: { name: 'Fixture Artwork', fa_contract: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton', token_id: '1' } }] } });
      if (query.includes('ObjktProfile')) return response({ data: { holder: [{ address: FIXTURE_WALLET, alias: 'Fixture Baker', held_tokens: [], created_tokens: [], fa2s_created: [], listings_sold: [], listings_bought: [], sales_stats: [] }] } });
      if (query.includes('MyTezosCollection')) return response({ data: { holder: [], token_holder: [], token_creator: [] } });
      return unexpected();
    }
    // These optional corroborating sources are outside the populated startup
    // receipt. Their unavailable state is explicit, never an empty success.
    if (host === 'teztale-server-mainnet-ro-prd.octez.tech' && /^\/(?:head|\d+(?:-\d+)?)\.json$/.test(route)) return unavailable(url);
    return unexpected();
  };
}
