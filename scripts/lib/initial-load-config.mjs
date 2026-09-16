import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HISTORICAL_BASELINE = path.join(ROOT, 'tests/fixtures/initial-load-baseline.json');

export const VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900 }),
  mobile: Object.freeze({ width: 390, height: 844 })
});
export const CACHE_MODES = Object.freeze(['cold', 'warm', 'installed-worker']);
export const MATRIX_PROFILES = Object.freeze(Object.entries(VIEWPORTS).flatMap(([device, viewport]) =>
  [false, true].flatMap(savedWallet => CACHE_MODES.map(cache => Object.freeze({
    id: `${device}-${savedWallet ? 'saved-wallet' : 'anonymous'}-${cache}`, device, viewport, savedWallet, cache
  }))))) ;

function physicalPath(file) {
  try { return realpathSync(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(file);
    return parent === file ? file : path.join(physicalPath(parent), path.basename(file));
  }
}

// Match the runner's repository-relative artifact convention and protect the
// historical baseline even when invoked elsewhere or through a symlink alias.
export function resolveInitialLoadOutput(output) {
  if (!output) return '';
  const resolved = path.resolve(ROOT, output);
  if (physicalPath(resolved) === physicalPath(HISTORICAL_BASELINE)) {
    throw new Error('The July historical baseline is immutable; choose a new output path');
  }
  return resolved;
}

export function parseInitialLoadArgs(argv) {
  const options = { baseUrl: process.env.BASE_URL || '', runs: 5, warmupRuns: 1, settleMs: 2500,
    timeoutMs: 30000, output: '', label: 'measurement', mode: 'no-worker', matrix: false,
    profile: '', network: '', theme: '', budgets: '', requireStable: false };
  const strings = { '--base-url': 'baseUrl', '--output': 'output', '--label': 'label', '--mode': 'mode',
    '--profile': 'profile', '--network': 'network', '--theme': 'theme', '--budgets': 'budgets' };
  const numbers = { '--runs': 'runs', '--warmup-runs': 'warmupRuns', '--settle-ms': 'settleMs', '--timeout-ms': 'timeoutMs' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help') options.help = true;
    else if (arg === '--matrix') options.matrix = true;
    else if (arg === '--require-stable') options.requireStable = true;
    else if (Object.hasOwn(strings, arg) || Object.hasOwn(numbers, arg)) {
      const value = argv[++index];
      if (!value || !value.trim() || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      options[strings[arg] || numbers[arg]] = Object.hasOwn(numbers, arg) ? Number(value) : value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const [key, min, max] of [['runs', 1, 20], ['warmupRuns', 0, 3], ['settleMs', 0, 15000], ['timeoutMs', 100, 120000]]) {
    if (!Number.isInteger(options[key]) || options[key] < min || options[key] > max) throw new Error(`${key} must be an integer from ${min} to ${max}`);
  }
  if (!['no-worker', 'installed-worker'].includes(options.mode)) throw new Error('--mode must be no-worker or installed-worker');
  if (options.matrix && options.profile) throw new Error('Choose --matrix or --profile, not both');
  if ((options.matrix || options.profile) && options.mode !== 'no-worker') throw new Error('--mode is only for the legacy single profile; use a profile cache suffix');
  options.network ||= options.matrix || options.profile ? 'populated' : 'blocked';
  if (!['populated', 'blocked'].includes(options.network)) throw new Error('--network must be populated or blocked');
  options.theme ||= options.matrix || options.profile ? 'aurora' : 'clean';
  if (!['aurora', 'clean'].includes(options.theme)) throw new Error('Measurement themes are aurora and clean');
  if (options.requireStable && options.runs < 2) throw new Error('--require-stable needs at least two runs');
  if (options.baseUrl) {
    const url = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('--base-url must be a loopback HTTP(S) origin without a path, query or credentials');
    }
    if (options.network === 'populated') throw new Error('Populated fixtures require the owned server; omit --base-url');
    options.baseUrl = url.origin;
  }
  options.output = resolveInitialLoadOutput(options.output);
  const selected = options.matrix ? MATRIX_PROFILES : options.profile
    ? options.profile.split(',').map(id => {
      const profile = MATRIX_PROFILES.find(item => item.id === id);
      if (!profile) throw new Error(`Unknown profile: ${id}`);
      return profile;
    })
    : [MATRIX_PROFILES.find(item => item.id === `desktop-anonymous-${options.mode === 'installed-worker' ? 'installed-worker' : 'cold'}`)];
  if (new Set(selected.map(profile => profile.id)).size !== selected.length) throw new Error('Duplicate measurement profiles');
  if (options.network === 'blocked' && selected.some(profile => profile.savedWallet)) throw new Error('Saved-wallet profiles require populated fixtures');
  options.profiles = selected.map(profile => ({ ...profile, viewport: { ...profile.viewport }, network: options.network, theme: options.theme }));
  return options;
}
