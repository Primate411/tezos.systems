/** Validate source-native values before they can become cached observations. */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const unsigned = value => numeric(value) && value >= 0;
const integer = value => unsigned(value) && Number.isSafeInteger(value);
const decimal = value => unsigned(value) || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)));
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function requirePayload(condition, label) {
    if (!condition) throw new TypeError(`Invalid ${label} response`);
}

export function validateStatistics(value) {
    requirePayload(object(value) && integer(value.totalSupply) && value.totalSupply > 0, 'TzKT statistics supply');
    const pair = ['totalOwnStaked', 'totalExternalStaked'];
    requirePayload(pair.every(key => unsigned(value[key])) || (pair.every(key => value[key] === undefined) && unsigned(value.totalFrozen)), 'TzKT staked totals');
    for (const key of ['totalFrozen', ...pair, 'totalOwnDelegated', 'totalExternalDelegated', 'totalBurned', 'burnedSupply', 'totalBootstrapped', 'totalBakingPower', 'totalDelegators', 'totalStakers']) {
        if (key in value) requirePayload(integer(value[key]), `TzKT statistics ${key}`);
    }
    requirePayload(unsigned(value.totalOwnDelegated) && unsigned(value.totalExternalDelegated), 'TzKT delegated totals');
    const staked = pair.every(key => unsigned(value[key])) ? value.totalOwnStaked + value.totalExternalStaked : value.totalFrozen;
    requirePayload(staked <= value.totalSupply, 'TzKT staked supply bound');
    return value;
}

export function validateCount(value) {
    requirePayload(integer(value), 'TzKT count');
    return value;
}

export function validateCachedStats(value) {
    requirePayload(object(value) && value._quality?.status === 'live' && time(value._quality.observedAt)
        && Date.parse(value._quality.observedAt) <= Date.now()
        && integer(value.totalBakers) && value.totalBakers > 0
        && integer(value.blockLevel) && value.blockLevel > 0, 'dashboard observation');
    for (const key of ['totalBakers', 'tz4Bakers', 'tz4Percentage', 'cycle', 'blockLevel', 'cycleStartBlock', 'blocksPerCycle', 'cycleProgress',
        'participation', 'participationQuorum', 'participationYayPct', 'participationDaysLeft', 'currentIssuanceRate', 'protocolIssuanceRate',
        'lbIssuanceRate', 'lbEmaPct', 'stakingRatio', 'delegatedRatio', 'totalStaked', 'totalDelegated', 'bakingPower', 'totalDelegators',
        'totalStakers', 'rewardAccounts', 'totalSupply', 'totalBurned', 'transactionVolume24h', 'totalTransactions', 'contractCalls24h',
        'fundedAccounts', 'newAccounts24h', 'smartContracts', 'activeContracts24h', 'tokens', 'rollups', 'delegateAPY', 'stakeAPY']) {
        if (value[key] != null) requirePayload(unsigned(value[key]), `dashboard ${key}`);
    }
    return value;
}

export function validateVoteTally(value) {
    requirePayload(Array.isArray(value) && value.every(row => object(row)
        && ['yay', 'nay', 'pass', 'voted_yay', 'voted_nay', 'voted_pass'].includes(row.status)
        && integer(row.votingPower)), 'TzKT vote tally');
    return value;
}

export function validateLbBlocks(value) {
    requirePayload(Array.isArray(value) && value.length === 1 && object(value[0]) && integer(value[0].level)
        && value[0].level > 0 && Object.prototype.hasOwnProperty.call(value[0], 'lbToggleEma')
        && (value[0].lbToggleEma === null || integer(value[0].lbToggleEma)), 'TzKT Liquidity Baking block');
    return value;
}

export function validateConstants(value) {
    requirePayload(object(value) && integer(value.blocks_per_cycle) && value.blocks_per_cycle > 0
        && decimal(value.minimal_block_delay) && Number(value.minimal_block_delay) > 0, 'Octez timing constants');
    for (const key of ['liquidity_baking_subsidy', 'hard_gas_limit_per_block', 'consensus_committee_size', 'edge_of_staking_over_delegation']) {
        if (key in value) requirePayload(decimal(value[key]), `Octez constant ${key}`);
    }
    return value;
}

