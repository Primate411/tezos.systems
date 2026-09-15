#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { FUNDING_MAX_BYTES, FUNDING_PREVIEW_MAX_BYTES, FUNDING_SOURCES, FUNDING_STALE_MS, validateFundingSnapshot, buildFundingPreview, validateFundingPreview, fundingPreviewPath } from '../js/core/community-funding.mjs';
import { normalizeTeztree, normalizeHacktez, fetchHacktezCatalog, fetchTtcrowdCatalog } from './lib/community-funding.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const sourceArg = args.find(arg => arg.startsWith('--source='))?.split('=')[1];
if (args.some(arg => !['--check', '--previews-only'].includes(arg) && !/^--source=(teztree|ttcrowd|hacktez)$/.test(arg))) throw new Error('Usage: refresh-community-funding.mjs [--check|--previews-only] [--source=teztree|ttcrowd|hacktez]');

async function fetchJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000), redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': 'TezosSystems/1.0 (+https://tezos.systems/funding/; primate@tez.capital)' } });
    if (!response.ok) throw new Error(`Funding source HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 4 * 1024 * 1024) throw new Error('Funding source exceeds byte budget');
            chunks.push(value);
        }
    } finally { await reader.cancel().catch(() => {}); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

for (const source of sourceArg ? [sourceArg] : Object.keys(FUNDING_SOURCES)) {
    const file = path.join(ROOT, FUNDING_SOURCES[source].path);
    const previewFile = path.join(ROOT, fundingPreviewPath(source));
    try {
        if (args.includes('--check')) {
            const raw = await fs.readFile(file, 'utf8');
            if (Buffer.byteLength(raw) > FUNDING_MAX_BYTES) throw new Error('Funding snapshot exceeds byte budget');
            const snapshot = validateFundingSnapshot(JSON.parse(raw), source);
            const previewRaw = await fs.readFile(previewFile, 'utf8');
            if (Buffer.byteLength(previewRaw) > FUNDING_PREVIEW_MAX_BYTES) throw new Error('Funding preview exceeds byte budget');
            assert.deepEqual(validateFundingPreview(JSON.parse(previewRaw), source), buildFundingPreview(snapshot), 'Funding preview must match its source snapshot');
        } else {
            const now = new Date().toISOString();
            const snapshot = args.includes('--previews-only') ? validateFundingSnapshot(JSON.parse(await fs.readFile(file, 'utf8')), source) : source === 'teztree'
                ? normalizeTeztree(await fetchJson(FUNDING_SOURCES[source].url), now)
                : source === 'ttcrowd' ? await fetchTtcrowdCatalog(fetchJson, now)
                : normalizeHacktez(await fetchHacktezCatalog(FUNDING_SOURCES[source].url, fetchJson),
                    await fetchHacktezCatalog('https://hacktez.com/api/v1/members?tips=1', fetchJson), now);
            if (!args.includes('--previews-only') && snapshot.sourceGeneratedAt && Date.parse(now) - Date.parse(snapshot.sourceGeneratedAt) > FUNDING_STALE_MS) throw new Error(`${FUNDING_SOURCES[source].name} upstream catalog is stale`);
            const raw = JSON.stringify(snapshot, null, 2) + '\n';
            if (Buffer.byteLength(raw) > FUNDING_MAX_BYTES) throw new Error('Funding snapshot exceeds byte budget');
            const preview = JSON.stringify(validateFundingPreview(buildFundingPreview(snapshot), source), null, 2) + '\n';
            if (Buffer.byteLength(preview) > FUNDING_PREVIEW_MAX_BYTES) throw new Error('Funding preview exceeds byte budget');
            // A source only replaces its last-good file after complete validation.
            await fs.writeFile(`${previewFile}.tmp`, preview);
            if (!args.includes('--previews-only')) {
                await fs.writeFile(`${file}.tmp`, raw);
                await fs.rename(`${file}.tmp`, file);
            }
            await fs.rename(`${previewFile}.tmp`, previewFile);
        }
        console.log(`Community Funding ${source}: ${args.includes('--check') ? 'verified' : 'refreshed'}`);
    } catch (error) {
        console.error(`Community Funding ${source}: ${error.message}; last-good file retained`);
        process.exitCode = 1;
    }
}
