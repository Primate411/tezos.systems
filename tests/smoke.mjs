#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let cli;
try {
  cli = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`fail - ${error.message}`);
  process.exit(1);
}
const BASE_URL = cli.baseUrl || process.env.BASE_URL || '';
const HEADLESS = !(cli.headed || process.env.SMOKE_HEADED === '1');
const STRICT_EXTERNAL = cli.strictExternal || process.env.STRICT_EXTERNAL === '1';
const BROWSER_EXECUTABLE_PATH = cli.browserExecutablePath || process.env.BROWSER_EXECUTABLE_PATH || '';
const ONLY_SUITES = cli.onlySuites;

const systemBrowserCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium'
];

const allowedWarningPatterns = [
  /goatcounter/i,
  /Price fetch failed/i,
  /Rate limited \(429\)/i,
  /status of 429/i,
  /Landing data fetch/i,
  /Tezlink entry refresh failed/i,
  /Failed to fetch/i,
  /CORS policy/i,
  /No 'Access-Control-Allow-Origin'/i,
  /Failed to load resource: net::ERR_FAILED/i,
  /HTTP 429/i,
  /HTTP 503/i,
  /api\.coingecko\.com/i,
  /api\.tzkt\.io/i,
  /teztale-server-mainnet-ro-prd\.octez\.tech/i,
  /api\.llama\.fi/i,
  /explorer\.etherlink\.com/i,
  /node\.mainnet\.etherlink\.com/i,
  /api\.github\.com/i,
  /SW registration failed/i,
  /Service Worker registration blocked by Playwright/i,
  /Using local protocol fallback/i,
  /preloaded using link preload/i
];

const browserRoutes = [
  '/',
  '/landing.html',
  '/staking/',
  '/governance/',
  '/chamber/',
  '/health/',
  '/tezosx/',
  '/tezlink/',
  '/l2chamber/',
  '/tz4/',
  '/lb/',
  '/ctez/',
  '/bakers/',
  '/hen/',
  '/compare/',
  '/compare/tezos-vs-ethereum.html',
  '/compare/tezos-vs-solana.html',
  '/compare/tezos-vs-cardano.html',
  '/compare/tezos-vs-algorand.html',
  '/widgets/baker-count.html',
  '/widgets/block-height.html',
  '/widgets/staking-ratio.html',
  '/widgets/price.html',
  '/widgets/protocol.html',
  '/widgets/governance.html',
  '/widgets/combo.html',
  '/widgets/baker-card.html',
  '/widgets/builder.html'
];
const formattingRoutes = [
  ...browserRoutes,
  '/404.html'
];
const formattingViewports = [
  { label: 'desktop', viewport: { width: 1280, height: 900 } },
  { label: 'mobile', viewport: { width: 390, height: 844 } }
];

const SAMPLE_ADDRESS = 'tz1aWXP237BLwNHJcCD4b3DutCevhqq2T1Z9';
const SAMPLE_ADDRESS_2 = 'tz1hThMBD8jQjFt78heuCnKxJnJtQo9Ao25X';
const SAMPLE_ADDRESS_3 = 'tz1PendingBaker1111111111111111111111';
const SAMPLE_DELEGATOR_ADDRESS = 'tz1iJP1EtP9iSkmaEKCZznDMst91oJGB9SZ5';
const SAMPLE_REGULAR_DELEGATOR_ADDRESS = 'tz1iKT2pvdbEHuVC3zugnJfVoQZbbyUzgToW';
const SAMPLE_SMALL_DELEGATOR_ADDRESS = 'tz1hh3pqYnm3umz3U7zJ6xkaCmpXbnKA7aAm';
const SAMPLE_STAKER_ADDRESS = 'tz1XrutuvkFRG15HmV2gdon86F38NMMGMAXr';
const SAMPLE_HEAVY_STAKER_ADDRESS = 'tz1dKGGEVmYrm6V8hBKexLQLdWCapoEAZb1i';
const OVERDELEGATED_ADDRESS = 'tz1bA9zZpouVgtMRLijvw5safwDKSxg62r1x';
const ETHERLINK_FAST_CONTRACT = 'KT19oUVQPnVLuUBYXrBVd46WJnNAMpqkKSwo';
const ETHERLINK_SLOW_CONTRACT = 'KT1AXRU3wLc87WNhLhVGrgqDGubLACUMUgPb';
const ETHERLINK_SEQUENCER_CONTRACT = 'KT1VGyd2cRSHoDnxDnSuqGJD3mL8DzcVqX98';
const ETHERLINK_FAST_PROPOSAL = '00625d22abf10a520cae5489b7e19df70219a150d336ee6dc0a8eb4c21eca43c1b';
const ETHERLINK_FAST_OLDER_PROPOSAL = '0056aea7f98b2bc4d18edb450b2f098f6e95e5356f30a1fac2b50080f3e482bad1';
const ETHERLINK_SLOW_PROPOSAL = '0079e0f348b608ce486c9e5e1fdf84b650019922bf3383b562522c2c8f60a098da';
const ETHERLINK_SEQUENCER_PROPOSAL = {
  pool_address: '3b1885eec759c22c878e12c84fac33b3b9d153e4',
  sequencer_pk: 'p2pk64mGSmsRAuodTdyNMJdSC6SmtWHF3gXH1WmmpPY8hyTqYFfd4Bg'
};
const ETHERLINK_PROPOSALS_BIGMAP = '990001';
const ETHERLINK_UPVOTERS_BIGMAP = '990002';
const ETHERLINK_UPVOTE_COUNTS_BIGMAP = '990003';
const EXPECTED_CHAMBER_ORDER = [
  'network-health',
  'chamber-entry-card',
  'tezlink-entry-card',
  'etherlink-governance-entry-card',
  'tz4-adoption',
  'lb-entry-card'
];

function usage() {
  return `
Usage: node tests/smoke.mjs [options]

Options:
  --base-url <url>             Test an existing local or remote server instead of starting one
  --headed                     Run Chromium visibly
  --strict-external            Fail on upstream warnings normally tolerated in local smoke runs
  --browser-executable <path>  Use a specific Chrome/Chromium executable
  --only <suite[,suite]>       Run selected suites by name
  --list                       List available suites and exit
  --help                       Show this help
`.trim();
}

function readArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value\n\n${usage()}`);
  return value;
}

function parseArgs(argv) {
  const options = {
    baseUrl: '',
    browserExecutablePath: '',
    headed: false,
    list: false,
    onlySuites: [],
    strictExternal: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--headed') {
      options.headed = true;
    } else if (arg === '--strict-external') {
      options.strictExternal = true;
    } else if (arg === '--base-url') {
      options.baseUrl = readArg(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--browser-executable') {
      options.browserExecutablePath = readArg(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--browser-executable=')) {
      options.browserExecutablePath = arg.slice('--browser-executable='.length);
    } else if (arg === '--only') {
      options.onlySuites.push(...readArg(argv, index, arg).split(','));
      index += 1;
    } else if (arg.startsWith('--only=')) {
      options.onlySuites.push(...arg.slice('--only='.length).split(','));
    } else {
      throw new Error(`unknown smoke option: ${arg}\n\n${usage()}`);
    }
  }

  options.baseUrl = options.baseUrl.replace(/\/$/, '');
  options.onlySuites = options.onlySuites.map((suite) => suite.trim()).filter(Boolean);
  return options;
}

const sampleBakers = [
  {
    address: SAMPLE_ADDRESS,
    alias: 'QA Baker',
    stakingBalance: 1200000000000,
    externalStakedBalance: 250000000000,
    externalDelegatedBalance: 180000000000,
    numDelegators: 42,
    stakersCount: 12,
    stakedBalance: 700000000000,
    bakingPower: 950000000000,
    consensusAddress: 'tz4QaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQa',
    balance: 900000000000,
    software: { version: 'v25.0', date: '2026-06-16T11:58:56Z' }
  },
  {
    address: SAMPLE_ADDRESS_2,
    alias: 'Second Baker',
    stakingBalance: 900000000000,
    externalStakedBalance: 120000000000,
    externalDelegatedBalance: 220000000000,
    numDelegators: 35,
    stakersCount: 9,
    stakedBalance: 500000000000,
    bakingPower: 650000000000,
    consensusAddress: null,
    balance: 600000000000,
    software: { version: 'v24.4', date: '2026-04-17T10:26:39Z' }
  },
  {
    address: SAMPLE_ADDRESS_3,
    alias: 'Pending Baker',
    stakingBalance: 700000000000,
    externalStakedBalance: 100000000000,
    externalDelegatedBalance: 110000000000,
    numDelegators: 18,
    stakersCount: 6,
    stakedBalance: 420000000000,
    bakingPower: 420000000000,
    consensusAddress: null,
    balance: 500000000000,
    software: { version: 'v25.1', date: '2026-06-18T19:55:16Z' }
  }
];

const overdelegatedBaker = {
  address: OVERDELEGATED_ADDRESS,
  alias: 'Overdelegated Baker',
  active: true,
  balance: 65000000000,
  stakedBalance: 65000000000,
  stakingBalance: 695000000000,
  externalStakedBalance: 567000000000,
  externalDelegatedBalance: 630000000000,
  numDelegators: 459,
  stakersCount: 128,
  bakingPower: 695000000000,
  consensusAddress: null,
  limitOfStakingOverBaking: 9000000,
  software: { version: 'v24.4', date: '2026-04-17T10:26:39Z' }
};

function sampleHistoryRows() {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, index) => {
    const step = index + 1;
    return {
      timestamp: new Date(now - (8 - step) * 60 * 60 * 1000).toISOString(),
      tz4_percentage: 40 + step,
      staking_ratio: 28 + step / 10,
      total_bakers: 220 + step,
      tz4_power_pct: 30 + step / 2,
      tz4_power_active: 90000000 + step * 1000000,
      tz4_power_total: 300000000 + step * 1000000,
      current_issuance_rate: 3.4 + step / 100,
      protocol_issuance_rate: 3.15 + step / 1000,
      lb_issuance_rate: step > 4 ? 0 : 0.25,
      lb_ema: 1000000000 + step * 10000000,
      lb_ema_pct: 50 + step / 3,
      lb_subsidy_disabled: true,
      total_supply: 1050000000 + step * 1000,
      total_staked: 320000000 + step * 100000,
      total_delegated: 330000000 + step * 100000,
      total_baking_power: 430000000 + step * 100000,
      staking_apy_stake: 8 + step / 10,
      staking_apy_delegate: 2.6 + step / 100,
      total_burned: 2200000 + step * 100,
      tx_volume_24h: 120000 + step * 100,
      contract_calls_24h: 9000 + step * 10,
      funded_accounts: 520000 + step * 100,
      new_accounts_24h: 800 + step,
      smart_contracts: 95000 + step,
      tokens: 140000 + step,
      rollups: 18 + step,
      active_contracts_24h: 1200 + step
    };
  });
}

function sampleDomainHistoryRows(table) {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, index) => {
    const step = index + 1;
    const timestamp = new Date(now - (8 - step) * 30 * 60 * 1000).toISOString();
    if (table === 'market_history') {
      return {
        timestamp,
        source: 'coingecko',
        price_usd: 0.22 + step / 1000,
        price_eur: 0.2 + step / 1200,
        price_btc: 0.0000035 + step / 100000000,
        price_sats: 350 + step,
        market_cap_usd: 240000000 + step * 1000000,
        volume_24h_usd: 9000000 + step * 100000,
        change_24h_pct: -2 + step / 10
      };
    }
    if (table === 'network_health_history') {
      return {
        timestamp,
        head_level: 13600000 + step,
        head_timestamp: timestamp,
        sample_blocks: 16,
        health_score: 99 + step / 20,
        total_attestation_power: 111000 + step,
        total_committee_power: 112000,
        missing_attestation_power: 1000 - step,
        avg_block_seconds: 6,
        max_block_seconds: 7,
        on_target_blocks: 15,
        round_zero_pct: 99 + step / 10,
        max_round: step % 2,
        missed_blocks: step % 3,
        missed_attestation_slots: 100 - step,
        missed_attestation_rights: 10 + step
      };
    }
    if (table === 'tezosx_history') {
      return {
        timestamp,
        tvl_usd: 16000000 + step * 100000,
        tezos_l1_tvl_usd: 22000000 + step * 100000,
        tvl_share_pct: 42 + step / 3,
        transactions_24h: 300000 + step * 1000,
        total_transactions: 80000000 + step * 10000,
        total_addresses: 1500000 + step * 1000,
        active_addresses: 12000 + step * 100,
        gas_gwei: 1.5,
        average_block_time_ms: 680,
        explorer_head: 45000000 + step,
        rpc_head: 45000010 + step,
        top_protocol_tvl_usd: 9000000 + step * 10000
      };
    }
    return {
      timestamp,
      head_level: 13600000 + step,
      epoch: 90,
      period_index: 176,
      period_kind: 'cooldown',
      period_status: 'quiet',
      proposal: 'PsSmokeHistoryDigest1234567890abcdef',
      participation_pct: null,
      quorum_pct: 45,
      supermajority_pct: null,
      yay_power: 0,
      nay_power: 0,
      pass_power: 0,
      voting_power_voted: 0,
      voters_voted: 0,
      voters_total: 220,
      period_start: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      period_end: new Date(now + 24 * 60 * 60 * 1000).toISOString()
    };
  });
}

const SPARKLINE_LATEST_EXPECTATIONS = [
  ['Total Bakers', 'bakers-sparkline', 'totalBakers'],
  ['tz4 Adoption', 'tz4-sparkline', 'tz4Percentage'],
  ['Staking Ratio', 'staking-sparkline', 'stakingRatio'],
  ['Issuance Rate', 'issuance-sparkline', 'currentIssuanceRate'],
  ['Total Supply', 'supply-sparkline', 'totalSupply'],
  ['TX Volume', 'tx-volume-sparkline', 'transactionVolume24h'],
  ['Contract Calls', 'contract-calls-sparkline', 'contractCalls24h'],
  ['Funded Accounts', 'funded-accounts-sparkline', 'fundedAccounts'],
  ['New Accounts', 'new-accounts-sparkline', 'newAccounts24h'],
  ['Smart Contracts', 'smart-contracts-sparkline', 'smartContracts'],
  ['Tokens', 'tokens-sparkline', 'tokens'],
  ['Rollups', 'rollups-sparkline', 'rollups'],
  ['Active Contracts', 'active-contracts-sparkline', 'activeContracts24h']
];

async function assertAllSparklineLatestValues(page, label) {
  await page.waitForFunction((expectations) => {
    const stats = JSON.parse(localStorage.getItem('tezos-systems-stats') || 'null');
    if (!stats) return false;

    return expectations.every(([, canvasId, statKey]) => {
      const expected = Number(stats[statKey]);
      const canvas = document.getElementById(canvasId);
      const chart = canvas ? window.Chart?.getChart(canvas) : null;
      const values = chart?.data?.datasets?.[0]?.data || [];
      const actual = Number(values.at(-1));
      return Number.isFinite(expected) && chart && values.length >= 2 && Number.isFinite(actual) && Math.abs(actual - expected) <= 0.01;
    });
  }, SPARKLINE_LATEST_EXPECTATIONS, { timeout: 10000 });

  const state = await page.evaluate((expectations) => {
    const stats = JSON.parse(localStorage.getItem('tezos-systems-stats') || 'null');
    if (!stats) return { ready: false, missingStats: true, mismatches: [] };

    const mismatches = [];
    for (const [metricLabel, canvasId, statKey] of expectations) {
      const expected = Number(stats[statKey]);
      const canvas = document.getElementById(canvasId);
      const chart = canvas ? window.Chart?.getChart(canvas) : null;
      const values = chart?.data?.datasets?.[0]?.data || [];
      const actual = Number(values.at(-1));

      if (!Number.isFinite(expected) || !chart || values.length < 2 || !Number.isFinite(actual) || Math.abs(actual - expected) > 0.01) {
        mismatches.push({
          label: metricLabel,
          canvasId,
          statKey,
          expected,
          actual,
          points: values.length
        });
      }
    }

    return { ready: mismatches.length === 0, missingStats: false, mismatches };
  }, SPARKLINE_LATEST_EXPECTATIONS);
  assert(state.ready, `${label}: sparkline latest values must match live card stats:\n${JSON.stringify(state.mismatches, null, 2)}`);
}

function fulfillJson(route, data) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data)
  });
}

function fulfillText(route, body, contentType = 'text/plain') {
  return route.fulfill({ status: 200, contentType, body });
}

function pageRows(total, offset, limit, makeRow) {
  const start = Math.max(0, Number(offset) || 0);
  const count = Math.max(0, Number(limit) || 0);
  if (count === 0 || start >= total) return [];
  const end = Math.min(total, start + count);
  return Array.from({ length: end - start }, (_, index) => makeRow(start + index));
}

function smokeHeldToken(index) {
  const isHighSupply = index === 1;
  return {
    quantity: isHighSupply ? '13635916737' : 1,
    token: {
      name: isHighSupply ? 'Smoke High Supply' : `Smoke Piece ${index + 1}`,
      pk: index + 1,
      supply: isHighSupply ? '13635916737' : 10,
      fa: { name: 'Smoke Collection', contract: 'KT1SmokeSmokeSmokeSmokeSmokeSmoke12345' },
      lowest_ask: index === 0 ? 1000000 : 0
    }
  };
}

function smokeCreatedToken(index) {
  return {
    token_pk: index + 1,
    token: {
      name: `Smoke Piece ${index + 1}`,
      supply: 10,
      pk: index + 1,
      fa: { name: 'Smoke Collection', contract: 'KT1SmokeSmokeSmokeSmokeSmokeSmoke12345' },
      lowest_ask: index === 0 ? 1000000 : 0,
      listing_sales: index === 0 ? [{ price_xtz: 2500000, timestamp: new Date().toISOString() }] : []
    }
  };
}

function isoFrom(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

function sampleTeztaleBlock(level) {
  const offset = 12345678 - level;
  const timestampMs = Date.now() - 90000 - offset * 6000;
  const blockHash = `BMTeztaleSmoke${level}`;
  const successorHash = `BKTeztaleSuccessor${level}`;
  const round = level === 12345675 ? 1 : 0;
  const missingBlocks = level === 12345676
    ? [{ baking_right: { delegate: SAMPLE_ADDRESS_2, round: 0 }, sources: ['NL-vigie-mainnet-gcp'] }]
    : [];

  const baseBlock = {
    cycle_info: { cycle: 1143, cycle_position: 3000 + offset, cycle_size: 10800 },
    blocks: [{
      hash: blockHash,
      predecessor: `BMTeztalePrev${level}`,
      delegate: offset % 2 === 0 ? SAMPLE_ADDRESS : SAMPLE_ADDRESS_2,
      round,
      reception_times: [
        { source: 'NL-vigie-mainnet-gcp', validation: isoFrom(timestampMs, 900 + offset * 20), application: isoFrom(timestampMs, 1050 + offset * 20) },
        { source: 'NL-vigie-mainnet-full-gcp', validation: isoFrom(timestampMs, 1120 + offset * 20), application: isoFrom(timestampMs, 1260 + offset * 20) },
        { source: 'TF-North-America', validation: isoFrom(timestampMs, 1480 + offset * 20), application: isoFrom(timestampMs, 1630 + offset * 20) }
      ],
      timestamp: isoFrom(timestampMs, 0)
    }],
    missing_blocks: missingBlocks
  };

  if (level === 12345678) return baseBlock;

  return {
    ...baseBlock,
    endorsements: [
      {
        delegate: SAMPLE_ADDRESS,
        endorsing_power: 3500,
        operations: [
          {
            kind: 'Preendorsement',
            round,
            received_in_mempools: [
              { source: 'NL-vigie-mainnet-gcp', reception_time: isoFrom(timestampMs, 1200 + offset * 15) },
              { source: 'TF-North-America', reception_time: isoFrom(timestampMs, 1450 + offset * 15) }
            ]
          },
          {
            round,
            received_in_mempools: [
              { source: 'NL-vigie-mainnet-gcp', reception_time: isoFrom(timestampMs, 2400 + offset * 20) },
              { source: 'TF-North-America', reception_time: isoFrom(timestampMs, 2650 + offset * 20) }
            ],
            included_in_blocks: [successorHash]
          }
        ]
      },
      {
        delegate: SAMPLE_ADDRESS_2,
        endorsing_power: 2500,
        operations: [
          {
            kind: 'Preendorsement',
            round,
            received_in_mempools: [
              { source: 'NL-vigie-mainnet-gcp', reception_time: isoFrom(timestampMs, 1800 + offset * 18) }
            ]
          },
          {
            round,
            received_in_mempools: [
              { source: 'NL-vigie-mainnet-gcp', reception_time: isoFrom(timestampMs, 3100 + offset * 22) }
            ]
          }
        ]
      },
      {
        delegate: 'tz1HeldTeztaleSmoke1111111111111111111',
        endorsing_power: 700,
        operations: [
          {
            round,
            included_in_blocks: [successorHash]
          }
        ]
      },
      {
        delegate: 'tz1SilentTeztaleSmoke11111111111111111',
        endorsing_power: 300,
        operations: []
      }
    ]
  };
}

function sampleTeztaleBatch(first, last) {
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => {
    const level = first + index;
    return { level, data: sampleTeztaleBlock(level) };
  });
}

async function installFeatureMocks(context, options = {}) {
  let lbBlocksHead = 12345678;
  const blockHeadLagMs = Number(options.blockHeadLagMs) || 0;
  const etherlinkQuiet = Boolean(options.etherlinkQuiet);
  const etherlinkNullProposal = Boolean(options.etherlinkNullProposal);
  const governanceNoProposal = Boolean(options.governanceNoProposal);
  const governanceLiveVote = Boolean(options.governanceLiveVote);
  const governanceAdoptionPeriod = Boolean(options.governanceAdoptionPeriod);
  const forwardDomainAddress = options.forwardDomainAddress || SAMPLE_ADDRESS;
  const operatorAttestationSequence = Array.isArray(options.operatorAttestationSequence)
    ? options.operatorAttestationSequence
    : null;
  let operatorAttestationCalls = 0;
  const myTezosLiveRefresh = Boolean(options.myTezosLiveRefresh);
  const isDrawerOpenForRequest = async (request) => {
    if (!myTezosLiveRefresh) return false;
    try {
      return await request.frame().evaluate(() => document.querySelector('#my-tezos-drawer')?.classList.contains('open') === true);
    } catch {
      return false;
    }
  };
  const sampleAddressAccount = async (request) => {
    const fresh = await isDrawerOpenForRequest(request);
    return {
      address: SAMPLE_ADDRESS,
      type: 'delegate',
      alias: 'QA Baker',
      active: true,
      balance: fresh ? 1750000000000 : 1500000000000,
      stakedBalance: fresh ? 725000000000 : 700000000000,
      delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true },
      firstActivity: 458753,
      firstActivityTime: '2019-05-30T00:00:00Z'
    };
  };
  const sampleAddressDelegate = async (request, baker) => {
    const fresh = await isDrawerOpenForRequest(request);
    return fresh ? {
      ...baker,
      stakingBalance: 1250000000000,
      externalStakedBalance: 280000000000,
      externalDelegatedBalance: 240000000000,
      stakedBalance: 725000000000,
      balance: 950000000000
    } : baker;
  };
  const dashboardHtml = options.dashboardHtml || '';
  const dashboardPathnames = new Set(options.dashboardPathnames || []);
  const dashboardOrigin = options.baseUrl ? new URL(options.baseUrl).origin : '';
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const postData = request.postData() || '';
    const parsedUrl = new URL(url);

    if (
      dashboardHtml &&
      parsedUrl.origin === dashboardOrigin &&
      dashboardPathnames.has(parsedUrl.pathname)
    ) {
      return fulfillText(route, dashboardHtml, 'text/html');
    }

    if (url.includes('html2canvas@1.4.1')) {
      return fulfillText(route, `
        window.html2canvas = async function(element) {
          window.__lastHtml2CanvasText = String(element?.innerText || element?.textContent || '');
          const canvas = document.createElement('canvas');
          canvas.width = 600;
          canvas.height = 630;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0a0e1a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#00ff88';
          ctx.fillRect(24, 24, 552, 12);
          return canvas;
        };
      `, 'application/javascript');
    }

    for (const table of ['market_history', 'network_health_history', 'tezosx_history', 'governance_period_history']) {
      if (url.includes(`iijpfczftroespicmufb.supabase.co/rest/v1/${table}`)) {
        return fulfillJson(route, sampleDomainHistoryRows(table));
      }
    }

    if (url.includes('iijpfczftroespicmufb.supabase.co/rest/v1/tezos_history')) {
      return fulfillJson(route, sampleHistoryRows());
    }

    if (url.includes('api.github.com/repos/Primate411/tezos.systems/commits/main')) {
      return fulfillJson(route, {
        sha: 'cafebabecafebabecafebabecafebabecafebabe',
        html_url: 'https://github.com/Primate411/tezos.systems/commit/cafebabe',
        commit: { committer: { date: '2026-06-07T00:00:00Z' } }
      });
    }

    if (url.includes('teztale-server-mainnet-ro-prd.octez.tech')) {
      const pathname = parsedUrl.pathname.replace(/^\/+/, '');
      if (pathname === 'head.json') {
        return fulfillJson(route, { level: 12345678 });
      }
      const rangeMatch = pathname.match(/^(\d+)-(\d+)\.json$/);
      if (rangeMatch) {
        return fulfillJson(route, sampleTeztaleBatch(Number(rangeMatch[1]), Number(rangeMatch[2])));
      }
      const blockMatch = pathname.match(/^(\d+)\.json$/);
      if (blockMatch) {
        return fulfillJson(route, sampleTeztaleBlock(Number(blockMatch[1])));
      }
      if (pathname.endsWith('/available.json')) return fulfillJson(route, []);
      if (pathname.endsWith('/missing.json')) return fulfillJson(route, []);
    }

    if (url.includes('api.tezos.domains/graphql')) {
      return fulfillJson(route, {
        data: {
          domain: { address: forwardDomainAddress },
          reverseRecord: { domain: { name: 'qa-baker.tez' } }
        }
      });
    }

    if (url.includes('data.objkt.com/v3/graphql')) {
      if (postData.includes('holder(')) {
        const body = JSON.parse(postData || '{}');
        const vars = body.variables || {};
        return fulfillJson(route, {
          data: {
            holder: [{
              address: SAMPLE_ADDRESS,
              alias: 'QA Artist',
              tzdomain: 'qa-artist.tez',
              held_tokens: pageRows(501, vars.heldOffset, vars.heldLimit, smokeHeldToken),
              created_tokens: pageRows(501, vars.createdOffset, vars.createdLimit, smokeCreatedToken),
              fa2s_created: pageRows(1, vars.collectionOffset, vars.collectionLimit, () => ({
                name: 'Smoke Collection',
                contract: 'KT1SmokeSmokeSmokeSmokeSmokeSmoke12345',
                items: 10,
                volume_total: 2500000,
                floor_price: 1000000,
                owners: 3
              })),
              listings_sold: pageRows(1, vars.soldOffset, vars.soldLimit, () => ({ price_xtz: 2500000, timestamp: new Date().toISOString() })),
              listings_bought: pageRows(1, vars.boughtOffset, vars.boughtLimit, () => ({ price_xtz: 1000000, timestamp: new Date().toISOString() })),
              sales_stats: [{ type: 'creator', volume: 2500000, interval_days: null }]
            }]
          }
        });
      }
      return fulfillJson(route, { data: { token: [] } });
    }

    if (url.includes('api.coingecko.com/api/v3/simple/price')) {
      return fulfillJson(route, {
        tezos: {
          usd: 0.74,
          eur: 0.69,
          btc: 0.000007,
          usd_24h_change: 2.5,
          usd_market_cap: 780000000,
          usd_24h_vol: 18000000
        }
      });
    }

    if (url.includes('api.coingecko.com/api/v3/coins/tezos')) {
      return fulfillJson(route, { market_data: { price_change_percentage_7d: 4.2 } });
    }

    if (url.includes('api.llama.fi/v2/chains')) {
      return fulfillJson(route, [
        { name: 'Etherlink', tvl: 18148091.5, chainId: 42793 },
        { name: 'Tezos', tvl: 22493581.69, chainId: null }
      ]);
    }

    if (url.includes('api.llama.fi/v2/historicalChainTvl/Etherlink')) {
      return fulfillJson(route, Array.from({ length: 31 }, (_, index) => ({
        date: Math.floor((Date.now() - (30 - index) * 86400000) / 1000),
        tvl: 15000000 + index * 104000
      })));
    }

    if (url.includes('api.llama.fi/protocols')) {
      return fulfillJson(route, [
        { name: 'Curve DEX', slug: 'curve-dex', category: 'Dexs', chainTvls: { Etherlink: 10014648.09 } },
        { name: 'Spiko', slug: 'spiko', category: 'RWA', chainTvls: { Etherlink: 9090824.44 } },
        { name: 'Morpho Blue', slug: 'morpho-blue', category: 'Lending', chainTvls: { Etherlink: 3559007.6 } },
        { name: 'Youves', slug: 'youves', category: 'CDP', chainTvls: { Tezos: 12000000 } }
      ]);
    }

    if (url.includes('explorer.etherlink.com/api/v2/stats/charts/transactions')) {
      return fulfillJson(route, {
        chart_data: Array.from({ length: 30 }, (_, index) => ({
          date: new Date(Date.now() - (29 - index) * 86400000).toISOString().slice(0, 10),
          transactions: 52000 + index * 840
        }))
      });
    }

    if (url.includes('explorer.etherlink.com/api/v2/stats/charts/active-accounts')) {
      return fulfillJson(route, Array.from({ length: 30 }, (_, index) => ({
        date: new Date(Date.now() - (29 - index) * 86400000).toISOString().slice(0, 10),
        active_accounts: 4100 + index * 55
      })));
    }

    if (url.includes('explorer.etherlink.com/api/v2/stats')) {
      return fulfillJson(route, {
        average_block_time: 2970,
        gas_prices: { slow: 0.88, average: 0.88, fast: 0.89 },
        gas_price_updated_at: new Date().toISOString(),
        total_addresses: '1595409',
        total_blocks: '44808895',
        total_transactions: '81004089',
        transactions_today: '87656',
        tvl: null
      });
    }

    if (url.includes('explorer.etherlink.com/api/v2/tokens')) {
      return fulfillJson(route, {
        items: [
          { symbol: 'USDC.e', name: 'Bridged USDC', holders_count: '18420' },
          { symbol: 'WXTZ', name: 'Wrapped XTZ', holders_count: '12920' },
          { symbol: 'YOU', name: 'Youves Governance', holders_count: '3110' }
        ]
      });
    }

    if (url.includes('explorer.etherlink.com/api/v2/transactions')) {
      return fulfillJson(route, {
        items: [
          {
            hash: '0xSmokeTx111111111111111111111111111111111111111111111111111111111111',
            method: 'credit',
            status: 'ok',
            fee: { type: 'actual', value: '953130000000000' },
            timestamp: new Date(Date.now() - 4000).toISOString(),
            block_number: 44808895,
            from: { hash: '0x6e311Afe9dc3Be21D6f4Ef4Ea913C14dc9470391', name: null },
            to: { hash: '0x0c532e1e916219007f244e2d8Ef46f8530Ec75DE', name: 'Bankroll' }
          },
          {
            hash: '0xSmokeTx222222222222222222222222222222222222222222222222222222222222',
            method: 'swap',
            status: 'ok',
            fee: { type: 'actual', value: '800000000000000' },
            timestamp: new Date(Date.now() - 9000).toISOString(),
            block_number: 44808894,
            from: { hash: '0xa76d2FdB56bD95707BFF83a55A3400630D093d64', name: null },
            to: { hash: '0x0000000000000000000000000000000000000001', name: 'Smoke DEX' }
          }
        ]
      });
    }

    if (url.includes('node.mainnet.etherlink.com')) {
      if (postData.includes('eth_blockNumber')) return fulfillJson(route, { jsonrpc: '2.0', id: 1, result: '0x2abbd5f' });
      if (postData.includes('eth_gasPrice')) return fulfillJson(route, { jsonrpc: '2.0', id: 1, result: '0x3b9aca00' });
      return fulfillJson(route, { jsonrpc: '2.0', id: 1, result: null });
    }

    if (url.includes('eu.rpc.tez.capital')) {
      if (url.includes('/context/issuance/current_yearly_rate')) return fulfillText(route, '4.5');
      if (url.includes('/context/total_supply')) return fulfillText(route, '1050000000000000');
      if (url.includes('/context/total_frozen_stake')) return fulfillText(route, '305000000000000');
      if (url.includes('/context/delegates?active=true')) return fulfillJson(route, [SAMPLE_ADDRESS, SAMPLE_ADDRESS_2]);
      if (url.includes('/context/constants')) {
        return fulfillJson(route, {
          blocks_per_cycle: 10800,
          minimal_block_delay: '6',
          consensus_committee_size: 7000,
          liquidity_baking_subsidy: '2500000'
        });
      }
      if (url.includes('/helpers/current_level')) {
        return fulfillJson(route, { level: 12345678, cycle: 1143, cycle_position: 1234 });
      }
      if (url.includes('/metadata')) {
        return fulfillJson(route, { level_info: { cycle: 1143, cycle_position: 1234 } });
      }
      if (url.includes('/header')) {
        return fulfillJson(route, { level: 12345678, timestamp: new Date().toISOString() });
      }
      if (url.includes('/dal_participation')) {
        return fulfillJson(route, {
          expected_assigned_shards_per_slot: 214,
          delegate_attested_dal_slots: 14,
          delegate_attestable_dal_slots: 14,
          expected_dal_rewards: '277986',
          sufficient_dal_participation: true,
          denounced: false
        });
      }
      if (url.includes('/participation')) {
        return fulfillJson(route, { expected_cycle_activity: 7000, minimal_cycle_activity: 5600, missed_slots: 0, missed_levels: 0 });
      }
    }

    if (url.includes('api.tzkt.io/v1')) {
      if (url.includes('/contracts/KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2/storage')) {
        return fulfillJson(route, {
          drift: '0',
          ovens: 20919,
          target: '0',
          metadata: 20918,
          cfmm_address: 'KT1SmokeCtezCfmm1111111111111111111',
          ctez_fa12_address: 'KT1SmokeCtezFa1211111111111111111',
          last_drift_update: new Date().toISOString()
        });
      }
      if (url.includes('/bigmaps/20919/keys')) {
        const owner = parsedUrl.searchParams.get('key.owner') || '';
        if (owner !== SAMPLE_ADDRESS) return fulfillJson(route, []);
        return fulfillJson(route, [
          {
            key: { id: '42', owner: SAMPLE_ADDRESS },
            value: {
              address: 'KT1SmokeCtezOvenDebt1111111111111111',
              tez_balance: '6543210',
              ctez_outstanding: '123456'
            },
            lastLevel: 12345678
          },
          {
            key: { id: '43', owner: SAMPLE_ADDRESS },
            value: {
              address: 'KT1SmokeCtezOvenReady111111111111111',
              tez_balance: '987654',
              ctez_outstanding: '0'
            },
            lastLevel: 12345679
          }
        ]);
      }
      if (url.includes('/statistics/cyclic')) {
        const latestStart = Date.now() - 10 * 60 * 1000;
        const intervals = [67000, 64500, 65200, 64800, 65100, 64700, 64900];
        let elapsed = 0;
        return fulfillJson(route, Array.from({ length: 8 }, (_, index) => {
          if (index > 0) elapsed += intervals[index - 1];
          return {
            cycle: 1144 - index,
            level: 12345678 - index * 10800,
            timestamp: new Date(latestStart - elapsed * 1000).toISOString()
          };
        }));
      }
      if (url.includes('/statistics/current')) {
        return fulfillJson(route, {
          totalSupply: 1050000000000000,
          totalFrozen: 295000000000000,
          totalOwnStaked: 190000000000000,
          totalExternalStaked: 100000000000000,
          totalOwnDelegated: 80000000000000,
          totalExternalDelegated: 170000000000000,
          burnedSupply: 600000000000,
          totalBootstrapped: 1050000000000000
        });
      }
      if (url.includes('/head')) {
        return fulfillJson(route, { level: 12345678, cycle: 1143, protocol: 'PtTALLiNQATEST' });
      }
      if (/\/blocks\/[^/]+\/level/.test(url)) {
        return fulfillJson(route, 12344000);
      }
      if (url.includes('/blocks?')) {
        const params = new URL(url).searchParams;
        const requestedLimit = Number(params.get('limit')) || 4;
        const count = Math.max(1, Math.min(requestedLimit, 20));
        const now = Date.now() - blockHeadLagMs;
        const head = lbBlocksHead++;
        const producers = [
          { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
          { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
          { address: 'tz1PassPassPassPassPassPassPassPassP', alias: 'Pass Baker' },
          { address: 'tz1OffOffOffOffOffOffOffOffOffOf', alias: 'Off Baker' }
        ];
        const toggles = [false, true, null, false];
        return fulfillJson(route, Array.from({ length: count }, (_, index) => {
          const producer = producers[index % producers.length];
          const lag = index * 6000 + (index >= 3 ? 2000 : 0);
          const power = index === 2 ? 6920 : (index === 0 ? 6988 : 7000);
          return {
            level: head - index,
            timestamp: new Date(now - lag).toISOString(),
            producer,
            proposer: producer,
            attestationPower: power,
            attestationCommittee: 7000,
            payloadRound: index === 2 ? 1 : 0,
            blockRound: index === 2 ? 1 : 0,
            lbToggle: toggles[index % toggles.length],
            lbToggleEma: 1030000000 - index * 500000
          };
        }));
      }
      if (url.includes('/protocols/current')) {
        return fulfillJson(route, { code: 21, alias: 'Tallinn', metadata: { alias: 'Tallinn' } });
      }
      if (url.endsWith('/protocols') || url.includes('/protocols?')) {
        return fulfillJson(route, [
          { code: 4, extras: { alias: 'Athens' } },
          { code: 5, extras: { alias: 'Babylon' } },
          { code: 6, extras: { alias: 'Carthage' } },
          { code: 7, extras: { alias: 'Delphi' } },
          { code: 8, extras: { alias: 'Edo' } },
          { code: 9, extras: { alias: 'Florence' } },
          { code: 10, extras: { alias: 'Granada' } },
          { code: 11, extras: { alias: 'Hangzhou' } },
          { code: 12, extras: { alias: 'Ithaca' } },
          { code: 13, extras: { alias: 'Jakarta' } },
          { code: 14, extras: { alias: 'Kathmandu' } },
          { code: 15, extras: { alias: 'Lima' } },
          { code: 16, extras: { alias: 'Mumbai' } },
          { code: 17, extras: { alias: 'Nairobi' } },
          { code: 18, extras: { alias: 'Oxford' } },
          { code: 19, extras: { alias: 'Paris' } },
          { code: 20, extras: { alias: 'Quebec' } },
          { code: 21, extras: { alias: 'Tallinn' } }
        ]);
      }
      if (url.includes('/delegates/count?active=true')) return fulfillJson(route, sampleBakers.length);
      if (url.includes('/delegates?active=true') && url.includes('select=') && url.includes('bakingPower')) return fulfillJson(route, sampleBakers);
      if (url.includes('/delegates?active=true&limit=')) return fulfillJson(route, sampleBakers.map((b) => b.address));
      if (url.includes('/rights?')) {
        const rights = new URL(url).searchParams;
        const type = rights.get('type');
        if (type === 'attestation' && rights.get('status') === 'missed') {
          return fulfillJson(route, [
            { level: 12345678, timestamp: new Date(Date.now() - 1000).toISOString(), slots: 7, status: 'missed', type: 'attestation', baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } },
            { level: 12345677, timestamp: new Date(Date.now() - 7000).toISOString(), slots: 3, status: 'missed', type: 'attestation', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } },
            { level: 12345676, timestamp: new Date(Date.now() - 13000).toISOString(), slots: 2, status: 'missed', type: 'attestation', baker: { address: 'tz1MissMissMissMissMissMissMissMis', alias: 'Missed Attester' } }
          ]);
        }
        if (type === 'baking' && rights.get('status') === 'missed') {
          return fulfillJson(route, [
            { level: 12345660, timestamp: new Date(Date.now() - 120000).toISOString(), round: 0, status: 'missed', type: 'baking', baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } }
          ]);
        }
        if (type === 'baking' && rights.get('status') === 'future') {
          if (rights.get('round') !== '0') {
            return fulfillJson(route, [
              { level: 12345698, cycle: 1143, round: 5, status: 'future', type: 'baking', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } }
            ]);
          }
          return fulfillJson(route, [
            { level: 12345858, cycle: 1143, round: 0, status: 'future', type: 'baking', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } }
          ]);
        }
        if (type === 'baking') {
          if (rights.get('round') !== '0') {
            return fulfillJson(route, [
              { level: 12345670, cycle: 1143, round: 5, status: 'missed', type: 'baking', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } }
            ]);
          }
          return fulfillJson(route, [
            { level: 12345540, cycle: 1143, round: 0, status: 'missed', type: 'baking', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } }
          ]);
        }
        const statusSpec = operatorAttestationSequence
          ? operatorAttestationSequence[Math.min(operatorAttestationCalls++, operatorAttestationSequence.length - 1)]
          : 'realized';
        return fulfillJson(route, Array.from({ length: 10 }, (_, index) => ({
          level: 12345670 - index,
          timestamp: new Date(Date.now() - index * 6000).toISOString(),
          slots: 1,
          status: Array.isArray(statusSpec)
            ? statusSpec[Math.min(index, statusSpec.length - 1)]
            : statusSpec,
          type: 'attestation',
          baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
        })));
      }
      if (url.includes('/rights/count?')) return fulfillText(route, '0');
      if (url.includes('/operations/update_consensus_key')) {
        return fulfillJson(route, [
          {
            level: 12000000,
            timestamp: new Date(Date.now() - 14 * 86400000).toISOString(),
            sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            publicKey: 'BLpkSmokeActiveConsensusKey111111111111111111111111111111111111111111111111',
            publicKeyHash: 'tz4QaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQa',
            activationCycle: 1136,
            status: 'applied'
          },
          {
            level: 12345000,
            timestamp: new Date(Date.now() - 1 * 86400000).toISOString(),
            sender: { address: SAMPLE_ADDRESS_3, alias: 'Pending Baker' },
            publicKey: 'BLpkSmokePendingConsensusKey1111111111111111111111111111111111111111111111',
            publicKeyHash: 'tz4PendingPendingPendingPendingPendingPend',
            activationCycle: 1148,
            status: 'applied'
          }
        ]);
      }
      if (url.includes('/contracts?') && url.includes('creator=tz1VGpuq8GkCwf4x6MupTz6QAcJLivQcaAsb')) {
        return fulfillJson(route, [
          { address: ETHERLINK_SEQUENCER_CONTRACT, kind: 'smart_contract', firstActivity: 13171350 },
          { address: ETHERLINK_FAST_CONTRACT, kind: 'smart_contract', firstActivity: 13171346 },
          { address: ETHERLINK_SLOW_CONTRACT, kind: 'smart_contract', firstActivity: 13171342 }
        ]);
      }
      if (url.includes(`/contracts/${ETHERLINK_FAST_CONTRACT}/storage`)) {
        return fulfillJson(route, {
          config: {
            started_at_level: '10419200',
            period_length: '4800',
            proposal_quorum: '5',
            promotion_quorum: '15',
            promotion_supermajority: '80'
          },
          last_winner: null,
          voting_context: etherlinkQuiet ? null : {
            period_index: '401',
            total_voting_power: '656635662773932',
            period: {
              proposal: {
                proposals: ETHERLINK_PROPOSALS_BIGMAP,
                upvoters_proposals: ETHERLINK_UPVOTERS_BIGMAP,
                upvoters_upvotes_count: ETHERLINK_UPVOTE_COUNTS_BIGMAP,
                winner_candidate: etherlinkNullProposal ? null : ETHERLINK_FAST_PROPOSAL,
                total_voting_power: '656635662773932',
                max_upvotes_voting_power: etherlinkNullProposal ? '0' : '93213811256339'
              }
            }
          }
        });
      }
      if (url.includes(`/contracts/${ETHERLINK_SLOW_CONTRACT}/storage`)) {
        return fulfillJson(route, {
          config: {
            started_at_level: '10454078',
            period_length: '67200',
            proposal_quorum: '1',
            promotion_quorum: '5',
            promotion_supermajority: '75'
          },
          last_winner: null,
          voting_context: null
        });
      }
      if (url.includes(`/contracts/${ETHERLINK_SEQUENCER_CONTRACT}/storage`)) {
        return fulfillJson(route, {
          config: {
            started_at_level: '10454078',
            period_length: '67200',
            proposal_quorum: '1',
            promotion_quorum: '8',
            promotion_supermajority: '75'
          },
          last_winner: null,
          voting_context: null
        });
      }
      if (url.includes(`/bigmaps/${ETHERLINK_PROPOSALS_BIGMAP}/keys`)) {
        if (etherlinkNullProposal) return fulfillJson(route, []);
        return fulfillJson(route, [
          {
            key: ETHERLINK_FAST_PROPOSAL,
            firstLevel: 12343010,
            lastLevel: 12345600,
            value: {
              proposers: [SAMPLE_ADDRESS],
              upvotes_voting_power: '93213811256339'
            }
          }
        ]);
      }
      if (url.includes(`/bigmaps/${ETHERLINK_UPVOTERS_BIGMAP}/keys`)) {
        if (etherlinkNullProposal) return fulfillJson(route, []);
        return fulfillJson(route, [
          { firstLevel: 12343020, key: { key_hash: SAMPLE_ADDRESS, bytes: ETHERLINK_FAST_PROPOSAL }, value: null },
          { firstLevel: 12343720, key: { key_hash: SAMPLE_ADDRESS_2, bytes: ETHERLINK_FAST_PROPOSAL }, value: null },
          { firstLevel: 12344420, key: { key_hash: SAMPLE_ADDRESS_3, bytes: ETHERLINK_FAST_PROPOSAL }, value: null }
        ]);
      }
      if (url.includes(`/bigmaps/${ETHERLINK_UPVOTE_COUNTS_BIGMAP}/keys`)) {
        return fulfillJson(route, [
          { key: SAMPLE_ADDRESS, value: '1', firstLevel: 12343020 },
          { key: SAMPLE_ADDRESS_2, value: '1', firstLevel: 12343720 }
        ]);
      }
      if (url.includes('/operations/transactions?') && url.includes('targetCodeHash.in=') && url.includes('entrypoint=new_proposal')) {
        return fulfillJson(route, [
          {
            id: 5010,
            hash: 'opEtherlinkHistoricalFast111111111111111111111',
            level: 12345610,
            timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
            targetCodeHash: 1029816579,
            parameter: { entrypoint: 'new_proposal', value: ETHERLINK_FAST_PROPOSAL }
          },
          {
            id: 5009,
            hash: 'opEtherlinkHistoricalFastOlder1111111111111111',
            level: 12342000,
            timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
            targetCodeHash: 1029816579,
            parameter: { entrypoint: 'new_proposal', value: ETHERLINK_FAST_OLDER_PROPOSAL }
          },
          {
            id: 5008,
            hash: 'opEtherlinkHistoricalSlow111111111111111111111',
            level: 12330000,
            timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS_3, alias: 'Pending Baker' },
            target: { address: ETHERLINK_SLOW_CONTRACT, alias: 'Etherlink SLOW governance' },
            targetCodeHash: 2062495254,
            parameter: { entrypoint: 'new_proposal', value: ETHERLINK_SLOW_PROPOSAL }
          },
          {
            id: 5007,
            hash: 'opEtherlinkHistoricalSequencer11111111111111',
            level: 12320000,
            timestamp: new Date(Date.now() - 8 * 3600000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            target: { address: ETHERLINK_SEQUENCER_CONTRACT, alias: 'Etherlink Sequencer governance' },
            targetCodeHash: 368151125,
            parameter: { entrypoint: 'new_proposal', value: ETHERLINK_SEQUENCER_PROPOSAL }
          }
        ]);
      }
      if (url.includes('/accounts?') && url.includes('address.in=')) {
        const params = new URL(url).searchParams;
        const requested = (params.get('address.in') || '').split(',').filter(Boolean);
        const aliases = new Map([
          [SAMPLE_ADDRESS, 'QA Baker'],
          [SAMPLE_ADDRESS_2, 'Second Baker'],
          [SAMPLE_ADDRESS_3, 'Pending Baker']
        ]);
        return fulfillJson(route, requested.map((address) => ({ address, alias: aliases.get(address) || null })));
      }
      if (url.includes('/operations/transactions?') && url.includes(`target=${ETHERLINK_FAST_CONTRACT}`)) {
        return fulfillJson(route, [
          {
            id: 4011,
            hash: 'opEtherlinkFastUpvote111111111111111111111111111',
            level: 12345600,
            timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
            parameter: { entrypoint: 'upvote', value: ETHERLINK_FAST_PROPOSAL }
          },
          {
            id: 4010,
            hash: 'opEtherlinkFastSubmit111111111111111111111111',
            level: 12343010,
            timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
            status: 'applied',
            sender: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            target: { address: ETHERLINK_FAST_CONTRACT, alias: 'Etherlink FAST governance' },
            parameter: { entrypoint: 'new_proposal', value: ETHERLINK_FAST_PROPOSAL }
          }
        ]);
      }
      if (url.includes('/operations/transactions?') && (url.includes(`target=${ETHERLINK_SLOW_CONTRACT}`) || url.includes(`target=${ETHERLINK_SEQUENCER_CONTRACT}`))) {
        return fulfillJson(route, []);
      }
      if (url.includes('/operations/transactions/count')) return fulfillJson(route, 12345);
      if (url.includes('/operations/transactions?')) {
        return fulfillJson(route, [{
          id: 1,
          hash: 'opSmokeWhale',
          timestamp: new Date().toISOString(),
          amount: 2500000000,
          status: 'applied',
          sender: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
          target: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }
        }]);
      }
      if (url.includes('/operations/delegations?') && url.includes(`newDelegate=${SAMPLE_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            id: 10,
            timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
            sender: { address: SAMPLE_ADDRESS_2, alias: 'Fresh Delegator' },
            newDelegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            prevDelegate: null
          }
        ]);
      }
      if (url.includes('/operations/delegations?')) return fulfillJson(route, []);
      if (url.includes('/operations/staking?') && url.includes(`baker=${SAMPLE_ADDRESS}`) && url.includes('action=stake')) {
        return fulfillJson(route, [
          {
            id: 20,
            timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),
            sender: { address: 'tz1SmokeStaker1111111111111111111111111', alias: 'Fresh Staker' },
            baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            amount: 125000000,
            action: 'stake'
          }
        ]);
      }
      if (url.includes('/operations/staking?')) return fulfillJson(route, []);
      if (url.includes(`/accounts/${OVERDELEGATED_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: OVERDELEGATED_ADDRESS,
          type: 'delegate',
          alias: 'Overdelegated Baker',
          active: true,
          balance: 65000000000,
          stakedBalance: 65000000000,
          delegate: { address: OVERDELEGATED_ADDRESS, alias: 'Overdelegated Baker', active: true },
          firstActivity: 458753,
          firstActivityTime: '2019-05-30T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, await sampleAddressAccount(request));
      }
      if (url.includes(`/accounts/${SAMPLE_ADDRESS_2}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_ADDRESS_2,
          type: 'delegate',
          alias: 'Second Baker',
          active: true,
          balance: 600000000000,
          stakedBalance: 500000000000,
          delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker', active: true },
          firstActivity: 458753,
          firstActivityTime: '2019-05-30T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_DELEGATOR_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_DELEGATOR_ADDRESS,
          type: 'user',
          alias: 'Malicious Sheep',
          active: true,
          balance: 42000000000,
          stakedBalance: 0,
          delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true },
          firstActivity: 6422529,
          firstActivityTime: '2024-11-19T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_REGULAR_DELEGATOR_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_REGULAR_DELEGATOR_ADDRESS,
          type: 'user',
          alias: 'Regular Delegator',
          active: true,
          balance: 256243269312,
          stakedBalance: 0,
          delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true },
          firstActivity: 6123456,
          firstActivityTime: '2024-07-15T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_SMALL_DELEGATOR_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_SMALL_DELEGATOR_ADDRESS,
          type: 'user',
          alias: 'Small Delegator',
          active: true,
          balance: 6915950133,
          stakedBalance: 0,
          delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker', active: true },
          firstActivity: 5123456,
          firstActivityTime: '2023-10-09T00:00:00Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_STAKER_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_STAKER_ADDRESS,
          type: 'user',
          alias: 'Staked Visitor',
          active: true,
          balance: 2610075826,
          stakedBalance: 2085602892,
          delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true },
          firstActivity: 1388526,
          firstActivityTime: '2021-03-17T10:50:09Z'
        });
      }
      if (url.includes(`/accounts/${SAMPLE_HEAVY_STAKER_ADDRESS}`) && !url.includes('/operations?')) {
        return fulfillJson(route, {
          address: SAMPLE_HEAVY_STAKER_ADDRESS,
          type: 'user',
          alias: 'Mostly Staked Visitor',
          active: true,
          balance: 199382376272,
          stakedBalance: 199362178211,
          delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker', active: true },
          firstActivity: 5544332,
          firstActivityTime: '2024-02-20T00:00:00Z'
        });
      }
      if (url.includes(`/rewards/stakers/${SAMPLE_REGULAR_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/bakers/${SAMPLE_REGULAR_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/delegators/${SAMPLE_REGULAR_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            cycle: 1143,
            delegatedBalance: 256243269312,
            baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            bakerRewards: {
              externalDelegatedBalance: 2562432693120,
              blockRewardsDelegated: 6000000,
              attestationRewardsDelegated: 3000000,
              dalAttestationRewardsDelegated: 1000000
            }
          },
          {
            cycle: 1142,
            delegatedBalance: 256243269312,
            baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
            bakerRewards: {
              externalDelegatedBalance: 2562432693120,
              blockRewardsDelegated: 3000000,
              attestationRewardsDelegated: 2000000,
              dalAttestationRewardsDelegated: 0
            }
          }
        ]);
      }
      if (url.includes(`/rewards/stakers/${SAMPLE_SMALL_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/bakers/${SAMPLE_SMALL_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/delegators/${SAMPLE_SMALL_DELEGATOR_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            cycle: 1143,
            delegatedBalance: 6915950133,
            baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            bakerRewards: {
              externalDelegatedBalance: 69159501330,
              blockRewardsDelegated: 3000000,
              attestationRewardsDelegated: 1200000,
              dalAttestationRewardsDelegated: 0
            }
          },
          {
            cycle: 1142,
            delegatedBalance: 6915950133,
            baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            bakerRewards: {
              externalDelegatedBalance: 69159501330,
              blockRewardsDelegated: 1000000,
              attestationRewardsDelegated: 200000,
              dalAttestationRewardsDelegated: 0
            }
          }
        ]);
      }
      if (url.includes(`/rewards/stakers/${SAMPLE_STAKER_ADDRESS}`)) {
        return fulfillJson(route, [
          { cycle: 1143, baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, initialStake: 2085435252, finalStake: 2085602892, rewards: 167640 },
          { cycle: 1142, baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, initialStake: 2084981785, finalStake: 2085435252, rewards: 453467 },
          { cycle: 1141, baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, initialStake: 2084517277, finalStake: 2084981785, rewards: 464508 }
        ]);
      }
      if (url.includes(`/rewards/bakers/${SAMPLE_STAKER_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/delegators/${SAMPLE_STAKER_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            cycle: 1143,
            delegatedBalance: 524341384,
            bakerRewards: {
              externalDelegatedBalance: 33538225605649,
              blockRewardsDelegated: 1017848222,
              attestationRewardsDelegated: 1156300055,
              dalAttestationRewardsDelegated: 257256945
            }
          }
        ]);
      }
      if (url.includes(`/rewards/stakers/${SAMPLE_HEAVY_STAKER_ADDRESS}`)) {
        return fulfillJson(route, [
          { cycle: 1143, baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }, initialStake: 199345572778, finalStake: 199362178211, rewards: 16605433 },
          { cycle: 1142, baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }, initialStake: 199309175613, finalStake: 199345572778, rewards: 36397165 },
          { cycle: 1141, baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }, initialStake: 199270967036, finalStake: 199309175613, rewards: 38208577 }
        ]);
      }
      if (url.includes(`/rewards/bakers/${SAMPLE_HEAVY_STAKER_ADDRESS}`)) {
        return fulfillJson(route, []);
      }
      if (url.includes(`/rewards/delegators/${SAMPLE_HEAVY_STAKER_ADDRESS}`)) {
        return fulfillJson(route, [
          {
            cycle: 1143,
            delegatedBalance: 20197488,
            baker: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' },
            bakerRewards: {
              externalDelegatedBalance: 3203106679689,
              blockRewardsDelegated: 99584197,
              attestationRewardsDelegated: 0,
              dalAttestationRewardsDelegated: 0
            }
          }
        ]);
      }
      if (url.includes('/rewards/delegators/') || url.includes('/rewards/bakers/')) {
        return fulfillJson(route, [
          {
            cycle: 1143,
            blockRewardsStakedOwn: 6000000,
            attestationRewardsStakedOwn: 3000000,
            dalAttestationRewardsStakedOwn: 0,
            blockFees: 100000
          }
        ]);
      }
      if (url.includes('/accounts?balance.ge=')) {
        return fulfillJson(route, [
          { address: SAMPLE_ADDRESS, balance: 1500000000000, lastActivity: '2023-01-01T00:00:00Z' },
          { address: SAMPLE_ADDRESS_2, balance: 1250000000000, lastActivity: null }
        ]);
      }
      if (url.includes('/accounts/') && url.includes('/operations?')) return fulfillJson(route, []);
      if (url.includes('/accounts/count')) return fulfillJson(route, 520000);
      if (url.includes('/contracts/count')) return fulfillJson(route, 95000);
      if (url.includes('/tokens/count')) return fulfillJson(route, 140000);
      if (url.includes('/smart_rollups?')) {
        return fulfillJson(route, [
          {
            address: 'sr1SmokeRollup111111111111111111111111111',
            alias: 'Tezos X rollup',
            lastCommitmentLevel: 12345000,
            inboxLevel: 12345610,
            lastActivityTime: new Date(Date.now() - 180000).toISOString()
          }
        ]);
      }
      if (url.includes('/smart_rollups/count')) return fulfillJson(route, 18);
      if (url.includes('/operations/ballots?')) {
        return fulfillJson(route, [
          { id: 1, timestamp: new Date(Date.now() - 11 * 3600000).toISOString(), votingPower: 5000, vote: 'yay', delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } },
          { id: 2, timestamp: new Date(Date.now() - 9 * 3600000).toISOString(), votingPower: 2500, vote: 'pass', delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } }
        ]);
      }
      if (url.includes('/voting/periods/173/voters')) {
        return fulfillJson(route, [
          { status: 'voted_yay', votingPower: 6000, delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } },
          { status: 'voted_pass', votingPower: 1500, delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } }
        ]);
      }
      if (url.includes('/voting/periods?')) {
        return fulfillJson(route, [
          { firstLevel: 458753, kind: 'proposal' },
          { firstLevel: 5726209, kind: 'promotion' }
        ]);
      }
      if (url.includes('/voting/proposals?')) {
        return fulfillJson(route, [
          {
            hash: 'PtSmokeProposal',
            status: 'accepted',
            extras: { alias: 'Smoke' },
            initiator: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }
          }
        ]);
      }
      if (url.includes('/voting/periods/current/voters')) {
        if (governanceLiveVote) {
          return fulfillJson(route, [
            { status: 'voted_yay', votingPower: 6000, delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } },
            { status: 'voted_pass', votingPower: 1500, delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } }
          ]);
        }
        return fulfillJson(route, []);
      }
      if (url.includes('/voting/periods/current')) {
        const start = new Date(Date.now() - 3600000).toISOString();
        const end = new Date(Date.now() + 2 * 86400000 + 21 * 3600000 + 21 * 60000).toISOString();
        if (governanceNoProposal) {
          return fulfillJson(route, {
            index: 172,
            kind: 'proposal',
            status: 'active',
            epoch: 91,
            firstLevel: 12340000,
            lastLevel: 12350800,
            startTime: start,
            endTime: end,
            proposalsCount: 0,
            totalVotingPower: 12000
          });
        }
        if (governanceLiveVote) {
          return fulfillJson(route, {
            index: 173,
            kind: 'promotion',
            status: 'active',
            epoch: 91,
            firstLevel: 12340000,
            lastLevel: 12350800,
            startTime: start,
            endTime: end,
            totalVotingPower: 12000,
            ballotsQuorum: 50,
            supermajority: 80,
            yayVotingPower: 6000,
            passVotingPower: 1500,
            nayVotingPower: 0,
            yayBallots: 1,
            passBallots: 1,
            nayBallots: 0,
            ballotsCount: 2,
            proposalHash: 'PtSmokeProposal',
            proposal: { hash: 'PtSmokeProposal', alias: 'Smoke' }
          });
        }
        if (governanceAdoptionPeriod) {
          return fulfillJson(route, {
            index: 175,
            kind: 'adoption',
            status: 'active',
            epoch: 91,
            firstLevel: 12350801,
            lastLevel: 12361600,
            startTime: start,
            endTime: end,
            totalVotingPower: 12000,
            proposalHash: 'PtSmokeProposal',
            proposal: { hash: 'PtSmokeProposal', alias: 'Smoke' }
          });
        }
        return fulfillJson(route, {
          index: 174,
          kind: 'testing',
          status: 'active',
          epoch: 91,
          firstLevel: 12340000,
          lastLevel: 12350800,
          startTime: start,
          endTime: end,
          totalVotingPower: 12000
        });
      }
      if (url.includes('/voting/epochs/')) {
        const proposal = {
          hash: 'PtSmokeProposal',
          alias: 'Smoke',
          firstPeriod: 172,
          lastPeriod: 174,
          status: 'active',
          initiator: { address: SAMPLE_ADDRESS, alias: 'QA Baker' },
          upvotes: 12
        };
        return fulfillJson(route, {
          index: 91,
          status: 'voting',
          proposals: [proposal],
          periods: [
            { index: 172, kind: 'proposal', status: 'success', startTime: new Date(Date.now() - 4 * 86400000).toISOString(), endTime: new Date(Date.now() - 2 * 86400000).toISOString(), totalVotingPower: 12000 },
            { index: 173, kind: 'exploration', status: 'success', startTime: new Date(Date.now() - 2 * 86400000).toISOString(), endTime: new Date(Date.now() - 2 * 3600000).toISOString(), totalVotingPower: 12000, ballotsQuorum: 49.9, supermajority: 80, yayVotingPower: 6000, nayVotingPower: 0, passVotingPower: 1500 },
            { index: 174, kind: 'testing', status: governanceAdoptionPeriod ? 'success' : 'active', startTime: new Date(Date.now() - 3600000).toISOString(), endTime: new Date(Date.now() + 86400000).toISOString(), totalVotingPower: 12000 },
            ...(governanceAdoptionPeriod
              ? [{ index: 175, kind: 'adoption', status: 'active', startTime: new Date(Date.now() - 1800000).toISOString(), endTime: new Date(Date.now() + 2 * 86400000 + 21 * 3600000 + 21 * 60000).toISOString(), totalVotingPower: 12000 }]
              : [])
          ]
        });
      }
      if (url.includes(`/delegates/${OVERDELEGATED_ADDRESS}`)) return fulfillJson(route, overdelegatedBaker);
      if (url.includes('/delegates/')) {
        const address = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
        const baker = sampleBakers.find((entry) => entry.address === address) || sampleBakers[0];
        return fulfillJson(route, address === SAMPLE_ADDRESS ? await sampleAddressDelegate(request, baker) : baker);
      }
    }

    return route.continue();
  });
}

function log(message) {
  console.log(message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertChamberOrder(page, label) {
  const chamberState = await page.evaluate(() => {
    const cardKey = (el) => el.id || el.dataset.stat || '';
    return {
      order: Array.from(document.querySelectorAll('#chambers-grid .stat-card')).map(cardKey),
      pairs: Array.from(document.querySelectorAll('#chambers-grid > .chamber-card-pair')).map((pair) => (
        Array.from(pair.querySelectorAll(':scope > .stat-card')).map(cardKey)
      ))
    };
  });
  assert(
    EXPECTED_CHAMBER_ORDER.every((key, index) => chamberState.order[index] === key),
    `${label}: Chambers order mismatch, expected ${EXPECTED_CHAMBER_ORDER.join(', ')} but saw ${chamberState.order.join(', ')}`
  );
  const expectedPairs = [
    ['network-health', 'chamber-entry-card'],
    ['tezlink-entry-card', 'etherlink-governance-entry-card'],
    ['tz4-adoption', 'lb-entry-card']
  ];
  assert(
    expectedPairs.every((pair, index) => pair.every((key, innerIndex) => chamberState.pairs[index]?.[innerIndex] === key)),
    `${label}: Chambers pair layout mismatch, expected ${JSON.stringify(expectedPairs)} but saw ${JSON.stringify(chamberState.pairs)}`
  );
}

async function assertChamberControlGeometry(page, label) {
  const issues = await page.evaluate(() => {
    const cardSelectors = [
      '#chamber-entry-card',
      '#tezlink-entry-card',
      '#etherlink-governance-entry-card',
      '#lb-entry-card',
      '#chambers-section [data-stat="tz4-adoption"]',
      '#chambers-section [data-stat="network-health"]'
    ];
    const contentSelector = [
      '.card-front .stat-label',
      '.card-front .stat-value',
      '.card-front .stat-description',
      '.card-front .chamber-entry-icon',
      '.card-front .chamber-entry-status',
      '.card-front .chamber-entry-metrics',
      '.card-front .chamber-entry-metric',
      '.card-front .tezlink-entry-main',
      '.card-front .tezlink-entry-metrics',
      '.card-front .tezlink-entry-metric',
      '.card-front .tezlink-entry-tape',
      '.card-front .tezlink-tape-row',
      '.card-front .etherlink-gov-entry-metrics',
      '.card-front .etherlink-gov-entry-metric',
      '.card-front .network-health-blocks',
      '.card-front .network-health-block',
      '.card-front .health-live-tape',
      '.card-front .health-live-row',
      '.card-front .lb-entry-meter',
      '.card-front .lb-entry-vote-tape',
      '.card-front .lb-entry-vote-row',
      '.card-front .lb-entry-vote-baker',
      '.card-front .lb-entry-vote-badge',
      '.card-front .tz4-entry-preview',
      '.card-front .tz4-entry-preview-title',
      '.card-front .tz4-entry-preview-row',
      '.card-front .tz4-entry-preview-empty',
      '.card-front .tz4-entry-preview-more',
      '.card-front .sparkline-container'
    ].join(', ');

    const visibleBox = (node) => {
      if (!node) return null;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return null;
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height
      };
    };
    const nameOf = (node) => {
      if (node.id) return `#${node.id}`;
      const classes = Array.from(node.classList || []).slice(0, 3).join('.');
      return classes ? `.${classes}` : node.tagName.toLowerCase();
    };
    const overlapArea = (a, b) => {
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return width > 1 && height > 1 ? width * height : 0;
    };
    const found = [];

    for (const selector of cardSelectors) {
      const card = document.querySelector(selector);
      const cardBox = visibleBox(card);
      if (!card || !cardBox) {
        found.push({ card: selector, issue: 'missing-card' });
        continue;
      }
      const controls = Array.from(card.querySelectorAll(':scope > .card-copy-link, :scope > .card-share-btn, :scope > .card-info-btn, :scope > .card-history-btn, :scope .chamber-entry-footer > .chamber-expand-cue'))
        .map((node) => ({ node, name: nameOf(node), box: visibleBox(node) }))
        .filter((item) => item.box);
      const topControls = controls.filter((item) => !item.node.classList.contains('chamber-expand-cue'));
      const footer = card.querySelector(':scope .chamber-entry-footer');
      const footerBox = visibleBox(footer);
      const content = Array.from(card.querySelectorAll(contentSelector))
        .filter((node) => !node.closest('.chamber-entry-footer'))
        .map((node) => ({ node, name: nameOf(node), box: visibleBox(node) }))
        .filter((item) => item.box);

      const shareControl = card.querySelector(':scope > .card-share-btn');
      const copyControl = card.querySelector(':scope > .card-copy-link');
      const infoControl = card.querySelector(':scope > .card-info-btn');
      const historyControl = card.querySelector(':scope > .card-history-btn');
      const infoTooltip = card.querySelector(':scope > .card-tooltip');
      if (!shareControl) found.push({ card: selector, issue: 'missing-share-control' });
      else if (!shareControl.querySelector('svg')) found.push({ card: selector, issue: 'share-control-missing-svg' });
      if (!infoControl) found.push({ card: selector, issue: 'missing-info-control' });
      else if (!infoControl.querySelector('svg')) found.push({ card: selector, issue: 'info-control-missing-svg' });
      if (!infoTooltip) found.push({ card: selector, issue: 'missing-info-tooltip' });
      else if (infoTooltip.previousElementSibling !== infoControl) found.push({ card: selector, issue: 'info-tooltip-not-adjacent' });
      if (shareControl && copyControl && infoControl && historyControl) {
        const stack = [
          ['share', shareControl],
          ['copy', copyControl],
          ['info', infoControl],
          ['history', historyControl]
        ].map(([name, node]) => ({ name, box: visibleBox(node) })).filter((item) => item.box);
        for (let index = 1; index < stack.length; index += 1) {
          if (stack[index].box.top <= stack[index - 1].box.top + 1) {
            found.push({ card: selector, issue: 'control-stack-order', before: stack[index - 1].name, after: stack[index].name, stack: stack.map((item) => ({ name: item.name, top: Number(item.box.top.toFixed(2)) })) });
          }
          if (Math.abs(stack[index].box.left - stack[0].box.left) > 2) {
            found.push({ card: selector, issue: 'control-stack-column', control: stack[index].name, left: Number(stack[index].box.left.toFixed(2)), expected: Number(stack[0].box.left.toFixed(2)) });
          }
        }
      }

      if (!footer || !footerBox) {
        found.push({ card: selector, issue: 'missing-footer-rail' });
      } else {
        const expectedFreshness = card.dataset.updatedLabel || '';
        const actualFreshness = footer.querySelector('.chamber-entry-freshness')?.textContent?.trim() || '';
        if (expectedFreshness && actualFreshness !== expectedFreshness) {
          found.push({ card: selector, issue: 'footer-freshness-mismatch', expected: expectedFreshness, actual: actualFreshness });
        }
        if (footerBox.bottom > cardBox.bottom + 1 || footerBox.top < cardBox.top - 1) {
          found.push({ card: selector, issue: 'footer-outside-card', footer: footerBox, cardBox });
        }
        for (const item of content) {
          const overlap = overlapArea(footerBox, item.box);
          if (overlap > 0) {
            found.push({ card: selector, issue: 'footer-content-overlap', footer: '.chamber-entry-footer', content: item.name, overlap: Number(overlap.toFixed(2)) });
          }
        }
      }

      for (const item of content) {
        if (item.box.top < cardBox.top - 1 || item.box.bottom > cardBox.bottom + 1) {
          found.push({ card: selector, issue: 'content-outside-card', content: item.name, contentBox: item.box, cardBox });
        }
      }

      for (const control of topControls) {
        if (control.box.top < cardBox.top + 8) {
          found.push({ card: selector, issue: 'top-control-too-high', control: control.name, topGap: Number((control.box.top - cardBox.top).toFixed(2)) });
        }
        if (control.box.right > cardBox.right - 8) {
          found.push({ card: selector, issue: 'top-control-too-far-right', control: control.name, rightGap: Number((cardBox.right - control.box.right).toFixed(2)) });
        }
      }

      for (let first = 0; first < controls.length; first += 1) {
        for (let second = first + 1; second < controls.length; second += 1) {
          const overlap = overlapArea(controls[first].box, controls[second].box);
          if (overlap > 0) {
            found.push({ card: selector, issue: 'control-control-overlap', first: controls[first].name, second: controls[second].name, overlap: Number(overlap.toFixed(2)) });
          }
        }
      }

      for (const control of controls) {
        for (const item of content) {
          if (control.node === item.node || control.node.contains(item.node) || item.node.contains(control.node)) continue;
          const overlap = overlapArea(control.box, item.box);
          if (overlap > 0) {
            found.push({ card: selector, issue: 'control-content-overlap', control: control.name, content: item.name, overlap: Number(overlap.toFixed(2)) });
          }
        }
      }
    }

    return found;
  });
  assert(issues.length === 0, `${label}: chamber controls should not overlap content or each other: ${JSON.stringify(issues)}`);
}

async function assertResponsiveChamberCards(browser, baseUrl, viewport, label, mockOptions = {}) {
  const issues = [];
  const context = await browser.newContext({
    viewport,
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context, mockOptions);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, label, issues);
  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `${label}: dashboard failed with HTTP ${response?.status()}`);
  await page.waitForFunction(() => document.querySelectorAll('#chambers-section .chamber-entry-card[data-updated-label]').length >= 6, null, { timeout: 15000 });
  if (mockOptions.governanceLiveVote) {
    await page.locator('#chamber-entry-card.chamber-entry-wide[data-chamber-entry-size="wide"] .chamber-entry-metric strong').first().waitFor({ state: 'visible', timeout: 10000 });
  }
  await assertChamberControlGeometry(page, label);

  const state = await page.evaluate(() => {
    const rect = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const metricGrid = document.querySelector('#chamber-entry-card.chamber-entry-wide .chamber-entry-metrics');
    const metricStyle = metricGrid ? window.getComputedStyle(metricGrid) : null;
    const metricColumns = metricStyle?.gridTemplateColumns?.split(' ').filter(Boolean).length || 0;
    const metricTruncations = Array.from(document.querySelectorAll('#chamber-entry-card.chamber-entry-wide .chamber-entry-metric span, #chamber-entry-card.chamber-entry-wide .chamber-entry-metric strong'))
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => node.textContent?.trim() || '');
    const tezlinkCard = document.querySelector('#tezlink-entry-card');
    const tezlinkLabel = tezlinkCard?.querySelector('.stat-label');
    const tezlinkCardBox = rect(tezlinkCard);
    const tezlinkLabelBox = rect(tezlinkLabel);
    const footers = Array.from(document.querySelectorAll('#chambers-section .chamber-entry-card')).map((card) => ({
      id: card.id || card.dataset.stat || '',
      updatedLabel: card.dataset.updatedLabel || '',
      footerText: card.querySelector('.chamber-entry-footer .chamber-entry-freshness')?.textContent?.trim() || '',
      hasOpenCue: Boolean(card.querySelector('.chamber-entry-footer > .chamber-expand-cue'))
    }));
    return {
      chamberWide: document.querySelector('#chamber-entry-card')?.classList.contains('chamber-entry-wide') || false,
      chamberText: document.querySelector('#chamber-entry-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      metricColumns,
      metricTruncations,
      footers,
      tezlinkTitleClip: Boolean(tezlinkCardBox && tezlinkLabelBox && tezlinkLabelBox.top < tezlinkCardBox.top - 1),
      tezlinkCardBox,
      tezlinkLabelBox
    };
  });

  assert(!mockOptions.governanceLiveVote || state.chamberWide, `${label}: live vote should render Tezos L1 Governance as a wide card: ${JSON.stringify(state)}`);
  assert(state.metricTruncations.length === 0, `${label}: live vote metrics should not ellipsize: ${JSON.stringify(state.metricTruncations)}`);
  assert(viewport.width >= 760 ? state.metricColumns === 2 : state.metricColumns >= 1, `${label}: unexpected live vote metric columns: ${state.metricColumns}`);
  assert(!state.tezlinkTitleClip, `${label}: Tezos X title should remain inside the card: ${JSON.stringify({ card: state.tezlinkCardBox, label: state.tezlinkLabelBox })}`);
  assert(state.footers.length >= 6 && state.footers.every((footer) => footer.updatedLabel === footer.footerText && footer.hasOpenCue), `${label}: chamber footer rail should own freshness and open cue on every card: ${JSON.stringify(state.footers)}`);
  assert(issues.length === 0, `${label}: browser issues:\n${issues.join('\n')}`);
  await context.close();
}

function isAllowedWarning(message) {
  return allowedWarningPatterns.some((pattern) => pattern.test(message));
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 10000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become ready: ${lastError?.message || 'unknown error'}`);
}

async function startLocalServer() {
  if (BASE_URL) return { baseUrl: BASE_URL.replace(/\/$/, ''), stop: async () => {} };

  const port = await findFreePort();
  const child = spawn('python3', ['-m', 'http.server', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(`${baseUrl}/`);
  } catch (error) {
    child.kill();
    throw new Error(`${error.message}\n${output}`);
  }

  return {
    baseUrl,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  };
}

async function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    throw new Error('Playwright is not installed. Run npm install first.');
  }
}

async function installOctezConnectMock(context, address = SAMPLE_ADDRESS) {
  await context.addInitScript((mockAddress) => {
    const activeAccount = {
      address: mockAddress,
      network: { type: 'mainnet' },
      origin: { type: 'mock' },
      scopes: ['operation_request', 'sign']
    };
    const listeners = {};
    let currentAccount = null;
    window.__octezConnectRequests = [];
    window.__octezConnectDisconnected = false;
    window.__octezConnectDisconnectAttempts = 0;
    window.__octezConnectClearActiveCount = 0;
    window.__octezConnectHangDisconnect = false;
    const client = {
      async requestPermissions() {
        currentAccount = activeAccount;
        window.__octezConnectDisconnected = false;
        (listeners.ACTIVE_ACCOUNT_SET || []).forEach((callback) => callback(currentAccount));
        return currentAccount;
      },
      async getActiveAccount() {
        return currentAccount;
      },
      async requestOperation(input) {
        window.__octezConnectRequests.push(input);
        return { transactionHash: `ooSmoke${window.__octezConnectRequests.length}` };
      },
      async disconnect() {
        window.__octezConnectDisconnectAttempts += 1;
        if (window.__octezConnectHangDisconnect) {
          return new Promise(() => {});
        }
        currentAccount = null;
        window.__octezConnectDisconnected = true;
        (listeners.ACTIVE_ACCOUNT_SET || []).forEach((callback) => callback(null));
      },
      async clearActiveAccount() {
        window.__octezConnectClearActiveCount += 1;
        currentAccount = null;
        (listeners.ACTIVE_ACCOUNT_SET || []).forEach((callback) => callback(null));
      },
      async subscribeToEvent(eventName, callback) {
        listeners[eventName] = listeners[eventName] || [];
        listeners[eventName].push(callback);
      }
    };
    window.beacon = {
      getDAppClientInstance: () => client,
      NetworkType: { MAINNET: 'mainnet' },
      PermissionScope: { OPERATION_REQUEST: 'operation_request', SIGN: 'sign' },
      TezosOperationType: { TRANSACTION: 'transaction' },
      BeaconEvent: { ACTIVE_ACCOUNT_SET: 'ACTIVE_ACCOUNT_SET', PAIR_ABORTED: 'PAIR_ABORTED' },
      Regions: { EUROPE_WEST: 'EUROPE_WEST', NORTH_AMERICA_EAST: 'NORTH_AMERICA_EAST' }
    };
  }, address);
}

async function findSystemBrowser() {
  if (BROWSER_EXECUTABLE_PATH) {
    const exists = await fileExists(BROWSER_EXECUTABLE_PATH);
    if (!exists) throw new Error(`BROWSER_EXECUTABLE_PATH does not exist: ${BROWSER_EXECUTABLE_PATH}`);
    return BROWSER_EXECUTABLE_PATH;
  }

  for (const candidate of systemBrowserCandidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function fileExists(file) {
  const fs = await import('node:fs/promises');
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function launchChromium(chromium) {
  try {
    return await chromium.launch({ headless: HEADLESS });
  } catch (error) {
    if (!/Executable doesn't exist|playwright install/i.test(error.message)) throw error;
    const executablePath = await findSystemBrowser();
    if (!executablePath) {
      throw new Error('Playwright browser binary is missing. Run npx playwright install chromium, or set BROWSER_EXECUTABLE_PATH to Chrome/Chromium.');
    }
    log(`Using system browser: ${executablePath}`);
    return chromium.launch({ headless: HEADLESS, executablePath });
  }
}

function attachIssueCollectors(page, label, issues) {
  page.on('console', (message) => {
    if (!['warning', 'warn', 'error'].includes(message.type())) return;
    const text = message.text();
    const locationUrl = message.location()?.url || '';
    const warningText = `${text} ${locationUrl}`;
    if (STRICT_EXTERNAL || !isAllowedWarning(warningText)) {
      issues.push(`${label} console ${message.type()}: ${text}${locationUrl ? ` (${locationUrl})` : ''}`);
    }
  });

  page.on('pageerror', (error) => {
    issues.push(`${label} pageerror: ${error.message}`);
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    const failureText = request.failure()?.errorText || 'failed';
    if (failureText === 'net::ERR_ABORTED' && !STRICT_EXTERNAL) return;
    if (/api\.tzkt\.io|api\.coingecko\.com|api\.llama\.fi|explorer\.etherlink\.com|node\.mainnet\.etherlink\.com|gc\.zgo\.at|goatcounter|fonts\.googleapis|fonts\.gstatic/.test(url) && !STRICT_EXTERNAL) {
      return;
    }
    issues.push(`${label} request failed: ${failureText} ${url}`);
  });
}

async function expectCount(page, selector, min, label) {
  const count = await page.locator(selector).count();
  assert(count >= min, `${label}: expected at least ${min} for ${selector}, saw ${count}`);
  return count;
}

async function openDropdown(page, buttonSelector, dropdownSelector) {
  const button = page.locator(buttonSelector);
  await assertLocatorCount(button, 1, buttonSelector);
  await button.click();
  const dropdown = page.locator(dropdownSelector);
  await expectClassContains(dropdown, 'open', dropdownSelector);
}

async function ensureDropdownOpen(page, buttonSelector, dropdownSelector) {
  const dropdown = page.locator(dropdownSelector);
  const classes = await dropdown.getAttribute('class');
  if (!(classes || '').split(/\s+/).includes('open')) {
    await openDropdown(page, buttonSelector, dropdownSelector);
  }
}

async function clickFeatureLauncher(page, selector) {
  await ensureDropdownOpen(page, '#features-gear', '#features-dropdown');
  const button = page.locator(selector);
  await assertLocatorCount(button, 1, selector);
  await button.click();
}

async function assertLocatorCount(locator, expected, label) {
  const count = await locator.count();
  assert(count === expected, `${label}: expected ${expected}, saw ${count}`);
}

async function expectClassContains(locator, className, label) {
  const classes = await locator.getAttribute('class');
  assert((classes || '').split(/\s+/).includes(className), `${label}: missing .${className}, class="${classes || ''}"`);
}

async function expectShareModal(page, label, issues = []) {
  try {
    await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      hasModal: Boolean(document.querySelector('#share-modal')),
      notification: document.querySelector('.share-notification')?.textContent || '',
      cardButtonText: document.querySelector('[data-stat="total-bakers"] .card-share-btn')?.textContent || '',
      comparisonShareWired: Boolean(document.querySelector('#comparison-share-all-btn')?._wired),
      comparisonShareVisible: Boolean(document.querySelector('#comparison-share-all-btn') && getComputedStyle(document.querySelector('#comparison-share-all-btn')).display !== 'none'),
      html2canvasLoaded: typeof window.html2canvas === 'function',
      scripts: Array.from(document.querySelectorAll('script[src*="html2canvas"]')).map((script) => script.src)
    }));
    throw new Error(`${label}: share modal did not open (${error.message}); debug=${JSON.stringify(debug)}; issues=${issues.join(' | ')}`);
  }
  await expectCount(page, '#share-modal .share-modal-preview img[src^="data:image/png"]', 1, label);
  await expectCount(page, '#share-modal #share-download', 1, label);
  await expectCount(page, '#share-modal #share-copy', 1, label);
  await expectCount(page, '#share-modal #share-twitter', 1, label);
  await page.locator('#share-modal .share-modal-close').click();
  await page.locator('#share-modal').waitFor({ state: 'detached', timeout: 5000 });
}

async function waitForShareModal(page, label, issues = []) {
  try {
    await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      hasModal: Boolean(document.querySelector('#share-modal')),
      notification: document.querySelector('.share-notification')?.textContent || '',
      html2canvasLoaded: typeof window.html2canvas === 'function'
    }));
    throw new Error(`${label}: share modal did not open (${error.message}); debug=${JSON.stringify(debug)}; issues=${issues.join(' | ')}`);
  }
  await expectCount(page, '#share-modal .share-modal-preview img[src^="data:image/png"]', 1, label);
  await expectCount(page, '#share-modal #share-download', 1, label);
  await expectCount(page, '#share-modal #share-copy', 1, label);
  await expectCount(page, '#share-modal #share-twitter', 1, label);
}

async function installShareActionMocks(context, { nativeShare = true } = {}) {
  await context.addInitScript(({ nativeShare }) => {
    window.__shareActions = {
      clipboardWrites: [],
      downloads: [],
      nativeShares: [],
      opens: []
    };

    HTMLCanvasElement.prototype.toBlob = function(callback, type = 'image/png') {
      callback(new Blob(['smoke-share-png'], { type }));
    };

    window.ClipboardItem = class SmokeClipboardItem {
      constructor(items) {
        this.items = items;
        this.types = Object.keys(items || {});
      }
    };

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async (items) => {
          window.__shareActions.clipboardWrites.push({
            count: Array.isArray(items) ? items.length : 0,
            types: Array.from(new Set((items || []).flatMap((item) => item?.types || Object.keys(item?.items || {}))))
          });
        },
        writeText: async (text) => {
          window.__shareActions.clipboardWrites.push({
            count: 1,
            text: String(text),
            types: ['text/plain']
          });
        }
      }
    });

    const originalOpen = window.open?.bind(window);
    window.open = (url, target, features) => {
      window.__shareActions.opens.push({ url: String(url), target: String(target || ''), features: String(features || '') });
      return { closed: false, focus() {} };
    };

    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.download || String(this.href || '').startsWith('data:image/')) {
        window.__shareActions.downloads.push({
          download: this.download || '',
          href: this.href || ''
        });
        return;
      }
      return originalAnchorClick.call(this);
    };

    if (nativeShare) {
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: (payload) => Boolean(payload?.files?.length)
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (payload) => {
          window.__shareActions.nativeShares.push({
            fileCount: Array.isArray(payload?.files) ? payload.files.length : 0,
            fileTypes: Array.isArray(payload?.files) ? payload.files.map((file) => file.type) : [],
            text: String(payload?.text || ''),
            url: String(payload?.url || '')
          });
        }
      });
    } else {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    }
  }, { nativeShare });
}

async function smokeAppShell(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'allow'
  });
  await context.route('https://api.github.com/repos/Primate411/tezos.systems/commits/main', (route) => fulfillJson(route, {
    sha: 'cafebabecafebabecafebabecafebabecafebabe',
    html_url: 'https://github.com/Primate411/tezos.systems/commit/cafebabe',
    commit: { committer: { date: '2026-06-07T00:00:00Z' } }
  }));
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'app shell', issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `app shell: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  const shell = await page.evaluate(async () => {
    const fetchText = async (pathname) => {
      const response = await fetch(pathname, { cache: 'no-store' });
      return {
        pathname,
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
        text: response.ok ? await response.text() : ''
      };
    };
    const fetchJson = async (pathname) => {
      const result = await fetchText(pathname);
      let json = null;
      let parseError = '';
      if (result.ok) {
        try {
          json = JSON.parse(result.text);
        } catch (error) {
          parseError = error.message;
        }
      }
      return { ...result, json, parseError };
    };

    const sw = await fetchText('/sw.js');
    const version = await fetchJson('/version.json');
    const manifest = await fetchJson('/site.webmanifest');
    const robots = await fetchText('/robots.txt');
    const sitemap = await fetchText('/sitemap.xml');
    const shellAssets = Array.from(new Set(
      Array.from(sw.text.matchAll(/['"]((?:\/|\.\.?\/)[^'"]+)['"]/g))
        .map((match) => match[1])
        .filter((asset) => asset.startsWith('/') && !asset.includes('*'))
    )).sort();

    const assetResults = [];
    for (const asset of shellAssets) {
      const assetResponse = await fetch(asset, { cache: 'no-store' });
      assetResults.push({
        asset,
        ok: assetResponse.ok,
        status: assetResponse.status,
        contentType: assetResponse.headers.get('content-type') || ''
      });
    }

    const iconResults = [];
    for (const icon of manifest.json?.icons || []) {
      const iconResponse = await fetch(icon.src, { cache: 'no-store' });
      iconResults.push({ src: icon.src, ok: iconResponse.ok, status: iconResponse.status });
    }

    const stylesheet = document.querySelector('link[rel="stylesheet"][href^="css/styles.min.css"]')?.getAttribute('href') || '';
    const appScript = document.querySelector('script[type="module"][src^="js/core/app.js"]')?.getAttribute('src') || '';
    const appPreload = document.querySelector('link[rel="modulepreload"][href^="js/core/app.js"]')?.getAttribute('href') || '';
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '';
    const cacheVersion = sw.text.match(/CACHE_NAME\s*=\s*['"]tezos-systems-v(\d+)['"]/)?.[1] || '';
    const cssVersion = stylesheet.match(/\?v=(\d+)/)?.[1] || '';
    const appScriptVersion = appScript.match(/\?v=(\d+)/)?.[1] || '';
    const appPreloadVersion = appPreload.match(/\?v=(\d+)/)?.[1] || '';
    const buildVersionText = document.querySelector('#build-version')?.textContent?.trim() || '';
    const buildVersionTitle = document.querySelector('#build-version')?.getAttribute('title') || '';

    return {
      appPreload,
      appPreloadVersion,
      appScript,
      appScriptVersion,
      assetResults,
      buildVersionText,
      buildVersionTitle,
      cacheVersion,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      csp,
      cssVersion,
      faviconCount: document.querySelectorAll('link[rel="icon"]').length,
      iconResults,
      manifest,
      manifestHref: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '',
      robots,
      sitemap,
      stylesheet,
      sw,
      version
    };
  });

  const swReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { ready: false, state: 'unsupported' };
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 10000));
    const registration = await Promise.race([navigator.serviceWorker.ready, timeout]);
    return {
      ready: Boolean(registration),
      active: registration?.active?.state || '',
      installing: registration?.installing?.state || '',
      waiting: registration?.waiting?.state || ''
    };
  });

  assert(shell.sw.ok, `app shell: /sw.js failed with HTTP ${shell.sw.status}`);
  assert(shell.version.ok && !shell.version.parseError, `app shell: /version.json invalid (${shell.version.status} ${shell.version.parseError})`);
  assert(Number.isInteger(shell.version.json?.build), `app shell: version.json build should be an integer, saw ${JSON.stringify(shell.version.json)}`);
  assert(/^[a-f0-9]{7,12}$/i.test(shell.version.json?.commit || ''), `app shell: version.json commit should be a short hash, saw ${shell.version.json?.commit}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(shell.version.json?.date || ''), `app shell: version.json date should be yyyy-mm-dd, saw ${shell.version.json?.date}`);
  assert(shell.manifest.ok && !shell.manifest.parseError, `app shell: site.webmanifest invalid (${shell.manifest.status} ${shell.manifest.parseError})`);
  assert(shell.manifest.json?.name === 'Tezos Systems', `app shell: manifest name mismatch: ${shell.manifest.json?.name}`);
  assert((shell.manifest.json?.icons || []).length >= 4, 'app shell: manifest should expose standard and maskable icons');
  assert(shell.iconResults.every((icon) => icon.ok), `app shell: manifest icons failed: ${shell.iconResults.filter((icon) => !icon.ok).map((icon) => `${icon.src} ${icon.status}`).join(', ')}`);
  assert(shell.manifestHref === 'site.webmanifest', `app shell: manifest link mismatch: ${shell.manifestHref}`);
  assert(shell.faviconCount >= 3, `app shell: expected multiple favicon links, saw ${shell.faviconCount}`);
  assert(shell.canonical === 'https://tezos.systems/', `app shell: canonical URL mismatch: ${shell.canonical}`);
  assert(shell.csp.includes('api.github.com') && shell.csp.includes('*.tzkt.io'), 'app shell: CSP missing core live-data domains');
  assert(shell.stylesheet && shell.appScript && shell.appPreload, `app shell: missing stamped stylesheet/app script (${shell.stylesheet}, ${shell.appPreload}, ${shell.appScript})`);
  assert(shell.cacheVersion && shell.cacheVersion === shell.cssVersion && shell.cacheVersion === shell.appPreloadVersion && shell.cacheVersion === shell.appScriptVersion, `app shell: cache stamps mismatch cache=${shell.cacheVersion} css=${shell.cssVersion} preload=${shell.appPreloadVersion} script=${shell.appScriptVersion}`);
  assert(shell.robots.text.includes('Sitemap:'), 'app shell: robots.txt should point at the sitemap');
  assert(shell.sitemap.text.includes('https://tezos.systems/'), 'app shell: sitemap should include the canonical root URL');
  assert(/build \d+ · latest cafebab · stamp [a-f0-9]{7,12} · \d{4}-\d{2}-\d{2}/i.test(shell.buildVersionText), `app shell: build footer should include build/latest/stamp/date, saw: ${shell.buildVersionText}`);
  assert(/Latest main commit: cafebabe/i.test(shell.buildVersionTitle), `app shell: build footer title missing latest commit, saw: ${shell.buildVersionTitle}`);
  assert(swReady.ready, `app shell: service worker did not become ready (${JSON.stringify(swReady)})`);

  const failedAssets = shell.assetResults.filter((asset) => !asset.ok);
  assert(failedAssets.length === 0, `app shell: service worker shell assets failed: ${failedAssets.map((asset) => `${asset.asset} ${asset.status}`).join(', ')}`);
  assert(shell.assetResults.length >= 40, `app shell: expected broad shell asset coverage, saw ${shell.assetResults.length}`);

  await context.close();

  const fallbackContext = await browser.newContext({
    viewport: { width: 960, height: 720 },
    serviceWorkers: 'block'
  });
  await fallbackContext.route('https://api.github.com/repos/Primate411/tezos.systems/commits/main', (route) => route.fulfill({ status: 403, body: '{}' }));
  await fallbackContext.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const fallbackPage = await fallbackContext.newPage();
  attachIssueCollectors(fallbackPage, 'app shell footer fallback', issues);
  const fallbackResponse = await fallbackPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(fallbackResponse?.ok(), `app shell footer fallback: dashboard failed with HTTP ${fallbackResponse?.status()}`);
  await fallbackPage.waitForFunction(() => /latest unavailable/.test(document.querySelector('#build-version')?.textContent || ''), null, { timeout: 10000 });
  const fallbackFooter = await fallbackPage.locator('#build-version').innerText();
  assert(/build \d+ · latest unavailable · stamp [a-f0-9]{7,12} · \d{4}-\d{2}-\d{2}/i.test(fallbackFooter), `app shell footer fallback: footer shape mismatch: ${fallbackFooter}`);
  await fallbackContext.close();

  assert(issues.length === 0, `app shell browser issues:\n${issues.join('\n')}`);
  log(`ok - app shell smoke (${shell.assetResults.length} shell assets)`);
}

async function smokeHeroCommandBar(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'hero command bar', issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `hero command bar: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('#hero-search-input').waitFor({ state: 'visible', timeout: 10000 });
  const frontDoorOrder = await page.evaluate(() => {
    const ids = ['block-ticker-strip', 'upgrade-clock', 'chambers-section', 'recruit-section'];
    return ids.map((id) => {
      const el = document.getElementById(id);
      return { id, position: el ? Array.prototype.indexOf.call(document.body.querySelectorAll('*'), el) : -1 };
    });
  });
  for (const item of frontDoorOrder) {
    assert(item.position >= 0, `hero command bar: missing front-door section #${item.id}`);
  }
  const orderPositions = frontDoorOrder.map((item) => item.position);
  assert(orderPositions.every((position, index) => index === 0 || position > orderPositions[index - 1]), `hero command bar: first-screen order mismatch: ${JSON.stringify(frontDoorOrder)}`);
  const deckChromeState = await page.evaluate(() => ({
    commandDeckHeadCount: document.querySelectorAll('.command-deck-head').length,
    upgradeShareCount: document.querySelectorAll('#upgrade-share-btn').length
  }));
  assert(deckChromeState.commandDeckHeadCount === 0, 'hero command bar: command deck should not show protocol chrome above search');
  assert(deckChromeState.upgradeShareCount === 0, 'hero command bar: old upgrade share button should not remain in the first-screen search deck');

  await page.locator('#header-protocol-chip').click();
  await page.waitForFunction(() => window.location.hash === '#protocol-history', null, { timeout: 5000 });
  await page.locator('#protocol-history-chamber-modal.active #upgrade-timeline .timeline-item').first().waitFor({ state: 'visible', timeout: 10000 });
  const firstProtocolInHistory = await page.locator('#protocol-history-chamber-modal #upgrade-timeline .timeline-item').first().getAttribute('data-protocol');
  assert(firstProtocolInHistory === 'Tallinn', `hero command bar: Protocol History Chamber should start at current protocol, saw ${firstProtocolInHistory}`);
  await page.locator('#protocol-history-chamber-modal .chamber-close').click();
  await page.locator('#protocol-history-chamber-modal').waitFor({ state: 'detached', timeout: 5000 });

  await page.keyboard.press('/');
  await page.waitForFunction(() => document.activeElement?.id === 'hero-search-input', null, { timeout: 5000 });
  await page.locator('#hero-search-panel').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => {
    const main = document.querySelector('.main-content');
    return main && Number.parseFloat(getComputedStyle(main).opacity) <= 0.2;
  }, null, { timeout: 5000 });
  const focusModeState = await page.evaluate(() => {
    const main = document.querySelector('.main-content');
    const commandDeck = document.querySelector('.command-deck');
    const panel = document.querySelector('#hero-search-panel');
    return {
      bodyMode: document.body.classList.contains('hero-search-mode'),
      mainOpacity: Number.parseFloat(getComputedStyle(main).opacity),
      mainPointerEvents: getComputedStyle(main).pointerEvents,
      commandDeckZ: Number.parseInt(getComputedStyle(commandDeck).zIndex, 10),
      panelZ: Number.parseInt(getComputedStyle(panel).zIndex, 10)
    };
  });
  assert(focusModeState.bodyMode, 'hero command bar: search focus should transform the page');
  assert(focusModeState.mainOpacity <= 0.2, `hero command bar: Chambers should recede behind search, opacity ${focusModeState.mainOpacity}`);
  assert(focusModeState.mainPointerEvents === 'none', `hero command bar: background chambers should not sit above active search, pointer events ${focusModeState.mainPointerEvents}`);
  assert(focusModeState.commandDeckZ >= 3000 && focusModeState.panelZ > focusModeState.commandDeckZ, `hero command bar: search layer z-index mismatch ${JSON.stringify(focusModeState)}`);
  const emptyStateText = await page.locator('#hero-search-panel').innerText();
  assert(/my tezos/i.test(emptyStateText) && /network health/i.test(emptyStateText) && /liquidity baking/i.test(emptyStateText), `hero command bar: empty state missing retrieval rows: ${emptyStateText}`);
  assert(/Search accepts/i.test(emptyStateText) && /wallets/i.test(emptyStateText) && /slash commands/i.test(emptyStateText), `hero command bar: search guide missing accepted-input copy: ${emptyStateText}`);
  assert(!/protocol history/i.test(emptyStateText), `hero command bar: empty state should not push protocol history first: ${emptyStateText}`);
  await page.mouse.click(10, 10);
  await page.waitForFunction(() => !document.body.classList.contains('hero-search-mode') && document.getElementById('hero-search-panel')?.hidden, null, { timeout: 5000 });

  await page.locator('#protocol-history-entry-card').waitFor({ state: 'visible', timeout: 10000 });
  const protocolEntryText = await page.locator('#protocol-history-entry-card').innerText();
  assert(/Protocol Anthology/i.test(protocolEntryText) && /Lore/i.test(protocolEntryText) && /Impact/i.test(protocolEntryText), `hero command bar: Protocol Anthology card missing expected copy: ${protocolEntryText}`);

  await page.keyboard.press('/');
  await page.locator('#hero-search-input').fill('/protocol-history');
  await page.waitForFunction(() => /Protocol Anthology|protocol-history/i.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.location.hash === '#protocol-history', null, { timeout: 5000 });
  await page.locator('#protocol-history-chamber-modal.active #upgrade-timeline .timeline-item').first().waitFor({ state: 'visible', timeout: 10000 });
  const historyChamberText = await page.locator('#protocol-history-chamber-modal').innerText();
  assert(/Protocol History Chamber/i.test(historyChamberText) && /Impact/i.test(historyChamberText), `hero command bar: Protocol History Chamber did not preserve timeline/impact surface: ${historyChamberText.slice(0, 320)}`);
  assert(/Curator's desk/i.test(historyChamberText) && /Long reads/i.test(historyChamberText) && /Economic governance shelf/i.test(historyChamberText), `hero command bar: Protocol Anthology board missing real archive context: ${historyChamberText.slice(0, 420)}`);
  const anthologyState = await page.evaluate(() => ({
    metricCount: document.querySelectorAll('#protocol-history-chamber-modal .protocol-anthology-metric').length,
    featureCount: document.querySelectorAll('#protocol-history-chamber-modal .protocol-anthology-feature').length,
    shelfCount: document.querySelectorAll('#protocol-history-chamber-modal .protocol-anthology-shelf').length,
    quebecLinks: document.querySelectorAll('#protocol-history-chamber-modal [data-protocol-open="Quebec"]').length
  }));
  assert(anthologyState.metricCount >= 4 && anthologyState.featureCount >= 3 && anthologyState.shelfCount >= 3 && anthologyState.quebecLinks >= 1, `hero command bar: Protocol Anthology anatomy incomplete: ${JSON.stringify(anthologyState)}`);
  await page.locator('#protocol-history-chamber-modal [data-protocol-open="Quebec"]').first().click();
  await page.locator('#protocol-history-modal').waitFor({ state: 'visible', timeout: 10000 });
  const anthologyProtocolText = await page.locator('#protocol-history-modal').innerText();
  assert(/Quebec\/Qena Wars|Quebec Protocol/i.test(anthologyProtocolText), `hero command bar: anthology protocol chip did not open real Quebec history: ${anthologyProtocolText.slice(0, 320)}`);
  await page.locator('#protocol-history-modal #history-modal-close').click();
  await page.locator('#protocol-history-modal').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('#protocol-history-chamber-modal .chamber-close').click();
  await page.locator('#protocol-history-chamber-modal').waitFor({ state: 'detached', timeout: 5000 });

  await page.locator('#hero-search-input').fill('Granada');
  await page.waitForFunction(() => /Granada/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.location.hash === '#protocol=Granada', null, { timeout: 5000 });
  await page.locator('#protocol-history-modal').waitFor({ state: 'visible', timeout: 10000 });
  const protocolText = await page.locator('#protocol-history-modal').innerText();
  assert(/Liquidity Baking Wars Begin|Granada Protocol/.test(protocolText), `hero command bar: protocol modal text mismatch: ${protocolText.slice(0, 320)}`);
  await page.locator('#protocol-history-modal #history-modal-close').click();
  await page.locator('#protocol-history-modal').waitFor({ state: 'detached', timeout: 5000 });

  await page.keyboard.press('/');
  await page.locator('#hero-search-input').fill('/calculator');
  await page.waitForFunction(() => /\/calculator/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.location.hash === '#calculator', null, { timeout: 5000 });
  await page.locator('#calculator-section.visible').waitFor({ state: 'visible', timeout: 5000 });

  await page.locator('.recruit-card[data-hero-query="my tezos"]').scrollIntoViewIfNeeded();
  const loopGuideText = await page.locator('#tezos-loop-console').innerText();
  assert(/Search is the map/i.test(loopGuideText) && /KT1/i.test(loopGuideText) && /\/price/i.test(loopGuideText), `hero command bar: loop console should explain search inputs: ${loopGuideText}`);
  await page.locator('.recruit-card[data-hero-query="my tezos"]').click();
  await page.waitForFunction(() => document.activeElement?.id === 'hero-search-input', null, { timeout: 5000 });
  await page.waitForFunction(() => /My Tezos/.test(document.querySelector('#hero-search-panel')?.textContent || ''), null, { timeout: 5000 });
  assert((await page.locator('#hero-search-input').inputValue()).toLowerCase() === 'my tezos', 'hero command bar: recruit card should seed My Tezos query');
  const loopState = await page.evaluate(() => ({
    aura: document.querySelector('#tezos-loop-console')?.dataset.aura || '',
    title: document.querySelector('#tezos-loop-title')?.textContent || '',
    activeCards: document.querySelectorAll('.recruit-card.is-active').length,
    activeChips: document.querySelectorAll('.tezos-loop-chip.active').length
  }));
  assert(loopState.aura === 'holder' && /Wallet or \.tez/i.test(loopState.title), `hero command bar: Tezos loop holder state mismatch ${JSON.stringify(loopState)}`);
  assert(loopState.activeCards === 1 && loopState.activeChips === 1, `hero command bar: Tezos loop active state mismatch ${JSON.stringify(loopState)}`);

  await context.close();
  assert(issues.length === 0, `hero command bar browser issues:\n${issues.join('\n')}`);
  log('ok - hero command bar smoke');
}

async function smokeTzktThrottle(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'TzKT throttle', issues);

  const response = await page.goto(`${baseUrl}/tests/fixtures/tzkt-throttle.html`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `TzKT throttle: fixture failed with HTTP ${response?.status()}`);
  await page.waitForFunction(() => window.__tzktThrottle?.patched === true, null, { timeout: 5000 });

  const result = await page.evaluate(async () => {
    window.__tzktThrottleStarts.length = 0;
    const start = performance.now();
    const tzktUrls = Array.from(
      { length: 8 },
      (_, index) => `https://api.tzkt.io/v1/head?smoke=${index}`
    );
    const otherUrl = 'https://api.coingecko.com/api/v3/ping';

    await Promise.all([
      ...tzktUrls.map((url) => fetch(url).then((r) => r.json())),
      fetch(otherUrl).then((r) => r.json())
    ]);

    const starts = window.__tzktThrottleStarts.map((entry) => ({
      ...entry,
      delta: entry.at - start
    }));

    return {
      constants: {
        maxRequestsPerSecond: window.__tzktThrottle.maxRequestsPerSecond,
        minSpacingMs: window.__tzktThrottle.minSpacingMs
      },
      other: starts.find((entry) => entry.url.includes('api.coingecko.com')),
      starts,
      tzkt: starts.filter((entry) => entry.url.includes('api.tzkt.io'))
    };
  });

  assert(result.constants.maxRequestsPerSecond === 6, `TzKT throttle: maxRequestsPerSecond mismatch ${result.constants.maxRequestsPerSecond}`);
  assert(result.constants.minSpacingMs >= 167, `TzKT throttle: minSpacingMs should pace six per second, saw ${result.constants.minSpacingMs}`);
  assert(result.tzkt.length === 8, `TzKT throttle: expected 8 TzKT starts, saw ${result.tzkt.length}`);
  assert(result.other && result.other.delta < 100, `TzKT throttle: non-TzKT fetch should bypass queue quickly, saw ${JSON.stringify(result.other)}`);

  const tzktDeltas = result.tzkt.map((entry) => entry.delta).sort((a, b) => a - b);
  const firstSevenSpan = tzktDeltas[6] - tzktDeltas[0];
  const totalSpan = tzktDeltas[7] - tzktDeltas[0];
  assert(firstSevenSpan >= 950, `TzKT throttle: seventh request started too soon (${firstSevenSpan.toFixed(1)}ms)`);
  assert(totalSpan >= 1100, `TzKT throttle: eight requests were not paced enough (${totalSpan.toFixed(1)}ms)`);

  for (let i = 0; i < tzktDeltas.length; i += 1) {
    const windowCount = tzktDeltas.filter((delta) => delta >= tzktDeltas[i] && delta < tzktDeltas[i] + 1000).length;
    assert(windowCount <= 6, `TzKT throttle: ${windowCount} requests started inside one second window at ${tzktDeltas[i].toFixed(1)}ms`);
  }

  await context.close();
  assert(issues.length === 0, `TzKT throttle browser issues:\n${issues.join('\n')}`);
  log('ok - TzKT throttle smoke');
}

async function smokeDashboard(browser, baseUrl, viewport, label) {
  const issues = [];
  const context = await browser.newContext({
    viewport,
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const page = await context.newPage();
  attachIssueCollectors(page, label, issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `${label}: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  assert((await page.title()).includes('Tezos Systems'), `${label}: title does not include Tezos Systems`);
  await expectCount(page, 'header.header', 1, label);
  await expectCount(page, '#price-bar', 1, label);
  await expectCount(page, '#upgrade-clock', 1, label);
  await expectCount(page, '.stat-card', 19, label);
  await expectCount(page, '.card-share-btn, #share-btn, #comparison-share-all-btn', 4, label);
  await expectCount(page, '#build-version', 1, label);
  await expectCount(page, '#widgets-gallery', 1, label);
  await expectCount(page, '#chambers-section', 1, label);
  assert(await page.locator('#chambers-section').isVisible(), `${label}: Chambers should be visible by default`);
  await page.waitForFunction(() => document.querySelectorAll('#chambers-section .chamber-entry-card').length >= 5, null, { timeout: 10000 });
  if (viewport.width <= 720) {
    const mobileGutters = await page.evaluate(() => {
      const rect = (selector) => {
        const item = document.querySelector(selector)?.getBoundingClientRect();
        return item ? { left: item.left, right: item.right, width: item.width } : null;
      };
      return {
        protocol: rect('.upgrade-clock-content'),
        ticker: rect('.block-ticker-button'),
        chambers: rect('#chambers-section')
      };
    });
    assert(
      mobileGutters.protocol && mobileGutters.ticker && Math.abs(mobileGutters.protocol.left - mobileGutters.ticker.left) <= 1.5,
      `${label}: protocol panel should match live bar mobile gutter: ${JSON.stringify(mobileGutters)}`
    );
    assert(
      mobileGutters.chambers && mobileGutters.ticker && Math.abs(mobileGutters.chambers.left - mobileGutters.ticker.left) <= 1.5,
      `${label}: Chambers area should match live bar mobile gutter: ${JSON.stringify(mobileGutters)}`
    );
  }
  await expectCount(page, '#chambers-section #tezlink-entry-card.chamber-entry-wide .card-copy-link[data-copy-hash="#tezosx"]', 1, `${label} Tezos X chamber card`);
  await assertChamberOrder(page, label);
  assert(!(await page.locator('#consensus-section').isVisible()), `${label}: Consensus stats should be hidden by default`);
  assert(!(await page.locator('#economy-section').isVisible()), `${label}: Economy stats should be hidden by default`);
  assert(!(await page.locator('#governance-section').isVisible()), `${label}: Governance stats should be hidden by default`);
  assert(!(await page.locator('#network-activity-section').isVisible()), `${label}: Network Activity stats should be hidden by default`);
  assert(!(await page.locator('#ecosystem-section').isVisible()), `${label}: Ecosystem stats should be hidden by default`);
  assert(!(await page.locator('#widgets-gallery').isVisible()), `${label}: Embed Builder utility should be hidden by default`);
  await expectCount(page, '#widgets-gallery .widget-utility-panel', 1, label);
  await expectCount(page, '#widgets-gallery a[href="/widgets/builder.html"]', 1, label);
  assert(await page.locator('#widgets-gallery .widget-preview-card').count() === 0, `${label}: raw widget preview cards should be demoted out of dashboard`);
  assert(await page.locator('#widgets-gallery a[href^="/widgets/"]:not([href="/widgets/builder.html"])').count() === 0, `${label}: dashboard widget utility should not link to raw widget endpoints`);
  await expectCount(page, '.section-copy-link', 7, label);

  await openDropdown(page, '#settings-gear', '#settings-dropdown');
  await page.locator('#changelog-btn').click();
  await page.locator('#changelog-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 5000 });
  assert((await page.locator('#changelog-body').innerText()).includes('2026'), `${label}: changelog content missing`);
  await page.locator('#changelog-modal .changelog-modal-close').click();
  await page.locator('#changelog-modal[aria-hidden="true"]').waitFor({ state: 'attached', timeout: 5000 });

  await openDropdown(page, '#settings-gear', '#settings-dropdown');
  await page.locator('#theme-toggle').click();
  await page.locator('#theme-picker-dropdown').waitFor({ state: 'visible', timeout: 5000 });
  await expectCount(page, '#theme-picker-dropdown .theme-row', 12, label);
  await page.keyboard.press('Escape');

  await openDropdown(page, '#features-gear', '#features-dropdown');
  await expectCount(page, '#features-dropdown.feature-launcher', 1, label);
  await expectCount(page, '#features-dropdown .feature-launcher-group', 4, label);
  await expectCount(page, '#features-dropdown .feature-copy-link', 11, label);
  await expectCount(page, '#features-dropdown #chambers-toggle', 1, label);
  await expectCount(page, '#features-dropdown .feature-copy-link[data-copy-hash="#chambers"]', 1, label);
  await expectCount(page, '#features-dropdown #ctez-feature-btn', 1, label);
  await expectCount(page, '#features-dropdown .feature-copy-link[data-copy-hash="#ctez"]', 1, label);
  await assertLocatorCount(page.locator('#features-dropdown #chamber-toggle, #features-dropdown #liquidity-baking-toggle, #features-dropdown #tz4-adoption-toggle'), 0, `${label} individual chamber launchers`);
  assert((await page.locator('#features-dropdown a[href="/widgets/builder.html"]').innerText()).includes('Embed Builder'), `${label}: launcher should point widgets to Embed Builder`);
  await page.locator('.feature-copy-link[data-copy-hash="#compare"]').click();
  await page.waitForFunction(() => document.querySelector('.feature-copy-link[data-copy-hash="#compare"]')?.textContent?.trim() === '✓', null, { timeout: 3000 });
  await page.locator('#calc-toggle').click();
  await expectClassContains(page.locator('#calculator-section'), 'visible', `${label} #calculator-section`);
  await page.locator('#calc-amount').fill('10000');
  await page.waitForFunction(() => {
    const text = document.querySelector('#calc-daily-xtz')?.textContent?.trim() || '';
    return text && text !== '-';
  }, null, { timeout: 5000 });

  await page.locator('#my-tezos-btn').click();
  await expectClassContains(page.locator('#my-tezos-drawer'), 'open', `${label} #my-tezos-drawer`);
  await expectCount(page, '#drawer-address-input', 1, label);
  await page.locator('#drawer-close').click();
  await page.waitForFunction(() => !document.querySelector('#my-tezos-drawer')?.classList.contains('open'), null, { timeout: 5000 });

  await openDropdown(page, '#settings-gear', '#settings-dropdown');
  await page.locator('#share-btn').click();
  await page.locator('#section-picker-modal').waitFor({ state: 'visible', timeout: 5000 });
  await expectCount(page, '#section-picker-modal input[type="checkbox"]', 2, label);
  await expectCount(page, '#section-picker-modal .section-picker-note', 1, label);
  const pickerLabels = await page.locator('#section-picker-modal .section-picker-label').allTextContents();
  assert(pickerLabels.some((text) => text.includes('Chambers')), `${label}: share picker should include visible Chambers section`);
  assert(!pickerLabels.includes('⛓️'), `${label}: share picker should not show emoji-only section names`);
  assert(!pickerLabels.includes('🧩 Embed Builder'), `${label}: share picker should not include hidden utility sections`);
  await page.locator('#section-picker-modal .share-modal-close').click();
  await page.locator('#section-picker-modal').waitFor({ state: 'detached', timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `${label}: browser issues:\n${issues.join('\n')}`);
  log(`ok - dashboard smoke (${label})`);
}

async function smokeMyTezosBakerActivity(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await installFeatureMocks(context);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, 'my tezos baker activity', issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `my tezos baker activity: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('#my-tezos-btn').click();
  await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos baker activity drawer');
  await page.locator('#drawer-address-input').fill(SAMPLE_ADDRESS);
  await page.locator('#drawer-connect-btn').click();
  await page.waitForFunction(() => {
    const text = document.querySelector('#drawer-baker-activity')?.textContent || '';
    return text.includes('Fresh Delegator') && text.includes('Fresh Staker');
  }, null, { timeout: 15000 });

  const bakerActivityText = (await page.locator('#drawer-baker-activity').innerText()).toLowerCase();
  assert(bakerActivityText.includes('latest delegators'), 'my tezos baker activity: should list latest delegators');
  assert(bakerActivityText.includes('latest stakers'), 'my tezos baker activity: should list latest stakers');
  await expectCount(page, '#drawer-baker-activity .drawer-activity-row', 2, 'my tezos baker activity');

  await page.waitForFunction(() => {
    const text = (document.querySelector('#drawer-operator-status')?.innerText || '').toLowerCase();
    return text.includes('next round 0 block') && text.includes('back online') && text.includes('last 10 attestations ok') && text.includes('v25.0');
  }, null, { timeout: 15000 });
  const operatorText = (await page.locator('#drawer-operator-status').innerText()).toLowerCase();
  const operatorOctezState = await page.evaluate(() => {
    const tile = Array.from(document.querySelectorAll('#drawer-operator-status .drawer-operator-tile'))
      .find((item) => (item.textContent || '').toLowerCase().includes('octez'));
    return {
      text: tile?.textContent || '',
      className: tile?.className || ''
    };
  });
  assert(operatorText.includes('next round 0 block'), 'my tezos baker activity: should show the next round 0 block prominently');
  assert(operatorText.includes('18m'), `my tezos baker activity: should estimate next block ETA, saw: ${operatorText}`);
  assert(operatorText.includes('back online'), 'my tezos baker activity: should show recovered baker state from fresh attestations');
  assert(!operatorText.includes('round 5'), `my tezos baker activity: should not surface nonzero-round baking rights, saw: ${operatorText}`);
  assert(operatorText.includes('octez') && operatorText.includes('v25.0'), 'my tezos baker activity: should show the baker Octez version');
  assert(operatorOctezState.className.includes('drawer-operator-watch') && operatorOctezState.text.includes('v25.1'), `my tezos baker activity: stale same-major Octez version should be yellow/watch ${JSON.stringify(operatorOctezState)}`);
  assert(operatorText.includes('attestation') && operatorText.includes('100.0%'), 'my tezos baker activity: should show prominent attestation rate');
  assert(operatorText.includes('dal') && operatorText.includes('14/14 dal slots'), 'my tezos baker activity: should show prominent DAL participation');

  await context.close();
  assert(issues.length === 0, `my tezos baker activity browser issues:\n${issues.join('\n')}`);
  log('ok - my tezos baker activity smoke');
}

async function smokeMyTezosBakerLiveSignal(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context, { operatorAttestationSequence: ['missed', 'missed', 'missed', 'missed', 'realized'] });
  await context.addInitScript(() => {
    window.__MY_TEZOS_OPERATOR_REFRESH_MS__ = 1000;
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, 'my tezos baker live signal', issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `my tezos baker live signal: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('#my-tezos-btn').click();
  await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos baker live signal drawer');
  await page.locator('#drawer-address-input').fill(SAMPLE_ADDRESS);
  await page.locator('#drawer-connect-btn').click();

  const readSignalState = () => page.evaluate(() => ({
    operator: document.querySelector('#drawer-operator-status')?.innerText || '',
    freshness: document.querySelector('#drawer-freshness')?.innerText || ''
  }));

  try {
    await page.waitForFunction(() => {
      const text = (document.querySelector('#drawer-operator-status')?.innerText || '').toLowerCase();
      return text.includes('check now') && text.includes('10/10 recent attestation issues');
    }, null, { timeout: 15000 });
  } catch {
    const state = await readSignalState();
    throw new Error(`my tezos baker live signal: initial stale state was not visible: ${JSON.stringify(state)}`);
  }

  try {
    await page.waitForFunction(() => {
      const text = (document.querySelector('#drawer-operator-status')?.innerText || '').toLowerCase();
      const freshness = (document.querySelector('#drawer-freshness')?.innerText || '').toLowerCase();
      return text.includes('back online')
        && text.includes('last 10 attestations ok')
        && freshness.includes('live signal');
    }, null, { timeout: 15000 });
  } catch {
    const state = await readSignalState();
    throw new Error(`my tezos baker live signal: live recovery was not visible: ${JSON.stringify(state)}`);
  }

  const operatorText = (await page.locator('#drawer-operator-status').innerText()).toLowerCase();
  assert(operatorText.includes('back online'), `my tezos baker live signal: open drawer did not recover live, saw: ${operatorText}`);
  assert(!operatorText.includes('check now'), `my tezos baker live signal: stale issue state remained visible, saw: ${operatorText}`);

  await context.close();
  assert(issues.length === 0, `my tezos baker live signal browser issues:\n${issues.join('\n')}`);
  log('ok - my tezos baker live signal smoke');
}

async function smokeMyTezosDrawerLiveRefresh(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context, { myTezosLiveRefresh: true });
  await context.addInitScript((address) => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    localStorage.setItem('tezos-systems-my-baker-address', address);
  }, SAMPLE_ADDRESS);

  const page = await context.newPage();
  attachIssueCollectors(page, 'my tezos drawer live refresh', issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `my tezos drawer live refresh: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  await page.waitForFunction((address) => {
    const data = window._myTezosData;
    return data?.fullAddress === address && Math.round(data.totalXTZ) === 1500000;
  }, SAMPLE_ADDRESS, { timeout: 15000 });

  await page.locator('#my-tezos-btn').click();
  await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos drawer live refresh drawer');
  try {
    await page.waitForFunction(() => {
      const data = window._myTezosData;
      const bakerText = document.querySelector('#my-baker-results')?.innerText || '';
      const bakerLower = bakerText.toLowerCase();
      const octezStat = Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat'))
        .find((item) => (item.textContent || '').toLowerCase().includes('octez version'));
      const header = document.querySelector('#my-tezos-btn .nav-label')?.textContent || '';
      return Math.round(data?.totalXTZ || 0) === 1750000
        && bakerText.includes('1,750,000.00')
        && bakerText.includes('725,000.00')
        && bakerLower.includes('octez version')
        && bakerLower.includes('v25.0')
        && octezStat?.classList.contains('my-baker-octez-watch')
        && header.includes('1,750,000 XTZ');
    }, null, { timeout: 15000 });
  } catch {
    const state = await page.evaluate(() => ({
      data: window._myTezosData,
      header: document.querySelector('#my-tezos-btn .nav-label')?.textContent || '',
      bakerText: document.querySelector('#my-baker-results')?.innerText || '',
      freshness: document.querySelector('#drawer-freshness')?.innerText || ''
    }));
    throw new Error(`my tezos drawer live refresh: drawer did not refresh into Octez-aware state ${JSON.stringify(state)}`);
  }

  const state = await page.evaluate(() => ({
    totalXTZ: window._myTezosData?.totalXTZ,
    staked: window._myTezosData?.staked,
    header: document.querySelector('#my-tezos-btn .nav-label')?.textContent || '',
    bakerText: document.querySelector('#my-baker-results')?.innerText || '',
    octezClass: Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat'))
      .find((item) => (item.textContent || '').toLowerCase().includes('octez version'))?.className || '',
    freshness: document.querySelector('#drawer-freshness')?.innerText || ''
  }));

  assert(Math.round(state.totalXTZ) === 1750000, `my tezos drawer live refresh: brief kept stale balance ${JSON.stringify(state)}`);
  assert(Math.round(state.staked) === 725000, `my tezos drawer live refresh: brief kept stale stake ${JSON.stringify(state)}`);
  assert(state.bakerText.includes('1,750,000.00'), `my tezos drawer live refresh: baker grid kept stale balance ${JSON.stringify(state)}`);
  assert(state.bakerText.includes('725,000.00'), `my tezos drawer live refresh: baker grid kept stale stake ${JSON.stringify(state)}`);
  assert(state.bakerText.toLowerCase().includes('octez version') && state.bakerText.includes('v25.0'), `my tezos drawer live refresh: baker grid missed Octez version ${JSON.stringify(state)}`);
  assert(state.octezClass.includes('my-baker-octez-watch'), `my tezos drawer live refresh: stale same-major Octez version should be yellow/watch ${JSON.stringify(state)}`);
  assert(state.header.includes('1,750,000 XTZ'), `my tezos drawer live refresh: header kept stale balance ${JSON.stringify(state)}`);
  assert(state.freshness.toLowerCase().includes('updated'), `my tezos drawer live refresh: freshness stamp missing ${JSON.stringify(state)}`);

  await context.close();
  assert(issues.length === 0, `my tezos drawer live refresh browser issues:\n${issues.join('\n')}`);
  log('ok - my tezos drawer live refresh smoke');
}

async function smokeMyTezosWalletConnect(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context);
  await installOctezConnectMock(context);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, 'my tezos wallet connect', issues);
  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `my tezos wallet connect: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('#my-tezos-btn').click();
  await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos wallet connect drawer');
  await page.locator('#drawer-wallet-connect-btn').click();
  await page.waitForFunction((address) => localStorage.getItem('tezos-systems-my-baker-address') === address, SAMPLE_ADDRESS, { timeout: 10000 });
  await page.locator('#my-baker-input').waitFor({ state: 'visible', timeout: 10000 });

  const connectedState = await page.evaluate(() => ({
    savedWallet: localStorage.getItem('tezos-systems-octez-wallet-address') || '',
    savedProfile: localStorage.getItem('tezos-systems-my-baker-address') || '',
    input: document.querySelector('#my-baker-input')?.value || '',
    emptyDisplay: getComputedStyle(document.querySelector('#drawer-empty-state')).display,
    connectedDisplay: getComputedStyle(document.querySelector('#drawer-connected')).display,
    status: document.querySelector('#my-tezos-wallet-status')?.textContent || ''
  }));
  assert(connectedState.savedWallet === SAMPLE_ADDRESS, `my tezos wallet connect: wallet storage mismatch ${JSON.stringify(connectedState)}`);
  assert(connectedState.savedProfile === SAMPLE_ADDRESS, `my tezos wallet connect: profile storage mismatch ${JSON.stringify(connectedState)}`);
  assert(connectedState.input === SAMPLE_ADDRESS, `my tezos wallet connect: profile input mismatch ${JSON.stringify(connectedState)}`);
  assert(connectedState.emptyDisplay === 'none' && connectedState.connectedDisplay !== 'none', `my tezos wallet connect: drawer state mismatch ${JSON.stringify(connectedState)}`);
  assert(connectedState.status.includes('Wallet tz1aWX…T1Z9'), `my tezos wallet connect: status mismatch ${JSON.stringify(connectedState)}`);

  await page.evaluate(() => {
    window.__octezConnectHangDisconnect = true;
  });
  await page.locator('#my-tezos-wallet-disconnect').click();
  await page.waitForFunction(() => {
    const status = document.querySelector('#my-tezos-wallet-status')?.textContent || '';
    return !localStorage.getItem('tezos-systems-octez-wallet-address') && !/Disconnecting wallet/i.test(status);
  }, null, { timeout: 8000 });
  const disconnectedState = await page.evaluate(() => ({
    savedWallet: localStorage.getItem('tezos-systems-octez-wallet-address') || '',
    savedProfile: localStorage.getItem('tezos-systems-my-baker-address') || '',
    status: document.querySelector('#my-tezos-wallet-status')?.textContent || '',
    disconnectAttempts: window.__octezConnectDisconnectAttempts || 0,
    clearActiveCount: window.__octezConnectClearActiveCount || 0
  }));
  assert(disconnectedState.savedWallet === '', `my tezos wallet connect: disconnect should clear wallet storage ${JSON.stringify(disconnectedState)}`);
  assert(disconnectedState.savedProfile === SAMPLE_ADDRESS, `my tezos wallet connect: disconnect should keep My Tezos profile ${JSON.stringify(disconnectedState)}`);
  assert(/Wallet disconnected|No wallet connected/.test(disconnectedState.status), `my tezos wallet connect: disconnect status mismatch ${JSON.stringify(disconnectedState)}`);
  assert(disconnectedState.disconnectAttempts === 1 && disconnectedState.clearActiveCount >= 1, `my tezos wallet connect: hanging disconnect should fall back to local clear ${JSON.stringify(disconnectedState)}`);

  await context.close();
  assert(issues.length === 0, `my tezos wallet connect browser issues:\n${issues.join('\n')}`);
  log('ok - my tezos wallet connect');
}

async function smokeOctezConnectSdkLoader(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, 'octez connect sdk loader', issues);
  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `octez connect sdk loader: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  const sdkState = await page.evaluate(async () => {
    const wallet = await import('/js/core/wallet.js');
    const sdk = await wallet.loadOctezConnect();
    const clientPrototype = sdk.DAppClient?.prototype || {};
    return {
      src: wallet.OCTEZ_CONNECT_SRC,
      hasFactory: typeof sdk.getDAppClientInstance === 'function',
      hasDAppClientClass: typeof sdk.DAppClient === 'function',
      network: sdk.NetworkType?.MAINNET,
      transaction: sdk.TezosOperationType?.TRANSACTION,
      hasActiveEvent: Boolean(sdk.BeaconEvent?.ACTIVE_ACCOUNT_SET),
      hasPermissionsRequest: typeof clientPrototype.requestPermissions === 'function',
      hasOperationRequest: typeof clientPrototype.requestOperation === 'function',
      hasActiveAccountRead: typeof clientPrototype.getActiveAccount === 'function'
    };
  });

  assert(sdkState.src === 'https://esm.sh/@tezos-x/octez.connect-sdk@4.8.5?bundle', `octez connect sdk loader: unexpected SDK source ${JSON.stringify(sdkState)}`);
  assert(sdkState.hasFactory, `octez connect sdk loader: missing dApp client factory ${JSON.stringify(sdkState)}`);
  assert(sdkState.hasDAppClientClass, `octez connect sdk loader: missing DAppClient class ${JSON.stringify(sdkState)}`);
  assert(sdkState.network === 'mainnet', `octez connect sdk loader: missing mainnet enum ${JSON.stringify(sdkState)}`);
  assert(sdkState.transaction === 'transaction', `octez connect sdk loader: missing transaction operation kind ${JSON.stringify(sdkState)}`);
  assert(sdkState.hasActiveEvent, `octez connect sdk loader: missing Beacon active account event ${JSON.stringify(sdkState)}`);
  assert(sdkState.hasPermissionsRequest && sdkState.hasOperationRequest && sdkState.hasActiveAccountRead, `octez connect sdk loader: client shape mismatch ${JSON.stringify(sdkState)}`);

  await context.close();
  assert(issues.length === 0, `octez connect sdk loader browser issues:\n${issues.join('\n')}`);
  log('ok - octez connect sdk loader');
}

async function smokeMyTezosBakerCapacity(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await installFeatureMocks(context);
  await context.addInitScript((address) => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    localStorage.setItem('tezos-systems-my-baker-address', address);
  }, OVERDELEGATED_ADDRESS);

  const page = await context.newPage();
  attachIssueCollectors(page, 'my tezos baker capacity', issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `my tezos baker capacity: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('#my-tezos-btn').click();
  await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos baker capacity drawer');
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('.capacity-bar-card')).some((card) => (
      card.textContent.includes('Delegation Capacity')
      && card.textContent.includes('107.7%')
      && card.textContent.includes('-45,000 ꜩ free')
    ));
  }, null, { timeout: 15000 });

  const capacityState = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.capacity-bar-card'))
      .find((item) => item.textContent.includes('Delegation Capacity'));
    return {
      pct: card?.querySelector('.capacity-bar-pct')?.textContent?.trim() || '',
      details: card?.querySelector('.capacity-bar-details')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      isOver: card?.classList.contains('capacity-over') || false,
      fillWidth: card?.querySelector('.capacity-bar-fill')?.style.width || '',
      bakerText: document.querySelector('#my-baker-results')?.innerText || '',
      octezClass: Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat'))
        .find((item) => (item.textContent || '').toLowerCase().includes('octez version'))?.className || ''
    };
  });

  assert(capacityState.pct === '107.7%', `my tezos baker capacity: over-delegation pct was clamped or wrong: ${capacityState.pct}`);
  assert(capacityState.details.includes('630K ꜩ used'), `my tezos baker capacity: used capacity mismatch: ${capacityState.details}`);
  assert(capacityState.details.includes('-45,000 ꜩ free'), `my tezos baker capacity: free capacity should be signed: ${capacityState.details}`);
  assert(capacityState.isOver, 'my tezos baker capacity: over-capacity state class missing');
  assert(capacityState.fillWidth === '100%', `my tezos baker capacity: visual fill should cap at 100%, saw ${capacityState.fillWidth}`);
  assert(capacityState.bakerText.toLowerCase().includes('octez version') && capacityState.bakerText.includes('v24.4'), `my tezos baker capacity: Octez version missing from baker grid ${JSON.stringify(capacityState)}`);
  assert(capacityState.octezClass.includes('my-baker-octez-critical'), `my tezos baker capacity: older major Octez version should be red/critical ${JSON.stringify(capacityState)}`);

  await context.close();
  assert(issues.length === 0, `my tezos baker capacity browser issues:\n${issues.join('\n')}`);
  log('ok - my tezos baker capacity smoke');
}

async function getMyTezosRewardReport(browser, baseUrl, { address, label, requiredText }) {
  const issues = [];
  const rewardsRequests = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await installFeatureMocks(context);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  let page = null;
  try {
    page = await context.newPage();
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('api.tzkt.io/v1/rewards/')) rewardsRequests.push(url);
    });
    attachIssueCollectors(page, label, issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `${label}: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    await page.locator('#my-tezos-btn').click();
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', `${label} drawer`);
    await page.locator('#drawer-address-input').fill(address);
    await page.locator('#drawer-connect-btn').click();
    await page.waitForFunction(({ address, requiredText }) => {
      const rewardsText = document.querySelector('#rewards-tracker-container')?.innerText || '';
      const statsText = document.querySelector('#my-baker-results')?.innerText || '';
      const briefText = document.querySelector('#drawer-brief')?.innerText || '';
      const combined = `${rewardsText}\n${statsText}\n${briefText}`;
      const combinedLower = combined.toLowerCase();
      return window._myTezosData?.fullAddress === address
        && requiredText.every((text) => combinedLower.includes(text.toLowerCase()));
    }, { address, requiredText }, { timeout: 15000 });

    const state = await page.evaluate(() => {
      const data = window._myTezosData || {};
      const rewardsText = document.querySelector('#rewards-tracker-container')?.innerText?.replace(/\s+/g, ' ').trim() || '';
      const lifetimeText = document.querySelector('#rt-lifetime-card')?.innerText?.replace(/\s+/g, ' ').trim() || '';
      const statsText = document.querySelector('#my-baker-results')?.innerText?.replace(/\s+/g, ' ').trim() || '';
      const statsLabels = Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat-label')).map((el) => el.textContent?.trim());
      return {
        rewardsText,
        lifetimeText,
        statsText,
        statsLabels,
        fullAddress: data.fullAddress,
        isStaker: data.isStaker,
        rewardsLastCycle: data.rewardsLastCycle,
        staked: data.staked,
        totalXTZ: data.totalXTZ
      };
    });

    assert(issues.length === 0, `${label} browser issues:\n${issues.join('\n')}`);
    return { state, rewardsRequests };
  } catch (error) {
    let debug = null;
    if (page) {
      try {
        debug = await page.evaluate(() => ({
          data: window._myTezosData || null,
          rewardsText: document.querySelector('#rewards-tracker-container')?.innerText || '',
          statsText: document.querySelector('#my-baker-results')?.innerText || '',
          briefText: document.querySelector('#drawer-brief')?.innerText || '',
          errorText: document.querySelector('#my-baker-error-msg')?.textContent || '',
          stored: localStorage.getItem('tezos-systems-my-baker-address')
        }));
      } catch {}
    }
    throw new Error(`${label} did not render expected state:\n${JSON.stringify({ debug, rewardsRequests }, null, 2)}\n${error.message}`);
  } finally {
    await context.close();
  }
}

async function smokeMyTezosStakerRewards(browser, baseUrl) {
  const cases = [
    {
      label: 'my tezos staker rewards reported wallet',
      address: SAMPLE_STAKER_ADDRESS,
      expectedLifetime: '1.0856 XTZ',
      expectedCurrent: '0.1676 XTZ',
      expectedLastCycle: 0.16764,
      minStakeRatio: 0.75
    },
    {
      label: 'my tezos staker rewards mostly staked wallet',
      address: SAMPLE_HEAVY_STAKER_ADDRESS,
      expectedLifetime: '91.2112 XTZ',
      expectedCurrent: '16.6054 XTZ',
      expectedLastCycle: 16.605433,
      minStakeRatio: 0.99
    }
  ];

  for (const rewardCase of cases) {
    const { state, rewardsRequests } = await getMyTezosRewardReport(browser, baseUrl, {
      ...rewardCase,
      requiredText: [
        'Protocol staking rewards',
        rewardCase.expectedLifetime,
        rewardCase.expectedCurrent,
        'APY (Staker)',
        'Bkr Missed (10d)'
      ]
    });

    assert(rewardsRequests.some((url) => url.includes(`/rewards/stakers/${rewardCase.address}`)), `${rewardCase.label}: staker rewards endpoint was not requested`);
    assert(!rewardsRequests.some((url) => url.includes(`/rewards/delegators/${rewardCase.address}`)), `${rewardCase.label}: delegator endpoint should not be used when personal staker rows exist`);
    assert(!rewardsRequests.some((url) => url.includes(`/rewards/bakers/${rewardCase.address}`)), `${rewardCase.label}: baker endpoint should not be used for a user account with staker rows`);
    assert(state.lifetimeText.includes('Protocol staking rewards'), `${rewardCase.label}: lifetime card subtitle wrong: ${state.lifetimeText}`);
    assert(state.lifetimeText.includes(rewardCase.expectedLifetime), `${rewardCase.label}: lifetime total should use personal staker rows: ${state.lifetimeText}`);
    assert(state.rewardsText.includes(rewardCase.expectedCurrent), `${rewardCase.label}: this-cycle card should use current staker reward: ${state.rewardsText}`);
    assert(Math.abs(Number(state.rewardsLastCycle) - rewardCase.expectedLastCycle) < 0.00001, `${rewardCase.label}: Morning Brief reward amount wrong: ${state.rewardsLastCycle}`);
    assert(state.isStaker === true, `${rewardCase.label}: Morning Brief should mark account as a staker`);
    assert(Number(state.staked) / Number(state.totalXTZ) >= rewardCase.minStakeRatio, `${rewardCase.label}: stake ratio should match a mostly-staked account: ${state.staked}/${state.totalXTZ}`);
    assert(state.statsLabels.includes('Bkr Missed (10d)'), `${rewardCase.label}: baker missed-right label should be explicit, saw ${state.statsLabels.join(', ')}`);
    assert(state.statsLabels.includes('APY (Staker)'), `${rewardCase.label}: APY label should be staker-specific, saw ${state.statsLabels.join(', ')}`);
    assert(!state.statsLabels.includes('Missed (10d)'), `${rewardCase.label}: ambiguous missed-right label is still present`);
    assert(!state.lifetimeText.includes('9.1000 XTZ'), `${rewardCase.label}: old generic baker mock leaked into lifetime card: ${state.lifetimeText}`);
  }

  log('ok - my tezos staker rewards smoke');
}

async function smokeMyTezosDelegatorRewards(browser, baseUrl) {
  const cases = [
    {
      label: 'my tezos delegator rewards regular wallet',
      address: SAMPLE_REGULAR_DELEGATOR_ADDRESS,
      expectedLifetime: '1.5000 XTZ',
      expectedCurrent: '1.0000 XTZ',
      expectedLastCycle: 1
    },
    {
      label: 'my tezos delegator rewards small wallet',
      address: SAMPLE_SMALL_DELEGATOR_ADDRESS,
      expectedLifetime: '0.5400 XTZ',
      expectedCurrent: '0.4200 XTZ',
      expectedLastCycle: 0.42
    }
  ];

  for (const rewardCase of cases) {
    const { state, rewardsRequests } = await getMyTezosRewardReport(browser, baseUrl, {
      ...rewardCase,
      requiredText: [
        'Estimated delegation share',
        rewardCase.expectedLifetime,
        rewardCase.expectedCurrent,
        'APY (Delegator)',
        'Bkr Missed (10d)'
      ]
    });

    assert(rewardsRequests.some((url) => url.includes(`/rewards/delegators/${rewardCase.address}`)), `${rewardCase.label}: delegator rewards endpoint was not requested`);
    assert(!rewardsRequests.some((url) => url.includes(`/rewards/stakers/${rewardCase.address}`)), `${rewardCase.label}: staker endpoint should not be used for a zero-stake delegator with reward rows`);
    assert(!rewardsRequests.some((url) => url.includes(`/rewards/bakers/${rewardCase.address}`)), `${rewardCase.label}: baker endpoint should not be used for a regular delegator`);
    assert(state.lifetimeText.includes('Estimated delegation share'), `${rewardCase.label}: lifetime card subtitle wrong: ${state.lifetimeText}`);
    assert(state.lifetimeText.includes(rewardCase.expectedLifetime), `${rewardCase.label}: lifetime total should use delegator estimate rows: ${state.lifetimeText}`);
    assert(state.rewardsText.includes(rewardCase.expectedCurrent), `${rewardCase.label}: this-cycle card should use current delegator estimate: ${state.rewardsText}`);
    assert(Math.abs(Number(state.rewardsLastCycle) - rewardCase.expectedLastCycle) < 0.00001, `${rewardCase.label}: Morning Brief delegator reward amount wrong: ${state.rewardsLastCycle}`);
    assert(state.isStaker === false, `${rewardCase.label}: Morning Brief should not mark a zero-stake delegator as a staker`);
    assert(Number(state.staked) === 0, `${rewardCase.label}: staked amount should stay zero: ${state.staked}`);
    assert(state.statsLabels.includes('APY (Delegator)'), `${rewardCase.label}: APY label should be delegator-specific, saw ${state.statsLabels.join(', ')}`);
    assert(state.statsLabels.includes('Bkr Missed (10d)'), `${rewardCase.label}: delegated wallet should still label baker missed rights explicitly, saw ${state.statsLabels.join(', ')}`);
    assert(!state.lifetimeText.includes('Protocol staking rewards'), `${rewardCase.label}: delegator report should not use staking copy: ${state.lifetimeText}`);
    assert(!state.lifetimeText.includes('9.1000 XTZ'), `${rewardCase.label}: old generic baker mock leaked into lifetime card: ${state.lifetimeText}`);
  }

  log('ok - my tezos delegator rewards smoke');
}

async function smokeMyTezosAddressSwitch(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await installFeatureMocks(context);
  await context.addInitScript((address) => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    localStorage.setItem('tezos-systems-my-baker-address', address);
  }, SAMPLE_ADDRESS);

  const page = await context.newPage();
  attachIssueCollectors(page, 'my tezos address switch', issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `my tezos address switch: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('#my-tezos-btn').click();
  await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos address switch drawer');
  await page.locator('#my-baker-input').waitFor({ state: 'visible', timeout: 5000 });
  await assert(
    (await page.locator('#my-baker-input').inputValue()) === SAMPLE_ADDRESS,
    'my tezos address switch: saved address did not populate connected input'
  );

  await page.locator('#my-baker-input').fill(SAMPLE_ADDRESS_2);
  await page.waitForFunction(() => document.querySelector('#my-baker-save')?.textContent?.trim() === 'Save', null, { timeout: 3000 });
  await page.locator('#my-baker-save').click();
  await page.waitForFunction((address) => localStorage.getItem('tezos-systems-my-baker-address') === address, SAMPLE_ADDRESS_2, { timeout: 5000 });
  try {
    await page.waitForFunction((address) => window._myTezosData?.fullAddress === address, SAMPLE_ADDRESS_2, { timeout: 15000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      stored: localStorage.getItem('tezos-systems-my-baker-address'),
      myTezosData: window._myTezosData ? {
        fullAddress: window._myTezosData.fullAddress,
        address: window._myTezosData.address,
        bakerAddr: window._myTezosData.bakerAddr,
        isBaker: window._myTezosData.isBaker
      } : null,
      briefText: document.querySelector('#drawer-brief')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      errorText: document.querySelector('#my-baker-error-msg')?.textContent?.trim() || '',
      saveButton: document.querySelector('#my-baker-save')?.textContent?.trim() || '',
      resources: performance.getEntriesByType('resource')
        .filter((entry) => /api\.tzkt|objkt|tezos\.domains|tez\.capital|coingecko/.test(entry.name))
        .map((entry) => ({
          name: entry.name,
          duration: Math.round(entry.duration),
          responseEnd: Math.round(entry.responseEnd)
        }))
        .slice(-25)
    }));
    throw new Error(`my tezos address switch: My Tezos data did not refresh after save (${error.message}); debug=${JSON.stringify(debug)}; issues=${issues.join(' | ')}`);
  }
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat')).some((stat) => (
      stat.textContent.includes('Ext. Delegated') && stat.textContent.includes('220,000.00')
    ));
  }, null, { timeout: 15000 });

  const state = await page.evaluate(() => ({
    stored: localStorage.getItem('tezos-systems-my-baker-address'),
    input: document.querySelector('#my-baker-input')?.value || '',
    button: document.querySelector('#my-baker-save')?.textContent?.trim() || '',
    extDelegated: Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat')).find((stat) => (
      stat.textContent.includes('Ext. Delegated')
    ))?.textContent?.replace(/\s+/g, ' ').trim() || '',
    header: document.querySelector('#my-tezos-btn .nav-label')?.textContent || ''
  }));

  assert(state.stored === SAMPLE_ADDRESS_2, `my tezos address switch: localStorage kept stale address ${state.stored}`);
  assert(state.input === SAMPLE_ADDRESS_2, `my tezos address switch: connected input mismatch ${state.input}`);
  assert(state.button === '📋 Copy', `my tezos address switch: save button did not return to copy mode, saw ${state.button}`);
  assert(state.extDelegated.includes('220,000.00'), `my tezos address switch: drawer still shows stale baker metrics: ${state.extDelegated}`);
  assert(!state.header.includes(SAMPLE_ADDRESS.slice(0, 6)), `my tezos address switch: header still points at old baker: ${state.header}`);

  await context.close();
  assert(issues.length === 0, `my tezos address switch browser issues:\n${issues.join('\n')}`);
  log('ok - my tezos address switch smoke');
}

async function smokeMyTezosProposalAttribution(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context);
  await context.addInitScript((address) => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    localStorage.setItem('tezos-systems-my-baker-address', address);
  }, SAMPLE_DELEGATOR_ADDRESS);

  const page = await context.newPage();
  attachIssueCollectors(page, 'my tezos proposal attribution', issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `my tezos proposal attribution: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  await page.locator('#my-tezos-btn').click();
  await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos proposal attribution drawer');
  await page.waitForFunction((address) => {
    const story = window._myTezosData?.story;
    return window._myTezosData?.fullAddress === address
      && story?.proposalsInjected === 0
      && story?.bakerProposalsInjected === 1
      && story?.nftAssetsCollected === 501
      && story?.creatorStats?.totalCreated === 501
      && story?.creatorStats?.totalSalesVolume === 2.5
      && story?.domainAlias === 'qa-baker.tez';
  }, SAMPLE_DELEGATOR_ADDRESS, { timeout: 15000 });

  const storyText = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('#drawer-brief .brief-section'));
    const story = sections.find((section) => section.textContent.includes('Your Tezos Story'));
    return story?.textContent?.replace(/\s+/g, ' ').trim() || '';
  });

  assert(storyText.includes('Baker injected 1 accepted proposal'), `my tezos proposal attribution: missing baker attribution: ${storyText}`);
  assert(!storyText.includes('📜 Injected 1 accepted proposal'), `my tezos proposal attribution: delegator was credited as initiator: ${storyText}`);
  assert(storyText.includes('Smoke'), `my tezos proposal attribution: proposal alias missing: ${storyText}`);
  assert(storyText.includes('Collected 501 NFTs'), `my tezos proposal attribution: NFT collection count missing: ${storyText}`);
  assert(storyText.includes('Created 501 NFTs') && storyText.includes('2.50 XTZ sales'), `my tezos proposal attribution: creator stats missing: ${storyText}`);
  assert(storyText.includes('Known as qa-baker.tez'), `my tezos proposal attribution: domain alias missing: ${storyText}`);

  await page.waitForFunction(() => document.querySelectorAll('#drawer-brief .tezos-story-dossier .tezos-story-metric').length >= 4, null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('#drawer-network .network-signal').length >= 4, null, { timeout: 15000 });
  const storySurface = await page.evaluate(() => ({
    metrics: document.querySelectorAll('#drawer-brief .tezos-story-dossier .tezos-story-metric').length,
    badges: document.querySelectorAll('#drawer-brief .tezos-story-dossier .tezos-story-badge').length,
    eras: document.querySelectorAll('#drawer-brief .tezos-story-dossier .tezos-story-era-dot.witnessed, #drawer-brief .tezos-story-dossier .tezos-story-era-dot.joined, #drawer-brief .tezos-story-dossier .tezos-story-era-dot.current').length,
    next: document.querySelector('#drawer-brief .tezos-story-dossier .tezos-story-next')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    signals: document.querySelectorAll('#drawer-network .network-signal').length,
    focus: document.querySelector('#drawer-network .network-context-focus')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    networkText: document.querySelector('#drawer-network')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    legacyList: document.querySelectorAll('#drawer-network .network-context-list li').length
  }));
  assert(storySurface.metrics >= 4, `my tezos proposal attribution: story metrics missing: ${JSON.stringify(storySurface)}`);
  assert(storySurface.badges >= 5, `my tezos proposal attribution: story badges too thin: ${JSON.stringify(storySurface)}`);
  assert(storySurface.eras >= 3, `my tezos proposal attribution: protocol era rail missing: ${JSON.stringify(storySurface)}`);
  assert(storySurface.next.includes('Now watching') || storySurface.next.includes('Now compounding'), `my tezos proposal attribution: next signal missing: ${storySurface.next}`);
  assert(storySurface.signals >= 4, `my tezos proposal attribution: network context signals missing: ${JSON.stringify(storySurface)}`);
  assert(/Baker|Governance|Collector|Creator|Portfolio|Network/.test(storySurface.focus), `my tezos proposal attribution: network context focus chips missing: ${storySurface.focus}`);
  assert(storySurface.networkText.includes('Network Context') && storySurface.networkText.includes('Cycle'), `my tezos proposal attribution: network context header missing: ${storySurface.networkText}`);
  assert(storySurface.legacyList === 0, `my tezos proposal attribution: network context still renders legacy bullet list: ${storySurface.networkText}`);

  const networkRoutes = await page.evaluate(() => ({
    header: {
      title: document.querySelector('#drawer-network .network-context-title')?.getAttribute('data-network-route') || '',
      cycle: document.querySelector('#drawer-network .network-context-cycle')?.getAttribute('data-network-route') || ''
    },
    focus: Object.fromEntries(Array.from(document.querySelectorAll('#drawer-network .network-focus-chip')).map((chip) => [
      chip.getAttribute('data-focus'),
      {
        tag: chip.tagName,
        href: chip.getAttribute('href') || '',
        route: chip.getAttribute('data-network-route') || '',
        aria: chip.getAttribute('aria-label') || ''
      }
    ])),
    signals: Array.from(document.querySelectorAll('#drawer-network .network-signal')).map((signal) => ({
      tag: signal.tagName,
      category: signal.getAttribute('data-category') || '',
      href: signal.getAttribute('href') || '',
      route: signal.getAttribute('data-network-route') || '',
      aria: signal.getAttribute('aria-label') || ''
    }))
  }));
  assert(networkRoutes.header.title === '#health' && networkRoutes.header.cycle === '#history', `my tezos proposal attribution: network context header routes missing: ${JSON.stringify(networkRoutes.header)}`);
  const renderedFocusRoutes = Object.values(networkRoutes.focus);
  assert(renderedFocusRoutes.length >= 1 && renderedFocusRoutes.every((chip) => chip.tag === 'A' && chip.href.startsWith('#') && chip.route.startsWith('#') && /Open|Enter/.test(chip.aria)), `my tezos proposal attribution: rendered focus chips are not clickable routes: ${JSON.stringify(networkRoutes.focus)}`);
  assert(networkRoutes.focus.baker?.tag === 'A' && networkRoutes.focus.baker.route === '#my-baker', `my tezos proposal attribution: baker chip route mismatch: ${JSON.stringify(networkRoutes.focus)}`);
  assert(networkRoutes.signals.length >= 4 && networkRoutes.signals.every((signal) => signal.tag === 'A' && signal.href.startsWith('#') && signal.route.startsWith('#') && /Open|Enter/.test(signal.aria)), `my tezos proposal attribution: network signal routes missing: ${JSON.stringify(networkRoutes.signals)}`);

  await page.locator('#drawer-brief .story-share-btn').click();
  await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
  const shareState = await page.evaluate(() => ({
    picker: document.querySelector('#share-modal .tweet-picker')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    captured: window.__lastHtml2CanvasText?.replace(/\s+/g, ' ').trim() || ''
  }));
  assert(shareState.picker.includes('qa-baker.tez'), `my tezos proposal attribution: share tweet picker missing domain alias: ${shareState.picker}`);
  assert(shareState.captured.includes('Known as qa-baker.tez'), `my tezos proposal attribution: share card capture missing domain alias: ${shareState.captured}`);
  assert(shareState.picker.includes('Collected 501 NFTs'), `my tezos proposal attribution: share tweet picker missing NFT count: ${shareState.picker}`);
  assert(shareState.captured.includes('Collected 501 NFTs'), `my tezos proposal attribution: share card capture missing NFT count: ${shareState.captured}`);
  assert(shareState.picker.includes('Created 501 NFTs'), `my tezos proposal attribution: share tweet picker missing creator stats: ${shareState.picker}`);
  assert(shareState.captured.includes('Created 501 NFTs') && shareState.captured.includes('2.50 XTZ sales'), `my tezos proposal attribution: share card capture missing creator stats: ${shareState.captured}`);
  assert(!shareState.captured.includes('Lived through'), `my tezos proposal attribution: share card still includes governance cycles: ${shareState.captured}`);
  await expectShareModal(page, 'my tezos proposal attribution share', issues);

  await page.locator('#drawer-network .network-context-cycle').click();
  await page.waitForFunction(() => window.location.hash === '#history' && !document.querySelector('#my-tezos-drawer')?.classList.contains('open'), null, { timeout: 5000 });
  await page.locator('#history-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 10000 });

  await context.close();
  assert(issues.length === 0, `my tezos proposal attribution browser issues:\n${issues.join('\n')}`);
  log('ok - my tezos proposal attribution smoke');
}

async function runMyTezosDeepLinkOverride(browser, baseUrl, scenario) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  const dashboardHtml = scenario.dashboardPathnames?.length
    ? await fetch(`${baseUrl}/`, { cache: 'no-store' }).then((response) => response.text())
    : '';
  await installFeatureMocks(context, {
    baseUrl,
    dashboardHtml,
    dashboardPathnames: scenario.dashboardPathnames || [],
    forwardDomainAddress: scenario.forwardDomainAddress
  });
  await context.addInitScript((staleAddress) => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    localStorage.setItem('tezos-systems-my-baker-address', staleAddress);
  }, SAMPLE_ADDRESS);

  const page = await context.newPage();
  attachIssueCollectors(page, scenario.label, issues);

  const response = await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `${scenario.label}: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 25000 });
  await page.waitForFunction((address) => localStorage.getItem('tezos-systems-my-baker-address') === address, scenario.expectedAddress, { timeout: 5000 });
  await page.waitForFunction((address) => window._myTezosData?.fullAddress === address, scenario.expectedAddress, { timeout: 25000 });
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat')).some((stat) => (
      stat.textContent.includes('Ext. Delegated') && stat.textContent.includes('220,000.00')
    ));
  }, null, { timeout: 25000 });

  const state = await page.evaluate(() => ({
    stored: localStorage.getItem('tezos-systems-my-baker-address'),
    input: document.querySelector('#my-baker-input')?.value || '',
    header: document.querySelector('#my-tezos-btn .nav-label')?.textContent || '',
    staleMetricStillVisible: Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat')).some((stat) => (
      stat.textContent.includes('Ext. Delegated') && stat.textContent.includes('180,000.00')
    ))
  }));

  assert(state.stored === scenario.expectedAddress, `${scenario.label}: localStorage kept stale address ${state.stored}`);
  assert(state.input === scenario.expectedAddress, `${scenario.label}: drawer input mismatch ${state.input}`);
  assert(!state.header.includes(SAMPLE_ADDRESS.slice(0, 6)), `${scenario.label}: header still shows stale address: ${state.header}`);
  assert(!state.staleMetricStillVisible, `${scenario.label}: stale baker metrics remained visible`);

  await context.close();
  assert(issues.length === 0, `${scenario.label} browser issues:\n${issues.join('\n')}`);
}

async function smokeMyTezosDeepLinkOverridesStale(browser, baseUrl) {
  const directAddressPath = `/${SAMPLE_ADDRESS_2}`;
  const directDomainPath = '/qa-baker.tez';
  const scenarios = [
    {
      label: 'my tezos hash address deep link override',
      path: `/#my-baker=${SAMPLE_ADDRESS_2}`,
      expectedAddress: SAMPLE_ADDRESS_2
    },
    {
      label: 'my tezos hash domain deep link override',
      path: '/#my-baker=qa-baker.tez',
      expectedAddress: SAMPLE_ADDRESS_2,
      forwardDomainAddress: SAMPLE_ADDRESS_2
    },
    {
      label: 'my tezos direct address path override',
      path: directAddressPath,
      expectedAddress: SAMPLE_ADDRESS_2,
      dashboardPathnames: [directAddressPath]
    },
    {
      label: 'my tezos direct domain path override',
      path: directDomainPath,
      expectedAddress: SAMPLE_ADDRESS_2,
      dashboardPathnames: [directDomainPath],
      forwardDomainAddress: SAMPLE_ADDRESS_2
    }
  ];

  for (const scenario of scenarios) {
    await runMyTezosDeepLinkOverride(browser, baseUrl, scenario);
    log(`ok - ${scenario.label}`);
  }
  log('ok - my tezos deep link override smoke');
}

async function smokeNetworkHealthChamber(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context, { blockHeadLagMs: 90000 });
  await context.addInitScript((myBakerAddress) => {
    window.__tezosSystemsIntervals = [];
    const originalSetInterval = window.setInterval.bind(window);
    window.setInterval = (handler, timeout, ...args) => {
      const id = originalSetInterval(handler, timeout, ...args);
      window.__tezosSystemsIntervals.push({ handler, id, timeout });
      return id;
    };
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    localStorage.setItem('tezos-systems-my-baker-address', myBakerAddress);
    localStorage.setItem('tezos-systems-network-health', JSON.stringify({
      updatedAt: Date.now(),
      periodUpdatedAt: Date.now(),
      headLevel: 12345678,
      blocks: [],
      summary: { score: 99.8, totalPower: 34930, totalCommittee: 35000, missingPower: 70, count: 5 },
      periods: [
        { key: '24h', label: '24H', score: 99.8, actualPower: 1000, possiblePower: 1002, missingPower: 2, blocks: 14400, sampleSize: 5, sampled: false },
        { key: '7d', label: '7D', score: 99.7, actualPower: 1000, possiblePower: 1003, missingPower: 3, blocks: 100800, sampleSize: 5, sampled: true },
        { key: '31d', label: '31D', score: 99.6, actualPower: 1000, possiblePower: 1004, missingPower: 4, blocks: 446400, sampleSize: 5, sampled: true }
      ]
    }));
  }, SAMPLE_ADDRESS_2);
  const page = await context.newPage();
  attachIssueCollectors(page, 'network health chamber', issues);

  const response = await page.goto(`${baseUrl}/#health`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `network health chamber: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#health-recent-block-list .health-block-row').length >= 4, null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('#health-missed-attester-list .health-attester-row').length >= 2, null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('#health-activity-list .health-activity-row').length >= 1, null, { timeout: 10000 });
  await page.waitForFunction(() => /Teztale/.test(document.querySelector('#health-teztale-consensus')?.textContent || ''), null, { timeout: 10000 });
  await page.waitForFunction(() => /Octez Versions/.test(document.querySelector('#health-octez-versions')?.textContent || ''), null, { timeout: 10000 });
  await page.waitForFunction(() => /Block/.test(document.querySelector('#block-ticker-line')?.textContent || ''), null, { timeout: 10000 });
  await page.waitForFunction(() => /^\d+$/.test(document.querySelector('#hero-chain-uptime-bakers')?.textContent || ''), null, { timeout: 10000 });

  const healthState = await page.evaluate(() => {
    const modal = document.querySelector('#network-health-modal');
    const header = document.querySelector('.header');
    const topProof = document.querySelector('#top-continuity-panel');
    const card = document.querySelector('[data-stat="network-health"]');
    const ticker = document.querySelector('#block-ticker-strip');
    const tickerButton = document.querySelector('#block-ticker-button');
    const tickerLine = document.querySelector('#block-ticker-line');
    const healthProof = modal?.querySelector('#health-chain-proof');
    const tickerKicker = ticker?.querySelector('.block-ticker-kicker');
    const tickerPulse = ticker?.querySelector('#uptime-pulse-dot.block-ticker-pulse');
    const priceBar = document.querySelector('#price-bar');
    const upgradeClock = document.querySelector('#upgrade-clock');
    const commandDeckPanel = document.querySelector('.upgrade-clock-content');
    const main = document.querySelector('main.main-content');
    const chambersSection = document.querySelector('#chambers-section');
    const tickerRect = ticker?.getBoundingClientRect();
    const upgradeClockRect = upgradeClock?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    const chambersRect = chambersSection?.getBoundingClientRect();
    const tickerStyles = ticker ? getComputedStyle(ticker) : null;
    const commandDeckPanelStyles = commandDeckPanel ? getComputedStyle(commandDeckPanel) : null;
    const tickerPulseStyles = tickerPulse ? getComputedStyle(tickerPulse) : null;
    const tickerBlockValue = tickerLine?.querySelector('.block-ticker-level .block-ticker-value');
    const tickerBakerValue = tickerLine?.querySelector('.block-ticker-baker .block-ticker-value');
    const tickerHealthValue = tickerLine?.querySelector('.block-ticker-health .block-ticker-value');
    const tickerOctezSegment = tickerLine?.querySelector('.block-ticker-octez');
    const tickerOctezValue = tickerLine?.querySelector('.block-ticker-octez .block-ticker-value');
    const tickerAgeValue = tickerLine?.querySelector('.block-ticker-age .block-ticker-value');
    const tickerSegmentOrder = Array.from(tickerLine?.querySelectorAll('.block-ticker-segment') || []).map((segment) => {
      const keys = ['level', 'baker', 'health', 'octez', 'power', 'round', 'age'];
      return keys.find((key) => segment.classList.contains(`block-ticker-${key}`)) || '';
    });
    const measureTickerText = (source, text) => {
      if (!source) return 0;
      const probe = document.createElement('span');
      const style = getComputedStyle(source);
      probe.textContent = text;
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.whiteSpace = 'nowrap';
      probe.style.font = style.font;
      probe.style.fontVariantNumeric = style.fontVariantNumeric;
      probe.style.letterSpacing = style.letterSpacing;
      document.body.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };
    return {
      title: modal?.querySelector('.chamber-title')?.textContent || '',
      badge: modal?.querySelector('#health-header-badge')?.textContent || '',
      live: modal?.dataset.healthLive || '',
      refreshState: modal?.querySelector('#health-refresh-state')?.textContent || '',
      hero: modal?.querySelector('#health-hero-score')?.textContent || '',
      avg: modal?.querySelector('#health-avg-block')?.textContent || '',
      blockRows: modal?.querySelectorAll('#health-recent-block-list .health-block-row').length || 0,
      roundOne: modal?.querySelectorAll('.health-round-badge.round-watch').length || 0,
      attesterRows: modal?.querySelectorAll('#health-missed-attester-list .health-attester-row').length || 0,
      missedBlockRows: modal?.querySelectorAll('#health-missed-block-list .health-missed-block-row').length || 0,
      activityRows: modal?.querySelectorAll('#health-activity-list .health-activity-row').length || 0,
      activityText: modal?.querySelector('#health-activity-list')?.textContent || '',
      incidentMemory: modal?.querySelector('#health-incident-memory')?.textContent || '',
      cycleTiming: modal?.querySelector('#health-cycle-timing')?.textContent || '',
      cycleTimingCells: modal?.querySelectorAll('#health-cycle-strip .health-cycle-cell').length || 0,
      cycleTimingStatus: modal?.querySelector('#health-cycle-status')?.textContent || '',
      teztale: modal?.querySelector('#health-teztale-consensus')?.textContent || '',
      teztaleQuorum: modal?.querySelector('#health-teztale-quorum')?.textContent || '',
      teztaleSources: modal?.querySelector('#health-teztale-source-count')?.textContent || '',
      teztaleOps: modal?.querySelector('#health-teztale-ops')?.textContent || '',
      teztaleCreditHref: modal?.querySelector('#health-teztale-credit a[href*="teztale-dataviz"]')?.href || '',
      teztaleNomadicHref: modal?.querySelector('#health-teztale-credit a[href*="nomadic-labs/teztale"]')?.href || '',
      teztaleEvents: modal?.querySelectorAll('#health-teztale-events .health-consensus-event').length || 0,
      octezVersions: modal?.querySelector('#health-octez-versions')?.textContent || '',
      octezCurrent: modal?.querySelector('#health-octez-current')?.textContent || '',
      octezLatestPower: modal?.querySelector('#health-octez-latest-power')?.textContent || '',
      octezKnown: modal?.querySelector('#health-octez-known')?.textContent || '',
      octezUpdatedAge: modal?.querySelector('#health-octez-updated')?.textContent || '',
      octezRows: modal?.querySelectorAll('#health-octez-version-list .health-octez-version-row').length || 0,
      octezLaggers: modal?.querySelectorAll('#health-octez-laggards .health-octez-laggard-row').length || 0,
      periodTelemetry: modal?.querySelector('#health-period-telemetry')?.textContent || '',
      networkLoad: modal?.querySelector('#health-network-load')?.textContent || '',
      myBaker: modal?.querySelector('.health-my-baker-panel')?.textContent || '',
      myBakerStatus: modal?.querySelector('.health-my-baker-status')?.textContent || '',
      myBakerMetrics: Array.from(modal?.querySelectorAll('.health-my-baker-metrics strong') || []).map((el) => el.textContent || ''),
      topProofText: topProof?.textContent || '',
      topProofInHeader: Boolean(topProof && header?.contains(topProof)),
      topProofTag: topProof?.tagName || '',
      topProofType: topProof?.getAttribute('type') || '',
      topProofAriaControls: topProof?.getAttribute('aria-controls') || '',
      topProofHistoryWired: topProof?.dataset.historyWired || '',
      topProofCounter: topProof?.querySelector('#hero-chain-uptime-counter')?.textContent || '',
      topProofBakers: topProof?.querySelector('#hero-chain-uptime-bakers')?.textContent || '',
      topProofFinality: topProof?.querySelector('#hero-chain-uptime-finality')?.textContent || '',
      topProofStaked: topProof?.querySelector('#hero-chain-uptime-staked')?.textContent || '',
      topProofIssuance: topProof?.querySelector('#hero-chain-uptime-issuance')?.textContent || '',
      systemLinks: modal?.querySelectorAll('.health-baker-name-link[href^="#baker="]').length || 0,
      tzktLinks: modal?.querySelectorAll('.lb-baker-source-link[href^="https://tzkt.io/"]').length || 0,
      footer: modal?.querySelector('.chamber-footer')?.textContent || '',
      headMeta: modal?.querySelector('#health-head-meta')?.textContent || '',
      updatedAge: modal?.querySelector('.health-score-panel [data-health-age]')?.textContent || '',
      updatedAgeMs: modal?.querySelector('.health-score-panel [data-health-age]')?.dataset.healthAge
        ? Date.now() - new Date(modal.querySelector('.health-score-panel [data-health-age]').dataset.healthAge).getTime()
        : 0,
      ageLabelCount: modal?.querySelectorAll('[data-health-age]').length || 0,
      cardWired: card?.dataset.healthChamberWired || '',
      cardRole: card?.getAttribute('role') || '',
      cardTabIndex: card?.getAttribute('tabindex') || '',
      cardCue: Boolean(card?.querySelector('.chamber-expand-cue')),
      cardWide: card?.classList.contains('chamber-entry-wide') || false,
      cardCopyHash: card?.querySelector('.card-copy-link')?.dataset.copyHash || '',
      cardUpdatedLabel: card?.dataset.updatedLabel || '',
      cardFreshnessState: card?.dataset.freshnessState || '',
      cardFreshnessTimestamp: card?.dataset.freshnessTimestamp || '',
      cardFreshnessStaleAfter: card?.dataset.freshnessStaleAfter || '',
      cardFreshnessAgeMs: card?.dataset.freshnessTimestamp
        ? Date.now() - Number(card.dataset.freshnessTimestamp)
        : 0,
      cardStale: card?.classList.contains('chamber-data-stale') || false,
      cardTape: card?.querySelector('#network-health-live-tape')?.textContent || '',
      cardHasProofStrip: Boolean(card?.querySelector('#network-health-proof, #chain-uptime-counter')),
      blockTickerOwnIsland: ticker?.tagName === 'SECTION' && ticker?.parentElement === document.body,
      blockTickerAfterHeader: ticker?.previousElementSibling?.classList.contains('header') || false,
      blockTickerBeforeCommandDeck: ticker?.nextElementSibling?.id === 'upgrade-clock',
      blockTickerBeforeMainContent: Boolean(ticker && main && (ticker.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING)),
      blockTickerAboveCommandDeck: Boolean(tickerRect && upgradeClockRect && tickerRect.bottom < upgradeClockRect.top),
      blockTickerAboveChambers: Boolean(tickerRect && chambersRect && tickerRect.bottom < chambersRect.top),
      blockTickerClearOfCommandDeck: Boolean(tickerRect && upgradeClockRect && upgradeClockRect.top - tickerRect.bottom >= 8),
      blockTickerClearOfMainContent: Boolean(tickerRect && mainRect && mainRect.top - tickerRect.bottom >= 0),
      blockTickerMarginTop: tickerStyles?.marginTop || '',
      blockTickerText: tickerLine?.textContent || '',
      blockTickerHasUptimeProof: Boolean(ticker?.querySelector('#block-ticker-uptime, #chain-uptime-counter')),
      networkHealthProofText: healthProof?.textContent || '',
      networkHealthProofCounter: healthProof?.querySelector('#chain-uptime-counter')?.textContent || '',
      networkHealthProofBakers: healthProof?.querySelector('#chain-uptime-bakers')?.textContent || '',
      networkHealthProofFinality: healthProof?.querySelector('#chain-uptime-finality')?.textContent || '',
      networkHealthProofStaked: healthProof?.querySelector('#chain-uptime-staked')?.textContent || '',
      networkHealthProofIssuance: healthProof?.querySelector('#chain-uptime-issuance')?.textContent || '',
      blockTickerHealth: ticker?.dataset.blockHealth || '',
      blockTickerSignature: tickerLine?.dataset.blockTickerSignature || '',
      blockTickerSegmentOrder: tickerSegmentOrder,
      blockTickerTransitionCount: tickerLine?.dataset.blockTickerTransitionCount || '',
      blockTickerWired: tickerButton?.dataset.blockTickerWired || '',
      blockTickerTitle: tickerButton?.getAttribute('title') || '',
      blockTickerKickerText: tickerKicker?.textContent?.trim() || '',
      blockTickerPulseCount: document.querySelectorAll('#uptime-pulse-dot').length,
      blockTickerPulseInTicker: Boolean(tickerPulse),
      blockTickerPulseWidth: tickerPulseStyles ? parseFloat(tickerPulseStyles.width) : 0,
      blockTickerPulseBg: tickerPulseStyles?.backgroundColor || '',
      topPriceBarText: priceBar?.textContent?.replace(/\s+/g, ' ').trim() || '',
      topPriceBarHasBlockReadout: Boolean(priceBar?.querySelector('#cycle-chip-block')),
      topPriceBarHasBlockAge: Boolean(priceBar?.querySelector('#uptime-block-age')),
      topPriceBarHasPulseDot: Boolean(priceBar?.querySelector('#uptime-pulse-dot')),
      blockTickerBlockWidth: tickerBlockValue ? parseFloat(getComputedStyle(tickerBlockValue).width) : 0,
      blockTickerBakerWidth: tickerBakerValue ? parseFloat(getComputedStyle(tickerBakerValue).width) : 0,
      blockTickerHealthWidth: tickerHealthValue ? parseFloat(getComputedStyle(tickerHealthValue).width) : 0,
      blockTickerDegradedWidth: measureTickerText(tickerHealthValue, 'Degraded'),
      blockTickerOctezText: tickerOctezValue?.textContent || '',
      blockTickerOctezClass: tickerOctezSegment?.className || '',
      blockTickerOctezWidth: tickerOctezValue ? parseFloat(getComputedStyle(tickerOctezValue).width) : 0,
      blockTickerValueAlignments: [tickerBlockValue, tickerBakerValue, tickerHealthValue, tickerOctezValue, tickerAgeValue]
        .map((el) => el ? getComputedStyle(el).textAlign : ''),
      blockTickerAgeText: tickerAgeValue?.textContent || '',
      blockTickerAgeWidth: tickerAgeValue ? parseFloat(getComputedStyle(tickerAgeValue).width) : 0,
      blockTickerAgeMs: tickerLine?.querySelector('[data-health-age]')?.dataset.healthAge
        ? Date.now() - new Date(tickerLine.querySelector('[data-health-age]').dataset.healthAge).getTime()
        : 0,
      commandDeckPanelBorderWidth: commandDeckPanelStyles ? parseFloat(commandDeckPanelStyles.borderTopWidth) : 0,
      commandDeckPanelBorderStyle: commandDeckPanelStyles?.borderTopStyle || '',
      commandDeckPanelBorderRadius: commandDeckPanelStyles ? parseFloat(commandDeckPanelStyles.borderTopLeftRadius) : 0,
      intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
    };
  });

  assert(/Network Health Chamber/.test(healthState.title), `network health chamber: title mismatch: ${healthState.title}`);
  assert(/Healthy|Watch/.test(healthState.badge), `network health chamber: badge mismatch: ${healthState.badge}`);
  assert(healthState.live === 'true', `network health chamber: live refresh should be active, saw ${healthState.live}`);
  assert(/auto-refresh 6s/.test(healthState.refreshState), `network health chamber: refresh label mismatch: ${healthState.refreshState}`);
  assert(/%/.test(healthState.hero), `network health chamber: hero score missing: ${healthState.hero}`);
  assert(/s/.test(healthState.avg), `network health chamber: average block time missing: ${healthState.avg}`);
  assert(healthState.blockRows >= 4, `network health chamber: recent block rows missing, saw ${healthState.blockRows}`);
  assert(healthState.roundOne >= 1, 'network health chamber: round-one block badge missing');
  assert(healthState.attesterRows >= 2, `network health chamber: missed attester rows missing, saw ${healthState.attesterRows}`);
  assert(healthState.missedBlockRows >= 1, `network health chamber: missed block rows missing, saw ${healthState.missedBlockRows}`);
  assert(healthState.activityRows >= 1, `network health chamber: activity tape rows missing, saw ${healthState.activityRows}`);
  assert(/QA Baker|Second Baker|XTZ/.test(healthState.activityText), `network health chamber: activity tape content mismatch: ${healthState.activityText}`);
  assert(/Incident Memory/.test(healthState.incidentMemory) && /Missed/.test(healthState.incidentMemory), `network health chamber: incident memory missing: ${healthState.incidentMemory}`);
  assert(/Cycle Timing/.test(healthState.cycleTiming) && /Last cycle/.test(healthState.cycleTiming) && /Target/.test(healthState.cycleTiming), `network health chamber: cycle timing panel missing: ${healthState.cycleTiming}`);
  assert(healthState.cycleTimingCells >= 4, `network health chamber: cycle timing strip too sparse: ${healthState.cycleTimingCells}`);
  assert(/Watch|slow|target/i.test(healthState.cycleTimingStatus), `network health chamber: cycle timing status missing drift context: ${healthState.cycleTimingStatus}`);
  assert(/Consensus Lens/.test(healthState.teztale) && /Teztale/.test(healthState.teztale) && /Nomadic Labs/.test(healthState.teztale), `network health chamber: Teztale consensus lens missing credit/context: ${healthState.teztale}`);
  assert(/head #12,345,678 collecting/.test(healthState.teztale), `network health chamber: partial Teztale head context missing: ${healthState.teztale}`);
  assert(/s$/.test(healthState.teztaleQuorum), `network health chamber: Teztale quorum timing missing: ${healthState.teztaleQuorum}`);
  assert(healthState.teztaleSources === '3', `network health chamber: Teztale source count mismatch: ${healthState.teztaleSources}`);
  assert(/complete rounds/.test(healthState.teztaleOps) && /sampled levels/.test(healthState.teztaleOps) && /power/.test(healthState.teztaleOps), `network health chamber: Teztale coverage report missing: ${healthState.teztaleOps}`);
  assert(healthState.teztaleEvents >= 1, `network health chamber: Teztale report rows missing: ${healthState.teztaleEvents}`);
  assert(healthState.teztaleCreditHref.includes('nomadic-labs.gitlab.io/teztale-dataviz'), `network health chamber: Teztale dataviz link missing: ${healthState.teztaleCreditHref}`);
  assert(healthState.teztaleNomadicHref.includes('gitlab.com/nomadic-labs/teztale'), `network health chamber: Teztale source credit link missing: ${healthState.teztaleNomadicHref}`);
  assert(/Octez Versions/.test(healthState.octezVersions) && /TzKT delegates/.test(healthState.octezVersions), `network health chamber: Octez versions panel missing source context: ${healthState.octezVersions}`);
  assert(healthState.octezCurrent === 'v25.1', `network health chamber: latest observed Octez version mismatch: ${healthState.octezCurrent}`);
  assert(/20\.8%/.test(healthState.octezLatestPower), `network health chamber: latest Octez power share mismatch: ${healthState.octezLatestPower}`);
  assert(healthState.octezKnown === '3 / 3', `network health chamber: known Octez baker count mismatch: ${healthState.octezKnown}`);
  assert(healthState.octezRows >= 3, `network health chamber: Octez version distribution missing rows: ${healthState.octezRows}`);
  assert(healthState.octezLaggers >= 2 && /Second Baker/.test(healthState.octezVersions) && /v24\.4/.test(healthState.octezVersions), `network health chamber: Octez lagging baker list incomplete: ${healthState.octezVersions}`);
  assert(/ago|just now/.test(healthState.octezUpdatedAge), `network health chamber: Octez freshness age missing: ${healthState.octezUpdatedAge}`);
  assert(/Period Telemetry/.test(healthState.periodTelemetry) && /24H/.test(healthState.periodTelemetry) && /31D/.test(healthState.periodTelemetry), `network health chamber: period telemetry missing: ${healthState.periodTelemetry}`);
  assert(/Network Load/.test(healthState.networkLoad) && /Large tx rows/.test(healthState.networkLoad), `network health chamber: network load panel missing: ${healthState.networkLoad}`);
  assert(/Second Baker/.test(healthState.myBaker), `network health chamber: My Tezos baker panel missing baker identity: ${healthState.myBaker}`);
  assert(/Missed block/.test(healthState.myBakerStatus), `network health chamber: My Tezos baker status mismatch: ${healthState.myBakerStatus}`);
  assert(healthState.myBakerMetrics[0] === '7', `network health chamber: My Tezos attestation misses mismatch: ${healthState.myBakerMetrics.join(', ')}`);
  assert(healthState.myBakerMetrics[1] === '1', `network health chamber: My Tezos block misses mismatch: ${healthState.myBakerMetrics.join(', ')}`);
  assert(!/Not in sample/.test(healthState.myBakerMetrics[2] || ''), `network health chamber: My Tezos latest block missing: ${healthState.myBakerMetrics.join(', ')}`);
  assert(healthState.topProofInHeader, 'network health chamber: continuity proof should live in the top header');
  assert(healthState.topProofTag === 'BUTTON' && healthState.topProofType === 'button', `network health chamber: continuity proof should be a button launcher, saw ${healthState.topProofTag}/${healthState.topProofType}`);
  assert(healthState.topProofAriaControls === 'history-modal' && healthState.topProofHistoryWired === '1', `network health chamber: continuity proof history launcher missing: ${healthState.topProofAriaControls}/${healthState.topProofHistoryWired}`);
  assert(/^Uptime:/i.test(healthState.topProofText.trim()) && /zero forks/i.test(healthState.topProofText) && /zero outages/i.test(healthState.topProofText), `network health chamber: top proof line should start with uptime and include zero-status proof: ${healthState.topProofText}`);
  assert(!/\|/.test(healthState.topProofText), `network health chamber: top proof line should not add a pipe after zero outages: ${healthState.topProofText}`);
  assert(/\d+\s+years?\s+\d+\s+days?\s+\d{2}h\s+\d{2}m\s+\d{2}s/.test(healthState.topProofCounter), `network health chamber: top proof runtime missing minutes/seconds: ${healthState.topProofCounter}`);
  assert(/^\d+$/.test(healthState.topProofBakers) && Number(healthState.topProofBakers) >= 1, `network health chamber: top proof baker count mismatch: ${healthState.topProofBakers}`);
  assert(/\d+s/.test(healthState.topProofFinality), `network health chamber: top proof finality missing: ${healthState.topProofFinality}`);
  assert(/^\d+(?:\.\d+)?%$/.test(healthState.topProofStaked), `network health chamber: top proof staked ratio mismatch: ${healthState.topProofStaked}`);
  assert(/^\d+(?:\.\d+)?%$/.test(healthState.topProofIssuance), `network health chamber: top proof issuance mismatch: ${healthState.topProofIssuance}`);
  assert(healthState.systemLinks >= healthState.attesterRows, `network health chamber: baker profile links missing, saw ${healthState.systemLinks}`);
  assert(healthState.tzktLinks >= healthState.attesterRows, `network health chamber: TzKT links missing, saw ${healthState.tzktLinks}`);
  assert(/Direct: \/health\//.test(healthState.footer), `network health chamber: direct footer missing: ${healthState.footer}`);
  assert(healthState.updatedAgeMs >= 85000, `network health chamber: Updated age should come from stale head block timestamp, saw ${healthState.updatedAge} (${healthState.updatedAgeMs}ms)`);
  assert(!/^(0s ago|just now)$/.test(healthState.updatedAge), `network health chamber: Updated age should not be fetch-time fresh: ${healthState.updatedAge}`);
  assert(healthState.headMeta.includes(healthState.updatedAge), `network health chamber: header head age should match Updated metric: ${healthState.headMeta} vs ${healthState.updatedAge}`);
  assert(healthState.cardWide, 'network health chamber: entry card should be double-width');
  assert(/Live Tape/.test(healthState.cardTape) && /XTZ/.test(healthState.cardTape), `network health chamber: entry live tape missing: ${healthState.cardTape}`);
  assert(!healthState.cardHasProofStrip, 'network health chamber: entry card should stay a clean health overview, not carry the continuity proof');
  assert(healthState.ageLabelCount >= 3, `network health chamber: age labels should be live-tickable, saw ${healthState.ageLabelCount}`);
  assert(healthState.cardWired === '1', `network health chamber: card wiring missing: ${healthState.cardWired}`);
  assert(healthState.cardRole === 'button', `network health chamber: card role mismatch: ${healthState.cardRole}`);
  assert(healthState.cardTabIndex === '0', `network health chamber: card keyboard focus mismatch: ${healthState.cardTabIndex}`);
  assert(healthState.cardCue, 'network health chamber: card expand cue missing');
  assert(healthState.cardCopyHash === '#health', `network health chamber: card direct link mismatch: ${healthState.cardCopyHash}`);
  assert(/^as of \d{2}:\d{2} UTC$/.test(healthState.cardUpdatedLabel), `network health chamber: freshness stamp mismatch: ${healthState.cardUpdatedLabel}`);
  assert(healthState.cardFreshnessState === 'fresh' && !healthState.cardStale, `network health chamber: block-age watch state should not mark fresh fetch stale: ${healthState.cardFreshnessState}/${healthState.cardStale}`);
  assert(healthState.cardFreshnessStaleAfter === '12000', `network health chamber: freshness threshold should track 2x live refresh interval, saw ${healthState.cardFreshnessStaleAfter}`);
  assert(healthState.cardFreshnessAgeMs < 12000, `network health chamber: freshness timestamp should come from fetch time, saw ${healthState.cardFreshnessAgeMs}ms`);
  assert(healthState.blockTickerOwnIsland, 'network health chamber: live block ticker should be its own top-level island');
  assert(healthState.blockTickerAfterHeader, 'network health chamber: live block ticker should sit directly below the header');
  assert(healthState.blockTickerBeforeCommandDeck, 'network health chamber: live block ticker should sit directly above the command deck');
  assert(healthState.blockTickerBeforeMainContent, 'network health chamber: live block ticker should stay above the Chambers/main area');
  assert(healthState.blockTickerAboveCommandDeck, 'network health chamber: live block ticker should render above the command deck');
  assert(healthState.blockTickerAboveChambers, 'network health chamber: live block ticker should render above the Chambers area');
  assert(healthState.blockTickerClearOfCommandDeck, `network health chamber: live block ticker crowds the command deck, margin ${healthState.blockTickerMarginTop}`);
  assert(healthState.blockTickerClearOfMainContent, 'network health chamber: live block ticker should not overlap the main content');
  assert(/Block#?[\d,]+/.test(healthState.blockTickerText.replace(/\s+/g, '')), `network health chamber: live block ticker missing block: ${healthState.blockTickerText}`);
  assert(/Baker (QA Baker|Second Baker)/.test(healthState.blockTickerText.replace(/\s+/g, ' ')), `network health chamber: live block ticker missing baker: ${healthState.blockTickerText}`);
  assert(/Health(Peak|Healthy|Watch|Degraded)/.test(healthState.blockTickerText.replace(/\s+/g, '')), `network health chamber: live block ticker missing health: ${healthState.blockTickerText}`);
  assert(/Octezv25\.0/.test(healthState.blockTickerText.replace(/\s+/g, '')), `network health chamber: live block ticker missing baker Octez version: ${healthState.blockTickerText}`);
  assert(/Attested[\d,]+\/7,000/.test(healthState.blockTickerText.replace(/\s+/g, '')), `network health chamber: live block ticker missing attestation power: ${healthState.blockTickerText}`);
  assert(!healthState.blockTickerHasUptimeProof, 'network health chamber: uptime proof should not live inside the live block ticker');
  assert(/zero forks/i.test(healthState.networkHealthProofText) && /zero outages/i.test(healthState.networkHealthProofText), `network health chamber: health proof missing zero-fork/zero-outage copy: ${healthState.networkHealthProofText}`);
  assert(/\d+y\s+\d+d\s+\d{2}h\s+\d{2}m\s+\d{2}s/.test(healthState.networkHealthProofCounter), `network health chamber: uptime counter missing fixed-width runtime: ${healthState.networkHealthProofCounter}`);
  assert(/^\d+$/.test(healthState.networkHealthProofBakers) && Number(healthState.networkHealthProofBakers) >= 1, `network health chamber: health proof baker count mismatch: ${healthState.networkHealthProofBakers}`);
  assert(/\d+s/.test(healthState.networkHealthProofFinality), `network health chamber: health proof finality missing: ${healthState.networkHealthProofFinality}`);
  assert(/^\d+(?:\.\d+)?%$/.test(healthState.networkHealthProofStaked), `network health chamber: health proof staked ratio mismatch: ${healthState.networkHealthProofStaked}`);
  assert(/^\d+(?:\.\d+)?%$/.test(healthState.networkHealthProofIssuance), `network health chamber: health proof issuance mismatch: ${healthState.networkHealthProofIssuance}`);
  assert(!/\\b(Missed|Cadence)\\b/.test(healthState.blockTickerText), `network health chamber: live block ticker should not show Missed or Cadence: ${healthState.blockTickerText}`);
  assert(['peak', 'healthy', 'watch', 'degraded'].includes(healthState.blockTickerHealth), `network health chamber: ticker health tone mismatch: ${healthState.blockTickerHealth}`);
  assert(healthState.blockTickerSegmentOrder.join('>') === 'level>baker>health>octez>power>round>age', `network health chamber: ticker slot order mismatch: ${healthState.blockTickerSegmentOrder.join('>')}`);
  assert(healthState.blockTickerOctezText === 'v25.0', `network health chamber: latest baker Octez version mismatch: ${healthState.blockTickerOctezText}`);
  assert(healthState.blockTickerOctezClass.includes('watch'), `network health chamber: lagging same-major Octez version should be yellow/watch: ${healthState.blockTickerOctezClass}`);
  assert(healthState.blockTickerWired === '1', `network health chamber: ticker click wiring missing: ${healthState.blockTickerWired}`);
  assert(/baked by/.test(healthState.blockTickerTitle), `network health chamber: ticker title missing block context: ${healthState.blockTickerTitle}`);
  assert(/Octez v25\.0/.test(healthState.blockTickerTitle), `network health chamber: ticker title missing Octez version context: ${healthState.blockTickerTitle}`);
  assert(healthState.blockTickerKickerText === '', `network health chamber: ticker kicker should be the pulse only, saw ${healthState.blockTickerKickerText}`);
  assert(healthState.blockTickerPulseCount === 1 && healthState.blockTickerPulseInTicker, `network health chamber: live pulse should live only in ticker, saw count ${healthState.blockTickerPulseCount}`);
  assert(healthState.blockTickerPulseWidth >= 8 && /rgb\(53, 232, 148\)/.test(healthState.blockTickerPulseBg), `network health chamber: ticker pulse should be the green live signal, saw ${healthState.blockTickerPulseWidth}px ${healthState.blockTickerPulseBg}`);
  assert(!healthState.topPriceBarHasBlockReadout && !healthState.topPriceBarHasBlockAge && !healthState.topPriceBarHasPulseDot, `network health chamber: top price bar should not carry block/age/pulse readouts: ${healthState.topPriceBarText}`);
  assert(healthState.blockTickerSignature.split(':').length >= 5, `network health chamber: ticker signature incomplete: ${healthState.blockTickerSignature}`);
  assert(healthState.blockTickerBlockWidth >= 90, `network health chamber: block column too narrow: ${healthState.blockTickerBlockWidth}`);
  assert(healthState.blockTickerBakerWidth >= 190 && healthState.blockTickerBakerWidth <= 220, `network health chamber: baker column should fit longer names without taking over: ${healthState.blockTickerBakerWidth}`);
  assert(healthState.blockTickerHealthWidth >= healthState.blockTickerDegradedWidth + 1, `network health chamber: health slot cannot fit Degraded: slot ${healthState.blockTickerHealthWidth}, degraded ${healthState.blockTickerDegradedWidth}`);
  assert(healthState.blockTickerOctezWidth >= 45, `network health chamber: Octez slot is too narrow: ${healthState.blockTickerOctezWidth}`);
  assert(healthState.blockTickerValueAlignments.every((align) => ['left', 'start'].includes(align)), `network health chamber: ticker values should sit near their labels, saw ${healthState.blockTickerValueAlignments.join(', ')}`);
  assert(/^\d{2}[smhd] ago$/.test(healthState.blockTickerAgeText), `network health chamber: ticker age should use fixed-width text, saw ${healthState.blockTickerAgeText}`);
  assert(healthState.blockTickerAgeWidth >= 40, `network health chamber: ticker age slot is too narrow: ${healthState.blockTickerAgeWidth}`);
  assert(healthState.blockTickerAgeMs >= 85000, `network health chamber: ticker age should come from stale head timestamp, saw ${healthState.blockTickerAgeMs}ms`);
  assert(healthState.commandDeckPanelBorderWidth > 0 && healthState.commandDeckPanelBorderStyle === 'solid', `network health chamber: command deck panel should have a defined edge, saw ${healthState.commandDeckPanelBorderWidth}px ${healthState.commandDeckPanelBorderStyle}`);
  assert(healthState.commandDeckPanelBorderRadius <= 10, `network health chamber: command deck panel edge should stay sharp, saw radius ${healthState.commandDeckPanelBorderRadius}`);
  assert(healthState.intervalDelays.includes(1000), `network health chamber: 1s freshness ticker was not registered: ${healthState.intervalDelays.join(', ')}`);
  assert(healthState.intervalDelays.includes(6000), `network health chamber: 6s refresh timer was not registered: ${healthState.intervalDelays.join(', ')}`);

  const tickerFreshnessState = await page.evaluate(() => {
    const timers = (window.__tezosSystemsIntervals || []).filter((item) => item.timeout === 1000);
    const realNow = Date.now;
    Date.now = () => realNow() + 13000;
    try {
      timers.forEach((timer) => timer?.handler?.());
    } finally {
      Date.now = realNow;
    }
    const card = document.querySelector('[data-stat="network-health"]');
    return {
      hasTimer: timers.some((timer) => Boolean(timer?.handler)),
      state: card?.dataset.freshnessState || '',
      stale: card?.classList.contains('chamber-data-stale') || false
    };
  });
  assert(tickerFreshnessState.hasTimer, 'network health chamber: freshness ticker handler missing');
  assert(tickerFreshnessState.state === 'stale' && tickerFreshnessState.stale, `network health chamber: stale state should update from ticker after fetch silence: ${tickerFreshnessState.state}/${tickerFreshnessState.stale}`);

  const beforeSmoothRefresh = await page.evaluate(() => {
    const timer = (window.__tezosSystemsIntervals || []).filter((item) => item.timeout === 6000).at(-1);
    window.__healthBodyNode = document.querySelector('#network-health-modal .health-body');
    window.__healthHeaderNode = document.querySelector('#network-health-modal .health-header');
    window.__healthScorePanelNode = document.querySelector('#network-health-modal .health-score-panel');
    return {
      hasTimer: Boolean(timer?.handler),
      firstLevel: document.querySelector('#health-recent-block-list .health-block-row')?.dataset.healthLevel || '',
      rowCount: document.querySelectorAll('#health-recent-block-list .health-block-row').length
    };
  });
  assert(beforeSmoothRefresh.hasTimer, 'network health chamber: smooth refresh timer handler missing');
  assert(beforeSmoothRefresh.firstLevel, 'network health chamber: missing first block level before smooth refresh');
  await page.evaluate(() => {
    const timer = (window.__tezosSystemsIntervals || []).filter((item) => item.timeout === 6000).at(-1);
    const realNow = Date.now;
    Date.now = () => realNow() + 13000;
    try {
      timer?.handler?.();
    } finally {
      Date.now = realNow;
    }
  });
  await page.waitForFunction((previousLevel) => {
    const first = document.querySelector('#health-recent-block-list .health-block-row');
    return first?.dataset.healthLevel && first.dataset.healthLevel !== previousLevel;
  }, beforeSmoothRefresh.firstLevel, { timeout: 10000 });
  const smoothRefreshState = await page.evaluate(() => ({
    bodySame: window.__healthBodyNode === document.querySelector('#network-health-modal .health-body'),
    headerSame: window.__healthHeaderNode === document.querySelector('#network-health-modal .health-header'),
    scorePanelSame: window.__healthScorePanelNode === document.querySelector('#network-health-modal .health-score-panel'),
    mode: document.querySelector('#network-health-modal .health-body')?.dataset.healthRefreshMode || '',
    firstLevel: document.querySelector('#health-recent-block-list .health-block-row')?.dataset.healthLevel || '',
    rowCount: document.querySelectorAll('#health-recent-block-list .health-block-row').length,
    newRows: document.querySelectorAll('#health-recent-block-list .lb-row-new').length,
    tickerTransitionCount: Number(document.querySelector('#block-ticker-line')?.dataset.blockTickerTransitionCount || 0),
    tablePadding: getComputedStyle(document.querySelector('.health-block-table .lb-table-row')).paddingTop
  }));
  assert(smoothRefreshState.bodySame, 'network health chamber: smooth refresh replaced the chamber body');
  assert(smoothRefreshState.headerSame, 'network health chamber: smooth refresh replaced the header instead of updating in place');
  assert(smoothRefreshState.scorePanelSame, 'network health chamber: smooth refresh replaced the score panel instead of updating in place');
  assert(smoothRefreshState.mode === 'in-place', `network health chamber: refresh mode mismatch: ${smoothRefreshState.mode}`);
  assert(smoothRefreshState.rowCount === beforeSmoothRefresh.rowCount, `network health chamber: passing block row count shifted after smooth refresh: ${smoothRefreshState.rowCount}`);
  assert(smoothRefreshState.newRows >= 1, 'network health chamber: smooth refresh did not animate newly arriving block rows');
  assert(smoothRefreshState.tickerTransitionCount >= 1, `network health chamber: live block ticker did not mark a transition after refresh: ${smoothRefreshState.tickerTransitionCount}`);
  assert(parseFloat(smoothRefreshState.tablePadding) >= 8, `network health chamber: passing blocks row padding too tight: ${smoothRefreshState.tablePadding}`);

  await page.locator('#network-health-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 5000 });
  await page.locator('#block-ticker-button').click();
  await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#network-health-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 5000 });
  await page.locator('[data-stat="network-health"]').click();
  await page.locator('#network-health-modal.active .health-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#network-health-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `network health chamber browser issues:\n${issues.join('\n')}`);
  log('ok - network health chamber smoke');
}

async function smokeTezlinkChamber(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await installFeatureMocks(context);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'tezlink chamber', issues);

  const response = await page.goto(`${baseUrl}/#tezosx`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `tezlink chamber: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('#tezlink-entry-card.chamber-entry-wide').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#tezlink-modal.active .tezlink-content').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#tezlink-modal .tezlink-protocol-row').length >= 2, null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('#tezlink-modal .tezlink-tx-row').length >= 2, null, { timeout: 10000 });

  const tezlinkState = await page.evaluate(() => {
    const card = document.querySelector('#tezlink-entry-card');
    const modal = document.querySelector('#tezlink-modal');
    return {
      cardWide: card?.classList.contains('chamber-entry-wide') || false,
      cardCopyHash: card?.querySelector('.card-copy-link')?.dataset.copyHash || '',
      cardUpdatedLabel: card?.dataset.updatedLabel || '',
      cardValue: card?.querySelector('#tezlink-entry-tvl')?.textContent?.trim() || '',
      cardDescription: card?.querySelector('#tezlink-entry-description')?.textContent?.trim() || '',
      cardMini: card?.querySelector('#tezlink-entry-mini')?.textContent?.trim() || '',
      cardTape: card?.querySelector('#tezlink-entry-tape')?.textContent || '',
      title: modal?.querySelector('.chamber-title')?.textContent || '',
      badge: modal?.querySelector('.chamber-badge')?.textContent || '',
      proposalInfo: modal?.querySelector('.chamber-proposal-info')?.textContent || '',
      facts: modal?.querySelector('.tezlink-explainer')?.textContent || '',
      protocolRows: modal?.querySelectorAll('.tezlink-protocol-row').length || 0,
      protocolText: modal?.querySelector('.tezlink-protocol-table')?.textContent || '',
      txRows: modal?.querySelectorAll('.tezlink-tx-row').length || 0,
      txText: modal?.querySelector('.tezlink-tx-table')?.textContent || '',
      trendText: modal?.querySelector('#tezlink-trend-panel')?.textContent || '',
      trendMetricValues: Array.from(modal?.querySelectorAll('#tezlink-trend-panel .lb-metric-grid strong') || []).map((el) => el.textContent?.trim() || ''),
      anchorText: modal?.querySelector('#tezlink-anchor-panel')?.textContent || '',
      gasText: modal?.querySelector('#tezlink-gas-oracle')?.textContent || '',
      tokenRows: modal?.querySelectorAll('#tezlink-token-panel .lb-table-row').length || 0,
      tokenText: modal?.querySelector('#tezlink-token-panel')?.textContent || '',
      sparklinePoints: modal?.querySelector('#tezlink-trend-panel .tezlink-mini-sparkline polyline')?.getAttribute('points')?.trim().split(/\s+/).length || 0,
      footer: modal?.querySelector('.chamber-footer')?.textContent || '',
      directHref: modal?.querySelector('.panel-direct-link')?.getAttribute('href') || '',
      sourceLinks: modal?.querySelectorAll('a[href*="defillama.com"], a[href*="explorer.etherlink.com"]').length || 0
    };
  });

  assert(tezlinkState.cardWide, 'tezlink chamber: card should be double-width');
  assert(tezlinkState.cardCopyHash === '#tezosx', `tezlink chamber: card copy hash mismatch: ${tezlinkState.cardCopyHash}`);
  assert(/^as of \d{2}:\d{2} UTC$/.test(tezlinkState.cardUpdatedLabel), `tezlink chamber: freshness stamp mismatch: ${tezlinkState.cardUpdatedLabel}`);
  assert(/\$18\.1M/.test(tezlinkState.cardValue), `tezlink chamber: card TVL mismatch: ${tezlinkState.cardValue}`);
  assert(/Atomic L2/.test(tezlinkState.cardDescription) && /TVL [+-]\d+\.\d% \/ 30d|TVL tracking/.test(tezlinkState.cardDescription), `tezlink chamber: card description should keep TVL with the trend copy: ${tezlinkState.cardDescription}`);
  assert(!/\bTVL$/.test(tezlinkState.cardDescription), `tezlink chamber: card description should not leave TVL as a trailing orphan: ${tezlinkState.cardDescription}`);
  assert(/Head|live L2 feed/i.test(tezlinkState.cardMini), `tezlink chamber: card mini mismatch: ${tezlinkState.cardMini}`);
  assert(/credit|swap/.test(tezlinkState.cardTape), `tezlink chamber: card transaction tape missing: ${tezlinkState.cardTape}`);
  assert(/Tezos X Chamber/.test(tezlinkState.title), `tezlink chamber: title mismatch: ${tezlinkState.title}`);
  assert(/Live L2/.test(tezlinkState.badge), `tezlink chamber: badge mismatch: ${tezlinkState.badge}`);
  assert(/\$18\.1M/.test(tezlinkState.proposalInfo), `tezlink chamber: header TVL missing: ${tezlinkState.proposalInfo}`);
  assert(/Atomic L2|atomic L2/i.test(tezlinkState.facts), `tezlink chamber: explainer missing atomic L2 context: ${tezlinkState.facts}`);
  assert(tezlinkState.protocolRows >= 2, `tezlink chamber: protocol rows missing, saw ${tezlinkState.protocolRows}`);
  assert(/Curve DEX/.test(tezlinkState.protocolText), `tezlink chamber: protocol TVL missing Curve DEX: ${tezlinkState.protocolText}`);
  assert(tezlinkState.txRows >= 2, `tezlink chamber: transaction rows missing, saw ${tezlinkState.txRows}`);
  assert(/Bankroll|Smoke DEX/.test(tezlinkState.txText), `tezlink chamber: transaction tape target missing: ${tezlinkState.txText}`);
  assert(/30d Direction/.test(tezlinkState.trendText) && /TVL/.test(tezlinkState.trendText) && tezlinkState.sparklinePoints >= 20, `tezlink chamber: trend panel missing: ${tezlinkState.trendText}`);
  assert(tezlinkState.trendMetricValues.length === 3 && tezlinkState.trendMetricValues.every((value) => value && value !== '--'), `tezlink chamber: 30d direction cells should not render empty dash placeholders: ${tezlinkState.trendMetricValues.join(', ')}`);
  assert(/L1 Anchor/.test(tezlinkState.anchorText) && /sr1Smok/.test(tezlinkState.anchorText), `tezlink chamber: anchor panel missing rollup: ${tezlinkState.anchorText}`);
  assert(/Gas Oracle/.test(tezlinkState.gasText) && /Average/.test(tezlinkState.gasText), `tezlink chamber: gas oracle panel missing: ${tezlinkState.gasText}`);
  assert(tezlinkState.tokenRows >= 3 && /USDC\.e|WXTZ/.test(tezlinkState.tokenText), `tezlink chamber: token holder panel missing: ${tezlinkState.tokenText}`);
  assert(/Direct: \/tezosx\//.test(tezlinkState.footer), `tezlink chamber: direct footer missing: ${tezlinkState.footer}`);
  assert(tezlinkState.directHref === '/tezosx/', `tezlink chamber: direct href mismatch: ${tezlinkState.directHref}`);
  assert(tezlinkState.sourceLinks >= 2, `tezlink chamber: source links missing, saw ${tezlinkState.sourceLinks}`);

  await page.locator('#tezlink-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#tezlink-modal')?.classList.contains('active'), null, { timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `tezlink chamber browser issues:\n${issues.join('\n')}`);
  log('ok - tezlink chamber smoke');
}

async function smokeCtezChamber(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context);
  await installOctezConnectMock(context);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'ctez chamber', issues);

  const response = await page.goto(`${baseUrl}/#ctez`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `ctez chamber: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('#ctez-modal.active .ctez-content').waitFor({ state: 'visible', timeout: 10000 });

  const ctezState = await page.evaluate(() => {
    const modal = document.querySelector('#ctez-modal');
    const text = modal?.textContent || '';
    const bcdLinks = Array.from(modal?.querySelectorAll('a[href^="https://better-call.dev/mainnet/"]') || []).map((link) => link.href);
    return {
      title: modal?.querySelector('.chamber-title')?.textContent || '',
      badge: modal?.querySelector('.chamber-badge')?.textContent || '',
      text,
      hasConsoleShell: Boolean(modal?.querySelector('.ctez-console-shell')),
      hasSunsetBanner: Boolean(modal?.querySelector('.ctez-sunset-banner')),
      hasSummaryStrip: Boolean(modal?.querySelector('#ctez-summary-strip')),
      hasConnectControl: Boolean(modal?.querySelector('.ctez-console-toolbar #ctez-wallet-connect')),
      hasCloseControl: Boolean(modal?.querySelector('#ctez-wallet-close')),
      hasOvenPanel: Boolean(modal?.querySelector('.ctez-oven-panel #ctez-oven-list')),
      hasRefresh: Boolean(modal?.querySelector('#ctez-wallet-refresh')),
      manualFields: Boolean(modal?.querySelector('#ctez-wallet-oven-id, #ctez-tez-input, #ctez-outstanding-input, #ctez-wallet-withdraw-to, #ctez-wallet-withdraw-amount, .ctez-action-card, .ctez-guide-grid, .ctez-exit-workspace')),
      bcdLinks,
      communityLinks: Array.from(modal?.querySelectorAll('a[href*="purplematter.com/ctez-tool"], a[href*="x.com/webidente"]') || []).length,
      directHref: modal?.querySelector('a[aria-label="Direct link to ctez End of Life"]')?.getAttribute('href') || '',
      footer: modal?.querySelector('.chamber-footer')?.textContent || '',
      hasDefaultCard: Boolean(document.querySelector('#ctez-entry-card')),
      hasTopLeftLauncher: Boolean(document.querySelector('#ctez-launcher')),
      featureButtonText: document.querySelector('#ctez-feature-btn')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      featureCopyHash: document.querySelector('#features-dropdown .feature-copy-link[data-copy-hash="#ctez"]')?.dataset.copyHash || '',
      chambersHint: document.querySelector('#chambers-toggle .dropdown-hint')?.textContent?.trim() || ''
    };
  });

  assert(/ctez End of Life/.test(ctezState.title), `ctez chamber: title mismatch: ${ctezState.title}`);
  assert(/Oven recovery/.test(ctezState.badge), `ctez chamber: badge mismatch: ${ctezState.badge}`);
  assert(ctezState.hasConsoleShell && ctezState.hasSunsetBanner && ctezState.hasSummaryStrip && ctezState.hasConnectControl && ctezState.hasCloseControl && ctezState.hasOvenPanel && ctezState.hasRefresh, `ctez chamber: console shell missing: ${JSON.stringify(ctezState)}`);
  assert(!ctezState.manualFields, `ctez chamber: manual/guide controls should not render: ${JSON.stringify(ctezState)}`);
  assert(ctezState.bcdLinks.length === 0, `ctez chamber: Better Call Dev links should not render: ${ctezState.bcdLinks.join(', ')}`);
  assert(!/Better Call Dev|ctez_outstanding|tez_balance|oven ID/i.test(ctezState.text), `ctez chamber: raw recovery instructions leaked into UI: ${ctezState.text}`);
  assert(ctezState.communityLinks >= 2 && /Purple Matter tool/.test(ctezState.footer) && /@webidente/.test(ctezState.footer), `ctez chamber: community reference links missing: ${JSON.stringify(ctezState)}`);
  assert(/KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2/.test(ctezState.text), 'ctez chamber: contract address missing');
  assert(/Close old ovens and recover remaining tez/.test(ctezState.text), `ctez chamber: recovery console header missing: ${ctezState.text}`);
  assert(/Ctez is sunsetting, please close your ovens/.test(ctezState.text), `ctez chamber: sunset banner missing: ${ctezState.text}`);
  assert(/Never share your seed phrase/.test(ctezState.text), 'ctez chamber: safety copy missing');
  assert(/Direct: \/ctez\//.test(ctezState.footer), `ctez chamber: direct footer missing: ${ctezState.footer}`);
  assert(ctezState.directHref === '/ctez/', `ctez chamber: direct href mismatch: ${ctezState.directHref}`);
  assert(!ctezState.hasDefaultCard, `ctez chamber: should be off by default in Chambers: ${JSON.stringify(ctezState)}`);
  assert(ctezState.hasTopLeftLauncher, `ctez chamber: top-left launcher missing: ${JSON.stringify(ctezState)}`);
  assert(ctezState.featureCopyHash === '#ctez', `ctez chamber: feature copy hash mismatch: ${ctezState.featureCopyHash}`);
  assert(/ctez End of Life/.test(ctezState.featureButtonText) && /Close old ovens/.test(ctezState.featureButtonText), `ctez chamber: feature launcher copy mismatch: ${ctezState.featureButtonText}`);
  assert(!/ctez/i.test(ctezState.chambersHint), `ctez chamber: Chambers hint should not advertise ctez as default: ${ctezState.chambersHint}`);

  await page.locator('#ctez-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#ctez-modal')?.classList.contains('active'), null, { timeout: 5000 });
  await page.locator('#ctez-launcher').click();
  await page.locator('#ctez-modal.active .ctez-content').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#ctez-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#ctez-modal')?.classList.contains('active'), null, { timeout: 5000 });
  await ensureDropdownOpen(page, '#features-gear', '#features-dropdown');
  await page.locator('#ctez-feature-btn').click();
  await page.locator('#ctez-modal.active .ctez-content').waitFor({ state: 'visible', timeout: 5000 });

  await page.locator('#ctez-wallet-connect').click();
  await page.waitForFunction((address) => localStorage.getItem('tezos-systems-octez-wallet-address') === address, SAMPLE_ADDRESS, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#ctez-oven-list .ctez-oven-card').length >= 2, null, { timeout: 5000 });
  const walletConnectState = await page.evaluate(() => ({
    status: document.querySelector('#ctez-wallet-status')?.textContent || '',
    ovenStatus: document.querySelector('#ctez-oven-status')?.textContent || '',
    summaryStrip: document.querySelector('#ctez-summary-strip')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    ovenCards: Array.from(document.querySelectorAll('#ctez-oven-list .ctez-oven-card')).map((card) => card.textContent.replace(/\s+/g, ' ').trim()),
    selectedSummary: document.querySelector('#ctez-selected-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    savedMyTezos: localStorage.getItem('tezos-systems-my-baker-address') || '',
    closeDisabled: document.querySelector('#ctez-wallet-close')?.disabled ?? true,
    closeText: document.querySelector('#ctez-wallet-close')?.textContent?.trim() || '',
    review: document.querySelector('#ctez-wallet-review')?.textContent?.replace(/\s+/g, ' ').trim() || ''
  }));
  assert(walletConnectState.status.includes('Wallet tz1aWX…T1Z9'), `ctez wallet: status mismatch ${JSON.stringify(walletConnectState)}`);
  assert(walletConnectState.savedMyTezos === SAMPLE_ADDRESS, `ctez wallet: should sync My Tezos address ${JSON.stringify(walletConnectState)}`);
  assert(/2 ctez ovens found/.test(walletConnectState.ovenStatus), `ctez wallet: oven status mismatch ${JSON.stringify(walletConnectState)}`);
  assert(/Oven Summary/.test(walletConnectState.summaryStrip) && /Total balance 7\.530864 tez/.test(walletConnectState.summaryStrip) && /0\.123456 ctez/.test(walletConnectState.summaryStrip) && /Potential recovery 7\.530864 tez/.test(walletConnectState.summaryStrip) && /Ovens found 2/.test(walletConnectState.summaryStrip), `ctez wallet: oven summary mismatch ${JSON.stringify(walletConnectState)}`);
  assert(walletConnectState.ovenCards.length === 2 && /ID/.test(walletConnectState.ovenCards[0]) && /Oven address/.test(walletConnectState.ovenCards[0]) && /6\.54321 tez/.test(walletConnectState.ovenCards[0]) && /0\.987654 tez/.test(walletConnectState.ovenCards[1]), `ctez wallet: detected oven rows mismatch ${JSON.stringify(walletConnectState)}`);
  assert(/Oven Stats/.test(walletConnectState.selectedSummary) && /Collateral Overview/.test(walletConnectState.selectedSummary) && /Mintable Overview/.test(walletConnectState.selectedSummary) && /Close Plan/.test(walletConnectState.selectedSummary) && /Owner/.test(walletConnectState.selectedSummary) && /0\.123456 ctez/.test(walletConnectState.selectedSummary) && /Raw burn quantity -123456/.test(walletConnectState.selectedSummary) && /Raw withdraw amount 6543210/.test(walletConnectState.selectedSummary), `ctez wallet: selected debt summary mismatch ${JSON.stringify(walletConnectState)}`);
  assert(!walletConnectState.closeDisabled && /one wallet batch/i.test(walletConnectState.closeText) && /burn 0\.123456 ctez, then withdraw 6\.54321 tez/.test(walletConnectState.review), `ctez wallet: debt oven should enable one-batch close ${JSON.stringify(walletConnectState)}`);

  await page.locator('#ctez-wallet-close').click();
  await page.waitForFunction(() => window.__octezConnectRequests?.length >= 1, null, { timeout: 5000 });

  await page.locator('#ctez-oven-list .ctez-oven-card[data-oven-index="1"]').click();
  await page.waitForFunction(() => {
    const close = document.querySelector('#ctez-wallet-close');
    return close?.disabled === false && /Withdraw tez/.test(close.textContent || '');
  }, null, { timeout: 5000 });
  await page.locator('#ctez-wallet-close').click();
  await page.waitForFunction(() => window.__octezConnectRequests?.length >= 2, null, { timeout: 5000 });

  const walletRequests = await page.evaluate(() => window.__octezConnectRequests);
  const burnDetail = walletRequests[0]?.operationDetails?.[0] || {};
  const firstWithdrawDetail = walletRequests[0]?.operationDetails?.[1] || {};
  const secondWithdrawDetail = walletRequests[1]?.operationDetails?.[0] || {};
  assert(walletRequests[0]?.operationDetails?.length === 2, `ctez wallet: debt oven close should submit a two-leg batch ${JSON.stringify(walletRequests[0])}`);
  assert(burnDetail.kind === 'transaction', `ctez wallet: burn kind mismatch ${JSON.stringify(burnDetail)}`);
  assert(burnDetail.destination === 'KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2', `ctez wallet: burn destination mismatch ${JSON.stringify(burnDetail)}`);
  assert(burnDetail.parameters?.entrypoint === 'mint_or_burn', `ctez wallet: burn entrypoint mismatch ${JSON.stringify(burnDetail)}`);
  assert(JSON.stringify(burnDetail.parameters?.value) === JSON.stringify({
    prim: 'Pair',
    args: [{ int: '42' }, { int: '-123456' }]
  }), `ctez wallet: burn Micheline mismatch ${JSON.stringify(burnDetail.parameters?.value)}`);
  assert(firstWithdrawDetail.kind === 'transaction', `ctez wallet: first withdraw kind mismatch ${JSON.stringify(firstWithdrawDetail)}`);
  assert(firstWithdrawDetail.parameters?.entrypoint === 'withdraw', `ctez wallet: first withdraw entrypoint mismatch ${JSON.stringify(firstWithdrawDetail)}`);
  assert(JSON.stringify(firstWithdrawDetail.parameters?.value) === JSON.stringify({
    prim: 'Pair',
    args: [
      { int: '42' },
      { prim: 'Pair', args: [{ int: '6543210' }, { string: SAMPLE_ADDRESS }] }
    ]
  }), `ctez wallet: first withdraw Micheline mismatch ${JSON.stringify(firstWithdrawDetail.parameters?.value)}`);
  assert(walletRequests[1]?.operationDetails?.length === 1, `ctez wallet: ready oven close should submit a one-leg withdraw ${JSON.stringify(walletRequests[1])}`);
  assert(secondWithdrawDetail.kind === 'transaction', `ctez wallet: second withdraw kind mismatch ${JSON.stringify(secondWithdrawDetail)}`);
  assert(secondWithdrawDetail.parameters?.entrypoint === 'withdraw', `ctez wallet: second withdraw entrypoint mismatch ${JSON.stringify(secondWithdrawDetail)}`);
  assert(JSON.stringify(secondWithdrawDetail.parameters?.value) === JSON.stringify({
    prim: 'Pair',
    args: [
      { int: '43' },
      { prim: 'Pair', args: [{ int: '987654' }, { string: SAMPLE_ADDRESS }] }
    ]
  }), `ctez wallet: second withdraw Micheline mismatch ${JSON.stringify(secondWithdrawDetail.parameters?.value)}`);

  await page.locator('#ctez-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#ctez-modal')?.classList.contains('active'), null, { timeout: 5000 });

  await context.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(mobileContext);
  await mobileContext.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const mobilePage = await mobileContext.newPage();
  attachIssueCollectors(mobilePage, 'ctez chamber mobile', issues);
  const mobileResponse = await mobilePage.goto(`${baseUrl}/#ctez`, { waitUntil: 'domcontentloaded' });
  assert(mobileResponse?.ok(), `ctez chamber mobile: dashboard failed with HTTP ${mobileResponse?.status()}`);
  await mobilePage.locator('#ctez-modal.active .ctez-content').waitFor({ state: 'visible', timeout: 10000 });
  const mobileState = await mobilePage.evaluate(() => {
    const modal = document.querySelector('#ctez-modal .ctez-content');
    const box = modal?.getBoundingClientRect();
    const grids = Array.from(document.querySelectorAll('#ctez-modal .ctez-console-shell, #ctez-modal .ctez-console-toolbar, #ctez-modal .ctez-summary-strip, #ctez-modal .ctez-oven-panel, #ctez-modal .ctez-oven-list, #ctez-modal .ctez-action-panel, #ctez-modal .ctez-action-buttons, #ctez-modal .ctez-selected-summary'));
    return {
      modalWidth: box?.width || 0,
      viewportWidth: window.innerWidth,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      modalOverflow: modal ? modal.scrollWidth - modal.clientWidth : 0,
      gridOverflows: grids.map((grid) => grid.scrollWidth - grid.clientWidth),
      title: document.querySelector('#ctez-modal .chamber-title')?.textContent || '',
      closeVisible: Boolean(document.querySelector('#ctez-modal .chamber-close')?.getBoundingClientRect().width)
    };
  });
  assert(/ctez End of Life/.test(mobileState.title), `ctez chamber mobile: title mismatch: ${mobileState.title}`);
  assert(mobileState.closeVisible, 'ctez chamber mobile: close button should remain visible');
  assert(mobileState.modalWidth <= mobileState.viewportWidth, `ctez chamber mobile: modal wider than viewport: ${JSON.stringify(mobileState)}`);
  assert(mobileState.pageOverflow <= 2 && mobileState.modalOverflow <= 2 && mobileState.gridOverflows.every((value) => value <= 2), `ctez chamber mobile: horizontal overflow: ${JSON.stringify(mobileState)}`);
  await mobileContext.close();

  assert(issues.length === 0, `ctez chamber browser issues:\n${issues.join('\n')}`);
  log('ok - ctez chamber smoke');
}

async function smokeGovernanceTestingPeriod(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await installFeatureMocks(context);
  await context.addInitScript(() => {
    window.__tezosSystemsIntervals = [];
    const originalSetInterval = window.setInterval.bind(window);
    window.setInterval = (handler, timeout, ...args) => {
      const id = originalSetInterval(handler, timeout, ...args);
      window.__tezosSystemsIntervals.push({ handler, id, timeout });
      return id;
    };
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'governance testing period', issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `governance testing period: dashboard failed with HTTP ${response?.status()}`);
  await page.waitForFunction(() => {
    const breakdown = document.querySelector('#issuance-breakdown')?.textContent?.trim() || '';
    return /LB/.test(breakdown);
  }, null, { timeout: 10000 });
  await page.locator('#lb-entry-card[data-lb-live="true"][data-lb-refresh-interval="60000"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.stat-card[data-stat="tz4-adoption"].chamber-entry-card .chamber-expand-cue').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#etherlink-governance-entry-card[data-etherlink-governance-live="true"]').waitFor({ state: 'visible', timeout: 10000 });
  await expectCount(page, '#chamber-entry-card .card-copy-link[data-copy-hash="#chamber"]', 1, 'governance testing period chamber card link');
  await expectCount(page, '#tezlink-entry-card.chamber-entry-wide .card-copy-link[data-copy-hash="#tezosx"]', 1, 'governance testing period Tezos X card link');
  await expectCount(page, '#etherlink-governance-entry-card.chamber-entry-wide .card-copy-link[data-copy-hash="#l2chamber"]', 1, 'governance testing period Tezos X Governance card link');
  await expectCount(page, '#chambers-toggle', 1, 'governance testing period chambers launcher button');
  await expectCount(page, '.feature-copy-link[data-copy-hash="#chambers"]', 1, 'governance testing period chambers launcher link');
  await expectCount(page, '#lb-entry-card .card-copy-link[data-copy-hash="#lb"]', 1, 'governance testing period LB chamber link');
  await expectCount(page, '#ctez-launcher', 1, 'governance testing period ctez top-left launcher');
  await expectCount(page, '#ctez-feature-btn', 1, 'governance testing period ctez feature launcher');
  await expectCount(page, '.feature-copy-link[data-copy-hash="#ctez"]', 1, 'governance testing period ctez feature link');
  await expectCount(page, '#chambers-section [data-stat="tz4-adoption"] .card-copy-link[data-copy-hash="#tz4"]', 1, 'governance testing period tz4 tile link');
  await expectCount(page, '#chambers-section [data-stat="network-health"] .card-copy-link[data-copy-hash="#health"]', 1, 'governance testing period health tile link');
  await expectCount(page, '#chambers-section #lb-entry-card', 1, 'governance testing period LB tile in Chambers');
  await expectCount(page, '#chambers-section #tezlink-entry-card', 1, 'governance testing period Tezos X tile in Chambers');
  await expectCount(page, '#chambers-section #etherlink-governance-entry-card', 1, 'governance testing period Tezos X Governance tile in Chambers');
  await assertLocatorCount(page.locator('#chambers-section #ctez-entry-card'), 0, 'governance testing period ctez tile in Chambers');
  await expectCount(page, '#chambers-section [data-stat="tz4-adoption"]', 1, 'governance testing period tz4 tile in Chambers');
  await expectCount(page, '#chambers-section [data-stat="network-health"]', 1, 'governance testing period health tile in Chambers');
  await page.waitForFunction(() => document.querySelectorAll('#chambers-section .chamber-entry-card[data-updated-label]').length >= 6, null, { timeout: 10000 });
  await assertChamberOrder(page, 'governance testing period');
  await assertChamberControlGeometry(page, 'governance testing period');
  await page.waitForFunction(() => /Latest switches/i.test(document.querySelector('#tz4-entry-preview')?.textContent || ''), null, { timeout: 10000 });
  await page.locator('#chambers-section [data-stat="tz4-adoption"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('#chambers-section [data-stat="tz4-adoption"] > .card-share-btn')?.click());
  await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
  const chamberShareCapture = await page.evaluate(() => window.__lastHtml2CanvasText?.replace(/\s+/g, ' ').trim() || '');
  assert(/chambers\s+·\s+panel snapshot/i.test(chamberShareCapture), `governance testing period: chamber share missing branded panel snapshot label: ${chamberShareCapture}`);
  assert(/visible chamber panel/i.test(chamberShareCapture), `governance testing period: chamber share missing visible panel frame: ${chamberShareCapture}`);
  assert(/tz4 Adoption/.test(chamberShareCapture) && /Latest switches/i.test(chamberShareCapture) && /Pending/i.test(chamberShareCapture), `governance testing period: chamber share should include visible tz4 panel content: ${chamberShareCapture}`);
  await expectShareModal(page, 'governance testing period chamber card share', issues);
  await assertResponsiveChamberCards(browser, baseUrl, { width: 900, height: 1000 }, 'governance live chamber tablet', { governanceLiveVote: true });
  await assertResponsiveChamberCards(browser, baseUrl, { width: 375, height: 900 }, 'governance live chamber mobile', { governanceLiveVote: true });

  const adoptionContext = await browser.newContext({
    viewport: { width: 960, height: 720 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(adoptionContext, { governanceAdoptionPeriod: true, etherlinkNullProposal: true });
  await adoptionContext.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const adoptionPage = await adoptionContext.newPage();
  attachIssueCollectors(adoptionPage, 'governance adoption entry card', issues);
  const adoptionResponse = await adoptionPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(adoptionResponse?.ok(), `governance adoption entry card: dashboard failed with HTTP ${adoptionResponse?.status()}`);
  await adoptionPage.locator('#chamber-entry-card.chamber-entry-adoption.chamber-entry-wide[data-chamber-entry-size="wide"]').waitFor({ state: 'visible', timeout: 10000 });
  await assertChamberControlGeometry(adoptionPage, 'governance adoption entry card');
  const adoptionState = await adoptionPage.evaluate(() => {
    const card = document.querySelector('#chamber-entry-card');
    return {
      protocolPromptCount: document.querySelectorAll('#gov-countdown-banner, #gov-countdown-banner-slot, #upgrade-status .voting-status-compact').length,
      text: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
      description: card?.querySelector('.stat-description')?.textContent?.trim() || '',
      mini: document.querySelector('#chamber-entry-mini')?.textContent?.trim() || '',
      metrics: document.querySelector('#chamber-entry-metrics')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      metricsHidden: document.querySelector('#chamber-entry-metrics')?.hidden ?? true,
      size: card?.dataset.chamberEntrySize || '',
      adoptionClass: card?.classList.contains('chamber-entry-adoption') || false,
      liveClass: card?.classList.contains('chamber-entry-live') || false
    };
  });
  assert(adoptionState.protocolPromptCount === 0, `governance adoption entry card: protocol prompt should stay removed, saw ${adoptionState.protocolPromptCount}`);
  assert(adoptionState.adoptionClass && !adoptionState.liveClass && adoptionState.size === 'wide', `governance adoption entry card: adoption state should be wide but not live, saw ${JSON.stringify(adoptionState)}`);
  assert(adoptionState.description === 'Adoption period', `governance adoption entry card: description mismatch: ${adoptionState.description}`);
  assert(/No ballots: final runway before the protocol switch/.test(adoptionState.mini), `governance adoption entry card: missing adoption explainer: ${adoptionState.mini}`);
  assert(!adoptionState.metricsHidden, 'governance adoption entry card: adoption facts should be visible');
  assert(/Time left/.test(adoptionState.metrics) && /Activation/.test(adoptionState.metrics) && /Ballots Closed/.test(adoptionState.metrics) && /Next Protocol switch/.test(adoptionState.metrics), `governance adoption entry card: facts mismatch: ${adoptionState.metrics}`);
  await adoptionContext.close();

  await page.waitForFunction(() => {
    const canvas = document.getElementById('tz4-sparkline');
    const chart = canvas ? window.Chart?.getChart(canvas) : null;
    const values = chart?.data?.datasets?.[0]?.data || [];
    const latest = Number(values.at(-1));
    return Number.isFinite(latest) && Math.abs(latest - (100 / 3)) < 0.01;
  }, null, { timeout: 10000 });

  const dashboardState = await page.evaluate(() => ({
    protocolPromptCount: document.querySelectorAll('#gov-countdown-banner, #gov-countdown-banner-slot, #upgrade-status .voting-status-compact').length,
    upgradeStatusActive: document.querySelector('#upgrade-status')?.classList.contains('active') || false,
    governanceProcessCards: document.querySelectorAll('#upgrade-status .governance-process-card').length,
    governanceTallyCards: document.querySelectorAll('#upgrade-status .voting-tally').length,
    votingPeriod: document.querySelector('#voting-period-front')?.textContent?.trim() || '',
    participation: document.querySelector('#participation-front')?.textContent?.trim() || '',
    participationDescription: document.querySelector('#participation-description')?.textContent?.trim() || '',
    entryMini: document.querySelector('#chamber-entry-mini')?.textContent?.trim() || '',
    chamberEntryWide: document.querySelector('#chamber-entry-card')?.classList.contains('chamber-entry-wide') || false,
    chamberEntrySize: document.querySelector('#chamber-entry-card')?.dataset.chamberEntrySize || '',
    issuance: document.querySelector('#issuance-rate-front')?.textContent?.trim() || '',
    issuanceBreakdown: document.querySelector('#issuance-breakdown')?.textContent?.trim() || '',
    lbEntryEma: document.querySelector('#lb-entry-ema')?.textContent?.trim() || '',
    lbEntryDescription: document.querySelector('#lb-entry-description')?.textContent?.trim() || '',
    lbEntryVotes: Array.from(document.querySelectorAll('#lb-entry-vote-rows .lb-entry-vote-row')).map((row) => ({
      text: row.textContent?.replace(/\s+/g, ' ').trim() || '',
      vote: row.dataset.lbEntryVote || '',
      badgeClass: row.querySelector('.lb-entry-vote-badge')?.className || ''
    })),
    lbEntryLive: document.querySelector('#lb-entry-card')?.dataset.lbLive || '',
    lbEntryRefreshInterval: document.querySelector('#lb-entry-card')?.dataset.lbRefreshInterval || '',
    lbEntryRefreshedAt: document.querySelector('#lb-entry-card')?.dataset.lbRefreshedAt || '',
    lbEntryGeometry: (() => {
      const card = document.querySelector('#lb-entry-card');
      const ema = document.querySelector('#lb-entry-ema');
      const tape = document.querySelector('#lb-entry-vote-tape');
      const tz4 = document.querySelector('#chambers-section [data-stat="tz4-adoption"]');
      const rect = (node) => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      const cardRect = rect(card);
      const emaRect = rect(ema);
      const tapeRect = rect(tape);
      const tz4Rect = rect(tz4);
      return {
        cardHeight: cardRect ? Number(cardRect.height.toFixed(2)) : 0,
        tapeRightOfEma: Boolean(emaRect && tapeRect && tapeRect.left >= emaRect.right + 8),
        tapeEmaBandOverlap: Boolean(emaRect && tapeRect && tapeRect.top < emaRect.bottom && tapeRect.bottom > emaRect.top),
        pairedWithTz4: Boolean(cardRect && tz4Rect && Math.abs(cardRect.top - tz4Rect.top) <= 1 && Math.abs(cardRect.bottom - tz4Rect.bottom) <= 1),
        emaRect,
        tapeRect,
        tz4Rect
      };
    })(),
    etherlinkEntryValue: document.querySelector('#etherlink-governance-entry-value')?.textContent?.trim() || '',
    etherlinkEntryDescription: document.querySelector('#etherlink-governance-entry-description')?.textContent?.trim() || '',
    etherlinkEntryMini: document.querySelector('#etherlink-governance-entry-mini')?.textContent?.trim() || '',
    etherlinkEntryLive: document.querySelector('#etherlink-governance-entry-card')?.dataset.etherlinkGovernanceLive || '',
    etherlinkEntryWide: document.querySelector('#etherlink-governance-entry-card')?.classList.contains('chamber-entry-wide') || false,
    etherlinkEntrySize: document.querySelector('#etherlink-governance-entry-card')?.dataset.etherlinkGovernanceSize || '',
    etherlinkEntryMetrics: document.querySelector('#etherlink-governance-entry-metrics')?.textContent?.trim() || '',
    chamberUpdatedLabels: Array.from(document.querySelectorAll('#chambers-section .chamber-entry-card[data-updated-label]')).map((card) => card.dataset.updatedLabel || ''),
    etherlinkEntryGeometry: (() => {
      const card = document.querySelector('#etherlink-governance-entry-card');
      const cue = card?.querySelector('.chamber-expand-cue');
      const sequencer = [...(card?.querySelectorAll('.etherlink-gov-entry-metric') || [])]
        .find((node) => /SEQUENCER/.test(node.textContent || ''));
      const rect = (node) => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      const cueRect = rect(cue);
      const sequencerRect = rect(sequencer);
      const overlap = cueRect && sequencerRect
        ? Math.max(0, Math.min(cueRect.right, sequencerRect.right) - Math.max(cueRect.left, sequencerRect.left))
          * Math.max(0, Math.min(cueRect.bottom, sequencerRect.bottom) - Math.max(cueRect.top, sequencerRect.top))
        : 0;
      return { cueRect, sequencerRect, overlap };
    })(),
    tz4TileValue: document.querySelector('#tz4-adoption-front')?.textContent?.trim() || '',
    tz4TileDescription: document.querySelector('#tz4-description')?.textContent?.trim() || '',
    tz4TileWide: document.querySelector('[data-stat="tz4-adoption"]')?.classList.contains('chamber-entry-wide') || false,
    tz4TileSize: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.tz4EntrySize || '',
    tz4TilePending: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.tz4Pending || '',
    tz4TileLatest: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.tz4LatestSwitches || '',
    tz4TilePreview: document.querySelector('#tz4-entry-preview')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    tz4TileWired: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.tz4ChamberWired || '',
    tz4TileRole: document.querySelector('[data-stat="tz4-adoption"]')?.getAttribute('role') || '',
    tz4TileTabIndex: document.querySelector('[data-stat="tz4-adoption"]')?.getAttribute('tabindex') || '',
    tz4TileCue: Boolean(document.querySelector('[data-stat="tz4-adoption"] .chamber-expand-cue')),
    tz4SparklineLast: (() => {
      const canvas = document.getElementById('tz4-sparkline');
      const chart = canvas ? window.Chart?.getChart(canvas) : null;
      const values = chart?.data?.datasets?.[0]?.data || [];
      return Number(values.at(-1));
    })(),
    extraTz4EntryCard: Boolean(document.querySelector('#tz4-entry-card')),
    intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
  }));
  assert(dashboardState.protocolPromptCount === 0, `governance testing period: Current Protocol should not render the old Chamber prompt, saw ${dashboardState.protocolPromptCount}`);
  assert(!dashboardState.upgradeStatusActive, 'governance testing period: Current Protocol status slot should stay hidden when the Chamber prompt is removed');
  assert(dashboardState.governanceProcessCards === 0, 'governance testing period: Current Protocol should not duplicate the Chamber governance path');
  assert(dashboardState.governanceTallyCards === 0, 'governance testing period: Current Protocol should not duplicate Chamber vote tally data');
  assert(dashboardState.votingPeriod === 'Cooldown', `governance testing period: voting card should show Cooldown, saw ${dashboardState.votingPeriod}`);
  assert(dashboardState.participation === '---', `governance testing period: participation should be empty-state dashes, saw ${dashboardState.participation}`);
  assert(/No ballots during Cooldown/.test(dashboardState.participationDescription), `governance testing period: participation description mismatch: ${dashboardState.participationDescription}`);
  assert(/Cooldown/.test(dashboardState.entryMini) && /testing and review/.test(dashboardState.entryMini), `governance testing period: Chamber entry status mismatch: ${dashboardState.entryMini}`);
  assert(!dashboardState.chamberEntryWide, 'governance testing period: Tezos L1 Governance should be 1x1 when no baker ballots are open');
  assert(dashboardState.chamberEntrySize === 'compact', `governance testing period: Tezos L1 Governance size flag mismatch: ${dashboardState.chamberEntrySize}`);
  assert(dashboardState.issuance === '4.50%', `governance testing period: disabled LB should be excluded from total issuance, saw ${dashboardState.issuance}`);
  assert(/4\.50% Protocol/.test(dashboardState.issuanceBreakdown), `governance testing period: protocol issuance breakdown mismatch: ${dashboardState.issuanceBreakdown}`);
  assert(/0\.00% LB \(disabled\)/.test(dashboardState.issuanceBreakdown), `governance testing period: disabled LB breakdown missing, saw ${dashboardState.issuanceBreakdown}`);
  assert(dashboardState.lbEntryEma === '51.5%', `governance testing period: LB entry EMA mismatch: ${dashboardState.lbEntryEma}`);
  assert(/Subsidy disabled/.test(dashboardState.lbEntryDescription), `governance testing period: LB entry description mismatch: ${dashboardState.lbEntryDescription}`);
  assert(dashboardState.lbEntryVotes.length >= 4, `governance testing period: LB entry vote tape missing rows: ${JSON.stringify(dashboardState.lbEntryVotes)}`);
  assert(dashboardState.lbEntryVotes.some((row) => /QA Baker/.test(row.text) && row.vote === 'off' && /\boff\b/.test(row.badgeClass)), `governance testing period: LB entry OFF vote row missing: ${JSON.stringify(dashboardState.lbEntryVotes)}`);
  assert(dashboardState.lbEntryVotes.some((row) => /Second Baker/.test(row.text) && row.vote === 'on' && /\bon\b/.test(row.badgeClass)), `governance testing period: LB entry ON vote row missing: ${JSON.stringify(dashboardState.lbEntryVotes)}`);
  assert(dashboardState.lbEntryVotes.some((row) => /Pass Baker/.test(row.text) && row.vote === 'pass' && /\bpass\b/.test(row.badgeClass)), `governance testing period: LB entry PASS vote row missing: ${JSON.stringify(dashboardState.lbEntryVotes)}`);
  assert(dashboardState.lbEntryLive === 'true', `governance testing period: LB entry should have live refresh enabled, saw ${dashboardState.lbEntryLive}`);
  assert(dashboardState.lbEntryRefreshInterval === '60000', `governance testing period: LB entry refresh interval mismatch: ${dashboardState.lbEntryRefreshInterval}`);
  assert(Number(dashboardState.lbEntryRefreshedAt) > 0, `governance testing period: LB entry refreshed timestamp missing: ${dashboardState.lbEntryRefreshedAt}`);
  assert(dashboardState.lbEntryGeometry.tapeRightOfEma && dashboardState.lbEntryGeometry.tapeEmaBandOverlap, `governance testing period: LB vote tape should sit beside the EMA summary, not stack below it: ${JSON.stringify(dashboardState.lbEntryGeometry)}`);
  assert(dashboardState.lbEntryGeometry.cardHeight <= 230, `governance testing period: LB entry card should stay compact after adding the vote tape: ${JSON.stringify(dashboardState.lbEntryGeometry)}`);
  assert(dashboardState.lbEntryGeometry.pairedWithTz4, `governance testing period: LB and tz4 cards should line up in their paired Chambers row: ${JSON.stringify(dashboardState.lbEntryGeometry)}`);
  assert(dashboardState.etherlinkEntryLive === 'true', `governance testing period: Tezos X Governance entry should show live data, saw ${dashboardState.etherlinkEntryLive}`);
  assert(dashboardState.etherlinkEntryWide, 'governance testing period: Tezos X Governance should be 2x1 while an Etherlink proposal is active');
  assert(dashboardState.etherlinkEntrySize === 'wide', `governance testing period: Tezos X Governance size flag mismatch: ${dashboardState.etherlinkEntrySize}`);
  assert(dashboardState.etherlinkEntryValue === '14.2%', `governance testing period: Tezos X Governance value mismatch: ${dashboardState.etherlinkEntryValue}`);
  assert(/FAST .*00625d22ab/.test(dashboardState.etherlinkEntryDescription), `governance testing period: Tezos X Governance description mismatch: ${dashboardState.etherlinkEntryDescription}`);
  assert(/L2 Governance .*FAST: Proposal quorum met/.test(dashboardState.etherlinkEntryMini), `governance testing period: Tezos X Governance status mismatch: ${dashboardState.etherlinkEntryMini}`);
  assert(/FAST14\.2%\/5%/.test(dashboardState.etherlinkEntryMetrics.replace(/\s+/g, '')), `governance testing period: Tezos X Governance FAST metric mismatch: ${dashboardState.etherlinkEntryMetrics}`);
  assert(/SLOW(5hago|Noactiveproposal)/.test(dashboardState.etherlinkEntryMetrics.replace(/\s+/g, '')), `governance testing period: Tezos X Governance SLOW metric mismatch: ${dashboardState.etherlinkEntryMetrics}`);
  const chamberFreshnessLabels = dashboardState.chamberUpdatedLabels.filter((label) => /^as of \d{2}:\d{2} UTC$/.test(label));
  assert(chamberFreshnessLabels.length >= 6, `governance testing period: chamber freshness stamps missing: ${dashboardState.chamberUpdatedLabels.join(', ')}`);
  assert(dashboardState.etherlinkEntryGeometry.overlap === 0, `governance testing period: Tezos X Governance open cue overlaps Sequencer chip: ${JSON.stringify(dashboardState.etherlinkEntryGeometry)}`);
  assert(dashboardState.tz4TileValue === '33.3 / 50%', `governance testing period: tz4 tile value mismatch: ${dashboardState.tz4TileValue}`);
  assert(/1 \/ 3 bakers active/.test(dashboardState.tz4TileDescription), `governance testing period: tz4 tile description mismatch: ${dashboardState.tz4TileDescription}`);
  assert(dashboardState.tz4TileWide, 'governance testing period: tz4 Adoption tile should be 2x1 in Chambers');
  assert(dashboardState.tz4TileSize === 'wide', `governance testing period: tz4 tile size flag mismatch: ${dashboardState.tz4TileSize}`);
  assert(dashboardState.tz4TilePending === '1', `governance testing period: tz4 tile pending count mismatch: ${dashboardState.tz4TilePending}`);
  assert(dashboardState.tz4TileLatest === '1', `governance testing period: tz4 tile latest count mismatch: ${dashboardState.tz4TileLatest}`);
  assert(/Latest switches/.test(dashboardState.tz4TilePreview) && /QA Baker/.test(dashboardState.tz4TilePreview) && /Pending/.test(dashboardState.tz4TilePreview) && /Pending Baker/.test(dashboardState.tz4TilePreview), `governance testing period: tz4 tile preview mismatch: ${dashboardState.tz4TilePreview}`);
  assert(dashboardState.tz4TileWired === '1', `governance testing period: tz4 tile wiring missing: ${dashboardState.tz4TileWired}`);
  assert(dashboardState.tz4TileRole === 'button', `governance testing period: tz4 tile role mismatch: ${dashboardState.tz4TileRole}`);
  assert(dashboardState.tz4TileTabIndex === '0', `governance testing period: tz4 tile keyboard focus mismatch: ${dashboardState.tz4TileTabIndex}`);
  assert(dashboardState.tz4TileCue, 'governance testing period: tz4 tile expand cue missing');
  assert(Math.abs(dashboardState.tz4SparklineLast - (100 / 3)) < 0.01, `governance testing period: tz4 sparkline latest value must match live tile, saw ${dashboardState.tz4SparklineLast}`);
  assert(!dashboardState.extraTz4EntryCard, 'governance testing period: tz4 should use the existing Adoption tile, not a separate entry card');
  assert(dashboardState.intervalDelays.includes(60000), `governance testing period: LB entry 60s refresh timer was not registered: ${dashboardState.intervalDelays.join(', ')}`);

  await page.locator('#etherlink-governance-entry-card .card-front').click();
  await page.locator('#etherlink-governance-modal.active .etherlink-gov-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction((proposal) => document.querySelector('#etherlink-governance-modal .etherlink-gov-proposal-hash')?.textContent?.includes(proposal), ETHERLINK_FAST_PROPOSAL, { timeout: 10000 });
  const etherlinkState = await page.evaluate(() => {
    const modal = document.querySelector('#etherlink-governance-modal');
    const compactText = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
    return {
      title: compactText('#etherlink-governance-modal .chamber-title'),
      badge: compactText('#etherlink-governance-modal .chamber-badge'),
      tabs: document.querySelectorAll('#etherlink-governance-modal [data-etherlink-track]').length,
      tabsA11y: Array.from(document.querySelectorAll('#etherlink-governance-modal [data-etherlink-track]')).map((button) => ({
        track: button.dataset.etherlinkTrack || '',
        role: button.getAttribute('role') || '',
        selected: button.getAttribute('aria-selected') || '',
        active: button.classList.contains('active')
      })),
      activeTab: document.querySelector('#etherlink-governance-modal [data-etherlink-track].active')?.dataset.etherlinkTrack || '',
      proposalHash: compactText('#etherlink-governance-modal .etherlink-gov-proposal-hash'),
      threshold: compactText('#etherlink-governance-modal .etherlink-gov-threshold-row'),
      proposalRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-proposal-row').length,
      historyRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-history-row').length,
      historyText: compactText('#etherlink-governance-modal .etherlink-gov-track-panel'),
      rules: compactText('#etherlink-governance-modal #etherlink-gov-rules'),
      memory: compactText('#etherlink-governance-modal #etherlink-gov-memory'),
      timelineRows: document.querySelectorAll('#etherlink-governance-modal #etherlink-gov-timeline .etherlink-gov-timeline-row').length,
      timelineText: compactText('#etherlink-governance-modal #etherlink-gov-timeline'),
      timelineStyle: (() => {
        const row = document.querySelector('#etherlink-governance-modal #etherlink-gov-timeline .etherlink-gov-timeline-row');
        if (!row) return null;
        const style = window.getComputedStyle(row);
        const box = row.getBoundingClientRect();
        const columns = style.gridTemplateColumns?.split(' ').filter(Boolean) || [];
        return {
          display: style.display,
          color: style.color,
          textDecorationLine: style.textDecorationLine,
          columnCount: columns.length,
          width: box.width
        };
      })(),
      voterRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-voter-row').length,
      activityRows: document.querySelectorAll('#etherlink-governance-modal #etherlink-gov-timeline .etherlink-gov-timeline-row').length,
      footer: compactText('#etherlink-governance-modal .chamber-footer'),
      officialHref: document.querySelector('#etherlink-governance-modal .chamber-footer a[href*="governance.etherlink.com/governance/fast"]')?.href || '',
      storageHref: document.querySelector('#etherlink-governance-modal .chamber-footer a[href*="tzkt.io/KT19oUV"]')?.href || '',
      live: modal?.classList.contains('active') ? 'true' : '',
      refreshState: compactText('#etherlink-governance-refresh-state'),
      periodFacts: compactText('#etherlink-governance-modal .etherlink-gov-explainer .lb-explainer-facts'),
      intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
    };
  });
  assert(/Tezos X Governance/.test(etherlinkState.title), `governance testing period: Tezos X Governance title mismatch: ${etherlinkState.title}`);
  assert(/Proposal quorum met/.test(etherlinkState.badge), `governance testing period: Etherlink badge mismatch: ${etherlinkState.badge}`);
  assert(etherlinkState.tabs === 3, `governance testing period: Etherlink should expose three track tabs, saw ${etherlinkState.tabs}`);
  assert(etherlinkState.tabsA11y.length === 3 && etherlinkState.tabsA11y.every((tab) => tab.role === 'tab'), `governance testing period: Etherlink tabs need role=tab: ${JSON.stringify(etherlinkState.tabsA11y)}`);
  assert(etherlinkState.tabsA11y.every((tab) => tab.selected === String(tab.active)), `governance testing period: Etherlink tabs aria-selected mismatch: ${JSON.stringify(etherlinkState.tabsA11y)}`);
  assert(etherlinkState.activeTab === 'fast', `governance testing period: Etherlink FAST tab should start active, saw ${etherlinkState.activeTab}`);
  assert(etherlinkState.proposalHash === ETHERLINK_FAST_PROPOSAL, `governance testing period: Etherlink proposal hash mismatch: ${etherlinkState.proposalHash}`);
  assert(/93\.2M XTZ upvotes/.test(etherlinkState.threshold) && /14\.2% \/ 5% required/.test(etherlinkState.threshold), `governance testing period: Etherlink threshold mismatch: ${etherlinkState.threshold}`);
  assert(etherlinkState.proposalRows >= 2, `governance testing period: Etherlink proposal rows missing, saw ${etherlinkState.proposalRows}`);
  assert(etherlinkState.historyRows >= 3, `governance testing period: Etherlink FAST history rows missing, saw ${etherlinkState.historyRows}`);
  assert(/Etherlink 6\.1/.test(etherlinkState.historyText), `governance testing period: Etherlink FAST history should include older proposal: ${etherlinkState.historyText.slice(0, 320)}`);
  assert(/Proposalquorum5%/.test(etherlinkState.rules.replace(/\s+/g, '')) && /Period length/.test(etherlinkState.rules), `governance testing period: Etherlink rules panel missing thresholds: ${etherlinkState.rules}`);
  assert(/Track memory/.test(etherlinkState.memory) && /Last proposal/.test(etherlinkState.memory), `governance testing period: Etherlink memory panel missing: ${etherlinkState.memory}`);
  assert(etherlinkState.timelineRows >= 3 && /Submission/.test(etherlinkState.timelineText), `governance testing period: Etherlink merged timeline missing: ${etherlinkState.timelineText}`);
  assert(etherlinkState.timelineStyle?.display === 'grid' && etherlinkState.timelineStyle.columnCount >= 4, `governance testing period: Etherlink timeline rows should use the themed grid, saw ${JSON.stringify(etherlinkState.timelineStyle)}`);
  assert(!/underline/i.test(etherlinkState.timelineStyle?.textDecorationLine || ''), `governance testing period: Etherlink timeline rows should not render as default underlined links: ${JSON.stringify(etherlinkState.timelineStyle)}`);
  assert(!/rgb\(0,\s*0,\s*238\)/.test(etherlinkState.timelineStyle?.color || ''), `governance testing period: Etherlink timeline rows should not render default browser link blue: ${JSON.stringify(etherlinkState.timelineStyle)}`);
  assert(etherlinkState.voterRows >= 3, `governance testing period: Etherlink upvoter rows missing, saw ${etherlinkState.voterRows}`);
  assert(etherlinkState.activityRows >= 3, `governance testing period: Etherlink merged activity rows missing, saw ${etherlinkState.activityRows}`);
  assert(/Direct: \/l2chamber\//.test(etherlinkState.footer), `governance testing period: Tezos X Governance direct footer missing: ${etherlinkState.footer}`);
  assert(etherlinkState.officialHref.includes('/governance/fast'), `governance testing period: Etherlink official track link missing: ${etherlinkState.officialHref}`);
  assert(etherlinkState.storageHref.includes(ETHERLINK_FAST_CONTRACT), `governance testing period: Etherlink TzKT storage link missing: ${etherlinkState.storageHref}`);
  assert(/auto-refresh 60s/.test(etherlinkState.refreshState), `governance testing period: Etherlink refresh label mismatch: ${etherlinkState.refreshState}`);
  assert(!/rolling over now/i.test(etherlinkState.periodFacts), `governance testing period: Etherlink period facts should not stick at rollover: ${etherlinkState.periodFacts}`);
  assert(etherlinkState.intervalDelays.includes(60000), `governance testing period: Etherlink 60s refresh timer missing: ${etherlinkState.intervalDelays.join(', ')}`);

  await page.locator('#etherlink-governance-modal [data-etherlink-track="slow"]').click();
  const etherlinkSlowState = await page.evaluate(() => ({
    activeTab: document.querySelector('#etherlink-governance-modal [data-etherlink-track].active')?.dataset.etherlinkTrack || '',
    historyRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-history-row').length,
    text: document.querySelector('#etherlink-governance-modal')?.textContent || ''
  }));
  assert(etherlinkSlowState.activeTab === 'slow', `governance testing period: Etherlink SLOW tab did not activate, saw ${etherlinkSlowState.activeTab}`);
  assert(/No active SLOW proposal/.test(etherlinkSlowState.text), `governance testing period: Etherlink SLOW empty state missing: ${etherlinkSlowState.text.slice(0, 240)}`);
  assert(etherlinkSlowState.historyRows >= 2 && /Farfadet/.test(etherlinkSlowState.text), `governance testing period: Etherlink SLOW history missing: ${etherlinkSlowState.text.slice(0, 320)}`);
  await page.locator('#etherlink-governance-modal [data-etherlink-track="sequencer"]').click();
  const etherlinkSequencerState = await page.evaluate(() => ({
    activeTab: document.querySelector('#etherlink-governance-modal [data-etherlink-track].active')?.dataset.etherlinkTrack || '',
    historyRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-history-row').length,
    text: document.querySelector('#etherlink-governance-modal')?.textContent || ''
  }));
  assert(etherlinkSequencerState.activeTab === 'sequencer', `governance testing period: Etherlink Sequencer tab did not activate, saw ${etherlinkSequencerState.activeTab}`);
  assert(etherlinkSequencerState.historyRows >= 2 && /Sequencer Upgrade/.test(etherlinkSequencerState.text), `governance testing period: Etherlink Sequencer history missing: ${etherlinkSequencerState.text.slice(0, 320)}`);
  await page.locator('#etherlink-governance-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#etherlink-governance-modal')?.classList.contains('active'), null, { timeout: 5000 });
  await page.evaluate(() => { window.location.hash = 'l2chamber'; });
  await page.locator('#etherlink-governance-modal.active .etherlink-gov-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#etherlink-governance-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#etherlink-governance-modal')?.classList.contains('active'), null, { timeout: 5000 });

  await page.locator('[data-stat="tz4-adoption"] .card-front').click();
  await page.locator('#tz4-adoption-modal.active .tz4-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#tz4-adoption-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#tz4-adoption-modal')?.classList.contains('active'), null, { timeout: 5000 });

  await page.locator('#chamber-entry-card .card-front').click();
  await page.locator('.chamber-overlay.active .chamber-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#chamber-modal.active .chamber-badge').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#chamber-modal.active .gauge-context-label').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('#chamber-current-vote-order .current-vote-row').length >= 2, null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('#chamber-vote-log .vote-log-row').length >= 40, null, { timeout: 10000 });
  const chamberState = await page.evaluate(() => ({
    badge: document.querySelector('#chamber-modal .chamber-badge')?.textContent?.trim() || '',
    badgeClasses: document.querySelector('#chamber-modal .chamber-badge')?.className || '',
    gaugeLabel: document.querySelector('#chamber-modal .gauge-context-label')?.textContent?.trim() || '',
    gaugeMeta: document.querySelector('#chamber-modal .gauge-context-meta')?.textContent?.trim() || '',
    thresholdNote: document.querySelector('#chamber-modal .gauge-threshold-note')?.textContent?.trim() || '',
    svgTextCount: document.querySelectorAll('#chamber-modal .gauge-svg text').length,
    footer: document.querySelector('#chamber-modal .chamber-footer')?.textContent || '',
    proposalIntel: document.querySelector('#chamber-proposal-intel')?.textContent || '',
    gapAnalysis: document.querySelector('#chamber-gap-analysis')?.textContent || '',
    currentVoteTitle: document.querySelector('#chamber-current-vote-order .current-vote-title')?.textContent?.trim() || '',
    currentVoteContext: document.querySelector('#chamber-current-vote-order .current-vote-context')?.textContent?.trim() || '',
    currentVoteCount: document.querySelector('#chamber-current-vote-order .current-vote-count')?.textContent?.trim() || '',
    currentVoteRows: document.querySelectorAll('#chamber-current-vote-order .current-vote-row').length,
    currentVoteFirstText: document.querySelector('#chamber-current-vote-order .current-vote-row')?.textContent || '',
    currentVoteChronological: Array.from(document.querySelectorAll('#chamber-current-vote-order .current-vote-row')).every((row, index, rows) => {
      if (index === 0) return true;
      return Number(rows[index - 1].dataset.ballotTime) <= Number(row.dataset.ballotTime);
    }),
    chamberNow: document.querySelector('#chamber-now-panel')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    chamberNowCards: document.querySelectorAll('#chamber-now-panel .chamber-now-card').length,
    chamberNowWatchItems: document.querySelectorAll('#chamber-now-panel .chamber-now-watch li').length,
    voteLogContext: document.querySelector('#chamber-vote-log .vote-log-context')?.textContent?.trim() || '',
    voteLogCount: document.querySelector('#chamber-vote-log .vote-log-count')?.textContent?.trim() || '',
    voteLogRows: document.querySelectorAll('#chamber-vote-log .vote-log-row').length,
    voteLogFirstText: document.querySelector('#chamber-vote-log .vote-log-row')?.textContent || '',
    voteLogFirstIndex: document.querySelector('#chamber-vote-log .vote-log-row .vote-log-index')?.textContent?.trim() || '',
    voteLogChronological: Array.from(document.querySelectorAll('#chamber-vote-log .vote-log-row')).every((row, index, rows) => {
      if (index === 0) return true;
      const prev = rows[index - 1];
      const prevKey = [Number(prev.dataset.voteEpoch), Number(prev.dataset.votePeriod)];
      const key = [Number(row.dataset.voteEpoch), Number(row.dataset.votePeriod)];
      return prevKey[0] < key[0] || (prevKey[0] === key[0] && prevKey[1] <= key[1]);
    })
  }));
  assert(chamberState.badge === 'Cooldown', `governance testing period: Chamber badge should be Cooldown, saw ${chamberState.badge}`);
  assert(chamberState.badgeClasses.includes('cooldown') && !chamberState.badgeClasses.includes('live'), `governance testing period: Chamber badge class mismatch: ${chamberState.badgeClasses}`);
  assert(chamberState.gaugeLabel === 'Exploration result', `governance testing period: gauge should be a completed result, saw ${chamberState.gaugeLabel}`);
  assert(/No ballots are open during Cooldown/.test(chamberState.gaugeMeta), `governance testing period: gauge meta mismatch: ${chamberState.gaugeMeta}`);
  assert(/80% threshold/.test(chamberState.thresholdNote), `governance testing period: missing threshold note, saw ${chamberState.thresholdNote}`);
  assert(chamberState.svgTextCount === 0, 'governance testing period: threshold label should not be drawn over the gauge arc');
  assert(/Current Cooldown period; showing latest Exploration result/.test(chamberState.footer), `governance testing period: footer mismatch: ${chamberState.footer}`);
  assert(/What is happening now/.test(chamberState.chamberNow) && /Cooldown/.test(chamberState.chamberNow) && /No baker ballots|no-ballot/i.test(chamberState.chamberNow), `governance testing period: current state panel missing quiet-state copy: ${chamberState.chamberNow}`);
  assert(/Promotion opens after Cooldown/.test(chamberState.chamberNow) && /Latest vote/.test(chamberState.chamberNow), `governance testing period: current state panel missing next milestone/latest vote: ${chamberState.chamberNow}`);
  assert(chamberState.chamberNowCards === 3, `governance testing period: current state panel should expose 3 summary cards, saw ${chamberState.chamberNowCards}`);
  assert(chamberState.chamberNowWatchItems >= 3, `governance testing period: current state panel should expose watch items, saw ${chamberState.chamberNowWatchItems}`);
  assert(/Proposal Intel/.test(chamberState.proposalIntel) && /activation window|Cooldown|window ends/i.test(chamberState.proposalIntel), `governance testing period: proposal intel missing: ${chamberState.proposalIntel}`);
  assert(/Gap Analysis/.test(chamberState.gapAnalysis) && /Quorum gap/.test(chamberState.gapAnalysis) && /Largest non-voters/.test(chamberState.gapAnalysis), `governance testing period: gap analysis missing: ${chamberState.gapAnalysis}`);
  assert(chamberState.currentVoteTitle === 'Exploration Vote Order', `governance testing period: current-stage vote order title mismatch: ${chamberState.currentVoteTitle}`);
  assert(/Displayed Exploration result/.test(chamberState.currentVoteContext), `governance testing period: current-stage vote order context mismatch: ${chamberState.currentVoteContext}`);
  assert(chamberState.currentVoteCount === '2 ballots', `governance testing period: current-stage vote count mismatch: ${chamberState.currentVoteCount}`);
  assert(chamberState.currentVoteChronological, 'governance testing period: current-stage votes should be oldest to newest');
  assert(/QA Baker/.test(chamberState.currentVoteFirstText) && /Yay/.test(chamberState.currentVoteFirstText), `governance testing period: current-stage first ballot mismatch: ${chamberState.currentVoteFirstText}`);
  assert(chamberState.voteLogRows >= 40, `governance testing period: chronological vote log should show the full local history, saw ${chamberState.voteLogRows}`);
  assert(chamberState.voteLogChronological, 'governance testing period: chronological vote log should be oldest to newest by epoch and period');
  assert(/oldest to newest/.test(chamberState.voteLogContext), `governance testing period: vote log context should state sort order, saw ${chamberState.voteLogContext}`);
  assert(/Athens/.test(chamberState.voteLogFirstText), `governance testing period: vote log should start with the earliest Athens vote, saw ${chamberState.voteLogFirstText}`);
  assert(chamberState.voteLogFirstIndex === '01', `governance testing period: vote log row numbering should start at 01, saw ${chamberState.voteLogFirstIndex}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.matchMedia('(max-width: 640px)').matches, null, { timeout: 5000 });
  const chamberMobileRows = await page.evaluate(() => {
    const inspectRows = (selector) => Array.from(document.querySelectorAll(selector)).slice(0, 4).map((row, rowIndex) => {
      const rowBox = row.getBoundingClientRect();
      const children = Array.from(row.children).map((el, childIndex) => {
        const box = el.getBoundingClientRect();
        return {
          childIndex,
          cls: el.className,
          text: el.textContent?.trim() || '',
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          overflowX: el.scrollWidth > el.clientWidth + 1
        };
      });
      const overlaps = [];
      for (let first = 0; first < children.length; first += 1) {
        for (let second = first + 1; second < children.length; second += 1) {
          const a = children[first];
          const b = children[second];
          if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
            overlaps.push([a.cls, b.cls]);
          }
        }
      }
      return {
        rowIndex,
        height: rowBox.height,
        overflowX: row.scrollWidth > row.clientWidth + 1,
        overlaps,
        children
      };
    });

    return {
      current: inspectRows('#chamber-current-vote-order .current-vote-row'),
      log: inspectRows('#chamber-vote-log .vote-log-row')
    };
  });
  const funkyCurrentRows = chamberMobileRows.current.filter((row) => row.overflowX || row.overlaps.length);
  const funkyLogRows = chamberMobileRows.log.filter((row) => row.overflowX || row.overlaps.length);
  assert(funkyCurrentRows.length === 0, `governance testing period: mobile current vote rows should not overlap or overflow: ${JSON.stringify(funkyCurrentRows)}`);
  assert(funkyLogRows.length === 0, `governance testing period: mobile vote-log rows should not overlap or overflow: ${JSON.stringify(funkyLogRows)}`);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.locator('.chamber-overlay.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#chamber-modal')?.classList.contains('active'), null, { timeout: 5000 });
  await page.evaluate(() => { window.location.hash = 'chamber'; });
  await page.locator('#chamber-modal.active .chamber-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#chamber-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#chamber-modal')?.classList.contains('active'), null, { timeout: 5000 });
  await page.evaluate(() => { window.location.hash = 'lb-tile'; });
  await page.waitForFunction(() => document.querySelector('#lb-entry-card')?.classList.contains('deep-link-highlight'), null, { timeout: 5000 });
  await page.waitForFunction(() => {
    const rect = document.querySelector('#lb-entry-card')?.getBoundingClientRect();
    return Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight);
  }, null, { timeout: 5000 });
  const lbTileDeepLink = await page.evaluate(() => {
    const rect = document.querySelector('#lb-entry-card')?.getBoundingClientRect();
    return {
      hash: window.location.hash,
      inViewport: Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight),
      modalActive: Boolean(document.querySelector('#liquidity-baking-modal')?.classList.contains('active'))
    };
  });
  assert(lbTileDeepLink.hash === '#lb-tile', `governance testing period: LB tile hash mismatch: ${lbTileDeepLink.hash}`);
  assert(lbTileDeepLink.inViewport, 'governance testing period: LB tile direct link did not scroll the tile into view');
  assert(!lbTileDeepLink.modalActive, 'governance testing period: LB tile direct link should not open the monitor modal');
  await page.evaluate(() => { window.location.hash = 'lb'; });
  await page.locator('#liquidity-baking-modal.active .lb-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('#lb-baker-vote-list .lb-table-row').length >= 4, null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('#lb-lore-body .lb-lore-item').length >= 3, null, { timeout: 10000 });
  const lbState = await page.evaluate(() => {
    const modal = document.querySelector('#liquidity-baking-modal');
    const card = document.querySelector('#lb-entry-card');
    return {
      title: modal?.querySelector('.chamber-title')?.textContent || '',
      ema: modal?.querySelector('.lb-ema-value')?.textContent || '',
      status: modal?.querySelector('.lb-status-banner')?.textContent || '',
      live: modal?.dataset.lbLive || '',
      refreshState: modal?.querySelector('#lb-refresh-state')?.textContent || '',
      recentRows: modal?.querySelectorAll('.lb-recent-table .lb-table-row').length || 0,
      bakerRows: modal?.querySelectorAll('#lb-baker-vote-list .lb-table-row').length || 0,
      filters: modal?.querySelectorAll('.lb-filter-btn').length || 0,
      recentSystemLinks: modal?.querySelectorAll('.lb-recent-table .lb-baker-name-link[href^="#baker="]').length || 0,
      recentTzktLinks: modal?.querySelectorAll('.lb-recent-table .lb-baker-source-link[href^="https://tzkt.io/"]').length || 0,
      bakerSystemLinks: modal?.querySelectorAll('#lb-baker-vote-list .lb-baker-name-link[href^="#baker="]').length || 0,
      bakerTzktLinks: modal?.querySelectorAll('#lb-baker-vote-list .lb-baker-source-link[href^="https://tzkt.io/"]').length || 0,
      firstSystemHref: modal?.querySelector('.lb-recent-table .lb-baker-name-link')?.getAttribute('href') || '',
      firstTzktHref: modal?.querySelector('.lb-recent-table .lb-baker-source-link')?.getAttribute('href') || '',
      systemBrand: modal?.querySelector('.lb-system-brand')?.textContent?.trim() || '',
      emaMeta: modal?.querySelector('#lb-ema-meta')?.textContent?.trim() || '',
      explainer: modal?.querySelector('.lb-explainer')?.textContent?.trim() || '',
      helpCount: modal?.querySelectorAll('.lb-help').length || 0,
      loreExpanded: modal?.querySelector('#lb-lore-toggle')?.getAttribute('aria-expanded') || '',
      loreHidden: modal?.querySelector('#lb-lore-body-wrap')?.hidden ?? null,
      loreCollapsed: modal?.querySelector('.lb-lore-panel')?.dataset.lbLoreCollapsed || '',
      lore: modal?.querySelector('#lb-lore-body')?.textContent?.trim() || '',
      loreItems: modal?.querySelectorAll('#lb-lore-body .lb-lore-item').length || 0,
      readMoreLinks: modal?.querySelectorAll('a[href*="liquidity_baking"], a[href*="liquidity-baking"]').length || 0,
      sparklineSpread: (() => {
        const polyline = modal?.querySelector('#lb-ema-sparkline polyline');
        const points = (polyline?.getAttribute('points') || '').trim().split(/\s+/)
          .map((point) => Number(point.split(',')[1]))
          .filter((value) => Number.isFinite(value));
        if (points.length < 2) return 0;
        return Math.max(...points) - Math.min(...points);
      })(),
      sparklineLabel: modal?.querySelector('#lb-ema-sparkline svg')?.getAttribute('aria-label') || '',
      forecast: modal?.querySelector('#lb-ema-forecast')?.textContent || '',
      forecastMetricValues: Array.from(modal?.querySelectorAll('#lb-ema-forecast .lb-metric-grid strong') || []).map((el) => el.textContent?.trim() || ''),
      history: modal?.querySelector('#lb-ema-history')?.textContent || '',
      changeFeed: modal?.querySelector('#lb-vote-change-feed')?.textContent || '',
      cardUpdatedLabel: card?.dataset.updatedLabel || '',
      intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
    };
  });
  assert(/Liquidity Baking Monitor/.test(lbState.title), `governance testing period: LB modal title mismatch: ${lbState.title}`);
  assert(lbState.ema === '51.5%', `governance testing period: LB EMA should show mocked value, saw ${lbState.ema}`);
  assert(/SUBSIDY DISABLED/.test(lbState.status), `governance testing period: LB status mismatch: ${lbState.status}`);
  assert(lbState.live === 'true', `governance testing period: LB live refresh should be active, saw ${lbState.live}`);
  assert(/auto-refresh 6s/.test(lbState.refreshState), `governance testing period: LB refresh label mismatch: ${lbState.refreshState}`);
  assert(lbState.recentRows >= 4, `governance testing period: LB recent rows missing, saw ${lbState.recentRows}`);
  assert(lbState.bakerRows >= 4, `governance testing period: LB baker rows missing, saw ${lbState.bakerRows}`);
  assert(lbState.filters === 4, `governance testing period: LB filter count mismatch: ${lbState.filters}`);
  assert(lbState.recentSystemLinks >= lbState.recentRows, `governance testing period: LB recent Tezos.Systems links missing, saw ${lbState.recentSystemLinks}`);
  assert(lbState.recentTzktLinks >= lbState.recentRows, `governance testing period: LB recent TzKT links missing, saw ${lbState.recentTzktLinks}`);
  assert(lbState.bakerSystemLinks >= lbState.bakerRows, `governance testing period: LB baker Tezos.Systems links missing, saw ${lbState.bakerSystemLinks}`);
  assert(lbState.bakerTzktLinks >= lbState.bakerRows, `governance testing period: LB baker TzKT links missing, saw ${lbState.bakerTzktLinks}`);
  assert(lbState.firstSystemHref.includes(SAMPLE_ADDRESS), `governance testing period: LB baker profile href mismatch: ${lbState.firstSystemHref}`);
  assert(lbState.firstTzktHref.includes(SAMPLE_ADDRESS), `governance testing period: LB TzKT href mismatch: ${lbState.firstTzktHref}`);
  assert(lbState.systemBrand === 'Tezos.Systems', `governance testing period: LB systems brand strip missing, saw ${lbState.systemBrand}`);
  assert(/50% disable threshold/.test(lbState.emaMeta), `governance testing period: LB EMA threshold copy mismatch: ${lbState.emaMeta}`);
  assert(!/1,000,000,000/.test(lbState.emaMeta), `governance testing period: LB EMA meta should not show raw protocol threshold: ${lbState.emaMeta}`);
  assert(/What is LB/.test(lbState.explainer) && /Liquidity Baking/.test(lbState.explainer), `governance testing period: LB explainer missing, saw ${lbState.explainer}`);
  assert(lbState.helpCount >= 5, `governance testing period: LB contextual tooltips missing, saw ${lbState.helpCount}`);
  assert(lbState.loreExpanded === 'false', `governance testing period: LB lore should start collapsed, saw aria-expanded=${lbState.loreExpanded}`);
  assert(lbState.loreHidden === true, 'governance testing period: LB lore body should be hidden by default');
  assert(lbState.loreCollapsed === 'true', `governance testing period: LB lore collapsed flag mismatch: ${lbState.loreCollapsed}`);
  assert(lbState.loreItems >= 3, `governance testing period: LB protocol-history lore items missing, saw ${lbState.loreItems}`);
  assert(/Granada/.test(lbState.lore) && /Ithaca/.test(lbState.lore) && /Jakarta/.test(lbState.lore), `governance testing period: LB lore should expose Granada/Ithaca/Jakarta, saw ${lbState.lore}`);
  assert(lbState.sparklineSpread >= 12, `governance testing period: LB EMA sparkline should auto-scale recent movement, saw spread ${lbState.sparklineSpread}`);
  assert(/from 51\.\d+% to 51\.\d+%/.test(lbState.sparklineLabel), `governance testing period: LB EMA sparkline label should expose scaled range, saw ${lbState.sparklineLabel}`);
  assert(/EMA Forecast/.test(lbState.forecast) && /Drift/.test(lbState.forecast), `governance testing period: LB forecast panel missing: ${lbState.forecast}`);
  assert(lbState.forecastMetricValues.some((value) => /pp\/d$/.test(value)), `governance testing period: LB drift metric should use compact pp/d unit: ${lbState.forecastMetricValues.join(', ')}`);
  assert(lbState.forecastMetricValues.every((value) => value.length <= 11), `governance testing period: LB forecast metrics should stay compact: ${lbState.forecastMetricValues.join(', ')}`);
  assert(!/pp\/day/.test(lbState.forecast), `governance testing period: LB forecast should avoid verbose pp/day unit: ${lbState.forecast}`);
  assert(/EMA History Strip/.test(lbState.history) && /Sample/.test(lbState.history), `governance testing period: LB history strip missing: ${lbState.history}`);
  assert(/Vote Change Feed/.test(lbState.changeFeed), `governance testing period: LB vote change feed missing: ${lbState.changeFeed}`);
  assert(/^as of \d{2}:\d{2} UTC$/.test(lbState.cardUpdatedLabel), `governance testing period: LB freshness stamp mismatch: ${lbState.cardUpdatedLabel}`);
  await page.locator('#lb-lore-toggle').click();
  const lbLoreExpandedState = await page.evaluate(() => ({
    expanded: document.querySelector('#liquidity-baking-modal #lb-lore-toggle')?.getAttribute('aria-expanded') || '',
    hidden: document.querySelector('#liquidity-baking-modal #lb-lore-body-wrap')?.hidden ?? null,
    collapsed: document.querySelector('#liquidity-baking-modal .lb-lore-panel')?.dataset.lbLoreCollapsed || '',
    items: document.querySelectorAll('#liquidity-baking-modal #lb-lore-body .lb-lore-item').length
  }));
  assert(lbLoreExpandedState.expanded === 'true', `governance testing period: LB lore did not expand, saw aria-expanded=${lbLoreExpandedState.expanded}`);
  assert(lbLoreExpandedState.hidden === false, 'governance testing period: LB lore body stayed hidden after expand');
  assert(lbLoreExpandedState.collapsed === 'false', `governance testing period: LB lore expanded flag mismatch: ${lbLoreExpandedState.collapsed}`);
  assert(lbLoreExpandedState.items >= 3, `governance testing period: LB expanded lore items missing, saw ${lbLoreExpandedState.items}`);
  assert(lbState.readMoreLinks >= 2, `governance testing period: LB read-more links missing, saw ${lbState.readMoreLinks}`);
  assert(lbState.intervalDelays.includes(6000), `governance testing period: LB modal 6s refresh timer was not registered: ${lbState.intervalDelays.join(', ')}`);

  const smoothRefreshStart = await page.evaluate(() => {
    window.__lbBodyNode = document.querySelector('#liquidity-baking-modal .lb-body');
    window.__lbHeaderNode = document.querySelector('#liquidity-baking-modal .lb-header');
    const timer = (window.__tezosSystemsIntervals || []).filter((item) => item.timeout === 6000).at(-1);
    const beforeLevel = document.querySelector('#lb-recent-block-list .lb-table-row')?.dataset.lbLevel || '';
    timer?.handler();
    return { beforeLevel, hasTimer: Boolean(timer) };
  });
  assert(smoothRefreshStart.hasTimer, 'governance testing period: LB smooth refresh timer handler missing');
  await page.waitForFunction((beforeLevel) => {
    const top = document.querySelector('#lb-recent-block-list .lb-table-row')?.dataset.lbLevel || '';
    return top && top !== beforeLevel;
  }, smoothRefreshStart.beforeLevel, { timeout: 5000 });
  const smoothRefreshState = await page.evaluate(() => ({
    sameBody: window.__lbBodyNode === document.querySelector('#liquidity-baking-modal .lb-body'),
    sameHeader: window.__lbHeaderNode === document.querySelector('#liquidity-baking-modal .lb-header'),
    topLevel: document.querySelector('#lb-recent-block-list .lb-table-row')?.dataset.lbLevel || '',
    newRows: document.querySelectorAll('#lb-recent-block-list .lb-row-new').length,
    recentRows: document.querySelectorAll('#lb-recent-block-list .lb-table-row').length
  }));
  assert(smoothRefreshState.sameBody, 'governance testing period: LB refresh should preserve the modal body node');
  assert(smoothRefreshState.sameHeader, 'governance testing period: LB refresh should preserve the header node');
  assert(Number(smoothRefreshState.topLevel) > Number(smoothRefreshStart.beforeLevel), `governance testing period: LB top row should advance, saw ${smoothRefreshStart.beforeLevel} -> ${smoothRefreshState.topLevel}`);
  assert(smoothRefreshState.newRows > 0, 'governance testing period: LB refresh should mark newly inserted rows');
  assert(smoothRefreshState.recentRows <= 12, `governance testing period: LB recent rows should stay capped, saw ${smoothRefreshState.recentRows}`);

  await page.locator('#liquidity-baking-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#liquidity-baking-modal')?.classList.contains('active'), null, { timeout: 5000 });
  await page.evaluate((addr) => {
    localStorage.setItem('tezos-systems-my-baker-address', addr);
    window.location.hash = 'tz4';
  }, SAMPLE_ADDRESS);
  await page.locator('#tz4-adoption-modal.active .tz4-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('#tz4-baker-status-list .tz4-table-row').length >= 3, null, { timeout: 10000 });
  const tz4State = await page.evaluate(() => ({
    title: document.querySelector('#tz4-adoption-modal .chamber-title')?.textContent || '',
    badge: document.querySelector('#tz4-adoption-modal .chamber-badge')?.textContent || '',
    live: document.querySelector('#tz4-adoption-modal')?.dataset.tz4Live || '',
    refreshState: document.querySelector('#tz4-refresh-state')?.textContent || '',
    hero: document.querySelector('#tz4-adoption-modal .tz4-hero-number')?.textContent || '',
    heroCopy: document.querySelector('#tz4-adoption-modal .tz4-hero-copy')?.textContent || '',
    legend: document.querySelector('#tz4-adoption-modal .tz4-adoption-legend')?.textContent || '',
    saved: document.querySelector('#tz4-adoption-modal .tz4-saved-baker')?.textContent || '',
    latestSwitches: document.querySelector('#tz4-adoption-modal .tz4-latest-panel')?.textContent || '',
    latestSwitchRows: document.querySelectorAll('#tz4-adoption-modal [data-tz4-latest-switch]').length,
    pendingQueue: document.querySelector('#tz4-adoption-modal .tz4-pending-panel')?.textContent || '',
    pendingQueueRows: document.querySelectorAll('#tz4-adoption-modal [data-tz4-pending-queue]').length,
    firstMovers: document.querySelector('#tz4-adoption-modal .tz4-first-list')?.textContent || '',
    projection: document.querySelector('#tz4-projection-panel')?.textContent || '',
    holdouts: document.querySelector('#tz4-holdouts-panel')?.textContent || '',
    holdoutNameWhiteSpace: getComputedStyle(document.querySelector('#tz4-holdouts-panel .lb-baker-name-link') || document.body).whiteSpace,
    momentum: document.querySelector('#tz4-switch-momentum')?.textContent || '',
    monthBarStyle: (() => {
      const rail = document.querySelector('#tz4-adoption-modal .tz4-month-bars');
      const bar = rail?.querySelector('.tz4-month-bar');
      const fill = bar?.querySelector('.tz4-month-fill');
      const count = bar?.querySelector('.tz4-month-count');
      if (!rail || !bar || !fill) return null;
      const railStyle = window.getComputedStyle(rail);
      const barStyle = window.getComputedStyle(bar);
      const fillStyle = window.getComputedStyle(fill);
      const fillBox = fill.getBoundingClientRect();
      return {
        count: rail.querySelectorAll('.tz4-month-bar').length,
        railDisplay: railStyle.display,
        barDisplay: barStyle.display,
        fillDisplay: fillStyle.display,
        countText: count?.textContent?.trim() || '',
        fillHeightVar: fillStyle.getPropertyValue('--tz4-month-height').trim(),
        fillWidth: fillBox.width,
        fillHeight: fillBox.height
      };
    })(),
    milestones: document.querySelector('#tz4-power-milestones')?.textContent || '',
    rows: document.querySelectorAll('#tz4-baker-status-list .tz4-table-row').length,
    activeRows: document.querySelectorAll('#tz4-baker-status-list [data-tz4-status="active"]').length,
    pendingRows: document.querySelectorAll('#tz4-baker-status-list [data-tz4-status="pending"]').length,
    notYetRows: document.querySelectorAll('#tz4-baker-status-list [data-tz4-status="not-yet"]').length,
    filters: document.querySelectorAll('#tz4-adoption-modal [data-tz4-filter]').length,
    systemLinks: document.querySelectorAll('#tz4-adoption-modal .lb-baker-name-link[href^="#baker="]').length,
    tzktLinks: document.querySelectorAll('#tz4-adoption-modal .lb-baker-source-link[href^="https://tzkt.io/"]').length,
    footer: document.querySelector('#tz4-adoption-modal .chamber-footer')?.textContent || '',
    cardUpdatedLabel: document.querySelector('[data-stat="tz4-adoption"]')?.dataset.updatedLabel || '',
    chambersLauncherCopy: document.querySelector('.feature-copy-link[data-copy-hash="#chambers"]')?.getAttribute('aria-label') || '',
    intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
  }));
  assert(/tz4 Adoption Chamber/.test(tz4State.title), `governance testing period: tz4 modal title mismatch: ${tz4State.title}`);
  assert(/33\.3% active/.test(tz4State.badge), `governance testing period: tz4 badge mismatch: ${tz4State.badge}`);
  assert(tz4State.live === 'true', `governance testing period: tz4 modal live refresh should be active, saw ${tz4State.live}`);
  assert(/auto-refresh 60s/.test(tz4State.refreshState), `governance testing period: tz4 refresh label mismatch: ${tz4State.refreshState}`);
  assert(tz4State.hero === '33.3%', `governance testing period: tz4 hero adoption mismatch: ${tz4State.hero}`);
  assert(/1 of 3 active bakers/.test(tz4State.heroCopy), `governance testing period: tz4 hero copy mismatch: ${tz4State.heroCopy}`);
  assert(/1 active/.test(tz4State.legend) && /1 pending/.test(tz4State.legend) && /1 not yet/.test(tz4State.legend), `governance testing period: tz4 legend mismatch: ${tz4State.legend}`);
  assert(/QA Baker/.test(tz4State.saved) && /Active/.test(tz4State.saved), `governance testing period: tz4 saved baker status mismatch: ${tz4State.saved}`);
  assert(tz4State.latestSwitchRows === 1, `governance testing period: tz4 latest switch row count mismatch: ${tz4State.latestSwitchRows}`);
  assert(/Latest Switches/.test(tz4State.latestSwitches) && /QA Baker/.test(tz4State.latestSwitches) && /cycle 1,136/.test(tz4State.latestSwitches), `governance testing period: tz4 latest switch panel mismatch: ${tz4State.latestSwitches}`);
  assert(tz4State.pendingQueueRows === 1, `governance testing period: tz4 pending queue row count mismatch: ${tz4State.pendingQueueRows}`);
  assert(/Pending Queue/.test(tz4State.pendingQueue) && /Pending Baker/.test(tz4State.pendingQueue) && /Activates cycle 1,148/.test(tz4State.pendingQueue), `governance testing period: tz4 pending queue panel mismatch: ${tz4State.pendingQueue}`);
  assert(/QA Baker/.test(tz4State.firstMovers) && /cycle 1,136/.test(tz4State.firstMovers), `governance testing period: tz4 first mover list mismatch: ${tz4State.firstMovers}`);
  assert(/Projection to 50%/.test(tz4State.projection) && /Bakers/.test(tz4State.projection), `governance testing period: tz4 projection panel missing: ${tz4State.projection}`);
  assert(/Largest Holdouts/.test(tz4State.holdouts) && /Second Baker/.test(tz4State.holdouts), `governance testing period: tz4 holdouts panel missing: ${tz4State.holdouts}`);
  assert(tz4State.holdoutNameWhiteSpace !== 'nowrap', `governance testing period: tz4 holdout baker names should be allowed to wrap, saw ${tz4State.holdoutNameWhiteSpace}`);
  assert(/Switches per Month/.test(tz4State.momentum) && /Momentum/.test(tz4State.momentum), `governance testing period: tz4 momentum panel missing: ${tz4State.momentum}`);
  assert(tz4State.monthBarStyle?.count >= 1 && tz4State.monthBarStyle.railDisplay === 'grid' && tz4State.monthBarStyle.barDisplay === 'grid' && tz4State.monthBarStyle.fillDisplay === 'block' && /^\d/.test(tz4State.monthBarStyle.countText) && /px$/.test(tz4State.monthBarStyle.fillHeightVar) && tz4State.monthBarStyle.fillWidth > 0 && tz4State.monthBarStyle.fillHeight >= 8, `governance testing period: tz4 switches-per-month bars should render visible columns with count labels, saw ${JSON.stringify(tz4State.monthBarStyle)}`);
  assert(/Power Milestones/.test(tz4State.milestones) && /40% power/.test(tz4State.milestones), `governance testing period: tz4 milestone panel missing: ${tz4State.milestones}`);
  assert(tz4State.rows >= 3, `governance testing period: tz4 table rows missing, saw ${tz4State.rows}`);
  assert(tz4State.activeRows >= 1, 'governance testing period: tz4 active row missing');
  assert(tz4State.pendingRows >= 1, 'governance testing period: tz4 pending row missing');
  assert(tz4State.notYetRows >= 1, 'governance testing period: tz4 not-yet row missing');
  assert(tz4State.filters === 4, `governance testing period: tz4 filter count mismatch: ${tz4State.filters}`);
  assert(tz4State.systemLinks >= 3, `governance testing period: tz4 Tezos.Systems baker links missing, saw ${tz4State.systemLinks}`);
  assert(tz4State.tzktLinks >= 3, `governance testing period: tz4 TzKT links missing, saw ${tz4State.tzktLinks}`);
  assert(/Direct: \/tz4\//.test(tz4State.footer), `governance testing period: tz4 direct footer missing: ${tz4State.footer}`);
  assert(/^as of \d{2}:\d{2} UTC$/.test(tz4State.cardUpdatedLabel), `governance testing period: tz4 freshness stamp mismatch: ${tz4State.cardUpdatedLabel}`);
  assert(/Copy Chambers link/.test(tz4State.chambersLauncherCopy), `governance testing period: combined Chambers launcher copy link missing: ${tz4State.chambersLauncherCopy}`);
  assert(tz4State.intervalDelays.includes(60000), `governance testing period: tz4 modal 60s refresh timer was not registered: ${tz4State.intervalDelays.join(', ')}`);

  await page.locator('#tz4-adoption-modal [data-tz4-filter="pending"]').click();
  const tz4PendingFilter = await page.evaluate(() => ({
    rows: document.querySelectorAll('#tz4-baker-status-list .tz4-table-row').length,
    text: document.querySelector('#tz4-baker-status-list')?.textContent || ''
  }));
  assert(tz4PendingFilter.rows === 1, `governance testing period: tz4 pending filter should show one row, saw ${tz4PendingFilter.rows}`);
  assert(/Pending Baker/.test(tz4PendingFilter.text) && /Activates cycle 1,148/.test(tz4PendingFilter.text), `governance testing period: tz4 pending filter mismatch: ${tz4PendingFilter.text}`);

  await page.locator('#tz4-adoption-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#tz4-adoption-modal')?.classList.contains('active'), null, { timeout: 5000 });

  await context.close();

  const quietContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(quietContext, { etherlinkNullProposal: true, governanceNoProposal: true });
  await quietContext.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });
  const quietPage = await quietContext.newPage();
  attachIssueCollectors(quietPage, 'quiet governance sizing', issues);
  const quietResponse = await quietPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(quietResponse?.ok(), `quiet governance sizing: dashboard failed with HTTP ${quietResponse?.status()}`);
  await quietPage.locator('#chamber-entry-card[data-chamber-entry-size="compact"]').waitFor({ state: 'visible', timeout: 10000 });
  await quietPage.locator('#etherlink-governance-entry-card[data-etherlink-governance-size="compact"]').waitFor({ state: 'visible', timeout: 10000 });
  const quietSizing = await quietPage.evaluate(() => {
    const chamber = document.querySelector('#chamber-entry-card');
    const etherlink = document.querySelector('#etherlink-governance-entry-card');
    const chamberRect = chamber?.getBoundingClientRect();
    const etherlinkRect = etherlink?.getBoundingClientRect();
    return {
      chamberWide: chamber?.classList.contains('chamber-entry-wide') || false,
      chamberSize: chamber?.dataset.chamberEntrySize || '',
      chamberText: chamber?.textContent || '',
      etherlinkWide: etherlink?.classList.contains('chamber-entry-wide') || false,
      etherlinkSize: etherlink?.dataset.etherlinkGovernanceSize || '',
      etherlinkText: etherlink?.textContent || '',
      etherlinkMetricsHidden: document.querySelector('#etherlink-governance-entry-metrics')?.hidden ?? false,
      chamberWidth: chamberRect?.width || 0,
      etherlinkWidth: etherlinkRect?.width || 0,
      etherlinkGeometry: (() => {
        const cue = etherlink?.querySelector('.chamber-expand-cue');
        const sequencer = [...(etherlink?.querySelectorAll('.etherlink-gov-entry-metric') || [])]
          .find((node) => /SEQUENCER/.test(node.textContent || ''));
        const rect = (node) => {
          if (!node) return null;
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
        };
        const cueRect = rect(cue);
        const sequencerRect = rect(sequencer);
        const overlap = cueRect && sequencerRect
          ? Math.max(0, Math.min(cueRect.right, sequencerRect.right) - Math.max(cueRect.left, sequencerRect.left))
            * Math.max(0, Math.min(cueRect.bottom, sequencerRect.bottom) - Math.max(cueRect.top, sequencerRect.top))
          : 0;
        return { cueRect, sequencerRect, overlap };
      })()
    };
  });
  assert(!quietSizing.chamberWide && quietSizing.chamberSize === 'compact', `quiet governance sizing: Tezos L1 Governance should be 1x1, saw ${JSON.stringify(quietSizing)}`);
  assert(/Proposal period/.test(quietSizing.chamberText) && /no ballots open/i.test(quietSizing.chamberText), `quiet governance sizing: Tezos L1 Governance quiet text mismatch: ${quietSizing.chamberText}`);
  assert(!quietSizing.etherlinkWide && quietSizing.etherlinkSize === 'compact', `quiet governance sizing: Tezos X Governance should be 1x1, saw ${JSON.stringify(quietSizing)}`);
  assert(/No Proposal/.test(quietSizing.etherlinkText) && /No active L2 governance proposal/.test(quietSizing.etherlinkText) && /FAST/.test(quietSizing.etherlinkText), `quiet governance sizing: Etherlink idle text mismatch: ${quietSizing.etherlinkText}`);
  assert(!quietSizing.etherlinkMetricsHidden, 'quiet governance sizing: Etherlink metrics should show compact status chips when all tracks are quiet');
  assert(Math.abs(quietSizing.chamberWidth - quietSizing.etherlinkWidth) < 8, `quiet governance sizing: compact cards should share 1x1 width, saw ${quietSizing.chamberWidth} vs ${quietSizing.etherlinkWidth}`);
  assert(quietSizing.etherlinkGeometry.overlap === 0, `quiet governance sizing: Tezos X Governance open cue overlaps Sequencer chip: ${JSON.stringify(quietSizing.etherlinkGeometry)}`);
  await quietContext.close();

  assert(issues.length === 0, `governance testing period browser issues:\n${issues.join('\n')}`);
  log('ok - governance testing period smoke');
}

async function smokeHashModalCleanup(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context, { governanceLiveVote: true });
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, 'hash modal cleanup', issues);
  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `hash modal cleanup: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  await page.evaluate(() => { window.location.hash = 'history'; });
  await page.locator('#history-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 10000 });

  await page.evaluate(() => { window.location.hash = 'chamber'; });
  await page.locator('#chamber-modal.active').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('#history-modal')?.classList.contains('active'), null, { timeout: 5000 });

  await page.evaluate(() => { window.location.hash = 'l2chamber'; });
  await page.locator('#etherlink-governance-modal.active').waitFor({ state: 'visible', timeout: 10000 });
  const stackedState = await page.evaluate(() => ({
    activeModals: Array.from(document.querySelectorAll('.modal-overlay.active, #history-modal.active')).map((modal) => modal.id || modal.className),
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow
  }));
  assert(stackedState.activeModals.length === 1 && stackedState.activeModals[0] === 'etherlink-governance-modal', `hash modal cleanup: stale modals remain under L2: ${JSON.stringify(stackedState)}`);
  assert(stackedState.bodyOverflow === 'hidden' && stackedState.htmlOverflow === 'hidden', `hash modal cleanup: active L2 should own scroll lock: ${JSON.stringify(stackedState)}`);

  await page.locator('#etherlink-governance-modal.active .chamber-close').click();
  await page.waitForFunction(() => {
    const active = Array.from(document.querySelectorAll('.modal-overlay.active, #history-modal.active'));
    return active.length === 0 && document.body.style.overflow !== 'hidden' && document.documentElement.style.overflow !== 'hidden';
  }, null, { timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `hash modal cleanup browser issues:\n${issues.join('\n')}`);
  log('ok - hash modal cleanup smoke');
}

async function smokeFirstVisitTour(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context);
  await context.addInitScript(() => {
    localStorage.removeItem('tezos-toured');
    localStorage.removeItem('tezos-welcomed');
    localStorage.removeItem('tezos-systems-theme');
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'first visit tour', issues);

  let response = await page.goto(`${baseUrl}/#lb`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `first visit tour deep link: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#liquidity-baking-modal.active').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(3200);
  await assertLocatorCount(page.locator('.tour-nudge'), 0, 'deep-link tour nudge');
  await assertLocatorCount(page.locator('#tour-overlay'), 0, 'deep-link tour overlay');
  const firstVisitState = await page.evaluate(() => ({
    theme: localStorage.getItem('tezos-systems-theme'),
    toured: localStorage.getItem('tezos-toured'),
    welcomed: localStorage.getItem('tezos-welcomed')
  }));
  assert(firstVisitState.theme === null, 'deep link should not save a theme or consume first-visit onboarding');
  assert(firstVisitState.toured === null, 'deep link should not mark the tour complete');
  assert(firstVisitState.welcomed === null, 'deep link should not mark welcome complete');

  response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `first visit tour: dashboard failed with HTTP ${response?.status()}`);
  assert(!page.url().includes('/landing.html'), `first visit tour: root should stay on dashboard, saw ${page.url()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#tour-overlay').waitFor({ state: 'detached', timeout: 2000 }).catch(() => {
    throw new Error('first visit tour: tour overlay should not block first paint before Start');
  });
  await page.locator('.tour-nudge').waitFor({ state: 'visible', timeout: 6000 });
  const nudgeText = await page.locator('.tour-nudge').innerText();
  assert(/Need a map/i.test(nudgeText) && /Help is available/i.test(nudgeText) && /Show help/i.test(nudgeText), `first visit tour: passive help nudge copy mismatch: ${nudgeText}`);
  await assertLocatorCount(page.locator('.tour-nudge .tour-start'), 1, 'first visit tour start');
  await page.locator('.tour-nudge .tour-start').click();
  await page.locator('#tour-overlay').waitFor({ state: 'visible', timeout: 6000 });
  const tourText = await page.locator('#tour-overlay').innerText();
  assert(/Search is the map/i.test(tourText) && /Press \//i.test(tourText), `first visit tour: first help step should explain search: ${tourText}`);
  await assertLocatorCount(page.locator('#tour-overlay .tour-skip'), 1, 'first visit tour skip');
  await page.locator('#tour-overlay .tour-skip').click();
  await page.locator('#tour-overlay').waitFor({ state: 'detached', timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `first visit tour browser issues:\n${issues.join('\n')}`);
  log('ok - first visit tour smoke');
}

async function smokeUxChanges(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'clean');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-comparison-visible', 'false');
    localStorage.setItem('tezos-systems-pi-visible', 'false');
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'ux changes', issues);

  let response = await page.goto(`${baseUrl}/?theme=clean#compare`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `ux changes: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('#comparison-section.visible').waitFor({ state: 'visible', timeout: 10000 });
  await expectCount(page, '#comparison-section .section-copy-link[data-copy-hash="#compare"]', 1, 'ux compare copy link');

  const cleanContrast = await page.evaluate(() => {
    const uptimeNode = document.querySelector('.uptime-metric-value, .top-continuity-runtime, #hero-chain-uptime-counter');
    const comparisonNode = document.querySelector('.comparison-col-ethereum .comparison-chain-value');
    const uptime = uptimeNode ? getComputedStyle(uptimeNode).color : '';
    const comparison = comparisonNode ? getComputedStyle(comparisonNode).color : '';
    const shareContent = document.querySelector('.share-modal-content');
    return {
      uptime,
      comparison,
      hasShareContent: Boolean(shareContent)
    };
  });
  assert(cleanContrast.uptime, 'ux changes: clean uptime/continuity metric missing');
  assert(cleanContrast.comparison, 'ux changes: clean comparison value missing');
  assert(!/255,\s*255,\s*255/.test(cleanContrast.uptime), `ux changes: clean uptime metric still white (${cleanContrast.uptime})`);
  assert(!/255,\s*255,\s*255/.test(cleanContrast.comparison), `ux changes: clean comparison value still white (${cleanContrast.comparison})`);

  await openDropdown(page, '#settings-gear', '#settings-dropdown');
  await page.locator('#share-btn').click();
  await page.locator('#section-picker-modal').waitFor({ state: 'visible', timeout: 5000 });
  const pickerColors = await page.evaluate(() => {
    const label = document.querySelector('#section-picker-modal .section-picker-label');
    const content = document.querySelector('#section-picker-modal .share-modal-content');
    return {
      label: getComputedStyle(label).color,
      bg: getComputedStyle(content).backgroundColor
    };
  });
  assert(!/255,\s*255,\s*255/.test(pickerColors.label), `ux changes: clean share picker label still white (${pickerColors.label})`);
  assert(/255,\s*255,\s*255/.test(pickerColors.bg), `ux changes: clean share picker background not white (${pickerColors.bg})`);
  await page.locator('#section-picker-modal .share-modal-close').click();

  await page.goto(`${baseUrl}/?theme=clean#nfts`, { waitUntil: 'domcontentloaded' });
  await page.locator('#objkt-section.visible').waitFor({ state: 'visible', timeout: 10000 });

  await page.goto(`${baseUrl}/?theme=clean#price`, { waitUntil: 'domcontentloaded' });
  await page.locator('#price-intelligence').waitFor({ state: 'visible', timeout: 12000 });
  await expectCount(page, '#price-intelligence .section-copy-link[data-copy-hash="#price"]', 1, 'ux price copy link');

  await page.goto(`${baseUrl}/?theme=clean#widgets`, { waitUntil: 'domcontentloaded' });
  await page.locator('#widgets-gallery').waitFor({ state: 'visible', timeout: 5000 });
  await expectCount(page, '#widgets-gallery .widget-utility-panel', 1, 'ux widget utility');
  await expectCount(page, '#widgets-gallery a[href="/widgets/builder.html"]', 1, 'ux widget utility builder link');
  assert(await page.locator('#widgets-gallery .widget-preview-card').count() === 0, 'ux widget utility: raw preview cards should not render');

  await context.close();
  assert(issues.length === 0, `ux changes browser issues:\n${issues.join('\n')}`);
  log('ok - UX changes smoke');
}

async function smokeFeatureWorkflows(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await installFeatureMocks(context);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    localStorage.setItem('tezos-systems-leaderboard-visible', 'false');
    localStorage.setItem('tezos-systems-calc-visible', 'false');
    localStorage.setItem('tezos-systems-objkt-visible', 'false');
    localStorage.setItem('tezos-systems-whale-enabled', 'false');
    localStorage.setItem('tezos-systems-giants-enabled', 'false');
    localStorage.setItem('tezos-systems-comparison-visible', 'false');
    localStorage.setItem('tezos-systems-pi-visible', 'false');
    localStorage.removeItem('tezos-systems-predictions');
    localStorage.removeItem('tezos-systems-price-alerts');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, 'feature workflows', issues);
  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `feature workflows: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#staking-ratio-front')?.textContent?.trim() === '27.62%', null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('#staking-apy-front')?.textContent?.trim() === '4.2% / 12.7%', null, { timeout: 10000 });
  await page.waitForFunction(() => /pp$/.test(document.querySelector('#staking-trend')?.textContent?.trim() || ''), null, { timeout: 10000 });
  await page.waitForFunction(() => {
    const price = document.querySelector('#price-bar .price-value')?.textContent?.trim() || '';
    const change = document.querySelector('#price-bar .price-change')?.textContent?.trim() || '';
    const sats = document.querySelector('#price-btc')?.textContent?.trim() || '';
    const marketCap = document.querySelector('#price-bar .price-mcap')?.textContent?.trim() || '';
    return price === '$0.740' && change === '+2.5%' && sats === '700 sats' && marketCap === 'MCap $780M';
  }, null, { timeout: 10000 });
  const priceLinks = await page.evaluate(() => ({
    coinGecko: document.querySelector('#price-bar .price-link')?.href || '',
    stake: document.querySelector('#price-bar .price-cta[title="Stake XTZ"]')?.href || '',
    bake: document.querySelector('#price-bar .price-cta[title="Bake on Tezos"]')?.href || ''
  }));
  assert(priceLinks.coinGecko === 'https://www.coingecko.com/en/coins/tezos', `feature workflows price bar CoinGecko link mismatch: ${priceLinks.coinGecko}`);
  assert(priceLinks.stake === 'https://gov.tez.capital/', `feature workflows price bar stake link mismatch: ${priceLinks.stake}`);
  assert(priceLinks.bake === 'https://docs.tez.capital/', `feature workflows price bar bake link mismatch: ${priceLinks.bake}`);
  log('ok - feature workflow: price bar');
  await assertAllSparklineLatestValues(page, 'feature workflows');
  log('ok - all sparkline card latest values match live stats');
  log('ok - staking ratio and APY use TzKT total staked with pp trend');

  await clickFeatureLauncher(page, '#leaderboard-toggle');
  await page.locator('#leaderboard-section.visible').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#leaderboard-results .leaderboard-table').waitFor({ state: 'visible', timeout: 10000 });
  await expectCount(page, '#leaderboard-results .lb-row', 2, 'feature workflows leaderboard rows');
  await page.locator('#leaderboard-results .lb-th[data-col="name"]').click();
  await expectClassContains(page.locator('#leaderboard-results .lb-th[data-col="name"]'), 'active', 'feature workflows leaderboard sort');
  await expectCount(page, '#leaderboard-results .lb-share-btn', 2, 'feature workflows leaderboard share buttons');
  await page.locator('#leaderboard-results .lb-share-btn').first().click();
  await expectShareModal(page, 'feature workflows leaderboard share', issues);
  log('ok - feature workflow: leaderboard');

  await clickFeatureLauncher(page, '#calc-toggle');
  await page.locator('#calculator-section.visible').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#calc-amount').fill('10000');
  await page.waitForFunction(() => {
    const text = document.querySelector('#calc-yearly-xtz')?.textContent?.trim() || '';
    return text && !['-', '—'].includes(text);
  }, null, { timeout: 8000 });
  await page.locator('#calc-mode-toggle [data-mode="stake"]').click();
  await expectClassContains(page.locator('#calc-mode-toggle [data-mode="stake"]'), 'calc-toggle-active', 'feature workflows stake mode');
  await page.locator('#calc-mode-toggle [data-mode="baker"]').click();
  await page.locator('#calc-baker-fields').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#calc-ext-staked').fill('50000');
  await page.locator('#calc-ext-delegated').fill('250000');
  await page.waitForFunction(() => Boolean(document.querySelector('#calc-baker-breakdown')), null, { timeout: 8000 });
  log('ok - feature workflow: calculator modes');

  await clickFeatureLauncher(page, '#price-intel-toggle');
  await page.locator('#price-intelligence').waitFor({ state: 'visible', timeout: 10000 });
  await expectCount(page, '#price-intelligence .pi-card', 1, 'feature workflows price intelligence card');
  await page.locator('#pi-btn-higher').click();
  await expectClassContains(page.locator('#pi-btn-higher'), 'active-higher', 'feature workflows price prediction');
  await page.locator('#pi-alert-price').fill('0.90');
  await page.locator('#pi-alert-set').click();
  await page.waitForFunction(() => document.querySelector('.pi-alert-count')?.textContent?.trim() === '1/5 active', null, { timeout: 5000 });
  log('ok - feature workflow: price intelligence');

  await clickFeatureLauncher(page, '#comparison-toggle');
  await page.locator('#comparison-section.visible').waitFor({ state: 'visible', timeout: 5000 });
  await expectCount(page, '#comparison-summary .comparison-standing-card', 5, 'feature workflows comparison standing cards');
  await expectCount(page, '#comparison-grid .comparison-card', 5, 'feature workflows comparison cards');
  log('ok - feature workflow: comparison');

  await clickFeatureLauncher(page, '#whale-toggle');
  await page.locator('#whale-section.visible').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#whale-feed .whale-tx').waitFor({ state: 'visible', timeout: 10000 });
  assert((await page.locator('#whale-feed').innerText()).includes('QA Baker'), 'feature workflows whale feed missing mocked sender');
  log('ok - feature workflow: whale feed');

  await clickFeatureLauncher(page, '#giants-toggle');
  await page.locator('#giants-section.visible').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#giants-grid .giant-card').length > 0, null, { timeout: 10000 });
  await expectCount(page, '#giants-stats .giants-stat', 3, 'feature workflows giant stats');
  log('ok - feature workflow: sleeping giants');

  await clickFeatureLauncher(page, '#objkt-toggle');
  await page.locator('#objkt-section.visible').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#objkt-input').fill(SAMPLE_ADDRESS);
  await page.locator('#objkt-fetch').click();
  await page.waitForFunction(() => document.querySelectorAll('#objkt-results .objkt-subsection').length > 0, null, { timeout: 10000 });
  const objktText = await page.locator('#objkt-results').innerText();
  assert(/creator/i.test(objktText) && /collector/i.test(objktText), `feature workflows NFT profile should render creator and collector sections, saw: ${objktText}`);
  assert(/Assets Held\s+501/i.test(objktText), `feature workflows NFT profile should page held assets past 500, saw: ${objktText}`);
  assert(/Top Collections Held[\s\S]*Smoke Collection[\s\S]*501 assets/i.test(objktText), `feature workflows NFT top collections should page distinct assets past 500, saw: ${objktText}`);
  assert(!/13635916737 pieces/i.test(objktText), `feature workflows NFT top collections should not expose raw high-edition quantity as pieces, saw: ${objktText}`);
  await page.locator('#objkt-clear').click();
  assert((await page.locator('#objkt-results').innerText()).trim() === '', 'feature workflows NFT clear should empty results');
  log('ok - feature workflow: NFT profile');

  await clickFeatureLauncher(page, '#history-btn');
  await page.locator('#history-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 10000 });
  await expectCount(page, '#history-modal .time-range-btn', 4, 'feature workflows history ranges');
  await page.waitForFunction(() => document.querySelectorAll('#history-digest .history-digest-card').length === 7, null, { timeout: 10000 });
  const digestText = (await page.locator('#history-digest').innerText()).toLowerCase();
  for (const expected of ['Consensus', 'Economy', 'Liquidity Baking', 'Market', 'Network Health', 'Tezos X', 'Governance']) {
    assert(digestText.includes(expected.toLowerCase()), `feature workflows history digest missing ${expected}: ${digestText}`);
  }
  const governanceHistorySection = page.locator('#chart-governance-participation').locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " chart-section ")]');
  await expectClassContains(governanceHistorySection, 'is-empty', 'feature workflows governance history quiet-state');
  const governanceHistoryText = (await governanceHistorySection.locator('.history-chart-empty').innerText()).toLowerCase();
  assert(governanceHistoryText.includes('no ballot samples'), `feature workflows governance history should explain quiet participation data, saw: ${governanceHistoryText}`);
  await page.locator('#history-modal .time-range-btn[data-range="24h"]').click();
  await expectClassContains(page.locator('#history-modal .time-range-btn[data-range="24h"]'), 'active', 'feature workflows history range');
  await page.waitForFunction(() => document.querySelector('#history-digest')?.textContent?.includes('24h'), null, { timeout: 5000 });
  await page.locator('#history-share-btn').click();
  await expectShareModal(page, 'feature workflows historical data share', issues);
  await page.locator('#history-modal-close').click();
  await page.locator('#history-modal[aria-hidden="true"]').waitFor({ state: 'attached', timeout: 5000 });
  log('ok - feature workflow: history modal');

  await page.locator('[data-stat="total-bakers"] .card-history-btn').click({ force: true });
  await page.locator('#card-history-modal.active').waitFor({ state: 'visible', timeout: 10000 });
  assert((await page.locator('#card-history-modal .card-history-title').innerText()).includes('Total Bakers'), 'feature workflows card history title mismatch');
  await expectCount(page, '#card-history-modal .card-history-range-btn', 4, 'feature workflows card history ranges');
  await expectClassContains(page.locator('#card-history-modal .card-history-range-btn[data-range="30d"]'), 'active', 'feature workflows card history default range');
  await page.locator('#card-history-modal .card-history-chart canvas').waitFor({ state: 'visible', timeout: 10000 });
  const initialCardHistoryChartId = await page.evaluate(() => String(window.Chart?.getChart(document.getElementById('card-history-canvas'))?.id ?? ''));
  await page.locator('#card-history-modal .card-history-range-btn[data-range="90d"]').click();
  await expectClassContains(page.locator('#card-history-modal .card-history-range-btn[data-range="90d"]'), 'active', 'feature workflows card history 90d range');
  const ninetyDayCardHistoryChartId = await page.waitForFunction((previousId) => {
    const modal = document.querySelector('#card-history-modal');
    const canvas = document.getElementById('card-history-canvas');
    const chart = canvas ? window.Chart?.getChart(canvas) : null;
    return modal?.dataset.cardHistoryRange === '90d' && chart && String(chart.id) !== previousId
      ? String(chart.id)
      : false;
  }, initialCardHistoryChartId, { timeout: 10000 });
  await page.locator('#card-history-modal .card-history-range-btn[data-range="all"]').click();
  await expectClassContains(page.locator('#card-history-modal .card-history-range-btn[data-range="all"]'), 'active', 'feature workflows card history all-time range');
  await page.waitForFunction((previousId) => {
    const modal = document.querySelector('#card-history-modal');
    const canvas = document.getElementById('card-history-canvas');
    const chart = canvas ? window.Chart?.getChart(canvas) : null;
    return modal?.dataset.cardHistoryRange === 'all' && chart && String(chart.id) !== previousId;
  }, await ninetyDayCardHistoryChartId.jsonValue(), { timeout: 10000 });
  await page.locator('#card-history-close').click();
  await page.locator('#card-history-modal[aria-hidden="true"]').waitFor({ state: 'attached', timeout: 5000 });
  await expectCount(page, '[data-stat="staking-apy"] .card-history-btn', 1, 'feature workflows staking APY card history');
  await expectCount(page, '[data-stat="delegated"] .card-history-btn', 1, 'feature workflows delegated card history');
  await expectCount(page, '[data-stat="total-burned"] .card-history-btn', 1, 'feature workflows total burned card history');
  await expectCount(page, '[data-stat="baking-power"] .card-history-btn', 1, 'feature workflows baking power card history');
  log('ok - feature workflow: card history');

  await page.locator('#protocol-history-entry-card').scrollIntoViewIfNeeded();
  await page.locator('#protocol-history-entry-card').click();
  await page.locator('#protocol-history-chamber-modal.active #upgrade-timeline .timeline-item[data-protocol="Quebec"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.timeline-share-btn').waitFor({ state: 'attached', timeout: 10000 });
  await page.locator('#protocol-history-chamber-modal .protocol-history-content').hover();
  await page.locator('.timeline-share-btn').click();
  await expectShareModal(page, 'feature workflows protocol timeline share', issues);
  log('ok - feature workflow: protocol timeline share');

  await page.locator('#protocol-history-chamber-modal #upgrade-timeline .timeline-item[data-protocol="Quebec"]').scrollIntoViewIfNeeded();
  await page.locator('#protocol-history-chamber-modal #upgrade-timeline .timeline-item[data-protocol="Quebec"]').click();
  await page.locator('#protocol-history-modal').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#protocol-history-modal #history-modal-share').click();
  await expectShareModal(page, 'feature workflows protocol history share', issues);
  await page.locator('#protocol-history-modal #history-modal-close').click();
  await page.locator('#protocol-history-modal').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('#protocol-history-chamber-modal .chamber-close').click();
  await page.locator('#protocol-history-chamber-modal').waitFor({ state: 'detached', timeout: 5000 });
  log('ok - feature workflow: protocol history share');

  await page.locator('[data-stat="total-bakers"]').scrollIntoViewIfNeeded();
  await page.locator('[data-stat="total-bakers"]').hover();
  await page.evaluate(() => document.querySelector('[data-stat="total-bakers"] .card-share-btn')?.click());
  await expectShareModal(page, 'feature workflows card share', issues);
  log('ok - feature workflow: card share');

  await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
  await page.locator('#share-btn').click();
  await page.locator('#section-picker-modal').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#section-capture-btn').click();
  await expectShareModal(page, 'feature workflows dashboard share', issues);
  log('ok - feature workflow: dashboard share');

  await page.locator('#comparison-section').scrollIntoViewIfNeeded();
  await page.locator('#comparison-share-all-btn').click();
  await expectShareModal(page, 'feature workflows comparison share', issues);
  log('ok - feature workflow: comparison share');

  await ensureDropdownOpen(page, '#features-gear', '#features-dropdown');
  await page.locator('#state-of-tezos-btn').click();
  await expectShareModal(page, 'feature workflows state of tezos share', issues);
  log('ok - feature workflow: state of tezos share');

  await context.close();
  assert(issues.length === 0, `feature workflows browser issues:\n${issues.join('\n')}`);
  log('ok - feature workflows smoke');
}

async function smokeShareActions(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
  await installFeatureMocks(context);
  await installShareActionMocks(context, { nativeShare: true });
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, 'share actions', issues);
  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `share actions: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('[data-stat="total-bakers"] .card-share-btn').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-stat="total-bakers"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('[data-stat="total-bakers"] .card-share-btn')?.click());
  await waitForShareModal(page, 'share actions card share', issues);

  const refreshButton = page.locator('#share-modal #tweet-refresh-btn');
  if (await refreshButton.count()) {
    const initialChoiceText = await page.locator('#share-modal .tweet-option').first().innerText();
    await refreshButton.click();
    await page.waitForFunction((previous) => {
      const first = document.querySelector('#share-modal .tweet-option')?.textContent || '';
      return first && first !== previous;
    }, initialChoiceText, { timeout: 5000 }).catch(() => {});
    await expectCount(page, '#share-modal .tweet-option', 2, 'share actions refreshed tweet options');
  }

  await page.locator('#share-modal #share-copy').click();
  await page.waitForFunction(() => window.__shareActions.clipboardWrites.some((entry) => entry.types?.includes('image/png')), null, { timeout: 5000 });
  await page.locator('#share-modal #share-twitter').click();
  await page.waitForFunction(() => window.__shareActions.opens.some((entry) => entry.url.startsWith('https://twitter.com/intent/tweet?text=')), null, { timeout: 5000 });
  await page.locator('#share-modal #share-native').click();
  await page.waitForFunction(() => window.__shareActions.nativeShares.some((entry) => entry.fileCount === 1 && entry.fileTypes.includes('image/png') && entry.url === 'https://tezos.systems'), null, { timeout: 5000 });
  await page.locator('#share-modal #share-download').click();
  await page.waitForFunction(() => window.__shareActions.downloads.some((entry) => /^tezos-systems-\d+\.png$/.test(entry.download) && entry.href.startsWith('data:image/png')), null, { timeout: 5000 });

  const desktopActions = await page.evaluate(() => window.__shareActions);
  assert(desktopActions.clipboardWrites.filter((entry) => entry.types?.includes('image/png')).length >= 2, `share actions: expected copy/twitter image clipboard writes: ${JSON.stringify(desktopActions)}`);
  assert(desktopActions.opens.length === 1, `share actions: expected one X intent open: ${JSON.stringify(desktopActions.opens)}`);
  assert(desktopActions.nativeShares.length === 1, `share actions: expected one native share: ${JSON.stringify(desktopActions.nativeShares)}`);
  assert(desktopActions.downloads.length === 1, `share actions: expected one desktop download: ${JSON.stringify(desktopActions.downloads)}`);
  await page.locator('#share-modal .share-modal-close').click();
  await page.locator('#share-modal').waitFor({ state: 'detached', timeout: 5000 });
  await context.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
    hasTouch: true,
    serviceWorkers: 'block'
  });
  await installFeatureMocks(mobileContext);
  await installShareActionMocks(mobileContext, { nativeShare: false });
  await mobileContext.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  const mobilePage = await mobileContext.newPage();
  attachIssueCollectors(mobilePage, 'share actions mobile fallback', issues);
  const mobileResponse = await mobilePage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(mobileResponse?.ok(), `share actions mobile fallback: dashboard failed with HTTP ${mobileResponse?.status()}`);
  await mobilePage.locator('[data-stat="total-bakers"] .card-share-btn').waitFor({ state: 'visible', timeout: 10000 });
  await mobilePage.evaluate(() => document.querySelector('[data-stat="total-bakers"] .card-share-btn')?.click());
  await waitForShareModal(mobilePage, 'share actions mobile fallback card share', issues);
  await mobilePage.locator('#share-modal #share-download').click();
  await mobilePage.waitForFunction(() => Array.from(document.querySelectorAll('body > div')).some((node) => /Save to Photos/.test(node.textContent || '') && node.querySelector('img[src^="data:image/png"]')), null, { timeout: 5000 });
  await mobilePage.locator('body > div img[src^="data:image/png"] + button').last().click();
  await mobilePage.locator('#share-modal .share-modal-close').click();
  await mobilePage.locator('#share-modal').waitFor({ state: 'detached', timeout: 5000 });
  await mobileContext.close();

  assert(issues.length === 0, `share actions browser issues:\n${issues.join('\n')}`);
  log('ok - share actions smoke');
}

async function smokeInfoModals(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context);
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-systems-stats-visible', 'true');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    localStorage.setItem('tezos-systems-leaderboard-visible', 'true');
    localStorage.setItem('tezos-systems-calc-visible', 'true');
    localStorage.setItem('tezos-systems-objkt-visible', 'true');
    localStorage.setItem('tezos-systems-whale-enabled', 'true');
    localStorage.setItem('tezos-systems-giants-enabled', 'true');
    localStorage.setItem('tezos-systems-comparison-visible', 'true');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, 'info modals', issues);
  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `info modals: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  const modalPairs = [
    ['#consensus-info-btn', '#consensus-modal', '#consensus-modal-close'],
    ['#governance-info-btn', '#governance-modal', '#governance-modal-close'],
    ['#economy-info-btn', '#economy-modal', '#economy-modal-close'],
    ['#network-info-btn', '#network-modal', '#network-modal-close'],
    ['#ecosystem-info-btn', '#ecosystem-modal', '#ecosystem-modal-close'],
    ['#comparison-info-btn', '#comparison-modal', '#comparison-modal-close'],
    ['#leaderboard-info-btn', '#leaderboard-modal', '#leaderboard-modal-close'],
    ['#calc-info-btn', '#calc-modal', '#calc-modal-close'],
    ['#objkt-info-btn', '#objkt-modal', '#objkt-modal-close'],
    ['#whale-info-btn', '#whale-modal', '#whale-modal-close'],
    ['#giants-info-btn', '#giants-modal', '#giants-modal-close']
  ];

  for (const [trigger, modal, close] of modalPairs) {
    const triggerLocator = page.locator(trigger);
    await assertLocatorCount(triggerLocator, 1, `info modals trigger ${trigger}`);
    await triggerLocator.scrollIntoViewIfNeeded();
    await triggerLocator.click();
    await page.locator(`${modal}[aria-hidden="false"]`).waitFor({ state: 'attached', timeout: 5000 });
    await page.locator(close).click();
    await page.locator(`${modal}[aria-hidden="true"]`).waitFor({ state: 'attached', timeout: 5000 });
  }

  await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
  await page.locator('#about-tezos-btn').click();
  await page.locator('#about-tezos-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 5000 });
  const aboutText = await page.locator('#about-tezos-modal').innerText();
  assert(!/June 30, 2018|June 2018/i.test(aboutText), 'about modal should not contain stale June 2018 launch wording');
  await page.locator('#about-tezos-modal-close').click();
  await page.locator('#about-tezos-modal[aria-hidden="true"]').waitFor({ state: 'attached', timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `info modals browser issues:\n${issues.join('\n')}`);
  log('ok - info modals smoke');
}

async function smokeThemeSelection(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  await context.addInitScript(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
    localStorage.setItem('tezos-toured', '1');
    localStorage.setItem('tezos-welcomed', '1');
    localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
  });

  const page = await context.newPage();
  attachIssueCollectors(page, 'theme selection', issues);
  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `theme selection: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

  const themes = await page.evaluate(() => Array.from(document.querySelectorAll('#theme-picker-dropdown .theme-row')).map((row) => row.dataset.theme)).catch(() => []);
  assert(themes.length === 0, 'theme picker should not exist before opening');

  for (const theme of ['clean', 'dark', 'bubblegum', 'warzone']) {
    await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#theme-toggle').click();
    await page.locator('#theme-picker-dropdown.open').waitFor({ state: 'visible', timeout: 5000 });
    const row = page.locator(`#theme-picker-dropdown .theme-row[data-theme="${theme}"]`);
    await assertLocatorCount(row, 1, `theme row ${theme}`);
    await row.click();
    await page.waitForFunction((expected) => document.body.getAttribute('data-theme') === expected, theme, { timeout: 5000 });
  }

  await context.close();
  assert(issues.length === 0, `theme selection browser issues:\n${issues.join('\n')}`);
  log('ok - theme selection smoke');
}

async function smokeWidgetBuilder(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'widget builder', issues);

  const response = await page.goto(`${baseUrl}/widgets/builder.html`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `widget builder: failed with HTTP ${response?.status()}`);
  await page.locator('#preview-frame').waitFor({ state: 'visible', timeout: 10000 });
  await expectCount(page, '#widget-type-grid .widget-type-btn', 8, 'widget builder type buttons');
  await expectCount(page, '#theme-grid .theme-btn[data-theme="aurora"]', 1, 'widget builder aurora theme');
  await expectCount(page, '#theme-grid .theme-btn[data-theme="transparent"]', 1, 'widget builder transparent theme');
  await page.waitForFunction(() => new URL(document.querySelector('#preview-frame')?.src || location.href).searchParams.get('theme') === 'aurora', null, { timeout: 5000 });

  await page.locator('.widget-type-btn[data-type="price"]').click();
  await expectClassContains(page.locator('.widget-type-btn[data-type="price"]'), 'active', 'widget builder price type');
  await page.waitForFunction(() => document.querySelector('#preview-frame')?.src.includes('/widgets/price.html'), null, { timeout: 5000 });

  await page.locator('#width-input').fill('420');
  await page.locator('#height-input').fill('180');
  await page.waitForFunction(() => {
    const frame = document.querySelector('#preview-frame');
    return frame?.getAttribute('width') === '420' && frame?.getAttribute('height') === '180';
  }, null, { timeout: 5000 });

  await page.locator('.code-tab[data-tab="markdown"]').click();
  assert((await page.locator('#code-text').innerText()).includes('![Tezos'), 'widget builder markdown code should render');

  await page.locator('.widget-type-btn[data-type="combo"]').click();
  await expectClassContains(page.locator('.widget-type-btn[data-type="combo"]'), 'active', 'widget builder combo type');
  await expectCount(page, '#combo-options input[value="health"]', 1, 'widget builder combo health stat');
  await expectCount(page, '#combo-options input[value="tz4"]', 1, 'widget builder combo tz4 stat');
  await page.locator('#combo-options input[value="price"]').uncheck();
  await page.locator('#combo-options input[value="blocks"]').uncheck();
  await page.locator('#combo-options input[value="health"]').check();
  await page.locator('#combo-options input[value="tz4"]').check();
  await page.waitForFunction(() => {
    const frame = document.querySelector('#preview-frame');
    const stats = new URL(frame?.src || location.href).searchParams.get('stats') || '';
    return frame?.src.includes('/widgets/combo.html') && stats.includes('health') && stats.includes('tz4');
  }, null, { timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `widget builder browser issues:\n${issues.join('\n')}`);
  log('ok - widget builder smoke');
}

async function smokeHenMode(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  await installFeatureMocks(context);
  const page = await context.newPage();
  attachIssueCollectors(page, 'HEN mode', issues);

  const response = await page.goto(`${baseUrl}/?hen=1`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `HEN mode: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('#hen-overlay.active').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.hen-close').click();
  await page.waitForFunction(() => !document.querySelector('#hen-overlay')?.classList.contains('active'), null, { timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `HEN mode browser issues:\n${issues.join('\n')}`);
  log('ok - HEN mode smoke');
}

async function crawlRoutes(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'route crawl', issues);

  for (const route of browserRoutes) {
    const url = `${baseUrl}${route}`;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    assert(response?.status() !== 404, `route returned 404: ${route}`);
    assert((response?.status() || 0) < 500, `route returned ${response?.status()}: ${route}`);
    const bodyText = (await page.locator('body').innerText({ timeout: 5000 })).trim();
    assert(bodyText.length > 0, `route rendered empty body: ${route}`);
    log(`ok - route ${route} (${response?.status()})`);
  }

  await context.close();
  assert(issues.length === 0, `route crawl browser issues:\n${issues.join('\n')}`);
}

async function smokeStandaloneLinks(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'standalone links', issues);
  const checkedTargets = new Map();
  const unsafeHrefs = [];

  for (const route of browserRoutes) {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    assert((response?.status() || 0) < 500, `standalone links: route returned ${response?.status()}: ${route}`);

    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]'))
      .filter((anchor) => {
        const box = anchor.getBoundingClientRect();
        const style = getComputedStyle(anchor);
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      })
      .map((anchor) => ({
        href: anchor.getAttribute('href') || '',
        absolute: anchor.href,
        text: (anchor.textContent || anchor.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80)
      })));

    for (const link of links) {
      if (/^(javascript:|mailto:|tel:)/i.test(link.href)) continue;
      if (/localhost|127\.0\.0\.1|file:\/\//i.test(link.href)) unsafeHrefs.push(`${route} ${link.href}`);
      const target = new URL(link.absolute);
      const isFirstParty = target.origin === new URL(baseUrl).origin || target.origin === 'https://tezos.systems';
      if (!isFirstParty) continue;
      const pathWithSearch = `${target.pathname || '/'}${target.search || ''}`;
      checkedTargets.set(pathWithSearch, { route, text: link.text });
    }
  }

  assert(unsafeHrefs.length === 0, `standalone links: unsafe local/file hrefs found:\n${unsafeHrefs.join('\n')}`);
  assert(checkedTargets.size >= 12, `standalone links: expected broad first-party link coverage, saw ${checkedTargets.size}`);

  const failures = [];
  for (const [target, source] of checkedTargets) {
    const response = await context.request.get(`${baseUrl}${target}`, { failOnStatusCode: false });
    if (response.status() >= 500 || response.status() === 404) {
      failures.push(`${source.route} -> ${target} (${response.status()}) "${source.text}"`);
    }
  }

  await context.close();
  assert(failures.length === 0, `standalone links: first-party targets failed:\n${failures.join('\n')}`);
  assert(issues.length === 0, `standalone links browser issues:\n${issues.join('\n')}`);
  log(`ok - standalone link integrity (${checkedTargets.size} first-party targets)`);
}

async function smokeRouteFormatting(browser, baseUrl) {
  const issues = [];

  for (const { label, viewport } of formattingViewports) {
    const context = await browser.newContext({
      viewport,
      serviceWorkers: 'block'
    });
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, `route formatting ${label}`, issues);
    const formattingIssues = [];

    for (const route of formattingRoutes) {
      const url = `${baseUrl}${route}`;
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      assert((response?.status() || 0) < 500, `route formatting ${label}: route returned ${response?.status()}: ${route}`);
      await page.locator('body').waitFor({ state: 'attached', timeout: 5000 });
      await page.waitForTimeout(300);

      const routeIssues = await page.evaluate(() => {
        const found = [];
        const viewportWidth = window.innerWidth;
        const doc = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(doc?.scrollWidth || 0, body?.scrollWidth || 0);
        const horizontalOverflow = scrollWidth - viewportWidth;

        if (horizontalOverflow > 4) {
          found.push(`document overflows viewport by ${horizontalOverflow.toFixed(1)}px (scrollWidth ${scrollWidth}, viewport ${viewportWidth})`);
        }

        const ignoredAncestorSelector = [
          '[hidden]',
          '[aria-hidden="true"]',
          '#my-tezos-drawer:not(.open):not(.active)',
          '#features-dropdown:not(.open)',
          '#settings-dropdown:not(.open)',
          '#theme-picker-dropdown:not(.open)',
          '.modal-overlay:not(.active):not(.visible):not([aria-hidden="false"])',
          '.changelog-modal:not(.active):not([aria-hidden="false"])'
        ].join(', ');
        const skippedTags = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE']);
        const elementName = (node) => {
          if (node.id) return `#${node.id}`;
          const className = typeof node.className === 'string'
            ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
            : '';
          return className ? `${node.tagName.toLowerCase()}.${className}` : node.tagName.toLowerCase();
        };
        const textSample = (node) => (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        const isVisible = (node) => {
          if (!node || skippedTags.has(node.tagName)) return false;
          if (node.closest(ignoredAncestorSelector)) return false;
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
          const box = node.getBoundingClientRect();
          return box.width > 1 && box.height > 1;
        };

        const escaped = [];
        for (const node of Array.from(document.body.querySelectorAll('*'))) {
          if (!isVisible(node)) continue;
          const box = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          if (style.position === 'fixed' && box.width >= viewportWidth - 2) continue;
          if (box.left < -4 || box.right > viewportWidth + 4) {
            escaped.push(`${elementName(node)} at ${box.left.toFixed(1)}..${box.right.toFixed(1)} "${textSample(node)}"`);
          }
        }

        if (escaped.length) {
          found.push(`visible content escapes viewport: ${escaped.slice(0, 8).join(' | ')}`);
        }

        const clipped = [];
        const controlSelector = [
          'button',
          'a',
          'input',
          'select',
          'textarea',
          '.landing-card',
          '.theme-card',
          '.feature-launcher-item',
          '.widget-type-btn',
          '.comparison-card'
        ].join(', ');
        for (const node of Array.from(document.querySelectorAll(controlSelector))) {
          if (!isVisible(node)) continue;
          const style = window.getComputedStyle(node);
          const clipsX = ['hidden', 'clip'].includes(style.overflowX);
          const clipsY = ['hidden', 'clip'].includes(style.overflowY);
          if ((clipsX && node.scrollWidth > node.clientWidth + 3) || (clipsY && node.scrollHeight > node.clientHeight + 3)) {
            clipped.push(`${elementName(node)} ${node.scrollWidth}x${node.scrollHeight} > ${node.clientWidth}x${node.clientHeight} "${textSample(node)}"`);
          }
        }

        if (clipped.length) {
          found.push(`visible control text/content clips: ${clipped.slice(0, 8).join(' | ')}`);
        }

        return found;
      });

      formattingIssues.push(...routeIssues.map((issue) => `${label} ${route}: ${issue}`));
    }

    await context.close();
    assert(formattingIssues.length === 0, `route formatting issues:\n${formattingIssues.join('\n')}`);
    log(`ok - route formatting (${label}, ${formattingRoutes.length} routes)`);
  }

  assert(issues.length === 0, `route formatting browser issues:\n${issues.join('\n')}`);
}

function getSuiteCatalog(browser, baseUrl) {
  return [
    { name: 'first-visit-tour', description: 'Deep-link onboarding, first root visit, and tour prompt behavior', run: () => smokeFirstVisitTour(browser, baseUrl) },
    { name: 'app-shell', description: 'Version metadata, service worker, manifest, icons, robots, sitemap, and shell assets', run: () => smokeAppShell(browser, baseUrl) },
    { name: 'hero-command-bar', description: 'Hero command bar owns the first-screen retrieval path, protocol deep dives, and command routing', run: () => smokeHeroCommandBar(browser, baseUrl) },
    { name: 'tzkt-throttle', description: 'Browser-local TzKT fetch queue keeps visitor requests at six starts per second', run: () => smokeTzktThrottle(browser, baseUrl) },
    { name: 'dashboard-desktop', description: 'Desktop dashboard chrome, menus, widgets utility, calculator, drawer, share picker', run: () => smokeDashboard(browser, baseUrl, { width: 1440, height: 1000 }, 'desktop') },
    { name: 'dashboard-mobile', description: 'Mobile dashboard chrome, menus, widgets utility, calculator, drawer, share picker', run: () => smokeDashboard(browser, baseUrl, { width: 390, height: 844 }, 'mobile') },
    { name: 'my-tezos-baker-activity', description: 'My Tezos connected baker drawer lists recent delegators and stakers', run: () => smokeMyTezosBakerActivity(browser, baseUrl) },
    { name: 'my-tezos-live-signal', description: 'My Tezos open baker drawer refreshes stale operator signal without a manual reload', run: () => smokeMyTezosBakerLiveSignal(browser, baseUrl) },
    { name: 'my-tezos-drawer-live-refresh', description: 'My Tezos opening drawer refreshes stale brief, header, and baker-grid stats together', run: () => smokeMyTezosDrawerLiveRefresh(browser, baseUrl) },
    { name: 'my-tezos-wallet-connect', description: 'My Tezos drawer connects through Octez.Connect and keeps the saved profile after wallet disconnect', run: () => smokeMyTezosWalletConnect(browser, baseUrl) },
    { name: 'octez-connect-sdk-loader', description: 'Octez.Connect SDK imports through the real CSP-safe ESM loader and exposes the dApp client API', run: () => smokeOctezConnectSdkLoader(browser, baseUrl) },
    { name: 'my-tezos-baker-capacity', description: 'My Tezos connected baker drawer shows signed over-delegation capacity', run: () => smokeMyTezosBakerCapacity(browser, baseUrl) },
    { name: 'my-tezos-staker-rewards', description: 'My Tezos connected drawer uses personal staker reward rows for regular and mostly-staked accounts', run: () => smokeMyTezosStakerRewards(browser, baseUrl) },
    { name: 'my-tezos-delegator-rewards', description: 'My Tezos connected drawer uses delegator estimate rows for zero-stake delegated accounts', run: () => smokeMyTezosDelegatorRewards(browser, baseUrl) },
    { name: 'my-tezos-address-switch', description: 'My Tezos connected drawer saves a newly typed address over a stale saved baker', run: () => smokeMyTezosAddressSwitch(browser, baseUrl) },
    { name: 'my-tezos-proposal-attribution', description: 'My Tezos Story distinguishes a delegator from their baker when accepted proposals are shown', run: () => smokeMyTezosProposalAttribution(browser, baseUrl) },
    { name: 'my-tezos-deep-link-override', description: 'My Tezos direct address links override a stale saved baker on first load', run: () => smokeMyTezosDeepLinkOverridesStale(browser, baseUrl) },
    { name: 'tezlink', description: 'Tezos X Chamber opens #tezosx with atomic L2 TVL, protocol mix, and live transaction tape', run: () => smokeTezlinkChamber(browser, baseUrl) },
    { name: 'network-health', description: 'Network Health card opens #health chamber with block cadence, missed rights, and saved My Tezos baker summary', run: () => smokeNetworkHealthChamber(browser, baseUrl) },
    { name: 'ctez', description: 'ctez End of Life opens #ctez with opt-in oven discovery and wallet-reviewed operations', run: () => smokeCtezChamber(browser, baseUrl) },
    { name: 'governance-lb', description: 'Governance cooldown state, Chamber, Tezos X Governance, LB dashboard tile, LB modal, lore, links, smooth refresh', run: () => smokeGovernanceTestingPeriod(browser, baseUrl) },
    { name: 'hash-modal-cleanup', description: 'Hash-routed modal navigation closes stale history and chamber overlays before opening the next room', run: () => smokeHashModalCleanup(browser, baseUrl) },
    { name: 'ux-regressions', description: 'Clean theme contrast, deep-linked utility sections, share picker contrast, widget utility', run: () => smokeUxChanges(browser, baseUrl) },
    { name: 'feature-workflows', description: 'Leaderboard, calculator modes, price intelligence, comparison, whales, giants, NFT profile, history, share cards', run: () => smokeFeatureWorkflows(browser, baseUrl) },
    { name: 'share-actions', description: 'Share modal copy, post, download, native share, and mobile photo fallback buttons', run: () => smokeShareActions(browser, baseUrl) },
    { name: 'info-modals', description: 'All section info modals and About Tezos launch-date copy', run: () => smokeInfoModals(browser, baseUrl) },
    { name: 'themes', description: 'Theme picker availability and representative light/dark/colorful theme switching', run: () => smokeThemeSelection(browser, baseUrl) },
    { name: 'widget-builder', description: 'Standalone widget builder type picker, preview sizing, and embed code tabs', run: () => smokeWidgetBuilder(browser, baseUrl) },
    { name: 'hen-mode', description: 'HEN overlay startup and exit path', run: () => smokeHenMode(browser, baseUrl) },
    { name: 'route-formatting', description: 'Public pages, widget pages, and 404 screen avoid horizontal overflow and clipped controls on desktop/mobile', run: () => smokeRouteFormatting(browser, baseUrl) },
    { name: 'standalone-links', description: 'Visible first-party links on public and widget routes resolve without local/custom-domain drift', run: () => smokeStandaloneLinks(browser, baseUrl) },
    { name: 'route-crawl', description: 'Dashboard, SEO pages, compare pages, and standalone widget routes render non-empty bodies', run: () => crawlRoutes(browser, baseUrl) }
  ];
}

function selectSuites(catalog) {
  if (!ONLY_SUITES.length) return catalog;
  const available = new Set(catalog.map((suite) => suite.name));
  const missing = ONLY_SUITES.filter((suite) => !available.has(suite));
  if (missing.length) {
    throw new Error(`unknown smoke suite(s): ${missing.join(', ')}\nAvailable suites: ${catalog.map((suite) => suite.name).join(', ')}`);
  }
  return catalog.filter((suite) => ONLY_SUITES.includes(suite.name));
}

async function main() {
  if (cli.help) {
    console.log(usage());
    return;
  }

  if (cli.list) {
    for (const { name, description } of getSuiteCatalog(null, '')) console.log(`${name} - ${description}`);
    return;
  }

  const server = await startLocalServer();
  let browser;
  try {
    const { chromium } = await loadPlaywright();
    browser = await launchChromium(chromium);

    log(`Smoke target: ${server.baseUrl}`);
    const suites = selectSuites(getSuiteCatalog(browser, server.baseUrl));
    log(`Smoke suites: ${suites.map((suite) => suite.name).join(', ')}`);
    for (const suite of suites) {
      await suite.run();
    }
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }
}

main().catch((error) => {
  console.error(`fail - ${error.stack || error.message}`);
  process.exit(1);
});
