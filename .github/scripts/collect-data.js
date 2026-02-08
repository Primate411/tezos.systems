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
    // Get total supply from Octez RPC (more reliable)
    const supplyResponse = await fetch(`${OCTEZ_RPC}/chains/main/blocks/head/context/total_supply`);
    if (!supplyResponse.ok) {
      console.error(`Supply fetch failed: ${supplyResponse.status} ${supplyResponse.statusText}`);
      throw new Error('Supply fetch failed');
    }
    const supplyString = await supplyResponse.text();
    const totalSupply = parseInt(supplyString.replace(/"/g, '')) / 1e6;
    console.log(`Total supply: ${totalSupply} XTZ`);

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

// Fetch issuance rate (correctly, including LB subsidy)
async function getIssuanceRate() {
  try {
    console.log('Fetching issuance rate...');
    // Fetch adaptive issuance rate (returns as text like "4.5")
    const rateResponse = await fetch(`${OCTEZ_RPC}/chains/main/blocks/head/context/issuance/current_yearly_rate`);
    if (!rateResponse.ok) {
      console.error(`Issuance rate fetch failed: ${rateResponse.status} ${rateResponse.statusText}`);
      return 0;
    }
    const rateString = await rateResponse.text();
    const adaptiveRate = parseFloat(rateString.replace(/"/g, ''));
    console.log(`Adaptive rate: ${adaptiveRate}`);

    // Fetch constants for LB subsidy
    const constants = await fetchWithRetry(`${OCTEZ_RPC}/chains/main/blocks/head/context/constants`);

    // Fetch total supply
    const supplyResponse = await fetch(`${OCTEZ_RPC}/chains/main/blocks/head/context/total_supply`);
    if (!supplyResponse.ok) {
      console.error(`Supply fetch failed: ${supplyResponse.status} ${supplyResponse.statusText}`);
      return adaptiveRate; // Return at least the adaptive rate
    }
    const supplyString = await supplyResponse.text();
    const totalSupplyXTZ = parseInt(supplyString.replace(/"/g, '')) / 1e6;
    console.log(`Total supply: ${totalSupplyXTZ}`);

    // Calculate LB subsidy rate
    const lbSubsidyPerMinute = parseInt(constants.liquidity_baking_subsidy) || 0;
    const minutesPerYear = 365.25 * 24 * 60;
    const lbXTZPerYear = (lbSubsidyPerMinute / 1e6) * minutesPerYear;
    const lbRate = (lbXTZPerYear / totalSupplyXTZ) * 100;

    // Total rate
    const totalRate = adaptiveRate + lbRate;
    console.log(`Total issuance rate: ${totalRate}`);
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
