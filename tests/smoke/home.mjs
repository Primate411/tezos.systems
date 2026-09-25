// Browser workflows owned by home. Shared dependencies remain explicit.
import { observeHomeData, assertPopulatedHome } from '../lib/home-data-ready.mjs';
export function createHomeSmokeSuites({
  SAMPLE_ADDRESS,
  assert,
  assertChamberOrder,
  assertLocatorCount,
  attachIssueCollectors,
  expectClassContains,
  expectCount,
  hasExpectedDefaultChamberDisclosure,
  installFeatureMocks,
  log,
  openDropdown,
  waitForIntentionalRealTime
}) {
  async function smokeDashboard(browser, baseUrl, viewport, label) {
    const issues = [];
    const context = await browser.newContext({
      viewport,
      serviceWorkers: 'block'
    });
    await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
    await installFeatureMocks(context);
    await observeHomeData(context);
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const page = await context.newPage();
    attachIssueCollectors(page, label, issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `${label}: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });

    await assertPopulatedHome(page, label);

    assert((await page.title()).includes('Tezos Systems'), `${label}: title does not include Tezos Systems`);
    const exploreIcon = await page.locator('#features-gear > span').first().evaluate((node) => ({
      hidden: node.getAttribute('aria-hidden'),
      text: node.textContent?.trim() || ''
    }));
    assert(
      exploreIcon.text === '🗺️' && exploreIcon.hidden === 'true',
      `${label}: Explore should use one decorative map icon: ${JSON.stringify(exploreIcon)}`
    );
    await expectCount(page, 'header.header', 1, label);
    await expectCount(page, '#price-bar', 1, label);
    await expectCount(page, '#live-head', 1, label);
    await expectCount(page, '.stat-card', 20, label);
    await expectCount(page, '.card-share-btn, #share-btn, #comparison-share-all-btn', 5, label);
    await expectCount(page, '#build-version', 1, label);
    await expectCount(page, '#widgets-gallery', 1, label);
    await expectCount(page, '#chambers-section', 1, label);
    assert(await page.locator('#chambers-section').isVisible(), `${label}: Chambers should be visible by default`);
    await page.waitForFunction(() => document.querySelectorAll('#chambers-section .chamber-entry-card').length >= 5, null, { timeout: 10000 });
    const defaultCategories = await page.evaluate(() => Array.from(
      document.querySelectorAll('#chambers-grid > .chamber-category'),
      (category) => ({
        key: category.dataset.chamberCategory || '',
        open: category.dataset.chamberExpanded === 'true',
        visibleCards: Array.from(category.querySelectorAll(':scope > .chamber-category-cards > .stat-card')).filter((card) => card.getClientRects().length > 0).length
      })
    ));
    assert(
      hasExpectedDefaultChamberDisclosure(defaultCategories),
      `${label}: Ecosystem must be the only default-open Chamber topic ${JSON.stringify(defaultCategories)}`
    );
    await page.evaluate(() => {
      document.querySelectorAll('#chambers-grid > .chamber-category').forEach((category) => {
        category.dataset.chamberExpanded = 'true';
        category.querySelector(':scope > .chamber-category-head > .chamber-category-toggle')?.setAttribute('aria-expanded', 'true');
        const cards = category.querySelector(':scope > .chamber-category-cards');
        if (cards) cards.hidden = false;
      });
    });
    if (viewport.width <= 720) {
      const mobileGutters = await page.evaluate(() => {
        const rect = (selector) => {
          const item = document.querySelector(selector)?.getBoundingClientRect();
          return item ? { left: item.left, right: item.right, width: item.width } : null;
        };
        return {
          panel: rect('#live-head'),
          well: rect('#hero-search-form'),
          chambers: rect('#chambers-section')
        };
      });
      assert(
        mobileGutters.panel && mobileGutters.well && mobileGutters.well.left > mobileGutters.panel.left,
        `${label}: Live Head search well should stay inset inside its card: ${JSON.stringify(mobileGutters)}`
      );
      assert(
        mobileGutters.chambers && mobileGutters.panel && Math.abs(mobileGutters.chambers.left - mobileGutters.panel.left) <= 1.5,
        `${label}: Chambers area should match Live Head mobile gutter: ${JSON.stringify(mobileGutters)}`
      );

      const closedTray = await page.evaluate(() => {
        const tray = document.querySelector('#corner-gift-tray');
        const toggle = document.querySelector('#corner-gift-toggle');
        const priceBar = document.querySelector('#price-bar');
        const trayRect = tray?.getBoundingClientRect();
        const toggleRect = toggle?.getBoundingClientRect();
        const priceBarRect = priceBar?.getBoundingClientRect();
        const probe = toggleRect ? document.elementFromPoint(toggleRect.left + (toggleRect.width / 2), toggleRect.bottom + 24) : null;
        const overlapWidth = toggleRect && priceBarRect
          ? Math.max(0, Math.min(toggleRect.right, priceBarRect.right) - Math.max(toggleRect.left, priceBarRect.left))
          : 0;
        const overlapHeight = toggleRect && priceBarRect
          ? Math.max(0, Math.min(toggleRect.bottom, priceBarRect.bottom) - Math.max(toggleRect.top, priceBarRect.top))
          : 0;
        return {
          position: tray ? getComputedStyle(tray).position : '',
          trayHeight: trayRect?.height || 0,
          toggleHeight: toggleRect?.height || 0,
          priceBarOverlapArea: overlapWidth * overlapHeight,
          giftToPriceGap: toggleRect && priceBarRect ? priceBarRect.left - toggleRect.right : 0,
          probeId: probe?.id || '',
          probeInsideTray: Boolean(probe?.closest?.('#corner-gift-tray'))
        };
      });
      assert(closedTray.position === 'relative', `${label}: mobile corner tray must own an in-flow utility slot ${JSON.stringify(closedTray)}`);
      assert(closedTray.trayHeight <= closedTray.toggleHeight + 1, `${label}: hidden corner tools inflate the closed tray hitbox ${JSON.stringify(closedTray)}`);
      assert(closedTray.priceBarOverlapArea <= 1, `${label}: mobile corner gift is layered over the top telemetry rail ${JSON.stringify(closedTray)}`);
      assert(closedTray.giftToPriceGap >= 7.5, `${label}: mobile corner gift needs a visible gutter before telemetry ${JSON.stringify(closedTray)}`);
      assert(!closedTray.probeInsideTray, `${label}: invisible corner tray intercepts the header below its toggle ${JSON.stringify(closedTray)}`);

      await page.setViewportSize({ width: 320, height: viewport.height });
      const narrowTopRail = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() || null;
        const priceBar = rect('#price-bar');
        const cycle = rect('#cycle-chip');
        const bake = rect('.price-cta[title="Bake on Tezos"]');
        return {
          viewportWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          priceBarRight: priceBar?.right || 0,
          cycleWidth: cycle?.width || 0,
          bakeRight: bake?.right || 0
        };
      });
      await page.setViewportSize(viewport);
      assert(narrowTopRail.scrollWidth <= narrowTopRail.viewportWidth + 1, `${label}: 320px utility rail causes horizontal overflow ${JSON.stringify(narrowTopRail)}`);
      assert(narrowTopRail.cycleWidth > 0 && narrowTopRail.bakeRight <= narrowTopRail.priceBarRight + 1, `${label}: 320px utility rail clips cycle or Bake action ${JSON.stringify(narrowTopRail)}`);

      const scrolledTray = await page.evaluate(() => {
        const gift = document.querySelector('#corner-gift-toggle')?.getBoundingClientRect();
        const title = document.querySelector('.header-title-row')?.getBoundingClientRect();
        const tray = document.querySelector('#corner-gift-tray');
        const trayPosition = tray ? getComputedStyle(tray).position : '';
        const scrollDelta = 80;
        const giftShift = trayPosition === 'fixed' ? 0 : scrollDelta;
        const giftAfter = gift ? { left: gift.left, right: gift.right, top: gift.top - giftShift, bottom: gift.bottom - giftShift } : null;
        const titleAfter = title ? { left: title.left, right: title.right, top: title.top - scrollDelta, bottom: title.bottom - scrollDelta } : null;
        const overlapWidth = giftAfter && titleAfter ? Math.max(0, Math.min(giftAfter.right, titleAfter.right) - Math.max(giftAfter.left, titleAfter.left)) : 0;
        const overlapHeight = giftAfter && titleAfter ? Math.max(0, Math.min(giftAfter.bottom, titleAfter.bottom) - Math.max(giftAfter.top, titleAfter.top)) : 0;
        return {
          trayPosition,
          giftBottom: giftAfter?.bottom ?? 0,
          overlapArea: overlapWidth * overlapHeight
        };
      });
      assert(scrolledTray.trayPosition === 'relative' && scrolledTray.giftBottom <= 0 && scrolledTray.overlapArea === 0, `${label}: corner gift must leave with the mobile header instead of overlapping the title ${JSON.stringify(scrolledTray)}`);
    }
    // Dashboard smoke is allowed to exercise the launcher, but it must no
    // longer assume the Tezos X feature was eager. Visibility/hover is the
    // explicit hydration intent; the dedicated lazy suite covers pre-intent.
    await page.locator('#tezlink-entry-card').scrollIntoViewIfNeeded();
    await page.locator('#tezlink-entry-card').hover();
    await page.locator('#chambers-section #tezlink-entry-card.chamber-entry-wide .card-copy-link[data-copy-hash="#tezosx"]').waitFor({ state: 'attached', timeout: 10000 });
    await expectCount(page, '#chambers-section #tezlink-entry-card.chamber-entry-wide .card-copy-link[data-copy-hash="#tezosx"]', 1, `${label} Tezos X chamber card`);
    await assertChamberOrder(page, label);
    assert(!(await page.locator('#consensus-section').isVisible()), `${label}: Consensus stats should be hidden by default`);
    assert(!(await page.locator('#economy-section').isVisible()), `${label}: Economy stats should be hidden by default`);
    assert(!(await page.locator('#governance-section').isVisible()), `${label}: Governance stats should be hidden by default`);
    assert(!(await page.locator('#network-activity-section').isVisible()), `${label}: Network Activity stats should be hidden by default`);
    assert(!(await page.locator('#ecosystem-section').isVisible()), `${label}: Ecosystem stats should be hidden by default`);
    assert(!(await page.locator('#widgets-gallery').isVisible()), `${label}: Embed Builder utility should be hidden by default`);
    await expectCount(page, '#widgets-gallery .widget-utility-panel', 1, label);
    await expectCount(page, '#widgets-gallery a[href="/widgets/builder.html"]', 1, label);
    assert(await page.locator('#widgets-gallery .widget-preview-card').count() === 0, `${label}: raw widget preview cards should be demoted out of dashboard`);
    assert(await page.locator('#widgets-gallery a[href^="/widgets/"]:not([href="/widgets/builder.html"])').count() === 0, `${label}: dashboard widget utility should not link to raw widget endpoints`);
    await expectCount(page, '.section-copy-link', 6, label);
    await expectCount(page, '#chambers-section .section-copy-link', 0, `${label} Explore Tezos header`);

    await openDropdown(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#changelog-btn').click();
    await page.locator('#changelog-modal[aria-hidden="false"]').waitFor({ state: 'attached', timeout: 5000 });
    assert((await page.locator('#changelog-body').innerText()).includes('2026'), `${label}: changelog content missing`);
    await page.locator('#changelog-modal .changelog-modal-close').click();
    await page.locator('#changelog-modal[aria-hidden="true"]').waitFor({ state: 'attached', timeout: 5000 });

    await openDropdown(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#theme-toggle').click();
    await page.locator('#theme-picker-dropdown').waitFor({ state: 'visible', timeout: 5000 });
    await expectCount(page, '#theme-picker-dropdown .theme-row', 15, label);
    await expectCount(page, '#theme-picker-dropdown .theme-link-copy', 15, label);
    await page.keyboard.press('Escape');

    await openDropdown(page, '#features-gear', '#features-dropdown');
    await expectCount(page, '#features-dropdown.feature-launcher', 1, label);
    await assertLocatorCount(page.locator('#features-dropdown details.feature-launcher-disclosure'), 6, `${label} Explore disclosure groups`);
    await assertLocatorCount(page.locator('#features-dropdown [data-site-map-starter]'), 3, `${label} Explore promoted starters`);
    await expectCount(page, '#features-dropdown button.feature-copy-link', 10, label);
    await expectCount(page, '#features-dropdown .feature-launcher-directory-link[href="/#site-map"]', 1, label);
    await expectCount(page, '#features-dropdown #search-everything-feature-link', 0, label);
    await expectCount(page, '#features-dropdown #chambers-toggle', 1, label);
    await expectCount(page, '#features-dropdown .feature-copy-link[data-copy-hash="#chambers"]', 1, label);
    await expectCount(page, '#features-dropdown #domains-feature-link[href="/domains/"]', 1, label);
    await expectCount(page, '#features-dropdown .feature-copy-link[data-copy-hash="#domains"]', 1, label);
    await expectCount(page, '#features-dropdown #ctez-feature-btn', 1, label);
    await expectCount(page, '#features-dropdown .feature-copy-link[data-copy-hash="#ctez"]', 1, label);
    await expectCount(page, '#corner-gift-items #tzsafe-launcher[href="https://tzsafe.tez.page/"]', 1, label);
    await expectCount(page, '#features-dropdown #tzsafe-feature-link[href="https://tzsafe.tez.page/"]', 1, label);
    await expectCount(page, '#features-dropdown .feature-external-link[href="https://tzsafe.tez.page/"]', 1, label);
    assert((await page.locator('#features-dropdown #tzsafe-feature-link').evaluate((el) => el.textContent || '')).includes('legacy TzSafe KT1 safes'), `${label}: TzSafe launcher copy missing`);
    const exploreGeometry = await page.evaluate(() => {
      const launcher = document.querySelector('#features-dropdown');
      const launcherRect = launcher?.getBoundingClientRect();
      const starters = Array.from(document.querySelectorAll('#features-dropdown [data-site-map-starter]'));
      const disclosures = Array.from(document.querySelectorAll('#features-dropdown details.feature-launcher-disclosure'));
      return {
        launcherInside: Boolean(launcherRect && launcherRect.left >= -1 && launcherRect.right <= innerWidth + 1 && launcherRect.top >= -1 && launcherRect.bottom <= innerHeight + 1),
        starterOrder: starters.map((row) => row.getAttribute('data-site-map-starter')),
        startersVisible: starters.every((row) => {
          const rect = row.getBoundingClientRect();
          return launcherRect && rect.top >= launcherRect.top && rect.bottom <= launcherRect.bottom;
        }),
        directoryVisible: (() => {
          const rect = document.querySelector('#site-map-feature-link')?.getBoundingClientRect();
          return Boolean(launcherRect && rect && rect.top >= launcherRect.top && rect.bottom <= launcherRect.bottom);
        })(),
        openDisclosures: disclosures.filter((group) => group.open).map((group) => group.id),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    const directoryFitsFirstView = viewport.width > 720 || exploreGeometry.directoryVisible;
    assert(exploreGeometry.launcherInside && exploreGeometry.startersVisible && directoryFitsFirstView && exploreGeometry.horizontalOverflow <= 1, `${label}: Explore sheet, starter rows, or mobile complete-directory exit escape the first view ${JSON.stringify(exploreGeometry)}`);
    assert(exploreGeometry.starterOrder.join(',') === 'pulse,staking-chamber,maxis', `${label}: Explore starter order drifted ${JSON.stringify(exploreGeometry)}`);
    assert(exploreGeometry.openDisclosures.length === 0, `${label}: secondary Explore groups should start collapsed ${JSON.stringify(exploreGeometry)}`);
    await assertLocatorCount(page.locator('#features-dropdown #chamber-toggle, #features-dropdown #liquidity-baking-toggle, #features-dropdown #tz4-adoption-toggle'), 0, `${label} individual chamber launchers`);
    assert((await page.locator('#features-dropdown a[href="/widgets/builder.html"]').evaluate((node) => node.textContent || '')).includes('Tezos Widgets'), `${label}: launcher should point widgets to Tezos Widgets`);
    await page.locator('#explore-markets > summary').click();
    await page.locator('.feature-copy-link[data-copy-hash="#compare"]').click();
    await page.waitForFunction(() => document.querySelector('.feature-copy-link[data-copy-hash="#compare"]')?.textContent?.trim() === '✓', null, { timeout: 3000 });
    await page.locator('#explore-bakers-staking > summary').click();
    await page.locator('#calc-toggle').click();
    await page.locator('#calculator-section.visible').waitFor({ state: 'visible', timeout: 5000 });
    await expectClassContains(page.locator('#calculator-section'), 'visible', `${label} #calculator-section`);
    await page.locator('#calc-amount').fill('10000');
    await page.waitForFunction(() => {
      const text = document.querySelector('#calc-daily-xtz')?.textContent?.trim() || '';
      return text && text !== '-';
    }, null, { timeout: 5000 });

    await page.locator('#features-dropdown .feature-launcher-close').click();
    assert(!(await page.locator('#features-dropdown').evaluate((node) => node.classList.contains('open'))), `${label}: Explore close button did not close the sheet`);
    assert(await page.locator('#features-gear').evaluate((node) => node === document.activeElement), `${label}: Explore close button did not return focus to its trigger`);

    await page.locator('#my-tezos-btn').click();
    await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 15000 });
    await expectClassContains(page.locator('#my-tezos-drawer'), 'open', `${label} #my-tezos-drawer`);
    await expectCount(page, '#drawer-address-input', 1, label);
    await page.locator('#drawer-close').click();
    await page.waitForFunction(() => !document.querySelector('#my-tezos-drawer')?.classList.contains('open'), null, { timeout: 5000 });

    await openDropdown(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#share-btn').click();
    await page.locator('#section-picker-modal').waitFor({ state: 'visible', timeout: 5000 });
    await expectCount(page, '#section-picker-modal input[type="checkbox"]', 2, label);
    await expectCount(page, '#section-picker-modal .section-picker-note', 1, label);
    const pickerLabels = await page.locator('#section-picker-modal .section-picker-label').allTextContents();
    assert(pickerLabels.some((text) => text.includes('Choose a topic')), `${label}: share picker should include the visible Explore Tezos section`);
    assert(!pickerLabels.includes('⛓️'), `${label}: share picker should not show emoji-only section names`);
    assert(!pickerLabels.includes('🧩 Embed Builder'), `${label}: share picker should not include hidden utility sections`);
    await page.locator('#section-picker-modal .share-modal-close').click();
    await page.locator('#section-picker-modal').waitFor({ state: 'detached', timeout: 5000 });

    await context.close();
    assert(issues.length === 0, `${label}: browser issues:\n${issues.join('\n')}`);
    log(`ok - dashboard smoke (${label})`);
  }

  async function smokeHomeLayout(browser, baseUrl) {
    const issues = [];
    const storageKey = 'tezos-systems-home-layout-v1';
    const ids = ['live-head', 'live-pulse', 'explore', 'moments', 'handoff', 'credits'];
    const selectors = {
      'live-head': '#live-head',
      'live-pulse': '#pulse-ticker-strip',
      explore: '#chambers-section',
      moments: '#moments-section',
      handoff: '#recruit-section',
      credits: '#site-footer'
    };
    const initVisitor = () => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      if (!sessionStorage.getItem('__home-layout-smoke-seeded')) {
        localStorage.removeItem('tezos-systems-home-layout-v1');
        sessionStorage.setItem('__home-layout-smoke-seeded', '1');
      }
    };

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(initVisitor);
    const page = await context.newPage();
    attachIssueCollectors(page, 'home layout', issues);
    let response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `home layout: dashboard failed with HTTP ${response?.status()}`);
    await page.waitForFunction(() => Boolean(window.tezosSystemsHomeLayout), null, { timeout: 15000 });
    await page.locator('[data-home-hide="handoff"]').waitFor({ state: 'attached', timeout: 10000 });

    const defaultState = await page.evaluate((blockIds) => ({
      liveHeadPlacement: (() => {
        const content = document.querySelector('#live-head')?.getBoundingClientRect();
        const form = document.querySelector('#hero-search-form')?.getBoundingClientRect();
        const hide = document.querySelector('#live-head [data-home-hide="live-head"]')?.getBoundingClientRect();
        return {
          contained: Boolean(content && form && hide
            && form.left >= content.left && form.right <= content.right
            && hide.left >= content.left && hide.right <= content.right),
          fieldWidth: form?.width || 0,
          cardWidth: content?.width || 0
        };
      })(),
      count: document.querySelector('[data-home-layout-count]')?.textContent?.trim(),
      hidden: document.documentElement.getAttribute('data-home-hidden'),
      hideLabels: [...document.querySelectorAll('.home-block-hide-label')].map((label) => {
        const rect = label.getBoundingClientRect();
        const style = getComputedStyle(label);
        return { width: rect.width, height: rect.height, position: style.position, clipPath: style.clipPath };
      }),
      stored: localStorage.getItem('tezos-systems-home-layout-v1'),
      switches: blockIds.map((id) => document.querySelector(`[data-home-layout-toggle="${id}"]`)?.checked),
      visible: blockIds.map((id) => window.tezosSystemsHomeLayout.isHomeBlockVisible(id))
    }), ids);
    assert(defaultState.hidden === ''
      && defaultState.stored === null
      && defaultState.count === '6 shown'
      && defaultState.liveHeadPlacement.contained
      && defaultState.liveHeadPlacement.fieldWidth >= defaultState.liveHeadPlacement.cardWidth - 40
      && defaultState.hideLabels.length === 6
      && defaultState.hideLabels.every((label) => label.width <= 1 && label.height <= 1 && label.position === 'absolute' && label.clipPath !== 'none')
      && defaultState.switches.every(Boolean)
      && defaultState.visible.every(Boolean),
    `home layout: default state is not all-visible ${JSON.stringify(defaultState)}`);

    await page.locator('#settings-gear').focus();
    await page.keyboard.press('Enter');
    await page.locator('#settings-dropdown.open').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#customize-home-btn').focus();
    await page.keyboard.press('Enter');
    await page.locator('#home-layout-modal.active').waitFor({ state: 'visible', timeout: 5000 });
    const overlayState = await page.evaluate(() => ({
      bodyOverflow: document.body.style.overflow,
      mainInert: document.querySelector('main')?.hasAttribute('inert') || false,
      rowCount: document.querySelectorAll('.home-layout-options > .home-layout-option').length,
      sheet: (() => {
        const rect = document.querySelector('.home-layout-sheet')?.getBoundingClientRect();
        return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null;
      })()
    }));
    assert(overlayState.bodyOverflow === 'hidden'
      && overlayState.mainInert
      && overlayState.rowCount === 6
      && overlayState.sheet?.left >= 0
      && overlayState.sheet?.right <= 1440,
    `home layout: desktop dialog/overlay stack geometry failed ${JSON.stringify(overlayState)}`);

    for (const theme of ['matrix', 'clean', 'valley']) {
      const themeState = await page.evaluate((nextTheme) => {
        document.body.dataset.theme = nextTheme;
        document.documentElement.dataset.theme = nextTheme;
        const sheet = document.querySelector('.home-layout-sheet');
        const rect = sheet?.getBoundingClientRect();
        return {
          background: sheet ? getComputedStyle(sheet).backgroundColor : '',
          contained: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight)
        };
      }, theme);
      assert(themeState.contained && themeState.background !== 'rgba(0, 0, 0, 0)', `home layout: ${theme} dialog lost containment or surface color ${JSON.stringify(themeState)}`);
    }

    for (const id of ids) {
      const toggle = page.locator(`[data-home-layout-toggle="${id}"]`);
      await toggle.click();
      await page.waitForFunction((blockId) => document.documentElement.getAttribute('data-home-hidden')?.split(/\s+/).includes(blockId), id);
      assert(!(await toggle.isChecked()), `home layout: ${id} switch did not hide its block`);
      await toggle.click();
      await page.waitForFunction((blockId) => !document.documentElement.getAttribute('data-home-hidden')?.split(/\s+/).includes(blockId), id);
      assert(await toggle.isChecked(), `home layout: ${id} switch did not restore its block`);
    }

    const keyboardToggle = page.locator('[data-home-layout-toggle="live-head"]');
    await keyboardToggle.focus();
    await page.keyboard.press('Space');
    assert(!(await keyboardToggle.isChecked()), 'home layout: native switch was not keyboard operable');
    await page.keyboard.press('Space');
    assert(await keyboardToggle.isChecked(), 'home layout: native switch did not restore from keyboard');
    await page.keyboard.press('Escape');
    await page.locator('#home-layout-modal.active').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForFunction(() => document.activeElement?.id === 'settings-gear', null, { timeout: 3000 });

    await page.evaluate(() => { document.getElementById('moments-section').style.display = ''; });
    for (const id of ids) {
      await page.evaluate(() => window.tezosSystemsHomeLayout.showAllHomeBlocks('smoke-reset'));
      if (id === 'moments') await page.evaluate(() => { document.getElementById('moments-section').style.display = ''; });
      const hide = page.locator(`[data-home-hide="${id}"]`).first();
      await hide.scrollIntoViewIfNeeded();
      await hide.click();
      await page.waitForFunction((blockId) => document.documentElement.getAttribute('data-home-hidden')?.split(/\s+/).includes(blockId), id);
      const toast = page.locator('.home-layout-toast.is-visible');
      await toast.waitFor({ state: 'visible', timeout: 9000 });
      if (id === 'live-head') {
        assert(!(await toast.locator('button').evaluate((button) => document.activeElement === button)), 'home layout: pointer hide stole focus into Undo');
      }
      await toast.locator('button').click({ force: true });
      await page.waitForFunction((blockId) => !document.documentElement.getAttribute('data-home-hidden')?.split(/\s+/).includes(blockId), id);
      await toast.waitFor({ state: 'detached', timeout: 3000 });
    }

    const liveHide = page.locator('[data-home-hide="live-pulse"]');
    await liveHide.scrollIntoViewIfNeeded();
    await liveHide.focus();
    await page.keyboard.press('Enter');
    const keyboardToast = page.locator('.home-layout-toast.is-visible');
    await keyboardToast.waitFor({ state: 'visible', timeout: 9000 });
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Undo', null, { timeout: 3000 });
    await keyboardToast.locator('button').click();
    await keyboardToast.waitFor({ state: 'detached', timeout: 3000 });

    await page.locator('#settings-gear').click();
    await page.locator('#customize-home-btn').click();
    await page.locator('#home-layout-modal.active').waitFor({ state: 'visible', timeout: 5000 });
    for (const id of ids) {
      const toggle = page.locator(`[data-home-layout-toggle="${id}"]`);
      if (await toggle.isChecked()) await toggle.click();
    }
    const allHidden = await page.evaluate((blockSelectors) => ({
      hidden: document.documentElement.getAttribute('data-home-hidden')?.split(/\s+/).filter(Boolean),
      setup: getComputedStyle(document.getElementById('settings-gear')).display,
      myTezos: getComputedStyle(document.getElementById('my-tezos-btn')).display,
      footer: getComputedStyle(document.getElementById('site-footer')).display,
      source: Boolean(document.querySelector('#site-footer a[href*="github.com/Primate411/tezos.systems"]')),
      license: Boolean(document.querySelector('#site-footer a[rel="license"]')),
      reserved: Object.fromEntries(Object.entries(blockSelectors).map(([id, selector]) => [id, getComputedStyle(document.querySelector(selector)).display]))
    }), selectors);
    assert(allHidden.hidden.length === 6
      && allHidden.setup !== 'none'
      && allHidden.myTezos !== 'none'
      && allHidden.footer === 'none'
      && allHidden.source
      && allHidden.license
      && Object.values(allHidden.reserved).every((display) => display === 'none'),
    `home layout: hide-all lost recovery, managed credits, or reserved-space behavior ${JSON.stringify(allHidden)}`);
    await page.locator('#home-layout-show-all').click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-home-hidden') === '');
    await page.keyboard.press('Escape');

    await page.evaluate(() => window.tezosSystemsHomeLayout.setHomeBlockVisible('live-pulse', false, 'persistence-smoke'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.tezosSystemsHomeLayout));
    const persisted = await page.evaluate(() => ({
      hidden: document.documentElement.getAttribute('data-home-hidden'),
      display: getComputedStyle(document.getElementById('pulse-ticker-strip')).display,
      preference: JSON.parse(localStorage.getItem('tezos-systems-home-layout-v1'))
    }));
    assert(persisted.hidden.includes('live-pulse')
      && persisted.display === 'none'
      && persisted.preference.version === 1
      && persisted.preference.hidden.includes('live-pulse'),
    `home layout: reload persistence failed ${JSON.stringify(persisted)}`);

    const corruptValue = '{"version":1,"hidden":["unknown-block"]}';
    await page.evaluate(({ key, raw }) => {
      localStorage.setItem(key, raw);
      localStorage.setItem('home-layout-unrelated-smoke', 'keep-me');
    }, { key: storageKey, raw: corruptValue });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.tezosSystemsHomeLayout));
    const corruptFallback = await page.evaluate((key) => ({
      hidden: document.documentElement.getAttribute('data-home-hidden'),
      raw: localStorage.getItem(key),
      unrelated: localStorage.getItem('home-layout-unrelated-smoke')
    }), storageKey);
    assert(corruptFallback.hidden === ''
        && JSON.parse(corruptFallback.raw).hidden.length === 0
        && corruptFallback.unrelated === 'keep-me',
      `home layout: corrupt-state fallback deleted or honored invalid state ${JSON.stringify(corruptFallback)}`);

    await page.evaluate(() => window.tezosSystemsHomeLayout.showAllHomeBlocks('cross-tab-reset'));
    const secondPage = await context.newPage();
    attachIssueCollectors(secondPage, 'home layout second tab', issues);
    response = await secondPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `home layout second tab: dashboard failed with HTTP ${response?.status()}`);
    await secondPage.waitForFunction(() => Boolean(window.tezosSystemsHomeLayout));
    await page.evaluate(() => window.tezosSystemsHomeLayout.setHomeBlockVisible('explore', false, 'cross-tab-smoke'));
    await secondPage.waitForFunction(() => document.documentElement.getAttribute('data-home-hidden')?.split(/\s+/).includes('explore'));
    await secondPage.evaluate(() => window.tezosSystemsHomeLayout.setHomeBlockVisible('explore', true, 'cross-tab-smoke'));
    await page.waitForFunction(() => !document.documentElement.getAttribute('data-home-hidden')?.split(/\s+/).includes('explore'));
    await secondPage.close();

    await page.evaluate(() => window.tezosSystemsHomeLayout.setHomeBlockVisible('explore', false, 'deep-link-setup'));
    await page.evaluate(() => { location.hash = '#chambers'; });
    await page.waitForFunction(() => window.tezosSystemsHomeLayout.isHomeBlockVisible('explore'));
    await page.evaluate(() => window.tezosSystemsHomeLayout.setHomeBlockVisible('live-pulse', false, 'deep-link-setup'));
    await page.evaluate(() => { location.hash = '#hot-today'; });
    await page.waitForFunction(() => window.tezosSystemsHomeLayout.isHomeBlockVisible('live-pulse'));
    await page.evaluate(() => {
      history.replaceState(null, '', '/');
      window.tezosSystemsHomeLayout.setHomeBlockVisible('live-head', false, 'shortcut-setup');
    });
    await page.keyboard.press('/');
    await page.waitForFunction(() => window.tezosSystemsHomeLayout.isHomeBlockVisible('live-head') && document.activeElement?.id === 'hero-search-input');
    await page.locator('#hero-search-close').click();
    await page.waitForFunction(() => !document.body.classList.contains('hero-search-mode'));

    await page.evaluate(() => {
      window.__homeLayoutPulseContent = document.getElementById('pulse-ticker-viewport');
      window.tezosSystemsHomeLayout.setHomeBlockVisible('live-pulse', false, 'pulse-hidden-smoke');
      window.dispatchEvent(new CustomEvent('hot-signal', {
        detail: {
          id: 'home-layout-hidden-signal',
          category: 'network',
          title: 'Hidden pulse update',
          text: 'This signal must not reveal the hidden surface.',
          detail: 'Hidden Live Pulse smoke',
          createdAt: Date.now(),
          ttlMs: 60000,
          live: true
        }
      }));
    });
    await page.waitForTimeout(450);
    const hiddenPulse = await page.evaluate(() => ({
      display: getComputedStyle(document.getElementById('pulse-ticker-strip')).display,
      sameContent: window.__homeLayoutPulseContent === document.getElementById('pulse-ticker-viewport')
    }));
    assert(hiddenPulse.display === 'none' && hiddenPulse.sameContent, `home layout: hidden Live Pulse was revealed or replaced ${JSON.stringify(hiddenPulse)}`);
    await page.evaluate(() => window.tezosSystemsHomeLayout.setHomeBlockVisible('live-pulse', true, 'pulse-restore-smoke'));
    await page.waitForFunction(() => getComputedStyle(document.getElementById('pulse-ticker-strip')).display !== 'none');
    const restoredPulse = await page.evaluate(() => ({
      arriving: document.querySelectorAll('#pulse-ticker-strip .is-arriving').length,
      sameContent: window.__homeLayoutPulseContent === document.getElementById('pulse-ticker-viewport')
    }));
    assert(restoredPulse.sameContent && restoredPulse.arriving === 0, `home layout: Live Pulse restoration replayed or replaced reading state ${JSON.stringify(restoredPulse)}`);

    await page.evaluate((blockIds) => blockIds.forEach((id) => window.tezosSystemsHomeLayout.setHomeBlockVisible(id, false, 'tour-layout-setup')), ids);
    const tourPreference = await page.evaluate((key) => localStorage.getItem(key), storageKey);
    await page.evaluate(() => window.TezosSystemsTour.replay());
    await page.locator('#tour-overlay').waitFor({ state: 'visible', timeout: 6000 });
    const tourReveal = await page.evaluate((key) => ({
      preview: document.documentElement.getAttribute('data-home-layout-preview'),
      liveHeadDisplay: getComputedStyle(document.getElementById('live-head')).display,
      stored: localStorage.getItem(key)
    }), storageKey);
    assert(tourReveal.preview === 'all' && tourReveal.liveHeadDisplay !== 'none' && tourReveal.stored === tourPreference,
      `home layout: guided tour did not temporarily reveal without saving ${JSON.stringify(tourReveal)}`);
    await page.keyboard.press('Escape');
    await page.locator('#tour-overlay').waitFor({ state: 'detached', timeout: 5000 });
    const tourRestore = await page.evaluate((key) => ({
      preview: document.documentElement.hasAttribute('data-home-layout-preview'),
      hidden: document.documentElement.getAttribute('data-home-hidden')?.split(/\s+/).filter(Boolean).length,
      stored: localStorage.getItem(key)
    }), storageKey);
    assert(!tourRestore.preview && tourRestore.hidden === 6 && tourRestore.stored === tourPreference,
      `home layout: tour end changed the saved layout ${JSON.stringify(tourRestore)}`);
    await context.close();

    const firstPaintContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await installFeatureMocks(firstPaintContext);
    await firstPaintContext.addInitScript(() => {
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-home-layout-v1', JSON.stringify({ version: 1, hidden: ['live-pulse'] }));
    });
    let releaseApp;
    const appGate = new Promise((resolve) => { releaseApp = resolve; });
    await firstPaintContext.route('**/js/core/app.js*', async (route) => {
      await appGate;
      await route.continue();
    });
    const firstPaintPage = await firstPaintContext.newPage();
    attachIssueCollectors(firstPaintPage, 'home layout first paint', issues);
    const navigation = firstPaintPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await firstPaintPage.locator('#pulse-ticker-strip').waitFor({ state: 'attached', timeout: 10000 });
    const beforeApp = await firstPaintPage.evaluate(() => ({
      appReady: Boolean(window.tezosSystemsHomeLayout),
      display: getComputedStyle(document.getElementById('pulse-ticker-strip')).display,
      root: document.documentElement.getAttribute('data-home-hidden')
    }));
    assert(!beforeApp.appReady && beforeApp.display === 'none' && beforeApp.root === 'live-pulse',
      `home layout: first-paint preload did not hide before app initialization ${JSON.stringify(beforeApp)}`);
    releaseApp();
    response = await navigation;
    assert(response?.ok(), `home layout first paint: dashboard failed with HTTP ${response?.status()}`);
    await firstPaintContext.close();

    for (const { width, reducedMotion } of [
      { width: 320, reducedMotion: 'no-preference' },
      { width: 390, reducedMotion: 'reduce' }
    ]) {
      const mobileContext = await browser.newContext({
        viewport: { width, height: 760 },
        reducedMotion,
        serviceWorkers: 'block'
      });
      await installFeatureMocks(mobileContext);
      await mobileContext.addInitScript(initVisitor);
      const mobilePage = await mobileContext.newPage();
      attachIssueCollectors(mobilePage, `home layout ${width}px`, issues);
      response = await mobilePage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `home layout ${width}px: dashboard failed with HTTP ${response?.status()}`);
      await mobilePage.waitForFunction(() => Boolean(window.tezosSystemsHomeLayout));
      // Layout is exposed before optional module loading; Settings is wired later.
      await mobilePage.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
      await mobilePage.locator('#settings-gear').click();
      await mobilePage.locator('#customize-home-btn').click();
      await mobilePage.locator('#home-layout-modal.active').waitFor({ state: 'visible', timeout: 5000 });
      await mobilePage.locator('#home-layout-topics > summary').click();
      await mobilePage.locator('[data-chamber-topic-group="network"] > summary').click();
      await mobilePage.waitForFunction(() => Array.from(document.querySelector('.home-layout-sheet')?.getAnimations() || [])
        .every((animation) => animation.playState !== 'running'), null, { timeout: 5000 });
      const mobileGeometry = await mobilePage.evaluate(() => {
        const sheet = document.querySelector('.home-layout-sheet');
        const sheetRect = sheet?.getBoundingClientRect();
        const rows = [...document.querySelectorAll('.home-layout-options > .home-layout-option')].map((row) => row.getBoundingClientRect().height);
        const topicRows = [...document.querySelectorAll('.home-layout-topic-option')].map((row) => row.getBoundingClientRect().height);
        const topicGroups = [...document.querySelectorAll('.home-layout-topic-group > summary')].map((row) => row.getBoundingClientRect().height);
        const hideTargets = [...document.querySelectorAll('.home-block-hide')].map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        const categoryHideTargets = [...document.querySelectorAll('.chamber-category-hide')].map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        return {
          bottom: sheetRect?.bottom,
          left: sheetRect?.left,
          right: sheetRect?.right,
          top: sheetRect?.top,
          overflow: document.documentElement.scrollWidth - innerWidth,
          rows,
          topicRows,
          topicGroups,
          hideTargets,
          categoryHideTargets,
          switchTransition: getComputedStyle(document.querySelector('.home-layout-option i')).transitionDuration,
          viewport: { width: innerWidth, height: innerHeight }
        };
      });
      assert(mobileGeometry.left >= -1
        && mobileGeometry.right <= mobileGeometry.viewport.width + 1
        && mobileGeometry.top >= -1
        && mobileGeometry.bottom <= mobileGeometry.viewport.height + 1
        && mobileGeometry.overflow <= 1
        && mobileGeometry.rows.length === 6
        && mobileGeometry.rows.every((height) => height >= 44)
        && mobileGeometry.topicRows.length === 29
        && mobileGeometry.topicRows.filter((height) => height > 0).length === 4
        && mobileGeometry.topicRows.every((height) => height === 0 || height >= 44)
        && mobileGeometry.topicGroups.length === 7
        && mobileGeometry.topicGroups.every((height) => height >= 44)
        && mobileGeometry.hideTargets.every((target) => !target.width || (target.width >= 44 && target.height >= 44))
        && mobileGeometry.categoryHideTargets.every((target) => !target.width || (target.width >= 44 && target.height >= 44)),
      `home layout: ${width}px bottom sheet/touch containment failed ${JSON.stringify(mobileGeometry)}`);
      if (reducedMotion === 'reduce') {
        assert(mobileGeometry.switchTransition.split(',').every((duration) => duration.trim() === '0s'),
          `home layout: reduced motion retained switch transitions ${mobileGeometry.switchTransition}`);
      }
      await mobilePage.keyboard.press('Escape');
      await mobileContext.close();
    }

    assert(issues.length === 0, `home layout browser issues:\n${issues.join('\n')}`);
    log('ok - customizable Home layout state, recovery, persistence, sync, tour, Live Pulse, and responsive accessibility smoke');
  }

  async function smokeFirstVisitTour(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await context.addInitScript(() => {
      localStorage.removeItem('tezos-toured');
      localStorage.removeItem('tezos-welcomed');
      localStorage.removeItem('tezos-systems-theme');
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'first visit tour', issues);

    async function expectTourStep(currentPage, label, snippets) {
      try {
        await currentPage.waitForFunction((items) => {
          const text = document.querySelector('#tour-overlay')?.innerText || '';
          return items.every((item) => text.toLowerCase().includes(item.toLowerCase()));
        }, snippets, { timeout: 10000 });
      } catch (error) {
        const text = await currentPage.locator('#tour-overlay').innerText().catch(() => 'missing overlay');
        throw new Error(`first visit tour: ${label} did not render ${JSON.stringify(snippets)}; saw ${JSON.stringify(text)}\n${error.message}`);
      }
      const text = await currentPage.locator('#tour-overlay').innerText();
      for (const snippet of snippets) {
        assert(text.toLowerCase().includes(snippet.toLowerCase()), `first visit tour: ${label} missing "${snippet}" in ${text}`);
      }
    }

    async function advanceTour(currentPage) {
      const next = currentPage.locator('#tour-overlay .tour-next');
      await next.waitFor({ state: 'visible', timeout: 5000 });
      await next.click();
    }

    const tourSteps = [
      { selector: '#top-continuity-history', label: 'mainnet history step', snippets: ['Start with mainnet history', 'chain-age counter', 'Protocol Anthology'] },
      { selector: '#live-head-button', label: 'live head step', snippets: ['Read the latest blocks', 'Network Health'] },
      { selector: '#hero-search-form', label: 'command bar step', snippets: ['Find anything', 'Press /', 'Chamber'] },
      { selector: '#chambers-section .section-header', label: 'chambers step', snippets: ['Explore Tezos by question', 'People & Accounts'] },
      { selector: '#my-tezos-btn', label: 'my tezos step', snippets: ['Make it yours', 'Network Context'] },
      { selector: '#recruit-section .site-handoff-head', label: 'Handoff step', snippets: ['Follow the lifeline', 'complete map stays folded'] },
      { selector: '#features-gear', label: 'explore step', snippets: ['Explore without the wall of choices', 'Network Pulse', 'folded by category'] },
      { selector: '#settings-gear', label: 'settings step', snippets: ['Make the Home yours', 'Customize home', 'Themes'] }
    ];

    async function readTourGeometry(currentPage, selector) {
      return currentPage.evaluate((targetSelector) => {
        const target = document.querySelector(targetSelector);
        const tooltip = document.querySelector('.tour-tooltip');
        const targetRect = target?.getBoundingClientRect();
        const tooltipRect = tooltip?.getBoundingClientRect();
        const tooltipOpacity = tooltip ? Number(window.getComputedStyle(tooltip).opacity) : 0;
        const verticalOverlap = targetRect && tooltipRect
          ? Math.max(0, Math.min(targetRect.bottom, tooltipRect.bottom) - Math.max(targetRect.top, tooltipRect.top))
          : 0;
        const horizontalOverlap = targetRect && tooltipRect
          ? Math.max(0, Math.min(targetRect.right, tooltipRect.right) - Math.max(targetRect.left, tooltipRect.left))
          : 0;

        return {
          selector: targetSelector,
          progress: document.querySelector('.tour-progress')?.textContent || '',
          scrollY: window.scrollY,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          target: targetRect ? {
            left: targetRect.left,
            top: targetRect.top,
            right: targetRect.right,
            bottom: targetRect.bottom,
            width: targetRect.width,
            height: targetRect.height
          } : null,
          tooltip: tooltipRect ? {
            left: tooltipRect.left,
            top: tooltipRect.top,
            right: tooltipRect.right,
            bottom: tooltipRect.bottom,
            width: tooltipRect.width,
            height: tooltipRect.height
          } : null,
          tooltipOpacity,
          overlap: verticalOverlap > 1 && horizontalOverlap > 1
        };
      }, selector);
    }

    async function expectTourGeometry(currentPage, step, label) {
      try {
        await currentPage.waitForFunction((targetSelector) => {
          const target = document.querySelector(targetSelector);
          const tooltip = document.querySelector('.tour-tooltip');
          if (!target || !tooltip) return false;

          const targetRect = target.getBoundingClientRect();
          const tooltipRect = tooltip.getBoundingClientRect();
          const tooltipStyle = window.getComputedStyle(tooltip);
          const targetVisible = targetRect.bottom > 0
            && targetRect.top < window.innerHeight
            && targetRect.right > 0
            && targetRect.left < window.innerWidth;
          const targetSizedForTour = targetRect.height <= window.innerHeight * 0.72;
          const tooltipVisible = Number(tooltipStyle.opacity) > 0.9 && tooltipRect.width > 0 && tooltipRect.height > 0;
          const tooltipOnscreen = tooltipRect.left >= 0
            && tooltipRect.top >= 0
            && tooltipRect.right <= window.innerWidth
            && tooltipRect.bottom <= window.innerHeight;
          const verticalOverlap = Math.max(0, Math.min(targetRect.bottom, tooltipRect.bottom) - Math.max(targetRect.top, tooltipRect.top));
          const horizontalOverlap = Math.max(0, Math.min(targetRect.right, tooltipRect.right) - Math.max(targetRect.left, tooltipRect.left));
          const hasCollision = verticalOverlap > 1 && horizontalOverlap > 1;

          return targetVisible && targetSizedForTour && tooltipVisible && tooltipOnscreen && !hasCollision;
        }, step.selector, { timeout: 10000 });
      } catch (error) {
        const geometry = await readTourGeometry(currentPage, step.selector);
        throw new Error(`first visit tour: ${label} did not settle: ${JSON.stringify(geometry)}\n${error.message}`);
      }

      const geometry = await readTourGeometry(currentPage, step.selector);
      assert(geometry.target, `first visit tour: ${label} target missing for ${step.selector}`);
      assert(geometry.tooltip, `first visit tour: ${label} tooltip missing`);
      assert(geometry.target.height <= geometry.viewport.height * 0.72, `first visit tour: ${label} target is too tall for a useful spotlight: ${JSON.stringify(geometry)}`);
      assert(geometry.target.bottom > 0 && geometry.target.top < geometry.viewport.height, `first visit tour: ${label} target off-screen: ${JSON.stringify(geometry)}`);
      assert(geometry.tooltip.left >= 0 && geometry.tooltip.top >= 0 && geometry.tooltip.right <= geometry.viewport.width && geometry.tooltip.bottom <= geometry.viewport.height, `first visit tour: ${label} tooltip off-screen: ${JSON.stringify(geometry)}`);
      assert(!geometry.overlap, `first visit tour: ${label} tooltip overlaps target: ${JSON.stringify(geometry)}`);
    }

    let response = await page.goto(`${baseUrl}/#lb`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `first visit tour deep link: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#liquidity-baking-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    await waitForIntentionalRealTime(page, 'first-visit-deep-link-deferral');
    await assertLocatorCount(page.locator('.tour-nudge'), 0, 'deep-link tour nudge');
    await assertLocatorCount(page.locator('#tour-overlay'), 0, 'deep-link tour overlay');
    const firstVisitState = await page.evaluate(() => ({
      theme: localStorage.getItem('tezos-systems-theme'),
      toured: localStorage.getItem('tezos-toured'),
      welcomed: localStorage.getItem('tezos-welcomed')
    }));
    assert(firstVisitState.theme === null, 'deep link should not save a theme or consume first-visit onboarding');
    assert(firstVisitState.toured === null, 'deep link should not mark the tour complete');
    assert(firstVisitState.welcomed === null, 'deep link should not mark welcome complete');

    response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `first visit tour: dashboard failed with HTTP ${response?.status()}`);
    assert(!page.url().includes('/landing.html'), `first visit tour: root should stay on dashboard, saw ${page.url()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#tour-overlay').waitFor({ state: 'detached', timeout: 2000 }).catch(() => {
      throw new Error('first visit tour: tour overlay should not block first paint before Start');
    });
    await page.locator('.tour-nudge').waitFor({ state: 'visible', timeout: 12000 });
    await assertLocatorCount(page.locator('.visit-streak-toast.visible'), 0, 'first visit welcome and help nudge overlap');
    const nudgeText = await page.locator('.tour-nudge').innerText();
    assert(/Quick tour/i.test(nudgeText) && !/Show/i.test(nudgeText), `first visit tour: passive help nudge copy mismatch: ${nudgeText}`);
    const desktopNudgeGeometry = await page.locator('.tour-nudge').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const host = node.parentElement;
      const hostRect = host?.getBoundingClientRect();
      const cardRect = document.querySelector('#live-head')?.getBoundingClientRect();
      return {
        parentClass: host?.className || '',
        width: rect.width,
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        hostTop: hostRect?.top || 0,
        hostBottom: hostRect?.bottom || 0,
        cardHeight: cardRect?.height || 0
      };
    });
    assert(/hero-search-form/.test(desktopNudgeGeometry.parentClass)
      && desktopNudgeGeometry.width <= 160
      && desktopNudgeGeometry.height <= 32
      && desktopNudgeGeometry.top >= desktopNudgeGeometry.hostTop - 1
      && desktopNudgeGeometry.bottom <= desktopNudgeGeometry.hostBottom + 1
      && desktopNudgeGeometry.cardHeight <= 370,
    `first visit tour: desktop nudge is not compact inside the search floor: ${JSON.stringify(desktopNudgeGeometry)}`);
    await waitForIntentionalRealTime(page, 'first-visit-nudge-refresh');
    assert(await page.locator('.tour-nudge').isVisible(), 'first visit tour: search chip refresh removed the desktop nudge');
    await assertLocatorCount(page.locator('.tour-nudge .tour-start'), 1, 'first visit tour start');
    await page.locator('#features-gear').click();
    await page.locator('#features-dropdown.open').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.tour-nudge').waitFor({ state: 'detached', timeout: 3000 });
    await page.locator('#features-gear').click();
    await page.locator('.tour-nudge').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.tour-nudge .tour-start').click();
    await page.locator('#tour-overlay').waitFor({ state: 'visible', timeout: 6000 });
    assert(
      await page.evaluate(() => !document.body.classList.contains('hero-search-mode') && document.getElementById('hero-search-overlay')?.hidden !== false),
      'first visit tour: starting the search-floor nudge opened the Index Chamber over the tour'
    );
    for (let index = 0; index < tourSteps.length; index += 1) {
      const step = tourSteps[index];
      await expectTourStep(page, step.label, step.snippets);
      await expectTourGeometry(page, step, `desktop ${step.label}`);
      if (index < tourSteps.length - 1) await advanceTour(page);
    }
    await assertLocatorCount(page.locator('#tour-overlay .tour-skip'), 1, 'first visit tour skip');
    await page.locator('#tour-overlay .tour-skip').click();
    await page.locator('#tour-overlay').waitFor({ state: 'detached', timeout: 5000 });
    await openDropdown(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#visit-streak-info-btn').click();
    await page.locator('#visit-streak-modal.active').waitFor({ state: 'visible', timeout: 5000 });
    const visitStreakHelp = await page.locator('#visit-streak-modal').innerText();
    assert(/consecutive local calendar days/i.test(visitStreakHelp), `first visit tour: visit streak meaning missing: ${visitStreakHelp}`);
    assert(/Hidden signals:[\s\S]*meaningful number patterns surface on their own/i.test(visitStreakHelp), `first visit tour: hidden signal explanation missing: ${visitStreakHelp}`);
    assert(!/7, 14, 30, 60, 100, and 365 days/i.test(visitStreakHelp), `first visit tour: exact hidden signal catalog must stay undisclosed: ${visitStreakHelp}`);
    assert(/no currency or points/i.test(visitStreakHelp) && /does not affect Tezos Maxis ranks or Passport progress/i.test(visitStreakHelp), `first visit tour: visit streak competitive boundary missing: ${visitStreakHelp}`);
    await page.locator('#visit-streak-modal-close').click();
    await page.locator('#visit-streak-modal.active').waitFor({ state: 'detached', timeout: 5000 });
    await openDropdown(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#shortcuts-btn').click();
    await page.locator('#keyboard-help.visible').waitFor({ state: 'visible', timeout: 5000 });
    const keyboardHelpText = await page.locator('#keyboard-help').innerText();
    assert(/Focus command bar/i.test(keyboardHelpText) && /Open selected command result/i.test(keyboardHelpText) && /Open Cycle History Chamber/i.test(keyboardHelpText), `keyboard help overlay copy mismatch: ${keyboardHelpText}`);
    await page.keyboard.press('Escape');
    await page.locator('#keyboard-help').waitFor({ state: 'detached', timeout: 5000 });

    await context.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 360, height: 720 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(mobileContext);
    await mobileContext.addInitScript(() => {
      localStorage.removeItem('tezos-toured');
      localStorage.removeItem('tezos-welcomed');
      localStorage.removeItem('tezos-systems-theme');
    });
    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'first visit tour mobile', issues);
    response = await mobilePage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `first visit tour mobile: dashboard failed with HTTP ${response?.status()}`);
    await mobilePage.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await mobilePage.locator('.tour-nudge').waitFor({ state: 'visible', timeout: 12000 });
    await assertLocatorCount(mobilePage.locator('.visit-streak-toast.visible'), 0, 'mobile first visit welcome and help nudge overlap');
    const mobileNudgeGeometry = await mobilePage.locator('.tour-nudge').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const railRect = node.parentElement?.getBoundingClientRect();
      return {
        parentClass: node.parentElement?.className || '',
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        railTop: railRect?.top || 0,
        railBottom: railRect?.bottom || 0,
        railLeft: railRect?.left || 0,
        railRight: railRect?.right || 0,
        viewportWidth: window.innerWidth
      };
    });
    assert(/hero-search-form/.test(mobileNudgeGeometry.parentClass)
      && mobileNudgeGeometry.width <= 160
      && mobileNudgeGeometry.height <= 44.5
      && mobileNudgeGeometry.top >= mobileNudgeGeometry.railTop - 1
      && mobileNudgeGeometry.bottom <= mobileNudgeGeometry.railBottom + 1
      && mobileNudgeGeometry.left >= mobileNudgeGeometry.railLeft
      && mobileNudgeGeometry.right <= mobileNudgeGeometry.railRight + 1
      && mobileNudgeGeometry.right <= mobileNudgeGeometry.viewportWidth,
    `first visit tour: mobile nudge is not compact within the Live Head search floor: ${JSON.stringify(mobileNudgeGeometry)}`);
    await mobilePage.locator('#hero-search-input').focus();
    await mobilePage.waitForFunction(() => document.body.classList.contains('hero-search-mode'), null, { timeout: 5000 });
    await mobilePage.locator('.tour-nudge').waitFor({ state: 'detached', timeout: 3000 });
    await mobilePage.locator('#hero-search-close').click();
    await mobilePage.waitForFunction(() => !document.body.classList.contains('hero-search-mode'), null, { timeout: 5000 });
    await mobilePage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await mobilePage.locator('.tour-nudge').waitFor({ state: 'visible', timeout: 5000 });
    await mobilePage.locator('#features-gear').click();
    await mobilePage.locator('#features-dropdown.open').waitFor({ state: 'visible', timeout: 5000 });
    await mobilePage.locator('.tour-nudge').waitFor({ state: 'detached', timeout: 3000 });
    await mobilePage.locator('#features-gear').click();
    await mobilePage.locator('.tour-nudge').waitFor({ state: 'visible', timeout: 5000 });
    await mobilePage.locator('.tour-nudge .tour-start').click();
    for (let index = 0; index < tourSteps.length; index += 1) {
      const step = tourSteps[index];
      await expectTourStep(mobilePage, `mobile ${step.label}`, step.snippets);
      await expectTourGeometry(mobilePage, step, `mobile ${step.label}`);
      if (index < tourSteps.length - 1) await advanceTour(mobilePage);
    }
    await mobileContext.close();

    assert(issues.length === 0, `first visit tour browser issues:\n${issues.join('\n')}`);
    log('ok - first visit tour smoke');
  }

  async function smokeVisitSignalBloom(browser, baseUrl) {
    const issues = [];
    const seedSignalVisit = ({ previousCount, theme }) => {
      localStorage.setItem('tezos-systems-theme', theme);
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      if (sessionStorage.getItem('tezos-signal-bloom-smoke-seeded')) return;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      localStorage.setItem('tezos_streak_count', String(previousCount));
      localStorage.setItem('tezos_streak_last_visit', date);
      sessionStorage.setItem('tezos-signal-bloom-smoke-seeded', '1');
    };

    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'no-preference',
      serviceWorkers: 'block'
    });
    await installFeatureMocks(desktopContext);
    await desktopContext.addInitScript(seedSignalVisit, { previousCount: 110, theme: 'matrix' });
    const desktopPage = await desktopContext.newPage();
    attachIssueCollectors(desktopPage, 'visit signal bloom desktop', issues);
    let response = await desktopPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `visit signal bloom desktop: dashboard failed with HTTP ${response?.status()}`);
    const desktopBloom = desktopPage.locator('.signal-bloom.visible[data-streak-count="111"]');
    await desktopBloom.waitFor({ state: 'visible', timeout: 15000 });
    await waitForIntentionalRealTime(desktopPage, 'signal-bloom-entrance');
    const desktopState = await desktopBloom.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const digits = [...node.querySelectorAll('.signal-bloom-number > *')];
      const announcement = node.querySelector('.signal-bloom-announcement');
      const share = node.querySelector('.signal-bloom-share');
      const sigil = node.querySelector('.signal-bloom-sigil');
      const message = node.querySelector('.signal-bloom-message');
      return {
        announcement: announcement?.textContent || '',
        badgePosition: getComputedStyle(node).position,
        bottom: rect.bottom,
        color: getComputedStyle(node).color,
        digitAnimationNames: digits.map((digit) => getComputedStyle(digit).animationName),
        digitOpacity: digits.map((digit) => Number(getComputedStyle(digit).opacity)),
        height: rect.height,
        kind: node.getAttribute('data-signal-kind') || '',
        left: rect.left,
        message: message?.textContent || '',
        number: digits.map((digit) => digit.textContent || '').join(''),
        overflow: document.documentElement.scrollWidth - innerWidth,
        right: rect.right,
        shareLabel: share?.getAttribute('aria-label') || '',
        shareText: share?.textContent || '',
        sigilOpacity: Number(getComputedStyle(sigil).opacity),
        top: rect.top,
        viewport: { width: innerWidth, height: innerHeight },
        width: rect.width
      };
    });
    assert(desktopState.kind === 'repeating'
      && desktopState.number === '111'
      && desktopState.message === 'The signal repeats.'
      && /Repeating signal[\s\S]*Day 111[\s\S]*The signal repeats/i.test(desktopState.announcement)
      && !/browser-local|stored locally|Settings → Visit streak/i.test(desktopState.announcement)
      && desktopState.shareText === 'Share the signal'
      && /Share the Day 111 signal/i.test(desktopState.shareLabel)
      && desktopState.badgePosition === 'fixed'
      && desktopState.width >= 330
      && desktopState.width <= 420
      && desktopState.height >= 110
      && desktopState.height <= 200
      && desktopState.left >= 0
      && desktopState.right <= desktopState.viewport.width
      && desktopState.top >= 0
      && desktopState.bottom <= desktopState.viewport.height
      && desktopState.overflow <= 1
      && desktopState.digitOpacity.every((opacity) => opacity > 0.98)
      && desktopState.digitAnimationNames.every((name) => name.includes('signal-bloom-digit-enter'))
      && desktopState.sigilOpacity > 0.98,
    `visit signal bloom desktop: reveal or geometry mismatch ${JSON.stringify(desktopState)}`);

    response = await desktopPage.reload({ waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `visit signal bloom reload: dashboard failed with HTTP ${response?.status()}`);
    await desktopPage.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await waitForIntentionalRealTime(desktopPage, 'signal-bloom-no-replay');
    await assertLocatorCount(desktopPage.locator('.signal-bloom'), 0, 'visit signal bloom same-day reload');
    await desktopContext.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 360, height: 720 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block'
    });
    await installFeatureMocks(mobileContext);
    await mobileContext.addInitScript(seedSignalVisit, { previousCount: 21, theme: 'clean' });
    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'visit signal bloom mobile', issues);
    response = await mobilePage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `visit signal bloom mobile: dashboard failed with HTTP ${response?.status()}`);
    const mobileBloom = mobilePage.locator('.signal-bloom.visible[data-streak-count="22"]');
    await mobileBloom.waitFor({ state: 'visible', timeout: 15000 });
    const mobileState = await mobileBloom.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const digits = [...node.querySelectorAll('.signal-bloom-digit')];
      const share = node.querySelector('.signal-bloom-share');
      const shareRect = share?.getBoundingClientRect();
      const sigil = node.querySelector('.signal-bloom-sigil');
      const message = node.querySelector('.signal-bloom-message');
      return {
        animationName: getComputedStyle(node).animationName,
        bottom: rect.bottom,
        digitAnimationNames: digits.map((digit) => getComputedStyle(digit).animationName),
        digitOpacity: digits.map((digit) => Number(getComputedStyle(digit).opacity)),
        digitTransforms: digits.map((digit) => getComputedStyle(digit).transform),
        height: rect.height,
        left: rect.left,
        messageAnimationName: getComputedStyle(message).animationName,
        messageOpacity: Number(getComputedStyle(message).opacity),
        overflow: document.documentElement.scrollWidth - innerWidth,
        right: rect.right,
        shareHeight: shareRect?.height || 0,
        shareOpacity: Number(getComputedStyle(share).opacity),
        sigilAnimationName: getComputedStyle(sigil).animationName,
        sigilOpacity: Number(getComputedStyle(sigil).opacity),
        top: rect.top,
        viewport: { width: innerWidth, height: innerHeight },
        width: rect.width
      };
    });
    assert(mobileState.animationName === 'none'
      && mobileState.digitAnimationNames.every((name) => name === 'none')
      && mobileState.digitOpacity.every((opacity) => opacity === 1)
      && mobileState.digitTransforms.every((transform) => transform === 'none')
      && mobileState.messageAnimationName === 'none'
      && mobileState.messageOpacity === 1
      && mobileState.shareOpacity === 1
      && mobileState.sigilAnimationName === 'none'
      && mobileState.sigilOpacity === 1
      && mobileState.shareHeight >= 44
      && mobileState.width <= mobileState.viewport.width - 16
      && mobileState.height >= 105
      && mobileState.height <= 210
      && mobileState.left >= 7
      && mobileState.right <= mobileState.viewport.width - 7
      && mobileState.top >= 0
      && mobileState.bottom <= mobileState.viewport.height
      && mobileState.overflow <= 1,
    `visit signal bloom mobile reduced-motion or geometry mismatch ${JSON.stringify(mobileState)}`);
    await mobileContext.close();

    assert(issues.length === 0, `visit signal bloom browser issues:\n${issues.join('\n')}`);
    log('ok - visit Signal Bloom desktop, mobile, reduced-motion, and same-day replay smoke');
  }

  async function smokeUxChanges(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context, { ledgerFlowMocks: true });
    await context.grantPermissions(['clipboard-write'], { origin: baseUrl });
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-comparison-visible', 'false');
      localStorage.setItem('tezos-systems-pi-visible', 'false');
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'ux changes', issues);

    let response = await page.goto(`${baseUrl}/?theme=clean#compare`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `ux changes: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#comparison-section.visible').waitFor({ state: 'visible', timeout: 10000 });
    await expectCount(page, '#comparison-section .section-copy-link[data-copy-hash="#compare"]', 1, 'ux compare copy link');

    await page.evaluate(() => { window.location.hash = 'protocol-history'; });
    await page.locator('#protocol-history-chamber-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#protocol-history-chamber-modal .protocol-anthology-tools > summary').click();
    await page.locator('#upgrade-effect-toggle').waitFor({ state: 'visible', timeout: 10000 });
    const upgradeCollapsed = await page.evaluate(() => {
      const toggle = document.querySelector('#upgrade-effect-toggle');
      const panel = document.querySelector('#upgrade-effect-panel');
      return {
        controls: toggle?.getAttribute('aria-controls') || '',
        expanded: toggle?.getAttribute('aria-expanded') || '',
        panelRole: panel?.getAttribute('role') || '',
        panelLabelledBy: panel?.getAttribute('aria-labelledby') || '',
        panelAriaHidden: panel?.getAttribute('aria-hidden') || '',
        panelInert: Boolean(panel?.inert),
        title: document.querySelector('#upgrade-effect-title')?.textContent?.trim() || ''
      };
    });
    assert(
      upgradeCollapsed.controls === 'upgrade-effect-panel'
        && upgradeCollapsed.expanded === 'false'
        && upgradeCollapsed.panelRole === 'region'
        && upgradeCollapsed.panelLabelledBy === 'upgrade-effect-title'
        && upgradeCollapsed.panelAriaHidden === 'true'
        && upgradeCollapsed.panelInert
        && upgradeCollapsed.title === 'Protocol upgrade impact',
      `ux changes: Upgrade Effect collapsed semantics are incomplete ${JSON.stringify(upgradeCollapsed)}`
    );
    await page.locator('#upgrade-effect-toggle').click();
    try {
      await page.waitForFunction(() => (
        document.querySelector('#upgrade-effect-toggle')?.getAttribute('aria-expanded') === 'true'
          && document.querySelector('#upgrade-effect-panel')?.getAttribute('aria-hidden') === 'false'
          && document.querySelector('#upgrade-effect-canvas')?.getAttribute('role') === 'img'
      ), null, { timeout: 10000 });
    } catch (error) {
      const state = await page.evaluate(() => ({
        expanded: document.querySelector('#upgrade-effect-toggle')?.getAttribute('aria-expanded') || '',
        panelHidden: document.querySelector('#upgrade-effect-panel')?.getAttribute('aria-hidden') || '',
        panelClass: document.querySelector('#upgrade-effect-panel')?.className || '',
        canvasCount: document.querySelectorAll('#upgrade-effect-canvas').length,
        canvasRole: document.querySelector('#upgrade-effect-canvas')?.getAttribute('role') || ''
      }));
      throw new Error(`ux changes: Upgrade Effect did not expand ${JSON.stringify(state)}\n${error.message}`);
    }
    const upgradeExpanded = await page.evaluate(() => {
      const panel = document.querySelector('#upgrade-effect-panel');
      const canvas = document.querySelector('#upgrade-effect-canvas');
      const pills = Array.from(document.querySelectorAll('.upgrade-effect-pill'));
      return {
        panelInert: Boolean(panel?.inert),
        pills: pills.map((pill) => ({
          id: pill.id || '',
          pressed: pill.getAttribute('aria-pressed') || '',
          controls: pill.getAttribute('aria-controls') || ''
        })),
        groupRole: document.querySelector('.upgrade-effect-pills')?.getAttribute('role') || '',
        groupLabel: document.querySelector('.upgrade-effect-pills')?.getAttribute('aria-label') || '',
        canvasRole: canvas?.getAttribute('role') || '',
        canvasLabel: canvas?.getAttribute('aria-label') || '',
        canvasDescribedBy: canvas?.getAttribute('aria-describedby') || '',
        fallback: canvas?.textContent || '',
        summary: document.querySelector('#upgrade-effect-chart-summary')?.textContent || ''
      };
    });
    assert(
      !upgradeExpanded.panelInert
        && upgradeExpanded.pills.length === 6
        && upgradeExpanded.pills.filter((pill) => pill.pressed === 'true').length === 1
        && upgradeExpanded.pills.every((pill) => pill.id.startsWith('upgrade-effect-metric-') && pill.controls === 'upgrade-effect-chart')
        && upgradeExpanded.groupRole === 'group'
        && upgradeExpanded.groupLabel === 'Protocol impact metric'
        && upgradeExpanded.canvasRole === 'img'
        && /Block Time by Tezos protocol activation/.test(upgradeExpanded.canvasLabel)
        && upgradeExpanded.canvasDescribedBy === 'upgrade-effect-chart-summary'
        && /Athens 60s/.test(upgradeExpanded.fallback)
        && /Ushuaia 6s/.test(upgradeExpanded.summary),
      `ux changes: Upgrade Effect expanded controls or chart alternative are incomplete ${JSON.stringify(upgradeExpanded)}`
    );

    await page.evaluate(() => {
      window.__upgradeEffectRefreshIdentity = {
        panel: document.querySelector('#upgrade-effect-panel'),
        toggle: document.querySelector('#upgrade-effect-toggle'),
        bakers: document.querySelector('#upgrade-effect-metric-bakers')
      };
      document.querySelector('#data-status-retry')?.click();
    });
    await page.waitForTimeout(750);
    const upgradeRefreshState = await page.evaluate(() => {
      const before = window.__upgradeEffectRefreshIdentity || {};
      const panel = document.querySelector('#upgrade-effect-panel');
      const toggle = document.querySelector('#upgrade-effect-toggle');
      const bakers = document.querySelector('#upgrade-effect-metric-bakers');
      return {
        samePanel: before.panel === panel && before.panel?.isConnected,
        sameToggle: before.toggle === toggle && before.toggle?.isConnected,
        sameBakers: before.bakers === bakers && before.bakers?.isConnected,
        expanded: toggle?.getAttribute('aria-expanded') || '',
        panelHidden: panel?.getAttribute('aria-hidden') || '',
        signature: document.querySelector('#upgrade-timeline')?.dataset.protocolTimelineSignature || ''
      };
    });
    assert(
      upgradeRefreshState.samePanel
        && upgradeRefreshState.sameToggle
        && upgradeRefreshState.sameBakers
        && upgradeRefreshState.expanded === 'true'
        && upgradeRefreshState.panelHidden === 'false'
        && upgradeRefreshState.signature,
      `ux changes: an identical background protocol refresh detached or collapsed Upgrade Effect ${JSON.stringify(upgradeRefreshState)}`
    );

    await page.locator('#upgrade-effect-metric-bakers').click();
    await page.waitForFunction(() => (
      document.querySelector('#upgrade-effect-metric-bakers')?.getAttribute('aria-pressed') === 'true'
        && document.querySelectorAll('.upgrade-effect-pill[aria-pressed="true"]').length === 1
        && /Active Bakers across/.test(document.querySelector('#upgrade-effect-chart-summary')?.textContent || '')
    ));
    await page.evaluate(() => {
      document.querySelector('#upgrade-effect-metric-bakers')?.focus({ preventScroll: true });
      document.querySelector('#data-status-retry')?.click();
    });
    await page.waitForTimeout(750);
    const selectedMetricRefreshState = await page.evaluate(() => {
      const before = window.__upgradeEffectRefreshIdentity || {};
      const bakers = document.querySelector('#upgrade-effect-metric-bakers');
      return {
        sameBakers: before.bakers === bakers && before.bakers?.isConnected,
        focused: document.activeElement === bakers,
        pressed: bakers?.getAttribute('aria-pressed') || '',
        expanded: document.querySelector('#upgrade-effect-toggle')?.getAttribute('aria-expanded') || '',
        summary: document.querySelector('#upgrade-effect-chart-summary')?.textContent || ''
      };
    });
    assert(
      selectedMetricRefreshState.sameBakers
        && selectedMetricRefreshState.focused
        && selectedMetricRefreshState.pressed === 'true'
        && selectedMetricRefreshState.expanded === 'true'
        && /Active Bakers across/.test(selectedMetricRefreshState.summary),
      `ux changes: background protocol refresh reset selected metric or focus ${JSON.stringify(selectedMetricRefreshState)}`
    );
    await page.locator('#protocol-history-chamber-modal .chamber-close').click();
    await page.locator('#protocol-history-chamber-modal').waitFor({ state: 'detached', timeout: 5000 });
    await page.evaluate(() => { window.location.hash = 'compare'; });
    await page.locator('#comparison-section.visible').waitFor({ state: 'visible', timeout: 5000 });

    const cleanContrast = await page.evaluate(() => {
      const uptimeNode = document.querySelector('.uptime-metric-value, .top-continuity-runtime, #hero-chain-uptime-counter');
      const comparisonNode = document.querySelector('.comparison-col-ethereum .comparison-chain-value');
      const uptime = uptimeNode ? getComputedStyle(uptimeNode).color : '';
      const comparison = comparisonNode ? getComputedStyle(comparisonNode).color : '';
      const shareContent = document.querySelector('.share-modal-content');
      return {
        uptime,
        comparison,
        hasShareContent: Boolean(shareContent)
      };
    });
    assert(cleanContrast.uptime, 'ux changes: clean uptime/continuity metric missing');
    assert(cleanContrast.comparison, 'ux changes: clean comparison value missing');
    assert(!/255,\s*255,\s*255/.test(cleanContrast.uptime), `ux changes: clean uptime metric still white (${cleanContrast.uptime})`);
    assert(!/255,\s*255,\s*255/.test(cleanContrast.comparison), `ux changes: clean comparison value still white (${cleanContrast.comparison})`);

    await openDropdown(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#share-btn').click();
    await page.locator('#section-picker-modal').waitFor({ state: 'visible', timeout: 5000 });
    const pickerColors = await page.evaluate(() => {
      const label = document.querySelector('#section-picker-modal .section-picker-label');
      const content = document.querySelector('#section-picker-modal .share-modal-content');
      return {
        label: getComputedStyle(label).color,
        bg: getComputedStyle(content).backgroundColor
      };
    });
    assert(!/255,\s*255,\s*255/.test(pickerColors.label), `ux changes: clean share picker label still white (${pickerColors.label})`);
    assert(/255,\s*255,\s*255/.test(pickerColors.bg), `ux changes: clean share picker background not white (${pickerColors.bg})`);
    await page.locator('#section-picker-modal .share-modal-close').click();

    const cleanChambers = [
      { hash: 'pulse', content: '#network-pulse-modal.active .network-pulse-content', title: '.network-pulse-header .chamber-title' },
      { hash: 'health', content: '#network-health-modal.active .health-content', title: '.health-header .chamber-title' },
      { hash: 'domains', content: '#tezos-domains-modal.active .tezos-domains-content', title: '.tezos-domains-header .chamber-title' },
      { hash: `ledger-flow=${SAMPLE_ADDRESS}`, content: '#ledger-flow-modal.active .ledger-flow-content', title: '.ledger-flow-header .chamber-title' }
    ];
    for (const chamber of cleanChambers) {
      await page.goto(`${baseUrl}/?theme=clean#${chamber.hash}`, { waitUntil: 'domcontentloaded' });
      await page.locator(chamber.content).waitFor({ state: 'visible', timeout: 20000 });
      try {
        await page.locator(`${chamber.content} ${chamber.title}`).first().waitFor({ state: 'visible', timeout: 10000 });
      } catch (error) {
        const readiness = await page.evaluate(({ content, title }) => {
          const panel = document.querySelector(content);
          return {
            url: window.location.href,
            readyState: document.readyState,
            titleCount: panel?.querySelectorAll(title).length || 0,
            bodyText: panel?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) || '',
            overlayClass: panel?.closest('.chamber-overlay')?.className || '',
            bodyClass: panel?.querySelector('.chamber-body')?.className || '',
            loading: Boolean(panel?.querySelector('.chamber-loading')),
            error: panel?.querySelector('.chamber-error')?.textContent?.replace(/\s+/g, ' ').trim() || '',
            tzktQueueLength: window.__tzktThrottle?.queueLength ?? null,
            tzktNextDispatchInMs: window.__tzktThrottle?.nextDispatchInMs ?? null,
            resources: performance.getEntriesByType('resource').slice(-12).map((entry) => ({
              name: entry.name,
              duration: Math.round(entry.duration),
              size: entry.transferSize
            }))
          };
        }, chamber);
        throw new Error(`ux changes: Clean ${chamber.hash} title did not become ready ${JSON.stringify(readiness)}\n${error.message}`);
      }
      await page.waitForFunction((selector) => Boolean(getComputedStyle(document.querySelector(selector)).getPropertyValue('--chamber-surface-bg').trim()), chamber.content, { timeout: 5000 });
      const contrast = await page.evaluate(({ content, title }) => {
        const parse = (value) => {
          const normalized = String(value || '').trim();
          if (/^#[0-9a-f]{6}$/i.test(normalized)) {
            return [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
          }
          const parts = normalized.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
          return parts.length === 3 ? parts : null;
        };
        const luminance = (rgb) => {
          const channels = rgb.map((part) => {
            const value = part / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const panel = document.querySelector(content);
        const heading = panel?.querySelector(title);
        const foreground = parse(heading ? getComputedStyle(heading).color : '');
        const backgroundToken = panel ? getComputedStyle(panel).getPropertyValue('--chamber-surface-bg').trim() : '';
        const background = parse(backgroundToken);
        if (!foreground || !background) return { ratio: 0, foreground, backgroundToken };
        const a = luminance(foreground);
        const b = luminance(background);
        return {
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          foreground,
          backgroundToken
        };
      }, chamber);
      assert(contrast.ratio >= 4.5, `ux changes: Clean ${chamber.hash} title contrast must meet AA: ${JSON.stringify(contrast)}`);
    }

    await page.goto(`${baseUrl}/?hen=1&theme=clean`, { waitUntil: 'domcontentloaded' });
    await page.locator('#hen-overlay.active').waitFor({ state: 'visible', timeout: 15000 });

    await page.goto(`${baseUrl}/?theme=clean#price`, { waitUntil: 'domcontentloaded' });
    await page.locator('#price-intelligence').waitFor({ state: 'visible', timeout: 12000 });
    await expectCount(page, '#price-intelligence .section-copy-link[data-copy-hash="#price"]', 1, 'ux price copy link');

    await page.goto(`${baseUrl}/?theme=clean#widgets`, { waitUntil: 'domcontentloaded' });
    await page.locator('#widgets-gallery').waitFor({ state: 'visible', timeout: 5000 });
    await expectCount(page, '#widgets-gallery .widget-utility-panel', 1, 'ux widget utility');
    await expectCount(page, '#widgets-gallery a[href="/widgets/builder.html"]', 1, 'ux widget utility builder link');
    assert(await page.locator('#widgets-gallery .widget-preview-card').count() === 0, 'ux widget utility: raw preview cards should not render');

    await context.close();
    assert(issues.length === 0, `ux changes browser issues:\n${issues.join('\n')}`);
    log('ok - UX changes smoke');
    await smokeChamberHouseStyle(browser, baseUrl);
  }

  // Regressions from the Chamber house-style pass: every visual defect it fixed
  // is asserted here in the rendered browser, populated, under the light theme.
  async function smokeChamberHouseStyle(browser, baseUrl) {
    const issues = [];
    const openRoom = async (route, viewport, { address = '' } = {}) => {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block', isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
      await installFeatureMocks(context, { whaleChamberMocks: true, ledgerFlowMocks: true });
      await context.addInitScript((saved) => {
        localStorage.setItem('tezos-systems-theme', 'clean');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
        if (saved) localStorage.setItem('tezos-systems-my-baker-address', saved);
      }, address);
      const page = await context.newPage();
      attachIssueCollectors(page, `house style ${route} ${viewport.width}`, issues);
      const response = await page.goto(`${baseUrl}/${route}/`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `house style: /${route}/ failed with HTTP ${response?.status()}`);
      return { context, page };
    };
    const roomState = () => {
      const dialog = document.querySelector('.chamber-overlay.active .chamber-room-shell, .modal.active .chamber-room-shell');
      const close = dialog?.querySelector(':scope > .chamber-close, :scope > .modal-close');
      const header = dialog?.querySelector('[data-chamber-header]');
      const verdict = dialog?.querySelector('.chamber-reading-verdict .chamber-reading-copy > p');
      const tabs = [...(dialog?.querySelectorAll('[role="tab"]') || [])].filter((tab) => tab.getBoundingClientRect().width > 0);
      const d = dialog?.getBoundingClientRect();
      const c = close?.getBoundingClientRect();
      const bg = getComputedStyle(dialog || document.body).backgroundColor.match(/[\d.]+/g)?.map(Number) || [255, 255, 255];
      return {
        width: Math.round(d?.width || 0),
        closeTop: c && d ? Math.round(c.top - d.top) : null,
        closeRight: c && d ? Math.round(d.right - c.right) : null,
        header: Boolean(header),
        verdict: verdict?.textContent?.trim() || '',
        verdictTop: Math.round(dialog?.querySelector('.chamber-reading-verdict')?.getBoundingClientRect().top ?? 9999),
        tabRows: new Set(tabs.map((tab) => Math.round(tab.getBoundingClientRect().top))).size,
        luminance: (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255,
        pageOverflow: document.scrollingElement.scrollWidth - innerWidth
      };
    };

    for (const [route, viewport] of [['whales', { width: 1440, height: 900 }], ['metals', { width: 1440, height: 900 }], ['maxis', { width: 1440, height: 900 }], ['stake', { width: 390, height: 844 }], ['minerals', { width: 390, height: 844 }], ['uranium', { width: 390, height: 844 }], ['tezoscrp', { width: 390, height: 844 }]]) {
      const { context, page } = await openRoom(route, viewport);
      await page.waitForFunction(() => {
        const text = document.querySelector('.chamber-room-shell .chamber-reading-verdict .chamber-reading-copy > p')?.textContent || '';
        const shell = document.querySelector('.chamber-room-shell');
        // Measure the settled room, never a frame of its entrance scale.
        return /\d/.test(text) && !document.querySelector('.chamber-room-shell [aria-busy="true"]')
          && shell.getAnimations({ subtree: false }).every((animation) => animation.playState === 'finished')
          && Math.abs(shell.getBoundingClientRect().width - shell.offsetWidth) < 1;
      }, null, { timeout: 20000 });
      const state = await page.evaluate(roomState);
      const label = `house style /${route}/ ${viewport.width}px`;
      assert(state.header, `${label}: room must open with the shared Chamber header ${JSON.stringify(state)}`);
      assert(/\d/.test(state.verdict.split(/[;.]/)[0]), `${label}: the reading banner must answer with a figure first ${JSON.stringify(state)}`);
      assert(state.luminance < 0.2, `${label}: Chambers must stay dark under the light Clean theme ${JSON.stringify(state)}`);
      assert(state.tabRows <= 1, `${label}: Chamber tabs must stay on one row ${JSON.stringify(state)}`);
      assert(state.pageOverflow <= 0, `${label}: room must not scroll the page sideways ${JSON.stringify(state)}`);
      if (viewport.width >= 1200) {
        assert(state.width === 1180, `${label}: every room shares the 1180px Network Health width ${JSON.stringify(state)}`);
        assert(Math.abs(state.closeTop - 13) <= 1 && Math.abs(state.closeRight - 13) <= 1 && state.closeTop === state.closeRight, `${label}: the exit must sit at the shared 12px inset ${JSON.stringify(state)}`);
      } else {
        assert(state.verdictTop < viewport.height, `${label}: the answer banner must be on the first phone screen ${JSON.stringify(state)}`);
      }
      const scrolled = await page.evaluate(async () => {
        const dialog = document.querySelector('.chamber-room-shell');
        const scroller = dialog.classList.contains('chamber-room-scroll') ? dialog : dialog.querySelector('.chamber-room-scroll') || dialog;
        scroller.scrollTop = 240;
        scroller.dispatchEvent(new Event('scroll'));
        await new Promise((resolve) => setTimeout(resolve, 300));
        return dialog.dataset.chamberScrolled;
      });
      assert(scrolled === 'true', `${label}: a scrolled room must mark itself so the exit gains its opaque band (got ${scrolled})`);
      if (['minerals', 'uranium'].includes(route)) {
        const hero = await page.evaluate(() => {
          const stage = document.querySelector('.minerals-core-stage.is-room, .uranium-core-stage.is-room');
          const header = document.querySelector('[data-chamber-header]');
          const s = stage?.getBoundingClientRect();
          const h = header?.getBoundingClientRect();
          return { stageTop: Math.round(s?.top ?? 0), headerBottom: Math.round(h?.bottom ?? 0), metric: Math.round(document.querySelector('.minerals-hero-metrics, .uranium-hero-price')?.getBoundingClientRect().top ?? 9999) };
        });
        assert(hero.stageTop >= hero.headerBottom, `${label}: hero artwork must stay inside its hero, never behind the header ${JSON.stringify(hero)}`);
      }
      if (route === 'metals') {
        const status = await page.evaluate(() => getComputedStyle(document.querySelector('.chamber-source-status .chamber-snapshot-status')).display);
        assert(status === 'inline', `${label}: the source status must share the Sources & refresh line, not strand its separator (${status})`);
      }
      await context.close();
    }

    {
      const { context, page } = await openRoom('history', { width: 1440, height: 900 });
      await page.locator('#history-modal .chamber-house-header').waitFor({ state: 'visible', timeout: 20000 });
      const history = await page.evaluate(() => ({
        spacing: getComputedStyle(document.querySelector('#history-modal .lb-system-strip span')).wordSpacing,
        actionsInHeader: Boolean(document.querySelector('#history-modal .chamber-house-header .cycle-history-header-actions button, #history-modal .chamber-house-header .cycle-history-header-actions a'))
      }));
      assert(history.spacing === '0px' || history.spacing === 'normal', `house style history: Cycle History labels must not inherit the protocol-history word spacing ${JSON.stringify(history)}`);
      assert(history.actionsInHeader, `house style history: share and copy actions must live in the shared header ${JSON.stringify(history)}`);
      await context.close();
    }

    {
      const { context, page } = await openRoom('chambers', { width: 1440, height: 900 });
      await page.locator('#chambers-grid').waitFor({ state: 'visible', timeout: 20000 });
      const link = await page.evaluate(() => {
        const anchor = document.querySelector('#standalone-chamber-shell #main-content > p > a[href="/"]');
        if (!anchor || !anchor.getClientRects().length) return null;
        const style = getComputedStyle(anchor);
        return { decoration: style.textDecorationLine, transform: style.textTransform, height: Math.round(anchor.getBoundingClientRect().height) };
      });
      assert(!link || (link.decoration === 'none' && link.transform === 'uppercase' && link.height >= 24), `house style chambers: the route home must read as the site back link ${JSON.stringify(link)}`);
      const target = await page.evaluate(() => {
        const button = document.querySelector('.live-head-info');
        if (!button || !button.getClientRects().length) return 'absent';
        const r = button.getBoundingClientRect();
        const hit = document.elementFromPoint(r.right + 3, r.top + r.height / 2);
        return hit === button || button.contains(hit) ? 'hit' : `miss ${hit?.className || hit?.tagName}`;
      });
      assert(target === 'absent' || target === 'hit', `house style: the Live Head info control needs a 24px hit area (${target})`);
      await context.close();
    }

    {
      const { context, page } = await openRoom('my', { width: 1440, height: 900 });
      await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 20000 });
      // Measure after the open slide settles; it enters from the right edge.
      const offCentre = () => { const r = document.querySelector('#my-tezos-drawer').getBoundingClientRect(); return Math.round(Math.abs((r.left + r.right) / 2 - innerWidth / 2)); };
      await page.waitForFunction(() => document.querySelector('#my-tezos-drawer').getAnimations().every((animation) => animation.playState !== 'running'), null, { timeout: 5000 });
      await page.waitForTimeout(450);
      const centred = await page.evaluate(offCentre);
      assert(centred <= 2, `house style /my/: the standalone page must be centred, not a drawer beside a blank half (${centred}px off centre)`);
      await context.close();
    }

    {
      const { context, page } = await openRoom('my', { width: 390, height: 844 }, { address: SAMPLE_ADDRESS });
      await page.locator('#my-tezos-drawer.open').waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('[data-my-tezos-view="tezos-x"]').first().click();
      await page.locator('#my-tezos-panel-tezos-x').waitFor({ state: 'visible', timeout: 20000 });
      const my = await page.evaluate(() => {
        const text = document.querySelector('#my-tezos-drawer')?.innerText || '';
        return {
          emptyPicker: (() => { const select = document.querySelector('#tezosx-account-scope'); return Boolean(select && !select.options.length && !select.hidden); })(),
          runOn: /\d That's/.test(text),
          emoji: /[\u{1F300}-\u{1FAFF}\u2705\u274C\u26A0]/u.test([...document.querySelectorAll('#my-tezos-drawer .brief-section-title, #drawer-share-btn')].map((node) => node.textContent).join(' '))
        };
      });
      assert(!my.emptyPicker, `house style My Tezos: an empty Tezos X account picker must stay hidden ${JSON.stringify(my)}`);
      assert(!my.runOn && !my.emoji, `house style My Tezos: sentences end before the USD note and labels use dots, not emoji ${JSON.stringify(my)}`);
      await context.close();
    }

    assert(issues.length === 0, `house style browser issues:\n${issues.join('\n')}`);
    log('ok - Chamber house-style regressions');
  }

  async function smokeCycleMilestone(browser, baseUrl) {
    const issues = [];
    const now = Date.now();
    const startLevel = 14174689;
    const blocksPerCycle = 14400;
    const headLevel = startLevel + 12545;
    async function loadCyclePage(openPage, { theme = 'matrix', reload = false, expired = false } = {}) {
      // DOMContentLoaded is only the shell: throttled headline requests must
      // finish before Live Pulse asks for this exact cycle-start receipt. Keep
      // the bounded boot/receipt wait separate from the ten-second render check.
      const [response, receipt] = await Promise.all([
        reload
          ? openPage.reload({ waitUntil: 'domcontentloaded' })
          : openPage.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: 'domcontentloaded' }),
        openPage.waitForResponse(candidate => new URL(candidate.url()).pathname
          === `/chains/main/blocks/${startLevel}/header`, { timeout: 30000 })
      ]);
      assert(response?.ok(), `cycle milestone: dashboard failed with HTTP ${response?.status()}`);
      assert(receipt.ok(), `cycle milestone: exact boundary failed with HTTP ${receipt.status()}`);
      const header = await receipt.json();
      const expectedTime = now - ((expired ? 73 : 6) * 60 * 60 * 1000);
      assert(header.level === startLevel && Date.parse(header.timestamp) === expectedTime,
        `cycle milestone: wrong boundary receipt ${JSON.stringify(header)}`);
      await openPage.waitForFunction(() => {
        const briefing = JSON.parse(localStorage.getItem('tezos-systems-briefing-cache') || 'null');
        return briefing?.cycle === 1300
          && document.querySelector('#pulse-ticker-strip')?.dataset.pulseState === 'ready';
      }, null, { timeout: 10000 });
      if (!expired) {
        await openPage.locator('[data-hot-signal-id="milestone-cycle-1300"]').waitFor({ state: 'visible', timeout: 10000 });
      }
    }
    const staleCatalog = {
      schema: 1,
      generatedAt: new Date(now - 7 * 86400000).toISOString(),
      generatedAtCommit: 'fe9bf0ee',
      generatedAtCommitCount: 762,
      cadence: { days: 14, commits: 100 },
      source: 'stale smoke catalog',
      tracks: {
        cycle: {
          current: 1293,
          nextTarget: 1500,
          thresholds: [1000, 1250, 1500],
          recentCrossings: []
        }
      }
    };
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context, {
      // Advancing on every poll manufactures unrelated Live Head work and makes
      // this milestone test depend on the TzKT queue and host scheduling speed.
      blockHeadAutoAdvance: false,
      milestoneCatalog: staleCatalog,
      cycleMilestone: {
        cycle: 1300,
        cyclePosition: headLevel - startLevel,
        blocksPerCycle,
        headLevel,
        headTimestamp: now,
        startLevel,
        startedAt: now - (6 * 60 * 60 * 1000)
      }
    });
    await context.addInitScript(() => {
      const now = Date.now();
      const today = new Date(now).toISOString().slice(0, 10);
      const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      localStorage.setItem('tezos-systems-hot-history', JSON.stringify([
        { day: yesterday, timestamp: now - 86400000, topCategory: 'volume', topScore: 70, signals: [] },
        { day: today, timestamp: now - 3600000, topCategory: 'whales', topScore: 80, signals: [] }
      ]));
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'cycle milestone', issues);
    const milestoneCdp = await context.newCDPSession(page);
    let releaseBoundary;
    const boundaryHeld = page.waitForRequest(request => new URL(request.url()).pathname === `/chains/main/blocks/${startLevel}/header`, { timeout: 30000 });
    const boundaryGate = new Promise(resolve => { releaseBoundary = resolve; });
    let holdBoundary = true;
    await context.route(`**/blocks/${startLevel}/header`, async route => {
      if (holdBoundary) {
        holdBoundary = false;
        await boundaryGate;
      }
      await route.fallback();
    });
    // Exercise both initial and cached desktop boot on a constrained renderer.
    await milestoneCdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    const initialCycleLoad = loadCyclePage(page);
    const primeCandidates = (async () => { try {
      await boundaryHeld;
      // A real-time signal may render while exact milestone verification is
      // pending. Its candidate cache must not hide the later verified receipt.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('hot-signal', {
        detail: { id: 'cycle-receipt-pending', category: 'network', title: 'Pending receipt smoke', text: 'Concurrent signal during exact cycle verification', score: 90 }
      })));
      await page.waitForFunction(() => document.querySelector('#pulse-ticker-strip')?.dataset.pulseState === 'ready');
    } finally {
      releaseBoundary();
    } })();
    await Promise.all([initialCycleLoad, primeCandidates]);
    await milestoneCdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    const before = await page.evaluate(() => {
      const card = document.querySelector('[data-hot-signal-id="milestone-cycle-1300"]');
      const strip = card?.closest('[data-pulse-run="live"]');
      const text = card?.querySelector('.pulse-ticker-title');
      const clock = document.querySelector('#top-continuity-history');
      const runtime = clock?.querySelector('.top-continuity-runtime');
      const outline = clock?.querySelector('.top-continuity-milestone-outline');
      const marker = clock?.querySelector('.top-continuity-milestone-new');
      const runtimeRect = runtime?.getBoundingClientRect();
      const outlineRect = outline?.getBoundingClientRect();
      const markerRect = marker?.getBoundingClientRect();
      const outlineStyle = outline ? getComputedStyle(outline) : null;
      const markerStyle = marker ? getComputedStyle(marker) : null;
      if (strip) strip.scrollLeft = Math.min(80, Math.max(0, strip.scrollWidth - strip.clientWidth));
      card?.focus({ preventScroll: true });
      if (text) {
        const range = document.createRange();
        range.selectNodeContents(text);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      window.__cycleMilestoneCard = card;
      window.__cycleMilestoneOutline = outline;
      window.__cycleMilestoneScroll = strip?.scrollLeft || 0;
      window.dispatchEvent(new CustomEvent('hot-signal', {
        detail: {
          id: 'cycle-milestone-reconcile-smoke',
          category: 'network',
          title: 'Reconcile smoke',
          text: 'Low-priority reconciliation signal.',
          score: 1,
          live: true
        }
      }));
      return {
        title: text?.textContent?.trim() || '',
        text: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
        href: card?.getAttribute('href') || '',
        status: card?.dataset.milestoneStatus || '',
        earlier: document.querySelector('.hot-today-earlier')?.textContent?.trim() || '',
        clockAria: document.querySelector('#top-continuity-history')?.getAttribute('aria-label') || '',
        clockRoute: document.querySelector('#top-continuity-history')?.dataset.milestoneRoute || '',
        clockSubline: document.querySelector('#top-continuity-history .top-continuity-subline')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        outlineVisible: Boolean(outline && !outline.hidden && outlineStyle?.display !== 'none'),
        outlineInsideClock: Boolean(clock?.contains(outline)),
        outlineWrapsRuntime: Boolean(
          outlineRect
          && runtimeRect
          && outlineRect.left <= runtimeRect.left - 3
          && outlineRect.right >= runtimeRect.right + 3
          && outlineRect.top <= runtimeRect.top - 2
          && outlineRect.bottom >= runtimeRect.bottom + 2
        ),
        outlineTightToRuntime: Boolean(
          outlineRect
          && runtimeRect
          && runtimeRect.left - outlineRect.left <= 8
          && outlineRect.right - runtimeRect.right <= 8
          && runtimeRect.top - outlineRect.top <= 5
          && outlineRect.bottom - runtimeRect.bottom <= 5
        ),
        outlineInsets: outlineRect && runtimeRect ? {
          left: runtimeRect.left - outlineRect.left,
          right: outlineRect.right - runtimeRect.right,
          top: runtimeRect.top - outlineRect.top,
          bottom: outlineRect.bottom - runtimeRect.bottom
        } : null,
        outlineBorderStyle: outlineStyle?.borderStyle || '',
        outlineBorderWidth: Number.parseFloat(outlineStyle?.borderTopWidth || '0'),
        outlineBackground: outlineStyle?.backgroundColor || '',
        outlineBoxShadow: outlineStyle?.boxShadow || '',
        outlineAnimation: outlineStyle?.animationName || '',
        outlineAnimationIterations: outlineStyle?.animationIterationCount || '',
        markerText: marker?.textContent?.trim() || '',
        markerGap: outlineRect && markerRect ? outlineRect.top - markerRect.bottom : -999,
        markerRect: markerRect ? {
          top: markerRect.top,
          bottom: markerRect.bottom,
          height: markerRect.height
        } : null,
        markerBorderWidth: Number.parseFloat(markerStyle?.borderTopWidth || '0'),
        markerBoxShadow: markerStyle?.boxShadow || '',
        markerAnimation: markerStyle?.animationName || '',
        markerAnimationIterations: markerStyle?.animationIterationCount || '',
        markerOutsideOutline: Boolean(marker && outline && !outline.contains(marker)),
        markerAttachedTopRight: Boolean(
          markerRect
          && runtimeRect
          && markerRect.right >= runtimeRect.right
          && markerRect.left >= runtimeRect.right - markerRect.width
          && markerRect.top < runtimeRect.top
        ),
        popoverTitle: document.querySelector('#top-continuity-milestone-title')?.textContent?.trim() || '',
        popoverStatus: document.querySelector('#top-continuity-milestone-status')?.textContent?.trim() || '',
        popoverCopy: document.querySelector('#top-continuity-milestone-copy')?.textContent?.trim() || '',
        popoverLink: document.querySelector('#top-continuity-milestone-link')?.getAttribute('href') || '',
        popoverLinkLabel: document.querySelector('#top-continuity-milestone-link-label')?.textContent?.trim() || '',
        orbitControls: document.querySelectorAll('.top-continuity-milestone-orbit').length,
        detachedInfoControls: document.querySelectorAll('.top-continuity-milestone-info').length
      };
    });
    await waitForIntentionalRealTime(page, 'cycle-milestone-marker-settle');
    const settledMarker = await page.evaluate(() => {
      const clock = document.querySelector('#top-continuity-history');
      const outline = clock?.querySelector('.top-continuity-milestone-outline');
      const marker = clock?.querySelector('.top-continuity-milestone-new');
      const markerRect = marker?.getBoundingClientRect();
      const paintTarget = markerRect
        ? document.elementFromPoint(
            markerRect.left + (markerRect.width / 2),
            markerRect.top + (markerRect.height / 2)
          )
        : null;
      return {
        opacity: marker ? Number.parseFloat(getComputedStyle(marker).opacity) : 0,
        outsideOutline: Boolean(marker && outline && !outline.contains(marker)),
        topPainted: Boolean(marker && paintTarget && (paintTarget === marker || marker.contains(paintTarget)))
      };
    });
    await page.locator('#top-continuity-history').hover();
    await page.waitForFunction(() => {
      const popover = document.querySelector('#top-continuity-milestone-popover');
      return popover
        && popover.getAttribute('aria-hidden') === 'false'
        && Number.parseFloat(getComputedStyle(popover).opacity) >= 0.98;
    }, null, { timeout: 1500 });
    const clockHover = await page.evaluate(() => {
      const popover = document.querySelector('#top-continuity-milestone-popover');
      const clock = document.querySelector('#top-continuity-history');
      return {
        opacity: popover ? getComputedStyle(popover).opacity : '',
        pointerEvents: popover ? getComputedStyle(popover).pointerEvents : '',
        text: popover?.textContent?.replace(/\s+/g, ' ').trim() || '',
        expanded: clock?.getAttribute('aria-expanded') || ''
      };
    });
    await waitForIntentionalRealTime(page, 'cycle-milestone-quiet-refresh');
    const after = await page.evaluate(() => {
      const card = document.querySelector('[data-hot-signal-id="milestone-cycle-1300"]');
      const strip = card?.closest('[data-pulse-run="live"]');
      const selection = window.getSelection();
      return {
        sameCard: card === window.__cycleMilestoneCard,
        sameOutline: document.querySelector('.top-continuity-milestone-outline') === window.__cycleMilestoneOutline,
        focused: document.activeElement === card,
        selected: selection?.toString().trim() || '',
        scrollLeft: strip?.scrollLeft || 0,
        expectedScrollLeft: window.__cycleMilestoneScroll || 0,
        earlier: document.querySelector('.hot-today-earlier')?.textContent?.trim() || ''
      };
    });

    assert(before.title === '1,300 cycles', `cycle milestone: expected full cycle title, saw ${JSON.stringify(before)}`);
    assert(/1,300 cycles crossed/.test(before.text), `cycle milestone: exact crossed copy missing ${JSON.stringify(before)}`);
    assert(/1,300 cycles/.test(before.clockAria)
      && before.clockRoute === '#health'
      && /Zero outages/i.test(before.clockSubline)
      && before.outlineVisible
      && before.outlineInsideClock
      && before.outlineWrapsRuntime
      && before.outlineTightToRuntime
      && before.outlineBorderStyle === 'solid'
      && before.outlineBorderWidth >= 1
      && before.outlineBorderWidth <= 1.34
      && before.outlineBackground === 'rgba(0, 0, 0, 0)'
      && before.outlineBoxShadow === 'none'
      && before.outlineAnimation.includes('uptimeMilestoneOutlineArrival')
      && before.outlineAnimationIterations === '1'
      && before.markerText === 'New'
      && before.markerGap > 0
      && before.markerBorderWidth === 0
      && before.markerBoxShadow === 'none'
      && before.markerAnimation.includes('uptimeMilestoneNewReveal')
      && before.markerAnimation.includes('uptimeMilestoneNewNudge')
      && before.markerAnimationIterations.split(',').every((value) => value.trim() === '1')
      && before.markerOutsideOutline
      && before.markerAttachedTopRight
      && before.popoverTitle === '1,300 cycles'
      && before.popoverStatus === 'Confirmed on-chain'
      && /Cycle 1,300 is confirmed on-chain/.test(before.popoverCopy)
      && before.popoverLink === '#health'
      && before.popoverLinkLabel === 'Open Network Health'
      && before.orbitControls === 0
      && before.detachedInfoControls === 0,
    `cycle milestone: uptime should carry the clean outlined NEW attractor without rewriting the clock or adding an offset highlight ${JSON.stringify(before)}`);
    assert(
      settledMarker.opacity >= 0.98
        && settledMarker.outsideOutline
        && settledMarker.topPainted,
      `cycle milestone: NEW marker must remain painted above the outline after its clip-path arrival settles ${JSON.stringify(settledMarker)}`
    );
    assert(Number.parseFloat(clockHover.opacity) >= 0.98
      && clockHover.pointerEvents === 'auto'
      && clockHover.expanded === 'true'
      && /Confirmed on-chain 1,300 cycles.*Open Network Health/.test(clockHover.text),
    `cycle milestone: hovering the uptime clock did not reveal the anchored event card ${JSON.stringify(clockHover)}`);
    assert(before.href === '#health' && before.status === 'crossed', `cycle milestone: route or status mismatch ${JSON.stringify(before)}`);
    assert(!before.earlier && !after.earlier, `cycle milestone: dead Earlier today breadcrumb survived ${JSON.stringify({ before, after })}`);
    assert(after.sameCard && after.sameOutline && after.focused && after.selected === '1,300 cycles', `cycle milestone: quiet reconciliation or the live clock rebuild replaced or disturbed stable milestone state ${JSON.stringify(after)}`);
    assert(Math.abs(after.scrollLeft - after.expectedScrollLeft) <= 1, `cycle milestone: quiet reconciliation reset strip scroll ${JSON.stringify(after)}`);
    await milestoneCdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await loadCyclePage(page, { reload: true });
    await context.close();

    const nearContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block'
    });
    await installFeatureMocks(nearContext);
    await nearContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const nearPage = await nearContext.newPage();
    attachIssueCollectors(nearPage, 'near cycle milestone', issues);
    const nearResponse = await nearPage.goto(`${baseUrl}/?theme=clean`, { waitUntil: 'domcontentloaded' });
    assert(nearResponse?.ok(), `near cycle milestone: dashboard failed with HTTP ${nearResponse?.status()}`);
    await nearPage.locator('main').waitFor({ state: 'visible', timeout: 10000 });
    await nearPage.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true'
      && document.querySelector('#pulse-ticker-strip')?.dataset.pulseState === 'ready', null, { timeout: 15000 });
    await nearPage.evaluate(() => {
      window.dispatchEvent(new CustomEvent('hot-signal-rendered', {
        detail: {
          milestone: {
            id: 'milestone-cycle-1301',
            milestoneStatus: 'near',
            kind: 'state',
            tone: 'milestone',
            category: 'milestone',
            route: '#health',
            shortLabel: '1,301 cycles',
            title: '1,301 cycles',
            text: 'Tezos is approaching cycle 1,301.',
            expiresAt: Date.now() + (3 * 24 * 60 * 60 * 1000)
          }
        }
      }));
    });
    await nearPage.waitForFunction(() => {
      const outline = document.querySelector('.top-continuity-milestone-outline');
      const opacity = outline ? Number.parseFloat(getComputedStyle(outline).opacity) : 0;
      return document.querySelector('#top-continuity-history')?.dataset.milestoneStatus === 'near'
        && opacity >= 0.6 && opacity <= 0.68;
    }, null, { timeout: 1500 });
    const nearState = await nearPage.evaluate(() => {
      const cluster = document.querySelector('.top-uptime-cluster');
      const clock = document.querySelector('#top-continuity-history');
      const outline = clock?.querySelector('.top-continuity-milestone-outline');
      const marker = clock?.querySelector('.top-continuity-milestone-new');
      const outlineStyle = outline ? getComputedStyle(outline) : null;
      const markerStyle = marker ? getComputedStyle(marker) : null;
      const markerRect = marker?.getBoundingClientRect();
      const paintTarget = markerRect
        ? document.elementFromPoint(
            markerRect.left + (markerRect.width / 2),
            markerRect.top + (markerRect.height / 2)
          )
        : null;
      return {
        markerText: marker?.textContent?.trim() || '',
        markerVisible: Boolean(marker && markerStyle?.display !== 'none'),
        markerTopPainted: Boolean(marker && paintTarget && (paintTarget === marker || marker.contains(paintTarget))),
        outlineHidden: Boolean(outline?.hidden),
        outlineBorderStyle: outlineStyle?.borderStyle || '',
        outlineOpacity: Number.parseFloat(outlineStyle?.opacity || '0'),
        nearClass: Boolean(cluster?.classList.contains('is-milestone-near')),
        crossedClass: Boolean(cluster?.classList.contains('is-milestone-crossed')),
        historyNearClass: Boolean(clock?.classList.contains('is-milestone-near')),
        historyCrossedClass: Boolean(clock?.classList.contains('is-milestone-crossed')),
        status: clock?.dataset.milestoneStatus || '',
        route: clock?.dataset.milestoneRoute || '',
        popoverStatus: document.querySelector('#top-continuity-milestone-status')?.textContent?.trim() || '',
        staleClasses: document.querySelectorAll('.is-milestone-celebrating, .has-milestone-near, .has-milestone-celebration').length
      };
    });
    assert(
      nearState.markerText === 'Soon'
        && nearState.markerVisible
        && nearState.markerTopPainted
        && !nearState.outlineHidden
        && nearState.outlineBorderStyle === 'dashed'
        && nearState.outlineOpacity >= 0.6
        && nearState.outlineOpacity <= 0.68
        && nearState.nearClass
        && !nearState.crossedClass
        && !nearState.historyNearClass
        && !nearState.historyCrossedClass
        && nearState.status === 'near'
        && nearState.route === '#health'
        && nearState.popoverStatus === 'Approaching on-chain'
        && nearState.staleClasses === 0,
      `near cycle milestone: approaching state should render a distinct dashed SOON treatment without dead state classes ${JSON.stringify(nearState)}`
    );
    await nearPage.locator('#top-continuity-history').tap();
    await nearPage.waitForFunction(() => {
      const popover = document.querySelector('#top-continuity-milestone-popover');
      return popover
        && popover.getAttribute('aria-hidden') === 'false'
        && Number.parseFloat(getComputedStyle(popover).opacity) >= 0.98;
    }, null, { timeout: 1500 });
    const nearFirstTap = await nearPage.evaluate(() => ({
      hash: window.location.hash,
      chamberOpen: Boolean(document.querySelector('.chamber-overlay.active')),
      expanded: document.querySelector('#top-continuity-history')?.getAttribute('aria-expanded') || '',
      markerText: document.querySelector('.top-continuity-milestone-new')?.textContent?.trim() || '',
      popoverStatus: document.querySelector('#top-continuity-milestone-status')?.textContent?.trim() || ''
    }));
    assert(
      !nearFirstTap.hash
        && !nearFirstTap.chamberOpen
        && nearFirstTap.expanded === 'true'
        && nearFirstTap.markerText === 'Soon'
        && nearFirstTap.popoverStatus === 'Approaching on-chain',
      `near cycle milestone: first mobile SOON tap must disclose the approaching milestone without opening its Chamber ${JSON.stringify(nearFirstTap)}`
    );
    await nearContext.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block'
    });
    await installFeatureMocks(mobileContext, {
      blockHeadAutoAdvance: false,
      milestoneCatalog: staleCatalog,
      cycleMilestone: {
        cycle: 1300,
        cyclePosition: headLevel - startLevel,
        blocksPerCycle,
        headLevel,
        headTimestamp: now,
        startLevel,
        startedAt: now - (6 * 60 * 60 * 1000)
      }
    });
    await mobileContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      if (!localStorage.getItem('tezos-systems-uptime-milestone-seen-v1')) {
        localStorage.setItem('tezos-systems-uptime-milestone-seen-v1', JSON.stringify({
          schema: 1,
          seen: ['milestone-cycle-1300|near']
        }));
      }
    });
    const mobilePage = await mobileContext.newPage();
    attachIssueCollectors(mobilePage, 'mobile cycle milestone', issues);
    await loadCyclePage(mobilePage);
    const peerPage = await mobileContext.newPage();
    attachIssueCollectors(peerPage, 'peer cycle milestone', issues);
    await loadCyclePage(peerPage);
    for (const [label, openPage] of [['mobile', mobilePage], ['peer', peerPage]]) {
      const forcedState = await openPage.evaluate(() => {
        window.dispatchEvent(new CustomEvent('hot-signal-rendered', {
          detail: {
            milestone: {
              id: 'milestone-cycle-1300',
              kind: 'event',
              tone: 'milestone',
              category: 'milestone',
              route: '#health',
              shortLabel: '1,300 cycles',
              title: '1,300 cycles',
              text: 'Cycle 1,300 is confirmed on-chain.',
              expiresAt: Date.now() + (3 * 24 * 60 * 60 * 1000)
            }
          }
        }));
        const clock = document.querySelector('#top-continuity-history');
        return {
          route: clock?.dataset.milestoneRoute || '',
          signalClass: Boolean(clock?.classList.contains('has-milestone-signal')),
          outlineHidden: Boolean(document.querySelector('.top-continuity-milestone-outline')?.hidden)
        };
      });
      assert(
        forcedState.route === '#health' && forcedState.signalClass && !forcedState.outlineHidden,
        `${label} cycle milestone: forced shared crossed signal did not reach the uptime clock ${JSON.stringify(forcedState)}`
      );
    }
    await peerPage.locator('.top-continuity-milestone-outline').waitFor({ state: 'visible', timeout: 5000 });
    await mobilePage.evaluate(() => {
      const targets = [
        document.querySelector('.top-continuity-milestone-outline'),
        document.querySelector('.top-continuity-milestone-new')
      ].filter(Boolean);
      targets.flatMap((target) => target.getAnimations()).forEach((animation) => {
        animation.currentTime = 1000;
        animation.pause();
      });
    });
    const mobileClock = mobilePage.locator('#top-continuity-history');
    const activityTopBeforeTap = await mobilePage.locator('#header-activity-button').evaluate((element) => element.getBoundingClientRect().top);
    const beforeTap = await mobilePage.evaluate(() => {
      const clock = document.querySelector('#top-continuity-history');
      const runtime = clock?.querySelector('.top-continuity-runtime');
      const outline = clock?.querySelector('.top-continuity-milestone-outline');
      const marker = clock?.querySelector('.top-continuity-milestone-new');
      const runtimeRect = runtime?.getBoundingClientRect();
      const outlineRect = outline?.getBoundingClientRect();
      const markerRect = marker?.getBoundingClientRect();
      const outlineStyle = outline ? getComputedStyle(outline) : null;
      const markerStyle = marker ? getComputedStyle(marker) : null;
      const paintTarget = markerRect
        ? document.elementFromPoint(
            markerRect.left + (markerRect.width / 2),
            markerRect.top + (markerRect.height / 2)
          )
        : null;
      return {
        outlineVisible: Boolean(outline && !outline.hidden && outlineStyle?.display !== 'none'),
        outlineWrapsRuntime: Boolean(
          outlineRect
          && runtimeRect
          && outlineRect.left <= runtimeRect.left - 1
          && outlineRect.right >= runtimeRect.right + 1
          && outlineRect.top <= runtimeRect.top - 2
          && outlineRect.bottom >= runtimeRect.bottom + 2
        ),
        outlineTightToRuntime: Boolean(
          outlineRect
          && runtimeRect
          && runtimeRect.left - outlineRect.left <= 7
          && outlineRect.right - runtimeRect.right <= 7
          && runtimeRect.top - outlineRect.top <= 5
          && outlineRect.bottom - runtimeRect.bottom <= 5
        ),
        outlineBackground: outlineStyle?.backgroundColor || '',
        outlineBoxShadow: outlineStyle?.boxShadow || '',
        outlineBorderStyle: outlineStyle?.borderStyle || '',
        markerText: marker?.textContent?.trim() || '',
        markerOpacity: Number.parseFloat(markerStyle?.opacity || '0'),
        markerGap: outlineRect && markerRect ? outlineRect.top - markerRect.bottom : -999,
        markerOutsideOutline: Boolean(marker && outline && !outline.contains(marker)),
        markerTopPainted: Boolean(marker && paintTarget && (paintTarget === marker || marker.contains(paintTarget))),
        markerAttachedTopRight: Boolean(
          markerRect
          && runtimeRect
          && markerRect.right >= runtimeRect.right
          && markerRect.left >= runtimeRect.right - markerRect.width
          && markerRect.top < runtimeRect.top
        ),
        subline: clock?.querySelector('.top-continuity-subline')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        route: clock?.dataset.milestoneRoute || ''
      };
    });
    assert(
      beforeTap.outlineVisible
        && beforeTap.outlineWrapsRuntime
        && beforeTap.outlineTightToRuntime
        && beforeTap.outlineBackground === 'rgba(0, 0, 0, 0)'
        && beforeTap.outlineBoxShadow === 'none'
        && beforeTap.outlineBorderStyle === 'solid'
        && beforeTap.markerText === 'New'
        && beforeTap.markerOpacity >= 0.98
        && beforeTap.markerGap >= 1
        && beforeTap.markerOutsideOutline
        && beforeTap.markerTopPainted
        && beforeTap.markerAttachedTopRight
        && /Zero outages/i.test(beforeTap.subline)
        && beforeTap.route === '#health',
      `mobile cycle milestone: a previously seen near status must not suppress the newly crossed outlined NEW action ${JSON.stringify(beforeTap)}`
    );
    await mobileClock.tap();
    await mobilePage.waitForFunction(() => {
      const popover = document.querySelector('#top-continuity-milestone-popover');
      return popover
        && popover.getAttribute('aria-hidden') === 'false'
        && Number.parseFloat(getComputedStyle(popover).opacity) >= 0.98;
    }, null, { timeout: 1500 });
    const firstTap = await mobilePage.evaluate(() => {
      const clock = document.querySelector('#top-continuity-history');
      const popover = document.querySelector('#top-continuity-milestone-popover');
      const milestoneLink = document.querySelector('#top-continuity-milestone-link');
      const milestoneClose = document.querySelector('#top-continuity-milestone-close');
      const outline = document.querySelector('.top-continuity-milestone-outline');
      const activity = document.querySelector('#header-activity-button');
      const activityRect = activity?.getBoundingClientRect();
      const popoverRect = popover?.getBoundingClientRect();
      const linkRect = milestoneLink?.getBoundingClientRect();
      const closeRect = milestoneClose?.getBoundingClientRect();
      const popoverBackground = popover ? getComputedStyle(popover).backgroundColor : '';
      const popoverBackgroundAlpha = popoverBackground.startsWith('rgba(')
        ? Number.parseFloat(popoverBackground.split(',').pop()) || 0
        : 1;
      const linkHitTarget = linkRect
        ? document.elementFromPoint(linkRect.left + (linkRect.width / 2), linkRect.top + (linkRect.height / 2))
        : null;
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem('tezos-systems-uptime-milestone-seen-v1') || 'null'); } catch (_) {}
      return {
        hash: window.location.hash,
        healthOpen: Boolean(document.querySelector('#network-health-modal.active')),
        expanded: clock?.getAttribute('aria-expanded') || '',
        popoverAriaHidden: popover?.getAttribute('aria-hidden') || '',
        popoverHidden: Boolean(popover?.hidden),
        popoverBackgroundAlpha,
        popoverOpacity: popover ? Number.parseFloat(getComputedStyle(popover).opacity) : 0,
        popoverText: popover?.textContent?.replace(/\s+/g, ' ').trim() || '',
        popoverInsideViewport: Boolean(popoverRect && popoverRect.left >= 0 && popoverRect.right <= window.innerWidth),
        popoverPosition: popover ? getComputedStyle(popover).position : '',
        popoverBottomGap: popoverRect ? window.innerHeight - popoverRect.bottom : -1,
        outlineHidden: Boolean(outline?.hidden),
        outlineDisplay: outline ? getComputedStyle(outline).display : '',
        signalClass: Boolean(clock?.classList.contains('has-milestone-signal')),
        storedSeen: Array.isArray(stored?.seen) ? stored.seen : [],
        activityTop: activityRect?.top ?? -1,
        subline: clock?.querySelector('.top-continuity-subline')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        linkText: milestoneLink?.textContent?.replace(/\s+/g, ' ').trim() || '',
        linkHref: milestoneLink?.getAttribute('href') || '',
        linkVisible: Boolean(linkRect && linkRect.width > 0 && linkRect.height > 0),
        linkOwnsHitTarget: Boolean(linkHitTarget && milestoneLink?.contains(linkHitTarget)),
        closeVisible: Boolean(closeRect && closeRect.width > 0 && closeRect.height > 0),
        orbitControls: document.querySelectorAll('.top-continuity-milestone-orbit').length
      };
    });
    assert(!firstTap.hash
      && !firstTap.healthOpen
      && firstTap.expanded === 'true'
      && firstTap.popoverAriaHidden === 'false'
      && !firstTap.popoverHidden
      && firstTap.popoverBackgroundAlpha === 1
      && firstTap.popoverOpacity >= 0.98
      && /Confirmed on-chain.*Open Network Health/.test(firstTap.popoverText)
      && firstTap.popoverInsideViewport
      && firstTap.popoverPosition === 'fixed'
      && firstTap.popoverBottomGap >= 0
      && firstTap.popoverBottomGap <= 20
      && !firstTap.outlineHidden
      && firstTap.outlineDisplay !== 'none'
      && firstTap.signalClass
      && firstTap.storedSeen.includes('milestone-cycle-1300|near')
      && !firstTap.storedSeen.includes('milestone-cycle-1300|crossed')
      && Math.abs(firstTap.activityTop - activityTopBeforeTap) <= 1
      && /Zero outages/i.test(firstTap.subline)
      && firstTap.linkText === 'Open Network Health ↗'
      && firstTap.linkHref === '#health'
      && firstTap.linkVisible
      && firstTap.linkOwnsHitTarget
      && firstTap.closeVisible
      && firstTap.orbitControls === 0,
    `mobile cycle milestone: first clock tap must open the fixed explanation sheet without navigating, marking seen, or moving header content ${JSON.stringify(firstTap)}`);
    await mobileClock.tap();
    await mobilePage.waitForFunction(() => window.location.hash === '#health' && document.querySelector('#network-health-modal')?.classList.contains('active'), null, { timeout: 10000 });
    const secondTap = await mobilePage.evaluate(() => {
      const clock = document.querySelector('#top-continuity-history');
      const popover = document.querySelector('#top-continuity-milestone-popover');
      const outline = document.querySelector('.top-continuity-milestone-outline');
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem('tezos-systems-uptime-milestone-seen-v1') || 'null'); } catch (_) {}
      return {
        hash: window.location.hash,
        healthOpen: Boolean(document.querySelector('#network-health-modal.active')),
        expanded: clock?.getAttribute('aria-expanded') || '',
        popoverAriaHidden: popover?.getAttribute('aria-hidden') || '',
        popoverHidden: Boolean(popover?.hidden),
        outlineHidden: Boolean(outline?.hidden),
        outlineDisplay: outline ? getComputedStyle(outline).display : '',
        signalClass: Boolean(clock?.classList.contains('has-milestone-signal')),
        storedSeen: Array.isArray(stored?.seen) ? stored.seen : []
      };
    });
    assert(
      secondTap.hash === '#health'
        && secondTap.healthOpen
        && secondTap.expanded !== 'true'
        && secondTap.popoverAriaHidden === 'true'
        && secondTap.popoverHidden
        && secondTap.outlineHidden
        && secondTap.outlineDisplay === 'none'
        && !secondTap.signalClass
        && secondTap.storedSeen.includes('milestone-cycle-1300|near')
        && secondTap.storedSeen.includes('milestone-cycle-1300|crossed'),
      `mobile cycle milestone: second clock tap must mark the milestone seen, retire the attractor, and open its Chamber ${JSON.stringify(secondTap)}`
    );
    await peerPage.waitForFunction(() => {
      const outline = document.querySelector('.top-continuity-milestone-outline');
      const clock = document.querySelector('#top-continuity-history');
      return Boolean(outline?.hidden) && !clock?.classList.contains('has-milestone-signal');
    }, null, { timeout: 5000 });
    const peerState = await peerPage.evaluate(() => {
      const outline = document.querySelector('.top-continuity-milestone-outline');
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem('tezos-systems-uptime-milestone-seen-v1') || 'null'); } catch (_) {}
      return {
        outlineHidden: Boolean(outline?.hidden),
        outlineDisplay: outline ? getComputedStyle(outline).display : '',
        signalClass: Boolean(document.querySelector('#top-continuity-history')?.classList.contains('has-milestone-signal')),
        storedSeen: Array.isArray(stored?.seen) ? stored.seen : [],
        route: document.querySelector('#top-continuity-history')?.dataset.milestoneRoute || ''
      };
    });
    assert(
      peerState.outlineHidden
        && peerState.outlineDisplay === 'none'
        && !peerState.signalClass
        && peerState.storedSeen.includes('milestone-cycle-1300|crossed')
        && !peerState.route,
      `mobile cycle milestone: another open tab must retire the same seen id plus status without navigation ${JSON.stringify(peerState)}`
    );
    await mobilePage.reload({ waitUntil: 'domcontentloaded' });
    await mobilePage.waitForFunction(() => (
      document.querySelector('#top-continuity-history')?.dataset.milestoneCelebrationWired === '1'
    ), null, { timeout: 10000 });
    await mobilePage.evaluate(() => {
      window.dispatchEvent(new CustomEvent('hot-signal-rendered', {
        detail: {
          milestone: {
            id: 'milestone-cycle-1300',
            kind: 'event',
            tone: 'milestone',
            category: 'milestone',
            route: '#health',
            shortLabel: '1,300 cycles',
            title: '1,300 cycles',
            text: 'Cycle 1,300 is confirmed on-chain.',
            expiresAt: Date.now() + (3 * 24 * 60 * 60 * 1000)
          }
        }
      }));
    });
    const afterReload = await mobilePage.evaluate(() => ({
      outlineHidden: Boolean(document.querySelector('.top-continuity-milestone-outline')?.hidden),
      outlineDisplay: getComputedStyle(document.querySelector('.top-continuity-milestone-outline')).display,
      signalClass: Boolean(document.querySelector('#top-continuity-history')?.classList.contains('has-milestone-signal')),
      subline: document.querySelector('#top-continuity-history .top-continuity-subline')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    assert(
      afterReload.outlineHidden
        && afterReload.outlineDisplay === 'none'
        && !afterReload.signalClass
        && /Zero outages/i.test(afterReload.subline),
      `mobile cycle milestone: seen state must remain retired after reload ${JSON.stringify(afterReload)}`
    );
    await mobilePage.locator('#network-health-modal.active .chamber-close').tap();
    await mobileClock.tap();
    await mobilePage.waitForFunction(() => window.location.hash === '#protocol-history' && document.querySelector('#protocol-history-chamber-modal')?.classList.contains('active'), null, { timeout: 10000 });
    await mobileContext.close();

    const expiredContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(expiredContext, {
      blockHeadAutoAdvance: false,
      milestoneCatalog: staleCatalog,
      cycleMilestone: {
        cycle: 1300,
        cyclePosition: headLevel - startLevel,
        blocksPerCycle,
        headLevel,
        headTimestamp: now,
        startLevel,
        startedAt: now - (73 * 60 * 60 * 1000)
      }
    });
    await expiredContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'clean');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const expiredPage = await expiredContext.newPage();
    attachIssueCollectors(expiredPage, 'expired cycle milestone', issues);
    await loadCyclePage(expiredPage, { theme: 'clean', expired: true });
    const expiredState = await expiredPage.evaluate(() => {
      const card = document.querySelector('[data-hot-signal-id="milestone-cycle-1300"]');
      return {
        card: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
        createdAt: card?.dataset.milestoneCreatedAt || '',
        expiresAt: card?.dataset.milestoneExpiresAt || '',
        moments: localStorage.getItem('tezos-systems-milestone-moments-v1') || '',
        briefing: localStorage.getItem('tezos-systems-briefing-cache') || ''
      };
    });
    assert(!expiredState.card, `expired cycle milestone: 72-hour card resurrected ${JSON.stringify(expiredState)}`);
    await expiredContext.close();

    assert(issues.length === 0, `cycle milestone browser issues:\n${issues.join('\n')}`);
    log('ok - exact Cycle 1300 milestone and Live Pulse history cleanup');
  }

  return { smokeDashboard, smokeHomeLayout, smokeFirstVisitTour, smokeVisitSignalBloom, smokeUxChanges, smokeCycleMilestone };
}
