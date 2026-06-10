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
  /api\.llama\.fi/i,
  /explorer\.etherlink\.com/i,
  /node\.mainnet\.etherlink\.com/i,
  /api\.github\.com/i,
  /SW registration failed/i,
  /Service Worker registration blocked by Playwright/i,
  /Using local protocol fallback/i
];

const browserRoutes = [
  '/',
  '/landing.html',
  '/staking/',
  '/governance/',
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

const SAMPLE_ADDRESS = 'tz1aWXP237BLwNHJcCD4b3DutCevhqq2T1Z9';
const SAMPLE_ADDRESS_2 = 'tz1hThMBD8jQjFt78heuCnKxJnJtQo9Ao25X';
const SAMPLE_ADDRESS_3 = 'tz1PendingBaker1111111111111111111111';
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
    software: 'Octez'
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
    software: 'Octez'
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
    software: 'Octez'
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
  software: 'Octez'
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
      current_issuance_rate: 3.4 + step / 100,
      total_supply: 1050000000 + step * 1000,
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

async function installFeatureMocks(context, options = {}) {
  let lbBlocksHead = 12345678;
  const blockHeadLagMs = Number(options.blockHeadLagMs) || 0;
  const etherlinkQuiet = Boolean(options.etherlinkQuiet);
  const etherlinkNullProposal = Boolean(options.etherlinkNullProposal);
  const governanceNoProposal = Boolean(options.governanceNoProposal);
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const postData = request.postData() || '';

    if (url.includes('html2canvas@1.4.1')) {
      return fulfillText(route, `
        window.html2canvas = async function() {
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

    if (url.includes('api.tezos.domains/graphql')) {
      return fulfillJson(route, {
        data: {
          domain: { address: SAMPLE_ADDRESS },
          reverseRecord: { domain: { name: 'qa-baker.tez' } }
        }
      });
    }

    if (url.includes('data.objkt.com/v3/graphql')) {
      if (postData.includes('holder(')) {
        return fulfillJson(route, {
          data: {
            holder: [{
              address: SAMPLE_ADDRESS,
              alias: 'QA Artist',
              tzdomain: 'qa-artist.tez',
              held_tokens: [{
                quantity: 2,
                token: {
                  name: 'Smoke Piece',
                  pk: 1,
                  supply: 10,
                  fa: { name: 'Smoke Collection', contract: 'KT1SmokeSmokeSmokeSmokeSmokeSmoke12345' },
                  lowest_ask: 1000000
                }
              }],
              created_tokens: [{
                token_pk: 1,
                token: {
                  name: 'Smoke Piece',
                  supply: 10,
                  pk: 1,
                  fa: { name: 'Smoke Collection', contract: 'KT1SmokeSmokeSmokeSmokeSmokeSmoke12345' },
                  lowest_ask: 1000000,
                  listing_sales: [{ price_xtz: 2500000, timestamp: new Date().toISOString() }]
                }
              }],
              fa2s_created: [{
                name: 'Smoke Collection',
                contract: 'KT1SmokeSmokeSmokeSmokeSmokeSmoke12345',
                items: 10,
                volume_total: 2500000,
                floor_price: 1000000,
                owners: 3
              }],
              listings_sold: [{ price_xtz: 2500000, timestamp: new Date().toISOString() }],
              listings_bought: [{ price_xtz: 1000000, timestamp: new Date().toISOString() }],
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

    if (url.includes('api.llama.fi/protocols')) {
      return fulfillJson(route, [
        { name: 'Curve DEX', slug: 'curve-dex', category: 'Dexs', chainTvls: { Etherlink: 10014648.09 } },
        { name: 'Spiko', slug: 'spiko', category: 'RWA', chainTvls: { Etherlink: 9090824.44 } },
        { name: 'Morpho Blue', slug: 'morpho-blue', category: 'Lending', chainTvls: { Etherlink: 3559007.6 } },
        { name: 'Youves', slug: 'youves', category: 'CDP', chainTvls: { Tezos: 12000000 } }
      ]);
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
          return fulfillJson(route, [
            { level: 12345858, cycle: 1143, round: 0, status: 'future', type: 'baking', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } }
          ]);
        }
        if (type === 'baking') {
          return fulfillJson(route, [
            { level: 12345540, cycle: 1143, round: 0, status: 'realized', type: 'baking', baker: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } }
          ]);
        }
        return fulfillJson(route, Array.from({ length: 10 }, (_, index) => ({
          level: 12345670 - index,
          slots: 1,
          status: 'realized',
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
        return fulfillJson(route, {
          address: SAMPLE_ADDRESS,
          type: 'delegate',
          alias: 'QA Baker',
          active: true,
          balance: 1500000000000,
          stakedBalance: 700000000000,
          delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker', active: true },
          firstActivity: 458753,
          firstActivityTime: '2019-05-30T00:00:00Z'
        });
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
      if (url.includes('/voting/periods/current/voters')) return fulfillJson(route, []);
      if (url.includes('/voting/periods/current')) {
        const start = new Date(Date.now() - 3600000).toISOString();
        const end = new Date(Date.now() + 86400000).toISOString();
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
            { index: 174, kind: 'testing', status: 'active', startTime: new Date(Date.now() - 3600000).toISOString(), endTime: new Date(Date.now() + 86400000).toISOString(), totalVotingPower: 12000 }
          ]
        });
      }
      if (url.includes(`/delegates/${OVERDELEGATED_ADDRESS}`)) return fulfillJson(route, overdelegatedBaker);
      if (url.includes('/delegates/')) return fulfillJson(route, sampleBakers[0]);
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
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
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

async function smokeAppShell(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'allow'
  });
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

    return {
      appPreload,
      appPreloadVersion,
      appScript,
      appScriptVersion,
      assetResults,
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
  assert(swReady.ready, `app shell: service worker did not become ready (${JSON.stringify(swReady)})`);

  const failedAssets = shell.assetResults.filter((asset) => !asset.ok);
  assert(failedAssets.length === 0, `app shell: service worker shell assets failed: ${failedAssets.map((asset) => `${asset.asset} ${asset.status}`).join(', ')}`);
  assert(shell.assetResults.length >= 40, `app shell: expected broad shell asset coverage, saw ${shell.assetResults.length}`);

  await context.close();
  assert(issues.length === 0, `app shell browser issues:\n${issues.join('\n')}`);
  log(`ok - app shell smoke (${shell.assetResults.length} shell assets)`);
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
  await expectCount(page, '.stat-card', 20, label);
  await expectCount(page, '.card-share-btn, #share-btn, #upgrade-share-btn, #comparison-share-all-btn', 5, label);
  await expectCount(page, '#build-version', 1, label);
  await expectCount(page, '#widgets-gallery', 1, label);
  await expectCount(page, '#chambers-section', 1, label);
  assert(await page.locator('#chambers-section').isVisible(), `${label}: Chambers should be visible by default`);
  await page.waitForFunction(() => document.querySelectorAll('#chambers-section .chamber-entry-card').length >= 5, null, { timeout: 10000 });
  await expectCount(page, '#chambers-section #tezlink-entry-card.chamber-entry-wide .card-copy-link[data-copy-hash="#tezlink"]', 1, `${label} Tezlink chamber card`);
  const chamberOrder = await page.evaluate(() => Array.from(document.querySelectorAll('#chambers-grid > .chamber-entry-card, #chambers-grid > .stat-card')).map((el) => el.id || el.dataset.stat || ''));
  assert(chamberOrder.indexOf('tezlink-entry-card') > chamberOrder.indexOf('chamber-entry-card'), `${label}: Tezlink should follow The Chamber: ${chamberOrder.join(', ')}`);
  assert(chamberOrder.indexOf('tezlink-entry-card') < chamberOrder.indexOf('lb-entry-card'), `${label}: Tezlink should come before LB: ${chamberOrder.join(', ')}`);
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
  await expectCount(page, '#features-dropdown .feature-copy-link', 10, label);
  await expectCount(page, '#features-dropdown #chambers-toggle', 1, label);
  await expectCount(page, '#features-dropdown .feature-copy-link[data-copy-hash="#chambers"]', 1, label);
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
    return text.includes('next block') && text.includes('working') && text.includes('last 10 attestations ok');
  }, null, { timeout: 15000 });
  const operatorText = (await page.locator('#drawer-operator-status').innerText()).toLowerCase();
  assert(operatorText.includes('next block'), 'my tezos baker activity: should show the next block prominently');
  assert(operatorText.includes('18m'), `my tezos baker activity: should estimate next block ETA, saw: ${operatorText}`);
  assert(operatorText.includes('working'), 'my tezos baker activity: should show current baker working state');
  assert(operatorText.includes('attestation') && operatorText.includes('100.0%'), 'my tezos baker activity: should show prominent attestation rate');
  assert(operatorText.includes('dal') && operatorText.includes('14/14 dal slots'), 'my tezos baker activity: should show prominent DAL participation');

  await context.close();
  assert(issues.length === 0, `my tezos baker activity browser issues:\n${issues.join('\n')}`);
  log('ok - my tezos baker activity smoke');
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
      fillWidth: card?.querySelector('.capacity-bar-fill')?.style.width || ''
    };
  });

  assert(capacityState.pct === '107.7%', `my tezos baker capacity: over-delegation pct was clamped or wrong: ${capacityState.pct}`);
  assert(capacityState.details.includes('630K ꜩ used'), `my tezos baker capacity: used capacity mismatch: ${capacityState.details}`);
  assert(capacityState.details.includes('-45,000 ꜩ free'), `my tezos baker capacity: free capacity should be signed: ${capacityState.details}`);
  assert(capacityState.isOver, 'my tezos baker capacity: over-capacity state class missing');
  assert(capacityState.fillWidth === '100%', `my tezos baker capacity: visual fill should cap at 100%, saw ${capacityState.fillWidth}`);

  await context.close();
  assert(issues.length === 0, `my tezos baker capacity browser issues:\n${issues.join('\n')}`);
  log('ok - my tezos baker capacity smoke');
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

  const healthState = await page.evaluate(() => {
    const modal = document.querySelector('#network-health-modal');
    const card = document.querySelector('[data-stat="network-health"]');
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
      myBaker: modal?.querySelector('.health-my-baker-panel')?.textContent || '',
      myBakerStatus: modal?.querySelector('.health-my-baker-status')?.textContent || '',
      myBakerMetrics: Array.from(modal?.querySelectorAll('.health-my-baker-metrics strong') || []).map((el) => el.textContent || ''),
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
      cardTape: card?.querySelector('#network-health-live-tape')?.textContent || '',
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
  assert(/Second Baker/.test(healthState.myBaker), `network health chamber: My Tezos baker panel missing baker identity: ${healthState.myBaker}`);
  assert(/Missed block/.test(healthState.myBakerStatus), `network health chamber: My Tezos baker status mismatch: ${healthState.myBakerStatus}`);
  assert(healthState.myBakerMetrics[0] === '7', `network health chamber: My Tezos attestation misses mismatch: ${healthState.myBakerMetrics.join(', ')}`);
  assert(healthState.myBakerMetrics[1] === '1', `network health chamber: My Tezos block misses mismatch: ${healthState.myBakerMetrics.join(', ')}`);
  assert(!/Not in sample/.test(healthState.myBakerMetrics[2] || ''), `network health chamber: My Tezos latest block missing: ${healthState.myBakerMetrics.join(', ')}`);
  assert(healthState.systemLinks >= healthState.attesterRows, `network health chamber: baker profile links missing, saw ${healthState.systemLinks}`);
  assert(healthState.tzktLinks >= healthState.attesterRows, `network health chamber: TzKT links missing, saw ${healthState.tzktLinks}`);
  assert(/Direct: \/#health/.test(healthState.footer), `network health chamber: direct footer missing: ${healthState.footer}`);
  assert(healthState.updatedAgeMs >= 85000, `network health chamber: Updated age should come from stale head block timestamp, saw ${healthState.updatedAge} (${healthState.updatedAgeMs}ms)`);
  assert(!/^(0s ago|just now)$/.test(healthState.updatedAge), `network health chamber: Updated age should not be fetch-time fresh: ${healthState.updatedAge}`);
  assert(healthState.headMeta.includes(healthState.updatedAge), `network health chamber: header head age should match Updated metric: ${healthState.headMeta} vs ${healthState.updatedAge}`);
  assert(healthState.cardWide, 'network health chamber: entry card should be double-width');
  assert(/Live Tape/.test(healthState.cardTape) && /XTZ/.test(healthState.cardTape), `network health chamber: entry live tape missing: ${healthState.cardTape}`);
  assert(healthState.ageLabelCount >= 3, `network health chamber: age labels should be live-tickable, saw ${healthState.ageLabelCount}`);
  assert(healthState.cardWired === '1', `network health chamber: card wiring missing: ${healthState.cardWired}`);
  assert(healthState.cardRole === 'button', `network health chamber: card role mismatch: ${healthState.cardRole}`);
  assert(healthState.cardTabIndex === '0', `network health chamber: card keyboard focus mismatch: ${healthState.cardTabIndex}`);
  assert(healthState.cardCue, 'network health chamber: card expand cue missing');
  assert(healthState.cardCopyHash === '#health', `network health chamber: card direct link mismatch: ${healthState.cardCopyHash}`);
  assert(healthState.intervalDelays.includes(1000), `network health chamber: 1s freshness ticker was not registered: ${healthState.intervalDelays.join(', ')}`);
  assert(healthState.intervalDelays.includes(6000), `network health chamber: 6s refresh timer was not registered: ${healthState.intervalDelays.join(', ')}`);

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
    timer?.handler?.();
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
    tablePadding: getComputedStyle(document.querySelector('.health-block-table .lb-table-row')).paddingTop
  }));
  assert(smoothRefreshState.bodySame, 'network health chamber: smooth refresh replaced the chamber body');
  assert(smoothRefreshState.headerSame, 'network health chamber: smooth refresh replaced the header instead of updating in place');
  assert(smoothRefreshState.scorePanelSame, 'network health chamber: smooth refresh replaced the score panel instead of updating in place');
  assert(smoothRefreshState.mode === 'in-place', `network health chamber: refresh mode mismatch: ${smoothRefreshState.mode}`);
  assert(smoothRefreshState.rowCount === beforeSmoothRefresh.rowCount, `network health chamber: passing block row count shifted after smooth refresh: ${smoothRefreshState.rowCount}`);
  assert(smoothRefreshState.newRows >= 1, 'network health chamber: smooth refresh did not animate newly arriving block rows');
  assert(parseFloat(smoothRefreshState.tablePadding) >= 8, `network health chamber: passing blocks row padding too tight: ${smoothRefreshState.tablePadding}`);

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

  const response = await page.goto(`${baseUrl}/#tezlink`, { waitUntil: 'domcontentloaded' });
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
      cardValue: card?.querySelector('#tezlink-entry-tvl')?.textContent?.trim() || '',
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
      footer: modal?.querySelector('.chamber-footer')?.textContent || '',
      directHref: modal?.querySelector('.panel-direct-link')?.getAttribute('href') || '',
      sourceLinks: modal?.querySelectorAll('a[href*="defillama.com"], a[href*="explorer.etherlink.com"]').length || 0
    };
  });

  assert(tezlinkState.cardWide, 'tezlink chamber: card should be double-width');
  assert(tezlinkState.cardCopyHash === '#tezlink', `tezlink chamber: card copy hash mismatch: ${tezlinkState.cardCopyHash}`);
  assert(/\$18\.1M/.test(tezlinkState.cardValue), `tezlink chamber: card TVL mismatch: ${tezlinkState.cardValue}`);
  assert(/Head|live L2 feed/i.test(tezlinkState.cardMini), `tezlink chamber: card mini mismatch: ${tezlinkState.cardMini}`);
  assert(/credit|swap/.test(tezlinkState.cardTape), `tezlink chamber: card transaction tape missing: ${tezlinkState.cardTape}`);
  assert(/Tezlink Chamber/.test(tezlinkState.title), `tezlink chamber: title mismatch: ${tezlinkState.title}`);
  assert(/Live L2/.test(tezlinkState.badge), `tezlink chamber: badge mismatch: ${tezlinkState.badge}`);
  assert(/\$18\.1M/.test(tezlinkState.proposalInfo), `tezlink chamber: header TVL missing: ${tezlinkState.proposalInfo}`);
  assert(/Atomic L2|atomic L2/i.test(tezlinkState.facts), `tezlink chamber: explainer missing atomic L2 context: ${tezlinkState.facts}`);
  assert(tezlinkState.protocolRows >= 2, `tezlink chamber: protocol rows missing, saw ${tezlinkState.protocolRows}`);
  assert(/Curve DEX/.test(tezlinkState.protocolText), `tezlink chamber: protocol TVL missing Curve DEX: ${tezlinkState.protocolText}`);
  assert(tezlinkState.txRows >= 2, `tezlink chamber: transaction rows missing, saw ${tezlinkState.txRows}`);
  assert(/Bankroll|Smoke DEX/.test(tezlinkState.txText), `tezlink chamber: transaction tape target missing: ${tezlinkState.txText}`);
  assert(/Direct: \/#tezlink/.test(tezlinkState.footer), `tezlink chamber: direct footer missing: ${tezlinkState.footer}`);
  assert(tezlinkState.directHref === '/#tezlink', `tezlink chamber: direct href mismatch: ${tezlinkState.directHref}`);
  assert(tezlinkState.sourceLinks >= 2, `tezlink chamber: source links missing, saw ${tezlinkState.sourceLinks}`);

  await page.locator('#tezlink-modal.active .chamber-close').click();
  await page.waitForFunction(() => !document.querySelector('#tezlink-modal')?.classList.contains('active'), null, { timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `tezlink chamber browser issues:\n${issues.join('\n')}`);
  log('ok - tezlink chamber smoke');
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
  await page.locator('#gov-countdown-banner.gov-phase-cooldown').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const breakdown = document.querySelector('#issuance-breakdown')?.textContent?.trim() || '';
    return /LB/.test(breakdown);
  }, null, { timeout: 10000 });
  await page.locator('#lb-entry-card[data-lb-live="true"][data-lb-refresh-interval="60000"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.stat-card[data-stat="tz4-adoption"].chamber-entry-card .chamber-expand-cue').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#etherlink-governance-entry-card[data-etherlink-governance-live="true"]').waitFor({ state: 'visible', timeout: 10000 });
  await expectCount(page, '#chamber-entry-card .card-copy-link[data-copy-hash="#chamber"]', 1, 'governance testing period chamber card link');
  await expectCount(page, '#tezlink-entry-card.chamber-entry-wide .card-copy-link[data-copy-hash="#tezlink"]', 1, 'governance testing period Tezlink card link');
  await expectCount(page, '#etherlink-governance-entry-card.chamber-entry-wide .card-copy-link[data-copy-hash="#l2chamber"]', 1, 'governance testing period Tezlink Governance card link');
  await expectCount(page, '#chambers-toggle', 1, 'governance testing period chambers launcher button');
  await expectCount(page, '.feature-copy-link[data-copy-hash="#chambers"]', 1, 'governance testing period chambers launcher link');
  await expectCount(page, '#lb-entry-card .card-copy-link[data-copy-hash="#lb-tile"]', 1, 'governance testing period LB tile link');
  await expectCount(page, '#chambers-section [data-stat="tz4-adoption"] .card-copy-link[data-copy-hash="#tz4"]', 1, 'governance testing period tz4 tile link');
  await expectCount(page, '#chambers-section [data-stat="network-health"] .card-copy-link[data-copy-hash="#health"]', 1, 'governance testing period health tile link');
  await expectCount(page, '#chambers-section #lb-entry-card', 1, 'governance testing period LB tile in Chambers');
  await expectCount(page, '#chambers-section #tezlink-entry-card', 1, 'governance testing period Tezlink tile in Chambers');
  await expectCount(page, '#chambers-section #etherlink-governance-entry-card', 1, 'governance testing period Tezlink Governance tile in Chambers');
  await expectCount(page, '#chambers-section [data-stat="tz4-adoption"]', 1, 'governance testing period tz4 tile in Chambers');
  await expectCount(page, '#chambers-section [data-stat="network-health"]', 1, 'governance testing period health tile in Chambers');
  await page.waitForFunction(() => {
    const canvas = document.getElementById('tz4-sparkline');
    const chart = canvas ? window.Chart?.getChart(canvas) : null;
    const values = chart?.data?.datasets?.[0]?.data || [];
    const latest = Number(values.at(-1));
    return Number.isFinite(latest) && Math.abs(latest - (100 / 3)) < 0.01;
  }, null, { timeout: 10000 });

  const dashboardState = await page.evaluate(() => ({
    banner: document.querySelector('#gov-countdown-banner')?.innerText || '',
    bannerClasses: document.querySelector('#gov-countdown-banner')?.className || '',
    bannerInVotePanel: Boolean(document.querySelector('#gov-countdown-banner')?.closest('.voting-live-summary')),
    bannerAfterPriceBar: document.querySelector('#price-bar')?.nextElementSibling?.id === 'gov-countdown-banner',
    votingTime: document.querySelector('.voting-time')?.textContent?.trim() || '',
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
    lbEntryLive: document.querySelector('#lb-entry-card')?.dataset.lbLive || '',
    lbEntryRefreshInterval: document.querySelector('#lb-entry-card')?.dataset.lbRefreshInterval || '',
    lbEntryRefreshedAt: document.querySelector('#lb-entry-card')?.dataset.lbRefreshedAt || '',
    etherlinkEntryValue: document.querySelector('#etherlink-governance-entry-value')?.textContent?.trim() || '',
    etherlinkEntryDescription: document.querySelector('#etherlink-governance-entry-description')?.textContent?.trim() || '',
    etherlinkEntryMini: document.querySelector('#etherlink-governance-entry-mini')?.textContent?.trim() || '',
    etherlinkEntryLive: document.querySelector('#etherlink-governance-entry-card')?.dataset.etherlinkGovernanceLive || '',
    etherlinkEntryWide: document.querySelector('#etherlink-governance-entry-card')?.classList.contains('chamber-entry-wide') || false,
    etherlinkEntrySize: document.querySelector('#etherlink-governance-entry-card')?.dataset.etherlinkGovernanceSize || '',
    etherlinkEntryMetrics: document.querySelector('#etherlink-governance-entry-metrics')?.textContent?.trim() || '',
    tz4TileValue: document.querySelector('#tz4-adoption-front')?.textContent?.trim() || '',
    tz4TileDescription: document.querySelector('#tz4-description')?.textContent?.trim() || '',
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
  assert(/TESTING/.test(dashboardState.banner), `governance testing period: banner should say TESTING, saw ${dashboardState.banner}`);
  assert(/No ballots open/.test(dashboardState.banner), `governance testing period: banner should say no ballots are open, saw ${dashboardState.banner}`);
  assert(!dashboardState.bannerClasses.includes('gov-vote-spotlight'), 'governance testing period: cooldown banner should not use live vote spotlight styling');
  assert(dashboardState.bannerInVotePanel, 'governance testing period: Chamber prompt should live inside the vote panel');
  assert(!dashboardState.bannerAfterPriceBar, 'governance testing period: Chamber prompt should not render as a top-page banner');
  assert(!dashboardState.votingTime || !dashboardState.banner.includes(dashboardState.votingTime), `governance testing period: Chamber prompt should not repeat panel countdown ${dashboardState.votingTime}`);
  assert(dashboardState.votingPeriod === 'Cooldown', `governance testing period: voting card should show Cooldown, saw ${dashboardState.votingPeriod}`);
  assert(dashboardState.participation === '---', `governance testing period: participation should be empty-state dashes, saw ${dashboardState.participation}`);
  assert(/No ballots during Cooldown/.test(dashboardState.participationDescription), `governance testing period: participation description mismatch: ${dashboardState.participationDescription}`);
  assert(/Cooldown/.test(dashboardState.entryMini) && /testing and review/.test(dashboardState.entryMini), `governance testing period: Chamber entry status mismatch: ${dashboardState.entryMini}`);
  assert(!dashboardState.chamberEntryWide, 'governance testing period: The Chamber should be 1x1 when no baker ballots are open');
  assert(dashboardState.chamberEntrySize === 'compact', `governance testing period: The Chamber size flag mismatch: ${dashboardState.chamberEntrySize}`);
  assert(dashboardState.issuance === '4.50%', `governance testing period: disabled LB should be excluded from total issuance, saw ${dashboardState.issuance}`);
  assert(/4\.50% Protocol/.test(dashboardState.issuanceBreakdown), `governance testing period: protocol issuance breakdown mismatch: ${dashboardState.issuanceBreakdown}`);
  assert(/0\.00% LB \(disabled\)/.test(dashboardState.issuanceBreakdown), `governance testing period: disabled LB breakdown missing, saw ${dashboardState.issuanceBreakdown}`);
  assert(dashboardState.lbEntryEma === '51.5%', `governance testing period: LB entry EMA mismatch: ${dashboardState.lbEntryEma}`);
  assert(/Subsidy disabled/.test(dashboardState.lbEntryDescription), `governance testing period: LB entry description mismatch: ${dashboardState.lbEntryDescription}`);
  assert(dashboardState.lbEntryLive === 'true', `governance testing period: LB entry should have live refresh enabled, saw ${dashboardState.lbEntryLive}`);
  assert(dashboardState.lbEntryRefreshInterval === '60000', `governance testing period: LB entry refresh interval mismatch: ${dashboardState.lbEntryRefreshInterval}`);
  assert(Number(dashboardState.lbEntryRefreshedAt) > 0, `governance testing period: LB entry refreshed timestamp missing: ${dashboardState.lbEntryRefreshedAt}`);
  assert(dashboardState.etherlinkEntryLive === 'true', `governance testing period: Tezlink Governance entry should show live data, saw ${dashboardState.etherlinkEntryLive}`);
  assert(dashboardState.etherlinkEntryWide, 'governance testing period: Tezlink Governance should be 2x1 while an Etherlink proposal is active');
  assert(dashboardState.etherlinkEntrySize === 'wide', `governance testing period: Tezlink Governance size flag mismatch: ${dashboardState.etherlinkEntrySize}`);
  assert(dashboardState.etherlinkEntryValue === '14.2%', `governance testing period: Tezlink Governance value mismatch: ${dashboardState.etherlinkEntryValue}`);
  assert(/FAST .*00625d22ab/.test(dashboardState.etherlinkEntryDescription), `governance testing period: Tezlink Governance description mismatch: ${dashboardState.etherlinkEntryDescription}`);
  assert(/FAST: Proposal quorum met/.test(dashboardState.etherlinkEntryMini), `governance testing period: Tezlink Governance status mismatch: ${dashboardState.etherlinkEntryMini}`);
  assert(/FAST14\.2%\/5%/.test(dashboardState.etherlinkEntryMetrics.replace(/\s+/g, '')), `governance testing period: Tezlink Governance FAST metric mismatch: ${dashboardState.etherlinkEntryMetrics}`);
  assert(/SLOWNoactiveproposal/.test(dashboardState.etherlinkEntryMetrics.replace(/\s+/g, '')), `governance testing period: Tezlink Governance SLOW metric mismatch: ${dashboardState.etherlinkEntryMetrics}`);
  assert(dashboardState.tz4TileValue === '33.3 / 50%', `governance testing period: tz4 tile value mismatch: ${dashboardState.tz4TileValue}`);
  assert(/1 \/ 3 bakers active/.test(dashboardState.tz4TileDescription), `governance testing period: tz4 tile description mismatch: ${dashboardState.tz4TileDescription}`);
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
      activeTab: document.querySelector('#etherlink-governance-modal [data-etherlink-track].active')?.dataset.etherlinkTrack || '',
      proposalHash: compactText('#etherlink-governance-modal .etherlink-gov-proposal-hash'),
      threshold: compactText('#etherlink-governance-modal .etherlink-gov-threshold-row'),
      proposalRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-proposal-row').length,
      historyRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-history-row').length,
      historyText: compactText('#etherlink-governance-modal .etherlink-gov-track-panel'),
      voterRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-voter-row').length,
      activityRows: document.querySelectorAll('#etherlink-governance-modal .etherlink-gov-activity-row').length,
      footer: compactText('#etherlink-governance-modal .chamber-footer'),
      officialHref: document.querySelector('#etherlink-governance-modal .chamber-footer a[href*="governance.etherlink.com/governance/fast"]')?.href || '',
      storageHref: document.querySelector('#etherlink-governance-modal .chamber-footer a[href*="tzkt.io/KT19oUV"]')?.href || '',
      live: modal?.classList.contains('active') ? 'true' : '',
      refreshState: compactText('#etherlink-governance-refresh-state'),
      intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
    };
  });
  assert(/Tezlink Governance Chamber/.test(etherlinkState.title), `governance testing period: Tezlink title mismatch: ${etherlinkState.title}`);
  assert(/Proposal quorum met/.test(etherlinkState.badge), `governance testing period: Etherlink badge mismatch: ${etherlinkState.badge}`);
  assert(etherlinkState.tabs === 3, `governance testing period: Etherlink should expose three track tabs, saw ${etherlinkState.tabs}`);
  assert(etherlinkState.activeTab === 'fast', `governance testing period: Etherlink FAST tab should start active, saw ${etherlinkState.activeTab}`);
  assert(etherlinkState.proposalHash === ETHERLINK_FAST_PROPOSAL, `governance testing period: Etherlink proposal hash mismatch: ${etherlinkState.proposalHash}`);
  assert(/93\.2M XTZ upvotes/.test(etherlinkState.threshold) && /14\.2% \/ 5% required/.test(etherlinkState.threshold), `governance testing period: Etherlink threshold mismatch: ${etherlinkState.threshold}`);
  assert(etherlinkState.proposalRows >= 2, `governance testing period: Etherlink proposal rows missing, saw ${etherlinkState.proposalRows}`);
  assert(etherlinkState.historyRows >= 3, `governance testing period: Etherlink FAST history rows missing, saw ${etherlinkState.historyRows}`);
  assert(/Etherlink 6\.1/.test(etherlinkState.historyText), `governance testing period: Etherlink FAST history should include older proposal: ${etherlinkState.historyText.slice(0, 320)}`);
  assert(etherlinkState.voterRows >= 3, `governance testing period: Etherlink upvoter rows missing, saw ${etherlinkState.voterRows}`);
  assert(etherlinkState.activityRows >= 2, `governance testing period: Etherlink activity rows missing, saw ${etherlinkState.activityRows}`);
  assert(/Direct: \/#l2chamber/.test(etherlinkState.footer), `governance testing period: Tezlink direct footer missing: ${etherlinkState.footer}`);
  assert(etherlinkState.officialHref.includes('/governance/fast'), `governance testing period: Etherlink official track link missing: ${etherlinkState.officialHref}`);
  assert(etherlinkState.storageHref.includes(ETHERLINK_FAST_CONTRACT), `governance testing period: Etherlink TzKT storage link missing: ${etherlinkState.storageHref}`);
  assert(/auto-refresh 60s/.test(etherlinkState.refreshState), `governance testing period: Etherlink refresh label mismatch: ${etherlinkState.refreshState}`);
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

  await page.locator('#gov-countdown-banner').click();
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
    currentVoteTitle: document.querySelector('#chamber-current-vote-order .current-vote-title')?.textContent?.trim() || '',
    currentVoteContext: document.querySelector('#chamber-current-vote-order .current-vote-context')?.textContent?.trim() || '',
    currentVoteCount: document.querySelector('#chamber-current-vote-order .current-vote-count')?.textContent?.trim() || '',
    currentVoteRows: document.querySelectorAll('#chamber-current-vote-order .current-vote-row').length,
    currentVoteFirstText: document.querySelector('#chamber-current-vote-order .current-vote-row')?.textContent || '',
    currentVoteChronological: Array.from(document.querySelectorAll('#chamber-current-vote-order .current-vote-row')).every((row, index, rows) => {
      if (index === 0) return true;
      return Number(rows[index - 1].dataset.ballotTime) <= Number(row.dataset.ballotTime);
    }),
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
    firstMovers: document.querySelector('#tz4-adoption-modal .tz4-first-list')?.textContent || '',
    rows: document.querySelectorAll('#tz4-baker-status-list .tz4-table-row').length,
    activeRows: document.querySelectorAll('#tz4-baker-status-list [data-tz4-status="active"]').length,
    pendingRows: document.querySelectorAll('#tz4-baker-status-list [data-tz4-status="pending"]').length,
    notYetRows: document.querySelectorAll('#tz4-baker-status-list [data-tz4-status="not-yet"]').length,
    filters: document.querySelectorAll('#tz4-adoption-modal [data-tz4-filter]').length,
    systemLinks: document.querySelectorAll('#tz4-adoption-modal .lb-baker-name-link[href^="#baker="]').length,
    tzktLinks: document.querySelectorAll('#tz4-adoption-modal .lb-baker-source-link[href^="https://tzkt.io/"]').length,
    footer: document.querySelector('#tz4-adoption-modal .chamber-footer')?.textContent || '',
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
  assert(/QA Baker/.test(tz4State.firstMovers) && /cycle 1,136/.test(tz4State.firstMovers), `governance testing period: tz4 first mover list mismatch: ${tz4State.firstMovers}`);
  assert(tz4State.rows >= 3, `governance testing period: tz4 table rows missing, saw ${tz4State.rows}`);
  assert(tz4State.activeRows >= 1, 'governance testing period: tz4 active row missing');
  assert(tz4State.pendingRows >= 1, 'governance testing period: tz4 pending row missing');
  assert(tz4State.notYetRows >= 1, 'governance testing period: tz4 not-yet row missing');
  assert(tz4State.filters === 4, `governance testing period: tz4 filter count mismatch: ${tz4State.filters}`);
  assert(tz4State.systemLinks >= 3, `governance testing period: tz4 Tezos.Systems baker links missing, saw ${tz4State.systemLinks}`);
  assert(tz4State.tzktLinks >= 3, `governance testing period: tz4 TzKT links missing, saw ${tz4State.tzktLinks}`);
  assert(/Direct: \/#tz4/.test(tz4State.footer), `governance testing period: tz4 direct footer missing: ${tz4State.footer}`);
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
      etherlinkWidth: etherlinkRect?.width || 0
    };
  });
  assert(!quietSizing.chamberWide && quietSizing.chamberSize === 'compact', `quiet governance sizing: The Chamber should be 1x1, saw ${JSON.stringify(quietSizing)}`);
  assert(/No active vote/.test(quietSizing.chamberText), `quiet governance sizing: The Chamber quiet text mismatch: ${quietSizing.chamberText}`);
  assert(!quietSizing.etherlinkWide && quietSizing.etherlinkSize === 'compact', `quiet governance sizing: Tezlink Governance should be 1x1, saw ${JSON.stringify(quietSizing)}`);
  assert(/IDLE/.test(quietSizing.etherlinkText) && /All tracks idle/.test(quietSizing.etherlinkText), `quiet governance sizing: Etherlink idle text mismatch: ${quietSizing.etherlinkText}`);
  assert(quietSizing.etherlinkMetricsHidden, 'quiet governance sizing: Etherlink metrics should collapse when all tracks are quiet');
  assert(Math.abs(quietSizing.chamberWidth - quietSizing.etherlinkWidth) < 8, `quiet governance sizing: compact cards should share 1x1 width, saw ${quietSizing.chamberWidth} vs ${quietSizing.etherlinkWidth}`);
  await quietContext.close();

  assert(issues.length === 0, `governance testing period browser issues:\n${issues.join('\n')}`);
  log('ok - governance testing period smoke');
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
  assert(firstVisitState.theme === null, 'deep link should not save a theme or consume the landing redirect');
  assert(firstVisitState.toured === null, 'deep link should not mark the tour complete');
  assert(firstVisitState.welcomed === null, 'deep link should not mark welcome complete');

  response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `first visit landing redirect: root failed with HTTP ${response?.status()}`);
  await page.waitForURL('**/landing.html', { timeout: 10000 });

  await page.evaluate(() => {
    localStorage.setItem('tezos-systems-theme', 'matrix');
  });
  response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `first visit tour: dashboard failed with HTTP ${response?.status()}`);
  await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#tour-overlay').waitFor({ state: 'detached', timeout: 2000 }).catch(() => {
    throw new Error('first visit tour: tour overlay should not block first paint before Start');
  });
  await page.locator('.tour-nudge').waitFor({ state: 'visible', timeout: 6000 });
  await assertLocatorCount(page.locator('.tour-nudge .tour-start'), 1, 'first visit tour start');
  await page.locator('.tour-nudge .tour-start').click();
  await page.locator('#tour-overlay').waitFor({ state: 'visible', timeout: 6000 });
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
    const uptime = getComputedStyle(document.querySelector('.uptime-metric-value')).color;
    const comparison = getComputedStyle(document.querySelector('.comparison-col-ethereum .comparison-chain-value')).color;
    const shareContent = document.querySelector('.share-modal-content');
    return {
      uptime,
      comparison,
      hasShareContent: Boolean(shareContent)
    };
  });
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
  await assertAllSparklineLatestValues(page, 'feature workflows');
  log('ok - all sparkline card latest values match live stats');
  log('ok - staking ratio and APY use TzKT total staked with pp trend');

  await clickFeatureLauncher(page, '#leaderboard-toggle');
  await page.locator('#leaderboard-section.visible').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#leaderboard-results .leaderboard-table').waitFor({ state: 'visible', timeout: 10000 });
  await expectCount(page, '#leaderboard-results .lb-row', 2, 'feature workflows leaderboard rows');
  await page.locator('#leaderboard-results .lb-th[data-col="name"]').click();
  await expectClassContains(page.locator('#leaderboard-results .lb-th[data-col="name"]'), 'active', 'feature workflows leaderboard sort');
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
  await page.locator('#objkt-clear').click();
  assert((await page.locator('#objkt-results').innerText()).trim() === '', 'feature workflows NFT clear should empty results');
  log('ok - feature workflow: NFT profile');

  await clickFeatureLauncher(page, '#history-btn');
  await page.locator('#history-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 10000 });
  await expectCount(page, '#history-modal .time-range-btn', 4, 'feature workflows history ranges');
  await page.locator('#history-modal .time-range-btn[data-range="24h"]').click();
  await expectClassContains(page.locator('#history-modal .time-range-btn[data-range="24h"]'), 'active', 'feature workflows history range');
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
  log('ok - feature workflow: card history');

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

function getSuiteCatalog(browser, baseUrl) {
  return [
    { name: 'first-visit-tour', description: 'Deep-link onboarding, first root visit, and tour prompt behavior', run: () => smokeFirstVisitTour(browser, baseUrl) },
    { name: 'app-shell', description: 'Version metadata, service worker, manifest, icons, robots, sitemap, and shell assets', run: () => smokeAppShell(browser, baseUrl) },
    { name: 'dashboard-desktop', description: 'Desktop dashboard chrome, menus, widgets utility, calculator, drawer, share picker', run: () => smokeDashboard(browser, baseUrl, { width: 1440, height: 1000 }, 'desktop') },
    { name: 'dashboard-mobile', description: 'Mobile dashboard chrome, menus, widgets utility, calculator, drawer, share picker', run: () => smokeDashboard(browser, baseUrl, { width: 390, height: 844 }, 'mobile') },
    { name: 'my-tezos-baker-activity', description: 'My Tezos connected baker drawer lists recent delegators and stakers', run: () => smokeMyTezosBakerActivity(browser, baseUrl) },
    { name: 'my-tezos-baker-capacity', description: 'My Tezos connected baker drawer shows signed over-delegation capacity', run: () => smokeMyTezosBakerCapacity(browser, baseUrl) },
    { name: 'tezlink', description: 'Tezlink Chamber opens #tezlink with atomic L2 TVL, protocol mix, and live transaction tape', run: () => smokeTezlinkChamber(browser, baseUrl) },
    { name: 'network-health', description: 'Network Health card opens #health chamber with block cadence, missed rights, and saved My Tezos baker summary', run: () => smokeNetworkHealthChamber(browser, baseUrl) },
    { name: 'governance-lb', description: 'Governance cooldown state, Chamber, Tezlink Governance, LB dashboard tile, LB modal, lore, links, smooth refresh', run: () => smokeGovernanceTestingPeriod(browser, baseUrl) },
    { name: 'ux-regressions', description: 'Clean theme contrast, deep-linked utility sections, share picker contrast, widget utility', run: () => smokeUxChanges(browser, baseUrl) },
    { name: 'feature-workflows', description: 'Leaderboard, calculator modes, price intelligence, comparison, whales, giants, NFT profile, history, share cards', run: () => smokeFeatureWorkflows(browser, baseUrl) },
    { name: 'info-modals', description: 'All section info modals and About Tezos launch-date copy', run: () => smokeInfoModals(browser, baseUrl) },
    { name: 'themes', description: 'Theme picker availability and representative light/dark/colorful theme switching', run: () => smokeThemeSelection(browser, baseUrl) },
    { name: 'widget-builder', description: 'Standalone widget builder type picker, preview sizing, and embed code tabs', run: () => smokeWidgetBuilder(browser, baseUrl) },
    { name: 'hen-mode', description: 'HEN overlay startup and exit path', run: () => smokeHenMode(browser, baseUrl) },
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

  const suiteNames = [
    ['first-visit-tour', 'Deep-link onboarding, first root visit, and tour prompt behavior'],
    ['app-shell', 'Version metadata, service worker, manifest, icons, robots, sitemap, and shell assets'],
    ['dashboard-desktop', 'Desktop dashboard chrome, menus, widgets utility, calculator, drawer, share picker'],
    ['dashboard-mobile', 'Mobile dashboard chrome, menus, widgets utility, calculator, drawer, share picker'],
    ['my-tezos-baker-activity', 'My Tezos connected baker drawer lists recent delegators and stakers'],
    ['my-tezos-baker-capacity', 'My Tezos connected baker drawer shows signed over-delegation capacity'],
    ['tezlink', 'Tezlink Chamber opens #tezlink with atomic L2 TVL, protocol mix, and live transaction tape'],
    ['network-health', 'Network Health card opens #health chamber with block cadence, missed rights, and saved My Tezos baker summary'],
    ['governance-lb', 'Governance cooldown state, Chamber, Tezlink Governance, LB dashboard tile, LB modal, lore, links, smooth refresh'],
    ['ux-regressions', 'Clean theme contrast, deep-linked utility sections, share picker contrast, widget utility'],
    ['feature-workflows', 'Leaderboard, calculator modes, price intelligence, comparison, whales, giants, NFT profile, history, share cards'],
    ['info-modals', 'All section info modals and About Tezos launch-date copy'],
    ['themes', 'Theme picker availability and representative light/dark/colorful theme switching'],
    ['widget-builder', 'Standalone widget builder type picker, preview sizing, and embed code tabs'],
    ['hen-mode', 'HEN overlay startup and exit path'],
    ['route-crawl', 'Dashboard, SEO pages, compare pages, and standalone widget routes render non-empty bodies']
  ];
  if (cli.list) {
    for (const [name, description] of suiteNames) console.log(`${name} - ${description}`);
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
  console.error(`fail - ${error.message}`);
  process.exit(1);
});
