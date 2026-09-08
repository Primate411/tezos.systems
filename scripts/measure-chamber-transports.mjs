#!/usr/bin/env node
// Read-only evidence: output is JSON, never written into a source data artifact.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { transportSources } from './generate-chamber-transports.mjs';
import { generatedTransportPath } from '../js/core/generated-transport.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const sources = await transportSources();
const entries = await Promise.all(sources.map(async source => {
    const raw = await fs.readFile(path.join(ROOT, source), 'utf8');
    const compact = await fs.readFile(path.join(ROOT, generatedTransportPath(source).slice(1)), 'utf8');
    return { source, raw, compact, rawBytes: Buffer.byteLength(raw), minifiedBytes: Buffer.byteLength(JSON.stringify(JSON.parse(raw))) + 1,
        transportBytes: Buffer.byteLength(compact), rawGzipBytes: gzipSync(raw).length, transportGzipBytes: gzipSync(compact).length };
}));
const largestPassport = entries.filter(entry => entry.source.includes('/passports/')).sort((a, b) => b.rawBytes - a.rawBytes)[0];
const selected = entries.filter(entry => !entry.source.includes('/passports/') || entry === largestPassport);
const baseIndex = process.argv.indexOf('--base-url');
if (baseIndex >= 0) {
    const baseUrl = process.argv[baseIndex + 1];
    const { chromium } = await import('playwright');
    const require = createRequire(import.meta.url);
    const { launchChromium } = require('./lib/playwright-browser.cjs');
    const browser = await launchChromium(chromium, { logger: null });
    try {
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/offline.html`);
        for (const entry of selected) {
            entry.browser = await page.evaluate(async ({ source, raw, compact }) => {
                const { decodeGeneratedTransport } = await import('/js/core/generated-transport.mjs');
                const { sha256Text } = await import('/js/core/sha256.js');
                const median = async work => {
                    const samples = [];
                    for (let index = 0; index < 40; index++) {
                        const started = performance.now(); await work();
                        if (index >= 10) samples.push(performance.now() - started);
                    }
                    return Number(samples.sort((a, b) => a - b)[15].toFixed(3));
                };
                return {
                    rawParseMs: await median(() => JSON.parse(raw)),
                    rawParseAndByteHashMs: await median(async () => { JSON.parse(raw); await sha256Text(raw); }),
                    transportParseDecodeReconstructAndByteHashMs: await median(() => decodeGeneratedTransport(compact, source, sha256Text))
                };
            }, entry);
        }
    } finally { await browser.close(); }
}
const numeric = ['rawBytes', 'minifiedBytes', 'transportBytes', 'rawGzipBytes', 'transportGzipBytes'];
const totals = Object.fromEntries(numeric.map(key => [key, entries.reduce((sum, entry) => sum + entry[key], 0)]));
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), artifacts: entries.length, browser: baseIndex >= 0 ? 'Chromium, warm median of 30 after 10 warmups' : null,
    totals, candidates: selected.map(({ raw, compact, ...entry }) => entry) }, null, 2));
