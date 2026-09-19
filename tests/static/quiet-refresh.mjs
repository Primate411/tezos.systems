// Static contracts owned by quiet-refresh. Shared dependencies remain explicit.
export function createQuietRefreshStaticChecks({
  assert,
  fail,
  pass,
  readText
}) {
  async function checkLiveNumberMotionContracts() {
    const [magic, animations, app, smoke, styles, ledgerFlowCss, tezosDomainsCss] = await Promise.all([
      readText('js/effects/data-magic.js'),
      readText('js/ui/animations.js'),
      readText('js/core/app.js'),
      readText('tests/smoke.mjs'),
      readText('css/styles.css'),
      readText('css/ledger-flow.css'),
      readText('css/tezos-domains.css')
    ]);

    const expectedThemeModes = {
      aurora: 'resolve',
      matrix: 'scramble',
      hen: 'scramble',
      default: 'focus',
      void: 'focus',
      ember: 'kindle',
      signal: 'sweep',
      nerv: 'scramble',
      clean: 'delta',
      dark: 'focus',
      bubblegum: 'scramble',
      abyss: 'sonar',
      moss: 'growth',
      valley: 'growth',
      warzone: 'lock'
    };
    for (const [theme, mode] of Object.entries(expectedThemeModes)) {
      const personality = new RegExp(`\\b${theme}:\\s*\\{[^}]*\\bmode:\\s*['"]${mode}['"]`, 's');
      if (!personality.test(magic)) fail(`live number motion must retain the explicit ${theme} → ${mode} personality`);
    }

    for (const hook of ['window.__DATA_MAGIC_TEST__', 'flushAmbientForTest']) {
      if (!magic.includes(hook)) fail(`live number motion deterministic browser hook missing ${hook}`);
    }

    for (const rule of [
      '.dm-glyph-word{display:inline-block!important;white-space:nowrap!important}',
      '.dm-delta-char{display:inline-block!important;',
      '.dm-mycelial-char{display:inline-block!important;',
      '.dm-lock-char{display:inline-block!important;'
    ]) {
      if (!magic.includes(rule)) fail(`character reveal geometry guard missing ${rule}`);
    }
    const directMetricSelectors = [
      ['Tezos X launcher', styles, '.tezlink-entry-metric > span'],
      ['shared Chamber launcher', styles, '.chamber-entry-metric > span'],
      ['governance now card', styles, '.chamber-now-card > span'],
      ['governance watch card', styles, '.chamber-now-watch > div > span'],
      ['ctez console', styles, '.ctez-console-metric > span'],
      ['shared room metric grid', styles, '.lb-metric-grid > div > span'],
      ['Ledger Flow launcher', ledgerFlowCss, '.ledger-flow-entry-metrics .chamber-entry-metric > span'],
      ['Tezos Domains launcher', tezosDomainsCss, '.td-entry-metric > span'],
      ['Tezos Domains room pulse', tezosDomainsCss, '.td-pulse-metric > span']
    ];
    for (const [label, source, selector] of directMetricSelectors) {
      if (!source.includes(selector)) fail(`${label} labels must target direct children so reveal glyphs keep settled geometry`);
    }
    const broadGlyphSelectors = [
      ['Tezos X launcher', styles, /\.tezlink-entry-metric\s+(?!>)span\b/],
      ['shared Chamber launcher', styles, /\.chamber-entry-metric\s+(?!>)span\b/],
      ['governance now card', styles, /\.chamber-now-card\s+(?!>)span\b/],
      ['governance watch card', styles, /\.chamber-now-watch\s+(?!>)span\b/],
      ['ctez console', styles, /\.ctez-console-metric\s+(?!>)span\b/],
      ['shared room metric grid', styles, /\.lb-metric-grid\s+(?!>)span\b/],
      ['Ledger Flow launcher', ledgerFlowCss, /\.ledger-flow-entry-metrics\s+\.chamber-entry-metric\s+(?!>)span\b/],
      ['Tezos Domains launcher', tezosDomainsCss, /\.td-entry-metric\s+(?!>)span\b/],
      ['Tezos Domains room pulse', tezosDomainsCss, /\.td-pulse-metric\s+(?!>)span\b/]
    ];
    for (const [label, source, selector] of broadGlyphSelectors) {
      if (selector.test(source)) fail(`${label} regained a descendant span selector that can stack temporary reveal glyphs vertically`);
    }

    const setterStart = magic.indexOf('export function setMagicNumber');
    const setterEnd = magic.indexOf('/**\n * One-shot accent shimmer', setterStart);
    const setter = magic.slice(setterStart, setterEnd);
    if (setterStart < 0 || setterEnd < 0) {
      fail('live number motion setter contract could not be located');
    } else {
      if (!/previousText\s*===\s*text/.test(setter) || !/return false;/.test(setter)) {
        fail('live number setter must make exact text equality authoritative and skip unchanged animation');
      }
      if (/queueVisibleMagic\(/.test(setter)) {
        fail('hidden/offscreen live-number changes must commit silently, never queue an old reveal for later');
      }
      if (
        !/if\s*\(unchanged\)\s*\{[\s\S]*?opts\.animate\s*===\s*false[\s\S]*?settleMagicText\(el,\s*text/.test(setter)
      ) {
        fail('explicit animate:false must settle and cancel an equal in-flight target inside the unchanged branch');
      }
      for (const token of ['aria-label', 'aria-busy']) {
        if (!setter.includes(token) && !magic.includes(token)) {
          fail(`live number animation must shield intermediate glyph frames with a stable ${token}`);
        }
      }
    }

    const ambientStart = magic.indexOf('function ambientTick');
    const ambientEnd = magic.indexOf('function scheduleAmbient', ambientStart);
    const ambient = magic.slice(ambientStart, ambientEnd);
    if (ambientStart < 0 || ambientEnd < 0) {
      fail('live number ambient contract could not be located');
    } else {
      const textRevealCalls = [
        'scrambleText(',
        'auroraResolve(',
        'kindleReveal(',
        'sweepLockReveal(',
        'deltaTickReveal(',
        'sonarEchoReveal(',
        'mycelialBloomReveal(',
        'targetLockReveal(',
        'focusReveal(',
        'revealValue(',
        'setMagicNumber('
      ];
      if (textRevealCalls.some((call) => ambient.includes(call)) || /textContent\s*=/.test(ambient)) {
        fail('ambient personality may decorate a stable value but must never mutate unchanged text');
      }
      if (!ambient.includes('pulseFresh(')) {
        fail('ambient live-number personality must retain a decorative non-text freshness pulse');
      }
    }

    const viewportStart = magic.indexOf('function inViewport');
    const viewportEnd = magic.indexOf('function isLeafMagicNumberCandidate', viewportStart);
    const viewport = magic.slice(viewportStart, viewportEnd);
    if (!/rect\.right\s*<=\s*0/.test(viewport) || !/rect\.left\s*>=\s*window\.innerWidth/.test(viewport)) {
      fail('live number viewport gate must treat horizontally clipped values as offscreen');
    }

    const mutationStart = magic.indexOf('function onMagicMutations');
    const mutationEnd = magic.indexOf('export function observeMagic', mutationStart);
    const mutation = magic.slice(mutationStart, mutationEnd);
    if (!mutation.includes('__dmMagicFinalText')) {
      fail('offscreen external number mutations must update the adopted final text without queuing a reveal');
    }
    const settleStart = magic.indexOf('function settleMagicText');
    const settleEnd = magic.indexOf('function applyFlair', settleStart);
    const settle = magic.slice(settleStart, settleEnd);
    if (!mutation.includes('settleMagicText(el, text') || !settle.includes('cancelMagic(el, { completeOwner })')) {
      fail('a newer offscreen external number must cancel any visible reveal already in flight');
    }
    if (
      !setter.includes('if (!opts.observer) el.__dmExplicitMagic = true')
      || !mutation.includes('if (el.__dmExplicitMagic)')
      || mutation.includes('setTimeout(reveal')
    ) {
      fail('explicit live-number setters and observer-managed legacy text must retain one writer per node');
    }
    if (
      !/if\s*\(el\.matches\(MAGIC_EXCLUDE\)\)\s*\{[\s\S]*?settleMagicText\(el,\s*text/.test(mutation)
    ) {
      fail('external loading or error text must cancel an older numeric animation before excluded targets are skipped');
    }
    for (const token of [
      'export function setMagicValue',
      'allowText: true',
      'completeOwner: true',
      '__dmMagicCancel',
      'force: true'
    ]) {
      if (!magic.includes(token)) fail(`generic live-value ownership contract missing ${token}`);
    }

    for (const token of [
      'selectionIntersects(el)',
      'captureTargetSelection(el)',
      'restoreTargetSelection(el, selection)',
      "document.addEventListener('selectionchange', guardSelectedMagic)"
    ]) {
      if (!magic.includes(token)) fail(`live number selection-preservation contract missing ${token}`);
    }
    for (const token of [
      'clippingValues',
      'ancestor.clientWidth',
      'ancestor.clientHeight',
      'visibleRight <= visibleLeft',
      'visibleBottom <= visibleTop'
    ]) {
      if (!viewport.includes(token)) fail(`live number overflow-clipping contract missing ${token}`);
    }

    for (const token of [
      'setMagicValue(frontValue, finalStr',
      'animateInitial: true',
      'sameActiveTarget',
      'sameSettledTarget',
      'cancelFresh(statFreshSurface(frontValue))'
    ]) {
      if (!animations.includes(token)) fail(`stat-card stale reveal ownership contract missing ${token}`);
    }
    const instantWriteStart = animations.indexOf('function writeStatInstant');
    const instantWriteEnd = animations.indexOf('/**', instantWriteStart);
    const instantWrite = animations.slice(instantWriteStart, instantWriteEnd);
    if (
      !instantWrite.includes('cancelFresh(statFreshSurface(element))')
      || !instantWrite.includes('setMagicValue(element, String(text)')
      || !instantWrite.includes('animate: false')
    ) {
      fail('an instant stat write must cancel active motion and freshness even when its formatted text is unchanged');
    }
    if (/await\s+flipCard\(/.test(app)) {
      fail('background card deltas must not await independent animations sequentially');
    }

    for (const snippet of [
      "name: 'live-number-motion'",
      'smokeLiveNumberShellMotion(browser, baseUrl, issues)',
      "observerValue.textContent = '82%'",
      "movingValue.textContent = '301'",
      'motion.statusRecovery.started',
      'motion.sameValueRace.active.flipStarted === false',
      'const characterLayoutFamilies =',
      "clean: '.dm-delta-char'",
      "moss: '.dm-mycelial-char'",
      "valley: '.dm-mycelial-char'",
      "warzone: '.dm-lock-char'",
      'family.rootHeightDelta <= 1',
      "result.readingState.selection === 'Selected reader text stays put'"
    ]) {
      if (!smoke.includes(snippet)) fail(`live number browser regression contract missing: ${snippet}`);
    }

    pass('live number exact-delta, settled Chamber geometry, view-state, stale-work, concurrency, selection, clipping, visibility, cancellation, accessibility, reduced-motion, ambient, and theme contracts checked');
  }

  async function checkQuietRefreshContracts() {
    const [quiet, app, daily, pulseTicker, myTezos, myBaker, tezlink, capital, minerals, uranium, metals, ecosystem, etherlink, domains, tz4, whales, giants, hen, health, lb, styles, smoke] = await Promise.all([
      readText('js/core/quiet-refresh.js'),
      readText('js/core/app.js'),
      readText('js/features/daily-briefing.js'),
      readText('js/ui/pulse-ticker.js'),
      readText('js/features/my-tezos.js'),
      readText('js/features/my-baker.js'),
      readText('js/features/tezlink.js'),
      readText('js/features/capital-chamber.js'),
      readText('js/features/minerals-chamber.js'),
      readText('js/features/uranium-chamber.js'),
      readText('js/features/metals-chamber.js'),
      readText('js/features/ecosystem-chamber.js'),
      readText('js/features/etherlink-governance.js'),
      readText('js/features/tezos-domains.js'),
      readText('js/features/tz4-adoption.js'),
      readText('js/features/whales.js'),
      readText('js/features/sleeping-giants.js'),
      readText('js/features/hen-mode.js'),
      readText('js/features/network-health.js'),
      readText('js/features/liquidity-baking.js'),
      readText('css/styles.css'),
      readText('tests/smoke.mjs')
    ]);

    const requiredQuietHelpers = ['quietlyMutate', 'quietlySyncHtml', 'quietlySyncElement', 'captureSelection', 'captureViewportAnchor'];
    for (const helper of requiredQuietHelpers) {
      if (!quiet.includes(helper)) fail(`quiet refresh helper missing ${helper}`);
    }
    assert.match(quiet, /getComputedStyle\(ancestor\)\.position === 'fixed'\) return null/, 'Fixed Chamber rows never anchor the underlying page');
    for (const snippet of [
      'data-pulse-motion',
      'capturePhase',
      'restorePhase',
      'window.requestAnimationFrame',
      "matchMedia('(prefers-reduced-motion: reduce)')",
      'IntersectionObserver'
    ]) {
      if (!pulseTicker.includes(snippet)) fail(`Live Pulse ticker motion contract is missing ${snippet}`);
    }
    if ((pulseTicker.match(/requestAnimationFrame/g) || []).length !== 1 || /scrollLeft\s*[+-]?=/.test(pulseTicker)) {
      fail('Live Pulse ticker must use one frame-synchronized phase restore while drifting through one CSS animation, not a scripted loop');
    }
    if (!pulseTicker.includes('quietlySyncHtml(viewport, tickerHtml)')) fail('Live Pulse background signals must reconcile inside the stable ticker viewport');
    if (!daily.includes('quietlySyncHtml(container, html)')) fail('My Tezos network context must reconcile in place after its first render');
    if ((app.match(/document\.visibilityState === 'visible'\) refreshInBackground/g) || []).length < 2) {
      fail('headline and heavy dashboard timers must both defer while the tab is hidden');
    }
    const quietSurfaces = [myTezos, myBaker, tezlink, capital, minerals, uranium, metals, ecosystem, etherlink, domains, tz4, whales, giants, health, lb];
    if (quietSurfaces.some((source) => !source.includes('quiet-refresh.js'))) {
      fail('every audited live surface must import the shared quiet refresh contract');
    }
    const mintInsertStart = hen.indexOf('// Reverse so newest ends up at top');
    const mintInsertEnd = hen.indexOf('offset += fresh.length', mintInsertStart);
    const mintInsert = hen.slice(mintInsertStart, mintInsertEnd);
    if (!/feed\.scrollTop\s*=\s*previousScrollTop\s*\+\s*\(feed\.scrollHeight\s*-\s*previousScrollHeight\)/.test(mintInsert)
      || /feed\.scrollTo\(/.test(mintInsert)) {
      fail('HEN new mints must preserve the existing feed viewport at every scroll position');
    }
    const quietStyles = `${styles}\n${await readText('css/shell-extras.css')}`;
    if (!quietStyles.includes('[data-quiet-refreshing="true"]') || !quietStyles.includes('[data-quiet-refresh-settled="true"]')) {
      fail('quiet refresh CSS must suppress scroll animation and replayed entrances');
    }
    for (const snippet of ['drawer-live-columns', 'drawer-live-column-primary', 'columns.appendChild(network)', 'seedDrawerLoadingState', 'drawerLoadingCard']) {
      if (!myTezos.includes(snippet)) fail(`My Tezos stable loading/layout contract is missing ${snippet}`);
    }
    for (const snippet of ['.drawer-live-columns', '.drawer-live-columns > #drawer-network', '.network-context-columns', '@container (min-width: 720px)', '.drawer-loading-card', '.my-baker-loading-grid', '.my-baker-load-state']) {
      if (!styles.includes(snippet)) fail(`My Tezos stable loading/layout CSS is missing ${snippet}`);
    }
    if (!myBaker.includes('my-baker-loading-stat') || !myBaker.includes('Retry account stats')) {
      fail('My Baker first-load geometry and recoverable error state are missing');
    }
    if (!smoke.includes('first account read did not hold a shape-correct two-column frame')
      || !smoke.includes('full-width account journeys or independent stacks regressed')) {
      fail('My Tezos loading geometry regression coverage is missing');
    }
    if (!smoke.includes("name: 'quiet-refresh'")) fail('smoke catalog must include the quiet-refresh browsing-state suite');
    pass('quiet background refresh scroll, focus, selection, animation, and hidden-tab contracts checked');
  }

  return { checkLiveNumberMotionContracts, checkQuietRefreshContracts };
}
