// Browser workflows owned by my-tezos-navigation. Shared dependencies remain explicit.
export function createMyTezosNavigationSmokeSuites({
  ARTIFACTS_DIR,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  SAMPLE_DELEGATOR_ADDRESS,
  SAMPLE_ETHERLINK_ADDRESS,
  assert,
  attachIssueCollectors,
  expectClassContains,
  expectShareModal,
  installFeatureMocks,
  log,
  path,
  revealMyTezosAccountControls
}) {
  async function smokeMyTezosLedgerFlowHandoff(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript((address) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', address);
    }, SAMPLE_ADDRESS);

    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos Ledger Flow handoff', issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `my tezos Ledger Flow handoff: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#my-tezos-btn[data-drawer-wired="1"]').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#my-tezos-tab-transactions').click();

    const ledgerLink = page.locator('#my-tezos-ledger-flow-link');
    await ledgerLink.waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#my-tezos-maxi-passport-link').waitFor({ state: 'visible', timeout: 5000 });
    const expectedHash = `#ledger-flow=${encodeURIComponent(SAMPLE_ADDRESS)}`;
    const expectedHref = `/${expectedHash}`;
    assert(
      await ledgerLink.getAttribute('href') === expectedHref,
      `my tezos Ledger Flow handoff: link lost its address scope ${await ledgerLink.getAttribute('href')}`
    );
    const mobileJourneyGeometry = await page.evaluate(() => {
      const section = document.querySelector('#drawer-more-section');
      const actions = document.querySelector('#drawer-more-actions');
      const cards = Array.from(actions?.querySelectorAll('.drawer-account-journey-card') || []).map((card) => {
        const rect = card.getBoundingClientRect();
        const description = card.querySelector('small');
        return {
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          descriptionVisible: Boolean(description && getComputedStyle(description).display !== 'none')
        };
      });
      return {
        cards,
        sectionPanel: section?.closest('[data-my-tezos-panel]')?.id || '',
        beforeReceipts: section.getBoundingClientRect().bottom <= document.querySelector('#portfolio-activity-list').getBoundingClientRect().top + 1,
        secondaryContainers: document.querySelectorAll('#drawer-more-section-secondary').length
      };
    });
    assert(
      mobileJourneyGeometry.cards.length === 2
        && mobileJourneyGeometry.cards[0].top < mobileJourneyGeometry.cards[1].top
        && Math.abs(mobileJourneyGeometry.cards[0].width - mobileJourneyGeometry.cards[1].width) <= 1
        && mobileJourneyGeometry.cards.every((card) => card.descriptionVisible)
        && mobileJourneyGeometry.sectionPanel === 'my-tezos-panel-transactions'
        && mobileJourneyGeometry.beforeReceipts
        && mobileJourneyGeometry.secondaryContainers === 0,
      `my tezos Ledger Flow handoff: account journeys are not one readable mobile stack ${JSON.stringify(mobileJourneyGeometry)}`
    );

    await ledgerLink.click();
    await page.locator('#ledger-flow-modal.active .ledger-flow-content').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#ledger-flow-modal [data-site-wayfinder="ledger-flow"] .site-wayfinder-link').length === 4, null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const drawer = document.querySelector('#my-tezos-drawer');
      const dialog = document.querySelector('#ledger-flow-modal.active .ledger-flow-content');
      return drawer?.getAttribute('aria-hidden') === 'true'
        && drawer?.inert === true
        && !drawer?.classList.contains('open')
        && dialog?.contains(document.activeElement);
    }, null, { timeout: 5000 });

    const state = await page.evaluate(() => {
      const drawer = document.querySelector('#my-tezos-drawer');
      const scrim = document.querySelector('#my-tezos-drawer-scrim');
      const modal = document.querySelector('#ledger-flow-modal');
      const dialog = modal?.querySelector('.ledger-flow-content');
      const modalRect = modal?.getBoundingClientRect();
      return {
        hash: window.location.hash,
        drawerOpen: drawer?.classList.contains('open') || false,
        drawerAriaHidden: drawer?.getAttribute('aria-hidden') || '',
        drawerInert: drawer?.inert === true,
        scrimOpen: scrim?.classList.contains('open') || false,
        triggerExpanded: document.querySelector('#my-tezos-btn')?.getAttribute('aria-expanded') || '',
        modalActive: modal?.classList.contains('active') || false,
        modalAriaHidden: modal?.getAttribute('aria-hidden') || '',
        modalVisible: Boolean(modalRect && modalRect.width > 0 && modalRect.height > 0),
        focusInsideModal: Boolean(dialog?.contains(document.activeElement)),
        wayfinder: Array.from(document.querySelectorAll('#ledger-flow-modal [data-site-wayfinder="ledger-flow"] .site-wayfinder-link')).map((link) => ({
          id: link.dataset.journeyTo,
          href: link.getAttribute('href')
        })),
        bodyOverflow: document.body.style.overflow,
        htmlOverflow: document.documentElement.style.overflow
      };
    });

    assert(state.hash === expectedHash, `my tezos Ledger Flow handoff: address route mismatch ${JSON.stringify(state)}`);
    assert(!state.drawerOpen && state.drawerAriaHidden === 'true' && state.drawerInert, `my tezos Ledger Flow handoff: drawer remained interactive over the Chamber ${JSON.stringify(state)}`);
    assert(!state.scrimOpen && state.triggerExpanded === 'false', `my tezos Ledger Flow handoff: drawer chrome remained active ${JSON.stringify(state)}`);
    assert(state.modalActive && state.modalAriaHidden === 'false' && state.modalVisible, `my tezos Ledger Flow handoff: Chamber did not become visible ${JSON.stringify(state)}`);
    assert(state.focusInsideModal, `my tezos Ledger Flow handoff: focus did not transfer into the Chamber ${JSON.stringify(state)}`);
    assert(state.wayfinder.length === 4 && state.wayfinder[0]?.id === 'my-tezos' && state.wayfinder[0]?.href === '/my/?view=transactions', `my tezos Ledger Flow handoff: generic wayfinder lost its contextual account return ${JSON.stringify(state.wayfinder)}`);
    assert(state.bodyOverflow === 'hidden' && state.htmlOverflow === 'hidden', `my tezos Ledger Flow handoff: Chamber did not take ownership of scroll locking ${JSON.stringify(state)}`);

    await context.close();
    assert(issues.length === 0, `my tezos Ledger Flow handoff browser issues:\n${issues.join('\n')}`);
    log('ok - My Tezos mobile Ledger Flow handoff smoke');
  }

  async function smokeMyTezosCircularReturn(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript((address) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', address);
      if (!sessionStorage.getItem('__journey-smoke-initialized')) {
        sessionStorage.removeItem('tezos-systems-my-tezos-origin-v1');
        sessionStorage.setItem('__journey-smoke-initialized', '1');
      }
    }, SAMPLE_ADDRESS);

    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos circular return', issues);
    const response = await page.goto(`${baseUrl}/capital/?view=art`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `my tezos circular return: Capital Art failed with HTTP ${response?.status()}`);
    await page.locator('#capital-modal.active .capital-content').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => (
      /Art/i.test(document.querySelector('#capital-modal .capital-tab[aria-selected="true"]')?.textContent || '')
      && Boolean(document.querySelector('#capital-modal [data-site-wayfinder="capital-art"] [data-journey-to="my-tezos"]'))
    ), null, { timeout: 10000 });

    const personalLink = page.locator('#capital-modal [data-site-wayfinder="capital-art"] [data-journey-to="my-tezos"]');
    assert(await personalLink.getAttribute('href') === '/my/?view=collection', `my tezos circular return: Capital Art did not target Collection ${await personalLink.getAttribute('href')}`);
    await page.evaluate(() => {
      window.trackTezosSystemsEvent = (name, details) => {
        sessionStorage.setItem('__journey-smoke-event', JSON.stringify({ name, details }));
      };
    });
    await personalLink.click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
    try {
      await page.waitForFunction(() => (
        location.pathname === '/my/'
        && location.search === '?view=collection'
        && document.querySelector('#my-tezos-tab-collection')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#drawer-more-actions [data-journey-return="true"]')
      ), null, { timeout: 10000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({
        pathname: location.pathname,
        search: location.search,
        selected: document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || '',
        origin: sessionStorage.getItem('tezos-systems-my-tezos-origin-v1'),
        analytics: sessionStorage.getItem('__journey-smoke-event'),
        cards: Array.from(document.querySelectorAll('#drawer-more-actions .drawer-account-journey-card')).map((card) => ({
          id: card.dataset.myTezosJourneyDestination,
          href: card.getAttribute('href'),
          reason: card.dataset.journeyReason,
          isReturn: card.dataset.journeyReturn
        }))
      }));
      throw new Error(`my tezos circular return: Collection handoff did not settle ${JSON.stringify(debug)}; ${error.message}`);
    }

    const myTezosState = await page.evaluate(() => ({
      origin: JSON.parse(sessionStorage.getItem('tezos-systems-my-tezos-origin-v1') || 'null'),
      analytics: JSON.parse(sessionStorage.getItem('__journey-smoke-event') || 'null'),
      cards: Array.from(document.querySelectorAll('#drawer-more-actions .drawer-account-journey-card')).map((card) => ({
        id: card.dataset.myTezosJourneyDestination,
        title: card.querySelector('strong')?.textContent?.trim() || '',
        href: card.getAttribute('href') || '',
        isReturn: card.dataset.journeyReturn === 'true'
      })),
      sectionPanel: document.querySelector('#drawer-more-section')?.closest('[data-my-tezos-panel]')?.id || '',
      beforeReceipts: document.querySelector('#drawer-more-section').getBoundingClientRect().bottom <= document.querySelector('#collection-grid').getBoundingClientRect().top + 1
    }));
    assert(
      JSON.stringify(myTezosState.origin) === JSON.stringify({ entryId: 'capital', intentId: 'capital-art' }),
      `my tezos circular return: session origin leaked or drifted ${JSON.stringify(myTezosState)}`
    );
    assert(
      myTezosState.analytics?.name === 'journey_follow'
        && JSON.stringify(Object.keys(myTezosState.analytics.details || {})) === JSON.stringify(['from', 'to', 'surface', 'reason'])
        && !/(?:tz[1-4]|KT1|0x[0-9a-f]{40}|\.tez|address=|view=)/i.test(JSON.stringify(myTezosState.analytics.details)),
      `my tezos circular return: journey analytics leaked route or account state ${JSON.stringify(myTezosState.analytics)}`
    );
    assert(
      myTezosState.cards.length === 2
        && myTezosState.cards[0].isReturn
        && myTezosState.cards[0].title === 'Return to Art Economy'
        && myTezosState.cards[0].href === '/capital/?view=art'
        && !myTezosState.cards[1].isReturn
        && myTezosState.sectionPanel === 'my-tezos-panel-collection'
        && myTezosState.beforeReceipts,
      `my tezos circular return: Collection did not reuse the two-card workflow ${JSON.stringify(myTezosState)}`
    );

    await page.locator('#drawer-more-actions [data-journey-return="true"]').click();
    await page.locator('#capital-modal.active .capital-content').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => (
      location.pathname === '/capital/'
      && location.search === '?view=art'
      && /Art/i.test(document.querySelector('#capital-modal .capital-tab[aria-selected="true"]')?.textContent || '')
      && sessionStorage.getItem('tezos-systems-my-tezos-origin-v1') === null
    ), null, { timeout: 10000 });
    const returned = await page.evaluate(() => ({
      pathname: location.pathname,
      search: location.search,
      selected: document.querySelector('#capital-modal .capital-tab[aria-selected="true"]')?.textContent?.trim() || '',
      origin: sessionStorage.getItem('tezos-systems-my-tezos-origin-v1')
    }));
    assert(
      returned.pathname === '/capital/'
        && returned.search === '?view=art'
        && /Art/i.test(returned.selected)
        && returned.origin === null,
      `my tezos circular return: canonical child return failed ${JSON.stringify(returned)}`
    );

    await context.close();
    assert(issues.length === 0, `my tezos circular return browser issues:\n${issues.join('\n')}`);
    log('ok - My Tezos circular child-view return smoke');
  }

  async function smokeMyTezosSubdomainInput(browser, baseUrl) {
    const issues = [];
    const domain = 'skllz.hack.tez';
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
    await installFeatureMocks(context, { forwardDomainAddress: null, forwardDomainOwner: SAMPLE_ADDRESS_2 });
    await context.addInitScript((address) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', address);
    }, SAMPLE_ADDRESS);

    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos subdomain input', issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `my tezos subdomain input: dashboard failed with HTTP ${response?.status()}`);
    await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');

    await page.locator('#my-tezos-btn').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 5000 });
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos subdomain input drawer');
    await revealMyTezosAccountControls(page);
    await page.locator('#my-baker-input').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#my-baker-input').fill(domain);
    await page.waitForFunction(() => document.querySelector('#my-baker-save')?.textContent?.trim() === 'Save', null, { timeout: 3000 });
    await page.locator('#my-baker-save').click();
    await page.waitForFunction((address) => localStorage.getItem('tezos-systems-my-baker-address') === address, SAMPLE_ADDRESS_2, { timeout: 5000 });
    await page.waitForFunction((address) => (
      window._myTezosData?.fullAddress === address
        && window._myTezosData?.loading !== true
        && window._myTezosData?.isBaker === true
    ), SAMPLE_ADDRESS_2, { timeout: 15000 });

    const state = await page.evaluate(() => ({
      stored: localStorage.getItem('tezos-systems-my-baker-address'),
      savedLabels: JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]').map((item) => ({ address: item.address, label: item.label })),
      savedListText: document.querySelector('#drawer-saved-addresses')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      input: document.querySelector('#my-baker-input')?.value || '',
      error: document.querySelector('#my-baker-error-msg')?.textContent?.trim() || '',
      button: document.querySelector('#my-baker-save')?.textContent?.trim() || '',
      ledgerFlowHref: document.querySelector('#my-tezos-ledger-flow-link')?.getAttribute('href') || '',
      maxiPassportHref: document.querySelector('#my-tezos-maxi-passport-link')?.getAttribute('href') || '',
      journeyDestinations: Array.from(document.querySelectorAll('#drawer-more-actions .drawer-account-journey-card')).map((card) => card.dataset.myTezosJourneyDestination),
      header: document.querySelector('#my-tezos-btn .nav-label')?.textContent || ''
    }));

    assert(state.stored === SAMPLE_ADDRESS_2, `my tezos subdomain input: localStorage did not save resolved address ${JSON.stringify(state)}`);
    assert(state.savedLabels.some((item) => item.address === SAMPLE_ADDRESS_2 && item.label === domain) && state.savedListText.includes(domain), `my tezos subdomain input: local wallet set did not preserve the entered .tez label ${JSON.stringify(state)}`);
    assert(state.input === SAMPLE_ADDRESS_2, `my tezos subdomain input: drawer input did not switch to resolved address ${JSON.stringify(state)}`);
    assert(state.error === '', `my tezos subdomain input: successful domain resolution left stale status text: ${state.error}`);
    assert(state.button === '📋 Copy', `my tezos subdomain input: save button did not return to copy mode ${JSON.stringify(state)}`);
    assert(state.journeyDestinations.join(',') === 'health,chamber', `my tezos subdomain input: verified baker journey matrix drifted ${JSON.stringify(state)}`);
    assert(!state.ledgerFlowHref.includes(SAMPLE_ADDRESS) && !state.maxiPassportHref.includes(SAMPLE_ADDRESS), `my tezos subdomain input: journey cards retained the prior account ${JSON.stringify(state)}`);
    assert(!state.header.includes(SAMPLE_ADDRESS.slice(0, 6)), `my tezos subdomain input: header still shows stale address: ${state.header}`);

    await context.close();
    assert(issues.length === 0, `my tezos subdomain input browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos subdomain input smoke');
  }

  async function smokeMyTezosProposalAttribution(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(({ address, l2 }) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', address);
      localStorage.setItem('tezos-systems-linked-etherlink-accounts-v1', JSON.stringify([{
        chainId: 42793,
        address: l2,
        label: 'Personal L2',
        linkedL1Addresses: [address],
        included: true,
        addedAt: Date.now()
      }]));
    }, { address: SAMPLE_DELEGATOR_ADDRESS, l2: SAMPLE_ETHERLINK_ADDRESS });

    const page = await context.newPage();
    attachIssueCollectors(page, 'my tezos proposal attribution', issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `my tezos proposal attribution: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    await page.locator('#my-tezos-btn[data-drawer-wired="1"]').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', 'my tezos proposal attribution drawer');
    await page.waitForFunction((address) => (
      Array.from(document.querySelectorAll('#my-tezos-wallet-scope option'))
        .some((option) => option.value === address)
    ), SAMPLE_DELEGATOR_ADDRESS, { timeout: 15000 });
    await page.selectOption('#my-tezos-wallet-scope', SAMPLE_DELEGATOR_ADDRESS);
    await page.waitForFunction((address) => (
      document.querySelector('#my-tezos-wallet-scope')?.value === address
        && localStorage.getItem('tezos-systems-my-baker-address') === address
    ), SAMPLE_DELEGATOR_ADDRESS, { timeout: 10000 });
    try {
      await page.waitForFunction((address) => {
        const story = window._myTezosData?.story;
        return window._myTezosData?.fullAddress === address
          && story?.proposalsInjected === 0
          && story?.bakerProposalsInjected === 1
          && story?.nftAssetsCollected === 501
          && story?.creatorStats?.totalCreated === 501
          && story?.creatorStats?.totalSalesVolume === 2.5
          && story?.domainAlias === 'qa-baker.tez';
      }, SAMPLE_DELEGATOR_ADDRESS, { timeout: 30000 });
    } catch (error) {
      const snapshot = await page.evaluate(() => ({
        address: window._myTezosData?.fullAddress || null,
        story: window._myTezosData?.story || null,
        drawer: document.querySelector('#drawer-brief')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      }));
      throw new Error(`${error.message}\nmy tezos proposal attribution snapshot: ${JSON.stringify(snapshot)}`);
    }

    await page.locator('#my-tezos-tab-story').click();
    await page.waitForFunction(() => (
      document.querySelector('#my-tezos-tab-story')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#my-tezos-story-content .tezos-story-dossier')
    ), null, { timeout: 10000 });
    const storyText = await page.evaluate(() => (
      document.querySelector('#my-tezos-story-content')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    ));

    assert(storyText.includes('Baker injected 1 accepted proposal'), `my tezos proposal attribution: missing baker attribution: ${storyText}`);
    assert(!storyText.includes('📜 Injected 1 accepted proposal'), `my tezos proposal attribution: delegator was credited as initiator: ${storyText}`);
    assert(storyText.includes('Smoke'), `my tezos proposal attribution: proposal alias missing: ${storyText}`);
    assert(storyText.includes('Collected 501 NFTs'), `my tezos proposal attribution: NFT collection count missing: ${storyText}`);
    assert(storyText.includes('Created 501 NFTs') && storyText.includes('2.50 XTZ sales'), `my tezos proposal attribution: creator stats missing: ${storyText}`);
    assert(storyText.includes('Known as qa-baker.tez'), `my tezos proposal attribution: domain alias missing: ${storyText}`);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('hot-signal', {
        detail: {
          id: 'etherlink-personal-relevance-smoke',
          category: 'etherlink',
          title: 'Etherlink account context',
          text: 'Etherlink account activity is available.',
          detail: 'Explicit device-local account link',
          score: 999,
          kind: 'state',
          live: true,
          route: '/tezosx/',
          ttlMs: 60000
        }
      }));
    });
    await page.waitForFunction(() => document.querySelectorAll('#my-tezos-story-content .tezos-story-dossier .tezos-story-metric').length >= 4, null, { timeout: 10000 });
    await page.waitForFunction(() => (
      document.querySelectorAll('#drawer-network .network-signal').length >= 4
        && document.querySelectorAll('#drawer-network .network-personal-fact').length >= 3
        && Array.from(document.querySelectorAll('#drawer-network .network-signal[data-category="etherlink"] .network-signal-relevance'))
          .some((relevance) => relevance.textContent?.includes('You have 1 explicitly linked Etherlink account.'))
    ), null, { timeout: 15000 });
    const storySurface = await page.evaluate(() => ({
      metrics: document.querySelectorAll('#my-tezos-story-content .tezos-story-dossier .tezos-story-metric').length,
      badges: document.querySelectorAll('#my-tezos-story-content .tezos-story-dossier .tezos-story-badge').length,
      eras: document.querySelectorAll('#my-tezos-story-content .tezos-story-dossier .tezos-story-era-dot.witnessed, #my-tezos-story-content .tezos-story-dossier .tezos-story-era-dot.joined, #my-tezos-story-content .tezos-story-dossier .tezos-story-era-dot.current').length,
      next: document.querySelector('#my-tezos-story-content .tezos-story-dossier .tezos-story-next')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      overviewStoryCards: document.querySelectorAll('#drawer-brief .brief-section-story').length,
      recentChapter: document.querySelector('#my-tezos-panel-story .my-tezos-recent-chapter')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      signals: document.querySelectorAll('#drawer-network .network-signal').length,
      signalLeads: document.querySelectorAll('#drawer-network .network-signal.is-network-lead').length,
      signalRelevance: document.querySelectorAll('#drawer-network .network-signal-relevance').length,
      signalOrder: Array.from(document.querySelectorAll('#drawer-network .network-signal')).map((signal) => ({
        category: signal.dataset.category || '',
        personal: signal.dataset.personalRelevance === 'true',
        relevance: signal.querySelector('.network-signal-relevance')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      })),
      personalFacts: document.querySelectorAll('#drawer-network .network-personal-fact').length,
      personalText: document.querySelector('#drawer-network .network-personal-spotlight')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      focus: document.querySelector('#drawer-network .network-context-focus')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      networkText: document.querySelector('#drawer-network')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      legacyList: document.querySelectorAll('#drawer-network .network-context-list li').length,
      networkLayout: (() => {
        const outerColumns = document.querySelector('.drawer-live-columns')?.getBoundingClientRect();
        const network = document.querySelector('#drawer-network')?.getBoundingClientRect();
        const personal = document.querySelector('#drawer-network .network-personal-spotlight')?.getBoundingClientRect();
        const live = document.querySelector('#drawer-network .network-live-column')?.getBoundingClientRect();
        return {
          directFullWidth: document.querySelector('#drawer-network')?.parentElement?.classList.contains('drawer-live-columns')
            && outerColumns
            && network
            && Math.abs(network.left - outerColumns.left) <= 1
            && Math.abs(network.right - outerColumns.right) <= 1,
          siblingColumns: personal
            && live
            && Math.abs(personal.top - live.top) <= 1
            && personal.right < live.left
        };
      })()
    }));
    assert(storySurface.metrics >= 4, `my tezos proposal attribution: story metrics missing: ${JSON.stringify(storySurface)}`);
    assert(storySurface.badges >= 5, `my tezos proposal attribution: story badges too thin: ${JSON.stringify(storySurface)}`);
    assert(storySurface.eras >= 3, `my tezos proposal attribution: protocol era rail missing: ${JSON.stringify(storySurface)}`);
    assert(storySurface.next.includes('Now watching') || storySurface.next.includes('Now compounding'), `my tezos proposal attribution: next signal missing: ${storySurface.next}`);
    assert(storySurface.overviewStoryCards === 0 && storySurface.recentChapter.includes('While you were away'), `my tezos proposal attribution: Story was not isolated in its own view ${JSON.stringify(storySurface)}`);
    assert(storySurface.signals >= 4, `my tezos proposal attribution: network context signals missing: ${JSON.stringify(storySurface)}`);
    assert(storySurface.signalLeads === 1, `my tezos proposal attribution: Tezos-now signal hierarchy missing: ${JSON.stringify(storySurface)}`);
    assert(storySurface.personalFacts >= 6 && storySurface.personalText.includes('qa-baker.tez') && storySurface.personalText.includes('501'), `my tezos proposal attribution: wallet spotlight is not genuinely personal: ${JSON.stringify(storySurface)}`);
    assert(storySurface.signalRelevance >= 1, `my tezos proposal attribution: Tezos-now signals lack wallet relevance: ${JSON.stringify(storySurface)}`);
    assert(
      storySurface.signalOrder.some((signal) => (
        signal.category === 'etherlink'
          && signal.relevance.includes('You have 1 explicitly linked Etherlink account.')
      )),
      `my tezos proposal attribution: explicit Etherlink link did not produce truthful personal relevance ${JSON.stringify(storySurface.signalOrder)}`
    );
    assert(
      storySurface.signalOrder.length === 4
        && storySurface.signalOrder[0]?.personal
        && storySurface.signalOrder.every((signal, index, signals) => (
          signal.personal || !signals.slice(index + 1).some((later) => later.personal)
        ))
        && storySurface.signalOrder.every((signal) => !/undefined|null/i.test(signal.relevance)),
      `my tezos proposal attribution: proven personal signals did not form a truthful first tier ${JSON.stringify(storySurface.signalOrder)}`
    );
    assert(/Baker|Governance|Collector|Creator|Portfolio|Network/.test(storySurface.focus), `my tezos proposal attribution: network context focus chips missing: ${storySurface.focus}`);
    assert(storySurface.networkText.includes('Network Context') && storySurface.networkText.includes('Cycle'), `my tezos proposal attribution: network context header missing: ${storySurface.networkText}`);
    assert(storySurface.legacyList === 0, `my tezos proposal attribution: network context still renders legacy bullet list: ${storySurface.networkText}`);
    assert(storySurface.networkLayout.directFullWidth, `my tezos proposal attribution: Network Context is not a full-width row: ${JSON.stringify(storySurface.networkLayout)}`);

    await page.locator('#my-tezos-tab-overview').click();
    await page.waitForFunction(() => document.querySelector('#my-tezos-tab-overview')?.getAttribute('aria-selected') === 'true', null, { timeout: 5000 });
    const visibleNetworkLayout = await page.evaluate(() => {
      const personal = document.querySelector('#drawer-network .network-personal-spotlight')?.getBoundingClientRect();
      const live = document.querySelector('#drawer-network .network-live-column')?.getBoundingClientRect();
      return {
        siblingColumns: personal
          && live
          && Math.abs(personal.top - live.top) <= 1
          && personal.right < live.left,
        personalHeight: Math.round(personal?.height || 0),
        liveHeight: Math.round(live?.height || 0),
        hasAwayCard: Boolean(document.querySelector('#drawer-network .network-away-card')),
        viewportHeight: window.innerHeight
      };
    });
    // Equal-height panels reserve their stable signal rows before receipts arrive.
    const personalHeightLimit = visibleNetworkLayout.viewportHeight * 0.70;
    const liveHeightLimit = visibleNetworkLayout.viewportHeight * (visibleNetworkLayout.hasAwayCard ? 0.82 : 0.70);
    assert(
      visibleNetworkLayout.siblingColumns
        && visibleNetworkLayout.personalHeight > 0
        && visibleNetworkLayout.personalHeight < personalHeightLimit
        && visibleNetworkLayout.liveHeight > 0
        && visibleNetworkLayout.liveHeight < liveHeightLimit,
      `my tezos proposal attribution: visible wallet and Tezos panels are not compact sibling columns: ${JSON.stringify(visibleNetworkLayout)}`
    );

    const networkRoutes = await page.evaluate(() => ({
      header: {
        title: document.querySelector('#drawer-network .network-context-title')?.getAttribute('data-network-route') || '',
        cycle: document.querySelector('#drawer-network .network-context-cycle')?.getAttribute('data-network-route') || ''
      },
      focus: Object.fromEntries(Array.from(document.querySelectorAll('#drawer-network .network-focus-chip')).map((chip) => [
        chip.getAttribute('data-focus'),
        {
          tag: chip.tagName,
          href: chip.getAttribute('href') || '',
          route: chip.getAttribute('data-network-route') || '',
          aria: chip.getAttribute('aria-label') || ''
        }
      ])),
      signals: Array.from(document.querySelectorAll('#drawer-network .network-signal')).map((signal) => ({
        tag: signal.tagName,
        category: signal.getAttribute('data-category') || '',
        href: signal.getAttribute('href') || '',
        route: signal.getAttribute('data-network-route') || '',
        aria: signal.getAttribute('aria-label') || ''
      })),
      personalFacts: Array.from(document.querySelectorAll('#drawer-network .network-personal-fact')).map((fact) => ({
        tag: fact.tagName,
        route: fact.getAttribute('data-network-route') || '',
        view: fact.getAttribute('data-my-tezos-view-route') || ''
      }))
    }));
    assert(networkRoutes.header.title === '#health' && networkRoutes.header.cycle === '#history', `my tezos proposal attribution: network context header routes missing: ${JSON.stringify(networkRoutes.header)}`);
    const renderedFocusRoutes = Object.values(networkRoutes.focus);
    const isFirstPartyRoute = (route) => route.startsWith('#') || route.startsWith('/');
    assert(renderedFocusRoutes.length >= 1 && renderedFocusRoutes.every((chip) => chip.tag === 'A' && isFirstPartyRoute(chip.href) && isFirstPartyRoute(chip.route) && /Open|Enter/.test(chip.aria)), `my tezos proposal attribution: rendered focus chips are not clickable routes: ${JSON.stringify(networkRoutes.focus)}`);
    assert(networkRoutes.focus.baker?.tag === 'A' && networkRoutes.focus.baker.route === '#my-baker', `my tezos proposal attribution: baker chip route mismatch: ${JSON.stringify(networkRoutes.focus)}`);
    assert(networkRoutes.signals.length >= 4 && networkRoutes.signals.every((signal) => signal.tag === 'A' && isFirstPartyRoute(signal.href) && isFirstPartyRoute(signal.route) && /Open|Enter/.test(signal.aria)), `my tezos proposal attribution: network signal routes missing: ${JSON.stringify(networkRoutes.signals)}`);
    assert(networkRoutes.personalFacts.length >= 3 && networkRoutes.personalFacts.every((fact) => fact.tag === 'A' && isFirstPartyRoute(fact.route)), `my tezos proposal attribution: personalized fact routes missing: ${JSON.stringify(networkRoutes.personalFacts)}`);

    await page.locator('#my-tezos-tab-story').click();
    await page.waitForFunction(() => document.querySelector('#my-tezos-tab-story')?.getAttribute('aria-selected') === 'true', null, { timeout: 5000 });
    await page.locator('#my-tezos-story-content .story-share-btn').click();
    await page.locator('#share-modal.visible').waitFor({ state: 'visible', timeout: 10000 });
    const shareState = await page.evaluate(() => ({
      picker: document.querySelector('#share-modal .tweet-picker')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      captured: window.__lastHtml2CanvasText?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(shareState.picker.includes('qa-baker.tez'), `my tezos proposal attribution: share tweet picker missing domain alias: ${shareState.picker}`);
    assert(shareState.captured.includes('Known as qa-baker.tez'), `my tezos proposal attribution: share card capture missing domain alias: ${shareState.captured}`);
    assert(shareState.picker.includes('Collected 501 NFTs'), `my tezos proposal attribution: share tweet picker missing NFT count: ${shareState.picker}`);
    assert(shareState.captured.includes('Collected 501 NFTs'), `my tezos proposal attribution: share card capture missing NFT count: ${shareState.captured}`);
    assert(shareState.picker.includes('Created 501 NFTs'), `my tezos proposal attribution: share tweet picker missing creator stats: ${shareState.picker}`);
    assert(shareState.captured.includes('Created 501 NFTs') && shareState.captured.includes('2.50 XTZ sales'), `my tezos proposal attribution: share card capture missing creator stats: ${shareState.captured}`);
    assert(!shareState.captured.includes('Lived through'), `my tezos proposal attribution: share card still includes governance cycles: ${shareState.captured}`);
    await expectShareModal(page, 'my tezos proposal attribution share', issues);

    await page.locator('#my-tezos-tab-overview').click();
    await page.locator('#drawer-network .network-context-cycle').click();
    await page.waitForFunction(() => window.location.hash === '#history' && !document.querySelector('#my-tezos-drawer')?.classList.contains('open'), null, { timeout: 5000 });
    await page.locator('#history-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 10000 });

    await context.close();
    assert(issues.length === 0, `my tezos proposal attribution browser issues:\n${issues.join('\n')}`);
    log('ok - my tezos proposal attribution smoke');
  }

  async function smokeMyTezosDeepLinkOverridesStale(browser, baseUrl, routeKind = 'all') {
    const directAddressPath = `/${SAMPLE_ADDRESS_2}`;
    const directDomainPath = '/qa-baker.tez';
    const directSubdomainPath = '/skllz.hack.tez';
    const scenarios = [
      {
        label: 'my tezos hash address deep link override',
        path: `/#my-baker=${SAMPLE_ADDRESS_2}`,
        expectedAddress: SAMPLE_ADDRESS_2
      },
      {
        label: 'my tezos hash domain deep link override',
        path: '/#my-baker=qa-baker.tez',
        expectedAddress: SAMPLE_ADDRESS_2,
        forwardDomainAddress: SAMPLE_ADDRESS_2
      },
      {
        label: 'my tezos hash subdomain deep link override',
        path: '/#my-baker=skllz.hack.tez',
        expectedAddress: SAMPLE_ADDRESS_2,
        forwardDomainAddress: null,
        forwardDomainOwner: SAMPLE_ADDRESS_2
      },
      {
        label: 'my tezos direct address path override',
        path: directAddressPath,
        expectedAddress: SAMPLE_ADDRESS_2,
        dashboardPathnames: [directAddressPath]
      },
      {
        label: 'my tezos direct domain path override',
        path: directDomainPath,
        expectedAddress: SAMPLE_ADDRESS_2,
        dashboardPathnames: [directDomainPath],
        forwardDomainAddress: SAMPLE_ADDRESS_2
      },
      {
        label: 'my tezos direct subdomain path override',
        path: directSubdomainPath,
        expectedAddress: SAMPLE_ADDRESS_2,
        dashboardPathnames: [directSubdomainPath],
        forwardDomainAddress: null,
        forwardDomainOwner: SAMPLE_ADDRESS_2
      }
    ];

    const selectedScenarios = scenarios.filter((scenario) => (
      routeKind === 'all'
        || (routeKind === 'hash' && scenario.path.startsWith('/#'))
        || (routeKind === 'path' && !scenario.path.startsWith('/#'))
    ));
    for (const scenario of selectedScenarios) {
      await runMyTezosDeepLinkOverride(browser, baseUrl, scenario);
      log(`ok - ${scenario.label}`);
    }
    log(`ok - my tezos ${routeKind} deep link override smoke`);
  }

  async function smokeMyTezosPrettyRoute(browser, baseUrl) {
    for (const { label, viewport, path: routePath = '/my', expectedView = 'overview' } of [
      { label: 'desktop', viewport: { width: 1280, height: 900 } },
      { label: 'mobile', viewport: { width: 390, height: 844 } },
      { label: 'portfolio tablet', viewport: { width: 760, height: 900 }, path: '/my/?view=portfolio', expectedView: 'portfolio' },
      { label: 'portfolio compact drawer', viewport: { width: 700, height: 900 }, path: '/my/?view=portfolio', expectedView: 'portfolio' },
      { label: 'portfolio mobile', viewport: { width: 390, height: 844 }, path: '/my/?view=portfolio', expectedView: 'portfolio' },
      { label: 'portfolio narrow phone', viewport: { width: 320, height: 740 }, path: '/my/?view=portfolio', expectedView: 'portfolio' },
      { label: 'transactions mobile', viewport: { width: 390, height: 844 }, path: '/my/?view=transactions', expectedView: 'transactions' },
      { label: 'collection mobile', viewport: { width: 390, height: 844 }, path: '/my/?view=collection', expectedView: 'collection' },
      { label: 'story mobile', viewport: { width: 390, height: 844 }, path: '/my/?view=story', expectedView: 'story' },
      { label: 'tezos x mobile', viewport: { width: 390, height: 844 }, path: '/my/?view=tezos-x', expectedView: 'tezos-x' }
    ]) {
      const issues = [];
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await installFeatureMocks(context);
      await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'matrix');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        localStorage.removeItem('tezos-systems-my-baker-address');
      });

      const page = await context.newPage();
      attachIssueCollectors(page, `my tezos pretty route ${label}`, issues);
      const response = await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `my tezos pretty route ${label} failed with HTTP ${response?.status()}`);
      await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() => {
        const drawer = document.querySelector('#my-tezos-drawer');
        return Math.abs(drawer.getBoundingClientRect().right - innerWidth) <= 1;
      });
      await page.evaluate(() => document.fonts.ready);

      const state = await page.evaluate(() => {
        const drawer = document.querySelector('#my-tezos-drawer');
        const drawerBody = document.querySelector('#drawer-body');
        const summaryCards = Array.from(document.querySelectorAll('.portfolio-summary-card')).map((card) => card.getBoundingClientRect());
        const refreshButton = document.querySelector('#portfolio-refresh');
        const refreshRect = refreshButton?.getBoundingClientRect();
        const refreshLabel = refreshButton?.querySelector('[data-portfolio-refresh-label]');
        const refreshLabelRect = refreshLabel?.getBoundingClientRect();
        const refreshWordLines = refreshLabel?.firstChild?.nodeType === Node.TEXT_NODE
          ? Array.from(refreshLabel.textContent.matchAll(/\S+/g), match => {
            const range = document.createRange();
            range.setStart(refreshLabel.firstChild, match.index);
            range.setEnd(refreshLabel.firstChild, match.index + match[0].length);
            return { word: match[0], lines: new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size };
          }) : [];
        const activePanelElement = document.querySelector('[data-my-tezos-panel]:not([hidden])');
        const scopeSelectCandidate = document.querySelector('#my-tezos-wallet-scope');
        const scopeSelect = scopeSelectCandidate?.getClientRects().length ? scopeSelectCandidate : null;
        const scopeSelectRect = scopeSelect?.getBoundingClientRect();
        const scopeSelectStyle = scopeSelect ? getComputedStyle(scopeSelect) : null;
        const localNotice = document.querySelector('.portfolio-local-notice');
        return {
          pathname: window.location.pathname,
          search: window.location.search,
          hash: window.location.hash,
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
          title: document.title,
          emptyStateVisible: getComputedStyle(document.querySelector('#drawer-empty-state')).display !== 'none',
          portfolioSelected: document.querySelector('#my-tezos-tab-portfolio')?.getAttribute('aria-selected') || '',
          selectedView: document.querySelector('[data-my-tezos-view][aria-selected="true"]')?.dataset.myTezosView || '',
          activePanel: activePanelElement?.dataset.myTezosPanel || '',
          drawerWidth: drawer.getBoundingClientRect().width,
          summaryRows: new Set(summaryCards.map((rect) => Math.round(rect.top))).size,
          summaryInsideDrawer: summaryCards.every((rect) => rect.left >= -1 && rect.right <= drawer.getBoundingClientRect().right + 1),
          refreshReadable: Boolean(refreshButton && refreshLabel
            && refreshRect.width >= 44 && refreshRect.height >= 44
            && refreshButton.scrollWidth <= refreshButton.clientWidth + 1
            && refreshLabel.scrollWidth <= refreshLabel.clientWidth + 1
            && refreshLabel.scrollHeight <= refreshLabel.clientHeight + 1
            && refreshWordLines.length > 0 && refreshWordLines.every(word => word.lines === 1)
            && refreshLabelRect.left >= refreshRect.left && refreshLabelRect.right <= refreshRect.right
            && refreshLabelRect.top >= refreshRect.top && refreshLabelRect.bottom <= refreshRect.bottom),
          refreshGeometry: { width: refreshRect?.width, height: refreshRect?.height, labelWidth: refreshLabelRect?.width, labelHeight: refreshLabelRect?.height, words: refreshWordLines },
          localNoticeFits: Boolean(localNotice && localNotice.scrollWidth <= localNotice.clientWidth + 1),
          scopeSelect: scopeSelect ? {
            height: Math.round(scopeSelectRect?.height || 0),
            appearance: scopeSelectStyle?.appearance || '',
            background: scopeSelectStyle?.backgroundColor || '',
            border: scopeSelectStyle?.borderTopStyle || '',
            clipped: scopeSelect.scrollWidth > scopeSelect.clientWidth + 1
          } : null,
          drawerOverflow: drawer.scrollWidth > drawer.clientWidth + 1,
          drawerBodyOverflow: drawerBody.scrollWidth > drawerBody.clientWidth + 1,
          drawerBodyScrollLeft: Math.round(drawerBody.scrollLeft),
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        };
      });

      assert(state.pathname === '/my/' && state.hash === '', `my tezos pretty route ${label} should remain canonical: ${JSON.stringify(state)}`);
      assert(state.canonical === 'https://tezos.systems/my/', `my tezos pretty route ${label} canonical mismatch: ${state.canonical}`);
      assert(state.title.startsWith('My Tezos'), `my tezos pretty route ${label} title mismatch: ${state.title}`);
      if (expectedView === 'portfolio') {
        assert(state.search === '?view=portfolio' && state.portfolioSelected === 'true', `my tezos pretty route ${label} did not select Portfolio: ${JSON.stringify(state)}`);
        const expectedSummaryRows = viewport.width < 360 ? 4 : 2;
        assert(state.drawerWidth >= viewport.width - 1 && state.summaryRows === expectedSummaryRows, `my tezos pretty route ${label} did not use full-width responsive Portfolio geometry: ${JSON.stringify(state)}`);
        assert(state.summaryInsideDrawer && state.refreshReadable && state.localNoticeFits, `my tezos pretty route ${label} clipped Portfolio cards, local notice, or action labels: ${JSON.stringify(state)}`);
        if (ARTIFACTS_DIR) await page.screenshot({ path: path.join(ARTIFACTS_DIR, `my-tezos-route-${label.replaceAll(' ', '-')}.png`) });
        assert(!/tz[1-4]|KT1/.test(state.search), `my tezos pretty route ${label} leaked an address into the route: ${state.search}`);
      } else if (expectedView === 'overview') {
        assert(state.emptyStateVisible && state.portfolioSelected === 'false', `my tezos pretty route ${label} should open the address-free Overview state`);
      } else {
        assert(
          state.search === `?view=${expectedView}`
            && state.selectedView === expectedView
            && state.activePanel === expectedView,
          `my tezos pretty route ${label} did not activate ${expectedView}: ${JSON.stringify(state)}`
        );
      }
      if (state.scopeSelect) {
        assert(
          state.scopeSelect
            && state.scopeSelect.height >= 40
            && state.scopeSelect.appearance === 'none'
            && state.scopeSelect.background !== 'rgba(0, 0, 0, 0)'
            && state.scopeSelect.border === 'solid'
            && !state.scopeSelect.clipped,
          `my tezos pretty route ${label} left a native, clipped, or unstyled scope dropdown: ${JSON.stringify(state.scopeSelect)}`
        );
      }
      assert(!state.drawerOverflow && !state.drawerBodyOverflow && state.drawerBodyScrollLeft === 0 && !state.pageOverflow, `my tezos pretty route ${label} overflowed or shifted: ${JSON.stringify(state)}`);

      await context.close();
      assert(issues.length === 0, `my tezos pretty route ${label} browser issues:\n${issues.join('\n')}`);
    }
    log('ok - my tezos pretty route (desktop + mobile)');
  }

  async function runMyTezosDeepLinkOverride(browser, baseUrl, scenario) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
    const dashboardHtml = scenario.dashboardPathnames?.length
      ? await fetch(`${baseUrl}/`, { cache: 'no-store' }).then((response) => response.text())
      : '';
    await installFeatureMocks(context, {
      baseUrl,
      dashboardHtml,
      dashboardPathnames: scenario.dashboardPathnames || [],
      forwardDomainAddress: scenario.forwardDomainAddress,
      forwardDomainOwner: scenario.forwardDomainOwner
    });
    await context.addInitScript((staleAddress) => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-my-baker-address', staleAddress);
    }, SAMPLE_ADDRESS);

    const page = await context.newPage();
    attachIssueCollectors(page, scenario.label, issues);

    const response = await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `${scenario.label}: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 25000 });
    await page.waitForFunction((address) => localStorage.getItem('tezos-systems-my-baker-address') === address, scenario.expectedAddress, { timeout: 5000 });
    await page.waitForFunction((address) => window._myTezosData?.fullAddress === address, scenario.expectedAddress, { timeout: 25000 });
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat')).some((stat) => (
        stat.textContent.includes('Ext. Delegated') && stat.textContent.includes('220,000.00')
      ));
    }, null, { timeout: 25000 });

    const state = await page.evaluate(() => ({
      stored: localStorage.getItem('tezos-systems-my-baker-address'),
      input: document.querySelector('#my-baker-input')?.value || '',
      header: document.querySelector('#my-tezos-btn .nav-label')?.textContent || '',
      staleMetricStillVisible: Array.from(document.querySelectorAll('#my-baker-results .my-baker-stat')).some((stat) => (
        stat.textContent.includes('Ext. Delegated') && stat.textContent.includes('180,000.00')
      ))
    }));

    assert(state.stored === scenario.expectedAddress, `${scenario.label}: localStorage kept stale address ${state.stored}`);
    assert(state.input === scenario.expectedAddress, `${scenario.label}: drawer input mismatch ${state.input}`);
    assert(!state.header.includes(SAMPLE_ADDRESS.slice(0, 6)), `${scenario.label}: header still shows stale address: ${state.header}`);
    assert(!state.staleMetricStillVisible, `${scenario.label}: stale baker metrics remained visible`);

    await context.close();
    assert(issues.length === 0, `${scenario.label} browser issues:\n${issues.join('\n')}`);
  }

  return { smokeMyTezosLedgerFlowHandoff, smokeMyTezosCircularReturn, smokeMyTezosSubdomainInput, smokeMyTezosProposalAttribution, smokeMyTezosDeepLinkOverridesStale, smokeMyTezosPrettyRoute, runMyTezosDeepLinkOverride };
}
