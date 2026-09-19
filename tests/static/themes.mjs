// Static contracts owned by themes. Shared dependencies remain explicit.
export function createThemesStaticChecks({
  CSS_TARGETS,
  CSS_THEMES,
  LAZY_SURFACE_STYLES,
  fail,
  pass,
  readText,
  statOrNull,
  walk,
  warn
}) {
  async function checkStylesheetFreshness() {
    const source = await statOrNull('css/styles.css');
    const minified = await statOrNull('css/styles.min.css');
    if (!source || !minified) return;

    if (source.mtimeMs > minified.mtimeMs + 1000) {
      warn('css/styles.css is newer than css/styles.min.css; regenerate the served minified CSS before deploy');
    } else {
      pass('served minified CSS is not older than source CSS');
    }

    const themeFiles = await walk('css/themes', (file) => file.endsWith('.min.css')).catch(() => []);
    const themeSource = await readText('js/ui/theme.js');
    const themeMatch = themeSource.match(/export const THEMES\s*=\s*\[([\s\S]*?)\];/);
    const expectedThemes = themeMatch ? Array.from(themeMatch[1].matchAll(/['"]([^'"]+)['"]/g), (match) => match[1]) : [];
    if (!expectedThemes.length) {
      fail('js/ui/theme.js theme list could not be parsed for lazy theme CSS checks');
    }
    const baseCss = await readText('css/styles.min.css');
    const styles = await readText('css/styles.css');
    const matrixCss = await readText('css/themes/matrix.css');
    const shellExtrasCss = await readText('css/shell-extras.css');
    if (!matrixCss.includes('[data-theme="matrix"] :is(.price-label, .price-mcap)')
        || !matrixCss.includes('color: #8cff8c')
        || !shellExtrasCss.includes('.pulse-ticker-weight')
        || !shellExtrasCss.includes('color: #8cff8c')) {
      fail('Matrix small telemetry labels must keep the explicit high-contrast treatment');
    }
    const leakedThemes = expectedThemes.filter((theme) => new RegExp(`data-theme\\s*=\\s*["']?${theme}["']?`, 'i').test(baseCss));
    if (leakedThemes.length) {
      fail(`css/styles.min.css should not carry lazy theme selectors: ${leakedThemes.join(', ')}`);
    }
    if (minified.size > 300 * 1024) {
      fail(`css/styles.min.css is ${Math.round(minified.size / 1024)}KB; lazy theme split should keep the render-blocking base under 300KB`);
    }
    for (const theme of expectedThemes) {
      const file = `css/themes/${theme}.min.css`;
      if (!themeFiles.includes(file)) fail(`missing lazy theme bundle: ${file}`);
      const themeStat = await statOrNull(file);
      if (themeStat && source.mtimeMs > themeStat.mtimeMs + 1000) {
        warn(`${file} is older than css/styles.css; run npm run build:css`);
      }
    }
    if (themeFiles.length >= expectedThemes.length) {
      pass(`lazy theme CSS bundles checked: ${themeFiles.length}`);
    }

    const lazySurfaceSources = LAZY_SURFACE_STYLES;
    const myTezosMinStat = await statOrNull('css/my-tezos.min.css');
    if (!myTezosMinStat) {
      fail('missing generated stylesheet: css/my-tezos.min.css');
    } else if (source.mtimeMs > myTezosMinStat.mtimeMs + 1000) {
      warn('css/my-tezos.min.css is older than css/styles.css; run npm run build:css');
    }
    for (const sourceName of ['shell-extras.css', ...lazySurfaceSources]) {
      const sourcePath = `css/${sourceName}`;
      const minPath = `css/${sourceName.replace(/\.css$/, '.min.css')}`;
      const sourceStat = await statOrNull(sourcePath);
      const minStat = await statOrNull(minPath);
      if (!sourceStat || !minStat) {
        fail(`missing generated stylesheet pair: ${sourcePath} -> ${minPath}`);
      } else if (sourceStat.mtimeMs > minStat.mtimeMs + 1000) {
        warn(`${minPath} is older than ${sourcePath}; run npm run build:css`);
      }
    }
    const generatedSurfaces = await readText('scripts/refresh-generated-surfaces.mjs');
    if (!generatedSurfaces.includes("import { CSS_TARGETS, CSS_SOURCE_PATTERNS } from './lib/css-bundles.mjs'")
      || !generatedSurfaces.includes('stageTargets(CSS_TARGETS)')
      || !['css/my-tezos.min.css', 'css/shell-extras.min.css', 'css/hero-search.min.css', 'css/hen-mode.min.css', 'css/site-map.min.css', 'css/landing.min.css', 'css/loading.min.css'].every(file => CSS_TARGETS.includes(file))) {
      fail('pre-commit generation must stage the shared complete CSS catalog');
    }
    pass(`lazy surface CSS bundles and pre-commit coverage checked: ${lazySurfaceSources.length}`);

    const sourceCss = await readText('css/styles.css');
    const henCss = (await readText('css/hen-mode.css')) + (await readText('css/hen-feed.css'));
    const parseVariables = (block = '') => Object.fromEntries(
      Array.from(block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi), (match) => [match[1], match[2].trim()])
    );
    const rootVariables = parseVariables(sourceCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1]);
    const henVariables = parseVariables(henCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1]);
    const resolveVariable = (value, variables, depth = 0) => {
      const variable = String(value || '').match(/^var\((--[a-z0-9-]+)\)$/i)?.[1];
      if (!variable || depth > 4) return value;
      return resolveVariable(variables[variable], variables, depth + 1);
    };
    const normalizeHex = (value) => /^#[0-9a-f]{3}$/i.test(value || '')
      ? `#${value.slice(1).split('').map((character) => character.repeat(2)).join('')}`
      : value;
    const luminance = (hex) => {
      const channels = hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255);
      const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
    };
    const contrastRatio = (left, right) => {
      const light = Math.max(luminance(left), luminance(right));
      const dark = Math.min(luminance(left), luminance(right));
      return (light + 0.05) / (dark + 0.05);
    };
    for (const theme of expectedThemes) {
      const themeBlock = sourceCss.match(new RegExp(`\\[data-theme=["']${theme}["']\\]\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] || '';
      const variables = { ...rootVariables, ...henVariables, ...parseVariables(themeBlock) };
      for (const textToken of ['--text-tertiary', '--text-muted']) {
        const textColor = normalizeHex(resolveVariable(variables[textToken], variables));
        for (const backgroundToken of ['--bg-primary', '--bg-secondary', '--bg-tertiary']) {
          const backgroundColor = normalizeHex(resolveVariable(variables[backgroundToken], variables));
          if (!/^#[0-9a-f]{6}$/i.test(textColor || '') || !/^#[0-9a-f]{6}$/i.test(backgroundColor || '')) {
            fail(`theme ${theme} contrast contract could not resolve ${textToken} on ${backgroundToken}`);
            continue;
          }
          const ratio = contrastRatio(textColor, backgroundColor);
          if (ratio < 4.5) {
            fail(`theme ${theme} ${textToken} contrast is ${ratio.toFixed(2)}:1 on ${backgroundToken}; small text needs at least 4.5:1`);
          }
        }
      }
      if (theme === 'clean') {
        const linkColor = normalizeHex(resolveVariable(variables['--surface-link-color'], variables));
        for (const backgroundToken of ['--bg-primary', '--bg-secondary', '--bg-tertiary']) {
          const backgroundColor = normalizeHex(resolveVariable(variables[backgroundToken], variables));
          const ratio = contrastRatio(linkColor, backgroundColor);
          if (ratio < 4.5) {
            fail(`theme clean link contrast is ${ratio.toFixed(2)}:1 on ${backgroundToken}; ordinary links need at least 4.5:1`);
          }
        }
      }
    }
    pass(`theme small-text contrast checked across ${expectedThemes.length} themes`);
  }

  async function checkAuroraDesktopTitleTreatment() {
    const css = await readText('css/styles.css');
    const matrixEffects = await readText('js/effects/matrix-effects.js');
    const backgroundEffects = await readText('js/effects/bg-effects.js');
    const titleStart = css.indexOf('[data-theme="aurora"] .title');
    const keyframesStart = css.indexOf('@keyframes auroraTitleShift', titleStart);
    const sharedBlock = titleStart >= 0 && keyframesStart >= 0
      ? css.slice(titleStart, keyframesStart)
      : '';

    if (!sharedBlock.includes('[data-theme="aurora"] .title')) {
      fail('aurora title needs a shared mobile/desktop multicolor treatment');
      return;
    }

    for (const token of ['#45E0C8', '#5BA8FF', '#9B8CFF', '#F49AD1']) {
      if (!sharedBlock.includes(token)) fail(`shared aurora title gradient missing ${token}`);
    }

    if (!sharedBlock.includes('background-size: 220% auto')) {
      fail('aurora title must keep the mobile-style wide gradient field on desktop');
    }
    if (!sharedBlock.includes('animation: auroraTitleShift 9s linear infinite')) {
      fail('aurora title must use the same shifting animation on desktop and mobile');
    }
    if (css.includes('auroraTitleSweep')) {
      fail('desktop aurora title should not use a separate sweep animation from mobile');
    }
    const accessibilityStart = css.indexOf('Accessibility');
    const reducedMotionStart = css.indexOf('@media (prefers-reduced-motion: reduce)', accessibilityStart);
    const reducedMotionEnd = css.indexOf('.glass-button:focus', reducedMotionStart);
    const reducedMotionBlock = reducedMotionStart >= 0 && reducedMotionEnd > reducedMotionStart
      ? css.slice(reducedMotionStart, reducedMotionEnd)
      : '';
    if (!reducedMotionBlock.includes('animation: none !important')) {
      fail('reduced-motion mode must disable decorative animations');
    }
    if (!reducedMotionBlock.includes('*::before') || !reducedMotionBlock.includes('*::after')) {
      fail('reduced-motion mode must also disable animations on pseudo-elements');
    }
    if (reducedMotionBlock.includes('auroraTitleShift') || /animation:[^;]*infinite/i.test(reducedMotionBlock)) {
      fail('Aurora and other theme animations must not be re-enabled in reduced-motion mode');
    }
    for (const [label, source] of [['Matrix canvas', matrixEffects], ['theme background canvas', backgroundEffects]]) {
      if (!source.includes("matchMedia('(prefers-reduced-motion: reduce)')")
          || !source.includes('!reducedMotionQuery.matches')
          || !source.includes("addEventListener('change', handleThemeChange)")) {
        fail(`${label} must avoid animation under reduced motion and react when the preference changes`);
      }
    }

    pass('desktop aurora title shares the multicolor treatment while respecting reduced motion');
  }

  async function checkValleyThemeContracts() {
    const [
      themeSource,
      preloadSource,
      buildCssSource,
      generatedSource,
      indexSource,
      landingSource,
      stylesSource,
      smokeSource
    ] = await Promise.all([
      readText('js/ui/theme.js'),
      readText('js/core/theme-preload.js'),
      readText('scripts/build-css.mjs'),
      readText('scripts/refresh-generated-surfaces.mjs'),
      readText('index.html'),
      readText('landing.html'),
      readText('css/styles.css'),
      readText('tests/smoke.mjs')
    ]);
    const loaderSource = await readText('js/effects/valley-loader.js').catch(() => '');
    const rendererSource = await readText('js/effects/valley-effects.js').catch(() => '');
    const valleyBundle = await readText('css/themes/valley.css').catch(() => '');
    const valleyMinBundle = await readText('css/themes/valley.min.css').catch(() => '');

    const parseStringArray = (source, pattern) => {
      const body = source.match(pattern)?.[1] || '';
      return Array.from(body.matchAll(/['"]([^'"]+)['"]/g), (match) => match[1]);
    };
    const mirroredRegistries = [
      ['runtime theme registry', parseStringArray(themeSource, /export const THEMES\s*=\s*\[([\s\S]*?)\];/)],
      ['render-blocking preload registry', parseStringArray(preloadSource, /var VALID\s*=\s*\[([\s\S]*?)\];/)],
      ['CSS build registry', buildCssSource.includes('CSS_THEMES as THEMES') ? CSS_THEMES : []],
      ['generated-surface registry', generatedSource.includes("from './lib/css-bundles.mjs'") ? CSS_THEMES : []],
      ['landing-page registry', Array.from(
        (landingSource.match(/var THEMES\s*=\s*\{([\s\S]*?)\n\s*\};/)?.[1] || '').matchAll(/^\s*([a-z][a-z0-9-]*)\s*:/gim),
        (match) => match[1]
      )]
    ];
    for (const [label, themes] of mirroredRegistries) {
      if (themes.filter((theme) => theme === 'valley').length !== 1) {
        fail(`Valley must appear exactly once in the ${label}`);
      }
    }
    const canonicalThemes = mirroredRegistries[0][1];
    for (const [label, themes] of mirroredRegistries.slice(1)) {
      if (themes.join('\n') !== canonicalThemes.join('\n')) {
        fail(`Valley theme registry drifted between the runtime list and ${label}`);
      }
    }
    for (const [label, source] of [
      ['theme picker colors', themeSource.match(/export const THEME_COLORS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || ''],
      ['theme picker vibe', themeSource.match(/const THEME_VIBES\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || ''],
      ['runtime font registry', themeSource.match(/const THEME_FONT_FAMILIES\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || ''],
      ['preload font registry', preloadSource.match(/var THEME_FONTS\s*=\s*\{([\s\S]*?)\n\s*\};/)?.[1] || '']
    ]) {
      if (!/['"]?valley['"]?\s*:/.test(source)) fail(`Valley is missing from the ${label}`);
    }

    if (!loaderSource) {
      fail('Valley must use a dedicated lazy lifecycle loader');
    } else {
      if (!/import\(\s*['"]\.\/valley-effects\.js(?:\?[^'"]*)?['"]\s*\)/.test(loaderSource)) {
        fail('Valley loader must dynamically import the renderer only when needed');
      }
      if (!/generation|token|requestId|loadId/i.test(loaderSource)
        || !/!==|!=/.test(loaderSource)
        || !/getAttribute\(\s*['"]data-theme['"]\s*\)|dataset\.theme/.test(loaderSource)
        || !/['"]valley['"]/.test(loaderSource)) {
        fail('Valley dynamic import must be guarded against a stale theme or load generation');
      }
      if (!/matchMedia\(\s*['"]\(prefers-reduced-motion:\s*reduce\)['"]\s*\)/.test(loaderSource)
        || !/addEventListener\(\s*['"]change['"]/.test(loaderSource)) {
        fail('Valley loader must avoid animation under reduced motion and react to preference changes');
      }
    }
    if (!indexSource.includes('js/effects/valley-loader.js')) {
      fail('Valley lifecycle loader must be reachable from the app shell');
    }
    if (indexSource.indexOf('<script type="module" src="js/effects/valley-loader.js')
      > indexSource.indexOf('<script type="module" src="js/core/app.js')) {
      fail('Valley lifecycle loader must subscribe before app.js can publish initial cached stats');
    }
    if (!loaderSource.includes('lastStatsDetail')
      || !/addEventListener\(\s*['"]stats-updated['"]\s*,\s*rememberStats/.test(loaderSource)
      || !/effect\?\.seedStats\?\.\(lastStatsDetail\)/.test(loaderSource)
      || /dispatchEvent\(new (?:CustomEvent|Event)\(/.test(loaderSource)
      || !/seedStats\s*\(detail\)/.test(rendererSource)) {
      fail('Valley loader must privately seed the latest stats without rebroadcasting stale app events');
    }

    if (!rendererSource) {
      fail('Valley painterly renderer is missing');
    } else {
      for (const primitive of [
        [/\bfetch\s*\(/, 'fetch'],
        [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
        [/\bWebSocket\b/, 'WebSocket'],
        [/\bEventSource\b/, 'EventSource']
      ]) {
        if (primitive[0].test(rendererSource)) {
          fail(`Valley renderer must consume app events instead of starting its own ${primitive[1]} network source`);
        }
      }
      for (const eventName of ['stats-updated', 'block-pulse']) {
        if (!new RegExp(`addEventListener\\(\\s*['"]${eventName}['"]`).test(rendererSource)) {
          fail(`Valley renderer must listen for ${eventName}`);
        }
        if (!new RegExp(`removeEventListener\\(\\s*['"]${eventName}['"]`).test(rendererSource)) {
          fail(`Valley renderer cleanup must remove its ${eventName} listener`);
        }
      }
      if (!/devicePixelRatio/.test(rendererSource)
        || !/Math\.min\([\s\S]{0,120}(?:devicePixelRatio|DPR)|Math\.min\([\s\S]{0,120}DPR[\s\S]{0,120}devicePixelRatio/.test(rendererSource)) {
        fail('Valley renderer must cap device pixel ratio before sizing its canvas');
      }
      if (!/const DPR_CAP\s*=\s*1\s*;/.test(rendererSource)) {
        fail('Valley decorative raster must stay at 1x so high-DPI screens do not multiply full-viewport paint cost');
      }
      if (!/requestAnimationFrame/.test(rendererSource)
        || !/cancelAnimationFrame/.test(rendererSource)
        || !/(?:FRAME|FPS|frameInterval|lastFrame|lastPaint)/i.test(rendererSource)
        || !/(?:timestamp|time)\s*-/.test(rendererSource)) {
        fail('Valley renderer must use a cancellable, cadence-capped animation frame loop');
      }
      if (!/addEventListener\(\s*['"]visibilitychange['"]/.test(rendererSource)
        || !/removeEventListener\(\s*['"]visibilitychange['"]/.test(rendererSource)
        || !/(?:visibilityState|document\.hidden)/.test(rendererSource)) {
        fail('Valley renderer must pause while hidden and remove its visibility listener on cleanup');
      }
      if (!/valley-background-canvas/.test(rendererSource)
        || !/(?:setAttribute\(\s*['"]aria-hidden['"]\s*,\s*['"]true['"]|ariaHidden\s*=\s*['"]true['"])/.test(rendererSource)
        || !/(?:pointerEvents|pointer-events)\s*(?::|=)\s*['"]?none/.test(rendererSource)) {
        fail('Valley canvas must be decorative, aria-hidden, and click-through');
      }
      if (!/(?:function|const)\s+(?:stop|cleanup|destroy)|\bstop\s*\(/.test(rendererSource)
        || !/\.remove\(\)/.test(rendererSource)) {
        fail('Valley renderer must expose cleanup that removes its canvas');
      }
      if (!/const GRASS_DENSITY_MULTIPLIER\s*=\s*3\s*;/.test(rendererSource)
        || !/extraGrassRandom\s*=\s*seededRandom/.test(rendererSource)
        || !/grassCount\s*\*\s*\(GRASS_DENSITY_MULTIPLIER\s*-\s*1\)/.test(rendererSource)) {
        fail('Valley must triple its grass through an independently seeded meadow population');
      }
      if (!/const TREE_SWAY_RATIO\s*=\s*0\.2\s*;/.test(rendererSource)
        || !/getTreeSway\s*\(/.test(rendererSource)
        || !/grassWaveSpeed\s*\*\s*TREE_SWAY_RATIO/.test(rendererSource)
        || !/grassSwayDistance\s*\*\s*TREE_SWAY_RATIO/.test(rendererSource)
        || !/valleyTreeSwayRatio\s*=\s*TREE_SWAY_RATIO\.toFixed\(2\)/.test(rendererSource)) {
        fail('Valley trees must sway at exactly 20% of the grass wave distance and speed');
      }
      if (!/buildLandscapeGeometry\s*\(\)/.test(rendererSource)
        || !/isPointInPath\(\s*this\.pathwayPath\s*,\s*blade\.x\s*,\s*blade\.y\s*\)/.test(rendererSource)
        || /clip\(\s*this\.grassBankClip/.test(rendererSource)) {
        fail('Valley grass must exclude roots from the path without hard-clipping natural blade overhang');
      }
      if (!/drawHilltopBench\s*\(/.test(rendererSource)
        || !/valleyDestination\s*=\s*['"]hilltop-bench['"]/.test(rendererSource)
        || !/valleyBench\s*=\s*['"]three-quarter-wood['"]/.test(rendererSource)
        || !/valleyGrassProfile\s*=\s*['"]full-depth-meadow['"]/.test(rendererSource)
        || !/valleyFrontMountain\s*=\s*['"]opaque['"]/.test(rendererSource)
        || !/\{\s*color:\s*['"]#445844['"]\s*,\s*alpha:\s*1\s*,/.test(rendererSource)
        || /this\.drawLake\s*\(/.test(rendererSource)
        || /this\.drawWildfireMeadow\s*\(/.test(rendererSource)
        || !/this\.blockImpulse\s*\*\s*Math\.exp/.test(rendererSource)
        || !/earth\.addColorStop/.test(rendererSource)) {
        fail('Valley must end its earthy hill path at a three-quarter wooden bench against an opaque front mountain');
      }
      if (!/grassBankState/.test(smokeSource)
        || !/destination\s*===\s*['"]hilltop-bench['"]/.test(smokeSource)
        || !/bench\s*===\s*['"]three-quarter-wood['"]/.test(smokeSource)
        || !/grassProfile\s*===\s*['"]full-depth-meadow['"]/.test(smokeSource)
        || !/frontMountain\s*===\s*['"]opaque['"]/.test(smokeSource)
        || !/treeSwayRatio\s*===\s*0\.2/.test(smokeSource)
        || !/Math\.abs\(state\.treeSwayDistanceRatio\s*-\s*0\.2\)\s*<\s*0\.000001/.test(smokeSource)
        || !/farGrassCount\s*>\s*state\.expectedCandidates\s*\*\s*0\.18/.test(smokeSource)
        || !/midGrassCount\s*>\s*state\.expectedCandidates\s*\*\s*0\.15/.test(smokeSource)
        || !/rootsOnPath\s*===\s*0/.test(smokeSource)
        || !/pathTouchesBench\s*===\s*true/.test(smokeSource)
        || !/pathwayEdgeChangedSamples\s*>\s*0/.test(smokeSource)
        || !/expectedCandidates:\s*3750/.test(smokeSource)
        || !/expectedCandidates:\s*1440/.test(smokeSource)
        || !/expectedCandidates:\s*2340/.test(smokeSource)) {
        fail('Valley smoke must prove full-depth grass, a grounded hilltop destination, path-root exclusion, and natural overhang');
      }
    }

    const valleyBlock = stylesSource.match(/\[data-theme=["']valley["']\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
    const fallbackBlock = stylesSource.match(/body\[data-theme=["']valley["']\]::before\s*\{([\s\S]*?)\n\}/)?.[1] || '';
    for (const token of ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--text-primary', '--text-tertiary', '--text-muted']) {
      if (!new RegExp(`${token}\\s*:`).test(valleyBlock)) fail(`Valley palette is missing ${token}`);
    }
    if (!/background\s*:/.test(fallbackBlock) || !/(?:linear|radial)-gradient/.test(fallbackBlock)) {
      fail('Valley needs a static CSS landscape fallback when canvas motion is unavailable');
    }
    if (!valleyBundle || !valleyMinBundle) {
      fail('Valley source and minified lazy CSS bundles must both be generated');
    } else if (!/valley/.test(valleyBundle) || !/valley/.test(valleyMinBundle)
      || !/::before/.test(valleyBundle) || !/::before/.test(valleyMinBundle)) {
      fail('Valley lazy CSS bundles must retain the static fallback');
    }
    for (const selector of ['[data-theme="valley"] .visit-streak-toast', '[data-theme="valley"] .comparison-col-tezos']) {
      if (!stylesSource.includes(selector)) fail(`Valley component coverage is missing ${selector}`);
    }
    if (!landingSource.includes('15 Themes') || /14 Themes|14 themes/.test(landingSource)
      || /'14 themes'/.test(smokeSource)
      || !/theme-row['"]\s*,\s*15/.test(smokeSource)) {
      fail('Valley must update landing and browser checks from 14 to the canonical 15-theme catalog');
    }

    const variables = Object.fromEntries(
      Array.from(valleyBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi), (match) => [match[1], match[2].trim()])
    );
    const resolveVariable = (value, depth = 0) => {
      const variable = String(value || '').match(/^var\((--[a-z0-9-]+)\)$/i)?.[1];
      if (!variable || depth > 4) return value;
      return resolveVariable(variables[variable], depth + 1);
    };
    const normalizeHex = (value) => /^#[0-9a-f]{3}$/i.test(value || '')
      ? `#${value.slice(1).split('').map((character) => character.repeat(2)).join('')}`
      : value;
    const luminance = (hex) => {
      const channels = hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255);
      const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
    };
    const contrastRatio = (left, right) => {
      const light = Math.max(luminance(left), luminance(right));
      const dark = Math.min(luminance(left), luminance(right));
      return (light + 0.05) / (dark + 0.05);
    };
    for (const textToken of ['--text-tertiary', '--text-muted']) {
      const textColor = normalizeHex(resolveVariable(variables[textToken]));
      for (const backgroundToken of ['--bg-primary', '--bg-secondary', '--bg-tertiary']) {
        const backgroundColor = normalizeHex(resolveVariable(variables[backgroundToken]));
        if (!/^#[0-9a-f]{6}$/i.test(textColor || '') || !/^#[0-9a-f]{6}$/i.test(backgroundColor || '')) {
          fail(`Valley contrast contract could not resolve ${textToken} on ${backgroundToken}`);
          continue;
        }
        const ratio = contrastRatio(textColor, backgroundColor);
        if (ratio < 4.5) {
          fail(`Valley ${textToken} contrast is ${ratio.toFixed(2)}:1 on ${backgroundToken}; small text needs at least 4.5:1`);
        }
      }
    }

    if (!smokeSource.includes("name: 'valley-theme'")) {
      fail('smoke catalog must include the focused Valley lifecycle suite');
    }
    pass('Valley registry, bank density, grounded pathway, destination, lazy renderer, lifecycle, accessibility, fallback, and contrast contracts checked');
  }

  return { checkStylesheetFreshness, checkAuroraDesktopTitleTreatment, checkValleyThemeContracts };
}
