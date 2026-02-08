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

// Fetch tz4 baker stats (count consensus keys from operations!)
async function getTz4Stats() {
  // Get all active bakers
  const bakers = await fetchWithRetry(`${TZKT_API}/delegates?active=true&limit=10000&select=address`);
  const totalBakers = bakers.length;
  const activeBakerAddresses = new Set(bakers.map(b => b.address));
  console.log(`Found ${totalBakers} active bakers`);

  // Fetch recent update_consensus_key operations to get consensus keys
  const opsUrl = `${TZKT_API}/operations/update_consensus_key?limit=2000&sort.desc=id`;
  const operations = await fetchWithRetry(opsUrl);
  console.log(`Found ${operations.length} consensus key operations`);

  // Build map of baker -> consensus key
  const bakerConsensusKeys = {};
  let tz4Count = 0;

  for (const op of operations) {
    const baker = op.sender?.address;
    const keyHash = op.publicKeyHash || '';

    if (baker && !bakerConsensusKeys[baker] && activeBakerAddresses.has(baker)) {
      bakerConsensusKeys[baker] = keyHash;
      if (keyHash.startsWith('tz4')) {
        tz4Count++;
        console.log(`Found tz4 baker: ${baker} -> ${keyHash}`);
      }
    }
  }

  console.log(`Mapped ${Object.keys(bakerConsensusKeys).length} bakers to consensus keys`);
  console.log(`tz4 count: ${tz4Count}`);

  // Count tz4 consensus keys
  const tz4Bakers = Object.values(bakerConsensusKeys).filter(key =>
    key.startsWith('tz4')
  ).length;

  const tz4Percentage = totalBakers > 0 ? (tz4Bakers / totalBakers) * 100 : 0;

  console.log(`tz4 bakers: ${tz4Bakers} / ${totalBakers} (${tz4Percentage.toFixed(2)}%)`);

  return { tz4Bakers, totalBakers, tz4Percentage };
}

// Fetch staking data (match frontend approach)
async function getStakingData(totalSupplyFromRPC, workingRPC) {
  try {
    console.log('Fetching staking data...');

    const totalSupply = totalSupplyFromRPC || 0;
    console.log(`Using total supply: ${totalSupply} XTZ`);

    // Get total frozen stake from RPC (same as frontend)
    const stakeResponse = await fetch(`${workingRPC}/chains/main/blocks/head/context/total_frozen_stake`);
    if (!stakeResponse.ok) {
      console.error(`Frozen stake fetch failed: ${stakeResponse.status}`);
      return { stakingRatio: 0, delegatedRatio: 0, totalSupply, totalStaked: 0 };
    }

    const stakeMutez = await stakeResponse.text();
    const totalStaked = parseInt(stakeMutez.replace(/"/g, '')) / 1e6;
    console.log(`Total frozen stake: ${totalStaked} XTZ`);

    const stakingRatio = totalSupply > 0 ? (totalStaked / totalSupply) * 100 : 0;

    // Get delegated ratio from TzKT cycle data (same as frontend)
    const head = await fetchWithRetry(`${TZKT_API}/head`);
    const cycle = await fetchWithRetry(`${TZKT_API}/cycles/${head.cycle}`);

    console.log(`Cycle ${head.cycle} data:`, { totalDelegated: cycle.totalDelegated, totalBakingPower: cycle.totalBakingPower });

    const delegatedRatio = cycle.totalDelegated && totalSupply > 0
      ? (cycle.totalDelegated / totalSupply) * 100
      : 30; // fallback like frontend

    console.log(`Staking ratio: ${stakingRatio.toFixed(2)}%, Delegated ratio: ${delegatedRatio.toFixed(2)}%`);

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

// Fetch issuance rate using alternative RPC (also returns total supply and working RPC)
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
    let workingRPC = null;

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
        workingRPC = rpc;
        break;
      } catch (err) {
        console.log(`RPC ${rpc} failed, trying next...`);
        continue;
      }
    }

    if (adaptiveRate === 0 || !workingRPC) {
      console.log('All RPCs failed, returning defaults');
      return { rate: 0, totalSupply: 0, workingRPC: null };
    }

    // Calculate LB subsidy rate
    const lbSubsidyPerMinute = constants ? (parseInt(constants.liquidity_baking_subsidy) || 0) : 0;
    const minutesPerYear = 365.25 * 24 * 60;
    const lbXTZPerYear = (lbSubsidyPerMinute / 1e6) * minutesPerYear;
    const lbRate = totalSupplyXTZ > 0 ? (lbXTZPerYear / totalSupplyXTZ) * 100 : 0;

    // Total rate
    const totalRate = adaptiveRate + lbRate;
    console.log(`Total issuance rate: ${totalRate.toFixed(2)}%`);

    return {
      rate: parseFloat(totalRate.toFixed(2)),
      totalSupply: totalSupplyXTZ,
      workingRPC
    };
  } catch (error) {
    console.error('Failed to fetch issuance rate:', error.message);
    return { rate: 0, totalSupply: 0, workingRPC: null };
  }
}

// Fetch total burned (match frontend endpoint)
async function getTotalBurned() {
  try {
    console.log('Fetching total burned...');
    const stats = await fetchWithRetry(`${TZKT_API}/statistics/current`);
    const burned = stats.totalBurned ? stats.totalBurned / 1e6 : 0;
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
    // Fetch issuance first to get total supply
    const issuanceData = await getIssuanceRate();

    // Now fetch everything else in parallel, passing total supply and RPC to staking
    const [cycle, tz4Stats, stakingData, totalBurned, txVolume] = await Promise.all([
      getCurrentCycle(),
      getTz4Stats(),
      getStakingData(issuanceData.totalSupply, issuanceData.workingRPC),
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
      current_issuance_rate: safeNumber(issuanceData.rate),
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
