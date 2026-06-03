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
  /Failed to fetch/i,
  /CORS policy/i,
  /No 'Access-Control-Allow-Origin'/i,
  /Failed to load resource: net::ERR_FAILED/i,
  /HTTP 429/i,
  /HTTP 503/i,
  /api\.coingecko\.com/i,
  /api\.tzkt\.io/i,
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
  }
];

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

async function installFeatureMocks(context) {
  let lbBlocksHead = 12345678;
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
      if (url.includes('/blocks?')) {
        const now = Date.now();
        const head = lbBlocksHead++;
        return fulfillJson(route, [
          { level: head, timestamp: new Date(now).toISOString(), producer: { address: SAMPLE_ADDRESS, alias: 'QA Baker' }, lbToggle: false, lbToggleEma: 1030000000 },
          { level: head - 1, timestamp: new Date(now - 6000).toISOString(), producer: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' }, lbToggle: true, lbToggleEma: 1029500000 },
          { level: head - 2, timestamp: new Date(now - 12000).toISOString(), producer: { address: 'tz1PassPassPassPassPassPassPassPassP', alias: 'Pass Baker' }, lbToggle: null, lbToggleEma: 1029000000 },
          { level: head - 3, timestamp: new Date(now - 18000).toISOString(), producer: { address: 'tz1OffOffOffOffOffOffOffOffOffOf', alias: 'Off Baker' }, lbToggle: false, lbToggleEma: 1028500000 }
        ]);
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
      if (url.includes('/operations/update_consensus_key')) {
        return fulfillJson(route, [{ sender: { address: SAMPLE_ADDRESS }, publicKeyHash: 'tz4QaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQaQa' }]);
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
      if (url.includes('/operations/delegations?')) return fulfillJson(route, []);
      if (url.includes('/operations/staking?')) return fulfillJson(route, []);
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
          { timestamp: new Date(Date.now() - 11 * 3600000).toISOString(), votingPower: 5000 },
          { timestamp: new Date(Date.now() - 9 * 3600000).toISOString(), votingPower: 2500 }
        ]);
      }
      if (url.includes('/voting/periods/173/voters')) {
        return fulfillJson(route, [
          { status: 'voted_yay', votingPower: 6000, delegate: { address: SAMPLE_ADDRESS, alias: 'QA Baker' } },
          { status: 'voted_pass', votingPower: 1500, delegate: { address: SAMPLE_ADDRESS_2, alias: 'Second Baker' } }
        ]);
      }
      if (url.includes('/voting/periods/current/voters')) return fulfillJson(route, []);
      if (url.includes('/voting/periods/current')) {
        const start = new Date(Date.now() - 3600000).toISOString();
        const end = new Date(Date.now() + 86400000).toISOString();
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
    if (STRICT_EXTERNAL || !isAllowedWarning(text)) {
      issues.push(`${label} console ${message.type()}: ${text}`);
    }
  });

  page.on('pageerror', (error) => {
    issues.push(`${label} pageerror: ${error.message}`);
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    const failureText = request.failure()?.errorText || 'failed';
    if (failureText === 'net::ERR_ABORTED' && !STRICT_EXTERNAL) return;
    if (/api\.tzkt\.io|api\.coingecko\.com|gc\.zgo\.at|goatcounter|fonts\.googleapis|fonts\.gstatic/.test(url) && !STRICT_EXTERNAL) {
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
  assert(!(await page.locator('#widgets-gallery').isVisible()), `${label}: Embed Builder utility should be hidden by default`);
  await expectCount(page, '#widgets-gallery .widget-utility-panel', 1, label);
  await expectCount(page, '#widgets-gallery a[href="/widgets/builder.html"]', 1, label);
  assert(await page.locator('#widgets-gallery .widget-preview-card').count() === 0, `${label}: raw widget preview cards should be demoted out of dashboard`);
  assert(await page.locator('#widgets-gallery a[href^="/widgets/"]:not([href="/widgets/builder.html"])').count() === 0, `${label}: dashboard widget utility should not link to raw widget endpoints`);
  await expectCount(page, '.section-copy-link', 6, label);

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
  await expectCount(page, '#features-dropdown .feature-copy-link', 9, label);
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
  await expectCount(page, '#section-picker-modal input[type="checkbox"]', 6, label);
  await expectCount(page, '#section-picker-modal .section-picker-note', 1, label);
  const pickerLabels = await page.locator('#section-picker-modal .section-picker-label').allTextContents();
  assert(!pickerLabels.includes('⛓️'), `${label}: share picker should not show emoji-only section names`);
  assert(!pickerLabels.includes('🧩 Embed Builder'), `${label}: share picker should not include hidden utility sections`);
  await page.locator('#section-picker-modal .share-modal-close').click();
  await page.locator('#section-picker-modal').waitFor({ state: 'detached', timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `${label}: browser issues:\n${issues.join('\n')}`);
  log(`ok - dashboard smoke (${label})`);
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
  await expectCount(page, '#chamber-entry-card .card-copy-link[data-copy-hash="#chamber"]', 1, 'governance testing period chamber card link');
  await expectCount(page, '#lb-entry-card .card-copy-link[data-copy-hash="#lb-tile"]', 1, 'governance testing period LB tile link');

  const dashboardState = await page.evaluate(() => ({
    banner: document.querySelector('#gov-countdown-banner')?.innerText || '',
    bannerClasses: document.querySelector('#gov-countdown-banner')?.className || '',
    bannerInVotePanel: Boolean(document.querySelector('#gov-countdown-banner')?.closest('.voting-live-summary')),
    bannerAfterPriceBar: document.querySelector('#price-bar')?.nextElementSibling?.id === 'gov-countdown-banner',
    votingPeriod: document.querySelector('#voting-period-front')?.textContent?.trim() || '',
    participation: document.querySelector('#participation-front')?.textContent?.trim() || '',
    participationDescription: document.querySelector('#participation-description')?.textContent?.trim() || '',
    entryMini: document.querySelector('#chamber-entry-mini')?.textContent?.trim() || '',
    issuance: document.querySelector('#issuance-rate-front')?.textContent?.trim() || '',
    issuanceBreakdown: document.querySelector('#issuance-breakdown')?.textContent?.trim() || '',
    lbEntryEma: document.querySelector('#lb-entry-ema')?.textContent?.trim() || '',
    lbEntryDescription: document.querySelector('#lb-entry-description')?.textContent?.trim() || '',
    lbEntryLive: document.querySelector('#lb-entry-card')?.dataset.lbLive || '',
    lbEntryRefreshInterval: document.querySelector('#lb-entry-card')?.dataset.lbRefreshInterval || '',
    lbEntryRefreshedAt: document.querySelector('#lb-entry-card')?.dataset.lbRefreshedAt || '',
    intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
  }));
  assert(/TESTING/.test(dashboardState.banner), `governance testing period: banner should say TESTING, saw ${dashboardState.banner}`);
  assert(/No ballots open/.test(dashboardState.banner), `governance testing period: banner should say no ballots are open, saw ${dashboardState.banner}`);
  assert(!dashboardState.bannerClasses.includes('gov-vote-spotlight'), 'governance testing period: cooldown banner should not use live vote spotlight styling');
  assert(dashboardState.bannerInVotePanel, 'governance testing period: Chamber prompt should live inside the vote panel');
  assert(!dashboardState.bannerAfterPriceBar, 'governance testing period: Chamber prompt should not render as a top-page banner');
  assert(dashboardState.votingPeriod === 'Cooldown', `governance testing period: voting card should show Cooldown, saw ${dashboardState.votingPeriod}`);
  assert(dashboardState.participation === '---', `governance testing period: participation should be empty-state dashes, saw ${dashboardState.participation}`);
  assert(/No ballots during Cooldown/.test(dashboardState.participationDescription), `governance testing period: participation description mismatch: ${dashboardState.participationDescription}`);
  assert(/Cooldown/.test(dashboardState.entryMini) && /testing and review/.test(dashboardState.entryMini), `governance testing period: Chamber entry status mismatch: ${dashboardState.entryMini}`);
  assert(dashboardState.issuance === '4.50%', `governance testing period: disabled LB should be excluded from total issuance, saw ${dashboardState.issuance}`);
  assert(/4\.50% Protocol/.test(dashboardState.issuanceBreakdown), `governance testing period: protocol issuance breakdown mismatch: ${dashboardState.issuanceBreakdown}`);
  assert(/0\.00% LB \(disabled\)/.test(dashboardState.issuanceBreakdown), `governance testing period: disabled LB breakdown missing, saw ${dashboardState.issuanceBreakdown}`);
  assert(dashboardState.lbEntryEma === '51.5%', `governance testing period: LB entry EMA mismatch: ${dashboardState.lbEntryEma}`);
  assert(/Subsidy disabled/.test(dashboardState.lbEntryDescription), `governance testing period: LB entry description mismatch: ${dashboardState.lbEntryDescription}`);
  assert(dashboardState.lbEntryLive === 'true', `governance testing period: LB entry should have live refresh enabled, saw ${dashboardState.lbEntryLive}`);
  assert(dashboardState.lbEntryRefreshInterval === '60000', `governance testing period: LB entry refresh interval mismatch: ${dashboardState.lbEntryRefreshInterval}`);
  assert(Number(dashboardState.lbEntryRefreshedAt) > 0, `governance testing period: LB entry refreshed timestamp missing: ${dashboardState.lbEntryRefreshedAt}`);
  assert(dashboardState.intervalDelays.includes(60000), `governance testing period: LB entry 60s refresh timer was not registered: ${dashboardState.intervalDelays.join(', ')}`);

  await page.locator('#gov-countdown-banner').click();
  await page.locator('.chamber-overlay.active .chamber-content').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.chamber-badge').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.gauge-context-label').waitFor({ state: 'visible', timeout: 10000 });
  const chamberState = await page.evaluate(() => ({
    badge: document.querySelector('.chamber-badge')?.textContent?.trim() || '',
    badgeClasses: document.querySelector('.chamber-badge')?.className || '',
    gaugeLabel: document.querySelector('.gauge-context-label')?.textContent?.trim() || '',
    gaugeMeta: document.querySelector('.gauge-context-meta')?.textContent?.trim() || '',
    thresholdNote: document.querySelector('.gauge-threshold-note')?.textContent?.trim() || '',
    svgTextCount: document.querySelectorAll('.gauge-svg text').length,
    footer: document.querySelector('.chamber-footer')?.textContent || ''
  }));
  assert(chamberState.badge === 'Cooldown', `governance testing period: Chamber badge should be Cooldown, saw ${chamberState.badge}`);
  assert(chamberState.badgeClasses.includes('cooldown') && !chamberState.badgeClasses.includes('live'), `governance testing period: Chamber badge class mismatch: ${chamberState.badgeClasses}`);
  assert(chamberState.gaugeLabel === 'Exploration result', `governance testing period: gauge should be a completed result, saw ${chamberState.gaugeLabel}`);
  assert(/No ballots are open during Cooldown/.test(chamberState.gaugeMeta), `governance testing period: gauge meta mismatch: ${chamberState.gaugeMeta}`);
  assert(/80% threshold/.test(chamberState.thresholdNote), `governance testing period: missing threshold note, saw ${chamberState.thresholdNote}`);
  assert(chamberState.svgTextCount === 0, 'governance testing period: threshold label should not be drawn over the gauge arc');
  assert(/Current Cooldown period; showing latest Exploration result/.test(chamberState.footer), `governance testing period: footer mismatch: ${chamberState.footer}`);

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
  const lbState = await page.evaluate(() => ({
    title: document.querySelector('#liquidity-baking-modal .chamber-title')?.textContent || '',
    ema: document.querySelector('.lb-ema-value')?.textContent || '',
    status: document.querySelector('.lb-status-banner')?.textContent || '',
    live: document.querySelector('#liquidity-baking-modal')?.dataset.lbLive || '',
    refreshState: document.querySelector('#lb-refresh-state')?.textContent || '',
    recentRows: document.querySelectorAll('.lb-recent-table .lb-table-row').length,
    bakerRows: document.querySelectorAll('#lb-baker-vote-list .lb-table-row').length,
    filters: document.querySelectorAll('.lb-filter-btn').length,
    recentSystemLinks: document.querySelectorAll('.lb-recent-table .lb-baker-name-link[href^="#baker="]').length,
    recentTzktLinks: document.querySelectorAll('.lb-recent-table .lb-baker-source-link[href^="https://tzkt.io/"]').length,
    bakerSystemLinks: document.querySelectorAll('#lb-baker-vote-list .lb-baker-name-link[href^="#baker="]').length,
    bakerTzktLinks: document.querySelectorAll('#lb-baker-vote-list .lb-baker-source-link[href^="https://tzkt.io/"]').length,
    firstSystemHref: document.querySelector('.lb-recent-table .lb-baker-name-link')?.getAttribute('href') || '',
    firstTzktHref: document.querySelector('.lb-recent-table .lb-baker-source-link')?.getAttribute('href') || '',
    systemBrand: document.querySelector('.lb-system-brand')?.textContent?.trim() || '',
    emaMeta: document.querySelector('#lb-ema-meta')?.textContent?.trim() || '',
    explainer: document.querySelector('.lb-explainer')?.textContent?.trim() || '',
    helpCount: document.querySelectorAll('#liquidity-baking-modal .lb-help').length,
    loreExpanded: document.querySelector('#lb-lore-toggle')?.getAttribute('aria-expanded') || '',
    loreHidden: document.querySelector('#lb-lore-body-wrap')?.hidden ?? null,
    loreCollapsed: document.querySelector('.lb-lore-panel')?.dataset.lbLoreCollapsed || '',
    lore: document.querySelector('#lb-lore-body')?.textContent?.trim() || '',
    loreItems: document.querySelectorAll('#lb-lore-body .lb-lore-item').length,
    readMoreLinks: document.querySelectorAll('#liquidity-baking-modal a[href*="liquidity_baking"], #liquidity-baking-modal a[href*="liquidity-baking"]').length,
    intervalDelays: (window.__tezosSystemsIntervals || []).map((item) => item.timeout ?? item)
  }));
  assert(/Liquidity Baking Monitor/.test(lbState.title), `governance testing period: LB modal title mismatch: ${lbState.title}`);
  assert(lbState.ema === '51.5%', `governance testing period: LB EMA should show mocked value, saw ${lbState.ema}`);
  assert(/SUBSIDY DISABLED/.test(lbState.status), `governance testing period: LB status mismatch: ${lbState.status}`);
  assert(lbState.live === 'true', `governance testing period: LB live refresh should be active, saw ${lbState.live}`);
  assert(/auto-refresh 8s/.test(lbState.refreshState), `governance testing period: LB refresh label mismatch: ${lbState.refreshState}`);
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
    expanded: document.querySelector('#lb-lore-toggle')?.getAttribute('aria-expanded') || '',
    hidden: document.querySelector('#lb-lore-body-wrap')?.hidden ?? null,
    collapsed: document.querySelector('.lb-lore-panel')?.dataset.lbLoreCollapsed || '',
    items: document.querySelectorAll('#lb-lore-body .lb-lore-item').length
  }));
  assert(lbLoreExpandedState.expanded === 'true', `governance testing period: LB lore did not expand, saw aria-expanded=${lbLoreExpandedState.expanded}`);
  assert(lbLoreExpandedState.hidden === false, 'governance testing period: LB lore body stayed hidden after expand');
  assert(lbLoreExpandedState.collapsed === 'false', `governance testing period: LB lore expanded flag mismatch: ${lbLoreExpandedState.collapsed}`);
  assert(lbLoreExpandedState.items >= 3, `governance testing period: LB expanded lore items missing, saw ${lbLoreExpandedState.items}`);
  assert(lbState.readMoreLinks >= 2, `governance testing period: LB read-more links missing, saw ${lbState.readMoreLinks}`);
  assert(lbState.intervalDelays.includes(8000), `governance testing period: LB modal 8s refresh timer was not registered: ${lbState.intervalDelays.join(', ')}`);

  const smoothRefreshStart = await page.evaluate(() => {
    window.__lbBodyNode = document.querySelector('#liquidity-baking-modal .lb-body');
    window.__lbHeaderNode = document.querySelector('#liquidity-baking-modal .lb-header');
    const timer = (window.__tezosSystemsIntervals || []).find((item) => item.timeout === 8000);
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

  await context.close();
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
  await page.waitForFunction(() => document.querySelector('#staking-ratio-front')?.textContent?.trim() === '29.05%', null, { timeout: 10000 });
  await page.waitForFunction(() => /pp$/.test(document.querySelector('#staking-trend')?.textContent?.trim() || ''), null, { timeout: 10000 });
  log('ok - staking ratio uses finalized/frozen stake and pp trend');

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
    { name: 'governance-lb', description: 'Governance cooldown state, Chamber, LB dashboard tile, LB modal, lore, links, smooth refresh', run: () => smokeGovernanceTestingPeriod(browser, baseUrl) },
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
    ['governance-lb', 'Governance cooldown state, Chamber, LB dashboard tile, LB modal, lore, links, smooth refresh'],
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
