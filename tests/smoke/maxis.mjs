// Browser workflows owned by maxis. Shared dependencies remain explicit.
export function createMaxisSmokeSuites({
  ARTIFACTS_DIR,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_DELEGATOR_ADDRESS,
  SAMPLE_REGULAR_DELEGATOR_ADDRESS,
  assert,
  assertNormalizedChamberShell,
  attachIssueCollectors,
  createHash,
  decodeGeneratedTransport,
  encodeGeneratedTransport,
  fulfillJson,
  installFeatureMocks,
  log,
  readMaxisLauncherGeometry,
  smokeTezosCrpCompaction
}) {
  async function smokeMaxisDomainPassport(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript((savedAddress) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', savedAddress);
    }, SAMPLE_ADDRESS);

    const page = await context.newPage();
    const resolverCalls = [];
    const domainRecords = new Map([
      ['maxi-passport.tez', { address: SAMPLE_ADDRESS_2, owner: SAMPLE_ADDRESS }],
      ['skllz.hack.tez', { address: null, owner: SAMPLE_DELEGATOR_ADDRESS }],
      ['invalid-forward.maxi.tez', { address: `tz1${'O'.repeat(33)}`, owner: SAMPLE_REGULAR_DELEGATOR_ADDRESS }],
      ['contract.maxi.tez', { address: 'KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT', owner: SAMPLE_ADDRESS }],
      ['error.maxi.tez', 'graphql-error'],
      ['missing.maxi.tez', null]
    ]);
    await page.route('https://api.tezos.domains/graphql', async (route) => {
      let body = {};
      try {
        body = JSON.parse(route.request().postData() || '{}');
      } catch {
        return route.fallback();
      }
      if (!/domain\(name:\s*\$name\)/.test(String(body.query || ''))) return route.fallback();
      const name = String(body.variables?.name || '');
      if (!domainRecords.has(name)) return route.fallback();
      resolverCalls.push({ name, query: String(body.query || '') });
      if (domainRecords.get(name) === 'graphql-error') return fulfillJson(route, { errors: [{ message: 'Resolver unavailable' }] });
      return fulfillJson(route, { data: { domain: domainRecords.get(name) } });
    });
    attachIssueCollectors(page, 'maxis domain Passport', issues);

    const response = await page.goto(`${baseUrl}/maxis/?view=passport&address=${encodeURIComponent('Maxi-Passport.TEZ')}`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `maxis domain Passport: pretty route failed with HTTP ${response?.status()}`);
    await page.locator('#maxis-modal.active .maxis-passport-input').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction((address) => document.querySelector('.maxis-passport-card code')?.textContent?.trim() === address, SAMPLE_ADDRESS_2, { timeout: 15000 });

    const input = page.locator('.maxis-passport-input');
    const directState = await page.evaluate(() => ({
      input: document.querySelector('.maxis-passport-input')?.value || '',
      placeholder: document.querySelector('.maxis-passport-input')?.getAttribute('placeholder') || '',
      label: document.querySelector('.maxis-passport-input')?.getAttribute('aria-label') || '',
      routeAddress: new URLSearchParams(window.location.search).get('address'),
      identity: document.querySelector('.maxis-passport-identity')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      stored: localStorage.getItem('tezos-systems-my-baker-address')
    }));
    assert(directState.input === 'maxi-passport.tez' && /name\.tez/i.test(directState.placeholder) && /\.tez name/i.test(directState.label), `maxis domain Passport: .tez input affordance or normalization failed ${JSON.stringify(directState)}`);
    assert(directState.routeAddress === SAMPLE_ADDRESS_2 && /maxi-passport\.tez resolved/i.test(directState.identity), `maxis domain Passport: direct address did not canonicalize while preserving the name ${JSON.stringify(directState)}`);
    assert(directState.stored === SAMPLE_ADDRESS, `maxis domain Passport: lookup mutated My Tezos ${JSON.stringify(directState)}`);

    await input.fill('skllz.hack.tez');
    await page.locator('[data-maxis-passport-form]').evaluate((form) => form.requestSubmit());
    await page.waitForFunction((address) => document.querySelector('.maxis-passport-card code')?.textContent?.trim() === address, SAMPLE_DELEGATOR_ADDRESS, { timeout: 15000 });
    const fallbackState = await page.evaluate(() => ({
      routeAddress: new URLSearchParams(window.location.search).get('address'),
      identity: document.querySelector('.maxis-passport-identity')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      stored: localStorage.getItem('tezos-systems-my-baker-address')
    }));
    assert(fallbackState.routeAddress === SAMPLE_DELEGATOR_ADDRESS && /skllz\.hack\.tez resolved/i.test(fallbackState.identity), `maxis domain Passport: subdomain owner fallback failed ${JSON.stringify(fallbackState)}`);
    assert(fallbackState.stored === SAMPLE_ADDRESS, `maxis domain Passport: owner fallback mutated My Tezos ${JSON.stringify(fallbackState)}`);

    await input.fill('invalid-forward.maxi.tez');
    await page.locator('[data-maxis-passport-form]').evaluate((form) => form.requestSubmit());
    await page.waitForFunction((address) => document.querySelector('.maxis-passport-card code')?.textContent?.trim() === address, SAMPLE_REGULAR_DELEGATOR_ADDRESS, { timeout: 15000 });
    const invalidForwardState = await page.evaluate(() => ({
      routeAddress: new URLSearchParams(window.location.search).get('address'),
      stored: localStorage.getItem('tezos-systems-my-baker-address')
    }));
    assert(invalidForwardState.routeAddress === SAMPLE_REGULAR_DELEGATOR_ADDRESS, `maxis domain Passport: invalid forward address blocked the valid owner fallback ${JSON.stringify(invalidForwardState)}`);
    assert(invalidForwardState.stored === SAMPLE_ADDRESS, `maxis domain Passport: invalid-address fallback mutated My Tezos ${JSON.stringify(invalidForwardState)}`);

    await input.fill('missing.maxi.tez');
    await page.locator('[data-maxis-passport-form]').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => /does not currently resolve to a Tezos account/i.test(document.querySelector('#maxis-panel-passport')?.textContent || ''), null, { timeout: 5000 });
    assert(await page.locator('#maxis-panel-passport .maxis-passport-card').count() === 0, 'maxis domain Passport: unresolved name retained a stale Passport card');

    await input.fill('error.maxi.tez');
    await page.locator('[data-maxis-passport-form]').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => /could not be resolved through Tezos Domains[\s\S]*could not complete the lookup/i.test(document.querySelector('#maxis-panel-passport')?.textContent || ''), null, { timeout: 5000 });
    const errorState = await page.evaluate(() => ({
      input: document.querySelector('.maxis-passport-input')?.value || '',
      retryButtons: document.querySelectorAll('[data-maxis-passport-retry]').length,
      cards: document.querySelectorAll('#maxis-panel-passport .maxis-passport-card').length,
      stored: localStorage.getItem('tezos-systems-my-baker-address')
    }));
    assert(errorState.input === 'error.maxi.tez' && errorState.retryButtons === 1 && errorState.cards === 0, `maxis domain Passport: resolver failure did not preserve a retryable lookup ${JSON.stringify(errorState)}`);
    assert(errorState.stored === SAMPLE_ADDRESS, `maxis domain Passport: resolver failure mutated My Tezos ${JSON.stringify(errorState)}`);

    await input.fill('broken..tez');
    await page.locator('[data-maxis-passport-form]').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => /or a valid \.tez name/i.test(document.querySelector('#maxis-panel-passport')?.textContent || ''), null, { timeout: 5000 });
    assert(await page.locator('#maxis-panel-passport .maxis-passport-card').count() === 0, 'maxis domain Passport: malformed name retained a stale Passport card');

    await input.fill('contract.maxi.tez');
    await page.locator('[data-maxis-passport-form]').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => /resolves to KT1[\s\S]*KT1 contract passports are not supported/i.test(document.querySelector('#maxis-panel-passport')?.textContent || ''), null, { timeout: 5000 });
    const contractState = await page.evaluate(() => ({
      cards: document.querySelectorAll('#maxis-panel-passport .maxis-passport-card').length,
      routeAddress: new URLSearchParams(window.location.search).get('address'),
      stored: localStorage.getItem('tezos-systems-my-baker-address')
    }));
    assert(contractState.cards === 0 && contractState.routeAddress?.startsWith('KT1'), `maxis domain Passport: contract target was silently reassigned to its owner ${JSON.stringify(contractState)}`);
    assert(contractState.stored === SAMPLE_ADDRESS, `maxis domain Passport: contract rejection mutated My Tezos ${JSON.stringify(contractState)}`);

    assert(resolverCalls.length === 6 && resolverCalls.every(({ query }) => /domain\(name:\s*\$name\)\s*\{\s*address\s+owner\s*\}/s.test(query)), `maxis domain Passport: resolver did not request address plus owner ${JSON.stringify(resolverCalls)}`);
    assert(resolverCalls[0]?.name === 'maxi-passport.tez' && resolverCalls[1]?.name === 'skllz.hack.tez', `maxis domain Passport: resolver names were not normalized ${JSON.stringify(resolverCalls)}`);

    await context.close();
    assert(issues.length === 0, `maxis domain Passport browser issues:\n${issues.join('\n')}`);
    log('ok - maxis domain Passport smoke');
  }

  async function smokeMaxisChamber(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', 'tz1aWXP237BLwNHJcCD4b3DutCevhqq2T1Z9');
    });
    const page = await context.newPage();
    const passportShardRequests = [];
    page.on('request', (request) => {
      if (/\/data\/maxis\/seasons\/[^/]+\/passports\/[0-9a-f]{2}\.json(?:\?|$)/i.test(request.url())) passportShardRequests.push(request.url());
    });
    attachIssueCollectors(page, 'tezos maxis chamber', issues);

    const response = await page.goto(`${baseUrl}/maxis/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `tezos maxis chamber: pretty route failed with HTTP ${response?.status()}`);
    await page.waitForFunction(() => window.location.pathname === '/maxis/' && window.location.hash === '', null, { timeout: 7000 });
    await page.locator('#maxis-modal.active .maxis-experience').waitFor({ state: 'visible', timeout: 15000 });
    assert(await page.locator('#chambers-grid').count() === 0, 'Maxis direct boot must not render hidden home launchers');
    await page.locator('#maxis-modal .chamber-close').click();
    await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true' && location.pathname === '/', null, { timeout: 30000 });
    await page.locator('#maxis-entry-card.chamber-entry-wide').waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(async () => (await import('/js/core/site-map.js')).navigateSiteMapEntry('maxis'));
    await page.waitForURL(url => url.pathname === '/maxis/');
    await page.locator('#maxis-modal.active .maxis-content').waitFor({ state: 'visible', timeout: 15000 });
    await assertNormalizedChamberShell(page, '#maxis-modal.active', '.maxis-content', 'standard', 'tezos maxis chamber');
    await page.locator('#maxis-modal .maxis-experience').waitFor({ state: 'visible', timeout: 15000 });

    const desktopLauncher = await readMaxisLauncherGeometry(page);
    assert(
      desktopLauncher.card
        && desktopLauncher.pair
        && desktopLauncher.stage
        && desktopLauncher.card.width >= desktopLauncher.pair.width - 2
        && Math.abs(desktopLauncher.stage.left - desktopLauncher.contentLeft) <= 2
        && desktopLauncher.stage.right <= desktopLauncher.contentRight + 2
        && desktopLauncher.stage.width >= desktopLauncher.contentWidth * 0.75,
      `tezos maxis launcher: dense desktop composition must own and use a full People row ${JSON.stringify(desktopLauncher)}`
    );
    assert(desktopLauncher.identityCount === 10 && desktopLauncher.identityLeaderCount === 10 && desktopLauncher.seasonCrownCount === 4 && desktopLauncher.clippedIdentityCells.length === 0, `tezos maxis launcher: desktop crown holders or Season leaders clip or disappear ${JSON.stringify(desktopLauncher)}`);
    assert(desktopLauncher.card.height >= 350 && desktopLauncher.card.height <= 375 && desktopLauncher.horizontalOverflow <= 1, `tezos maxis launcher: categorized desktop card misses its geometry baseline or overflows ${JSON.stringify(desktopLauncher)}`);

    await page.setViewportSize({ width: 900, height: 1000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const tabletLauncher = await readMaxisLauncherGeometry(page);
    assert(
      tabletLauncher.card
        && tabletLauncher.pair
        && Math.abs(tabletLauncher.card.left - tabletLauncher.pair.left) <= 2
        && tabletLauncher.card.width >= tabletLauncher.pair.width - 2,
      `tezos maxis launcher: tablet People category must give the dense card a full row ${JSON.stringify(tabletLauncher)}`
    );
    assert(tabletLauncher.horizontalOverflow <= 1, `tezos maxis launcher: tablet card overflows ${JSON.stringify(tabletLauncher)}`);

    await page.setViewportSize({ width: 430, height: 932 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const widePhoneLauncher = await readMaxisLauncherGeometry(page);
    assert(
      widePhoneLauncher.identityCount === 10
        && widePhoneLauncher.identityLeaderCount === 10
        && widePhoneLauncher.pulseLineCount === 3,
      `tezos maxis launcher: wide phone must keep every crown holder and complete Season pulse visible ${JSON.stringify(widePhoneLauncher)}`
    );
    assert(
      widePhoneLauncher.card
        && widePhoneLauncher.footer
        && widePhoneLauncher.cardTail !== null
        && widePhoneLauncher.cardTail <= 3
        && widePhoneLauncher.footer.bottom <= widePhoneLauncher.card.bottom + 1
        && widePhoneLauncher.clippedIdentityCells.length === 0
        && widePhoneLauncher.horizontalOverflow <= 1,
      `tezos maxis launcher: 430px wide phone retained a blank fixed-height tail or overflowed ${JSON.stringify(widePhoneLauncher)}`
    );

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const artifact = await page.evaluate(async () => {
      const [manifest, ongoing, careers, l2Governance] = await Promise.all([
        fetch('/data/maxis/manifest.json', { cache: 'no-store' }).then((response) => response.json()),
        fetch('/data/maxis-leaders.json', { cache: 'no-store' }).then((response) => response.json()),
        fetch('/data/maxis-careers.json', { cache: 'no-store' }).then((response) => response.json()),
        fetch('/data/maxis-l2-governance.json', { cache: 'no-store' }).then((response) => response.json())
      ]);
      const active = (manifest.seasons || []).find((season) => season.id === manifest.activeSeasonId);
      const summary = await fetch(active.summaryPath, { cache: 'no-store' }).then((response) => response.json());
      const laneRows = Object.entries(summary.rankings || {}).map(([category, rows]) => ({ category, rows: Array.isArray(rows) ? rows : [] }));
      const ready = laneRows
        .filter(({ category, rows }) => summary.laneStatus?.[category]?.status === 'ready' && rows.length)
        .sort((left, right) => right.rows.length - left.rows.length)[0];
      const unavailable = Object.entries(summary.laneStatus || {}).find(([, status]) => status?.status === 'unavailable');
      const passportRow = ready?.rows?.find((row) => l2Governance.records?.[row.address]) || ready?.rows?.[0];
      const ongoingCategories = [...(ongoing.leaders || []).map((leader) => leader.category), 'l2_governance'];
      return {
        activeSeasonId: manifest.activeSeasonId,
        seasonCount: manifest.seasons?.length || 0,
        finalizedCount: (manifest.seasons || []).filter((season) => season.status === 'finalized').length,
        ongoingCategories,
        ongoingClocks: { ...Object.fromEntries((ongoing.leaders || []).map((leader) => [leader.category, leader.windowKind])), l2_governance: 'all-time-active' },
        ongoingReadyCategory: (ongoing.leaders || []).find((leader) => leader.status === 'ready' && (ongoing.rankings?.[leader.category]?.length || 0) >= 2)?.category || '',
        readyCategory: ready?.category || '',
        readyRows: ready?.rows?.length || 0,
        passportAddress: passportRow?.address || '',
        l2GovernanceAddress: l2Governance.rankings?.[0]?.address || '',
        l2GovernanceRows: l2Governance.rankings?.length || 0,
        l2GovernanceComplete: l2Governance.coverage?.status === 'complete' && l2Governance.coverage?.absenceMeansZero === true,
        l2GovernanceTracks: l2Governance.coverage?.tracks || [],
        unavailableCategory: unavailable?.[0] || '',
        unavailableReason: unavailable?.[1]?.reason || '',
        governanceSeasonStatus: summary.laneStatus?.governance?.status || '',
        governanceSeasonReason: summary.laneStatus?.governance?.reason || '',
        governanceActionablePeriods: summary.sourceReceipts?.governance?.votingPeriods?.length || 0,
        governanceCareerState: careers.currentProtocolContext?.state || '',
        governanceCareerSeasonId: careers.currentProtocolContext?.seasonId || '',
        governanceCareerComplete: careers.currentProtocolContext?.complete === true,
        protocol: summary.season?.protocolName || summary.season?.protocol || '',
        indexedAddresses: summary.passports?.indexedAddresses || 0
      };
    });
    assert(artifact.activeSeasonId && artifact.ongoingReadyCategory && artifact.readyCategory && /^tz[1-4]/.test(artifact.passportAddress), `tezos maxis chamber: generated crown/season fixture is incomplete ${JSON.stringify(artifact)}`);
    assert(artifact.governanceCareerComplete && artifact.governanceCareerSeasonId === artifact.activeSeasonId, `tezos maxis chamber: independent Governance career/current-period artifact is incomplete ${JSON.stringify(artifact)}`);
    assert(artifact.l2GovernanceComplete && artifact.l2GovernanceRows === 10 && artifact.l2GovernanceTracks.join(',') === 'fast,slow,sequencer' && /^tz[1-4]/.test(artifact.l2GovernanceAddress), `tezos maxis chamber: independent L2 Governance crown artifact is incomplete ${JSON.stringify(artifact)}`);

    const shellState = await page.evaluate(() => {
      const footer = document.querySelector('.maxis-footer');
      const ideaCredit = footer?.querySelector('.maxis-idea-credit');
      const footerRect = footer?.getBoundingClientRect();
      const creditRect = ideaCredit?.getBoundingClientRect();
      return {
        title: document.querySelector('#maxis-title')?.textContent?.trim() || '',
        ideaCredit: ideaCredit?.textContent?.replace(/\s+/g, ' ').trim() || '',
        ideaCredits: document.querySelectorAll('.maxis-idea-credit').length,
        heroIdeaCredits: document.querySelectorAll('.maxis-context-hero .maxis-idea-credit').length,
        ideaCreditCenterDelta: footerRect && creditRect
          ? Math.abs((footerRect.left + (footerRect.width / 2)) - (creditRect.left + (creditRect.width / 2)))
          : Number.POSITIVE_INFINITY,
        roomLabels: Array.from(document.querySelectorAll('.maxis-room-tab')).map((tab) => tab.textContent?.replace(/\s+/g, ' ').trim()),
        selectedRooms: document.querySelectorAll('.maxis-room-tab[aria-selected="true"]').length,
        selectedView: document.querySelector('.maxis-experience')?.dataset.maxisCurrentView || '',
        contextHero: document.querySelector('.maxis-context-hero')?.className || '',
        overviewCards: document.querySelectorAll('#maxis-panel-maxis [data-maxis-overview-lane]').length,
        overviewClocks: Array.from(document.querySelectorAll('#maxis-panel-maxis .maxis-identity-clock')).map((node) => node.textContent?.replace(/\s+/g, ' ').trim()),
        boards: document.querySelectorAll('.maxis-lane-board').length,
        seasonOrb: document.querySelector('.maxis-season-orb')?.getAttribute('aria-label') || '',
        methodology: document.querySelector('.maxis-methodology')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        directHref: document.querySelector('.maxis-footer a[href="/maxis/"]')?.getAttribute('href') || '',
        bodyOverflow: document.body.style.overflow,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert(shellState.title === 'Who is a Maxi?' && /maxis-maxis-hero/.test(shellState.contextHero), `tezos maxis chamber: default hero is not neutral Maxis identity context ${JSON.stringify(shellState)}`);
    assert(shellState.ideaCredit === '✦ Chamber idea by opeculiar' && shellState.ideaCredits === 1 && shellState.heroIdeaCredits === 0 && shellState.ideaCreditCenterDelta <= 2, `tezos maxis chamber: centered footer idea credit contract failed ${JSON.stringify(shellState)}`);
    assert(shellState.roomLabels.map((label) => label.replace(/\s+/g, '')).join(',') === '♛Maxis,◉Season,✺Passport,◇Champions' && shellState.selectedRooms === 1 && shellState.selectedView === 'maxis', `tezos maxis chamber: default four-room contract failed ${JSON.stringify(shellState)}`);
    assert(shellState.overviewCards === artifact.ongoingCategories.length && shellState.overviewClocks.length === artifact.ongoingCategories.length, `tezos maxis chamber: canonical all-lane overview is incomplete ${JSON.stringify(shellState)}`);
    assert(shellState.boards === 1, `tezos maxis chamber: canonical overview should expose one selected detailed board, got ${shellState.boards}`);
    assert(shellState.seasonOrb === '', `tezos maxis chamber: season selector must not appear above canonical Maxis ${shellState.seasonOrb}`);
    assert(/crowns are objective activity metrics/i.test(shellState.methodology), `tezos maxis chamber: objective-crown disclosure missing ${shellState.methodology}`);
    assert(shellState.directHref === '/maxis/' && shellState.bodyOverflow === 'hidden' && shellState.horizontalOverflow <= 1, `tezos maxis chamber: route, scroll lock, or overflow mismatch ${JSON.stringify(shellState)}`);

    const expectedClockLabels = new Set(['all time', 'all time · active', 'live', '30d', '90d', 'cross-lane']);
    assert(Object.values(artifact.ongoingClocks).every((clock) => ['all-time', 'all-time-active', 'live', 'rolling-30d', 'rolling-90d', 'mixed'].includes(clock)), `tezos maxis chamber: canonical artifact contains an undeclared natural clock ${JSON.stringify(artifact.ongoingClocks)}`);
    assert(shellState.overviewClocks.every((clock) => expectedClockLabels.has(clock.replace(/^◷\s*/, ''))), `tezos maxis chamber: overview clock labels are not explicit ${JSON.stringify(shellState.overviewClocks)}`);

    await page.locator('[data-maxis-overview-lane="l2_governance"]').click();
    await page.locator('#maxis-maxis-detail [data-maxis-board="l2_governance"]').waitFor({ state: 'visible', timeout: 10000 });
    const l2GovernanceState = await page.evaluate(() => {
      const board = document.querySelector('#maxis-maxis-detail [data-maxis-board="l2_governance"]');
      const detail = document.querySelector('#maxis-maxis-detail');
      return {
        selected: document.querySelector('[data-maxis-overview-lane="l2_governance"]')?.getAttribute('aria-pressed') || '',
        boardCount: document.querySelectorAll('#maxis-panel-maxis .maxis-lane-board').length,
        podium: board?.querySelectorAll('.maxis-podium-place').length || 0,
        compact: board?.querySelectorAll('.maxis-compact-row').length || 0,
        contexts: detail?.querySelectorAll('.maxis-l2-governance-context').length || 0,
        chamberHref: detail?.querySelector('.maxis-governance-context-action[href="/l2chamber/"]')?.getAttribute('href') || '',
        text: detail?.textContent?.replace(/\s+/g, ' ').trim() || '',
        detailOverflow: detail ? detail.scrollWidth - detail.clientWidth : Infinity,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        seasonOrbs: document.querySelectorAll('.maxis-season-orb').length
      };
    });
    assert(l2GovernanceState.selected === 'true' && l2GovernanceState.boardCount === 1
      && l2GovernanceState.podium === 3 && l2GovernanceState.compact === 7,
    `tezos maxis chamber: L2 Governance canonical top ten did not render ${JSON.stringify(l2GovernanceState)}`);
    assert(l2GovernanceState.contexts === 1 && l2GovernanceState.chamberHref === '/l2chamber/'
      && /L2 Governance Maxi/i.test(l2GovernanceState.text)
      && /FAST \/ SLOW \/ SEQUENCER/i.test(l2GovernanceState.text)
      && /represented baker/i.test(l2GovernanceState.text),
    `tezos maxis chamber: L2 Governance identity, methodology, or L2 Chamber handoff is missing ${JSON.stringify(l2GovernanceState)}`);
    assert(l2GovernanceState.detailOverflow <= 1 && l2GovernanceState.pageOverflow <= 1 && l2GovernanceState.seasonOrbs === 0,
    `tezos maxis chamber: L2 Governance board overflows or leaked the frozen Season selector ${JSON.stringify(l2GovernanceState)}`);

    await page.locator(`[data-maxis-overview-lane="${artifact.ongoingReadyCategory}"]`).click();
    await page.locator(`#maxis-maxis-detail [data-maxis-board="${artifact.ongoingReadyCategory}"]`).waitFor({ state: 'visible', timeout: 10000 });
    const ongoingDetail = await page.evaluate((category) => ({
      selected: document.querySelector(`[data-maxis-overview-lane="${category}"]`)?.getAttribute('aria-pressed'),
      boards: document.querySelectorAll('#maxis-panel-maxis .maxis-lane-board').length,
      detail: document.querySelector('#maxis-maxis-detail')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }), artifact.ongoingReadyCategory);
    assert(ongoingDetail.selected === 'true' && ongoingDetail.boards === 1 && /Detailed board/i.test(ongoingDetail.detail), `tezos maxis chamber: canonical lane did not open its detailed board ${JSON.stringify(ongoingDetail)}`);

    await page.locator('[data-maxis-view="season"]').click();
    await page.waitForFunction(() => document.querySelector('.maxis-experience')?.dataset.maxisCurrentView === 'season');
    // The hero fades for 700ms; a 600ms sleep can sample fractional transforms.
    // Measure settled geometry without relaxing any containment assertion.
    await page.waitForFunction(() => {
      const hero = document.querySelector('.maxis-protocol-hero');
      return hero && getComputedStyle(hero).opacity === '1'
        && hero.getAnimations().every(animation => animation.playState === 'finished');
    }, null, { timeout: 5000 });
    // Hero containment is a top-of-room contract; pinned controls remain in
    // the viewport after the hero scrolls away. Exercise both states explicitly.
    await page.locator('.maxis-content').evaluate(room => room.scrollTo({ top: 0, behavior: 'instant' }));
    const seasonShell = await page.evaluate(() => {
      const bounds = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
      };
      const hero = bounds('.maxis-protocol-hero');
      const orb = bounds('.maxis-season-orb');
      const close = bounds('#maxis-modal .chamber-close');
      return {
        title: document.querySelector('#maxis-title')?.textContent?.trim() || '',
        orbLabel: document.querySelector('.maxis-season-orb')?.getAttribute('aria-label') || '',
        boards: document.querySelectorAll('#maxis-panel-season .maxis-lane-board').length,
        overviewCards: document.querySelectorAll('[data-maxis-overview-lane]').length,
        corners: hero && orb && close ? {
          hero, orb, close,
          scrollTop: document.querySelector('.maxis-content')?.scrollTop,
          transform: getComputedStyle(document.querySelector('.maxis-protocol-hero')).transform,
          animation: document.querySelector('.maxis-protocol-hero').getAnimations().map(animation => ({ state: animation.playState, currentTime: animation.currentTime })),
          topDelta: Math.abs(orb.top - close.top),
          insetDelta: Math.abs((orb.left - hero.left) - (hero.right - close.right)),
          leftInset: orb.left - hero.left,
          rightInset: hero.right - close.right,
          orbInside: orb.left >= hero.left && orb.top >= hero.top && orb.right <= hero.right && orb.bottom <= hero.bottom,
          closeInside: close.left >= hero.left && close.top >= hero.top && close.right <= hero.right && close.bottom <= hero.bottom,
          orbSize: Math.min(orb.width, orb.height),
          closeSize: Math.min(close.width, close.height)
        } : null
      };
    });
    assert(new RegExp(artifact.protocol, 'i').test(seasonShell.title) && seasonShell.orbLabel === 'Choose protocol season' && seasonShell.boards === 1 && seasonShell.overviewCards === 0, `tezos maxis chamber: Season did not restore protocol hero, orb, and one-lane board ${JSON.stringify(seasonShell)}`);
    if (ARTIFACTS_DIR && (!seasonShell.corners?.orbInside || !seasonShell.corners?.closeInside)) await page.screenshot({ path: `${ARTIFACTS_DIR}/maxis-corners-failed.png` });
    assert(seasonShell.corners?.topDelta <= 2 && seasonShell.corners?.insetDelta <= 2 && seasonShell.corners?.leftInset >= 8 && seasonShell.corners?.rightInset >= 8 && seasonShell.corners?.orbInside && seasonShell.corners?.closeInside && seasonShell.corners?.orbSize >= 44 && seasonShell.corners?.closeSize >= 44, `tezos maxis chamber: desktop corner controls are not aligned and contained ${JSON.stringify(seasonShell.corners)}`);

    const pinnedCorners = await page.locator('.maxis-content').evaluate(room => {
      room.scrollTo({ top: 410, behavior: 'instant' });
      const bounds = room.getBoundingClientRect();
      const controls = [...room.querySelectorAll('.maxis-season-orb, .chamber-close')].map(el => el.getBoundingClientRect());
      return { scrollTop: room.scrollTop, count: controls.length, contained: controls.every(rect => rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom), aligned: Math.abs(controls[0].top - controls[1].top) <= 2 };
    });
    assert(pinnedCorners.scrollTop >= 200 && pinnedCorners.count === 2 && pinnedCorners.contained && pinnedCorners.aligned, `tezos maxis chamber: scrolled corner controls escaped the room ${JSON.stringify(pinnedCorners)}`);
    await page.locator('.maxis-content').evaluate(room => room.scrollTo({ top: 0, behavior: 'instant' }));

    await page.locator('.maxis-season-orb').focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('.maxis-season-tray')?.classList.contains('is-open'));
    const selectorState = await page.evaluate(() => {
      const menu = document.querySelector('.maxis-season-menu')?.getBoundingClientRect();
      const close = document.querySelector('#maxis-modal .chamber-close')?.getBoundingClientRect();
      const overlaps = menu && close && menu.left < close.right && menu.right > close.left && menu.top < close.bottom && menu.bottom > close.top;
      return {
        expanded: document.querySelector('.maxis-season-orb')?.getAttribute('aria-expanded'),
        options: document.querySelectorAll('.maxis-season-option[role="menuitemradio"]').length,
        focusedRole: document.activeElement?.getAttribute('role') || '',
        menuInsideViewport: Boolean(menu && menu.left >= 0 && menu.top >= 0 && menu.right <= window.innerWidth && menu.bottom <= window.innerHeight),
        menuOverlapsClose: Boolean(overlaps)
      };
    });
    assert(selectorState.expanded === 'true' && selectorState.options === artifact.seasonCount && selectorState.focusedRole === 'menuitemradio', `tezos maxis chamber: selector keyboard contract failed ${JSON.stringify(selectorState)}`);
    assert(selectorState.menuInsideViewport && !selectorState.menuOverlapsClose, `tezos maxis chamber: season menu collides with the corner controls or viewport ${JSON.stringify(selectorState)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.maxis-season-orb')?.getAttribute('aria-expanded') === 'false');
    assert(await page.locator('#maxis-modal').evaluate((modal) => modal.classList.contains('active')), 'tezos maxis chamber: Escape should close the selector before the chamber');

    await page.locator(`[data-maxis-lane="${artifact.readyCategory}"]`).click();
    await page.locator(`[data-maxis-board="${artifact.readyCategory}"]`).waitFor({ state: 'visible', timeout: 10000 });
    const readyState = await page.evaluate(({ category, total }) => {
      const board = document.querySelector(`[data-maxis-board="${category}"]`);
      const telemetry = document.querySelector(`.maxis-honors-panel[aria-label*="${category === 'artist' ? 'Art' : ''}"]`) || document.querySelector('.maxis-honors-panel');
      return {
        boardCount: document.querySelectorAll('.maxis-lane-board').length,
        lanePressed: document.querySelector(`[data-maxis-lane="${category}"]`)?.getAttribute('aria-pressed'),
        podium: board?.querySelectorAll('.maxis-podium-place').length || 0,
        podiumCrowns: Array.from(board?.querySelectorAll('.maxis-podium-place .maxis-podium-crown') || []).map((crown) => crown.closest('.maxis-podium-place')?.getAttribute('data-place') || ''),
        compact: board?.querySelectorAll('.maxis-compact-row').length || 0,
        rowMenus: board?.querySelectorAll('.maxis-row-menu-toggle').length || 0,
        rowControls: Array.from(board?.querySelectorAll('.maxis-row-menu-toggle') || []).map((button) => {
          const controlledId = button.getAttribute('aria-controls') || '';
          return {
            expanded: button.getAttribute('aria-expanded') || '',
            controlledId,
            targetCount: controlledId ? document.querySelectorAll(`#${CSS.escape(controlledId)}`).length : 0
          };
        }),
        telemetry: telemetry?.textContent?.replace(/\s+/g, ' ').trim() || '',
        expectedVisible: Math.min(10, total)
      };
    }, { category: artifact.readyCategory, total: artifact.readyRows });
    assert(readyState.boardCount === 1 && readyState.lanePressed === 'true', `tezos maxis chamber: selected lane state failed ${JSON.stringify(readyState)}`);
    assert(readyState.podium === 3 && readyState.compact === Math.max(0, readyState.expectedVisible - 3) && readyState.rowMenus === readyState.expectedVisible, `tezos maxis chamber: podium/top-ten composition failed ${JSON.stringify(readyState)}`);
    assert(readyState.podiumCrowns.length === 1 && readyState.podiumCrowns[0] === '1', `tezos maxis chamber: the ceremonial crown must belong only to the gold winner ${JSON.stringify(readyState.podiumCrowns)}`);
    assert(
      readyState.rowControls.length === readyState.expectedVisible
        && readyState.rowControls.every(({ expanded, controlledId, targetCount }) => expanded === 'false'
          && (!controlledId || (/^maxis-row-actions-[a-z0-9_-]+-[a-z0-9_-]+$/.test(controlledId) && targetCount === 1))),
      `tezos maxis chamber: a closed rank toggle points at a missing or duplicate action group ${JSON.stringify(readyState.rowControls)}`
    );
    assert(/Current leader/i.test(readyState.telemetry) && /Nearest challenger/i.test(readyState.telemetry) && /Top 10 cut line/i.test(readyState.telemetry), `tezos maxis chamber: race telemetry incomplete ${readyState.telemetry}`);
    if (readyState.expectedVisible >= 2) assert(/\+\s*[\d,.]+/.test(readyState.telemetry), `tezos maxis chamber: nearest-challenger gap is not actionable ${readyState.telemetry}`);

    await page.waitForTimeout(350);
    const podiumMenuClearance = await page.evaluate((category) => {
      const board = document.querySelector(`[data-maxis-board="${category}"]`);
      return Array.from(board?.querySelectorAll('.maxis-podium-place') || []).map((place) => {
        const score = place.querySelector('small');
        const toggle = place.querySelector('.maxis-row-menu-toggle');
        const scoreRect = score?.getBoundingClientRect();
        const toggleRect = toggle?.getBoundingClientRect();
        return {
          place: place.getAttribute('data-place') || '',
          gap: scoreRect && toggleRect ? Number((toggleRect.top - scoreRect.bottom).toFixed(2)) : null
        };
      }).filter(({ gap }) => gap !== null);
    }, artifact.readyCategory);
    assert(
      podiumMenuClearance.length === Math.min(3, readyState.expectedVisible)
        && podiumMenuClearance.every(({ gap }) => gap >= 8),
      `tezos maxis chamber: podium action toggles crowd the score line ${JSON.stringify(podiumMenuClearance)}`
    );

    const compactToggleCount = await page.locator(`[data-maxis-board="${artifact.readyCategory}"] .maxis-compact-row .maxis-row-menu-toggle`).count();
    const compactActionGeometry = [];
    for (let index = 0; index < compactToggleCount; index += 1) {
      const compactToggle = page.locator(`[data-maxis-board="${artifact.readyCategory}"] .maxis-compact-row .maxis-row-menu-toggle`).nth(index);
      await compactToggle.scrollIntoViewIfNeeded();
      await compactToggle.click();
      await page.waitForFunction((category) => Boolean(document.querySelector(`[data-maxis-board="${category}"] .maxis-compact-row .maxis-row-menu-toggle[aria-expanded="true"]`)), artifact.readyCategory);
      await page.waitForFunction((category) => {
        const toggle = document.querySelector(`[data-maxis-board="${category}"] .maxis-compact-row .maxis-row-menu-toggle[aria-expanded="true"]`);
        const group = toggle?.getAttribute('aria-controls') ? document.getElementById(toggle.getAttribute('aria-controls')) : null;
        const scrollport = document.querySelector('#maxis-modal .maxis-content');
        const groupRect = group?.getBoundingClientRect();
        const scrollRect = scrollport?.getBoundingClientRect();
        return Boolean(groupRect && scrollRect && groupRect.top >= scrollRect.top && groupRect.bottom <= scrollRect.bottom);
      }, artifact.readyCategory, { timeout: 2000 });
      compactActionGeometry.push(await page.evaluate((category) => {
        const board = document.querySelector(`[data-maxis-board="${category}"]`);
        const toggle = board?.querySelector('.maxis-compact-row .maxis-row-menu-toggle[aria-expanded="true"]');
        const row = toggle?.closest('.maxis-compact-row');
        const controlledId = toggle?.getAttribute('aria-controls') || '';
        const group = controlledId ? document.getElementById(controlledId) : null;
        const scrollport = document.querySelector('#maxis-modal .maxis-content');
        const toggleRect = toggle?.getBoundingClientRect();
        const groupRect = group?.getBoundingClientRect();
        const scrollRect = scrollport?.getBoundingClientRect();
        return {
          rank: row?.querySelector('.maxis-compact-rank')?.textContent?.trim() || '',
          expanded: toggle?.getAttribute('aria-expanded') || '',
          controlledId,
          groupId: group?.id || '',
          ownedByRow: Boolean(row && group && (row.contains(group) || row.nextElementSibling === group)),
          distanceFromToggle: toggleRect && groupRect
            ? Number(Math.max(0, groupRect.top - toggleRect.bottom, toggleRect.top - groupRect.bottom).toFixed(2))
            : null,
          groupBounds: groupRect ? { top: Number(groupRect.top.toFixed(2)), bottom: Number(groupRect.bottom.toFixed(2)) } : null,
          scrollBounds: scrollRect ? { top: Number(scrollRect.top.toFixed(2)), bottom: Number(scrollRect.bottom.toFixed(2)) } : null,
          visibleInsideScrollport: Boolean(groupRect && scrollRect && groupRect.top >= scrollRect.top && groupRect.bottom <= scrollRect.bottom)
        };
      }, artifact.readyCategory));
    }
    assert(
      compactToggleCount === Math.max(0, readyState.expectedVisible - 3)
        && compactActionGeometry.every((geometry) => geometry.expanded === 'true'
          && geometry.controlledId === geometry.groupId
          && geometry.ownedByRow
          && geometry.distanceFromToggle !== null
          && geometry.distanceFromToggle <= 16
          && geometry.visibleInsideScrollport),
      `tezos maxis chamber: compact rank actions are detached from their standing or open outside the visible chamber ${JSON.stringify(compactActionGeometry)}`
    );

    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const gapReceiptToggle = page.locator('[data-maxis-board] .maxis-row-menu-toggle').nth(1);
    await gapReceiptToggle.focus();
    await page.waitForFunction(() => (
      document.activeElement === document.querySelectorAll('[data-maxis-board] .maxis-row-menu-toggle')[1]
    ));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const toggle = document.querySelectorAll('[data-maxis-board] .maxis-row-menu-toggle')[1];
      const controlledId = toggle?.getAttribute('aria-controls') || '';
      return toggle?.getAttribute('aria-expanded') === 'true'
        && Boolean(controlledId && document.getElementById(controlledId));
    });
    const rowActions = await page.evaluate(() => {
      const group = document.querySelector('.maxis-row-actions[role="group"]');
      const toggle = document.querySelector('.maxis-row-menu-toggle[aria-expanded="true"]');
      const share = group?.querySelector('.maxis-tweet-action')?.getAttribute('href') || '';
      let shareText = '';
      try {
        shareText = new URL(share).searchParams.get('text') || '';
      } catch {
        // A malformed intent URL is asserted below with the rest of the rank actions.
      }
      return {
        count: group?.querySelectorAll('.maxis-rank-action').length || 0,
        menuitemRoles: group?.querySelectorAll('[role="menuitem"]').length || 0,
        groupId: group?.id || '',
        controlledId: toggle?.getAttribute('aria-controls') || '',
        toggleLabel: toggle?.getAttribute('aria-label') || '',
        matchingGroupIds: group?.id ? document.querySelectorAll(`#${CSS.escape(group.id)}`).length : 0,
        ledger: group?.querySelector('.maxis-ledger-action')?.getAttribute('href') || '',
        myTezos: Array.from(group?.querySelectorAll('a') || []).find((link) => /My Tezos/.test(link.textContent || ''))?.getAttribute('href') || '',
        source: group?.querySelector('.maxis-source-action')?.getAttribute('href') || '',
        share,
        shareText,
        receipt: group?.querySelector('[aria-label="Frozen score receipt"]')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(rowActions.count === 4 && rowActions.menuitemRoles === 0 && /^\/#ledger-flow=tz/.test(rowActions.ledger) && /^\/#my-baker=tz/.test(rowActions.myTezos), `tezos maxis chamber: address trails or action semantics missing ${JSON.stringify(rowActions)}`);
    assert(rowActions.groupId === rowActions.controlledId && rowActions.matchingGroupIds === 1 && /^Close score receipt and trails/.test(rowActions.toggleLabel), `tezos maxis chamber: open rank action group is not uniquely controlled ${JSON.stringify(rowActions)}`);
    assert(/^https:\/\//.test(rowActions.source) && /^https:\/\/twitter\.com\/intent\/tweet\?text=/.test(rowActions.share), `tezos maxis chamber: source/share actions missing ${JSON.stringify(rowActions)}`);
    const expectedRankUrl = `https://tezos.systems/maxis/?view=season&season=${encodeURIComponent(artifact.activeSeasonId)}&lane=${encodeURIComponent(artifact.readyCategory)}`;
    assert(rowActions.shareText.includes(expectedRankUrl), `tezos maxis chamber: rank share does not preserve the selected season and lane ${JSON.stringify({ expectedRankUrl, shareText: rowActions.shareText })}`);
    assert(/Frozen score receipt/i.test(rowActions.receipt) && /rank #2/i.test(rowActions.receipt), `tezos maxis chamber: row score receipt missing ${JSON.stringify(rowActions)}`);
    assert(/actionable guarantee/i.test(rowActions.receipt) && /conservative static-vector path/i.test(rowActions.receipt) && /not a live minimum/i.test(rowActions.receipt), `tezos maxis chamber: pass-gap certainty labels are missing ${JSON.stringify(rowActions)}`);

    if (artifact.unavailableCategory) {
      await page.locator(`[data-maxis-lane="${artifact.unavailableCategory}"]`).click();
      const withheld = await page.evaluate(() => ({
        text: document.querySelector('#maxis-panel-season')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        podiums: document.querySelectorAll('#maxis-panel-season .maxis-podium').length,
        boards: document.querySelectorAll('#maxis-panel-season .maxis-lane-board').length
      }));
      assert(withheld.boards === 1 && withheld.podiums === 0 && /Winner withheld/i.test(withheld.text) && /Publication withheld/i.test(withheld.text) && /No crown or cut line/i.test(withheld.text), `tezos maxis chamber: unavailable lane inferred a result ${JSON.stringify(withheld)}`);
    }

    if (artifact.governanceSeasonStatus === 'empty') {
      await page.locator('[data-maxis-view="season"]').click();
      await page.locator('[data-maxis-lane="governance"]').click();
      const quietGovernance = await page.evaluate(() => ({
        text: document.querySelector('#maxis-panel-season')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        handoffs: document.querySelectorAll('.maxis-season-to-maxis[data-maxis-handoff-lane="governance"]').length
      }));
      const governanceTruthful = artifact.governanceActionablePeriods === 0
        ? /No actionable Governance window occurred in this protocol season/i.test(quietGovernance.text)
        : new RegExp(`${artifact.governanceActionablePeriods} actionable Governance window${artifact.governanceActionablePeriods === 1 ? '' : 's'} occurred in this protocol season`, 'i').test(quietGovernance.text)
          && /no qualifying ballot or proposal activity was recorded/i.test(quietGovernance.text);
      assert(governanceTruthful && /no season crown is declared/i.test(quietGovernance.text), `tezos maxis chamber: quiet Governance season copy is ambiguous ${JSON.stringify({ quietGovernance, artifact })}`);
      assert(quietGovernance.handoffs === 1 && /Open the ongoing L1 Governance Maxi record/i.test(quietGovernance.text), `tezos maxis chamber: quiet Governance season does not point to the enduring record ${JSON.stringify(quietGovernance)}`);
      await page.locator('.maxis-season-to-maxis[data-maxis-handoff-lane="governance"]').click();
      await page.waitForFunction(() => document.querySelector('.maxis-experience')?.dataset.maxisCurrentView === 'maxis');
      const governanceHandoff = await page.evaluate(() => ({
        selected: document.querySelector('[data-maxis-overview-lane="governance"]')?.getAttribute('aria-pressed'),
        orb: document.querySelectorAll('.maxis-season-orb').length,
        contexts: document.querySelectorAll('.maxis-governance-context').length,
        text: document.querySelector('#maxis-maxis-detail')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      }));
      assert(governanceHandoff.selected === 'true' && governanceHandoff.orb === 0 && governanceHandoff.contexts === 1 && /Governance Maxi/i.test(governanceHandoff.text), `tezos maxis chamber: quiet Governance handoff missed the enduring record ${JSON.stringify(governanceHandoff)}`);
      assert(/L1 protocol pulse · separate clock/i.test(governanceHandoff.text) && /all-time-active L1 Governance Maxi board remains the canonical crown/i.test(governanceHandoff.text), `tezos maxis chamber: Governance protocol pulse blurred the enduring crown ${JSON.stringify(governanceHandoff)}`);
    }

    await page.locator('[data-maxis-view="champions"]').click();
    await page.waitForFunction(() => document.querySelector('.maxis-experience')?.dataset.maxisCurrentView === 'champions');
    const championsShell = await page.evaluate(() => ({
      title: document.querySelector('#maxis-title')?.textContent?.trim() || '',
      hero: document.querySelector('.maxis-context-hero')?.className || '',
      seasonOrbs: document.querySelectorAll('.maxis-season-orb').length
    }));
    assert(championsShell.title === 'Champions' && /maxis-champions-hero/.test(championsShell.hero) && championsShell.seasonOrbs === 0, `tezos maxis chamber: Champions is not a neutral finalized archive room ${JSON.stringify(championsShell)}`);
    if (artifact.finalizedCount === 0) {
      await page.waitForFunction(() => /first (?:Maxis|protocol) season is still live/i.test(document.querySelector('#maxis-panel-champions')?.textContent || ''));
      assert(await page.locator('#maxis-panel-champions .maxis-champion-card').count() === 0, 'tezos maxis chamber: first live season must not invent finalized champions');
    } else {
      await page.waitForFunction((count) => document.querySelectorAll('#maxis-panel-champions .maxis-champion-card').length === count, artifact.finalizedCount, { timeout: 15000 });
      const archivedText = await page.locator('#maxis-panel-champions').innerText();
      assert(/Season Honors/i.test(archivedText), `tezos maxis chamber: finalized Champions omitted Season Honors ${archivedText}`);
    }

    await page.evaluate(() => localStorage.removeItem('tezos-systems-my-baker-address'));
    await page.locator('[data-maxis-view="passport"]').click();
    await page.locator('.maxis-passport-input').fill(artifact.passportAddress);
    await page.evaluate((savedAddress) => localStorage.setItem('tezos-systems-my-baker-address', savedAddress), SAMPLE_ADDRESS);
    const passportShardRequestsBefore = passportShardRequests.length;
    await page.locator('.maxis-passport-submit').click();
    await page.waitForFunction((address) => document.querySelector('.maxis-passport-card code')?.textContent?.trim() === address, artifact.passportAddress, { timeout: 15000 });
    const passportState = await page.evaluate(({ address, savedAddress }) => ({
      pathname: window.location.pathname,
      view: new URLSearchParams(window.location.search).get('view'),
      address: new URLSearchParams(window.location.search).get('address'),
      stored: localStorage.getItem('tezos-systems-my-baker-address'),
      careerSections: document.querySelectorAll('.maxis-passport-career').length,
      seasonSections: document.querySelectorAll('.maxis-passport-season').length,
      governanceCareerCards: document.querySelectorAll('.maxis-governance-career').length,
      l1GovernanceCareerCards: document.querySelectorAll('.maxis-l1-governance-career').length,
      l2GovernanceCareerCards: document.querySelectorAll('.maxis-l2-governance-career').length,
      unavailableL2GovernanceCareerCards: document.querySelectorAll('.maxis-l2-governance-career.is-unavailable').length,
      seasonOrb: document.querySelector('.maxis-season-orb')?.getAttribute('aria-label') || '',
      lanes: document.querySelectorAll('.maxis-passport-card .maxis-passport-lane').length,
      badges: document.querySelectorAll('.maxis-passport-badge').length,
      progress: Array.from(document.querySelectorAll('.maxis-progress-track')).map((node) => node.getAttribute('aria-label')),
      text: document.querySelector('.maxis-passport-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      expectedAddress: address,
      expectedSaved: savedAddress
    }), { address: artifact.passportAddress, savedAddress: SAMPLE_ADDRESS });
    assert(passportState.pathname === '/maxis/' && passportState.view === 'passport' && passportState.address === passportState.expectedAddress, `tezos maxis chamber: address-bound Passport route failed ${JSON.stringify(passportState)}`);
    assert(passportState.stored === passportState.expectedSaved, `tezos maxis chamber: opening a Passport mutated My Tezos ${JSON.stringify(passportState)}`);
    assert(passportState.careerSections === 1 && passportState.seasonSections === 1 && passportState.seasonOrb === 'Choose protocol season', `tezos maxis chamber: Passport did not separate Career from This Season ${JSON.stringify(passportState)}`);
    const openedPassportShardRequests = passportShardRequests.slice(passportShardRequestsBefore);
    const selectedSeasonShardRequests = openedPassportShardRequests.filter((url) => url.includes(`/data/maxis/seasons/${artifact.activeSeasonId}/passports/`));
    assert(new Set(openedPassportShardRequests).size === openedPassportShardRequests.length, `tezos maxis chamber: cross-season Passport aggregation duplicated a season shard request ${JSON.stringify(openedPassportShardRequests)}`);
    assert(selectedSeasonShardRequests.length === 1, `tezos maxis chamber: selected profile and career aggregation duplicated the active-season Passport shard request ${JSON.stringify(openedPassportShardRequests)}`);
    assert(passportState.governanceCareerCards === 1 && passportState.l1GovernanceCareerCards === 1
      && /L1[\s\S]*Governance career[\s\S]*all history[\s\S]*Completed ballot-period streak/i.test(passportState.text),
    `tezos maxis chamber: Passport omitted its exact all-history L1 civic record ${JSON.stringify(passportState)}`);
    assert(passportState.l2GovernanceCareerCards === 1 && passportState.unavailableL2GovernanceCareerCards === 0
      && /L2[\s\S]*Governance career[\s\S]*all history[\s\S]*canonical windows[\s\S]*represented baker/i.test(passportState.text),
    `tezos maxis chamber: Passport omitted its independent all-history L2 civic record ${JSON.stringify(passportState)}`);
    assert(passportState.lanes > 0 && passportState.badges > 0 && passportState.progress.some((label) => /progress \d+%/.test(label || '')), `tezos maxis chamber: Passport lanes, badges, or frozen progress missing ${JSON.stringify(passportState)}`);
    assert(/Career[\s\S]*Earned identity/i.test(passportState.text)
      && new RegExp(`Cross-season breadth[\\s\\S]*${artifact.seasonCount}/${artifact.seasonCount} season receipts verified`, 'i').test(passportState.text)
      && /Career high-water marks/i.test(passportState.text)
      && /This Season stamps/i.test(passportState.text)
      && /Selected-season bests/i.test(passportState.text)
      && /toward Unicorn/i.test(passportState.text)
      && /Near misses/i.test(passportState.text), `tezos maxis chamber: Passport career/season motivation surfaces incomplete ${passportState.text}`);

    await page.locator('.maxis-passport-input').fill('KT1V5XKmeypanMS9pR65REpqmVejWBZURuuT');
    await page.locator('.maxis-passport-submit').click();
    await page.waitForFunction(() => /KT1 contract passports are not supported/i.test(document.querySelector('#maxis-panel-passport')?.textContent || ''));
    assert(await page.locator('#maxis-panel-passport .maxis-passport-card').count() === 0, 'tezos maxis chamber: KT1 must not be assigned a person Passport');

    await page.locator('[data-maxis-view="season"]').click();
    await page.locator(`[data-maxis-lane="${artifact.readyCategory}"]`).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => (
      document.querySelector('.maxis-protocol-hero')
        ?.getAnimations()
        .every((animation) => animation.playState === 'finished')
    ), null, { timeout: 2000 });
    await page.locator('.maxis-content').evaluate(room => room.scrollTo({ top: 0, behavior: 'instant' }));
    const mobileState = await page.evaluate(() => {
      const heights = (selector) => Array.from(document.querySelectorAll(selector)).filter((node) => node.getClientRects().length).map((node) => Math.round(node.getBoundingClientRect().height));
      const content = document.querySelector('.maxis-content')?.getBoundingClientRect();
      const experience = document.querySelector('.maxis-experience')?.getBoundingClientRect();
      const hero = document.querySelector('.maxis-protocol-hero');
      const heroBounds = hero?.getBoundingClientRect();
      const orbBounds = document.querySelector('.maxis-season-orb')?.getBoundingClientRect();
      const closeBounds = document.querySelector('#maxis-modal .chamber-close')?.getBoundingClientRect();
      const kicker = document.querySelector('.maxis-protocol-kicker');
      return {
        roomHeights: heights('.maxis-room-tab'),
        laneHeights: heights('.maxis-lane-chip'),
        rowMenuHeights: heights('.maxis-row-menu-toggle'),
        orbHeight: Math.round(document.querySelector('.maxis-season-orb')?.getBoundingClientRect().height || 0),
        closeHeight: Math.round(document.querySelector('#maxis-modal .chamber-close')?.getBoundingClientRect().height || 0),
        contentLeft: content?.left || 0,
        contentRight: content?.right || 0,
        contentWidth: content?.width || 0,
        experienceWidth: experience?.width || 0,
        viewportWidth: window.innerWidth,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        heroOverflow: (hero?.scrollWidth || 0) - (hero?.clientWidth || 0),
        kickerOverflow: (kicker?.scrollWidth || 0) - (kicker?.clientWidth || 0),
        cornerTopDelta: heroBounds && orbBounds && closeBounds ? Math.abs(orbBounds.top - closeBounds.top) : Infinity,
        cornerInsetDelta: heroBounds && orbBounds && closeBounds ? Math.abs((orbBounds.left - heroBounds.left) - (heroBounds.right - closeBounds.right)) : Infinity,
        cornerLeftInset: heroBounds && orbBounds ? orbBounds.left - heroBounds.left : -1,
        cornerRightInset: heroBounds && closeBounds ? heroBounds.right - closeBounds.right : -1,
        controlsInsideHero: Boolean(heroBounds && orbBounds && closeBounds
          && orbBounds.left >= heroBounds.left && orbBounds.top >= heroBounds.top && orbBounds.right <= heroBounds.right && orbBounds.bottom <= heroBounds.bottom
          && closeBounds.left >= heroBounds.left && closeBounds.top >= heroBounds.top && closeBounds.right <= heroBounds.right && closeBounds.bottom <= heroBounds.bottom)
      };
    });
    assert(mobileState.roomHeights.every((height) => height >= 44) && mobileState.laneHeights.every((height) => height >= 44) && mobileState.rowMenuHeights.every((height) => height >= 44), `tezos maxis chamber: mobile targets are below 44px ${JSON.stringify(mobileState)}`);
    assert(mobileState.orbHeight >= 44 && mobileState.closeHeight >= 44 && mobileState.contentLeft >= 0 && mobileState.contentRight <= mobileState.viewportWidth && mobileState.horizontalOverflow <= 1, `tezos maxis chamber: mobile modal geometry failed ${JSON.stringify(mobileState)}`);
    assert(mobileState.contentWidth >= mobileState.viewportWidth - 16 && mobileState.experienceWidth >= mobileState.viewportWidth - 64, `tezos maxis chamber: mobile modal gutters waste the usable viewport ${JSON.stringify(mobileState)}`);
    assert(mobileState.heroOverflow <= 1 && mobileState.kickerOverflow <= 1, `tezos maxis chamber: mobile protocol hero clips its kicker ${JSON.stringify(mobileState)}`);
    assert(mobileState.cornerTopDelta <= 2 && mobileState.cornerInsetDelta <= 2 && mobileState.cornerLeftInset >= 6 && mobileState.cornerRightInset >= 6 && mobileState.controlsInsideHero, `tezos maxis chamber: mobile corner controls are not aligned and contained ${JSON.stringify(mobileState)}`);

    await page.locator('.maxis-season-orb').click();
    await page.waitForFunction(() => document.querySelector('.maxis-season-tray')?.classList.contains('is-open'));
    const mobileMenuState = await page.evaluate(() => {
      const menu = document.querySelector('.maxis-season-menu')?.getBoundingClientRect();
      const content = document.querySelector('.maxis-content');
      const contentBounds = content?.getBoundingClientRect();
      const contentStyle = content ? getComputedStyle(content) : null;
      const clipLeft = contentBounds && contentStyle ? contentBounds.left + parseFloat(contentStyle.paddingLeft || '0') : 0;
      const clipRight = contentBounds && contentStyle ? contentBounds.right - parseFloat(contentStyle.paddingRight || '0') : 0;
      const close = document.querySelector('#maxis-modal .chamber-close')?.getBoundingClientRect();
      const overlapsClose = menu && close && menu.left < close.right && menu.right > close.left && menu.top < close.bottom && menu.bottom > close.top;
      return {
        menuLeft: menu?.left || 0,
        menuRight: menu?.right || 0,
        clipLeft,
        clipRight,
        insideContentClip: Boolean(menu && menu.left >= clipLeft - 1 && menu.right <= clipRight + 1),
        insideViewport: Boolean(menu && menu.left >= 0 && menu.top >= 0 && menu.right <= window.innerWidth && menu.bottom <= window.innerHeight),
        overlapsClose: Boolean(overlapsClose),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert(mobileMenuState.insideContentClip && mobileMenuState.insideViewport && !mobileMenuState.overlapsClose && mobileMenuState.horizontalOverflow <= 1, `tezos maxis chamber: mobile season menu is clipped or collides with a corner control ${JSON.stringify(mobileMenuState)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.maxis-season-orb')?.getAttribute('aria-expanded') === 'false');

    await page.locator('[data-maxis-view="maxis"]').click();
    await page.locator('[data-maxis-overview-lane="l2_governance"]').click();
    await page.locator('#maxis-maxis-detail [data-maxis-board="l2_governance"]').waitFor({ state: 'visible', timeout: 10000 });
    const mobileL2GovernanceState = await page.evaluate(() => {
      const detail = document.querySelector('#maxis-maxis-detail');
      const context = detail?.querySelector('.maxis-l2-governance-context');
      return {
        overviewCards: document.querySelectorAll('#maxis-panel-maxis [data-maxis-overview-lane]').length,
        detailOverflow: detail ? detail.scrollWidth - detail.clientWidth : Infinity,
        contextOverflow: context ? context.scrollWidth - context.clientWidth : Infinity,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        selected: document.querySelector('[data-maxis-overview-lane="l2_governance"]')?.getAttribute('aria-pressed') || '',
        contextLinks: context?.querySelectorAll('a[href="/l2chamber/"]').length || 0
      };
    });
    assert(mobileL2GovernanceState.overviewCards === 10 && mobileL2GovernanceState.selected === 'true'
      && mobileL2GovernanceState.contextLinks === 1 && mobileL2GovernanceState.detailOverflow <= 1
      && mobileL2GovernanceState.contextOverflow <= 1 && mobileL2GovernanceState.pageOverflow <= 1,
    `tezos maxis chamber: mobile L2 Governance board or handoff overflows ${JSON.stringify(mobileL2GovernanceState)}`);

    await page.locator('#maxis-modal .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#maxis-modal')?.classList.contains('active'));
    const entryState = await page.evaluate(() => {
      const rect = document.querySelector('#maxis-entry-card')?.getBoundingClientRect();
      return { height: rect?.height || 0, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, bodyOverflow: document.body.style.overflow };
    });
    assert(entryState.height > 0 && entryState.height <= 640 && entryState.overflow <= 1 && entryState.bodyOverflow !== 'hidden', `tezos maxis chamber: compact mobile entry/scroll restore failed ${JSON.stringify(entryState)}`);

    const maxisOpenButton = page.locator('#maxis-entry-card .chamber-expand-cue');
    await maxisOpenButton.focus();
    await page.keyboard.press('Enter');
    await page.locator('#maxis-modal.active .maxis-experience').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#maxis-modal')?.classList.contains('active'));
    await page.waitForFunction(() => document.activeElement === document.querySelector('#maxis-entry-card .chamber-expand-cue'));

    await page.evaluate(() => window.openMaxisChamber());
    await page.locator('#maxis-modal.active .maxis-experience').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-maxis-view="season"]').click();
    await page.locator(`[data-maxis-lane="${artifact.readyCategory}"]`).click();
    await page.locator('[data-maxis-board] .maxis-row-menu-toggle').first().click();
    const firstLedgerLink = page.locator('.maxis-row-actions .maxis-ledger-action');
    const ledgerHref = await firstLedgerLink.getAttribute('href');
    const ledgerTarget = decodeURIComponent((ledgerHref || '').split('=').slice(1).join('='));
    // The generated leader changes over time; pin the selected account receipt
    // before its newly prioritized navigation request can reach the deny layer.
    await page.route(`https://api.tzkt.io/v1/accounts/${ledgerTarget}`, route => fulfillJson(route, {
      address: ledgerTarget, type: 'user', balance: 0
    }));
    await firstLedgerLink.click();
    await page.waitForFunction((target) => window.location.pathname === '/' && window.location.hash === `#ledger-flow=${encodeURIComponent(target)}`, ledgerTarget, { timeout: 10000 });
    await page.locator('#ledger-flow-modal.active .ledger-flow-content').waitFor({ state: 'visible', timeout: 15000 });
    assert(await page.locator('#ledger-flow-input').inputValue() === ledgerTarget, `tezos maxis chamber: Ledger Flow did not open ${ledgerTarget}`);

    const crownAliasResponse = await page.goto(`${baseUrl}/maxis/?view=crown&lane=governance`, { waitUntil: 'domcontentloaded' });
    assert(crownAliasResponse?.ok(), `tezos maxis chamber: legacy view=crown route failed with HTTP ${crownAliasResponse?.status()}`);
    await page.waitForFunction(() => document.querySelector('.maxis-experience')?.dataset.maxisCurrentView === 'maxis', null, { timeout: 15000 });
    const crownAliasState = await page.evaluate(() => ({
      view: new URLSearchParams(window.location.search).get('view'),
      lane: new URLSearchParams(window.location.search).get('lane'),
      selected: document.querySelector('[data-maxis-overview-lane="governance"]')?.getAttribute('aria-pressed'),
      seasonOrbs: document.querySelectorAll('.maxis-season-orb').length
    }));
    assert(crownAliasState.view !== 'crown' && crownAliasState.lane === 'governance' && crownAliasState.selected === 'true' && crownAliasState.seasonOrbs === 0, `tezos maxis chamber: view=crown did not normalize to canonical Maxis ${JSON.stringify(crownAliasState)}`);

    await context.close();

    const championsRetryContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(championsRetryContext);
    await championsRetryContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    let championsManifestRequests = 0;
    let championsManifestAvailable = false;
    await championsRetryContext.route('**/data/maxis/manifest.json', async (route) => {
      championsManifestRequests += 1;
      if (!championsManifestAvailable) return route.abort('failed');
      const response = await route.fetch();
      return route.fulfill({ response });
    });
    const championsRetryPage = await championsRetryContext.newPage();
    const championsRetryResponse = await championsRetryPage.goto(`${baseUrl}/maxis/?view=champions`, { waitUntil: 'domcontentloaded' });
    assert(championsRetryResponse?.ok(), `tezos maxis Champions retry: pretty route failed with HTTP ${championsRetryResponse?.status()}`);
    await championsRetryPage.locator('#maxis-panel-champions [data-maxis-archives-retry]').waitFor({ state: 'visible', timeout: 15000 });
    const championsFailureState = await championsRetryPage.evaluate(() => ({
      text: document.querySelector('#maxis-panel-champions')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      retryButtons: document.querySelectorAll('#maxis-panel-champions [data-maxis-archives-retry]').length,
      championCards: document.querySelectorAll('#maxis-panel-champions .maxis-champion-card').length
    }));
    assert(championsManifestRequests >= 1 && championsFailureState.retryButtons === 1 && championsFailureState.championCards === 0 && /final archives are scoped unavailable|final archive receipts did not load/i.test(championsFailureState.text), `tezos maxis Champions retry: the initial manifest failure was not scoped and retryable ${JSON.stringify({ championsManifestRequests, championsFailureState })}`);
    championsManifestAvailable = true;
    await championsRetryPage.locator('#maxis-panel-champions [data-maxis-archives-retry]').click();
    await championsRetryPage.waitForFunction((expectArchives) => {
      const panel = document.querySelector('#maxis-panel-champions');
      const text = panel?.textContent || '';
      const cards = panel?.querySelectorAll('.maxis-champion-card').length || 0;
      const retry = panel?.querySelector('[data-maxis-archives-retry]');
      return !retry && (expectArchives ? cards > 0 : cards === 0 && /first (?:Maxis|protocol) season is still live/i.test(text));
    }, artifact.finalizedCount > 0, { timeout: 15000 });
    const championsRecoveryState = await championsRetryPage.evaluate(() => ({
      text: document.querySelector('#maxis-panel-champions')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      retryButtons: document.querySelectorAll('#maxis-panel-champions [data-maxis-archives-retry]').length,
      championCards: document.querySelectorAll('#maxis-panel-champions .maxis-champion-card').length
    }));
    assert(championsManifestRequests >= 2 && championsRecoveryState.retryButtons === 0 && (artifact.finalizedCount > 0 ? championsRecoveryState.championCards > 0 : championsRecoveryState.championCards === 0 && /first (?:Maxis|protocol) season is still live/i.test(championsRecoveryState.text)), `tezos maxis Champions retry: a successful manifest retry did not restore the honest archive state ${JSON.stringify({ championsManifestRequests, championsRecoveryState })}`);
    await championsRetryContext.close();

    const archiveContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(archiveContext);
    await archiveContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    await archiveContext.route('**/data/maxis/manifest.json', async (route) => {
      const response = await route.fetch();
      const manifest = await response.json();
      manifest.archives = [
        ...(Array.isArray(manifest.archives) ? manifest.archives : []),
        {
          id: 'protocol-legacy-frozen-lanes',
          summaryPath: '/data/maxis/seasons/archive-test/summary.json',
          archiveUrl: '/data/maxis/seasons/archive-test/summary.json',
          rulesPath: '/data/maxis/seasons/archive-test/rules.json',
          season: {
            id: 'protocol-legacy-frozen-lanes',
            seasonOrdinal: 0,
            protocolName: 'Legacy Protocol',
            displayLabel: 'Legacy Protocol Season',
            status: 'finalized',
            activatedAt: '2025-01-01T00:00:00.000Z',
            endsAt: '2025-02-01T00:00:00.000Z'
          },
          laneCatalog: [
            { category: 'transaction', title: 'Original Motion Crown', order: 5 },
            { category: 'legacy_relics', title: 'Heritage Curator', order: 20 }
          ],
          champions: [
            { category: 'legacy_relics', title: 'Heritage Curator', laneOrder: 20, rank: 1, address: SAMPLE_ADDRESS_2, alias: 'Archive Keeper', scoreLabel: '88 heritage transfers', sourceUrl: `https://tzkt.io/${SAMPLE_ADDRESS_2}/operations/` },
            { category: 'transaction', title: 'Original Motion Crown', laneOrder: 5, rank: 1, address: SAMPLE_ADDRESS, alias: 'First Mover', scoreLabel: '144 season transactions', sourceUrl: `https://tzkt.io/${SAMPLE_ADDRESS}/operations/` }
          ],
          honors: {}
        }
      ];
      manifest.inlinePassports = {
        ...(manifest.inlinePassports || {}),
        [SAMPLE_ADDRESS_2]: {
          format: 'transaction-only-v1',
          address: SAMPLE_ADDRESS_2,
          alias: 'Compact Mover',
          transaction: {
            rank: 17,
            eligibleCount: 600,
            outsidePublishedDepth: false,
            scoreLabel: '42 season transactions',
            scoreVector: [{ metric: 'transactions', label: 'season transactions', unit: 'transactions', value: 42 }],
            delta: 3,
            previousRank: 20,
            topTenGap: {
              targetRank: 10,
              guaranteedPrimary: { metric: 'transactions', label: 'season transactions', unit: 'transactions', amount: 9 },
              conservativeVectorPath: [{ metric: 'transactions', label: 'season transactions', unit: 'transactions', amount: 8 }]
            },
            badgeProgress: { label: 'Transaction Maxi', metric: 'transactions', unit: 'transactions', value: 42, target: 100, remaining: 58, percent: 42, earned: false },
            activeWeeks: [1, 2],
            personalBestRank: 17,
            sourceUrl: `https://tzkt.io/${SAMPLE_ADDRESS_2}`
          },
          personalBest: { rank: 17, scoreLabel: '42 season transactions' },
          badges: [{ id: 'opaque-season-badge', label: 'Transaction Maxi lane touched' }],
          activeWeeks: [1, 2],
          activeWeekStreak: 2,
          unicornProgress: {
            qualifyingLanes: [{ category: 'transaction', rank: 17 }],
            breadth: 1,
            lanesNeeded: 2,
            progressPercent: 33,
            badgeProgress: { label: 'Season Unicorn', unit: 'lanes', value: 1, target: 3, remaining: 2, percent: 33, earned: false }
          }
        },
        [SAMPLE_ADDRESS]: {
          format: 'transaction-only-v1',
          address: SAMPLE_ADDRESS,
          alias: 'Outside Hundred',
          transaction: {
            rank: 117,
            eligibleCount: 600,
            outsidePublishedDepth: false,
            scoreLabel: '12 season transactions',
            scoreVector: [{ metric: 'transactions', label: 'season transactions', unit: 'transactions', value: 12 }],
            delta: null,
            previousRank: null,
            topTenGap: null,
            badgeProgress: { label: 'Transaction Maxi', metric: 'transactions', unit: 'transactions', value: 12, target: 100, remaining: 88, percent: 12, earned: false },
            activeWeeks: [1],
            personalBestRank: 117,
            sourceUrl: `https://tzkt.io/${SAMPLE_ADDRESS}`
          },
          personalBest: { rank: 117, scoreLabel: '12 season transactions' },
          badges: [{ id: 'another-opaque-season-badge', label: 'Transaction Maxi lane touched' }],
          activeWeeks: [1],
          activeWeekStreak: 1
        }
      };
      return fulfillJson(route, manifest);
    });
    const archivePage = await archiveContext.newPage();
    attachIssueCollectors(archivePage, 'tezos maxis frozen archive', issues);
    const archiveResponse = await archivePage.goto(`${baseUrl}/maxis/?view=champions`, { waitUntil: 'domcontentloaded' });
    assert(archiveResponse?.ok(), `tezos maxis frozen archive: pretty route failed with HTTP ${archiveResponse?.status()}`);
    const legacyArchiveCard = archivePage.locator('#maxis-panel-champions .maxis-champion-card').filter({ hasText: 'Legacy Protocol' });
    await legacyArchiveCard.waitFor({ state: 'visible', timeout: 15000 });
    const frozenLaneLabels = await legacyArchiveCard.locator('.maxis-champion-row > span:first-child').allTextContents();
    assert(frozenLaneLabels.slice(0, 2).join('|') === 'Original Motion Crown|Heritage Curator', `tezos maxis frozen archive: current taxonomy rewrote frozen lane title/order ${JSON.stringify(frozenLaneLabels)}`);
    assert(!frozenLaneLabels.includes('Legacy Relics'), `tezos maxis frozen archive: unknown old lane fell through to the current labeler ${JSON.stringify(frozenLaneLabels)}`);
    const archiveReceiptState = await legacyArchiveCard.evaluate((card, expectedAddress) => {
      const record = Array.from(card.querySelectorAll('.maxis-champion-record')).find((node) => /Heritage Curator/.test(node.textContent || ''));
      const archiveActions = card.querySelector('.maxis-archive-actions[role="group"]');
      return {
        records: card.querySelectorAll('.maxis-champion-record').length,
        address: record?.querySelector('.maxis-champion-identity code')?.getAttribute('title') || '',
        score: record?.querySelector('.maxis-champion-identity small')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        ledger: record?.querySelector('.maxis-champion-actions .maxis-ledger-action')?.getAttribute('href') || '',
        source: record?.querySelector('.maxis-champion-actions .maxis-source-action')?.getAttribute('href') || '',
        actionGroups: record?.querySelectorAll('.maxis-champion-actions[role="group"]').length || 0,
        finalReceiptText: archiveActions?.querySelector('.maxis-archive-summary-action')?.textContent?.trim() || '',
        finalReceiptHref: archiveActions?.querySelector('.maxis-archive-summary-action')?.getAttribute('href') || '',
        frozenRulesText: archiveActions?.querySelector('.maxis-archive-rules-action')?.textContent?.trim() || '',
        frozenRulesHref: archiveActions?.querySelector('.maxis-archive-rules-action')?.getAttribute('href') || '',
        expectedAddress
      };
    }, SAMPLE_ADDRESS_2);
    assert(archiveReceiptState.records === 2 && archiveReceiptState.address === archiveReceiptState.expectedAddress && archiveReceiptState.score === '88 heritage transfers', `tezos maxis frozen archive: champion identity or final score was lost ${JSON.stringify(archiveReceiptState)}`);
    assert(archiveReceiptState.actionGroups === 1 && archiveReceiptState.ledger === `/#ledger-flow=${encodeURIComponent(SAMPLE_ADDRESS_2)}` && archiveReceiptState.source === `https://tzkt.io/${SAMPLE_ADDRESS_2}/operations/`, `tezos maxis frozen archive: champion on-chain trails are incomplete ${JSON.stringify(archiveReceiptState)}`);
    assert(/^Final receipt/.test(archiveReceiptState.finalReceiptText) && archiveReceiptState.finalReceiptHref.endsWith('/data/maxis/seasons/archive-test/summary.json'), `tezos maxis frozen archive: final summary receipt is missing ${JSON.stringify(archiveReceiptState)}`);
    assert(/^Frozen rules/.test(archiveReceiptState.frozenRulesText) && archiveReceiptState.frozenRulesHref.endsWith('/data/maxis/seasons/archive-test/rules.json'), `tezos maxis frozen archive: frozen rules receipt is missing ${JSON.stringify(archiveReceiptState)}`);
    await archivePage.locator('[data-maxis-view="passport"]').click();
    await archivePage.locator('.maxis-passport-input').fill(SAMPLE_ADDRESS_2);
    await archivePage.locator('.maxis-passport-submit').click();
    await archivePage.waitForFunction((address) => document.querySelector('.maxis-passport-card code')?.textContent?.trim() === address, SAMPLE_ADDRESS_2, { timeout: 15000 });
    const compactPassportText = await archivePage.locator('.maxis-passport-card').innerText();
    assert(/Compact Mover/.test(compactPassportText) && /33%[\s\S]*1\/3 qualifying lanes toward Unicorn/.test(compactPassportText) && /#17 · 42% badge/.test(compactPassportText) && /\+9 transactions to guarantee #10/.test(compactPassportText), `tezos maxis compact Passport: transaction lane adapter failed ${compactPassportText}`);
    assert(/Selected-season bests[\s\S]*Transaction[\s\S]*#17/i.test(compactPassportText) && /2 consecutive completed weeks/i.test(compactPassportText), `tezos maxis compact Passport: best or streak was lost ${compactPassportText}`);
    assert(/Near misses[\s\S]*Transaction Top 10[\s\S]*\+9 transactions to guarantee #10/i.test(compactPassportText), `tezos maxis compact Passport: transaction near miss was lost ${compactPassportText}`);
    await archivePage.locator('.maxis-passport-input').fill(SAMPLE_ADDRESS);
    await archivePage.locator('.maxis-passport-submit').click();
    await archivePage.waitForFunction((address) => document.querySelector('.maxis-passport-card code')?.textContent?.trim() === address, SAMPLE_ADDRESS, { timeout: 15000 });
    const outsideHundredPassportText = await archivePage.locator('.maxis-passport-card').innerText();
    assert(/Outside Hundred/.test(outsideHundredPassportText) && /0\/3 qualifying lanes toward Unicorn/.test(outsideHundredPassportText) && /#117 · 12% badge/.test(outsideHundredPassportText), `tezos maxis compact Passport: outside-top-100 breadth was inflated ${outsideHundredPassportText}`);
    await archiveContext.close();

    const identityContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(identityContext);
    await identityContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    await identityContext.route('**/data/maxis/seasons/**/summary.json', async (route) => {
      const response = await route.fetch();
      const summary = await response.json();
      summary.season = { ...(summary.season || {}), protocolHash: 'PsMixedDeploySummaryReceipt' };
      return fulfillJson(route, summary);
    });
    const identityPage = await identityContext.newPage();
    attachIssueCollectors(identityPage, 'tezos maxis summary identity', issues);
    const identityResponse = await identityPage.goto(`${baseUrl}/maxis/`, { waitUntil: 'domcontentloaded' });
    assert(identityResponse?.ok(), `tezos maxis summary identity: pretty route failed with HTTP ${identityResponse?.status()}`);
    await identityPage.locator('#maxis-modal.active .maxis-experience').waitFor({ state: 'visible', timeout: 15000 });
    assert(await identityPage.locator('#maxis-panel-maxis [data-maxis-overview-lane]').count() === artifact.ongoingCategories.length, 'tezos maxis summary identity: a broken season blanked the canonical Maxis room');
    await identityPage.locator('[data-maxis-view="season"]').click();
    await identityPage.waitForFunction(() => /Selected season is scoped unavailable/i.test(document.querySelector('#maxis-panel-season')?.textContent || ''), null, { timeout: 15000 });
    const identityErrorText = await identityPage.locator('#maxis-panel-season').innerText();
    assert(/identity receipt/i.test(identityErrorText) && /protocol hash/i.test(identityErrorText), `tezos maxis summary identity: mismatched summary was not rejected locally ${identityErrorText}`);
    assert(await identityPage.locator('#maxis-panel-season [data-maxis-board]').count() === 0, 'tezos maxis summary identity: wrong-season data rendered before rejection');
    await identityPage.locator('[data-maxis-view="maxis"]').click();
    assert(await identityPage.locator('#maxis-panel-maxis [data-maxis-overview-lane]').count() === artifact.ongoingCategories.length, 'tezos maxis summary identity: canonical Maxis did not recover after inspecting the scoped season failure');
    await identityContext.close();

    const integrityContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(integrityContext);
    await integrityContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    await integrityContext.route('**/data/maxis/seasons/**/passports/*.json', async (route) => {
      const source = new URL(route.request().url());
      source.pathname = source.pathname.replace(/^\/data\/transports\/v1(?=\/data\/)/, '');
      const response = await route.fetch({ url: source.href });
      const { value: shard } = await decodeGeneratedTransport(await response.text(), source.pathname,
        value => createHash('sha256').update(value).digest('hex'));
      shard.smokeAlteredReceipt = true;
      // Keep the transport internally valid so the independent season receipt,
      // not just the outer decoder, must reject the altered original bytes.
      const raw = `${JSON.stringify(shard, null, 2)}\n`;
      const transport = await encodeGeneratedTransport(raw, source.pathname,
        value => createHash('sha256').update(value).digest('hex'));
      await fulfillJson(route, transport);
    });
    const integrityPage = await integrityContext.newPage();
    attachIssueCollectors(integrityPage, 'tezos maxis Passport integrity', issues);
    const integrityResponse = await integrityPage.goto(`${baseUrl}/maxis/`, { waitUntil: 'domcontentloaded' });
    assert(integrityResponse?.ok(), `tezos maxis Passport integrity: pretty route failed with HTTP ${integrityResponse?.status()}`);
    await integrityPage.locator('#maxis-modal.active .maxis-experience').waitFor({ state: 'visible', timeout: 15000 });
    await integrityPage.locator('[data-maxis-view="passport"]').click();
    await integrityPage.locator('.maxis-passport-input').fill(artifact.passportAddress);
    await integrityPage.locator('.maxis-passport-submit').click();
    await integrityPage.locator('[data-maxis-passport-retry]').waitFor({ state: 'visible', timeout: 15000 });
    const integrityState = await integrityPage.evaluate(() => ({
      text: document.querySelector('#maxis-panel-passport')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      retryButtons: document.querySelectorAll('[data-maxis-passport-retry]').length,
      passportCards: document.querySelectorAll('.maxis-passport-card').length
    }));
    assert(integrityState.retryButtons === 1 && integrityState.passportCards === 0 && /failed its SHA-256 integrity receipt/i.test(integrityState.text), `tezos maxis Passport integrity: altered shard was not rejected ${JSON.stringify(integrityState)}`);
    await integrityPage.locator('[data-maxis-view="season"]').click();
    await integrityPage.waitForFunction(() => document.querySelector('.maxis-experience')?.dataset.maxisCurrentView === 'season');
    assert(await integrityPage.locator('#maxis-panel-season .maxis-lane-board').count() === 1, 'tezos maxis Passport integrity: a rejected shard must not break the other rooms');
    await integrityContext.close();

    const seasonFaultContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(seasonFaultContext);
    await seasonFaultContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    await seasonFaultContext.route('**/data/maxis/seasons/**/summary.json', (route) => route.abort('failed'));
    const seasonFaultPage = await seasonFaultContext.newPage();
    const seasonFaultResponse = await seasonFaultPage.goto(`${baseUrl}/maxis/?view=season`, { waitUntil: 'domcontentloaded' });
    assert(seasonFaultResponse?.ok(), `tezos maxis season fault: pretty route failed with HTTP ${seasonFaultResponse?.status()}`);
    await seasonFaultPage.locator('#maxis-panel-season [data-maxis-season-retry]').waitFor({ state: 'visible', timeout: 15000 });
    const seasonFaultState = await seasonFaultPage.evaluate(() => ({
      text: document.querySelector('#maxis-panel-season')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      retryButtons: document.querySelectorAll('#maxis-panel-season [data-maxis-season-retry]').length,
      seasonBoards: document.querySelectorAll('#maxis-panel-season [data-maxis-board]').length
    }));
    assert(seasonFaultState.retryButtons === 1 && seasonFaultState.seasonBoards === 0 && /Selected season is scoped unavailable/i.test(seasonFaultState.text) && /selected season sheet did not pass its receipt/i.test(seasonFaultState.text), `tezos maxis season fault: declared summary failure is not scoped and retryable ${JSON.stringify(seasonFaultState)}`);
    assert(!/first (?:Maxis )?season is forming|first protocol season is still live/i.test(seasonFaultState.text), `tezos maxis season fault: a failed declared summary was misreported as a pre-season state ${JSON.stringify(seasonFaultState)}`);
    await seasonFaultPage.locator('[data-maxis-view="maxis"]').click();
    await seasonFaultPage.waitForFunction((count) => document.querySelectorAll('#maxis-panel-maxis [data-maxis-overview-lane]').length === count, artifact.ongoingCategories.length, { timeout: 10000 });
    assert(await seasonFaultPage.locator('#maxis-panel-maxis [data-maxis-overview-lane]').count() === artifact.ongoingCategories.length, `tezos maxis season fault: scoped failure blanked canonical Maxis ${JSON.stringify(seasonFaultState)}`);
    await seasonFaultContext.close();

    const l2FaultContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(l2FaultContext);
    await l2FaultContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    await l2FaultContext.route('**/data/maxis-l2-governance.json', async (route) => {
      const response = await route.fetch();
      const artifactPayload = await response.json();
      artifactPayload.integrity = { ...(artifactPayload.integrity || {}), contentHash: '0'.repeat(64) };
      return fulfillJson(route, artifactPayload);
    });
    const l2FaultPage = await l2FaultContext.newPage();
    attachIssueCollectors(l2FaultPage, 'tezos maxis L2 Governance fault isolation', issues);
    const l2FaultResponse = await l2FaultPage.goto(`${baseUrl}/maxis/?lane=l2_governance`, { waitUntil: 'domcontentloaded' });
    assert(l2FaultResponse?.ok(), `tezos maxis L2 Governance fault: pretty route failed with HTTP ${l2FaultResponse?.status()}`);
    await l2FaultPage.waitForFunction(() => /L2 Governance Maxi is scoped unavailable/i.test(document.querySelector('#maxis-maxis-detail')?.textContent || ''), null, { timeout: 15000 });
    const l2FaultState = await l2FaultPage.evaluate(() => ({
      overviewCards: document.querySelectorAll('#maxis-panel-maxis [data-maxis-overview-lane]').length,
      selected: document.querySelector('[data-maxis-overview-lane="l2_governance"]')?.getAttribute('aria-pressed') || '',
      unavailableContexts: document.querySelectorAll('#maxis-maxis-detail .maxis-l2-governance-context.is-unavailable').length,
      podiums: document.querySelectorAll('#maxis-maxis-detail .maxis-podium').length,
      chamberLinks: document.querySelectorAll('#maxis-maxis-detail a[href="/l2chamber/"]').length,
      seasonOrbs: document.querySelectorAll('.maxis-season-orb').length,
      text: document.querySelector('#maxis-maxis-detail')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(l2FaultState.overviewCards === 10 && l2FaultState.selected === 'true'
      && l2FaultState.unavailableContexts === 1 && l2FaultState.podiums === 0
      && l2FaultState.chamberLinks === 1 && l2FaultState.seasonOrbs === 0,
    `tezos maxis L2 Governance fault: independent failure was not scoped to its canonical lane ${JSON.stringify(l2FaultState)}`);
    await l2FaultPage.locator('[data-maxis-overview-lane="governance"]').click();
    await l2FaultPage.locator('#maxis-maxis-detail [data-maxis-board="governance"] .maxis-podium').waitFor({ state: 'visible', timeout: 10000 });
    await l2FaultPage.locator('[data-maxis-view="passport"]').click();
    await l2FaultPage.locator('.maxis-passport-input').fill(artifact.passportAddress);
    await l2FaultPage.locator('.maxis-passport-submit').click();
    await l2FaultPage.waitForFunction((address) => document.querySelector('.maxis-passport-card code')?.textContent?.trim() === address, artifact.passportAddress, { timeout: 15000 });
    const l2FaultPassport = await l2FaultPage.evaluate(() => ({
      cards: document.querySelectorAll('.maxis-passport-card').length,
      l1Ready: document.querySelectorAll('.maxis-l1-governance-career:not(.is-unavailable)').length,
      l2Unavailable: document.querySelectorAll('.maxis-l2-governance-career.is-unavailable').length,
      text: document.querySelector('.maxis-passport-card')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(l2FaultPassport.cards === 1 && l2FaultPassport.l1Ready === 1 && l2FaultPassport.l2Unavailable === 1
      && /L2 governance career is scoped unavailable/i.test(l2FaultPassport.text),
    `tezos maxis L2 Governance fault: Passport failure leaked into the L1 career or selected-season profile ${JSON.stringify(l2FaultPassport)}`);
    await l2FaultPage.locator('[data-maxis-view="season"]').click();
    await l2FaultPage.waitForFunction(() => document.querySelectorAll('#maxis-panel-season .maxis-lane-board').length === 1, null, { timeout: 10000 });
    await l2FaultContext.close();

    const finalizedContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(finalizedContext);
    await finalizedContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    await finalizedContext.route('**/data/maxis/manifest.json', async (route) => {
      const response = await route.fetch();
      const manifest = await response.json();
      const finalizedAt = '2026-07-09T12:00:00.000Z';
      manifest.seasons = (manifest.seasons || []).map((season) => season.id === manifest.activeSeasonId
        ? { ...season, status: 'finalized', phase: 'finalized', endsAt: finalizedAt, archiveUrl: season.summaryPath }
        : season);
      return fulfillJson(route, manifest);
    });
    await finalizedContext.route('**/data/maxis/seasons/**/summary.json', async (route) => {
      const response = await route.fetch();
      const summary = await response.json();
      summary.season = { ...(summary.season || {}), status: 'finalized', phase: 'finalized', endsAt: '2026-07-09T12:00:00.000Z' };
      return fulfillJson(route, summary);
    });
    const finalizedPage = await finalizedContext.newPage();
    attachIssueCollectors(finalizedPage, 'tezos maxis finalized phase', issues);
    const finalizedResponse = await finalizedPage.goto(`${baseUrl}/maxis/?view=season&lane=${encodeURIComponent(artifact.readyCategory)}`, { waitUntil: 'domcontentloaded' });
    assert(finalizedResponse?.ok(), `tezos maxis finalized phase: pretty route failed with HTTP ${finalizedResponse?.status()}`);
    await finalizedPage.waitForFunction((category) => {
      const experience = document.querySelector('.maxis-experience');
      const panel = document.querySelector('#maxis-panel-season');
      const board = panel?.querySelector(`[data-maxis-board="${CSS.escape(category)}"]`);
      const finalTelemetry = panel?.querySelector('.maxis-honors-panel[aria-label="Finalized season record"]');
      return experience?.dataset.maxisSeasonPhase === 'finalized'
        && Boolean(board)
        && Boolean(finalTelemetry)
        && /Finalized protocol archive/i.test(panel?.textContent || '');
    }, artifact.readyCategory, { timeout: 15000 });
    const finalizedSeasonText = await finalizedPage.locator('#maxis-panel-season').innerText();
    assert(/Finalized protocol archive[\s\S]*Frozen season standings/i.test(finalizedSeasonText) && /frozen at finalization/i.test(finalizedSeasonText), `tezos maxis finalized phase: Season retained live race copy ${finalizedSeasonText}`);
    assert(/Final leader/i.test(finalizedSeasonText) && /Final runner-up/i.test(finalizedSeasonText), `tezos maxis finalized phase: final telemetry retained live leader labels ${finalizedSeasonText}`);
    assert(!/Live protocol season|Movement makes the chamber|Season in progress|(?:^|\n)(?:Current leader|Nearest challenger|Moving Top 10 cutoff)(?:\n|$)|next(?: season)? snapshot|A second snapshot|\bpending\b|active(?: protocol-bounded)? ruleset|line moves with every snapshot/im.test(finalizedSeasonText), `tezos maxis finalized phase: Season presents a frozen archive as live or moving ${finalizedSeasonText}`);
    await finalizedPage.locator('[data-maxis-view="passport"]').click();
    await finalizedPage.locator('.maxis-passport-input').fill(artifact.passportAddress);
    await finalizedPage.locator('.maxis-passport-submit').click();
    await finalizedPage.waitForFunction((address) => document.querySelector('.maxis-passport-card code')?.textContent?.trim() === address, artifact.passportAddress, { timeout: 15000 });
    const finalizedPassportText = await finalizedPage.locator('#maxis-panel-passport').innerText();
    assert(/Selected Archive[\s\S]*Archived lanes[\s\S]*frozen cut lines/i.test(finalizedPassportText), `tezos maxis finalized phase: Passport did not preserve archive scope ${finalizedPassportText}`);
    assert(!/This Season stamps|Season in progress|Current leader|Nearest challenger|Moving Top 10 cutoff|next(?: season)? snapshot|active(?: protocol-bounded)? ruleset/i.test(finalizedPassportText), `tezos maxis finalized phase: Passport presents a frozen archive as live ${finalizedPassportText}`);
    await finalizedContext.close();

    assert(issues.length === 0, `tezos maxis chamber browser issues:\n${issues.join('\n')}`);
    log('ok - tezos maxis chamber smoke');
  }

  async function smokeTezosCrpChamber(browser, baseUrl) {
    const [datasetResponse, summaryResponse] = await Promise.all([
      fetch(`${baseUrl}/data/tezoscrp-awards.json`),
      fetch(`${baseUrl}/data/tezoscrp-summary.json`)
    ]);
    assert(datasetResponse.ok && summaryResponse.ok, 'TezosCRP smoke could not load its canonical artifacts');
    const [tezosCrpDataset, tezosCrpSummary] = await Promise.all([datasetResponse.json(), summaryResponse.json()]);
    const expectedPeople = new Map(tezosCrpDataset.people_summary.map((person) => [person.person_id, person]));
    const latestPeriod = tezosCrpSummary.latest.period;
    const latestYear = Number(latestPeriod.slice(0, 4));
    const currentYearRecord = tezosCrpSummary.records.years.find(({ year }) => year === latestYear);
    const latestLabel = new Date(`${latestPeriod}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const formattedTotals = [
      tezosCrpSummary.totals.awards,
      tezosCrpSummary.totals.people,
      tezosCrpSummary.totals.periods
    ].map((value) => value.toLocaleString('en-US'));

    for (const { label, viewport } of [
      { label: 'desktop', viewport: { width: 1440, height: 1000 } },
      { label: 'mobile', viewport: { width: 390, height: 844 } }
    ]) {
      const issues = [];
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await installFeatureMocks(context);
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      });
      const page = await context.newPage();
      attachIssueCollectors(page, `TezosCRP ${label}`, issues);

      const response = await page.goto(`${baseUrl}/tezoscrp/`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `TezosCRP ${label}: pretty route failed with HTTP ${response?.status()}`);
      await page.locator('#tezoscrp-modal.active .tezoscrp-content').waitFor({ state: 'visible', timeout: 15000 });
      await assertNormalizedChamberShell(page, '#tezoscrp-modal.active', '.tezoscrp-content', 'standard', `TezosCRP ${label}`);
      await page.locator('#tezoscrp-hall-results .tezoscrp-ranking').waitFor({ state: 'visible', timeout: 15000 });

      const initial = await page.evaluate(() => {
        const modal = document.querySelector('#tezoscrp-modal.active .tezoscrp-content');
        const body = document.querySelector('#tezoscrp-modal .tezoscrp-body');
        const metrics = Array.from(document.querySelectorAll('#tezoscrp-modal .tezoscrp-metrics strong')).map((node) => node.textContent.trim());
        return {
          path: window.location.pathname,
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
          metrics,
          tabs: document.querySelectorAll('#tezoscrp-modal [data-tezoscrp-view]').length,
          tabsA11y: Array.from(document.querySelectorAll('#tezoscrp-modal [data-tezoscrp-view]')).map((tab) => ({
            view: tab.dataset.tezoscrpView || '',
            id: tab.id || '',
            controls: tab.getAttribute('aria-controls') || '',
            selected: tab.getAttribute('aria-selected') || '',
            tabIndex: tab.tabIndex
          })),
          tabPanel: (() => {
            const panel = document.querySelector('#tezoscrp-view');
            return {
              role: panel?.getAttribute('role') || '',
              labelledBy: panel?.getAttribute('aria-labelledby') || '',
              tabIndex: panel?.tabIndex
            };
          })(),
          heroBadges: document.querySelectorAll('#tezoscrp-modal .tezoscrp-hero-badges img').length,
          podiumPlaces: Array.from(document.querySelectorAll('#tezoscrp-hall-results .tezoscrp-ranking > li.is-podium')).map((row) => row.dataset.tezoscrpPlace),
          launcherIdentities: document.querySelectorAll('#tezoscrp-entry-card .tezoscrp-entry-identity-strip > span').length,
          bottomRowHeights: Object.fromEntries(['maxis-entry-card', 'tezoscrp-entry-card', 'tezos-domains-entry-card'].map((id) => [id, Math.round(document.getElementById(id)?.getBoundingClientRect().height || 0)])),
          bottomRowWidths: Object.fromEntries(['maxis-entry-card', 'tezoscrp-entry-card', 'tezos-domains-entry-card'].map((id) => [id, Math.round(document.getElementById(id)?.getBoundingClientRect().width || 0)])),
          bottomRowClips: ['maxis-entry-card', 'tezoscrp-entry-card', 'tezos-domains-entry-card'].filter((id) => {
            const front = document.querySelector(`#${id} .card-front`);
            return front && front.scrollHeight > front.clientHeight + 4;
          }),
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          modalOverflow: modal.scrollWidth > modal.clientWidth + 1,
          bodyOverflow: body.scrollWidth > body.clientWidth + 1,
          truth: document.querySelector('#tezoscrp-modal .tezoscrp-truth-note')?.textContent.replace(/\s+/g, ' ').trim() || ''
        };
      });
      assert(initial.path === '/tezoscrp/' && initial.canonical === 'https://tezos.systems/tezoscrp/', `TezosCRP ${label}: canonical route mismatch ${JSON.stringify(initial)}`);
      assert(formattedTotals.every((value) => initial.metrics.includes(value)), `TezosCRP ${label}: artifact totals missing ${JSON.stringify({ expected: formattedTotals, actual: initial.metrics })}`);
      assert(initial.tabs === 5, `TezosCRP ${label}: expected five archive and records views`);
      assert(
        initial.tabsA11y.every((tab) => tab.id === `tezoscrp-tab-${tab.view}` && tab.controls === 'tezoscrp-view')
          && initial.tabsA11y.filter((tab) => tab.tabIndex === 0 && tab.selected === 'true').length === 1
          && initial.tabPanel.role === 'tabpanel'
          && initial.tabPanel.labelledBy === 'tezoscrp-tab-hall'
          && initial.tabPanel.tabIndex === 0,
        `TezosCRP ${label}: tabs and shared panel are not programmatically associated ${JSON.stringify({ tabs: initial.tabsA11y, panel: initial.tabPanel })}`
      );
      assert(initial.heroBadges === 9, `TezosCRP ${label}: expected all nine current category badges in the hero`);
      assert(initial.podiumPlaces.join('|') === '1|2|3', `TezosCRP ${label}: top recognition rows lost their distinct placement treatment ${JSON.stringify(initial.podiumPlaces)}`);
      assert(/one official category listing equals one award/i.test(initial.truth) && /most posts do not state a per-person XTZ payout/i.test(initial.truth), `TezosCRP ${label}: count truth is missing ${initial.truth}`);
      assert(!initial.pageOverflow && !initial.modalOverflow && !initial.bodyOverflow, `TezosCRP ${label}: initial view overflows ${JSON.stringify(initial)}`);

      await page.locator('#tezoscrp-tab-hall').focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => (
        document.activeElement?.id === 'tezoscrp-tab-records'
          && document.querySelector('#tezoscrp-tab-records')?.getAttribute('aria-selected') === 'true'
          && document.querySelector('#tezoscrp-view')?.getAttribute('aria-labelledby') === 'tezoscrp-tab-records'
      ));
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => (
        document.activeElement?.id === 'tezoscrp-tab-hall'
          && document.querySelector('#tezoscrp-tab-hall')?.getAttribute('aria-selected') === 'true'
          && document.querySelector('#tezoscrp-view')?.getAttribute('aria-labelledby') === 'tezoscrp-tab-hall'
          && document.querySelector('#tezoscrp-hall-search')
      ));

      await page.locator('#tezoscrp-hall-search').fill('Baking Benjamins');
      await page.waitForFunction(() => document.querySelectorAll('#tezoscrp-hall-results [data-tezoscrp-person]').length === 1);
      const leaderText = (await page.locator('#tezoscrp-hall-results [data-tezoscrp-person]').innerText()).replace(/\s+/g, ' ');
      const baker = expectedPeople.get('x:bakingbenjamins');
      assert(/Baking Benjamins/i.test(leaderText) && leaderText.includes(String(baker.total_awards)) && leaderText.includes(String(baker.distinct_periods)), `TezosCRP ${label}: identity search did not preserve awards/months ${leaderText}`);
      await page.locator('#tezoscrp-hall-results [data-tezoscrp-person]').click();
      await page.locator('#tezoscrp-person-detail:not([hidden]) .tezoscrp-receipts article').first().waitFor({ state: 'visible' });
      assert(await page.locator('#tezoscrp-person-detail .tezoscrp-receipts article').count() === baker.total_awards, `TezosCRP ${label}: person receipt trail is incomplete`);
      assert(await page.locator('#tezoscrp-person-detail .tezoscrp-receipts a').count() >= baker.total_awards, `TezosCRP ${label}: official source receipts are missing`);

      await page.locator('#tezoscrp-person-close').click();
      await page.locator('#tezoscrp-hall-search').fill('cleof');
      await page.waitForFunction(() => document.querySelectorAll('#tezoscrp-hall-results [data-tezoscrp-person]').length === 1);
      const cleofText = (await page.locator('#tezoscrp-hall-results [data-tezoscrp-person]').innerText()).replace(/\s+/g, ' ');
      assert(/cle0fis/i.test(cleofText) && cleofText.includes(String(expectedPeople.get('x:cleofis').total_awards)), `TezosCRP ${label}: cleof aliases were not consolidated ${cleofText}`);

      await page.locator('#tezoscrp-hall-search').fill('PixelSushiRobot');
      await page.waitForFunction(() => document.querySelectorAll('#tezoscrp-hall-results [data-tezoscrp-person]').length === 1);
      const pixelText = (await page.locator('#tezoscrp-hall-results [data-tezoscrp-person]').innerText()).replace(/\s+/g, ' ');
      assert(/NiceFishTaco/i.test(pixelText) && pixelText.includes(String(expectedPeople.get('x:nicefishtaco').total_awards)), `TezosCRP ${label}: PixelSushiRobot continuity was not consolidated ${pixelText}`);

      await page.locator('#tezoscrp-hall-search').fill('onebalddude');
      await page.waitForFunction(() => document.querySelectorAll('#tezoscrp-hall-results [data-tezoscrp-person]').length === 1);
      const crossPlatformText = (await page.locator('#tezoscrp-hall-results [data-tezoscrp-person]').innerText()).replace(/\s+/g, ' ');
      assert(/one_bald_dude/i.test(crossPlatformText) && crossPlatformText.includes(String(expectedPeople.get('x:one_bald_dude').total_awards)), `TezosCRP ${label}: cross-platform alias was not consolidated ${crossPlatformText}`);

      await page.locator('[data-tezoscrp-view="records"]').click();
      await page.locator('.tezoscrp-record-holder-card').first().waitFor({ state: 'visible' });
      const recordState = await page.evaluate(() => ({
        yearOptions: document.querySelectorAll('#tezoscrp-record-year option').length,
        selectedYear: document.querySelector('#tezoscrp-record-year')?.value || '',
        annualCards: document.querySelectorAll('[data-tezoscrp-record-year]').length,
        leaderRows: document.querySelectorAll('.tezoscrp-record-board .is-record-leader').length,
        currentCategoryRecords: document.querySelectorAll('.tezoscrp-record-holder-card.is-current').length,
        historicalCategoryRecords: document.querySelectorAll('.tezoscrp-record-holder-card.is-historical').length,
        summary: document.querySelector('.tezoscrp-record-year-lead')?.textContent.replace(/\s+/g, ' ').trim() || '',
        overflow: document.querySelector('#tezoscrp-modal .tezoscrp-body').scrollWidth > document.querySelector('#tezoscrp-modal .tezoscrp-body').clientWidth + 1
      }));
      assert(recordState.yearOptions === tezosCrpSummary.records.years.length && recordState.annualCards === tezosCrpSummary.records.years.length && recordState.selectedYear === String(latestYear), `TezosCRP ${label}: annual record selector is incomplete ${JSON.stringify(recordState)}`);
      assert(recordState.leaderRows === currentYearRecord.leaders.length && recordState.summary.includes(String(currentYearRecord.record)), `TezosCRP ${label}: current annual record is not explicit ${JSON.stringify(recordState)}`);
      assert(recordState.currentCategoryRecords === 9 && recordState.historicalCategoryRecords >= 24, `TezosCRP ${label}: category record holders are incomplete ${JSON.stringify(recordState)}`);
      assert(!recordState.overflow, `TezosCRP ${label}: records view overflows`);
      await page.locator('#tezoscrp-record-year').selectOption('2022');
      await page.waitForFunction(() => /Baking Benjamins leads 2022 with 17/.test(document.querySelector('.tezoscrp-record-year-lead')?.textContent || ''));
      const year2022Row = (await page.locator('.tezoscrp-record-board li').first().innerText()).replace(/\s+/g, ' ');
      assert(/Baking Benjamins/i.test(year2022Row) && /\b17\b/.test(year2022Row) && /\b11\b/.test(year2022Row), `TezosCRP ${label}: 2022 annual leader mismatch ${year2022Row}`);

      await page.locator('[data-tezoscrp-view="latest"]').click();
      await page.locator('.tezoscrp-latest-hero h2').waitFor({ state: 'visible' });
      const latestText = (await page.locator('.tezoscrp-latest-hero').innerText()).replace(/\s+/g, ' ');
      assert(latestText.includes(latestLabel) && latestText.includes(`${tezosCrpSummary.latest.awards.length} category recognitions`), `TezosCRP ${label}: latest official round mismatch ${latestText}`);

      await page.locator('[data-tezoscrp-view="categories"]').click();
      await page.locator('.tezoscrp-category-grid .tezoscrp-category-card').first().waitFor({ state: 'visible' });
      const categoryState = await page.evaluate(() => ({
        currentCards: document.querySelectorAll('#tezoscrp-view > .tezoscrp-category-grid .tezoscrp-category-card.is-current').length,
        currentIcons: document.querySelectorAll('#tezoscrp-view > .tezoscrp-category-grid img.tezoscrp-category-icon').length,
        historicalCount: Number(document.querySelector('.tezoscrp-historical-categories summary')?.textContent.match(/\d+/)?.[0] || 0),
        overflow: document.querySelector('#tezoscrp-modal .tezoscrp-body').scrollWidth > document.querySelector('#tezoscrp-modal .tezoscrp-body').clientWidth + 1
      }));
      assert(categoryState.currentCards === 9 && categoryState.currentIcons === 9 && categoryState.historicalCount >= 24, `TezosCRP ${label}: category map is incomplete ${JSON.stringify(categoryState)}`);
      assert(!categoryState.overflow, `TezosCRP ${label}: category view overflows`);

      await page.locator('[data-tezoscrp-view="archive"]').click();
      await page.locator('#tezoscrp-archive-period').selectOption('2026-06');
      await page.waitForFunction(() => /of 40 matching recognitions/.test(document.querySelector('#tezoscrp-archive-results')?.textContent || ''));
      await page.locator('#tezoscrp-archive-search').fill('Baking Benjamins');
      await page.waitForFunction(() => document.querySelectorAll('#tezoscrp-archive-results .tezoscrp-archive-list article').length === 1);
      assert(await page.evaluate(() => new URLSearchParams(location.search).get('q')) === 'Baking Benjamins', `TezosCRP ${label}: archive identity query was not reflected in the route`);
      const archiveRow = (await page.locator('#tezoscrp-archive-results .tezoscrp-archive-list article').innerText()).replace(/\s+/g, ' ');
      assert(/Jun 2026/.test(archiveRow) && /Baking Benjamins/i.test(archiveRow) && /Official source|Tezos Commons X post/i.test(archiveRow), `TezosCRP ${label}: archive filtering/source mismatch ${archiveRow}`);
      assert(!/0\s*ꜩ published/.test(archiveRow), `TezosCRP ${label}: missing payout amount was misrepresented as zero ${archiveRow}`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#tezoscrp-modal.active #tezoscrp-archive-search').waitFor({ state: 'visible', timeout: 15000 });
      const restoredArchiveState = await page.evaluate(() => ({
        query: document.querySelector('#tezoscrp-archive-search')?.value || '',
        rows: document.querySelectorAll('#tezoscrp-archive-results .tezoscrp-archive-list article').length,
        view: new URLSearchParams(location.search).get('view')
      }));
      assert(restoredArchiveState.query === 'Baking Benjamins' && restoredArchiveState.rows === 1 && restoredArchiveState.view === 'archive', `TezosCRP ${label}: catalog deep link did not restore archive identity filtering ${JSON.stringify(restoredArchiveState)}`);

      const settled = await page.evaluate(() => {
        const modal = document.querySelector('#tezoscrp-modal .tezoscrp-content');
        const body = document.querySelector('#tezoscrp-modal .tezoscrp-body');
        return {
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          modalOverflow: modal.scrollWidth > modal.clientWidth + 1,
          bodyOverflow: body.scrollWidth > body.clientWidth + 1
        };
      });
      assert(!settled.pageOverflow && !settled.modalOverflow && !settled.bodyOverflow, `TezosCRP ${label}: filtered archive overflows ${JSON.stringify(settled)}`);

      await page.locator('#tezoscrp-modal .chamber-close').click();
      await page.waitForFunction(() => !document.querySelector('#tezoscrp-modal')?.classList.contains('active'), null, { timeout: 15000 }).catch(async error => {
        throw new Error(`${error.message}: ${await page.locator('[data-dashboard-transition]').textContent().catch(() => 'no transition status')}`);
      });
      await page.waitForFunction(() => document.querySelectorAll('#tezoscrp-entry-card .tezoscrp-entry-identity-strip > span').length === 6);
      // Launcher geometry belongs to the dashboard, now constructed on exit.
      Object.assign(initial, await page.evaluate(() => ({
        launcherIdentities: document.querySelectorAll('#tezoscrp-entry-card .tezoscrp-entry-identity-strip > span').length,
        bottomRowHeights: Object.fromEntries(['maxis-entry-card', 'tezoscrp-entry-card', 'tezos-domains-entry-card'].map(id => [id, Math.round(document.getElementById(id)?.getBoundingClientRect().height || 0)])),
        bottomRowWidths: Object.fromEntries(['maxis-entry-card', 'tezoscrp-entry-card', 'tezos-domains-entry-card'].map(id => [id, Math.round(document.getElementById(id)?.getBoundingClientRect().width || 0)])),
        bottomRowClips: ['maxis-entry-card', 'tezoscrp-entry-card', 'tezos-domains-entry-card'].filter(id => { const front = document.querySelector(`#${id} .card-front`); return front && front.scrollHeight > front.clientHeight + 4; })
      })));
      assert(initial.launcherIdentities === 6, `TezosCRP ${label}: launcher must surface six leading recognition identities`);
      if (label === 'desktop') {
        assert(initial.bottomRowHeights['maxis-entry-card'] >= 315 && initial.bottomRowHeights['maxis-entry-card'] <= 335, `TezosCRP desktop: categorized Maxis intrinsic height drifted ${JSON.stringify(initial.bottomRowHeights)}`);
        assert(initial.bottomRowHeights['tezoscrp-entry-card'] >= 280 && initial.bottomRowHeights['tezoscrp-entry-card'] <= 520, `TezosCRP desktop: categorized TezosCRP intrinsic height drifted ${JSON.stringify(initial.bottomRowHeights)}`);
        assert(initial.bottomRowHeights['tezos-domains-entry-card'] >= 290 && initial.bottomRowHeights['tezos-domains-entry-card'] <= 500, `TezosCRP desktop: categorized Domains intrinsic height drifted ${JSON.stringify(initial.bottomRowHeights)}`);
        assert(Object.values(initial.bottomRowWidths).every((width) => width > 1200), `TezosCRP desktop: dense People launchers must own full rows ${JSON.stringify(initial.bottomRowWidths)}`);
        assert(initial.bottomRowClips.length === 0, `TezosCRP desktop: dense People launcher content clips ${JSON.stringify(initial.bottomRowClips)}`);
      }
      assert(issues.length === 0, `TezosCRP ${label} browser issues:\n${issues.join('\n')}`);
      await context.close();
    }
    log('ok - TezosCRP Chamber (desktop + mobile)');
    await smokeTezosCrpCompaction(browser, baseUrl, { dataset: tezosCrpDataset, installFeatureMocks, artifactsDir: ARTIFACTS_DIR });
  }

  return { smokeMaxisDomainPassport, smokeMaxisChamber, smokeTezosCrpChamber };
}
