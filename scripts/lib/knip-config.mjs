import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAMBER_FEATURES } from '../../js/core/chamber-features.mjs';
import { STATIC_CHECKS } from '../../tests/lib/static-test-catalog.mjs';
import { SCHEDULED_REFRESH_LANES } from './scheduled-refresh-lanes.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const slash = value => value.split(path.sep).join('/');
const relativeImport = (filename, target) => {
  const relative = slash(path.relative(path.dirname(filename), target));
  return relative.startsWith('.') ? relative : `./${relative}`;
};
const localScript = value => /^(?:\.{0,2}\/)?[^?#]*\.(?:mjs|cjs|js)(?:[?#].*)?$/.test(value)
  && !/^(?:[a-z]+:|\/\/)/i.test(value);

function canonicalSpecifier(value, filename, root) {
  if (!localScript(value)) return value;
  const clean = value.split(/[?#]/)[0];
  return clean.startsWith('/') ? relativeImport(filename, path.join(root, clean.slice(1))) : clean;
}

function normalizeImports(source, filename, root) {
  // Preserve named import usage while removing browser-only cache identities.
  return source.replace(/(\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*))(['"])([^'"\n]+)\2/g,
    (_, prefix, quote, specifier) => `${prefix}${quote}${canonicalSpecifier(specifier, filename, root)}${quote}`);
}

export function compileHtml(source, filename, root = ROOT) {
  const scripts = [];
  const html = source.replace(/<!--[\s\S]*?-->/g, '');
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attribute = name => attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    const value = name => { const match = attribute(name); return match ? match[1] ?? match[2] ?? match[3] : null; };
    const type = value('type')?.toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    const src = value('src');
    if (src !== null) {
      if (!localScript(src)) continue; // CDN scripts are external, not npm dependencies.
      const specifier = canonicalSpecifier(src, filename, root);
      scripts.push(`import ${JSON.stringify(specifier.startsWith('.') ? specifier : `./${specifier}`)};`);
    } else {
      scripts.push(normalizeImports(body, filename, root));
    }
  }
  return scripts.join('\n');
}

function catalogImports(chambers) {
  let index = 0;
  return Object.values(chambers).map(feature => {
    const names = [...new Set(['init', 'open', 'close'].map(key => feature[key]).filter(Boolean))];
    if (!names.length) return `import ${JSON.stringify(feature.modulePath)};`;
    const bindings = names.map(name => {
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error(`Invalid chamber export: ${name}`);
      return { name, alias: `__knipChamber${index++}` };
    });
    return `import { ${bindings.map(({ name, alias }) => `${name} as ${alias}`).join(', ')} } from ${JSON.stringify(feature.modulePath)};\nvoid [${bindings.map(({ alias }) => alias).join(', ')}];`;
  }).join('\n');
}

export function compileJavaScript(source, filename, { root = ROOT, chambers = CHAMBER_FEATURES } = {}) {
  const file = slash(path.relative(root, filename));
  let compiled = source.replace(/\bimport\(\s*versionedAsset\(\s*(['"])([^'"]+)\1\s*\)\s*\)/g,
    (_, quote, specifier) => `import(${JSON.stringify(specifier)})`);
  if (file === 'js/core/app.js') {
    compiled = compiled.replace(/\bimportAppFeatureModule\(\s*(['"])[^'"]+\1\s*,\s*(['"])([^'"]+)\2\s*\)/g,
      (_, _quote, _pathQuote, specifier) => `import(${JSON.stringify(specifier)})`);
    compiled = compiled.replace(/\bloadChamberFeature\(\s*(['"])([^'"]+)\1\s*(?:,\s*\{[^}]*\})?\s*\)/g,
      (original, _quote, id) => chambers[id] ? `import(${JSON.stringify(chambers[id].modulePath)})` : original);
    // This dispatch uses another named API beyond the catalog's init/open/close.
    compiled += [...source.matchAll(/\bcallLoadedChamberFeature\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3/g)]
      .map(([, , id, , method]) => chambers[id]
        ? `\nimport(${JSON.stringify(chambers[id].modulePath)}).then(module => module[${JSON.stringify(method)}]);` : '').join('');
  }
  if (file === 'js/core/chamber-features.mjs') compiled += `\n${catalogImports(chambers)}`;
  // Map-backed version registries return a namespace whose known public APIs
  // Knip cannot trace through getMaxisSource/getMaxisEvaluator. Retain those
  // APIs, while leaving every other implementation export open to analysis.
  const registryApis = {
    'scripts/lib/maxis-source.mjs': ['IMMUTABLE_IMPLEMENTATION_FILES', 'MAXIS_SOURCE_VERSION', 'EVALUATOR_VERSION', 'buildFullSeasonSnapshot', 'rebuildWithoutTransactionLane'],
    'scripts/lib/maxis-season.mjs': ['SEASON_EVALUATOR_VERSION', 'buildRuleDefinition', 'buildSeasonCompetition', 'validateSeasonSnapshot', 'buildLaneRuleHashes', 'SEASON_RULES_VERSION', 'LANE_EVALUATOR_SEMANTICS', 'expandPassportRecord', 'truncationCoverageErrors']
  }[file];
  if (registryApis) {
    for (const [, namespace] of source.matchAll(/\bimport\s+\*\s+as\s+([\w$]+)\s+from\s+['"]\.\/maxis-(?:source|evaluator)-v\d+\.mjs['"]/g)) {
      compiled += `\nvoid [${registryApis.map(name => `${namespace}.${name}`).join(', ')}];`;
    }
  }
  if (file === 'js/core/hen-init.js') {
    const specifier = source.match(/\bscript\.src\s*=\s*(['"])([^'"]+)\1/)?.[2];
    if (specifier) compiled += `\nimport ${JSON.stringify(specifier)};`;
  }
  if (file === 'js/core/standalone-chamber.js') {
    // Generated shells hand back to this same dashboard controller.
    compiled = compiled.replace(/\bimport\(source\.href\)/g, "import('./app.js')");
  }
  if (['js/ui/share.js', 'js/ui/changelog-launcher.js'].includes(file)) {
    const specifier = source.match(/\bconst path = (['"])([^'"]+)\1/)?.[2];
    if (specifier) compiled = compiled.replace(/\bimport\(importAttempt\s*\?\s*`[^`]+`\s*:\s*path\)/g,
      `import(${JSON.stringify(specifier)})`);
  }
  return normalizeImports(compiled, filename, root);
}

export function createKnipConfig({ root = ROOT, chambers = CHAMBER_FEATURES, staticChecks = STATIC_CHECKS, lanes = SCHEDULED_REFRESH_LANES } = {}) {
  root = fs.realpathSync(root);
  const entry = new Set(['**/*.html', 'sw.js']);
  const add = file => {
    if (typeof file !== 'string' || !localScript(file) || file.startsWith('/') || file.split('/').includes('..')) {
      throw new Error(`Invalid tooling entry: ${file}`);
    }
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing tooling entry: ${file}`);
    entry.add(file);
  };
  for (const { script } of staticChecks) add(script);
  for (const lane of lanes) for (const command of [...lane.refresh, ...lane.validate]) add(command.script);
  // Knip already follows package.json commands and GitHub workflow steps. These
  // small dispatchers use values/arrays rather than literal spawn arguments.
  const dispatchers = [
    ['scripts/refresh-generated-surfaces.mjs', /\bnodeScript\(\s*['"]([^'"]+)['"]/g],
    ['scripts/generate-launcher-projections.mjs', /['"](scripts\/[^'"]+\.(?:mjs|js))['"]/g],
    ['scripts/stamp-version.sh', /\$REPO_ROOT\/(scripts\/[^"\s]+\.(?:mjs|js))/g],
    ['.githooks/pre-commit', /\$ROOT\/((?:scripts|tests)\/[^"\s]+\.(?:mjs|js))/g]
  ];
  for (const [file, pattern] of dispatchers) {
    if (!fs.existsSync(path.join(root, file))) continue;
    for (const [, script] of fs.readFileSync(path.join(root, file), 'utf8').matchAll(pattern)) add(script);
  }
  // Reviewed manual CLIs: favicon regeneration and rendered transport parity.
  // They remain individually listed so an abandoned new script is still found.
  for (const file of ['scripts/generate-favicons.mjs', 'tests/generated-transport-browser.mjs']) {
    if (fs.existsSync(path.join(root, file))) add(file);
  }
  for (const feature of Object.values(chambers)) {
    const file = path.resolve(root, 'js/core', feature.modulePath);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) throw new Error(`Missing chamber module: ${feature.modulePath}`);
  }
  // Avoid redundant-entry hints for literal Node commands that Knip's package
  // parser already follows. Nonliteral dispatch remains explicitly catalogued.
  const manifestFile = path.join(root, 'package.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  const packageEntries = new Set([manifest.main, ...Object.values(manifest.scripts || {}).flatMap(command =>
    [...command.matchAll(/(?:^|\s)node\s+([^\s;&]+\.(?:mjs|cjs|js))(?=\s|$)/g)].map(([, file]) => file))]);
  return {
    entry: [...entry].filter(file => !packageEntries.has(file)),
    project: ['**/*.{js,mjs,cjs,html}'],
    // Browser-root imports also appear in page.evaluate and the HTML scripts.
    paths: { '/js/*': ['./js/*'], '/widgets/*': ['./widgets/*'] },
    // Python serves the local site; it is a system tool, not an npm dependency.
    ignoreBinaries: ['python3'],
    compilers: {
      html: (source, filename) => compileHtml(source, filename, root),
      js: (source, filename) => compileJavaScript(source, filename, { root, chambers }),
      mjs: (source, filename) => compileJavaScript(source, filename, { root, chambers }),
      cjs: (source, filename) => compileJavaScript(source, filename, { root, chambers })
    }
  };
}
