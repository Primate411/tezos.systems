import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = file => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [html, entry, shared, standalone, valley] = await Promise.all([
  read('index.html'), read('js/effects/theme-loader.js'), read('js/ui/chamber-theme-effects.js'),
  read('js/core/standalone-chamber.js'), read('js/effects/valley-loader.js')
]);
const painter = /(?:matrix-effects|bg-effects|valley-effects)\.js/;
for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) || []) {
  assert.ok(!painter.test(tag), `Root must not eagerly request an optional renderer: ${tag}`);
}
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1].split('?')[0]);
assert.equal(scripts.filter(src => src === 'js/effects/theme-loader.js').length, 1, 'One shared theme loader entrypoint');
assert.equal(scripts.filter(src => src === 'js/effects/valley-loader.js').length, 1, 'Valley still observes early cached stats');
assert.ok(scripts.indexOf('js/effects/theme-loader.js') < scripts.indexOf('js/core/app.js'), 'Theme lifecycle subscribes before dashboard initialization');
assert.ok(scripts.indexOf('js/effects/valley-loader.js') < scripts.indexOf('js/core/app.js'), 'Valley stats observer subscribes before dashboard initialization');
assert.match(entry, /import\s*\{\s*initChamberThemeEffects\s*\}\s*from\s*['"]\.\.\/ui\/chamber-theme-effects\.js['"]/);
assert.match(entry, /initChamberThemeEffects\(\)/, 'Root starts the shared lifecycle');
assert.match(standalone, /import\s*\{\s*initChamberThemeEffects\s*\}\s*from\s*['"]\.\.\/ui\/chamber-theme-effects\.js['"]/);
assert.match(standalone, /initChamberThemeEffects\(\)/, 'Standalone starts the same lifecycle');
assert.ok(!/^\s*import\s+(?!\()[^\n]*(?:matrix-effects|bg-effects|valley-effects)\.js/m.test(shared), 'Shared lifecycle must not statically import painters');
for (const path of ['/js/effects/matrix-effects.js', '/js/effects/bg-effects.js']) assert.ok(shared.includes(path), `Canonical first-attempt URL retained: ${path}`);
assert.ok(shared.includes("versionedAsset('/js/effects/valley-loader.js')"), 'Standalone uses the same versioned Valley observer');
assert.match(shared, /matchMedia\(['"]\(prefers-reduced-motion: reduce\)['"]\)/, 'Reduced motion must prevent initial renderer download');
assert.match(shared, /theme-retry/, 'Failed native imports need a fresh URL for retry');
assert.ok(!/\b(?:setInterval|setTimeout)\s*\(/.test(shared), 'Theme retries wait for user or preference events, never a retry timer');
assert.ok(!/dispatchEvent\s*\(/.test(shared), 'Import completion must not rebroadcast theme changes and restart existing painters');
assert.match(valley, /addEventListener\(['"]stats-updated['"],\s*rememberStats\)/, 'Valley retains pre-import stats capture');
assert.match(valley, /effect\?\.seedStats\?\.\(lastStatsDetail\)/, 'Valley retains private seed delivery');
console.log('ok - theme effects: no eager renderers, shared early lifecycle, canonical first loads, event-only retry and preserved Valley stats');
