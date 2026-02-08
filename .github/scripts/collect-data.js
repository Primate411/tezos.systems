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
  try {
    console.log('Fetching staking data...');

    // Get total supply from TzKT statistics (more reliable for GitHub Actions)
    const stats = await fetchWithRetry(`${TZKT_API}/statistics`);
    const totalSupply = stats.totalSupply ? stats.totalSupply / 1000000 : 0;
    console.log(`Total supply from TzKT: ${totalSupply} XTZ`);

    // Get bakers and calculate staking
    const bakers = await fetchWithRetry(`${TZKT_API}/delegates?active=true&limit=10000&select=stakingBalance,delegatedBalance`);
    console.log(`Fetched ${bakers.length} bakers`);

    let totalStaked = 0;
    let totalDelegated = 0;

    bakers.forEach(b => {
      totalStaked += (b.stakingBalance || 0);
      totalDelegated += (b.delegatedBalance || 0);
    });

    totalStaked = totalStaked / 1000000;
    totalDelegated = totalDelegated / 1000000;
    console.log(`Total staked: ${totalStaked} XTZ, Total delegated: ${totalDelegated} XTZ`);

    const stakingRatio = totalSupply > 0 ? (totalStaked / totalSupply) * 100 : 0;
    const delegatedRatio = totalSupply > 0 ? (totalDelegated / totalSupply) * 100 : 0;

    return {
      stakingRatio: isNaN(stakingRatio) ? 0 : stakingRatio,
      delegatedRatio: isNaN(delegatedRatio) ? 0 : delegatedRatio,
      totalSupply: isNaN(totalSupply) ? 0 : totalSupply,
      totalStaked
    };
  } catch (error) {
    console.error('Failed to fetch staking data:', error.message);
    return { stakingRatio: 0, delegatedRatio: 0, totalSupply: 0, totalStaked: 0 };
  }
}

// Fetch issuance rate using alternative RPC
async function getIssuanceRate() {
  try {
    console.log('Fetching issuance rate...');

    // Try multiple RPC endpoints (GitHub Actions-friendly)
    const rpcEndpoints = [
      'https://mainnet.api.tez.ie',
      'https://rpc.tzbeta.net',
      'https://mainnet.smartpy.io'
    ];

    let adaptiveRate = 0;
    let constants = null;
    let totalSupplyXTZ = 0;

    // Try each RPC until one works
    for (const rpc of rpcEndpoints) {
      try {
        console.log(`Trying RPC: ${rpc}`);

        // Fetch adaptive issuance rate
        const rateResponse = await fetch(`${rpc}/chains/main/blocks/head/context/issuance/current_yearly_rate`);
        if (!rateResponse.ok) continue;

        const rateString = await rateResponse.text();
        adaptiveRate = parseFloat(rateString.replace(/"/g, ''));
        console.log(`Adaptive rate: ${adaptiveRate}`);

        // Fetch constants for LB subsidy
        const constResponse = await fetch(`${rpc}/chains/main/blocks/head/context/constants`);
        if (!constResponse.ok) continue;
        constants = await constResponse.json();

        // Fetch total supply
        const supplyResponse = await fetch(`${rpc}/chains/main/blocks/head/context/total_supply`);
        if (!supplyResponse.ok) continue;

        const supplyString = await supplyResponse.text();
        totalSupplyXTZ = parseInt(supplyString.replace(/"/g, '')) / 1e6;
        console.log(`Total supply: ${totalSupplyXTZ}`);

        // If we got here, this RPC works!
        break;
      } catch (err) {
        console.log(`RPC ${rpc} failed, trying next...`);
        continue;
      }
    }

    if (adaptiveRate === 0) {
      console.log('All RPCs failed, returning 0');
      return 0;
    }

    // Calculate LB subsidy rate
    const lbSubsidyPerMinute = constants ? (parseInt(constants.liquidity_baking_subsidy) || 0) : 0;
    const minutesPerYear = 365.25 * 24 * 60;
    const lbXTZPerYear = (lbSubsidyPerMinute / 1e6) * minutesPerYear;
    const lbRate = totalSupplyXTZ > 0 ? (lbXTZPerYear / totalSupplyXTZ) * 100 : 0;

    // Total rate
    const totalRate = adaptiveRate + lbRate;
    console.log(`Total issuance rate: ${totalRate.toFixed(2)}%`);
    return parseFloat(totalRate.toFixed(2));
  } catch (error) {
    console.error('Failed to fetch issuance rate:', error.message);
    return 0;
  }
}

// Fetch total burned
async function getTotalBurned() {
  try {
    console.log('Fetching total burned...');
    const stats = await fetchWithRetry(`${TZKT_API}/statistics`);
    const burned = stats.totalBurned ? stats.totalBurned / 1000000 : 0;
    console.log(`Total burned: ${burned} XTZ`);
    return burned;
  } catch (error) {
    console.error('Failed to fetch total burned:', error.message);
    return 0;
  }
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

    // Helper to safely format numbers
    const safeNumber = (val, decimals = 2) => {
      const num = parseFloat(val);
      return isNaN(num) || !isFinite(num) ? 0 : parseFloat(num.toFixed(decimals));
    };

    const dataPoint = {
      timestamp: new Date().toISOString(),
      cycle: cycle || 0,
      tz4_bakers: tz4Stats.tz4Bakers || 0,
      tz4_percentage: safeNumber(tz4Stats.tz4Percentage),
      total_bakers: tz4Stats.totalBakers || 0,
      staking_ratio: safeNumber(stakingData.stakingRatio),
      delegated_ratio: safeNumber(stakingData.delegatedRatio),
      total_supply: safeNumber(stakingData.totalSupply),
      current_issuance_rate: safeNumber(issuanceRate),
      total_burned: safeNumber(totalBurned),
      tx_volume_24h: txVolume || 0
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
