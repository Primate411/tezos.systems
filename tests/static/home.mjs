// Static contracts owned by home. Shared dependencies remain explicit.
export function createHomeStaticChecks({
  CHAMBER_ROUTES,
  CSS_TARGETS,
  ETHERLINK_ROLLUP_ADDRESS,
  assert,
  buildQuietBakerNotice,
  classifyBlockStory,
  compileBlockStoryCatalog,
  fail,
  pass,
  pathExists,
  readText,
  standaloneFeatureForRoute
}) {
  async function checkHomeLayoutContracts() {
    const [index, preload, layout, app, search, briefing, tour, handoff, styles, smoke, readme, changelog] = await Promise.all([
      readText('index.html'),
      readText('js/core/home-layout-preload.js'),
      readText('js/ui/home-layout.js'),
      readText('js/core/app.js'),
      readText('js/features/search.js'),
      readText('js/features/daily-briefing.js'),
      readText('js/features/tooltip-tour.js'),
      readText('js/core/site-handoff.js'),
      readText('css/shell-extras.css'),
      readText('tests/smoke.mjs'),
      readText('README.md'),
      readText('js/features/changelog.js')
    ]);
    const pulseTicker = await readText('js/ui/pulse-ticker.js');
    const tickerCss = await readText('css/shell-extras.css');
    const expectedIds = ['live-head', 'live-pulse', 'explore', 'moments', 'handoff', 'credits'];
    const registryIds = [...layout.matchAll(/Object\.freeze\(\{ id: '([^']+)'/g)].map((match) => match[1]);
    if (JSON.stringify(registryIds) !== JSON.stringify(expectedIds)) {
      fail(`Home layout registry must contain exactly the six ordered blocks: ${JSON.stringify(registryIds)}`);
    }
    for (const source of [preload, layout]) {
      if (!source.includes('tezos-systems-home-layout-v1') || !source.includes('version: 1') || !source.includes('hidden')) {
        fail('Home layout preload and manager must share the version 1 hidden-ID storage contract');
        break;
      }
    }
    const preloadIndex = index.indexOf('js/core/home-layout-preload.js');
    const pulseTickerIndex = index.indexOf('id="pulse-ticker-strip"');
    const liveHeadIndex = index.indexOf('id="live-head"');
    if (preloadIndex < 0 || pulseTickerIndex < 0 || liveHeadIndex < 0 || preloadIndex > pulseTickerIndex || pulseTickerIndex > liveHeadIndex
        || !styles.includes('[data-home-hidden~="live-pulse"] #pulse-ticker-strip')
        || !styles.includes('[data-home-hidden~="live-head"] #live-head')) {
      fail('Home layout first-paint preload must run before managed content and own CSS hiding from the root token');
    }
    if (!pulseTicker.includes('data-pulse-run="echo"')
        || !pulseTicker.includes('aria-hidden="true">${echoHtml}</div>')
        || pulseTicker.includes('aria-hidden="true" inert>${echoHtml}</div>')
        || !pulseTicker.includes("const PULSE_ITEM_SELECTOR = '[data-hot-signal-id], [data-pulse-echo-of]';")
        || !tickerCss.includes('.pulse-ticker-shelf{')
        || !tickerCss.includes('position: absolute;')) {
      fail('Live Pulse echo must remain AT-hidden but pointer-interactive while its detail shelf overlays without changing page flow');
    }
    const pulseInfoIndex = index.indexOf('id="hot-today-info-btn"', pulseTickerIndex);
    const pulseHideIndex = index.indexOf('class="home-block-hide home-block-hide-compact pulse-ticker-hide"', pulseInfoIndex);
    const pulseBarEnd = index.indexOf('</div>', pulseHideIndex);
    if (pulseInfoIndex < 0 || pulseHideIndex < pulseInfoIndex || pulseBarEnd < pulseHideIndex
        || !tickerCss.includes('grid-template-columns: minmax(0, 1fr) auto auto auto;')
        || !tickerCss.includes('.pulse-ticker-bar .pulse-ticker-hide{')
        || !tickerCss.includes('width: 26px;')
        || index.includes('id="pulse-ticker-dot"')
        || index.includes('class="chain-heartbeat-eyebrow pulse-ticker-kicker"')
        || index.includes('class="hot-today-clock-dot"')
        || !/\.pulse-ticker-bar\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/.test(tickerCss)) {
      fail('Live Pulse must sit directly on the site background and keep its compact Hide control immediately after the info control inside the bar');
    }
    if (!app.includes("closest('.section-header, .pulse-ticker-strip')")
        || briefing.includes('Latest signal')
        || !smoke.includes("name: 'live-pulse-ticker'")) {
      fail('Live Pulse must keep its concise age clock, working anchored explainer, and focused ticker browser regression');
    }
    const liveHeadHideIndex = index.indexOf('class="home-block-hide home-block-hide-compact live-head-hide"', liveHeadIndex);
    if (liveHeadHideIndex < liveHeadIndex || !index.includes('data-home-hide="live-head"')) {
      fail('Live Head must keep one compact Hide eye inside the combined card');
    }
    if (!preload.includes('tezos-systems-live-head-depth-v1')
        || !index.includes('id="live-head-depth-setting"')
        || !index.includes('id="live-head-depth-toggle"')) {
      fail('Live Head depth preference must preload and remain available from both the card corner and Setup');
    }
    for (const id of expectedIds) {
      if (!index.includes(`data-home-block="${id}"`) || !index.includes(`data-home-layout-toggle="${id}"`)) {
        fail(`Home layout HTML is missing the managed block and switch for ${id}`);
      }
    }
    for (const id of ['live-head', 'live-pulse', 'explore', 'moments']) {
      if (!index.includes(`data-home-hide="${id}"`)) fail(`Home layout inline Hide action missing for ${id}`);
    }
    if (!handoff.includes('data-home-hide="handoff"')) fail('Keep Exploring must render its inline Hide action');
    if (!index.includes('data-home-hide="credits"') || !index.includes('class="footer-last-line"')) fail('Credits must render its Hide action on the final build line');
    for (const legacyKey of [
      'tezos-systems-chambers-visible',
      'tezos-systems-collapsed-pulse-ticker',
      'tezos-systems-collapsed-chambers-section',
      'tezos-systems-collapsed-moments-section'
    ]) {
      if (!preload.includes(legacyKey) || !layout.includes(legacyKey)) fail(`Home layout migration is missing ${legacyKey}`);
    }
    if (!app.includes("if (section.hasAttribute('data-home-block')) return;")
      || index.includes('data-section-collapse aria-expanded="true" aria-controls="pulse-ticker-viewport"')
      || index.includes('data-section-collapse aria-expanded="true" aria-controls="chambers-grid"')) {
      fail('Managed Home blocks must be excluded from legacy collapse wiring');
    }
    for (const snippet of [
      "setHomeBlockVisible('explore', !isHomeBlockVisible('explore'), 'explore-menu')",
      "setHomeBlockVisible('live-pulse', true, 'deep-link')",
      "setHomeBlockVisible('live-head', true, 'deep-link')",
      "setHomeBlockVisible('handoff', true, 'deep-link')"
    ]) {
      if (!app.includes(snippet)) fail(`Home layout navigation integration missing: ${snippet}`);
    }
    if (!search.includes("setHomeBlockVisible('live-head', true, 'search-shortcut')")) fail('The / shortcut must reveal and save Live Head');
    if (!preload.includes("saved.hidden.indexOf('ticker')") || !preload.includes("saved.hidden.indexOf('search')")
        || !layout.includes("value.hidden.includes('ticker')") || !layout.includes("value.hidden.includes('search')")) {
      fail('Home layout must migrate the retired ticker/search pair without discarding partial or unknown preferences');
    }
    if (!tour.includes("beginPreview?.('guided-tour')") || !tour.includes("endPreview?.('guided-tour')")) fail('Guided tour must temporarily reveal and restore the saved Home layout');
    for (const snippet of ['hotTodaySurfaceVisible()', 'stopHotTodaySurfaceTimers()', "event.detail?.id === 'live-pulse'", 'hotTodayQuietRestore']) {
      if (!briefing.includes(snippet)) fail(`Live Pulse hidden/quiet restoration contract missing: ${snippet}`);
    }
    for (const recovery of ['id="settings-gear"', 'id="my-tezos-btn"']) {
      if (!index.includes(recovery)) fail(`Permanent Home recovery surface missing: ${recovery}`);
    }
    for (const footerContract of ['id="site-footer"', '>Source</a>', '>MPL-2.0</a>', 'data-home-block="credits"']) {
      if (!index.includes(footerContract)) fail(`Managed credits or legal surface missing: ${footerContract}`);
    }
    if (!styles.includes('@media (max-width: 600px)')
      || !styles.includes('min-height: 44px')
      || !styles.includes('@media (prefers-reduced-motion: reduce)')
      || !styles.includes('@media (forced-colors: active)')) {
      fail('Home layout must retain mobile touch, reduced-motion, and forced-color CSS contracts');
    }
    for (const route of CHAMBER_ROUTES) {
      const routeHtml = await readText(`${route.slug}/index.html`);
      if (standaloneFeatureForRoute(route.slug)) continue;
      if (!routeHtml.includes('/js/core/home-layout-preload.js') || !routeHtml.includes('id="home-layout-modal"')) {
        fail(`Generated route ${route.slug}/ is missing Home layout recovery controls`);
        break;
      }
    }
    if (!smoke.includes("name: 'home-layout'") || !smoke.includes('async function smokeHomeLayout')) fail('Focused home-layout browser suite is missing');
    if (!readme.includes('Customize home') || !readme.includes('tezos-systems-home-layout-v1')) fail('README must document the device-local Home layout contract');
    if (!changelog.includes('Customize home')) fail('User-facing changelog must mention Customize home');
    pass('device-local six-block Home layout, recovery, migration, route, tour, and Live Pulse contracts checked');
  }

  function checkLiveHeadPureContracts() {
    const knownLanes = {
      transactions: [],
      stakingRows: [],
      l1VotingRows: [],
      l2VotingRows: [],
      tokenTransfers: [],
      managerOperations: [],
      evidenceRows: [],
      milestoneRows: []
    };
    const catalog = compileBlockStoryCatalog({
      apps: [
        {
          id: 'reviewed-defi',
          category: 'defi',
          layers: [{ id: 'tezos', contractSource: { aliasPatterns: ['^Reviewed DEX$'] }, proofUrls: [] }]
        },
        {
          id: 'tezos-domains',
          category: 'identity',
          layers: [{ id: 'tezos', contractSource: { addresses: ['KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton'] }, proofUrls: [] }]
        }
      ]
    });
    const l2Vote = {
      id: 81,
      amount: 0,
      internal: false,
      sender: { address: 'tz1GovernanceVoter1111111111111111111' },
      target: { address: 'KT19oUVQPnVLuUBYXrBVd46WJnNAMpqkKSwo', alias: 'Etherlink FAST governance' },
      parameter: { entrypoint: 'vote', value: 'yea' }
    };
    const governance = classifyBlockStory({
      ...knownLanes,
      transactions: [
        l2Vote,
        { id: 82, amount: 12000000, internal: false, target: { address: 'tz1Recipient111111111111111111111111' } }
      ],
      stakingRows: [],
      l1VotingRows: [
        { id: 71, delegate: { address: 'tz1LayerOneVoter11111111111111111111' }, vote: 'yay' },
        { id: 72, delegate: { address: 'tz1LayerOneProposer1111111111111111' } }
      ],
      l2VotingRows: [l2Vote],
      maxFragments: 30
    });
    assert.deepEqual(governance.fragments.map(({ key }) => key), ['l1-vote', 'l2-vote', 'transfers']);
    assert.equal(governance.text, 'L1: Vote · 2 · L2: Vote · 1 · Transfers · 1');
    assert.equal(governance.fragments.filter(({ key }) => key === 'transfers').length, 1);

    const mixed = classifyBlockStory({
      ...knownLanes,
      catalog,
      managerOperations: [{ kind: 'smart_rollup_publish', rollup: ETHERLINK_ROLLUP_ADDRESS }],
      transactions: [
        { amount: 1000000, internal: false, target: { address: 'KT1JNNMMGyNNy36Zo6pcgRTMLUZyqRrttMZ4', alias: 'Reviewed DEX' } },
        { amount: 2000000, internal: false, target: { address: 'sr1UndWm3nAcuLY4RDcNBpRZgaMRDuRdu9D6', alias: '' } },
        { amount: 3000000, internal: false, target: { address: 'KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w', alias: 'Unknown app' } },
        { amount: 0, internal: false, target: { address: 'KT1UnknownCall111111111111111111111111' }, parameter: { entrypoint: 'mint' } },
        { amount: 4000000, internal: true, target: { address: 'KT1JNNMMGyNNy36Zo6pcgRTMLUZyqRrttMZ4', alias: 'Reviewed DEX' } }
      ],
      maxFragments: 30
    });
    assert.deepEqual(mixed.fragments.map(({ key }) => key), ['etherlink', 'defi', 'transfers', 'calls']);
    assert.equal(mixed.fragments.find(({ key }) => key === 'transfers').value, 2, 'a generic sr1 transfer must not be called Etherlink');
    assert(!mixed.text.includes('Oracle') && !mixed.text.includes('· 0'));

    const staking = classifyBlockStory({
      ...knownLanes,
      stakingRows: [
        { action: 'stake', amount: 12400000000 },
        { action: 'unstake', amount: 800000000 }
      ]
    });
    assert.equal(staking.text, 'Stake · 1 · Unstake · 1');
    assert.equal(staking.fragments[0].details[0], 'Stake · 1 · 12,400 ꜩ');
    assert.equal(staking.fragments[1].details[0], 'Unstake · 1 · 800 ꜩ');

    const artCatalog = compileBlockStoryCatalog({
      apps: [{
        id: 'reviewed-art',
        category: 'nft',
        layers: [{ id: 'tezos', contractSource: { addresses: ['KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w'] }, proofUrls: [] }]
      }]
    });
    const art = classifyBlockStory({
      ...knownLanes,
      catalog: artCatalog,
      transactions: [{ id: 91, amount: 0, internal: false, target: { address: 'KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w' } }],
      tokenTransfers: [
        { transactionId: 91, name: 'arachno trip' },
        { transactionId: 91, name: 'Undoing' },
        { transactionId: 92, symbol: 'USDt', name: 'Tether USD' }
      ],
      maxFragments: 30
    });
    assert.equal(art.text, 'Art · 2 · Tokens · 1');
    assert.deepEqual(art.fragments[0].details, [
      'Art · 2 · arachno trip · +1',
      'Art · 2 · arachno trip · Undoing'
    ]);
    assert.deepEqual(art.fragments[1].details, ['Tokens · 1 · USDt']);

    const domains = classifyBlockStory({
      ...knownLanes,
      catalog,
      transactions: [{ id: 93, amount: 0, internal: false, target: { address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton' }, parameter: { entrypoint: 'update_operators' } }],
      maxFragments: 30
    });
    assert.equal(domains.text, 'Domains · 1');

    const chainEvents = classifyBlockStory({
      ...knownLanes,
      managerOperations: [
        { kind: 'smart_rollup_publish', rollup: ETHERLINK_ROLLUP_ADDRESS },
        { kind: 'smart_rollup_publish', rollup: ETHERLINK_ROLLUP_ADDRESS },
        { kind: 'smart_rollup_cement', rollup: ETHERLINK_ROLLUP_ADDRESS },
        { kind: 'smart_rollup_publish', rollup: 'sr1UndWm3nAcuLY4RDcNBpRZgaMRDuRdu9D6' },
        { kind: 'dal_publish_commitment', slotIndex: 8 },
        { kind: 'delegation', source: 'tz1DelegateSource11111111111111111111', delegate: 'tz1DelegateTarget11111111111111111111' },
        { kind: 'origination', result: { originated_contracts: ['KT1Originated11111111111111111111111'] } },
        { kind: 'update_companion_key' },
        { kind: 'set_delegate_parameters' }
      ],
      evidenceRows: [
        { kind: 'double_baking_evidence' },
        { kind: 'drain_delegate' }
      ],
      milestoneRows: [
        { kind: 'cycle', cycle: 1337 },
        { kind: 'protocol', name: 'Ushuaia' },
        { kind: 'voting', period: 'proposal' }
      ],
      maxFragments: 30
    });
    assert.deepEqual(chainEvents.fragments.map(({ key }) => key), [
      'evidence', 'milestone', 'baker', 'etherlink', 'dal', 'delegate', 'contract'
    ]);
    assert(chainEvents.fragments.slice(0, 3).every(({ mandatory }) => mandatory === true));
    assert.deepEqual(chainEvents.fragments.find(({ key }) => key === 'etherlink').details, [
      'TEZOS X · 3 · publish 2 · +1',
      'TEZOS X · 3 · publish 2 · cement'
    ]);
    assert.equal(chainEvents.fragments.find(({ key }) => key === 'dal').details.at(-1), 'DAL · 1 · slot 8');
    assert.equal(chainEvents.fragments.find(({ key }) => key === 'delegate').details.at(-1), 'Delegate · 1 · new');

    const delegationSemantics = classifyBlockStory({
      ...knownLanes,
      managerOperations: [{ kind: 'delegation' }],
      delegationRows: [
        { sender: { address: 'tz1Self' }, newDelegate: { address: 'tz1Self' } },
        { sender: { address: 'tz1A' }, newDelegate: { address: 'tz1B' } },
        { sender: { address: 'tz1A' }, prevDelegate: { address: 'tz1B' }, newDelegate: { address: 'tz1C' } },
        { sender: { address: 'tz1A' }, prevDelegate: { address: 'tz1C' }, newDelegate: null }
      ],
      maxFragments: 30
    });
    assert.deepEqual(delegationSemantics.fragments[0].details, [
      'Delegate · 4 · self register · +3',
      'Delegate · 4 · self register · new · +2',
      'Delegate · 4 · self register · new · switch · +1',
      'Delegate · 4 · self register · new · switch · undelegate'
    ]);

    const transfers = classifyBlockStory({
      ...knownLanes,
      transactions: [
        { id: 1, amount: 2500000000, internal: false, sender: { alias: 'Sender.tez' }, target: { alias: 'Receiver' } },
        { id: 2, amount: 42000000, internal: false, sender: { alias: 'Second sender' }, target: { alias: 'Second receiver' } }
      ],
    });
    assert.equal(transfers.text, 'Transfers · 2');
    assert.deepEqual(transfers.fragments[0].details, [
      'Transfers · 2 · 2,542 ꜩ total',
      'Transfers · 2 · 2,542 ꜩ total · top Sender.tez → Receiver'
    ]);
    assert.equal(classifyBlockStory(), null);
    assert.equal(classifyBlockStory({ ...knownLanes, evidenceRows: null }), null);
    assert.equal(classifyBlockStory({ ...knownLanes, transactionsClipped: true }), null);
    assert.equal(classifyBlockStory(knownLanes).text, 'Quiet');
    assert(classifyBlockStory({ ...knownLanes, transactions: [{ amount: 1, internal: false, target: { address: 'KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w' } }] }).text.startsWith('Transfers'));
    assert(classifyBlockStory({ ...knownLanes, transactions: [{ amount: 1, internal: false, target: { address: 'KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w' } }], transactionsClipped: true }).text.endsWith('+'));

    const large = { baker: { address: 'tz1-large', alias: 'Large Baker' }, slots: 8 };
    const small = { baker: { address: 'tz1-small', alias: 'Small Baker' }, slots: 2 };
    const notice = buildQuietBakerNotice({
      attestationRights: [large, small],
      powerByDelegate: { 'tz1-large': '2000', 'tz1-small': '20' },
      totalPower: '100000'
    });
    assert(notice?.text.includes('Large Baker') && notice.text.includes('missed attestations'));
    assert.equal(buildQuietBakerNotice({ attestationRights: [small], powerByDelegate: { 'tz1-small': '20' }, totalPower: '100000' }), null);
    const blockMiss = buildQuietBakerNotice({ bakingRights: [{ baker: { address: 'tz1-small', alias: 'Small Baker' } }] });
    assert.equal(blockMiss?.text, 'Small Baker missed the block');
    pass('Live Head application, token, call, rollup, DAL, delegation, origination, evidence, milestone, baker, clipping, quiet-block, and baker-materiality contracts checked');
  }

  async function checkUxAuditContracts() {
    const index = await readText('index.html');
    const api = await readText('js/core/api.js');
    const app = await readText('js/core/app.js');
    const storage = await readText('js/core/storage.js');
    const calculator = await readText('js/features/calculator.js');
    const stateOfTezos = await readText('js/features/state-of-tezos.js');
    const tooltipTour = await readText('js/features/tooltip-tour.js');
    const styles = await readText('css/styles.css');
    const heroSearchCss = await readText('css/hero-search.css');
    const shellExtrasCss = await readText('css/shell-extras.css');
    const historyCss = await readText('css/history-chamber.css');
    const siteMapCss = await readText('css/site-map.css');
    const siteHandoff = await readText('js/core/site-handoff.js');
    const landingCss = await readText('css/landing.css');
    const siteNav = await readText('js/landing/site-nav.js');
    const liveData = await readText('js/landing/live-data.js');
    const henCss = (await readText('css/hen-mode.css')) + (await readText('css/hen-feed.css'));
    const henPage = await readText('hen/index.html');
    const tezosCrp = await readText('js/features/tezoscrp.js');
    const changelog = await readText('js/features/changelog.js');
    const skipPages = [
      ['index.html', index],
      ['landing.html', await readText('landing.html')],
      ['governance/index.html', await readText('governance/index.html')],
      ['bakers/index.html', await readText('bakers/index.html')],
      ['compare/index.html', await readText('compare/index.html')],
      ['hen/index.html', henPage],
      ['404.html', await readText('404.html')]
    ];

    for (const [file, html] of skipPages) {
      if (!html.includes('class="skip-link" href="#main-content"') || !html.includes('id="main-content"')) {
        fail(`${file} must expose a skip-to-content target`);
      }
    }
    for (const route of CHAMBER_ROUTES) {
      const html = await readText(`${route.slug}/index.html`);
      if (!html.includes('class="skip-link" href="#main-content"') || !html.includes('id="main-content"')) {
        fail(`${route.slug}/index.html must inherit the dashboard skip-to-content contract`);
      }
    }
    for (const file of ['compare/tezos-vs-ethereum.html', 'compare/tezos-vs-solana.html', 'compare/tezos-vs-cardano.html', 'compare/tezos-vs-algorand.html']) {
      const html = await readText(file);
      if (!html.includes('class="skip-link" href="#main-content"') || !html.includes('id="main-content"')) {
        fail(`${file} must inherit the comparison skip-to-content contract`);
      }
    }
    if (!siteMapCss.includes('.skip-link')
      || !siteMapCss.includes('button:not([disabled])')
      || !siteMapCss.includes('[tabindex]:not([tabindex="-1"])):focus-visible')) {
      fail('shared site-map CSS must provide skip-link and broad focus-visible coverage');
    }

    for (const [, html] of skipPages.filter(([file]) => /^(staking|governance|bakers)\//.test(file))) {
      if (!html.includes('class="landing-nav-menu"') || !html.includes('class="landing-nav-toggle"')) {
        fail('guide pages must retain a no-JS native mobile navigation disclosure');
      }
    }
    if (!siteNav.includes('<details class="landing-nav-menu" open>')
      || !siteNav.includes('<summary class="landing-nav-toggle">')
      || !siteNav.includes("window.matchMedia('(max-width: 640px)')")
      || !landingCss.includes('.landing-nav-menu:not([open]) > .landing-nav-links')) {
      fail('shared guide navigation must render and style the mobile Explore disclosure');
    }

    if (!liveData.includes("inject('voting-time-left', 'Still syncing')")
      || liveData.includes("inject('voting-time-left', 'RSS ready')")) {
      fail('governance retry copy must remain coherent with the Time Remaining label');
    }

    const staticDialogs = [...index.matchAll(/<div class="modal-overlay[^"]*" id="([^"]+)"[^>]*>\s*<div class="[^"]*\bmodal-content\b[^"]*"([^>]*)>/g)];
    if (staticDialogs.length < 17) fail(`expected at least 17 static modal dialogs, found ${staticDialogs.length}`);
    for (const [, modalId, attributes] of staticDialogs) {
      const labelId = attributes.match(/aria-labelledby="([^"]+)"/)?.[1] || '';
      if (!/role="dialog"/.test(attributes)
        || !/aria-modal="true"/.test(attributes)
        || !/tabindex="-1"/.test(attributes)
        || !labelId
        || !index.includes(`id="${labelId}"`)) {
        fail(`#${modalId} must ship complete static dialog semantics and an existing label`);
      }
    }
    if (!/class="changelog-modal-content"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="changelog-modal-title"/.test(index)) {
      fail('Changelog must ship complete static dialog semantics');
    }

    for (const label of ['source', 'price ꜩ', 'edition', 'sort']) {
      if (!index.includes(`>${label}</span>`) || !henPage.includes(`>${label}</span>`)) {
        fail(`dashboard and standalone HEN filters must expose the visible ${label} group label`);
      }
    }
    if (!henCss.includes('.hen-filter-group-label')) fail('HEN visible filter group labels must be styled');
    if (!index.includes('<a href="/landing.html">Start here</a>') || !siteNav.includes('<a href="/landing.html">Start here</a>')) {
      fail('dashboard and standalone footers must expose the non-forced Start here route');
    }
    for (const href of ['/favicon.svg', '/favicon-48.png', '/favicon-32.png', '/favicon-16.png', '/apple-touch-icon.png', '/safari-pinned-tab.svg', '/site.webmanifest']) {
      if (!index.includes(`href="${href}"`)) fail(`root shell asset must survive history route rewrites: ${href}`);
    }
    if (!index.includes('id="drawer-address-status"') || !index.includes('id="hero-chain-uptime-finality">~12s</strong>') || !index.includes('Tenderbake finality estimate; live cadence is sampling now.')) {
      fail('My Tezos validation and finality must ship honest visible initial states');
    }
    if (api.includes('X-Tezos-Systems-Observed-At') || api.includes("response.headers.get('X-Tezos-Systems-Cache')")) {
      fail('api.js must not keep dead service-worker stale-response readers');
    }
    if (!storage.includes("stats?._quality?.status !== 'live'")) {
      fail('partial or unavailable aggregate stats must not replace the last good storage cache');
    }
    if (!stateOfTezos.includes("sessionStorage.getItem('tezos_price_cache')") || stateOfTezos.includes('tezos-systems-price-cache')) {
      fail('State of Tezos must use the actual shared XTZ price cache schema');
    }
    if (calculator.includes('486.7') || !calculator.includes('HOURS_PER_YEAR / cycleHours')) {
      fail('calculator compounding cadence must derive from protocol cycle timing');
    }
    if (!app.includes("document.addEventListener('visibilitychange', pollBlockWhenVisible)") || !tooltipTour.includes('.visit-streak-toast.visible')) {
      fail('RPC polling and first-visit surfaces must respect document visibility and toast occupancy');
    }
    if (index.includes('<script defer src="js/features/hen-mode.js')
      || !index.includes('<script src="js/core/hen-init.js?v=83" defer></script>')
      || !index.includes('<link id="hen-shared-css" rel="stylesheet" href="css/hen-mode.min.css?v=100">')) {
      fail('HEN feed runtime must load on intent while shared theme and launcher styles remain eager');
    }
    const henSharedCss = await readText('css/hen-mode.css');
    const henFeedCss = await readText('css/hen-feed.css');
    const henInit = await readText('js/core/hen-init.js');
    const health = await readText('js/features/network-health.js');
    if (index.includes('href="css/hen-feed.min.css')
      || !henSharedCss.includes('.hen-overlay { display: none; }')
      || !henSharedCss.includes('.corner-gift-tray') || !henSharedCss.includes('.hen-theme-flash')
      || henSharedCss.includes('.hen-grid {') || !henFeedCss.includes('.hen-grid {')
      || !henInit.includes('Promise.all([loadHenMode(), loadHenStyles(), domReady])')
      || !henInit.includes('shared.after(link)')
      || !CSS_TARGETS.includes('css/hen-feed.min.css')) {
      fail('HEN feed CSS must be generated, deferred, cascade-stable and ready before activation; shared controls and dormant hiding stay eager');
    } else pass('HEN feed CSS is separated from eager shared controls and gates activation');
    const uptime = app.slice(app.indexOf('function initUptimeClock()'), app.indexOf('function setupEventListeners()'));
    if (/id="uptime-(?:clock|counter|bakers|finality|staked|issuance)"/.test(index)
      || /getElementById\('uptime-(?:counter|bakers|finality|staked|issuance)'\)/.test(health + uptime)
      || !uptime.includes('publishDashboardContinuity({')
      || !uptime.includes('if (recentBlockTimes.length >= 3)')
      || !uptime.includes("window.dispatchEvent(new Event('block-pulse'))")
      || !health.includes('const standalone = !readDashboardContinuity()')
      || !health.includes("clock?.closest('#network-health-modal.active')")
      || !health.includes('quietlySyncHtml(clock, healthChainAge())')) {
      fail('Continuity must use explicit dashboard observations, independent finality sampling, visible quiet clocks and standalone source ownership');
    } else pass('Continuity observations and finality no longer depend on hidden clock DOM');
    if (!index.includes('id="portfolio-import-file" type="file" accept="application/json,.json" aria-label="Import My Tezos portfolio JSON file"')
      || !index.includes('id="hen-cli-input" class="hen-cli-input" type="text" aria-label="HEN command input"')) {
      fail('file import and HEN command inputs must retain explicit accessible names');
    }
    if ((tezosCrp.match(/loading="lazy" decoding="async"/g) || []).length < 3) {
      fail('TezosCRP category icon templates must defer off-screen loading and decoding');
    }
    if (!tooltipTour.includes("document.getElementById('hero-slot')")
      || !tooltipTour.includes("document.getElementById('hero-search-form')")
      || !tooltipTour.includes("host.insertBefore(nudge, host.querySelector('.hero-search-submit'))")
      || !tooltipTour.includes("window.addEventListener('hot-signal-rendered', keepNudgeInSearchRail)")
      || !/\(heroSlot \|\| document\.getElementById\('live-head'\) \|\| document\.body\)\.appendChild\(nudge\)/.test(tooltipTour)
      || !/\.tour-nudge\s*\{[\s\S]*?position:\s*static[\s\S]*?flex:\s*0 0 auto[\s\S]*?display:\s*inline-flex/.test(styles)
      || !heroSearchCss.includes('.live-head-panel .hero-search-form > .tour-nudge')) {
      fail('first-visit guidance must stay compact without reviving an idle search-chip rail');
    }
    if (!/\.site-map-shell \.site-map-sublink\s*\{[\s\S]*?min-height:\s*24px/.test(siteMapCss)
      || !/\.site-map-shell \.site-map-links \.site-map-link\s*\{[\s\S]*?min-height:\s*24px/.test(siteMapCss)
      || !/\.price-link\s*\{[\s\S]*?min-height:\s*24px/.test(styles)
      || !/\.cycle-chip\s*\{[\s\S]*?min-height:\s*24px/.test(styles)
      || !/\.chamber-expand-cue\s*\{[\s\S]*?height:\s*24px/.test(styles)
      || !/\.hero-search-chip\s*\{[\s\S]*?min-height:\s*24px/.test(heroSearchCss)
      || !/\.hot-today-clock\s*\{[\s\S]*?min-height:\s*24px/.test(shellExtrasCss)
      || !/\.cycle-history-entry-route\s*\{[\s\S]*?min-height:\s*24px/.test(historyCss)) {
      fail('compact actionable header, launcher, history, and directory targets must retain a 24px minimum height');
    }
    if (await pathExists('js/features/objkt-ui.js')) fail('orphaned OBJKT UI module must stay retired');
    if (!changelog.includes('Keyboard visitors now get a sitewide skip link')) {
      fail('changelog must disclose the July UI/UX audit implementation');
    }

    pass('July UI/UX audit quick-win contracts checked');
  }

  async function checkMainnetLaunchCopy() {
    const config = await readText('js/core/config.js');
    const mainnet = await readText('js/core/mainnet.mjs');
    if (!mainnet.includes("MAINNET_LAUNCH = '2018-06-30T17:39:57Z'")) {
      fail('js/core/mainnet.mjs must keep MAINNET_LAUNCH at the Mainnet Block 1 timestamp');
    }
    if (!config.includes("export { MAINNET_LAUNCH } from './mainnet.mjs';")) {
      fail('js/core/config.js must re-export the shared MAINNET_LAUNCH timestamp');
    }

    const userFacingFiles = [
      'index.html',
      '.well-known/ai-plugin.json',
      'data/tweets.json',
      'README.md',
      'js/core/app.js',
      'js/features/state-of-tezos.js',
      'js/landing/live-data.js'
    ];
    const stalePatterns = [
      /September 17, 2018/i,
      /September 17 UTC/i,
      /Sep 17, 2018/i,
      /2018-09-17T00:00:00Z/i,
      /temporalCoverage["']?\s*:\s*["']2018-09-17\/\.\./i,
      /refreshed every 2 minutes/i
    ];

    for (const file of userFacingFiles) {
      const text = await readText(file);
      for (const pattern of stalePatterns) {
        if (pattern.test(text)) {
          fail(`${file} contains stale September 2018 mainnet launch wording (${pattern})`);
        }
      }
    }

    const index = await readText('index.html');
    if (!index.includes('June 30, 2018') || !index.includes('"temporalCoverage": "2018-06-30/.."')) {
      fail('index.html should expose the Mainnet Block 1 calendar date in copy and temporal coverage');
    }

    const aiPlugin = await readText('.well-known/ai-plugin.json');
    if (!aiPlugin.includes('June 30, 2018')) {
      fail('.well-known/ai-plugin.json must use the Mainnet Block 1 calendar date');
    }
    if (!aiPlugin.includes('visible freshness markers')) {
      fail('.well-known/ai-plugin.json must describe freshness without stale two-minute claims');
    }
    const aiPluginJson = JSON.parse(aiPlugin);
    const openApi = JSON.parse(await readText('.well-known/openapi.json'));
    const securityTxt = await readText('.well-known/security.txt');
    if (aiPluginJson?.api?.url !== 'https://tezos.systems/.well-known/openapi.json' || !openApi.openapi || !openApi.paths?.['/version.json']) {
      fail('AI plugin metadata must point to the site-owned OpenAPI document');
    }
    if (!/Contact: mailto:support@tez\.capital/.test(securityTxt) || !/Canonical: https:\/\/tezos\.systems\/\.well-known\/security\.txt/.test(securityTxt)) {
      fail('security.txt must expose canonical private reporting contacts');
    }

    const anniversary = await readText('js/core/anniversary.js');
    const app = await readText('js/core/app.js');
    if (!anniversary.includes('getCalendarElapsedTime') || !app.includes('getCalendarElapsedTime(now)')) {
      fail('mainnet age and anniversary pulse must share the UTC calendar elapsed-time helper');
    }
    if (/function tickUptime\(\)[\s\S]*?365\.25[\s\S]*?function tickBlockAge/.test(app)) {
      fail('the live mainnet-age clock must not use fixed 365.25-day year arithmetic');
    }

    pass('mainnet launch copy and calendar clock use Mainnet Block 1 on June 30, 2018');
  }

  async function checkTourAndShareCaptureContracts() {
    const themeSource = await readText('js/ui/theme.js');
    const tour = await readText('js/features/tooltip-tour.js');
    const app = await readText('js/core/app.js');
    const styles = await readText('css/styles.css');
    const themeMatch = themeSource.match(/const THEMES = \[([^\]]+)\]/);
    const themes = themeMatch ? Array.from(themeMatch[1].matchAll(/['"]([^'"]+)['"]/g)).map((match) => match[1]) : [];
    if (!themes.length) {
      fail('js/ui/theme.js theme list could not be parsed for tour copy checks');
    }

    if (/12 themes/i.test(tour)) {
      fail('tooltip tour must not retain stale 12 themes copy');
    }
    if (!tour.includes(`${themes.length} themes`)) {
      fail(`tooltip tour theme count must agree with theme.js (${themes.length} themes)`);
    }
    for (const snippet of [
      'Find anything',
      'Quick tour',
      'Start with mainnet history',
      'Read the latest blocks',
      'Protocol Anthology',
      'Network Context',
      'Follow the lifeline',
      'complete map stays folded',
      'Explore leads with all topics, Network Pulse, Staking, and Maxis',
      'Optional Tezos Systems tour',
      '<span>Quick tour</span>',
      'Dismiss tour offer'
    ]) {
      if (!tour.includes(snippet)) fail(`tooltip tour must retain passive search-help copy: ${snippet}`);
    }
    for (const selector of [
      '#top-continuity-history',
      '#live-head-button',
      '#hero-search-form',
      '#chambers-section .section-header',
      '#my-tezos-btn',
      '#recruit-section .site-handoff-head',
      '#features-gear',
      '#settings-gear'
    ]) {
      if (!tour.includes(`target: '${selector}'`)) fail(`tooltip tour must cover current help target ${selector}`);
    }
    if (!tour.includes('window.innerWidth - (VIEWPORT_PAD * 2)')) {
      fail('tooltip tour must size its tooltip from the viewport so mobile help never starts off-screen');
    }
    for (const snippet of [
      'Focus command bar',
      'Open selected command result',
      'Open Cycle History Chamber'
    ]) {
      if (!app.includes(snippet)) fail(`keyboard help overlay must include current command shortcut copy: ${snippet}`);
    }

    const upgradeNumberBlock = styles.match(/\.upgrade-number\s*\{[^}]*\}/)?.[0] || '';
    if (!upgradeNumberBlock) {
      fail('css/styles.css missing .upgrade-number block for share capture guard');
    } else if (/color-mix|oklch|(?<!-)lch\(|lab\(/i.test(upgradeNumberBlock)) {
      fail('.upgrade-number must avoid html2canvas-unsupported color functions because protocol timeline sharing captures this live DOM');
    } else {
      pass('tour theme copy and protocol timeline share CSS contracts checked');
    }
  }

  async function checkDailyBriefingPriceContracts() {
    const briefing = await readText('js/features/daily-briefing.js');
    const requiredSnippets = [
      "import { fetchXTZPrice } from './price.js';",
      'resolvePriceContext',
      'priceChange24h: currentChange24h',
      'cached.priceChange24h',
      'BRIEFING_SCHEMA_VERSION',
      'activityNarrative',
      'ACTIVITY_MEANINGFUL_PCT',
      'baselineText',
      'cached.schema !== BRIEFING_SCHEMA_VERSION'
    ];

    for (const snippet of requiredSnippets) {
      if (!briefing.includes(snippet)) fail(`daily briefing price contract missing: ${snippet}`);
    }
    if (briefing.includes('if (cached?.cycle === stats.cycle)')) {
      fail('daily briefing update must not reuse same-cycle cache without price-movement stale checks');
    }
    if (!/absPct24h\s*<\s*0\.4\s*\?\s*TEMPLATES\.price\[2\]/.test(briefing)) {
      fail('daily briefing steady-price template must stay gated behind sub-0.4% 24h movement');
    }
    if (/dir\s*===\s*['"]above['"]\s*\?\s*['"]busy['"]/.test(briefing)) {
      fail('daily briefing activity copy must not label every above-baseline move as busy');
    }
    if (briefing.includes('the 7-day average')) {
      fail('daily briefing activity copy must not claim a 7-day average when using the saved activity baseline');
    }

    pass('daily briefing price and activity movement cache contracts checked');
  }

  async function checkNetworkContextNavigationContracts() {
    const briefing = await readText('js/features/daily-briefing.js');
    const pulseTicker = await readText('js/ui/pulse-ticker.js');
    const curio = await readText('js/core/live-pulse-curio.mjs');
    const myTezos = await readText('js/features/my-tezos.js');
    const siteJourney = await readText('js/core/site-journey.js');
    const shellExtras = await readText('css/shell-extras.css');
    const styles = await readText('css/styles.css');
    const requiredSiteMapRoutes = {
      staking: 'staking-chamber',
      governance: 'chamber',
      collector: 'hen',
      creator: 'hen',
      nft: 'hen',
      domains: 'domains',
      lb: 'liquidity-baking',
      tz4: 'tz4',
      etherlink: 'tezosx',
      ledger: 'ledger-flow',
      maxis: 'maxis',
      network: 'pulse'
    };

    for (const [key, siteMapId] of Object.entries(requiredSiteMapRoutes)) {
      const pattern = new RegExp(`${key}:\\s*['"]${siteMapId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
      if (!pattern.test(briefing)) {
        fail(`Network Context site-map route missing ${key} -> ${siteMapId}`);
      }
    }

    const requiredSnippets = [
      "import { findSiteMapEntry } from '../core/site-map.js';",
      'NETWORK_FEATURE_SITE_MAP_IDS',
      'routeFromSiteMapEntry',
      'window.addEventListener(\'hot-signal\', receiveHotSignal)',
      'window.addEventListener(\'governance-alert-state\'',
      'hotPoolSignals()',
      'LS_DAILY_SNAPSHOT',
      'HOT_TODAY_INITIAL_TIMEOUT_MS = 20000',
      "state === 'unavailable' && lastHotTodayDataState === 'loading'",
      'Date.now() - hotTodayLoadingStartedAt < HOT_TODAY_INITIAL_TIMEOUT_MS',
      'scheduleHotTodayInitialTimeout()',
      'HOT_SIGNAL_RENDER_CAP = 12',
      'HOT_SIGNAL_VISIBLE_MIN = 4',
      'HOT_SIGNAL_CATEGORY_BUDGET = 2',
      'HOT_SIGNAL_EVENT_DECAY_PER_HOUR = 8',
      'HOT_SIGNAL_PERSONAL_BONUS = 6',
      'hotSignalPersonalRibbon',
      "return 'Your stake';",
      "return 'Your baker';",
      "return 'Your position';",
      "return 'Your collection';",
      "return 'Your .tez name';",
      "left?.spectacle !== 'quiet'",
      "if (value == null || value === '') return null;",
      'MILESTONE_MOMENT_TTL_MS',
      'advanceMilestoneTrack(momentStore',
      '...lifecycle.activeMoments',
      "milestoneStatus: 'crossed'",
      "milestoneStatus: 'near'",
      'shortLabel: milestoneShortLabel',
      'claimMilestoneArrival(seenMilestoneArrivals',
      "signal?.tone === 'milestone' && signal?.milestoneStatus === 'crossed'",
      'scheduleHotSignalExpiryRefresh(hotTodaySignals)',
      'milestone: hotSignalPayload(milestoneSignal)',
      'dailySnapshotReference',
      'captureDailySnapshot(stats)',
      'const kind = normalizeSignalKind',
      'SPECTACLE_LEVELS',
      'normalizeSpectacle',
      'selectHotSignalSet',
      'scoreBoostFor(category, profile)',
      'fetchNftPulse',
      'chooseDailyCurio',
      'LIVE_PULSE_CURIO_MAX_BASE_SIGNALS',
      'LIVE_PULSE_CURIO_SCORE',
      'shouldOfferDailyCurio',
      'LS_DAILY_CURIO_DAY',
      'freshHistoryRowsForDailyCurio',
      'prepareDailyCurio',
      'appendDailyCurio',
      'delta: normalizeDelta',
      'BRIEFING_SCHEMA_VERSION = 15',
      'renderHotTodayState',
      "data-pulse-state', 'stale'",
      'getLiveCandidateSignals',
      'getPulseHistoryReceipt',
      'getPulseDomainReceipt',
      'network-context-milestone-line',
      'MILESTONE_NEAR_MAX_DAYS = 30',
      'MILESTONE_CATALOG_URL',
      'mergedMilestoneThresholds',
      'generatedMilestoneAnchor',
      'resolveExactBlockMilestoneMoment',
      'resolveExactCycleMilestoneMoment',
      'data-hot-milestone-share',
      'captureNetworkMomentShare',
      '<a class="network-focus-chip"',
      '<a class="network-signal',
      'network-personal-spotlight',
      'network-personal-fact',
      'buildPersonalSpotlight',
      'buildPersonalFacts',
      'selectDrawerNetworkSignals',
      'personalSignalContext',
      'personalSignalRelevance',
      'rankSignalsByPersonalRelevance(selected, relevanceContext, effectiveHotScore)',
      'data-network-away-slot',
      "window.dispatchEvent(new Event('my-tezos-network-context-rendered'))",
      'const since = snapshotSinceLabel(snapshot)',
      'referenceAt',
      'countExplicitLinkedEtherlinkAccounts(data?.fullAddress)',
      'data-personal-relevance="true"',
      'valueXtz: whales.top',
      'network-context-columns',
      'network-live-column',
      "window.addEventListener('my-tezos-portfolio-ready'",
      "window.addEventListener('my-tezos-memory-ready'",
      "window.addEventListener('my-tezos-linked-l2-changed'",
      'data-my-tezos-view-route',
      'data-network-route',
      'wireNetworkContextNavigation(container)',
      'closeDrawerForNetworkRoute(route)',
      'window.location.assign(route)',
      "window.dispatchEvent(new Event('hashchange'))"
    ];
    for (const snippet of requiredSnippets) {
      if (!briefing.includes(snippet)) fail(`Network Context clickable contract missing snippet: ${snippet}`);
    }
    for (const snippet of [
      'data-hot-personal="1"',
      'hot-today-you',
      'data-milestone-status=',
      'data-hot-spectacle=',
      'data-hot-visual=',
      'data-hot-signal-id=',
      'data-hot-curio="1"',
      'data-hot-age',
      'pulse-ticker-mark',
      'pulse-ticker-weight',
      "['headliner', 'peacock', 'historic']",
      "if (weight === 'priority') return { mark: '', word: 'PRIORITY' };",
      "return { mark: '', word: '' };",
      'pulseItemSignalId(item)',
      'setHeldSignal(pulseItemSignalId(item), { anchorItem: item })'
    ]) {
      if (!pulseTicker.includes(snippet)) fail(`Live Pulse ticker presentation contract missing snippet: ${snippet}`);
    }
    for (const snippet of [
      'LIVE_PULSE_CURIO_SCORE = 58',
      'LIVE_PULSE_CURIO_MAX_BASE_SIGNALS = 8',
      "source: 'protocol'",
      "source: 'month'",
      "source: 'continuity'",
      'Active baker addresses numbered',
      'adopted protocol upgrades',
      'storedDay !== today'
    ]) {
      if (!curio.includes(snippet)) fail(`Live Pulse daily Curio contract missing snippet: ${snippet}`);
    }
    if (/\bfetch\s*\(|localStorage|sessionStorage/.test(curio)) {
      fail('Live Pulse Curio selection must remain a pure projection of already-loaded data');
    }
    if (!shellExtras.includes('.hot-today-you') || !shellExtras.includes('.hot-today-you + .hot-today-age')) {
      fail('Live Pulse personal ribbon must remain compact and preserve the age label lane');
    }
    for (const snippet of [
      '.pulse-ticker-item',
      'min-width: min(78vw, 330px)',
      '.pulse-ticker-shelf',
      '.pulse-ticker-clock',
      '-webkit-mask-image: linear-gradient(to right, transparent 0, #000 14px',
      'mask-image: linear-gradient(to right, transparent 0, #000 14px',
      '-webkit-mask-image: none;',
      'mask-image: none;'
    ]) {
      if (!shellExtras.includes(snippet)) fail(`Live Pulse mobile reading-lane CSS missing: ${snippet}`);
    }
    const smoke = await readText('tests/smoke.mjs');
    if (!smoke.includes("name: 'live-pulse-personal-ribbons'")) {
      fail('smoke catalog must include the Live Pulse personal ribbon desktop/mobile suite');
    }
    if (!smoke.includes("name: 'live-pulse-daily-curio'")) {
      fail('smoke catalog must include the Live Pulse daily Curio desktop/mobile suite');
    }
    for (const snippet of [
      'function renderWhileAwayNetworkCard()',
      'getDailyDeltaSignalSummaries(2)',
      'accountBullets.slice(0, 3)',
      'networkBullets.slice(0, 2)',
      'if (!accountBullets.length && !networkBullets.length) return null;',
      'quietlySyncHtml(slot, html)',
      "window.addEventListener('my-tezos-network-context-rendered', renderWhileAwayNetworkCard)"
    ]) {
      if (!myTezos.includes(snippet)) fail(`My Tezos away-report contract missing: ${snippet}`);
    }
    if (myTezos.includes('cards.push(_activeOvernightCard)')) {
      fail('My Tezos away report must render in Network Context, not the general Morning Brief');
    }
    for (const snippet of [
      'export function countExplicitLinkedEtherlinkAccounts',
      'return countExplicitLinkedEtherlinkAccounts(activeAddress) > 0'
    ]) {
      if (!siteJourney.includes(snippet)) fail(`My Tezos explicit Etherlink link-count contract missing: ${snippet}`);
    }
    for (const snippet of [
      '.network-personal-spotlight',
      '.network-personal-facts',
      '.network-personal-fact',
      '.network-context-columns',
      '.network-live-column',
      '.network-away-slot:empty',
      '.network-away-card',
      '.network-away-sections',
      '.network-context-now-heading',
      '.network-signal.is-network-lead',
      '.network-signal-relevance'
    ]) {
      if (!styles.includes(snippet)) fail(`My Tezos personalized Network Context CSS missing: ${snippet}`);
    }
    if (briefing.includes('Earlier today') || shellExtras.includes('.hot-today-earlier')) {
      fail('What is hot today must not render a dead earlier-category breadcrumb');
    }

    for (const snippet of [
      '[data-pulse-weight="state"]',
      '[data-pulse-weight="priority"]',
      '[data-pulse-weight="event"]',
      '[data-pulse-weight="milestone"]',
      '.pulse-ticker-mark',
      '.pulse-ticker-shelf'
    ]) {
      if (!shellExtras.includes(snippet)) fail(`Live Pulse ticker weight CSS missing: ${snippet}`);
    }
    if (/\.pulse-ticker-item\[data-pulse-weight="(?:priority|event|milestone)"\][\s\S]{0,300}?background:/.test(shellExtras)) {
      fail('Live Pulse weight tiers must use words, glyphs, and type color without persistent card highlighting');
    }

    const chamberSignalContracts = [
      ['js/features/staking-chamber.js', "visual: 'staking'", "route: '/stake/'"],
      ['js/features/liquidity-baking.js', 'dispatchLiquidityBakingHotSignal', "visual: 'lb'"],
      ['js/features/maxis.js', 'dispatchMaxisHotSignals', "spectacle: 'historic'"],
      ['js/features/whales.js', "visual: 'whale'", "spectacle: amountXtz >= 1_000_000 ? 'peacock' : 'headliner'", 'valueXtz: amountXtz'],
      ['js/features/tezos-domains.js', "visual: 'domains'", "spectacle: 'headliner'"],
      ['js/features/tezlink.js', "visual: 'etherlink'", "transactionsToday >= 100_000 ? 'headliner' : 'curious'"]
    ];
    for (const [file, ...snippets] of chamberSignalContracts) {
      const source = await readText(file);
      for (const snippet of snippets) {
        if (!source.includes(snippet)) fail(`${file} missing What is hot today signal contract: ${snippet}`);
      }
    }

    pass('Network Context feature routes and spectacle signals stay clickable');
  }

  return { checkHomeLayoutContracts, checkLiveHeadPureContracts, checkUxAuditContracts, checkMainnetLaunchCopy, checkTourAndShareCaptureContracts, checkDailyBriefingPriceContracts, checkNetworkContextNavigationContracts };
}
