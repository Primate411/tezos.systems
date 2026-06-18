// Chamber history collector for GitHub Actions
// Writes smaller domain snapshots that do not fit the 2-hour tezos_history row.

const TZKT_API = 'https://api.tzkt.io/v1';
const OCTEZ_RPC = 'https://eu.rpc.tez.capital';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd,eur,btc&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true';
const DEFILLAMA_API = 'https://api.llama.fi';
const ETHERLINK_EXPLORER = 'https://explorer.etherlink.com/api/v2';
const ETHERLINK_RPC = 'https://node.mainnet.etherlink.com';
const ETHERLINK_CHAIN_NAME = 'Etherlink';
const POWER_PER_BLOCK = 7000;

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...options.headers
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

async function rpcCall(method, params = []) {
  const response = await fetch(ETHERLINK_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!response.ok) throw new Error(`Etherlink RPC HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'Etherlink RPC error');
  return payload.result;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundOrNull(value, decimals = 2) {
  const number = numberOrNull(value);
  return number === null ? null : Number(number.toFixed(decimals));
}

function hexToNumber(value) {
  if (typeof value !== 'string') return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBlock(block) {
  const committee = numberOrNull(block.attestationCommittee) || POWER_PER_BLOCK;
  const rawPower = numberOrNull(block.attestationPower ?? block.validations) || 0;
  const power = Math.max(0, Math.min(rawPower, committee));
  const payloadRound = numberOrNull(block.payloadRound) || 0;
  const blockRound = numberOrNull(block.blockRound);
  return {
    level: Number(block.level) || 0,
    timestamp: block.timestamp || null,
    power,
    committee,
    missedPower: Math.max(0, committee - power),
    intervalSeconds: null,
    blockRound: blockRound === null ? payloadRound : blockRound
  };
}

function addBlockIntervals(blocks) {
  return blocks.map((block, index) => {
    const older = blocks[index + 1];
    if (!block.timestamp || !older?.timestamp) return block;
    const diff = (new Date(block.timestamp).getTime() - new Date(older.timestamp).getTime()) / 1000;
    return {
      ...block,
      intervalSeconds: Number.isFinite(diff) && diff >= 0 ? diff : null
    };
  });
}

async function collectMarketHistory() {
  const data = await fetchWithRetry(COINGECKO_URL);
  const tezos = data.tezos || {};
  const btc = numberOrNull(tezos.btc);
  return {
    timestamp: new Date().toISOString(),
    source: 'coingecko',
    price_usd: roundOrNull(tezos.usd, 6),
    price_eur: roundOrNull(tezos.eur, 6),
    price_btc: btc,
    price_sats: btc === null ? null : Math.round(btc * 100000000),
    market_cap_usd: roundOrNull(tezos.usd_market_cap),
    volume_24h_usd: roundOrNull(tezos.usd_24h_vol),
    change_24h_pct: roundOrNull(tezos.usd_24h_change, 4)
  };
}

async function fetchMissedRights(type, startLevel, endLevel, limit) {
  if (!startLevel || !endLevel || startLevel > endLevel) return [];
  const fields = type === 'attestation'
    ? 'level,timestamp,slots,baker,status,type'
    : 'level,timestamp,round,baker,status,type';
  const url = `${TZKT_API}/rights?sort.desc=level&limit=${limit}&status=missed&type=${type}&level.ge=${startLevel}&level.le=${endLevel}&select=${fields}`;
  const rows = await fetchWithRetry(url);
  return Array.isArray(rows) ? rows : [];
}

async function collectNetworkHealthHistory() {
  const fields = 'level,timestamp,attestationPower,attestationCommittee,payloadRound,blockRound';
  const blocksRaw = await fetchWithRetry(`${TZKT_API}/blocks?sort.desc=level&limit=16&select=${fields}`);
  const blocks = addBlockIntervals((Array.isArray(blocksRaw) ? blocksRaw : []).map(normalizeBlock));
  const head = blocks[0] || {};
  const oldest = blocks[blocks.length - 1] || head;

  const totalAttestationPower = blocks.reduce((sum, block) => sum + block.power, 0);
  const totalCommitteePower = blocks.reduce((sum, block) => sum + block.committee, 0);
  const intervals = blocks.map(block => block.intervalSeconds).filter(Number.isFinite);
  const roundZero = blocks.filter(block => block.blockRound === 0).length;
  const maxRound = blocks.reduce((max, block) => Math.max(max, block.blockRound || 0), 0);
  const missedBlockStart = Math.max(1, Number(head.level || 0) - 120);

  const [missedAttestations, missedBlocks] = await Promise.all([
    fetchMissedRights('attestation', Number(oldest.level || 0), Number(head.level || 0), 90),
    fetchMissedRights('baking', missedBlockStart, Number(head.level || 0), 30)
  ]);

  return {
    timestamp: new Date().toISOString(),
    head_level: head.level || null,
    head_timestamp: head.timestamp || null,
    sample_blocks: blocks.length,
    health_score: totalCommitteePower > 0 ? roundOrNull((totalAttestationPower / totalCommitteePower) * 100, 4) : null,
    total_attestation_power: roundOrNull(totalAttestationPower, 0),
    total_committee_power: roundOrNull(totalCommitteePower, 0),
    missing_attestation_power: roundOrNull(Math.max(0, totalCommitteePower - totalAttestationPower), 0),
    avg_block_seconds: intervals.length ? roundOrNull(intervals.reduce((sum, value) => sum + value, 0) / intervals.length, 2) : null,
    max_block_seconds: intervals.length ? roundOrNull(Math.max(...intervals), 2) : null,
    on_target_blocks: intervals.filter(value => value <= 8).length,
    round_zero_pct: blocks.length ? roundOrNull((roundZero / blocks.length) * 100, 2) : null,
    max_round: maxRound,
    missed_blocks: missedBlocks.length,
    missed_attestation_slots: missedAttestations.reduce((sum, right) => sum + (Number(right.slots) || 0), 0),
    missed_attestation_rights: missedAttestations.length
  };
}

function normalizeChartRows(payload, keys) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.chart_data)
      ? payload.chart_data
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
  return rows
    .map(row => {
      const key = keys.find(candidate => row[candidate] !== undefined);
      return {
        date: row.date || row.timestamp || row.day,
        value: key ? numberOrNull(row[key]) : null
      };
    })
    .filter(row => row.date && row.value !== null);
}

async function collectTezosXHistory() {
  const [chainsResult, protocolsResult, statsResult, txChartResult, activeAccountsResult, rpcHeadResult, rpcGasResult] = await Promise.allSettled([
    fetchWithRetry(`${DEFILLAMA_API}/v2/chains`),
    fetchWithRetry(`${DEFILLAMA_API}/protocols`),
    fetchWithRetry(`${ETHERLINK_EXPLORER}/stats`),
    fetchWithRetry(`${ETHERLINK_EXPLORER}/stats/charts/transactions`),
    fetchWithRetry(`${ETHERLINK_EXPLORER}/stats/charts/active-accounts`),
    rpcCall('eth_blockNumber'),
    rpcCall('eth_gasPrice')
  ]);

  const chains = chainsResult.status === 'fulfilled' && Array.isArray(chainsResult.value) ? chainsResult.value : [];
  const protocols = protocolsResult.status === 'fulfilled' && Array.isArray(protocolsResult.value) ? protocolsResult.value : [];
  const stats = statsResult.status === 'fulfilled' ? statsResult.value : {};
  const l2 = chains.find(chain => chain.name === ETHERLINK_CHAIN_NAME);
  const l1 = chains.find(chain => chain.name === 'Tezos');
  const txRows = txChartResult.status === 'fulfilled'
    ? normalizeChartRows(txChartResult.value, ['transactions_count', 'transactions', 'value', 'count'])
    : [];
  const activeRows = activeAccountsResult.status === 'fulfilled'
    ? normalizeChartRows(activeAccountsResult.value, ['active_accounts', 'accounts', 'value'])
    : [];
  const protocolTvls = protocols
    .map(protocol => numberOrNull(protocol.chainTvls?.[ETHERLINK_CHAIN_NAME]) || 0)
    .filter(value => value > 0)
    .sort((a, b) => b - a);
  const gasWei = rpcGasResult.status === 'fulfilled' ? hexToNumber(rpcGasResult.value) : null;
  const rpcGasGwei = gasWei === null ? null : gasWei / 1e9;
  const explorerGas = numberOrNull(stats?.gas_prices?.average);
  const l2Tvl = numberOrNull(l2?.tvl ?? stats?.tvl);
  const l1Tvl = numberOrNull(l1?.tvl);

  return {
    timestamp: new Date().toISOString(),
    tvl_usd: roundOrNull(l2Tvl),
    tezos_l1_tvl_usd: roundOrNull(l1Tvl),
    tvl_share_pct: l2Tvl && l1Tvl ? roundOrNull((l2Tvl / (l2Tvl + l1Tvl)) * 100, 4) : null,
    transactions_24h: Number(stats?.transactions_today || txRows[txRows.length - 1]?.value || 0) || null,
    total_transactions: Number(stats?.total_transactions || 0) || null,
    total_addresses: Number(stats?.total_addresses || 0) || null,
    active_addresses: activeRows[activeRows.length - 1]?.value ?? null,
    gas_gwei: roundOrNull(explorerGas ?? rpcGasGwei, 4),
    average_block_time_ms: roundOrNull(stats?.average_block_time, 2),
    explorer_head: Number(stats?.total_blocks || 0) || null,
    rpc_head: rpcHeadResult.status === 'fulfilled' ? hexToNumber(rpcHeadResult.value) : null,
    top_protocol_tvl_usd: protocolTvls.length ? roundOrNull(protocolTvls[0]) : null
  };
}

function ballotKey(status) {
  return String(status || 'none').replace('voted_', '');
}

async function collectGovernancePeriodHistory() {
  const [head, period] = await Promise.all([
    fetchWithRetry(`${TZKT_API}/head`),
    fetchWithRetry(`${TZKT_API}/voting/periods/current`)
  ]);
  const [voters, epoch] = await Promise.all([
    fetchWithRetry(`${TZKT_API}/voting/periods/current/voters?status.ne=none&limit=10000&select=status,votingPower`),
    period.epoch === undefined || period.epoch === null
      ? null
      : fetchWithRetry(`${TZKT_API}/voting/epochs/${period.epoch}`).catch(() => null)
  ]);

  let yay = 0;
  let nay = 0;
  let pass = 0;
  for (const voter of Array.isArray(voters) ? voters : []) {
    const power = Number(voter.votingPower || 0);
    const status = ballotKey(voter.status);
    if (status === 'yay') yay += power;
    else if (status === 'nay') nay += power;
    else if (status === 'pass') pass += power;
  }

  const votedPower = yay + nay + pass;
  const totalVotingPower = Number(period.totalVotingPower || 0);
  const yayNayPower = yay + nay;
  const isBallotPeriod = period.kind === 'exploration' || period.kind === 'promotion';
  const proposals = Array.isArray(epoch?.proposals) ? epoch.proposals : [];
  const scopedProposal = proposals.find(proposal => {
    const first = proposal.firstPeriod ?? Number.NEGATIVE_INFINITY;
    const last = proposal.lastPeriod ?? Number.POSITIVE_INFINITY;
    return first <= period.index && period.index <= last;
  }) || proposals.find(proposal => proposal.status === 'active') || proposals[0] || null;

  return {
    timestamp: new Date().toISOString(),
    head_level: Number(head.level || 0) || null,
    epoch: Number(period.epoch || 0) || null,
    period_index: Number(period.index || 0) || null,
    period_kind: period.kind || null,
    period_status: period.status || null,
    proposal: period.proposal?.hash || period.proposal || scopedProposal?.hash || null,
    participation_pct: isBallotPeriod && totalVotingPower > 0 ? roundOrNull((votedPower / totalVotingPower) * 100, 4) : null,
    quorum_pct: isBallotPeriod ? roundOrNull(period.ballotsQuorum) : null,
    supermajority_pct: yayNayPower > 0 ? roundOrNull((yay / yayNayPower) * 100, 4) : null,
    yay_power: roundOrNull(yay / 1e6),
    nay_power: roundOrNull(nay / 1e6),
    pass_power: roundOrNull(pass / 1e6),
    voting_power_voted: roundOrNull(votedPower / 1e6),
    voters_voted: Array.isArray(voters) ? voters.length : 0,
    voters_total: Number(period.totalBakers || 0) || null,
    period_start: period.startTime || null,
    period_end: period.endTime || null
  };
}

async function postSnapshot(table, payload, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }

  const query = options.onConflict ? `?on_conflict=${options.onConflict}` : '';
  const prefer = options.onConflict
    ? 'return=minimal,resolution=merge-duplicates'
    : 'return=minimal';
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${table} insert failed: HTTP ${response.status} - ${error}`);
  }
}

async function main() {
  const collectors = [
    { table: 'market_history', collect: collectMarketHistory },
    { table: 'network_health_history', collect: collectNetworkHealthHistory },
    { table: 'tezosx_history', collect: collectTezosXHistory },
    { table: 'governance_period_history', collect: collectGovernancePeriodHistory, onConflict: 'period_index,head_level' }
  ];
  const failures = [];
  let writes = 0;

  for (const item of collectors) {
    try {
      const payload = await item.collect();
      console.log(`Collected ${item.table}:`, payload);
      await postSnapshot(item.table, payload, { onConflict: item.onConflict });
      writes += 1;
      console.log(`Stored ${item.table}`);
    } catch (error) {
      failures.push(`${item.table}: ${error.message}`);
      console.error(`Failed ${item.table}:`, error);
    }
  }

  if (failures.length) {
    console.error(`Chamber history completed with ${failures.length} failure(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    if (writes === 0) process.exit(1);
  }

  console.log(`Chamber history stored ${writes}/${collectors.length} snapshots`);
}

main();
