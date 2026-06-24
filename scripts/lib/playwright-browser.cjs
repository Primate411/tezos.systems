'use strict';

const fs = require('node:fs/promises');

const SYSTEM_BROWSER_CANDIDATES = Object.freeze([
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium'
]);

const MISSING_BROWSER_PATTERN = /Executable doesn't exist|playwright install/i;

async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function resolveChromiumExecutablePath({ executablePath = '' } = {}) {
  const explicit = executablePath || process.env.BROWSER_EXECUTABLE_PATH || '';
  if (explicit) {
    if (!(await pathExists(explicit))) {
      throw new Error(`BROWSER_EXECUTABLE_PATH does not exist: ${explicit}`);
    }
    return explicit;
  }

  for (const candidate of SYSTEM_BROWSER_CANDIDATES) {
    if (await pathExists(candidate)) return candidate;
  }

  return '';
}

function isMissingPlaywrightBrowserError(error) {
  return MISSING_BROWSER_PATTERN.test(error?.message || '');
}

async function launchChromium(chromium, {
  headless = true,
  executablePath = '',
  launchOptions = {},
  logger = console.log
} = {}) {
  if (!chromium || typeof chromium.launch !== 'function') {
    throw new Error('launchChromium requires Playwright chromium');
  }

  const log = typeof logger === 'function' ? logger : null;
  const baseOptions = { ...launchOptions, headless };

  if (executablePath) {
    const resolved = await resolveChromiumExecutablePath({ executablePath });
    if (log) log(`Using configured browser: ${resolved}`);
    return chromium.launch({ ...baseOptions, executablePath: resolved });
  }

  try {
    return await chromium.launch(baseOptions);
  } catch (error) {
    if (!isMissingPlaywrightBrowserError(error)) throw error;
    const resolved = await resolveChromiumExecutablePath({ executablePath: '' });
    if (!resolved) {
      throw new Error('Playwright browser binary is missing. Run npx playwright install chromium, or install Chrome/Chromium and optionally set BROWSER_EXECUTABLE_PATH.');
    }
    if (log) log(`Using system browser: ${resolved}`);
    return chromium.launch({ ...baseOptions, executablePath: resolved });
  }
}

module.exports = {
  SYSTEM_BROWSER_CANDIDATES,
  isMissingPlaywrightBrowserError,
  launchChromium,
  pathExists,
  resolveChromiumExecutablePath
};
