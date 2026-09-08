import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
const parse = source => { const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); };

const root = new URL('../', import.meta.url);
const runtime = await fs.readFile(new URL('widgets/runtime.js', root), 'utf8');
const css = await fs.readFile(new URL('widgets/runtime.css', root), 'utf8');
parse(runtime, { ecmaVersion: 'latest', sourceType: 'module' });
const context = vm.createContext({ DEFAULT_THEME: 'aurora', THEME_COLORS: {}, THEMES: [] });
new vm.Script(runtime.replace(/^import\s+[^;]+;\s*$/gm, '')
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|(?:const|let|class)\b)/g, '')
  + '\nglobalThis.api = { widgetNumber, formatCount, formatPercent, stakingRatioFromStats, requireWidgetNumber, requireWidgetBakers, requireWidgetProtocol };').runInContext(context);
const api = context.api;
for (const value of [null, undefined, '', ' ', false, true, NaN, Infinity, {}, []]) {
  assert.equal(api.widgetNumber(value), null, `${String(value)} must remain unavailable`);
  assert.equal(api.formatCount(value), '—');
  assert.equal(api.formatPercent(value), '—');
  assert.throws(() => api.requireWidgetNumber(value));
}
assert.equal(api.requireWidgetNumber('0'), 0);
assert.throws(() => api.requireWidgetNumber(-1));
assert.throws(() => api.requireWidgetNumber(1.5, { integer: true }));
assert.equal(api.stakingRatioFromStats({ totalSupply: 100, totalOwnStaked: 0, totalExternalStaked: 0, totalFrozen: 50 }), 0);
assert.equal(api.stakingRatioFromStats({ totalSupply: '100', totalOwnStaked: '10', totalExternalStaked: '20' }), 30);
assert.equal(api.stakingRatioFromStats({ totalSupply: 100, totalFrozen: 40 }), 40);
for (const stats of [{}, { totalSupply: 0, totalFrozen: 0 }, { totalSupply: 100, totalOwnStaked: 10, totalFrozen: 40 },
  { totalSupply: 100, totalOwnStaked: null, totalExternalStaked: 20 }, { totalSupply: 100, totalFrozen: 101 },
  { totalSupply: 100, totalOwnStaked: -10, totalExternalStaked: 20 }]) {
  assert.equal(api.stakingRatioFromStats(stats), null, JSON.stringify(stats));
}
assert.throws(() => api.requireWidgetBakers({}));
assert.throws(() => api.requireWidgetBakers([]));
assert.throws(() => api.requireWidgetBakers([{ address: 'tz1', bakingPower: null }]));
assert.throws(() => api.requireWidgetProtocol({ code: 25 }));
for (const name of ['baker-card', 'baker-count', 'block-height', 'price', 'protocol', 'staking-ratio', 'governance', 'combo']) {
  const html = await fs.readFile(new URL(`widgets/${name}.html`, root), 'utf8');
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  parse(script, { ecmaVersion: 'latest', sourceType: 'module' });
  assert.match(html, /href="\.\/runtime\.css"/, `${name}: shared stable refresh styling`);
  assert.match(html, /class="widget-freshness"/, `${name}: source and last-good clock`);
  assert.match(html, /class="widget-retry"/, `${name}: keyboard retry control`);
  assert.match(script, /createWidgetView\(/);
  assert.match(script, /startWidgetRefresh\(fetchData,\s*settings.refreshMs,\s*view\)/);
  assert(!/catch\s*\(/.test(script), `${name}: failures must reach shared last-good handling`);
  assert(!/(?:contentEl|valEl)\.innerHTML\s*=/.test(script), `${name}: reading nodes must be retained`);
}
assert.match(runtime, /if \(document.hidden \|\| inFlight\) return/);
assert.match(runtime, /if \(document.hidden\) pending = outcome/);
assert.match(runtime, /quietlyMutate\(root/);
assert.match(runtime, /else if \(lastGoodAt === null\)/);
assert.match(runtime, /notFound && error\?\.status === 404/);
assert.match(runtime, /memoryCache: false/);
assert.match(css, /position: absolute; bottom: 4px/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /animation: none !important; transition: none !important/);
console.log('ok - eight widget quiet-refresh, source-clock, payload, zero-versus-missing, and failure contracts');
