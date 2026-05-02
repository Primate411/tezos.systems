#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const BASE_URL = process.env.BASE_URL || '';
const HEADLESS = process.env.SMOKE_HEADED === '1' ? false : true;
const STRICT_EXTERNAL = process.env.STRICT_EXTERNAL === '1';
const BROWSER_EXECUTABLE_PATH = process.env.BROWSER_EXECUTABLE_PATH || '';

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
  /Service Worker registration blocked by Playwright/i
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

async function assertLocatorCount(locator, expected, label) {
  const count = await locator.count();
  assert(count === expected, `${label}: expected ${expected}, saw ${count}`);
}

async function expectClassContains(locator, className, label) {
  const classes = await locator.getAttribute('class');
  assert((classes || '').split(/\s+/).includes(className), `${label}: missing .${className}, class="${classes || ''}"`);
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
  await expectCount(page, '#features-dropdown .feature-copy-link', 8, label);
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
  await expectCount(page, '#section-picker-modal input[type="checkbox"]', 8, label);
  await expectCount(page, '#section-picker-modal .section-picker-note', 1, label);
  await page.locator('#section-picker-modal .share-modal-close').click();
  await page.locator('#section-picker-modal').waitFor({ state: 'detached', timeout: 5000 });

  await context.close();
  assert(issues.length === 0, `${label}: browser issues:\n${issues.join('\n')}`);
  log(`ok - dashboard smoke (${label})`);
}

async function smokeFirstVisitTour(browser, baseUrl) {
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  await context.addInitScript(() => {
    localStorage.removeItem('tezos-toured');
    localStorage.removeItem('tezos-welcomed');
    localStorage.setItem('tezos-systems-theme', 'matrix');
  });
  const page = await context.newPage();
  attachIssueCollectors(page, 'first visit tour', issues);

  const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
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

async function main() {
  const server = await startLocalServer();
  let browser;
  try {
    const { chromium } = await loadPlaywright();
    browser = await launchChromium(chromium);

    log(`Smoke target: ${server.baseUrl}`);
    await smokeFirstVisitTour(browser, server.baseUrl);
    await smokeDashboard(browser, server.baseUrl, { width: 1440, height: 1000 }, 'desktop');
    await smokeDashboard(browser, server.baseUrl, { width: 390, height: 844 }, 'mobile');
    await smokeUxChanges(browser, server.baseUrl);
    await crawlRoutes(browser, server.baseUrl);
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }
}

main().catch((error) => {
  console.error(`fail - ${error.message}`);
  process.exit(1);
});
