#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSuiteShards } from '../tests/lib/smoke-harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return `
Usage: node scripts/update-smoke-costs.mjs [options] <artifact path...>

Options:
  --base <path>       Existing cost ledger to blend with (default: committed fixture)
  --output <path>     Destination ledger (default: stdout only)
  --min-samples <n>   Minimum successful hosted samples required per suite (default: 1)
  --allow-local       Accept local result ledgers as well as GitHub Actions results
  --help              Show this help
`.trim();
}

function readArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value\n\n${usage()}`);
  return value;
}

function parseArgs(argv) {
  const options = {
    allowLocal: false,
    base: 'tests/fixtures/smoke-suite-costs.json',
    inputs: [],
    minSamples: 1,
    output: ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--allow-local') options.allowLocal = true;
    else if (arg === '--base') {
      options.base = readArg(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--base=')) options.base = arg.slice('--base='.length);
    else if (arg === '--output') {
      options.output = readArg(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length);
    else if (arg === '--min-samples') {
      options.minSamples = Number(readArg(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--min-samples=')) options.minSamples = Number(arg.slice('--min-samples='.length));
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}\n\n${usage()}`);
    else options.inputs.push(arg);
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 100) {
    throw new Error('--min-samples must be an integer from 1 to 100');
  }
  return options;
}

async function collectResultFiles(inputPath) {
  const absolute = path.resolve(ROOT, inputPath);
  const info = await stat(absolute);
  if (info.isFile()) return path.basename(absolute) === 'results.json' ? [absolute] : [];
  if (!info.isDirectory()) return [];
  const found = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) found.push(...await collectResultFiles(child));
    else if (entry.isFile() && entry.name === 'results.json') found.push(child);
  }
  return found;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function suiteRows(costs) {
  return Object.keys(costs).map((name) => ({ name }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.inputs.length) throw new Error(`at least one artifact path is required\n\n${usage()}`);

  const basePath = path.resolve(ROOT, options.base);
  const baseline = JSON.parse(await readFile(basePath, 'utf8'));
  const files = [...new Set((await Promise.all(options.inputs.map(collectResultFiles))).flat())];
  if (!files.length) throw new Error('no results.json files found in the supplied artifact paths');

  const samples = new Map();
  let acceptedLedgers = 0;
  for (const file of files) {
    const payload = JSON.parse(await readFile(file, 'utf8'));
    if (!options.allowLocal && payload.environment?.githubActions !== true) continue;
    if (Number(payload.summary?.failed) || Number(payload.summary?.flaky)) continue;
    acceptedLedgers += 1;
    for (const result of payload.results || []) {
      if (result.status !== 'passed' || !Object.hasOwn(baseline, result.name)) continue;
      const repeats = Math.max(1, Number(result.repeatEach) || result.iterations?.length || 1);
      const seconds = Number(result.durationMs) / 1000 / repeats;
      if (!Number.isFinite(seconds) || seconds <= 0) continue;
      if (!samples.has(result.name)) samples.set(result.name, []);
      samples.get(result.name).push(seconds);
    }
  }
  if (!acceptedLedgers) throw new Error('no fully successful hosted result ledgers were eligible');

  const updated = { ...baseline };
  const changes = [];
  for (const [name, values] of samples) {
    if (values.length < options.minSamples) continue;
    const observed = median(values);
    const previous = Number(baseline[name]) || observed;
    const next = Math.max(1, Math.round((observed * 0.7) + (previous * 0.3)));
    updated[name] = next;
    changes.push({ name, previous, next, observed, samples: values.length });
  }

  const json = `${JSON.stringify(updated, null, 2)}\n`;
  if (options.output) await writeFile(path.resolve(ROOT, options.output), json);
  else process.stdout.write(json);

  const projections = [4, 6].map((total) => {
    const shards = planSuiteShards(suiteRows(updated), total, updated);
    return `${total} shards: ${Math.max(...shards.map((shard) => shard.estimatedCost)).toFixed(0)}s max estimate`;
  });
  console.error(`accepted ${acceptedLedgers} hosted ledger(s); updated ${changes.length}/${Object.keys(updated).length} suite costs`);
  for (const change of changes.sort((left, right) => Math.abs(right.next - right.previous) - Math.abs(left.next - left.previous)).slice(0, 20)) {
    console.error(`${change.name}: ${change.previous}s -> ${change.next}s (median ${change.observed.toFixed(1)}s, n=${change.samples})`);
  }
  console.error(projections.join(' · '));
}

main().catch((error) => {
  console.error(`fail - ${error.stack || error.message}`);
  process.exit(1);
});