export function validateRpcScalar(value) {
    // RPC text is JSON: an integer/decimal or its quoted decimal representation.
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new TypeError('Invalid Octez numeric response'); }
    requirePayload(decimal(parsed), 'Octez numeric');
    return value;
}

export function validateRpcAmount(value) {
    validateRpcScalar(value);
    const parsed = JSON.parse(value);
    requirePayload((typeof parsed === 'string' ? /^\d+$/.test(parsed) : integer(parsed))
        && Number.isSafeInteger(Number(parsed)), 'Octez mutez amount');
    return value;
}

export function validateVotingPeriod(value) {
    requirePayload(object(value) && integer(value.index)
        && ['proposal', 'exploration', 'testing', 'cooldown', 'promotion', 'adoption'].includes(value.kind), 'TzKT voting period');
    for (const key of ['epoch', 'firstLevel', 'lastLevel', 'yayVotingPower', 'nayVotingPower', 'passVotingPower', 'totalVotingPower', 'totalVoters', 'totalBakers', 'yayBallots', 'nayBallots', 'passBallots', 'ballotsQuorum']) {
        if (key in value && value[key] !== null) requirePayload(unsigned(value[key]), `TzKT voting ${key}`);
    }
    for (const key of ['startTime', 'endTime']) if (value[key] != null) requirePayload(time(value[key]), `TzKT voting ${key}`);
    return value;
}

export function validateHeader(value) {
    requirePayload(object(value) && integer(value.level) && value.level > 0 && time(value.timestamp), 'Octez block header');
    return value;
}

export function validateMetadata(value) {
    requirePayload(object(value) && object(value.level_info), 'Octez level metadata');
    for (const key of ['cycle', 'cycle_position']) {
        requirePayload(Object.prototype.hasOwnProperty.call(value.level_info, key), `Octez ${key}`);
        // Null is an explicit unavailable timing receipt, already rendered as unknown.
        if (value.level_info[key] != null) requirePayload(integer(value.level_info[key]), `Octez ${key}`);
    }
    return value;
}

export function validateBakers(value) {
    requirePayload(Array.isArray(value) && value.length > 0 && value.every(row => object(row)
        && typeof row.address === 'string' && /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(row.address)
        && integer(row.bakingPower) && (row.consensusAddress == null || /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(row.consensusAddress))), 'TzKT baker catalog');
    requirePayload(value.some(row => row.bakingPower > 0), 'TzKT funded baker catalog');
    return value;
}

export function validatePriceData(value) {
    requirePayload(object(value) && numeric(value.usd) && value.usd > 0, 'CoinGecko USD price');
    for (const key of ['eur', 'btc', 'usd_market_cap', 'usd_24h_vol']) {
        if (value[key] != null) requirePayload(unsigned(value[key]), `CoinGecko ${key}`);
    }
    for (const key of ['usd_24h_change', 'usd_7d_change', 'usd_30d_change']) {
        if (value[key] != null) requirePayload(numeric(value[key]), `CoinGecko ${key}`);
    }
    return value;
}

export function validatePriceSpot(value) {
    requirePayload(object(value) && object(value.tezos), 'CoinGecko spot');
    validatePriceData(value.tezos);
    return value;
}

export function validatePriceHorizons(value) {
    requirePayload(Array.isArray(value) && value.length === 1 && object(value[0])
        && value[0].id === 'tezos' && numeric(value[0].current_price) && value[0].current_price > 0, 'CoinGecko market horizons');
    for (const key of ['market_cap', 'total_volume']) if (value[0][key] != null) requirePayload(unsigned(value[0][key]), `CoinGecko ${key}`);
    for (const key of ['price_change_percentage_24h', 'price_change_percentage_24h_in_currency', 'price_change_percentage_7d_in_currency', 'price_change_percentage_30d_in_currency']) {
        if (value[0][key] != null) requirePayload(numeric(value[0][key]), `CoinGecko ${key}`);
    }
    return value;
}
