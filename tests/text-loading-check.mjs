import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHAMBER_FEATURES } from '../js/core/chamber-features.mjs';

// Every new room must declare whether it contains asynchronously populated text.
// Browser cases own the rendered proof; static navigation is explicitly exempt.
const coveredRoutes = new Set([
  'pulse', 'tezosx', 'capital', 'minerals', 'uranium', 'metals', 'whales', 'stake',
  'ecosystem', 'leaderboard', 'tz4', 'chamber', 'l2chamber', 'lb', 'ledger-flow',
  'domains', 'maxis', 'funding', 'tezoscrp', 'health', 'history', 'ctez', 'my', 'anthology'
]);
const staticRoutes = new Set(['chambers']);
for (const feature of Object.values(CHAMBER_FEATURES)) {
  if (!feature.standalone) continue;
  assert.ok(coveredRoutes.has(feature.standalone.route) || staticRoutes.has(feature.standalone.route), `${feature.standalone.route}: add a pending-text browser case or document its static-only text`);
}
const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [helper, css, browser, runner] = await Promise.all([
  read('js/ui/text-loading.js'), read('css/loading.css'), read('tests/lib/text-loading-smoke.mjs'), read('tests/smoke.mjs')
]);
assert.doesNotMatch(helper, /MutationObserver|setInterval|querySelectorAll\(['"]\*['"]\)/, 'loading state belongs to the request owner, never a global text heuristic');
assert.match(helper, /escapeHtml\(label\)/, 'accessible labels remain escaped');
assert.ok(Buffer.byteLength(helper) <= 2048, 'the explicitly allowed standalone loading helper stays within 2 KiB');
assert.match(css, /background-color: var\(--bg-secondary, #182235\) !important/, 'opaque theme-aware backing');
assert.match(css, /prefers-reduced-motion: reduce/, 'reduced motion retains a visible stationary bubble');
for (const suite of ['chambers', 'my-tezos', 'widgets', 'tools', 'secondary']) assert.ok(runner.includes(`name: 'text-loading-${suite}'`));
assert.match(browser, /assert\.rejects/, 'a broken visual must fail even with a loading marker');
assert.match(browser, /getComputedStyle/, 'browser coverage must inspect rendered indicators');
assert.match(browser, /setTimeout|waitForFunction/, 'completion is observed in the browser');
assert.match(browser, /do not replace the themed loader/, 'existing chamber text effects remain protected');
assert.match(await read('js/core/hen-init.js'), /script\.type = 'module'/, 'HEN loads the shared text module through its real launcher');
assert.match(await read('hen/index.html'), /css\/loading\.min\.css/, 'standalone HEN includes the opaque text styling');
console.log('ok - text-loading coverage classifies every chamber, preserves themed effects, and requires rendered pending/completion checks');
