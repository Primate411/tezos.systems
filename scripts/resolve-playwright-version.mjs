#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs';

const outputPath = process.env.GITHUB_OUTPUT;
if (!outputPath) {
  throw new Error('GITHUB_OUTPUT is required to publish the Playwright cache-key version');
}

const packageUrl = new URL('../node_modules/playwright/package.json', import.meta.url);
const playwrightPackage = JSON.parse(readFileSync(packageUrl, 'utf8'));
const version = String(playwrightPackage.version || '').trim();

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid installed Playwright version: ${version || '(empty)'}`);
}

appendFileSync(outputPath, `version=${version}\n`, 'utf8');
console.log(`Resolved Playwright ${version} for the browser cache key`);
