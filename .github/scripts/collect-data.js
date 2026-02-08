// Data collection script for GitHub Actions
// Fetches current Tezos stats and stores them in Supabase

const TZKT_API = 'https://api.tzkt.io/v1';
const OCTEZ_RPC = 'https://rpc.tzbeta.net';

// Fetch with retry logic
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Fetch current cycle from RPC
async function getCurrentCycle() {
  const data = await fetchWithRetry(`${OCTEZ_RPC}/chains/main/blocks/head/context/constants`);
  const head = await fetchWithRetry(`${OCTEZ_RPC}/chains/main/blocks/head/metadata`);
  return head.level_info.cycle;
}

// Fetch tz4 baker stats
async function getTz4Stats() {
  const bakers = await fetchWithRetry(`${TZKT_API}/delegates?active=true&limit=10000&select=address,activeStakingBalance,stakingBalance`);

  const tz4Bakers = bakers.filter(b => b.address && b.address.startsWith('tz4')).length;
  const totalBakers = bakers.length;
  const tz4Percentage = totalBakers > 0 ? (tz4Bakers / totalBakers) * 100 : 0;

  return { tz4Bakers, totalBakers, tz4Percentage };
}

// Fetch staking data
async function getStakingData() {
  const stats = await fetchWithRetry(`${TZKT_API}/statistics`);
  const totalSupply = stats.totalSupply / 1000000; // Convert from mutez

  const bakers = await fetchWithRetry(`${TZKT_API}/delegates?active=true&limit=10000&select=stakingBalance,delegatedBalance`);

  let totalStaked = 0;
  let totalDelegated = 0;

  bakers.forEach(b => {
    totalStaked += b.stakingBalance || 0;
    totalDelegated += b.delegatedBalance || 0;
  });

  totalStaked = totalStaked / 1000000;
  totalDelegated = totalDelegated / 1000000;

  const stakingRatio = totalSupply > 0 ? (totalStaked / totalSupply) * 100 : 0;
  const delegatedRatio = totalSupply > 0 ? (totalDelegated / totalSupply) * 100 : 0;

  return { stakingRatio, delegatedRatio, totalSupply, totalStaked };
}

// Fetch issuance rate
async function getIssuanceRate() {
  const constants = await fetchWithRetry(`${OCTEZ_RPC}/chains/main/blocks/head/context/constants`);
  const rate = constants.issuance_weights ? constants.issuance_weights.base_total_issued_per_minute : null;
  return rate ? parseFloat((rate / 1000000 * 525600).toFixed(2)) : 0; // Convert to annual rate
}

// Fetch total burned
async function getTotalBurned() {
  const stats = await fetchWithRetry(`${TZKT_API}/statistics`);
  return stats.totalBurned ? stats.totalBurned / 1000000 : 0;
}

// Fetch transaction volume (24h)
async function getTxVolume24h() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const ops = await fetchWithRetry(
    `${TZKT_API}/operations/transactions/count?timestamp.gt=${yesterday.toISOString()}`
  );

  return ops || 0;
}

// Main collection function
async function collectData() {
  console.log('Starting data collection...');

  try {
    const [cycle, tz4Stats, stakingData, issuanceRate, totalBurned, txVolume] = await Promise.all([
      getCurrentCycle(),
      getTz4Stats(),
      getStakingData(),
      getIssuanceRate(),
      getTotalBurned(),
      getTxVolume24h()
    ]);

    const dataPoint = {
      timestamp: new Date().toISOString(),
      cycle,
      tz4_bakers: tz4Stats.tz4Bakers,
      tz4_percentage: parseFloat(tz4Stats.tz4Percentage.toFixed(2)),
      total_bakers: tz4Stats.totalBakers,
      staking_ratio: parseFloat(stakingData.stakingRatio.toFixed(2)),
      delegated_ratio: parseFloat(stakingData.delegatedRatio.toFixed(2)),
      total_supply: parseFloat(stakingData.totalSupply.toFixed(2)),
      current_issuance_rate: issuanceRate,
      total_burned: parseFloat(totalBurned.toFixed(2)),
      tx_volume_24h: txVolume
    };

    console.log('Collected data:', dataPoint);

    // Store in Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/tezos_history`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(dataPoint)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase error: ${response.status} - ${error}`);
    }

    console.log('Data stored successfully in Supabase');

  } catch (error) {
    console.error('Collection failed:', error);
    process.exit(1);
  }
}

// Run collection
collectData();
