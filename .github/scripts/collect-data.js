// Data collection script for GitHub Actions
// Fetches current Tezos stats and stores them in Supabase

const TZKT_API = 'https://api.tzkt.io/v1';
const OCTEZ_RPC = 'https://eu.rpc.tez.capital'; // Better for GitHub Actions
const LB_EMA_DISABLE_THRESHOLD = 1000000000;
const LB_EMA_DENOMINATOR = 2000000000;

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

// Fetch tz4 baker stats (use consensusAddress field directly!)
async function getTz4Stats() {
  // Get all active bakers with their consensus addresses
  const bakers = await fetchWithRetry(`${TZKT_API}/delegates?active=true&limit=10000&select=address,consensusAddress,bakingPower`);
  const poweredBakers = bakers.filter(b => Number(b.bakingPower || 0) > 0);
  const totalBakers = poweredBakers.length;
  const totalPowerMutez = poweredBakers.reduce((sum, baker) => sum + Number(baker.bakingPower || 0), 0);

  // Count bakers with tz4 consensus addresses
  const tz4PoweredBakers = poweredBakers.filter(b => b.consensusAddress && b.consensusAddress.startsWith('tz4'));
  const tz4Bakers = tz4PoweredBakers.length;
  const tz4PowerMutez = tz4PoweredBakers.reduce((sum, baker) => sum + Number(baker.bakingPower || 0), 0);
  const tz4Percentage = totalBakers > 0 ? (tz4Bakers / totalBakers) * 100 : 0;
  const tz4PowerPercentage = totalPowerMutez > 0 ? (tz4PowerMutez / totalPowerMutez) * 100 : 0;

  console.log(`Found ${totalBakers} powered active bakers, ${tz4Bakers} with tz4 consensus addresses (${tz4Percentage.toFixed(2)}%, ${tz4PowerPercentage.toFixed(2)}% by power)`);

  return {
    tz4Bakers,
    totalBakers,
    tz4Percentage,
    tz4PowerPercentage,
    tz4PowerActive: tz4PowerMutez / 1e6,
    tz4PowerTotal: totalPowerMutez / 1e6
  };
}

