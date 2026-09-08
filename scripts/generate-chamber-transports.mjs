#!/usr/bin/env node
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodeGeneratedTransport, decodeGeneratedTransport, generatedTransportPath } from '../js/core/generated-transport.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = text => createHash('sha256').update(text).digest('hex');
export const CHAMBER_TRANSPORT_SOURCES = Object.freeze({
    capital: 'data/capital-snapshot.json',
    minerals: 'data/minerals-snapshot.json',
    ecosystem: 'data/ecosystem-stats.json'
});

export async function transportSources(root = ROOT, only = '') {
    if (only && !Object.hasOwn(CHAMBER_TRANSPORT_SOURCES, only) && only !== 'maxis') throw new Error(`Unknown transport family: ${only}`);
    const sources = Object.entries(CHAMBER_TRANSPORT_SOURCES).filter(([key]) => !only || only === key).map(([, value]) => value);
    if (!only || only === 'maxis') {
        const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/maxis/manifest.json'), 'utf8'));
        for (const season of manifest.seasons) {
            if (!/^[A-Za-z0-9_-]+$/.test(season.id)) throw new Error('Invalid Maxis season transport identity');
            const directory = `data/maxis/seasons/${season.id}/passports`;
            const files = (await fs.readdir(path.join(root, directory))).filter(name => /^[0-9a-f]{2}\.json$/.test(name)).sort();
            sources.push(...files.map(name => `${directory}/${name}`));
        }
    }
    return sources;
}

export async function generateChamberTransports({ root = ROOT, only = '', check = false } = {}) {
    const sources = await transportSources(root, only);
    for (const source of sources) {
        const original = await fs.readFile(path.join(root, source), 'utf8');
        const expected = `${JSON.stringify(await encodeGeneratedTransport(original, source, digest))}\n`;
        const decoded = await decodeGeneratedTransport(expected, source, digest);
        if (decoded.text !== original) throw new Error(`Transport changed source bytes: ${source}`);
        const target = path.join(root, generatedTransportPath(source).slice(1));
        const current = await fs.readFile(target, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (current !== expected) {
            if (check) throw new Error(`Stale or missing transport: ${target}; run node scripts/generate-chamber-transports.mjs`);
            await fs.mkdir(path.dirname(target), { recursive: true });
            const temporary = `${target}.tmp`;
            await fs.writeFile(temporary, expected);
            await fs.rename(temporary, target);
        }
    }
    return sources.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const onlyIndex = process.argv.indexOf('--only');
    const count = await generateChamberTransports({ only: onlyIndex < 0 ? '' : process.argv[onlyIndex + 1], check: process.argv.includes('--check') });
    console.log(`ok - ${count} deterministic transports preserve their exact source bytes`);
}
