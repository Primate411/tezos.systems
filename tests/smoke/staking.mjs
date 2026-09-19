// Browser workflows owned by staking. Shared dependencies remain explicit.
import { assertBakerDirectoryContrast } from '../lib/baker-directory-contrast-smoke.mjs';
export function createStakingSmokeSuites({
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_ADDRESS_3,
  SAMPLE_IDLE_ADDRESS,
  SAMPLE_LARGE_STAKER_ADDRESS,
  SAMPLE_REGULAR_DELEGATOR_ADDRESS,
  assert,
  assertNormalizedChamberShell,
  assertPromotedLauncherGeometry,
  attachIssueCollectors,
  expectCount,
  installFeatureMocks,
  installOctezConnectMock,
  installStakingChamberMocks,
  log
}) {
  async function smokeStakingChamber(browser, baseUrl) {
    const label = 'staking chamber';
    const issues = [];
    const requests = [];
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
    });
    const page = await context.newPage();
    await installStakingChamberMocks(page, requests);
    attachIssueCollectors(page, label, issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `${label}: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#chambers-grid > .chamber-category[data-chamber-category="capital"] .chamber-category-toggle').click();
    await page.locator('#staking-entry-card').waitFor({ state: 'visible', timeout: 15000 });
    // Entering the viewport hydrates and replaces the initial launcher skeleton.
    // Scroll the current node synchronously instead of retaining it while waiting
    // for layout stability; subsequent locators resolve the hydrated card afresh.
    await page.locator('#staking-entry-card').evaluate((card) => card.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.locator('#staking-entry-card').dispatchEvent('pointerenter');
    await page.waitForFunction(() => {
      const card = document.querySelector('#staking-entry-card');
      const ratio = document.querySelector('#staking-entry-ratio')?.textContent?.trim() || '';
      return card?.querySelectorAll('.staking-entry-move').length === 2
        && /25\.5K/.test(card.textContent || '')
        && /32\.0K/.test(card.textContent || '')
        && ratio !== '—';
    }, null, { timeout: 20000 });

    const cardState = await page.evaluate(() => {
      const card = document.querySelector('#staking-entry-card');
      const pair = card?.closest('.chamber-card-pair');
      const grid = document.querySelector('#chambers-grid');
      const rect = card?.getBoundingClientRect();
      const pairRect = pair?.getBoundingClientRect();
      const gridRect = grid?.getBoundingClientRect();
      const whaleRect = document.querySelector('#whale-watch-entry-card')?.getBoundingClientRect();
      return {
        actions: Array.from(card?.querySelectorAll('.staking-entry-move') || []).map((row) => row.dataset.stakingAction),
        amounts: Array.from(card?.querySelectorAll('.staking-entry-move') || []).map((row) => row.dataset.stakingAmount),
        cardWidth: rect?.width || 0,
        whaleWidth: whaleRect?.width || 0,
        layout: card?.dataset.chamberLayout || '',
        gridWidth: gridRect?.width || 0,
        category: pair?.dataset.chamberCategory || '',
        pairOrder: Array.from(pair?.querySelectorAll(':scope > .chamber-category-cards > .chamber-entry-card') || []).map((entry) => entry.id || entry.dataset.stat || ''),
        pairWidth: pairRect?.width || 0,
        ratio: document.querySelector('#staking-entry-ratio')?.textContent?.trim() || '',
        rows: card?.querySelectorAll('.staking-entry-move').length || 0,
        wide: card?.classList.contains('chamber-entry-wide') || false
      };
    });
    assert(cardState.rows === 2 && cardState.actions.join(',') === 'stake,unstake', `${label}: launcher must be a fixed two-row stake/unstake tape ${JSON.stringify(cardState)}`);
    assert(cardState.amounts.join(',') === '25500000000,32000000000', `${label}: launcher selected exact actual amounts instead of strict >10K receipts ${JSON.stringify(cardState)}`);
    assert(cardState.ratio === '27.62%', `${label}: launcher must show the canonical current staking ratio, saw ${cardState.ratio}`);
    assert(
      !cardState.wide
        && cardState.layout === 'compact'
        && cardState.category === 'capital'
        && cardState.pairOrder.join(',') === 'capital-entry-card,minerals-entry-card,uranium-entry-card,metals-entry-card,whale-watch-entry-card,staking-entry-card'
        && cardState.cardWidth > cardState.gridWidth * 0.3
        && cardState.cardWidth < cardState.gridWidth * 0.36
        && cardState.whaleWidth > cardState.cardWidth * 1.9,
      `${label}: compact launcher must sit beside the wider Whale Watch preview in Capital ${JSON.stringify(cardState)}`
    );

    await page.locator('#staking-entry-card .chamber-expand-cue').click();
    await page.locator('#staking-chamber-modal.active .staking-chamber-content').waitFor({ state: 'visible', timeout: 10000 });
    await assertNormalizedChamberShell(page, '#staking-chamber-modal.active', '.staking-chamber-content', 'narrow', label);
    await page.waitForFunction(() => /Showing 4 of 4 complete >10K moves/.test(document.querySelector('#staking-archive-count')?.textContent || ''), null, { timeout: 30000 });

    assert(!(await page.locator('#staking-guide').evaluate((guide) => guide.open)), `${label}: live movement room should keep the explanatory guide collapsed by default`);
    await page.locator('#staking-guide > summary').click();
    await page.waitForFunction(() => document.querySelector('#staking-guide')?.open === true);
    const guideState = await page.evaluate(() => ({
      actionHrefs: Array.from(document.querySelectorAll('.staking-guide-actions a')).map((link) => link.getAttribute('href')),
      faqCount: document.querySelectorAll('.staking-guide-faq details').length,
      metricValues: Array.from(document.querySelectorAll('.staking-guide-metric-grid strong')).map((node) => node.textContent?.trim() || ''),
      roleIds: Array.from(document.querySelectorAll('[data-staking-role]')).map((node) => node.dataset.stakingRole),
      text: document.querySelector('#staking-guide')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(guideState.roleIds.join(',') === 'delegation,direct-staking,baking', `${label}: guide must preserve all three distinct Tezos roles ${JSON.stringify(guideState)}`);
    assert(guideState.faqCount === 5, `${label}: visible guide FAQ must match the five shared schema questions ${JSON.stringify(guideState)}`);
    assert(guideState.metricValues.length === 4 && guideState.metricValues.every((value) => value && value !== 'Unavailable'), `${label}: source-backed rate and participation context did not resolve ${JSON.stringify(guideState.metricValues)}`);
    assert(/Keep custody and liquidity/.test(guideState.text)
      && /protocol unstaking and finalization process/.test(guideState.text)
      && /Off-chain baker payout policy/.test(guideState.text)
      && /0–100% external-staker edge/.test(guideState.text)
      && /It is not a delegation fee/.test(guideState.text), `${label}: the strongest explanatory copy from the former guide is missing ${guideState.text}`);
    assert(guideState.actionHrefs.join(',') === '/#calculator,/leaderboard/,https://stake.tezos.com,https://docs.tez.capital', `${label}: guide next steps are incomplete ${JSON.stringify(guideState.actionHrefs)}`);
    await page.locator('#staking-guide > summary').click();
    await page.waitForFunction(() => document.querySelector('#staking-guide')?.open === false);

    const roomState = await page.evaluate(() => ({
      actionIds: Array.from(document.querySelectorAll('#staking-archive-rows .staking-operation-row')).map((row) => Number(row.dataset.stakingOperation)),
      amounts: Array.from(document.querySelectorAll('#staking-archive-rows .staking-operation-amount')).map((node) => node.textContent?.trim()),
      archiveHead: document.querySelector('.staking-archive-panel .staking-panel-head')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      currentRatio: document.querySelector('.staking-overview-card.is-primary > strong')?.textContent?.trim() || '',
      directHref: document.querySelector('.staking-method-panel a[href="/stake/"]')?.getAttribute('href') || '',
      flow: Object.fromEntries(Array.from(document.querySelectorAll('[data-staking-flow]')).map((node) => [node.dataset.stakingFlow, node.textContent?.replace(/\s+/g, ' ').trim()])),
      method: document.querySelector('.staking-method-panel')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      title: document.querySelector('#staking-chamber-title')?.textContent?.trim() || '',
      wayfinderLinks: document.querySelectorAll('[data-staking-wayfinder] .site-wayfinder-link').length,
      wayfinderDestinations: Array.from(document.querySelectorAll('[data-staking-wayfinder] .site-wayfinder-link')).map((link) => ({
        id: link.dataset.journeyTo,
        href: link.getAttribute('href')
      })),
      wayfinderActions: Array.from(document.querySelectorAll('[data-staking-wayfinder] .site-wayfinder-actions a')).map((link) => link.getAttribute('href'))
    }));
    assert(roomState.title === 'Staking Chamber' && roomState.currentRatio === '27.62%', `${label}: opened room is missing its title or current ratio ${JSON.stringify(roomState)}`);
    assert(roomState.actionIds.length === 4 && new Set(roomState.actionIds).size === 4, `${label}: complete archive should contain the four unique strict-threshold fixtures ${JSON.stringify(roomState.actionIds)}`);
    assert(!roomState.amounts.includes('10,000 ꜩ') && !roomState.amounts.includes('9,000 ꜩ') && !roomState.amounts.includes('7,000 ꜩ'), `${label}: exact 10K or requestedAmount-only moves leaked into the archive ${JSON.stringify(roomState.amounts)}`);
    assert(/4 matching receipts · 2 stakes \/ 2 unstakes/.test(roomState.archiveHead), `${label}: complete archive receipt summary is wrong ${roomState.archiveHead}`);
    assert(/25\.5K ꜩ.*1 operation/.test(roomState.flow.stake || '') && /32\.0K ꜩ.*1 operation/.test(roomState.flow.unstake || '') && /−6\.5K ꜩ.*Explicit operations only/.test(roomState.flow.net || ''), `${label}: 24h gross/net operation flow is wrong ${JSON.stringify(roomState.flow)}`);
    assert(/Strictly over 10,000 ꜩ/.test(roomState.method) && /actual processed amount/.test(roomState.method) && /saved high-water mark/.test(roomState.method) && /Exactly 10,000 ꜩ is excluded/.test(roomState.method), `${label}: strict actual-amount method disclosure is incomplete ${roomState.method}`);
    assert(roomState.directHref === '/stake/', `${label}: direct pretty route link is wrong ${roomState.directHref}`);
    assert(roomState.wayfinderLinks === 4 && roomState.wayfinderActions.join(',') === '/#chambers,/#search', `${label}: compact semantic wayfinder is wrong ${JSON.stringify(roomState)}`);
    assert(roomState.wayfinderDestinations[0]?.id === 'my-tezos' && roomState.wayfinderDestinations[0]?.href === '/my/?view=portfolio', `${label}: Staking must continue first into My Tezos Portfolio ${JSON.stringify(roomState.wayfinderDestinations)}`);

    const compactRequests = requests.filter((entry) => entry.select === 'id,timestamp,amount');
    assert(compactRequests.length >= 6 && compactRequests.every((entry) => !entry.select.includes('requestedAmount')), `${label}: archive/launcher must request compact actual-amount receipts ${JSON.stringify(compactRequests)}`);
    assert(requests.some((entry) => entry.action === 'stake' && entry.cursor === '40001') && requests.some((entry) => entry.action === 'unstake' && entry.cursor === '60001'), `${label}: complete archive did not cursor beyond the first 10,000 rows ${JSON.stringify(requests.filter((entry) => entry.cursor))}`);
    const hydratedIds = new Set(requests.flatMap((entry) => entry.idIn ? entry.idIn.split(',').map(Number) : []));
    assert([49998, 40000, 69998, 60000].every((id) => hydratedIds.has(id)), `${label}: qualifying compact receipts were not hydrated by id.in ${JSON.stringify([...hydratedIds])}`);

    await page.locator('[data-staking-filter="unstake"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#staking-archive-rows [data-staking-action="unstake"]').length === 2 && document.querySelectorAll('#staking-archive-rows .staking-operation-row').length === 2);
    await page.locator('[data-staking-filter="all"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#staking-archive-rows .staking-operation-row').length === 4);
    await page.locator('#staking-archive-search').fill('Unstake QA');
    await page.waitForFunction(() => document.querySelectorAll('#staking-archive-rows .staking-operation-row').length === 1);
    const filteredArchiveState = await page.evaluate(() => ({
      count: document.querySelector('#staking-archive-count')?.textContent || '',
      text: document.querySelector('#staking-archive-rows')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(/Showing 1 of 1 complete >10K move/.test(filteredArchiveState.count) && /Unstake QA/.test(filteredArchiveState.text), `${label}: alias search did not narrow the complete archive ${JSON.stringify(filteredArchiveState)}`);
    const csvDownload = page.waitForEvent('download');
    await page.locator('#staking-export-csv').click();
    const download = await csvDownload;
    assert(/^tezos-staking-moves-over-10k-\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), `${label}: CSV export filename is wrong ${download.suggestedFilename()}`);
    await page.locator('#staking-archive-search').fill('');
    await page.waitForFunction(() => document.querySelectorAll('#staking-archive-rows .staking-operation-row').length === 4);

    await page.locator(`#staking-archive-rows [data-staking-mover="${SAMPLE_LARGE_STAKER_ADDRESS}"]`).first().click();
    await page.waitForFunction(() => /Operations\s*7/.test(document.querySelector('#staking-mover-panel')?.textContent?.replace(/\s+/g, ' ') || ''), null, { timeout: 10000 });
    const moverState = await page.evaluate((address) => ({
      flowHref: document.querySelector('#staking-mover-panel .staking-mover-summary > a')?.getAttribute('href') || '',
      rows: document.querySelectorAll('#staking-mover-panel .staking-operation-row').length,
      text: document.querySelector('#staking-mover-panel')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }), SAMPLE_LARGE_STAKER_ADDRESS);
    assert(moverState.rows === 7 && /Gross staked\s*94\.5K ꜩ/.test(moverState.text) && /Gross unstaked\s*49\.0K ꜩ/.test(moverState.text), `${label}: complete mover trail did not include this actor's full explicit history ${JSON.stringify(moverState)}`);
    assert(moverState.flowHref === `#ledger-flow=${SAMPLE_LARGE_STAKER_ADDRESS}`, `${label}: mover Ledger Flow route is wrong ${moverState.flowHref}`);
    assert(requests.some((entry) => entry.staker === SAMPLE_LARGE_STAKER_ADDRESS && entry.action === 'stake') && requests.some((entry) => entry.staker === SAMPLE_LARGE_STAKER_ADDRESS && entry.action === 'unstake'), `${label}: mover trail did not scan both explicit actions`);

    await page.locator('#staking-guide > summary').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const mobileState = await page.evaluate(() => {
      const modal = document.querySelector('#staking-chamber-modal .staking-chamber-content');
      const modalRect = modal?.getBoundingClientRect();
      const rows = Array.from(document.querySelectorAll('#staking-archive-rows .staking-operation-row'));
      const filterControls = Array.from(document.querySelectorAll('.staking-action-filter button'));
      const guide = document.querySelector('#staking-guide');
      const guideActions = Array.from(document.querySelectorAll('.staking-guide-actions a'));
      const guideTable = document.querySelector('.staking-guide-comparison table');
      const directStakeCell = document.querySelector('.staking-guide-comparison tbody tr td:nth-child(3)');
      const inside = (rect) => rect && rect.left >= -1 && rect.right <= innerWidth + 1;
      return {
        controlsMinHeight: Math.min(...filterControls.map((node) => node.getBoundingClientRect().height)),
        guideActionsMinHeight: Math.min(...guideActions.map((node) => node.getBoundingClientRect().height)),
        guideInside: inside(guide?.getBoundingClientRect()),
        guideRoleColumns: getComputedStyle(document.querySelector('.staking-guide-role-grid')).gridTemplateColumns.split(' ').length,
        guideTableFits: guideTable ? guideTable.scrollWidth <= guideTable.clientWidth + 1 : false,
        guideDirectStakeVisible: directStakeCell ? inside(directStakeCell.getBoundingClientRect()) : false,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        modalInside: inside(modalRect),
        modalWidth: modalRect?.width || 0,
        operationRowsInside: rows.every((row) => inside(row.getBoundingClientRect()))
      };
    });
    assert(mobileState.modalInside && Math.abs(mobileState.modalWidth - 390) <= 1 && mobileState.operationRowsInside && mobileState.guideInside && mobileState.horizontalOverflow <= 1, `${label}: mobile full-bleed modal, guide, or receipt rows escape the viewport ${JSON.stringify(mobileState)}`);
    assert(mobileState.controlsMinHeight >= 44, `${label}: mobile filter controls are smaller than 44px ${JSON.stringify(mobileState)}`);
    assert(mobileState.guideActionsMinHeight >= 44 && mobileState.guideRoleColumns === 1 && mobileState.guideTableFits && mobileState.guideDirectStakeVisible, `${label}: mobile guide must use one readable role column, side-by-side visible comparisons, and 44px actions ${JSON.stringify(mobileState)}`);

    await page.locator('#staking-chamber-modal .chamber-close').click();
    await page.waitForFunction(() => !document.querySelector('#staking-chamber-modal')?.classList.contains('active'));
    const scrollState = await page.evaluate(() => ({ body: document.body.style.overflow, html: document.documentElement.style.overflow }));
    assert(scrollState.body === '' && scrollState.html === '', `${label}: close did not restore page scrolling ${JSON.stringify(scrollState)}`);

    await page.evaluate(() => {
      const key = 'tezos-systems-staking-large-moves-v2';
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (cached) {
        cached.checkedAt = 0;
        localStorage.setItem(key, JSON.stringify(cached));
      }
    });
    const requestMarker = requests.length;
    const prettyResponse = await page.goto(`${baseUrl}/stake/`, { waitUntil: 'domcontentloaded' });
    assert(prettyResponse?.ok(), `${label}: /stake/ failed with HTTP ${prettyResponse?.status()}`);
    await page.locator('#staking-chamber-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => /Showing 4 of 4 complete >10K moves/.test(document.querySelector('#staking-archive-count')?.textContent || ''), null, { timeout: 30000 });
    const prettyState = await page.evaluate(() => ({ guideOpen: document.querySelector('#staking-guide')?.open, hash: location.hash, pathname: location.pathname, search: location.search, title: document.querySelector('#staking-chamber-title')?.textContent?.trim() || '' }));
    assert(prettyState.pathname === '/stake/' && prettyState.search === '' && prettyState.hash === '' && prettyState.title === 'Staking Chamber' && prettyState.guideOpen === false, `${label}: pretty route should open the live room with its guide collapsed and no hash redirection ${JSON.stringify(prettyState)}`);
    const revisitArchiveRequests = requests.slice(requestMarker).filter((entry) => entry.limit === 10000 && !entry.staker);
    assert(revisitArchiveRequests.length === 2 && revisitArchiveRequests.every((entry) => entry.afterId && !entry.cursor), `${label}: persisted archive revisit should request only IDs above each saved high-water mark ${JSON.stringify(revisitArchiveRequests)}`);

    const guideResponse = await page.goto(`${baseUrl}/stake/?view=guide`, { waitUntil: 'domcontentloaded' });
    assert(guideResponse?.ok(), `${label}: canonical guide view failed with HTTP ${guideResponse?.status()}`);
    await page.locator('#staking-guide[open]').waitFor({ state: 'visible', timeout: 15000 });
    const canonicalGuideState = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      faqSchema: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some((node) => /"@type":\s*"FAQPage"/.test(node.textContent || '')),
      pathname: location.pathname,
      search: location.search
    }));
    assert(canonicalGuideState.pathname === '/stake/' && canonicalGuideState.search === '?view=guide' && canonicalGuideState.canonical === 'https://tezos.systems/stake/' && canonicalGuideState.faqSchema, `${label}: canonical guide route or matching FAQ schema is wrong ${JSON.stringify(canonicalGuideState)}`);

    await page.goto(`${baseUrl}/staking/`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(`${baseUrl}/stake/?view=guide`, { timeout: 10000 });
    await page.locator('#staking-guide[open]').waitFor({ state: 'visible', timeout: 15000 });
    const redirectState = await page.evaluate(() => ({ canonical: document.querySelector('link[rel="canonical"]')?.href || '', pathname: location.pathname, search: location.search }));
    assert(redirectState.pathname === '/stake/' && redirectState.search === '?view=guide' && redirectState.canonical === 'https://tezos.systems/stake/', `${label}: /staking/ compatibility route did not converge on the canonical guide view ${JSON.stringify(redirectState)}`);

    await context.close();
    assert(issues.length === 0, `${label}: browser issues:\n${issues.join('\n')}`);
    log('ok - staking chamber smoke');
  }

  async function smokeLeaderboardSignals(browser, baseUrl) {
    await assertBakerDirectoryContrast(browser, baseUrl, installFeatureMocks);
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    const mockState = await installFeatureMocks(context, {
      leaderboardSignals: true,
      bakerDirectoryPaged: true
    });
    await context.addInitScript(() => {
      window.__BAKER_DIRECTORY_REFRESH_MS__ = 1000;
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.removeItem('tezos-systems-leaderboard-cache-v5');
    });

    const page = await context.newPage();
    attachIssueCollectors(page, 'Baker Directory', issues);
    const response = await page.goto(`${baseUrl}/leaderboard/?view=directory`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `Baker Directory: direct route failed with HTTP ${response?.status()}`);
    await page.locator('#baker-directory-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#baker-directory-panel .baker-directory-table').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('#baker-directory-panel .baker-directory-table tbody tr').length === 502, null, { timeout: 15000 });
    assert(await page.locator('#chambers-grid').count() === 0, 'Baker Directory direct boot must not render hidden home launchers');
    assert(mockState.bakerPageOffsets.includes(0) && mockState.bakerPageOffsets.includes(500), `Baker Directory: complete active set was not fetched through the second page: ${JSON.stringify(mockState.bakerPageOffsets)}`);
    assert(new URL(page.url()).pathname === '/leaderboard/' && new URL(page.url()).searchParams.get('view') === 'directory', `Baker Directory: direct route state drifted: ${page.url()}`);
    await expectCount(page, '#baker-directory-modal [role="tab"][data-bdc-view]', 3, 'Baker Directory views');
    await expectCount(page, '#baker-directory-panel .baker-directory-table tbody tr', 502, 'Baker Directory complete funded active set');

    const overCapacityState = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#baker-directory-panel .baker-directory-table tbody tr')]
        .find((candidate) => candidate.textContent?.includes('Paged Baker Over Capacity'));
      const cell = row?.querySelector('td:nth-child(5)');
      return {
        critical: cell?.classList.contains('cap-critical') || false,
        hasOpenRoom: Boolean(cell?.querySelector('[aria-label="Open delegation room"]')),
        text: cell?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });
    assert(
      overCapacityState.text === '150%'
        && overCapacityState.critical
        && !overCapacityState.hasOpenRoom,
      `Baker Directory: raw delegation use above 100% must remain visible instead of being clamped ${JSON.stringify(overCapacityState)}`
    );

    const signalState = await page.evaluate(({ og, veteran, postCutoff }) => {
      const readRow = (address) => {
        const row = document.querySelector(`#baker-directory-panel .baker-directory-table tr[data-address="${address}"]`);
        return {
          exists: Boolean(row),
          badges: Array.from(row?.querySelectorAll('.lb-badge') || []).map((badge) => ({
            kind: badge.dataset.badge || '',
            text: badge.textContent?.trim() || '',
            title: badge.getAttribute('title') || ''
          }))
        };
      };
      return {
        og: readRow(og),
        veteran: readRow(veteran),
        postCutoff: readRow(postCutoff),
        footer: document.querySelector('#baker-directory-modal .baker-directory-footer')?.textContent || '',
        observed: document.querySelector('#baker-directory-modal .baker-directory-receipt small')?.textContent?.trim() || '',
        setCopy: document.querySelector('#baker-directory-panel .baker-directory-section-heading')?.textContent || '',
        launcherFreshness: document.querySelector('#baker-directory-entry-card')?.dataset.updatedLabel || '',
        launcherFooter: document.querySelector('#baker-directory-entry-card .chamber-entry-freshness')?.textContent?.trim() || ''
      };
    }, { og: SAMPLE_ADDRESS, veteran: SAMPLE_ADDRESS_2, postCutoff: SAMPLE_ADDRESS_3 });

    assert(signalState.og.badges.some((badge) => badge.kind === 'og' && /OG · 2018/.test(badge.text)), `Baker Directory: launch-era OG receipt missing ${JSON.stringify(signalState)}`);
    assert(!signalState.og.badges.some((badge) => badge.kind === 'veteran'), `Baker Directory: OG baker should not carry redundant Veteran marker ${JSON.stringify(signalState.og)}`);
    assert(signalState.og.badges.some((badge) => badge.kind === 'accepted' && /Accepted · 2/.test(badge.text) && /Smoke One, Smoke Two/.test(badge.title)), `Baker Directory: accepted-proposal initiator receipt missing ${JSON.stringify(signalState.og)}`);
    assert(signalState.og.badges.some((badge) => badge.kind === 'voting' && /Streak · 12/.test(badge.text) && /Career high: 18/.test(badge.title)), `Baker Directory: completed-ballot streak receipt missing ${JSON.stringify(signalState.og)}`);
    assert(signalState.veteran.badges.some((badge) => badge.kind === 'veteran' && /Veteran · 2021/.test(badge.text)), `Baker Directory: end-of-2021 Veteran cutoff missing ${JSON.stringify(signalState.veteran)}`);
    assert(!signalState.postCutoff.badges.some((badge) => ['og', 'veteran'].includes(badge.kind)), `Baker Directory: post-cutoff baker received a tenure marker ${JSON.stringify(signalState.postCutoff)}`);
    assert(signalState.postCutoff.badges.some((badge) => badge.kind === 'unavailable'
      && badge.text === 'Governance unavailable'
      && /outside the frozen governance-signal source cohort/i.test(badge.title)
      && /Missing is not interpreted as zero history/i.test(badge.title)), `Baker Directory: a baker missing from the source cohort must remain unavailable rather than becoming a zero-governance baker ${JSON.stringify(signalState.postCutoff)}`);
    assert(/^Observed TzKT · /.test(signalState.observed), `Baker Directory: source-aware observation stamp missing ${JSON.stringify(signalState)}`);
    assert(/Complete funded set/.test(signalState.setCopy)
      && /governance receipts \d{4}-\d{2}-\d{2} UTC/.test(signalState.footer)
      && /\b2\/502 current bakers covered\b/.test(signalState.footer), `Baker Directory: set, source receipt, or explicit governance coverage copy drifted ${JSON.stringify(signalState)}`);
    assert(mockState.bakerGovernanceSignalRequests >= 1
      && mockState.bakerGovernanceHeavyRequests === 0,
    `Baker Directory: expected only the compact governance signal receipt, got ${mockState.bakerGovernanceSignalRequests} compact and ${mockState.bakerGovernanceHeavyRequests} heavy requests`);

    await page.evaluate((address) => {
      const row = document.querySelector(`#baker-directory-panel .baker-directory-table tr[data-address="${address}"]`);
      window.__bakerAcceptedBadge = row?.querySelector('[data-badge="accepted"]');
      window.__bakerVotingBadge = row?.querySelector('[data-badge="voting"]');
    }, SAMPLE_ADDRESS);
    mockState.failBakerGovernance(true);
    const failedGovernanceState = await page.evaluate(async (address) => {
      const loadedModuleUrl = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => /\/js\/features\/leaderboard\.js(?:\?|$)/.test(url));
      if (!loadedModuleUrl) throw new Error('Baker Directory loaded module URL is unavailable');
      // Import the exact stamped URL used by app.js. Importing the bare path
      // would create a second module instance with empty last-good state.
      const feature = await import(loadedModuleUrl);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await feature.refreshBakerDirectoryChamber({ quiet: true });
        const footer = document.querySelector('#baker-directory-modal .baker-directory-footer')?.textContent || '';
        if (/last-good governance receipts/i.test(footer)) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const row = document.querySelector(`#baker-directory-panel .baker-directory-table tr[data-address="${address}"]`);
      const accepted = row?.querySelector('[data-badge="accepted"]');
      const voting = row?.querySelector('[data-badge="voting"]');
      return {
        acceptedText: accepted?.textContent?.replace(/\s+/g, ' ').trim() || '',
        footer: document.querySelector('#baker-directory-modal .baker-directory-footer')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        sameAccepted: accepted === window.__bakerAcceptedBadge,
        sameVoting: voting === window.__bakerVotingBadge,
        votingText: voting?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    }, SAMPLE_ADDRESS);
    mockState.failBakerGovernance('');
    assert(
      failedGovernanceState.acceptedText === '🏛 Accepted · 2'
        && failedGovernanceState.votingText === '🗳 Streak · 12'
        && failedGovernanceState.sameAccepted
        && failedGovernanceState.sameVoting
        && /last-good governance receipts/i.test(failedGovernanceState.footer),
      `Baker Directory: compact signal refresh failures must retain validated badge maps and label them last-good ${JSON.stringify(failedGovernanceState)}`
    );
    const expectedFailureIssue = issues.findIndex((issue) => issue.includes('503 (Service Unavailable)') && issue.includes('baker-governance-signals.json'));
    assert(expectedFailureIssue >= 0, `Baker Directory: compact signal failure probe did not reach the browser fetch path ${JSON.stringify(issues)}`);
    issues.splice(expectedFailureIssue, 1);
    await page.evaluate(async () => {
      const loadedModuleUrl = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => /\/js\/features\/leaderboard\.js(?:\?|$)/.test(url));
      if (!loadedModuleUrl) throw new Error('Baker Directory loaded module URL is unavailable');
      const feature = await import(loadedModuleUrl);
      await feature.refreshBakerDirectoryChamber({ quiet: true });
    });
    await page.waitForFunction(() => {
      const footer = document.querySelector('#baker-directory-modal .baker-directory-footer')?.textContent || '';
      return /governance receipts/i.test(footer) && !/last-good/i.test(footer);
    }, null, { timeout: 5000 });

    await page.locator('#baker-directory-tab-discover').click();
    await page.locator('#baker-directory-panel .baker-directory-match').first().waitFor({ state: 'visible', timeout: 5000 });
    const communityFit = await page.evaluate(() => ({
      method: document.querySelector('.baker-directory-method')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      names: Array.from(document.querySelectorAll('.baker-directory-match h3')).slice(0, 3).map((node) => node.textContent?.trim()),
      reasons: Array.from(document.querySelectorAll('.baker-directory-match p')).slice(0, 3).map((node) => node.textContent?.replace(/\s+/g, ' ').trim()),
      scoreNodes: document.querySelectorAll('#baker-directory-panel [data-score], #baker-directory-panel .baker-fit-score, #baker-directory-panel .baker-directory-match-score').length
    }));
    assert(
      communityFit.names.join(',') === 'Paged Baker Community,Paged Baker Alpha Tie,Paged Baker Zulu Tie',
      `Baker Directory: Community must order by community, then room, then name ${JSON.stringify(communityFit)}`
    );
    assert(
      /strict filters/i.test(communityFit.method)
        && /ties use the other fact, then baker name/i.test(communityFit.method)
        && /No blended score or inferred quality grade is calculated/i.test(communityFit.method)
        && communityFit.scoreNodes === 0
        && communityFit.reasons.every((reason) => /XTZ room/.test(reason) && /delegators \+ stakers/.test(reason)),
      `Baker Directory: Discover must disclose factual lexicographic ordering without a hidden score ${JSON.stringify(communityFit)}`
    );

    await page.locator('[data-fit-key="priority"][data-fit-value="capacity"]').click();
    await page.waitForFunction(() => document.querySelector('.baker-directory-match h3')?.textContent?.trim() === 'Paged Baker Capacity', null, { timeout: 5000 });
    const capacityFitNames = await page.locator('.baker-directory-match h3').allTextContents();
    assert(
      capacityFitNames.slice(0, 3).map((name) => name.trim()).join(',') === 'Paged Baker Capacity,Paged Baker Alpha Tie,Paged Baker Zulu Tie',
      `Baker Directory: Capacity must order by room, then community, then name ${JSON.stringify(capacityFitNames.slice(0, 6))}`
    );
    await page.locator('[data-fit-key="style"][data-fit-value="modern"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.baker-directory-match').length === 1, null, { timeout: 5000 });
    assert((await page.locator('.baker-directory-match h3').innerText()).trim() === 'QA Baker', 'Baker Directory: tz4-ready evidence must be a strict factual filter');
    await page.locator('[data-fit-key="style"][data-fit-value="balanced"]').click();
    await page.locator('[data-fit-key="priority"][data-fit-value="community"]').click();

    await page.locator('#baker-directory-tab-signals').click();
    await page.locator('#baker-directory-panel .baker-directory-signal-grid').waitFor({ state: 'visible', timeout: 5000 });
    const signalsCopy = await page.locator('#baker-directory-panel').innerText();
    assert(/final TzKT status is accepted/.test(signalsCopy)
      && /completed Exploration or Promotion period/.test(signalsCopy)
      && /None is an uptime, payout, reliability, or overall performance score/.test(signalsCopy), `Baker Directory: factual signal rules drifted: ${signalsCopy}`);
    await page.locator('[data-bdc-signal="accepted"]').click();
    await expectCount(page, '.baker-directory-signal-roster-grid article', 1, 'Baker Directory accepted proposal roster');
    assert((await page.locator('.baker-directory-signal-roster-grid').innerText()).includes('QA Baker'), 'Baker Directory: accepted proposal signal attributed to wrong baker');
    await page.locator('[data-bdc-signal="all"]').click();

    await page.locator('#baker-directory-tab-directory').click();
    const search = page.locator('#baker-directory-search-input');
    await search.fill('Paged Baker');
    await page.waitForFunction(() => document.querySelectorAll('.baker-directory-table tbody tr').length === 499, null, { timeout: 5000 });
    const quietBefore = await page.evaluate(() => {
      const body = document.querySelector('#baker-directory-body');
      const input = document.querySelector('#baker-directory-search-input');
      const tab = document.querySelector('#baker-directory-tab-directory');
      const row = document.querySelector('.baker-directory-table tbody tr');
      body.scrollTop = Math.min(640, Math.max(0, body.scrollHeight - body.clientHeight));
      input.focus({ preventScroll: true });
      input.setSelectionRange(0, 5);
      window.__bakerDirectoryInput = input;
      window.__bakerDirectoryTab = tab;
      window.__bakerDirectoryRow = row;
      window.__bakerDirectoryBody = body;
      return {
        pageY: window.scrollY,
        top: body.scrollTop,
        selection: input.value.slice(input.selectionStart, input.selectionEnd),
        rowAddress: row?.dataset.address || ''
      };
    });
    await page.evaluate(async () => {
      const loadedModuleUrl = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => /\/js\/features\/leaderboard\.js(?:\?|$)/.test(url));
      if (!loadedModuleUrl) throw new Error('Baker Directory loaded module URL is unavailable');
      const feature = await import(loadedModuleUrl);
      await feature.refreshBakerDirectoryChamber({ quiet: true });
    });
    await page.waitForFunction(() => document.querySelector('#baker-directory-body')?.dataset.quietRefreshSettled === 'true', null, { timeout: 8000 });
    const quietAfter = await page.evaluate((rowAddress) => {
      const body = document.querySelector('#baker-directory-body');
      const input = document.querySelector('#baker-directory-search-input');
      const tab = document.querySelector('#baker-directory-tab-directory');
      const row = document.querySelector(`.baker-directory-table tr[data-address="${rowAddress}"]`);
      return {
        sameBody: body === window.__bakerDirectoryBody,
        sameInput: input === window.__bakerDirectoryInput,
        sameTab: tab === window.__bakerDirectoryTab,
        sameRow: row === window.__bakerDirectoryRow,
        focused: document.activeElement === input,
        selection: input.value.slice(input.selectionStart, input.selectionEnd),
        selectedView: tab?.getAttribute('aria-selected'),
        pageY: window.scrollY,
        top: body.scrollTop,
        settled: body.dataset.quietRefreshSettled,
        animation: getComputedStyle(row).animationName,
        opacity: getComputedStyle(row).opacity
      };
    }, quietBefore.rowAddress);
    assert(quietAfter.sameBody && quietAfter.sameInput && quietAfter.sameTab && quietAfter.sameRow && quietAfter.focused, `Baker Directory: quiet refresh replaced focused browsing nodes ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.selection === quietBefore.selection && quietAfter.selectedView === 'true', `Baker Directory: quiet refresh lost selection or active tab ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(Math.abs(quietAfter.top - quietBefore.top) < 1 && quietAfter.pageY === quietBefore.pageY, `Baker Directory: quiet refresh moved nested or page scroll ${JSON.stringify({ quietBefore, quietAfter })}`);
    assert(quietAfter.settled === 'true' && quietAfter.animation === 'none' && quietAfter.opacity === '1', `Baker Directory: quiet refresh replayed or stranded animation state ${JSON.stringify(quietAfter)}`);
    const readerTop = await page.evaluate(() => {
      const body = document.querySelector('#baker-directory-body');
      body.scrollTop = Math.max(0, body.scrollTop - 43);
      return body.scrollTop;
    });
    await page.waitForTimeout(120);
    assert(Math.abs((await page.locator('#baker-directory-body').evaluate((body) => body.scrollTop)) - readerTop) < 1, 'Baker Directory: delayed restore overrode a reader scroll made after reconciliation');

    await page.locator('[data-bdc-clear-search]').click();
    await page.waitForFunction(() => {
      const input = document.querySelector('#baker-directory-search-input');
      return input?.value === ''
        && input.getAttribute('value') === ''
        && document.querySelectorAll('.baker-directory-table tbody tr').length === 502
        && document.activeElement === input
        && !new URL(window.location.href).searchParams.has('search');
    }, null, { timeout: 5000 });
    const clearedSearchState = await page.evaluate(() => ({
      attribute: document.querySelector('#baker-directory-search-input')?.getAttribute('value'),
      focused: document.activeElement === document.querySelector('#baker-directory-search-input'),
      property: document.querySelector('#baker-directory-search-input')?.value,
      rows: document.querySelectorAll('.baker-directory-table tbody tr').length,
      route: window.location.href
    }));
    assert(
      clearedSearchState.property === ''
        && clearedSearchState.attribute === ''
        && clearedSearchState.focused
        && clearedSearchState.rows === 502
        && !new URL(clearedSearchState.route).searchParams.has('search'),
      `Baker Directory: Clear must reset the live input property, complete rows, focus, and route state ${JSON.stringify(clearedSearchState)}`
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'clean';
      localStorage.setItem('tezos-systems-theme', 'clean');
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const mobileState = await page.evaluate(() => {
      const overlay = document.querySelector('#baker-directory-modal');
      const content = document.querySelector('.baker-directory-content');
      const wrap = document.querySelector('.baker-directory-table-wrap');
      const badge = document.querySelector('.lb-badge-accepted');
      const badgeStyle = badge ? getComputedStyle(badge) : null;
      return {
        bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        overlayActive: overlay?.classList.contains('active') || false,
        contentInsideViewport: Boolean(content && content.getBoundingClientRect().left >= -1 && content.getBoundingClientRect().right <= window.innerWidth + 1),
        tableContained: Boolean(wrap && wrap.scrollWidth > wrap.clientWidth && wrap.getBoundingClientRect().right <= window.innerWidth + 1),
        badgeVisible: Boolean(badge && badge.getBoundingClientRect().width > 0 && badgeStyle?.display !== 'none'),
        badgeColor: badgeStyle?.color || '',
        badgeBackground: badgeStyle?.backgroundColor || ''
      };
    });
    assert(mobileState.bodyOverflow <= 1 && mobileState.overlayActive && mobileState.contentInsideViewport && mobileState.tableContained, `Baker Directory: mobile containment failed ${JSON.stringify(mobileState)}`);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#baker-directory-modal')?.classList.contains('active'), null, { timeout: 5000 });
    await page.waitForURL((url) => url.pathname === '/', { timeout: 5000 });
    await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true', null, { timeout: 30000 });
    await page.evaluate(() => {
      window.__bakerDirectoryDirectRouteFocus = document.querySelector('#baker-directory-entry-card [aria-label="Open Baker Directory Chamber"]');
    });
    await page.waitForFunction(() => document.activeElement === window.__bakerDirectoryDirectRouteFocus, null, { timeout: 5000 });
    const closeState = await page.evaluate(() => ({
      exactFocus: document.activeElement === window.__bakerDirectoryDirectRouteFocus,
      focusConnected: Boolean(window.__bakerDirectoryDirectRouteFocus?.isConnected),
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow,
      activeModals: document.querySelectorAll('.modal-overlay.active').length,
      route: window.location.pathname
    }));
    assert(
      closeState.exactFocus
        && closeState.focusConnected
        && closeState.route === '/'
        && closeState.bodyOverflow !== 'hidden'
        && closeState.htmlOverflow !== 'hidden'
        && closeState.activeModals === 0,
      `Baker Directory: direct-route Escape did not restore its exact launcher, home route, and scroll lock ${JSON.stringify(closeState)}`
    );

    // Home geometry is meaningful only after the lightweight route hands off.
    await assertPromotedLauncherGeometry(page, 'Baker Directory mobile launcher pair');
    const directoryLauncherFreshness = await page.locator('#baker-directory-entry-card').evaluate(card => ({
      label: card.dataset.updatedLabel, footer: card.querySelector('.chamber-entry-freshness')?.textContent.trim()
    }));
    assert(/^(?:TzKT observed|Cached TzKT) · /.test(directoryLauncherFreshness.label)
      && directoryLauncherFreshness.label === directoryLauncherFreshness.footer, `Baker Directory: handoff launcher observation freshness missing ${JSON.stringify(directoryLauncherFreshness)}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await assertPromotedLauncherGeometry(page, 'Baker Directory desktop launcher pair', { desktop: true });

    await context.close();
    assert(issues.length === 0, `Baker Directory browser issues:\n${issues.join('\n')}`);
    log('ok - Baker Directory complete-set, factual signals, direct route, quiet refresh, and mobile smoke');
  }

  async function smokeBakerWalletActions(browser, baseUrl) {
    const openDirectory = async (walletAddress, label) => {
      const issues = [];
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        serviceWorkers: 'block'
      });
      await installFeatureMocks(context, { bakerDirectoryPaged: true });
      await installOctezConnectMock(context, walletAddress, { startConnected: true });
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'aurora');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        localStorage.removeItem('tezos-systems-leaderboard-cache-v6');
      });
      const page = await context.newPage();
      attachIssueCollectors(page, label, issues);
      const response = await page.goto(`${baseUrl}/leaderboard/?view=directory`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `${label}: direct route failed with HTTP ${response?.status()}`);
      await page.waitForFunction(() => document.querySelectorAll('#baker-directory-panel .baker-directory-table tbody tr').length === 502, null, { timeout: 15000 });
      return { context, issues, page };
    };

    {
      const { context, issues, page } = await openDirectory(SAMPLE_IDLE_ADDRESS, 'Baker delegation action');
      await expectCount(page, '#baker-directory-panel [data-baker-action="delegate"]', 502, 'Baker Directory delegation controls');
      await expectCount(page, '#baker-directory-panel [data-baker-action="stake"]', 502, 'Baker Directory stake controls');
      await page.locator(`#baker-directory-panel tr[data-address="${SAMPLE_ADDRESS}"] [data-baker-action="delegate"]`).click();
      await page.locator('#baker-action-modal.active [data-baker-action-submit="delegate"]:not([disabled])').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('#baker-action-modal [data-baker-action-submit="delegate"]').click();
      await page.waitForFunction(() => window.__octezConnectRequests?.length === 1, null, { timeout: 5000 });
      const request = await page.evaluate(() => window.__octezConnectRequests[0]);
      const expectedRequest = {
        operationDetails: [{
          kind: 'delegation',
          delegate: SAMPLE_ADDRESS
        }]
      };
      assert(JSON.stringify(request) === JSON.stringify(expectedRequest), `Baker delegation action: unexpected wallet request ${JSON.stringify(request)}`);
      await page.locator('#baker-action-modal .baker-action-status').waitFor({ state: 'visible', timeout: 5000 });
      assert((await page.locator('#baker-action-modal .baker-action-status').innerText()).includes('Submitted'), 'Baker delegation action: submitted state was not shown');
      await context.close();
      assert(issues.length === 0, `Baker delegation action browser issues:\n${issues.join('\n')}`);
    }

    {
      const { context, issues, page } = await openDirectory(SAMPLE_REGULAR_DELEGATOR_ADDRESS, 'Baker stake action');
      await page.locator(`#baker-directory-panel tr[data-address="${SAMPLE_ADDRESS}"] [data-baker-action="stake"]`).click();
      await page.locator('#baker-action-modal.active [data-baker-action-submit="stake"]:not([disabled])').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('#baker-action-stake-amount').fill('2.5');
      await page.locator('#baker-action-risk-confirm').check();
      await page.locator('#baker-action-modal [data-baker-action-submit="stake"]').click();
      await page.waitForFunction(() => window.__octezConnectRequests?.length === 1, null, { timeout: 5000 });
      const request = await page.evaluate(() => window.__octezConnectRequests[0]);
      const expectedRequest = {
        operationDetails: [{
          kind: 'transaction',
          destination: SAMPLE_REGULAR_DELEGATOR_ADDRESS,
          amount: '2500000',
          parameters: {
            entrypoint: 'stake',
            value: { prim: 'Unit' }
          }
        }]
      };
      assert(JSON.stringify(request) === JSON.stringify(expectedRequest), `Baker stake action: unexpected wallet request ${JSON.stringify(request)}`);

      await page.locator('#baker-action-modal .baker-action-close').click();
      await page.locator(`#baker-directory-panel tr[data-address="${SAMPLE_ADDRESS_2}"] [data-baker-action="delegate"]`).click();
      await page.locator('#baker-action-modal.active .baker-action-blocked').waitFor({ state: 'visible', timeout: 10000 });
      const blocked = await page.locator('#baker-action-modal .baker-action-blocked').innerText();
      assert(blocked.includes('already delegates to QA Baker') && blocked.includes('switching is intentionally not offered'), `Baker delegation action: existing delegation was not safely gated: ${blocked}`);
      assert(await page.locator('#baker-action-modal [data-baker-action-submit="delegate"]').isDisabled(), 'Baker delegation action: switching control must stay disabled');
      await context.close();
      assert(issues.length === 0, `Baker stake action browser issues:\n${issues.join('\n')}`);
    }

    log('ok - Baker Directory wallet-reviewed delegation and stake actions');
  }

  return { smokeStakingChamber, smokeLeaderboardSignals, smokeBakerWalletActions };
}