// Fetch staking data (match frontend approach)
async function getStakingData(totalSupplyFromRPC, workingRPC) {
  try {
    console.log('Fetching staking data...');

    const totalSupply = totalSupplyFromRPC || 0;
    console.log(`Using total supply: ${totalSupply} XTZ`);

    const [stakeResult, statsResult] = await Promise.allSettled([
      workingRPC ? fetch(`${workingRPC}/chains/main/blocks/head/context/total_frozen_stake`) : null,
      fetchWithRetry(`${TZKT_API}/statistics/current`)
    ]);

    const stats = statsResult.status === 'fulfilled' ? statsResult.value : {};
    const statsStakedMutez = Number(stats.totalOwnStaked || 0) + Number(stats.totalExternalStaked || 0);
    let totalStaked = statsStakedMutez > 0 ? statsStakedMutez / 1e6 : 0;

    // Use protocol-frozen stake as a fallback so pending unstakes stay counted until finalized.
    if (!totalStaked && stakeResult.status === 'fulfilled' && stakeResult.value?.ok) {
      const stakeMutez = await stakeResult.value.text();
      totalStaked = parseInt(stakeMutez.replace(/"/g, '')) / 1e6;
    }

    console.log(`Total frozen stake: ${totalStaked} XTZ`);

    const stakingRatio = totalSupply > 0 ? (totalStaked / totalSupply) * 100 : 0;

    const totalDelegated = (Number(stats.totalOwnDelegated || 0) + Number(stats.totalExternalDelegated || 0)) / 1e6;
    const totalBakingPower = Number(stats.totalBakingPower || 0) / 1e6;

    console.log('Staking data:', { totalDelegated, totalBakingPower });

    const delegatedRatio = totalDelegated && totalSupply > 0
      ? (totalDelegated / totalSupply) * 100
      : 0;
    console.log(`Staking ratio: ${stakingRatio.toFixed(2)}%, Delegated ratio: ${delegatedRatio.toFixed(2)}%`);

    return {
      stakingRatio: isNaN(stakingRatio) ? 0 : stakingRatio,
      delegatedRatio: isNaN(delegatedRatio) ? 0 : delegatedRatio,
      totalSupply: isNaN(totalSupply) ? 0 : totalSupply,
      totalStaked,
      totalDelegated,
      totalBakingPower
    };
  } catch (error) {
    console.error('Failed to fetch staking data:', error.message);
    return { stakingRatio: 0, delegatedRatio: 0, totalSupply: 0, totalStaked: 0, totalDelegated: 0, totalBakingPower: 0 };
  }
}

// Fetch issuance rate using alternative RPC (also returns total supply and working RPC)
async function getLiquidityBakingSubsidyState() {
  try {
    const blocks = await fetchWithRetry(`${TZKT_API}/blocks?sort.desc=level&limit=1&select=level,lbToggleEma`);
    const latest = Array.isArray(blocks) ? blocks[0] : null;
    const ema = Number(latest?.lbToggleEma);
    const known = Number.isFinite(ema);
    const disabled = known && ema >= LB_EMA_DISABLE_THRESHOLD;
    const emaPct = known ? (ema / LB_EMA_DENOMINATOR) * 100 : null;
    console.log(known
      ? `Liquidity Baking EMA: ${ema} (${disabled ? 'subsidy disabled' : 'subsidy active'})`
      : 'Liquidity Baking EMA unavailable');
    return { disabled, ema: known ? ema : null, emaPct, known };
  } catch (error) {
    console.warn(`Liquidity Baking EMA fetch failed: ${error.message}; assuming subsidy active for snapshot compatibility`);
    return { disabled: false, ema: null, emaPct: null, known: false };
  }
}

async function getIssuanceRate() {
  try {
    console.log('Fetching issuance rate...');

    // Try multiple RPC endpoints (GitHub Actions-friendly)
    const rpcEndpoints = [
      'https://eu.rpc.tez.capital',
      'https://us.rpc.tez.capital',
      'https://mainnet.api.tez.ie'
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

    const lbState = await getLiquidityBakingSubsidyState();

    // Calculate LB subsidy rate only while the chain subsidy is active.
    const lbSubsidyPerMinute = constants ? (parseInt(constants.liquidity_baking_subsidy) || 0) : 0;
    const minutesPerYear = 365.25 * 24 * 60;
    const lbXTZPerYear = (lbSubsidyPerMinute / 1e6) * minutesPerYear;
    const lbRate = !lbState.disabled && totalSupplyXTZ > 0 ? (lbXTZPerYear / totalSupplyXTZ) * 100 : 0;

    // Total rate
    const totalRate = adaptiveRate + lbRate;
    console.log(`Total issuance rate: ${totalRate.toFixed(2)}% (${adaptiveRate.toFixed(2)}% adaptive + ${lbRate.toFixed(2)}% LB${lbState.disabled ? ' disabled' : ''})`);

    return {
      rate: parseFloat(totalRate.toFixed(4)),
      protocolRate: adaptiveRate,
      lbRate,
      lbSubsidyDisabled: lbState.disabled,
      lbEma: lbState.ema,
      lbEmaPct: lbState.emaPct,
      lbKnown: lbState.known,
      totalSupply: totalSupplyXTZ,
      workingRPC
    };
  } catch (error) {
    console.error('Failed to fetch issuance rate:', error.message);
    return { rate: 0, totalSupply: 0, workingRPC: null };
  }
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

  return {
    stakeAPY,
    delegateAPY
  };
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

// Fetch contract calls (24h)
async function getContractCalls24h() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  try {
    const count = await fetchWithRetry(
      `${TZKT_API}/operations/transactions/count?timestamp.gt=${yesterday.toISOString()}&entrypoint.null=false`
    );
    console.log(`Contract calls 24h: ${count}`);
    return count || 0;
  } catch (error) {
    console.error('Failed to fetch contract calls:', error.message);
    return 0;
  }
}

let activityCutoffLevelPromise = null;
async function getActivityCutoffLevel() {
  if (!activityCutoffLevelPromise) {
    activityCutoffLevelPromise = (async () => {
      const head = await fetchWithRetry(`${TZKT_API}/head`);
      let blockDelaySeconds = 6;
      try {
        const constants = await fetchWithRetry(`${OCTEZ_RPC}/chains/main/blocks/head/context/constants`);
        const parsedDelay = parseInt(constants?.minimal_block_delay, 10);
        if (Number.isFinite(parsedDelay) && parsedDelay > 0) {
          blockDelaySeconds = parsedDelay;
        }
      } catch (error) {
        console.warn(`Using 6 second block delay fallback: ${error.message}`);
      }
      const recentBlocks = Math.ceil((24 * 60 * 60) / blockDelaySeconds);
      return Math.max(0, (head?.level || 0) - recentBlocks);
    })();
  }
  return activityCutoffLevelPromise;
}

// Fetch accounts first seen in the last 24h
async function getNewAccounts24h() {
  try {
    const cutoffLevel = await getActivityCutoffLevel();
    const count = await fetchWithRetry(`${TZKT_API}/accounts/count?firstActivity.gt=${cutoffLevel}`);
    console.log(`New accounts 24h: ${count}`);
    return count || 0;
  } catch (error) {
    console.error('Failed to fetch new accounts:', error.message);
    return 0;
  }
}

// Fetch funded accounts
async function getFundedAccounts() {
  try {
    const count = await fetchWithRetry(`${TZKT_API}/accounts/count?balance.gt=0`);
    console.log(`Funded accounts: ${count}`);
    return count || 0;
  } catch (error) {
    console.error('Failed to fetch funded accounts:', error.message);
    return 0;
  }
}

// Fetch smart contracts count
async function getSmartContracts() {
  try {
    const count = await fetchWithRetry(`${TZKT_API}/accounts/count?type=contract&kind=smart_contract`);
    console.log(`Smart contracts: ${count}`);
    return count || 0;
  } catch (error) {
    console.error('Failed to fetch smart contracts:', error.message);
    return 0;
  }
}

// Fetch smart contracts active in the last 24h
async function getActiveContracts24h() {
  try {
    const cutoffLevel = await getActivityCutoffLevel();
    const count = await fetchWithRetry(`${TZKT_API}/contracts/count?lastActivity.gt=${cutoffLevel}`);
    console.log(`Active contracts 24h: ${count}`);
    return count || 0;
  } catch (error) {
    console.error('Failed to fetch active contracts:', error.message);
    return 0;
  }
}

// Fetch token count
async function getTokens() {
  try {
    const count = await fetchWithRetry(`${TZKT_API}/tokens/count`);
    console.log(`Tokens: ${count}`);
    return count || 0;
  } catch (error) {
    console.error('Failed to fetch tokens:', error.message);
    return 0;
  }
}

// Fetch smart rollups count
async function getRollups() {
  try {
    const count = await fetchWithRetry(`${TZKT_API}/smart_rollups/count`);
    console.log(`Smart rollups: ${count}`);
    return count || 0;
  } catch (error) {
    console.error('Failed to fetch rollups:', error.message);
    return 0;
  }
}

// Main collection function
async function collectData() {
  console.log('Starting data collection...');

  try {
    // Fetch issuance first to get total supply
    const issuanceData = await getIssuanceRate();

    // Now fetch everything else in parallel, passing total supply and RPC to staking
    const [cycle, tz4Stats, stakingData, totalBurned, txVolume, contractCalls, fundedAccounts, newAccounts, smartContracts, activeContracts, tokens, rollups] = await Promise.all([
      getCurrentCycle(),
      getTz4Stats(),
      getStakingData(issuanceData.totalSupply, issuanceData.workingRPC),
      getTotalBurned(),
      getTxVolume24h(),
      getContractCalls24h(),
      getFundedAccounts(),
      getNewAccounts24h(),
      getSmartContracts(),
      getActiveContracts24h(),
      getTokens(),
      getRollups()
    ]);

    // Helper to safely format numbers
    const safeNumber = (val, decimals = 2) => {
      const num = parseFloat(val);
      return isNaN(num) || !isFinite(num) ? 0 : parseFloat(num.toFixed(decimals));
    };
    const safeNullableNumber = (val, decimals = 2) => {
      const num = parseFloat(val);
      return isNaN(num) || !isFinite(num) ? null : parseFloat(num.toFixed(decimals));
    };
    const apy = calculateStakingApy(issuanceData.protocolRate, stakingData);

    const dataPoint = {
      timestamp: new Date().toISOString(),
      cycle: cycle || 0,
      tz4_bakers: tz4Stats.tz4Bakers || 0,
      tz4_percentage: safeNumber(tz4Stats.tz4Percentage),
      total_bakers: tz4Stats.totalBakers || 0,
      tz4_power_pct: safeNullableNumber(tz4Stats.tz4PowerPercentage),
      tz4_power_active: safeNullableNumber(tz4Stats.tz4PowerActive),
      tz4_power_total: safeNullableNumber(tz4Stats.tz4PowerTotal),
      staking_ratio: safeNumber(stakingData.stakingRatio),
      delegated_ratio: safeNumber(stakingData.delegatedRatio),
      total_staked: safeNullableNumber(stakingData.totalStaked),
      total_delegated: safeNullableNumber(stakingData.totalDelegated),
      total_baking_power: safeNullableNumber(stakingData.totalBakingPower),
      staking_apy_stake: safeNullableNumber(apy.stakeAPY, 1),
      staking_apy_delegate: safeNullableNumber(apy.delegateAPY, 1),
      total_supply: safeNumber(stakingData.totalSupply),
      current_issuance_rate: safeNumber(issuanceData.rate),
      protocol_issuance_rate: safeNullableNumber(issuanceData.protocolRate, 4),
      lb_issuance_rate: safeNullableNumber(issuanceData.lbRate, 4),
      lb_ema: safeNullableNumber(issuanceData.lbEma, 0),
      lb_ema_pct: safeNullableNumber(issuanceData.lbEmaPct, 2),
      lb_subsidy_disabled: issuanceData.lbKnown ? Boolean(issuanceData.lbSubsidyDisabled) : null,
      total_burned: safeNumber(totalBurned),
      tx_volume_24h: txVolume || 0,
      contract_calls_24h: contractCalls || 0,
      funded_accounts: fundedAccounts || 0,
      new_accounts_24h: newAccounts || 0,
      smart_contracts: smartContracts || 0,
      active_contracts_24h: activeContracts || 0,
      tokens: tokens || 0,
      rollups: rollups || 0
    };

    console.log('Collected data:', dataPoint);

    // Sanity check: reject snapshots with critical fields at zero
    // These fields should NEVER be zero on a live network
    const criticalFields = {
      total_supply: dataPoint.total_supply,
      staking_ratio: dataPoint.staking_ratio,
      total_bakers: dataPoint.total_bakers,
      current_issuance_rate: dataPoint.current_issuance_rate
    };

    const zeroFields = Object.entries(criticalFields)
      .filter(([_, v]) => !v || v === 0)
      .map(([k]) => k);

    if (zeroFields.length > 0) {
      console.error(`ABORT: Critical fields are zero: ${zeroFields.join(', ')}. Likely RPC failure — skipping snapshot to avoid corrupting sparkline data.`);
      process.exit(1);
    }

    // Store in Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const postHistory = async (payload) => fetch(`${supabaseUrl}/rest/v1/tezos_history`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    let response = await postHistory(dataPoint);
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
