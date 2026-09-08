import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { CSS_THEMES, CSS_SOURCES, CSS_TARGETS, CSS_SOURCE_PATTERNS, DIRECT_CSS_BUNDLES } from '../scripts/lib/css-bundles.mjs';

assert.equal(new Set(CSS_SOURCES).size, CSS_SOURCES.length, 'each CSS source has one build owner');
assert.equal(new Set(CSS_TARGETS).size, CSS_TARGETS.length, 'each generated CSS output has one staging owner');
for (const source of CSS_SOURCES) {
  await readFile(source);
  assert(CSS_SOURCE_PATTERNS.some(pattern => pattern.test(source)), `source must trigger generation: ${source}`);
}
assert(CSS_SOURCE_PATTERNS.some(pattern => pattern.test('scripts/lib/css-bundles.mjs')), 'catalog changes must regenerate and stage CSS');
const themeSource = await readFile('js/ui/theme.js', 'utf8');
const themes = JSON.parse(themeSource.match(/export const THEMES = (\[[^;]+\]);/)[1].replaceAll("'", '"'));
assert.deepEqual(CSS_THEMES, themes, 'the build must cover every runtime theme');
for (const source of ['css/hero-search.css', 'css/protocol-anthology.css']) {
  assert(DIRECT_CSS_BUNDLES.some(bundle => bundle.source === source), `stylesheet must share the normal build/staging catalog: ${source}`);
}
const heroCss = await readFile('css/hero-search.css', 'utf8');
assert(!heroCss.includes('.protocol-story-') && !heroCss.includes('.protocol-anthology-chapter'),
  'the home and instant Index stylesheet must not ship the lazy Anthology reading surface');
assert(heroCss.includes('.hero-search-overlay.live-head-panel') && heroCss.includes('.hero-search-group.is-starter'),
  'instant Index geometry and all starter styles must remain available before interaction');
assert(heroCss.includes('#history-modal-close'),
  'Cycle History controls must not depend on opening Protocol Anthology first');
execFileSync(process.execPath, ['scripts/build-css.mjs', '--check'], { stdio: 'pipe' });
console.log('ok - CSS source/output ownership, complete runtime themes, lazy room boundary, instant Index styles, and generated-byte parity');
