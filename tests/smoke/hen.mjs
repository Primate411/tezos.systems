// Browser workflows owned by hen. Shared dependencies remain explicit.
export function createHenSmokeSuites({
  ARTIFACTS_DIR,
  SAMPLE_ADDRESS,
  SAMPLE_ADDRESS_2,
  assert,
  attachIssueCollectors,
  ensureDropdownOpen,
  expectClassContains,
  installFeatureMocks,
  installOctezConnectMock,
  log,
  mkdir,
  openDropdown,
  path,
  waitForIntentionalRealTime
}) {
  async function smokeOptionalStartup(browser, baseUrl) {
    const optionalPaths = new Set(['/js/features/changelog.js', '/js/features/hen-mode.js', '/css/hen-feed.min.css', '/css/protocol-anthology.min.css']);
    for (const [theme, width] of [['matrix', 1280], ['clean', 390]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await installFeatureMocks(context);
      const page = await context.newPage();
      const issues = [];
      attachIssueCollectors(page, `optional startup ${theme}`, issues);
      const capture = async (surface) => {
        if (!ARTIFACTS_DIR) return;
        await mkdir(ARTIFACTS_DIR, { recursive: true });
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, `optional-${theme}-${width}-${surface}.png`), fullPage: false });
      };
      const requests = [];
      page.on('request', request => requests.push(new URL(request.url()).pathname));
      await page.goto(`${baseUrl}/?theme=${theme}`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('changelog-btn')?.dataset.changelogLauncherWired === '1');
      await waitForIntentionalRealTime(page, 'lazy-chamber-no-intent');
      assert(!requests.some(item => optionalPaths.has(item)), `optional startup fetched before intent: ${requests.filter(item => optionalPaths.has(item))}`);
      assert(await page.locator('#changelog-body > *').count() === 0, 'closed changelog must not construct the archive');
      assert(await page.evaluate(() => document.visibilityState === 'visible'), 'startup assertions need an actually visible tab');
      const chrome = await page.evaluate(() => ({
        giftPosition: getComputedStyle(document.getElementById('corner-gift-tray')).position,
        overflow: document.documentElement.scrollWidth - innerWidth
      }));
      assert(['relative', 'fixed'].includes(chrome.giftPosition) && chrome.overflow <= 1, `shared HEN chrome regressed: ${JSON.stringify(chrome)}`);
      await capture('home');

      // A slow first import must remain cancellable, without constructing hidden DOM.
      let releaseChangelog;
      const changelogGate = new Promise(resolve => { releaseChangelog = resolve; });
      await page.route('**/js/features/changelog.js*', async route => { await changelogGate; await route.continue(); });
      await openDropdown(page, '#settings-gear', '#settings-dropdown');
      const changelogRequested = page.waitForRequest('**/js/features/changelog.js*');
      await page.locator('#changelog-btn').click();
      await changelogRequested;
      assert(await page.locator('#changelog-body > *').count() === 0, 'delayed changelog must remain unrendered');
      await page.keyboard.press('Escape');
      releaseChangelog();
      await page.waitForFunction(() => !document.getElementById('changelog-btn')?.hasAttribute('aria-busy'));
      assert(await page.locator('#changelog-modal').getAttribute('aria-hidden') === 'true', 'Escape must cancel a pending archive open');
      await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
      await page.locator('#changelog-btn').click();
      await page.locator('#changelog-modal[aria-hidden="false"]').waitFor({ state: 'visible' });
      assert(await page.locator('#changelog-body .changelog-entry').count() > 100, 'lazy archive lost its history');
      await page.evaluate(() => { window.__startupArchiveNode = document.querySelector('#changelog-body .changelog-entry'); });
      await page.locator('.changelog-modal-close').click();
      await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
      await page.locator('#changelog-btn').click();
      await page.locator('#changelog-modal[aria-hidden="false"]').waitFor({ state: 'visible' });
      assert(await page.evaluate(() => document.querySelector('#changelog-body .changelog-entry') === window.__startupArchiveNode), 'reopening must reuse archive DOM');
      assert(requests.filter(item => item === '/js/features/changelog.js').length === 1, 'reopening must reuse the archive module');
      await page.locator('.changelog-modal-close').click();

      await page.goto(`${baseUrl}/?theme=${theme}#nfts`, { waitUntil: 'domcontentloaded' });
      await page.locator('#hen-overlay.active').waitFor({ state: 'visible', timeout: 15000 });
      assert(new URL(page.url()).pathname === '/hen/', 'legacy NFT route must still activate HEN');
      await page.goto(`${baseUrl}/hen/`, { waitUntil: 'domcontentloaded' });
      await page.locator('#hen-overlay.active').waitFor({ state: 'visible', timeout: 15000 });
      assert(await page.locator('body').getAttribute('data-hen-standalone') === 'true', 'direct HEN must retain its dedicated lightweight page');

      await page.goto(`${baseUrl}/anthology/?theme=${theme}`, { waitUntil: 'domcontentloaded' });
      await page.locator('#protocol-history-chamber-modal.active .protocol-anthology-library').waitFor({ state: 'visible', timeout: 15000 });
      const story = page.locator('#protocol-history-chamber-modal [data-protocol-open]').first();
      const storyPath = await story.getAttribute('href');
      assert(await page.evaluate(() => Boolean(document.getElementById('protocol-anthology-css')?.sheet)), 'library must wait for its stylesheet');
      await capture('anthology');
      await story.click();
      await page.locator('#protocol-history-modal').waitFor({ state: 'visible' });
      await page.goto(new URL(storyPath, baseUrl).href, { waitUntil: 'domcontentloaded' });
      await page.locator('#protocol-history-modal').waitFor({ state: 'visible', timeout: 15000 });
      const storyGeometry = await page.evaluate(() => ({
        styled: Boolean(document.getElementById('protocol-anthology-css')?.sheet),
        overflow: document.documentElement.scrollWidth - innerWidth
      }));
      assert(storyGeometry.styled && storyGeometry.overflow <= 1, `direct chapter lost its styles or viewport fit: ${JSON.stringify(storyGeometry)}`);
      await capture('story');
      await context.close();
      assert(issues.length === 0, `optional startup browser issues:\n${issues.join('\n')}`);
    }

    // Retry failed imports/styles and reject a late HEN activation after navigation.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await installFeatureMocks(context);
    const page = await context.newPage();
    let changelogAttempts = 0;
    let henAttempts = 0;
    let styleAttempts = 0;
    let releaseHen;
    const henGate = new Promise(resolve => { releaseHen = resolve; });
    await page.route('**/js/features/changelog.js*', route => ++changelogAttempts === 1
      ? route.fulfill({ status: 503, contentType: 'text/javascript', body: '' }) : route.continue());
    await page.route('**/js/features/hen-mode.js*', async route => {
      if (++henAttempts === 1) return route.fulfill({ status: 503, contentType: 'text/javascript', body: '' });
      await henGate;
      return route.continue();
    });
    await page.route('**/css/protocol-anthology.min.css*', route => ++styleAttempts === 1
      ? route.fulfill({ status: 503, contentType: 'text/css', body: '' }) : route.continue());
    await page.goto(`${baseUrl}/?theme=clean`, { waitUntil: 'load' });
    await openDropdown(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#changelog-btn').click();
    await page.waitForFunction(() => document.getElementById('changelog-btn')?.title.includes('unavailable'));
    await ensureDropdownOpen(page, '#settings-gear', '#settings-dropdown');
    await page.locator('#changelog-btn').click();
    await page.locator('#changelog-modal[aria-hidden="false"]').waitFor({ state: 'visible' });
    assert(changelogAttempts === 2, `archive import should recover in one retry: ${changelogAttempts}`);
    await page.locator('.changelog-modal-close').click();
    await page.locator('#corner-gift-toggle').click();
    await page.locator('#hen-launcher').click();
    await page.waitForFunction(() => document.getElementById('hen-launcher')?.title.includes('unavailable'));
    const henRequested = page.waitForRequest('**/js/features/hen-mode.js*');
    await page.locator('#hen-launcher').click();
    await henRequested;
    await page.locator('#header-protocol-chip').click();
    await page.waitForFunction(() => !document.getElementById('protocol-anthology-css'));
    releaseHen();
    await page.waitForFunction(() => Boolean(window.HenMode) && !document.getElementById('hen-launcher')?.hasAttribute('aria-busy'));
    assert(await page.locator('#hen-overlay').evaluate(node => !node.classList.contains('active')), 'late HEN download must not replace the newly selected route');
    await page.locator('#header-protocol-chip').click();
    await page.locator('#protocol-history-chamber-modal.active .protocol-anthology-library').waitFor({ state: 'visible' });
    assert(styleAttempts === 2, `Anthology CSS should recover in one retry: ${styleAttempts}`);
    assert(henAttempts === 2, `HEN must share its successful retry: ${henAttempts}`);
    await context.close();
    log('ok - optional startup deferral, cancellation, retries, retained archive, HEN routes, and styled Anthology chapters');
  }

  async function smokeHenStandalone(browser, baseUrl) {
    for (const width of [1440, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      await installFeatureMocks(context);
      // Reproduce the real CDN refusal; recovery must use the original IPFS asset.
      let deniedImages = 0;
      await context.route('https://assets.objkt.media/file/assets-003/**', route => {
        deniedImages++;
        return route.fulfill({ status: 403, contentType: 'text/html', body: 'Artwork CDN unavailable' });
      });
      await context.addInitScript(address => {
        localStorage.setItem('tezos-systems-my-baker-address', address);
      }, SAMPLE_ADDRESS_2);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/hen/`, { waitUntil: 'domcontentloaded' });
      await page.locator('#hen-profile-toggle').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() => {
        const image = document.querySelector('.hen-card img[data-hen-raw-uri="ipfs://smoke-hen-image"]');
        return image?.naturalWidth > 0 && image.currentSrc.includes('gateway.pinata.cloud');
      }, null, { timeout: 5000 });
      assert(deniedImages > 0, 'HEN fallback test must exercise a failed CDN');
      const geometry = await page.evaluate(() => {
        const rect = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
        };
        return {
          lore: rect('#hen-lore-line'), close: rect('.hen-close'), tabs: rect('.hen-source-tabs'),
          feed: rect('.hen-feed'), grid: rect('#hen-grid'), profile: rect('#hen-profile-panel'),
          collapsed: document.querySelector('#hen-profile-body').hidden,
          css: Array.from(document.styleSheets).map(sheet => sheet.href || '')
        };
      });
      assert(!geometry.css.some(url => /shell-extras|styles\.min/.test(url)), 'Direct HEN must work without dashboard styles');
      assert(geometry.collapsed && geometry.grid.top < 450, `HEN ${width}: saved profile pushes art off screen: ${JSON.stringify(geometry)}`);
      assert(geometry.lore.top >= geometry.close.bottom - 1 && geometry.lore.top >= geometry.tabs.bottom - 1, `HEN ${width}: lore crowds header controls: ${JSON.stringify(geometry)}`);
      for (const key of ['lore', 'close', 'tabs', 'feed', 'profile']) {
        assert(geometry[key].left >= -1 && geometry[key].right <= width + 1, `HEN ${width}: ${key} escapes viewport: ${JSON.stringify(geometry)}`);
      }
      if (ARTIFACTS_DIR) await page.screenshot({ path: path.join(ARTIFACTS_DIR, `hen-standalone-${width}.png`) });
      await page.locator('#hen-profile-toggle').click();
      await page.locator('#hen-profile-body').waitFor({ state: 'visible' });
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.hen-profile-recent-item img, img.hen-profile-row-logo')).every(img => img.naturalWidth > 0), null, { timeout: 5000 });
      const thumbs = await page.locator('.hen-profile-recent-item img').evaluateAll(imgs => imgs.map(img => img.getBoundingClientRect().height));
      assert(thumbs.length > 0 && thumbs.every(height => height <= 128), `HEN ${width}: collector thumbnails grow without bounds: ${thumbs}`);
      await page.locator('#hen-profile-refresh').click();
      await page.locator('#hen-profile-toggle[aria-expanded="true"]').waitFor({ state: 'visible' });
      await page.locator('#hen-profile-toggle').click();
      await page.locator('#hen-lore-line button').click();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#hen-profile-toggle').waitFor({ state: 'visible' });
      assert(await page.locator('#hen-lore-line').count() === 0, 'HEN lore dismissal persists on direct reload');
      if (width < 600) {
        await page.locator('#hen-mobile-filter-toggle').click();
        await page.locator('#hen-wallet-input').waitFor({ state: 'visible' });
        const overflow = await page.locator('#hen-status-strip').evaluate(node => node.scrollWidth - node.clientWidth);
        assert(overflow <= 1, `HEN ${width}: expanded filters overflow by ${overflow}px`);
        await page.locator('#hen-mobile-filter-toggle').click();
      }
      await page.locator('.hen-close').click();
      await page.waitForURL(`${baseUrl}/`);
      await context.close();
    }
  }

  async function smokeHenMode(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    await installOctezConnectMock(context);
    await context.addInitScript((address) => {
      window.__HEN_IMAGE_RETRY_DELAYS__ = [50, 100];
      localStorage.setItem('tezos-systems-my-baker-address', address);
      localStorage.setItem('tezos-systems-saved-addresses', JSON.stringify([{ address, label: null, addedAt: Date.now() }]));
    }, SAMPLE_ADDRESS_2);
    const page = await context.newPage();
    attachIssueCollectors(page, 'HEN mode', issues);

    const response = await page.goto(`${baseUrl}/?hen=1`, { waitUntil: 'load' });
    assert(response?.ok(), `HEN mode: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('#hen-overlay.active').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => location.pathname === '/hen/' && !new URLSearchParams(location.search).has('hen'), null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll('.hen-card-source')).map((el) => el.textContent?.trim());
      return labels.includes('TEIA') && labels.includes('OBJKT');
    }, null, { timeout: 10000 });
    await expectClassContains(page.locator('.hen-source-tab[data-hen-mode="all"]'), 'active', 'HEN mode all source tab');
    const initialStatus = await page.locator('#hen-status-strip').innerText();
    assert(initialStatus.includes('Teia + OBJKT'), `HEN mode status did not start mixed: ${initialStatus}`);
    await page.locator('#hen-filterbar').waitFor({ state: 'visible', timeout: 5000 });
    const initialUiState = await page.evaluate(() => ({
      walletStatus: document.querySelector('#hen-wallet-status')?.textContent || '',
      searchVisible: Boolean(document.querySelector('#hen-search-input')?.offsetParent),
      listedButton: document.querySelector('#hen-filter-listed')?.getAttribute('aria-pressed') || '',
      visibleGroupLabels: Array.from(document.querySelectorAll('.hen-filter-group-label'))
        .filter((label) => Boolean(label.offsetParent))
        .map((label) => label.textContent?.trim().toLowerCase())
    }));
    assert((/connect to flag pieces you own/i.test(initialUiState.walletStatus) || /\.tez|tz1/i.test(initialUiState.walletStatus)) && initialUiState.searchVisible && initialUiState.listedButton === 'false', `HEN mode filter/wallet controls missing initial affordances: ${JSON.stringify(initialUiState)}`);
    assert(['source', 'price ꜩ', 'edition', 'sort'].every((label) => initialUiState.visibleGroupLabels.includes(label)), `HEN mode filter groups are not visibly labelled: ${JSON.stringify(initialUiState.visibleGroupLabels)}`);
    await page.locator('#hen-profile-toggle').waitFor({ state: 'visible', timeout: 15000 });
    assert(await page.locator('#hen-profile-toggle').getAttribute('aria-expanded') === 'false', 'HEN saved profile starts compact');
    await page.locator('#hen-profile-toggle').click();
    try {
      await page.waitForFunction((address) => {
        const inputValue = document.querySelector('#hen-wallet-input')?.value || '';
        const profileText = (document.querySelector('#hen-profile-panel')?.innerText || '').toLowerCase();
        return (inputValue === address || /\.tez$/i.test(inputValue)) && profileText.includes('owned nfts') && profileText.includes('created nfts');
      }, SAMPLE_ADDRESS_2, { timeout: 15000 });
    } catch (error) {
      const state = await page.evaluate(() => ({
        inputValue: document.querySelector('#hen-wallet-input')?.value || '',
        status: document.querySelector('#hen-status-strip')?.innerText || '',
        profileText: document.querySelector('#hen-profile-panel')?.innerText || '',
        profileHidden: document.querySelector('#hen-profile-panel')?.hidden ?? null,
        storageProfile: localStorage.getItem('tezos-systems-my-baker-address') || '',
        storageViewer: localStorage.getItem('tezos-systems-hen-viewer-address') || ''
      }));
      throw new Error(`HEN mode saved My Tezos profile did not render: ${JSON.stringify(state)}\n${error.message}`);
    }
    try {
      await page.waitForFunction(() => {
        const img = document.querySelector('.hen-card img[data-hen-raw-uri="ipfs://smoke-hen-image"]');
        return Boolean(img && img.naturalWidth > 0 && (
          img.currentSrc.includes('assets.objkt.media/file/assets-003/')
          || img.currentSrc.includes('hen_retry=')
        ));
      }, null, { timeout: 5000 });
    } catch (error) {
      const state = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('.hen-card img')).map((img) => ({
          raw: img.dataset.henRawUri || '',
          src: img.getAttribute('src') || '',
          currentSrc: img.currentSrc || '',
          naturalWidth: img.naturalWidth,
          complete: img.complete,
          retryAttempt: img.dataset.henRetryAttempt || '',
          retryWaiting: img.dataset.henRetryWaiting || '',
          className: img.className || ''
        }));
        return {
          imgs,
          cards: Array.from(document.querySelectorAll('.hen-card-title')).map((el) => el.textContent?.trim() || '')
        };
      });
      throw new Error(`HEN mode CDN-first image load or retry fallback did not recover: ${JSON.stringify(state)}\n${error.message}`);
    }

    async function enterHenCommand(command) {
      await page.locator('#hen-cli-input').fill(command);
      await page.locator('#hen-cli-input').press('Enter');
    }

    async function waitForSources(expectedLabels) {
      await page.waitForFunction((labels) => {
        const actual = Array.from(document.querySelectorAll('.hen-card-source')).map((el) => el.textContent?.trim());
        return actual.length > 0 && labels.every((label) => actual.includes(label)) && actual.every((label) => labels.includes(label));
      }, expectedLabels, { timeout: 10000 });
    }

    const stableShell = await page.evaluate(() => {
      const overlay = document.querySelector('#hen-overlay');
      const strip = document.querySelector('#hen-status-strip');
      const filterbar = document.querySelector('#hen-filterbar');
      const nowLine = document.querySelector('#hen-now-line');
      const header = document.querySelector('.hen-header');
      const feed = document.querySelector('.hen-feed');
      const grid = document.querySelector('#hen-grid');
      const firstSource = document.querySelector('#hen-grid .hen-card-source');
      const firstInfo = document.querySelector('#hen-grid .hen-card-info');
      const expanded = document.querySelector('#hen-expanded');
      const cards = Array.from(document.querySelectorAll('#hen-grid .hen-card'));
      const viewport = window.innerWidth;
      const bounds = (node) => {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      return {
        overlayDisplay: getComputedStyle(overlay).display,
        overlayRows: getComputedStyle(overlay).gridTemplateRows,
        statusHeight: Math.round(strip.getBoundingClientRect().height),
        filterWrap: getComputedStyle(filterbar).flexWrap,
        filterMask: getComputedStyle(filterbar).webkitMaskImage || getComputedStyle(filterbar).maskImage || '',
        expandedZ: Number(getComputedStyle(expanded).zIndex || 0),
        nowLineVisible: Boolean(nowLine && nowLine.getBoundingClientRect().height > 0),
        header: bounds(header),
        strip: bounds(strip),
        feed: bounds(feed),
        grid: bounds(grid),
        firstSource: bounds(firstSource),
        firstInfo: bounds(firstInfo),
        viewport,
        teiaClass: cards.some((card) => card.classList.contains('hen-card-platform-teia')),
        objktClass: cards.some((card) => card.classList.contains('hen-card-platform-objkt'))
      };
    });
    assert(stableShell.overlayDisplay === 'grid' && stableShell.overlayRows.split(' ').length >= 4, `HEN mode shell should use stable grid rows: ${JSON.stringify(stableShell)}`);
    assert(stableShell.statusHeight <= 46 && stableShell.filterWrap === 'nowrap' && stableShell.filterMask !== 'none' && stableShell.nowLineVisible, `HEN mode fixed status/now-line/filter-fade contract failed: ${JSON.stringify(stableShell)}`);
    assert(stableShell.expandedZ > 10006, `HEN mode expanded view should sit above live chrome: ${JSON.stringify(stableShell)}`);
    for (const [name, box] of Object.entries({ header: stableShell.header, strip: stableShell.strip, feed: stableShell.feed, grid: stableShell.grid, firstSource: stableShell.firstSource, firstInfo: stableShell.firstInfo })) {
      assert(box && box.left >= -0.5 && box.right <= stableShell.viewport + 0.5, `HEN mode ${name} should stay inside viewport edges: ${JSON.stringify(stableShell)}`);
    }
    assert(stableShell.teiaClass && stableShell.objktClass, `HEN mode platform identity classes missing: ${JSON.stringify(stableShell)}`);

    assert(await page.locator('#hen-loop-hint').count() === 0, 'HEN should not cover a saved collector with the connect hint');
    await page.evaluate(async () => { await document.fonts.ready; });

    const gridTopBeforeCli = await page.locator('#hen-grid').evaluate((node) => node.getBoundingClientRect().top);
    await enterHenCommand('filters');
    await page.locator('#hen-cli-output.visible').waitFor({ state: 'visible', timeout: 5000 });
    const cliChrome = await page.evaluate(() => {
      const output = document.querySelector('#hen-cli-output');
      return {
        parent: output?.parentElement?.id || '',
        position: output ? getComputedStyle(output).position : '',
        feedContainsOutput: Boolean(document.querySelector('.hen-feed #hen-cli-output')),
        text: output?.innerText || ''
      };
    });
    const gridTopAfterCli = await page.locator('#hen-grid').evaluate((node) => node.getBoundingClientRect().top);
    assert(Math.abs(gridTopAfterCli - gridTopBeforeCli) <= 1, `HEN mode CLI output shifted grid from ${gridTopBeforeCli} to ${gridTopAfterCli}`);
    assert(cliChrome.parent === 'hen-overlay' && cliChrome.position === 'absolute' && !cliChrome.feedContainsOutput && /filters/i.test(cliChrome.text), `HEN mode CLI output must be off-flow scrollback: ${JSON.stringify(cliChrome)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#hen-cli-output')?.classList.contains('visible'), null, { timeout: 5000 });
    await enterHenCommand('help');
    await page.locator('#hen-cli-output.visible').waitFor({ state: 'visible', timeout: 5000 });
    const cliAfterDismiss = await page.locator('#hen-cli-output').innerText();
    assert(/commands/.test(cliAfterDismiss) && !/source:/.test(cliAfterDismiss), `HEN mode dismissed CLI output replayed old scrollback: ${cliAfterDismiss}`);
    await page.keyboard.press('Escape');
    await enterHenCommand('artist not-a-wallet');
    await page.locator('#hen-cli-output.visible').waitFor({ state: 'visible', timeout: 5000 });
    const invalidArtistOutput = await page.locator('#hen-cli-output').innerText();
    assert(/invalid artist address/.test(invalidArtistOutput), `HEN mode artist command should reject invalid addresses: ${invalidArtistOutput}`);
    await page.keyboard.press('Escape');

    await enterHenCommand(`wallet ${SAMPLE_ADDRESS}`);
    await page.locator('.hen-card-owned-badge').first().waitFor({ state: 'visible', timeout: 10000 });
    const walletStatus = await page.locator('#hen-status-strip').innerText();
    assert(walletStatus.includes('wallet tz1aW...T1Z9') || /wallet [\w.-]+\.tez/i.test(walletStatus), `HEN mode wallet status missing saved wallet: ${walletStatus}`);
    await page.locator('#hen-filter-hide-owned').click();
    await page.waitForFunction(() => {
      const titles = Array.from(document.querySelectorAll('.hen-card-title')).map((el) => el.textContent || '');
      return titles.length > 0 && titles.every((title) => !/Teia Smoke Mint/.test(title));
    }, null, { timeout: 10000 });
    await page.locator('#hen-filter-hide-owned').click();
    await page.waitForFunction(() => {
      const titles = Array.from(document.querySelectorAll('.hen-card-title')).map((el) => el.textContent || '');
      return titles.some((title) => /Teia Smoke Mint/.test(title));
    }, null, { timeout: 10000 });
    const myTezosSync = await page.evaluate((address) => ({
      savedProfile: localStorage.getItem('tezos-systems-my-baker-address') || '',
      savedHistory: JSON.parse(localStorage.getItem('tezos-systems-saved-addresses') || '[]').map((item) => item.address),
      drawerInput: document.querySelector('#drawer-address-input')?.value || '',
      mainInput: document.querySelector('#my-baker-input')?.value || ''
    }), SAMPLE_ADDRESS);
    assert(myTezosSync.savedProfile === SAMPLE_ADDRESS, `HEN mode wallet command did not sync My Tezos profile: ${JSON.stringify(myTezosSync)}`);
    assert(myTezosSync.savedHistory[0] === SAMPLE_ADDRESS, `HEN mode wallet command did not save address history: ${JSON.stringify(myTezosSync)}`);
    assert(myTezosSync.drawerInput === SAMPLE_ADDRESS && myTezosSync.mainInput === SAMPLE_ADDRESS, `HEN mode wallet command did not update My Tezos inputs: ${JSON.stringify(myTezosSync)}`);

    await page.locator('#hen-wallet-connect').click();
    await page.waitForFunction((address) => localStorage.getItem('tezos-systems-octez-wallet-address') === address, SAMPLE_ADDRESS, { timeout: 10000 });
    const walletConnectSync = await page.evaluate(() => ({
      savedWallet: localStorage.getItem('tezos-systems-octez-wallet-address') || '',
      savedProfile: localStorage.getItem('tezos-systems-my-baker-address') || '',
      profileText: document.querySelector('#hen-profile-panel')?.innerText || ''
    }));
    assert(walletConnectSync.savedWallet === SAMPLE_ADDRESS && walletConnectSync.savedProfile === SAMPLE_ADDRESS, `HEN mode wallet connect did not sync identity: ${JSON.stringify(walletConnectSync)}`);
    assert(/Owned NFTs/i.test(walletConnectSync.profileText) && /Marketplace|Spent|Sales/i.test(walletConnectSync.profileText), `HEN mode collector stats missing useful profile data: ${walletConnectSync.profileText}`);

    await page.locator('.hen-card-favorite').first().click();
    await page.locator('#hen-filter-saved').click();
    await page.waitForFunction(() => document.querySelectorAll('#hen-grid .hen-card').length === 1, null, { timeout: 10000 });
    await expectClassContains(page.locator('#hen-filter-saved'), 'active', 'HEN mode saved filter button');
    await page.locator('#hen-filter-saved').click();
    await page.waitForFunction(() => document.querySelectorAll('#hen-grid .hen-card').length >= 2, null, { timeout: 10000 });

    await page.locator('[data-hen-price="5000000"]').click();
    await expectClassContains(page.locator('[data-hen-price="5000000"]'), 'active', 'HEN mode price chip');
    const chipPriceStatus = await page.locator('#hen-status-strip').innerText();
    assert(chipPriceStatus.includes('price <= 5.0 ꜩ'), `HEN mode price chip status missing: ${chipPriceStatus}`);
    await page.locator('[data-hen-price="any"]').click();

    await page.locator('[data-hen-sort="cheapest"]').click();
    await expectClassContains(page.locator('[data-hen-sort="cheapest"]'), 'active', 'HEN mode cheapest sort chip');
    const savedSort = await page.evaluate(() => localStorage.getItem('tezos-systems-hen-sort'));
    assert(savedSort === 'cheapest', `HEN mode did not persist visible sort selection: ${savedSort}`);
    await page.locator('[data-hen-sort="newest"]').click();

    await page.locator('#hen-search-input').fill('OBJKT');
    await page.waitForFunction(() => {
      const titles = Array.from(document.querySelectorAll('.hen-card-title')).map((el) => el.textContent || '');
      return titles.length > 0 && titles.every((title) => /OBJKT/.test(title));
    }, null, { timeout: 10000 });
    await page.locator('#hen-search-input').fill('');
    await page.locator('#hen-search-input').press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#hen-grid .hen-card').length >= 2, null, { timeout: 10000 });

    await page.locator('#hen-grid .hen-card').first().click();
    await page.locator('#hen-expanded.active .hen-expanded-collect').waitFor({ state: 'visible', timeout: 10000 });
    const firstTitleBeforeModalKeys = await page.locator('#hen-grid .hen-card-title').first().innerText();
    const expandedState = await page.evaluate(() => ({
      collect: document.querySelector('.hen-expanded-collect')?.textContent || '',
      market: document.querySelector('.hen-expanded-market')?.innerText || '',
      creator: document.querySelector('#hen-expanded-creator-mini')?.innerText || '',
      role: document.querySelector('#hen-expanded')?.getAttribute('role') || '',
      modal: document.querySelector('#hen-expanded')?.getAttribute('aria-modal') || ''
    }));
    assert(/collect on|view on/i.test(expandedState.collect) && /owners|available|editions/i.test(expandedState.market) && expandedState.role === 'dialog' && expandedState.modal === 'true', `HEN mode expanded decision screen incomplete: ${JSON.stringify(expandedState)}`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('r');
    await page.waitForTimeout(350);
    const expandedKeyGuard = await page.evaluate(() => ({
      active: document.querySelector('#hen-expanded')?.classList.contains('active') || false,
      firstTitle: document.querySelector('#hen-grid .hen-card-title')?.textContent || '',
      cliText: document.querySelector('#hen-cli-output')?.innerText || ''
    }));
    assert(expandedKeyGuard.active && expandedKeyGuard.firstTitle === firstTitleBeforeModalKeys && !/dug up offset/.test(expandedKeyGuard.cliText), `HEN mode background keys fired behind expanded view: ${JSON.stringify(expandedKeyGuard)}`);
    await page.keyboard.press('Escape');

    await enterHenCommand('price 2');
    await waitForSources(['TEIA']);
    const priceStatus = await page.locator('#hen-status-strip').innerText();
    assert(priceStatus.includes('price <= 2.0 ꜩ'), `HEN mode price filter status missing: ${priceStatus}`);

    await enterHenCommand('reset');
    await page.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll('.hen-card-source')).map((el) => el.textContent?.trim());
      return labels.includes('TEIA') && labels.includes('OBJKT');
    }, null, { timeout: 10000 });

    await enterHenCommand('editions 4');
    await waitForSources(['OBJKT']);
    const editionStatus = await page.locator('#hen-status-strip').innerText();
    assert(editionStatus.includes('editions <= 4'), `HEN mode edition filter status missing: ${editionStatus}`);

    await enterHenCommand('reset');
    await page.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll('.hen-card-source')).map((el) => el.textContent?.trim());
      return labels.includes('TEIA') && labels.includes('OBJKT');
    }, null, { timeout: 10000 });

    await enterHenCommand('teia');
    await waitForSources(['TEIA']);
    await expectClassContains(page.locator('.hen-source-tab[data-hen-mode="teia"]'), 'active', 'HEN mode Teia source tab');
    const savedSource = await page.evaluate(() => localStorage.getItem('tezos-systems-hen-source'));
    assert(savedSource === 'teia', `HEN mode did not persist CLI source selection: ${savedSource}`);

    await page.goto(`${baseUrl}/?hen=1`, { waitUntil: 'load' });
    await page.locator('#hen-overlay.active').waitFor({ state: 'visible', timeout: 15000 });
    await waitForSources(['TEIA']);
    await expectClassContains(page.locator('.hen-source-tab[data-hen-mode="teia"]'), 'active', 'HEN mode saved Teia source tab');

    await enterHenCommand('objkt');
    await waitForSources(['OBJKT']);
    await expectClassContains(page.locator('.hen-source-tab[data-hen-mode="objkt"]'), 'active', 'HEN mode OBJKT source tab');

    await enterHenCommand('all');
    await page.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll('.hen-card-source')).map((el) => el.textContent?.trim());
      return labels.includes('TEIA') && labels.includes('OBJKT');
    }, null, { timeout: 10000 });
        await page.waitForFunction(() => {
          const firstCard = document.querySelector('#hen-grid .hen-card');
          const pulse = document.querySelector('#hen-mint-pulse');
          return firstCard?.querySelector('.hen-card-title')?.textContent?.includes('Fresh Teia Smoke Mint')
            && firstCard.classList.contains('hen-card-fresh')
            && firstCard.querySelector('.hen-card-source')?.textContent?.trim() === 'TEIA'
            && (!pulse || (pulse.parentElement?.id === 'hen-overlay' && getComputedStyle(pulse).position === 'absolute'));
        }, null, { timeout: 20000 });
    await page.locator('.hen-close').click();
    await page.waitForFunction(() => {
      const overlayClosed = !document.querySelector('#hen-overlay')?.classList.contains('active');
      const dashboardVisible = Boolean(document.querySelector('main')?.offsetParent);
      return overlayClosed
        && !document.body.classList.contains('hen-active')
        && !document.getElementById('hen-initial-blackout')
        && dashboardVisible
        && window.location.pathname === '/'
        && window.location.search === '';
    }, null, { timeout: 5000 });

    await context.close();
    const unexpectedIssues = issues.filter((issue) => !/smoke-hen-image/i.test(issue));
    assert(unexpectedIssues.length === 0, `HEN mode browser issues:\n${unexpectedIssues.join('\n')}`);

    const timeoutContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(timeoutContext);
    await installOctezConnectMock(timeoutContext, SAMPLE_ADDRESS, { hangPermissions: true });
    await timeoutContext.addInitScript(() => {
      window.__HEN_IMAGE_RETRY_DELAYS__ = [50, 100];
      window.__TEZOS_WALLET_CONNECT_TIMEOUT_MS__ = 80;
    });
    const timeoutPage = await timeoutContext.newPage();
    const timeoutResponse = await timeoutPage.goto(`${baseUrl}/?hen=1`, { waitUntil: 'domcontentloaded' });
    assert(timeoutResponse?.ok(), `HEN mode timeout route failed with HTTP ${timeoutResponse?.status()}`);
    await timeoutPage.locator('#hen-overlay.active').waitFor({ state: 'visible', timeout: 15000 });
    await timeoutPage.locator('#hen-wallet-connect').click();
    await timeoutPage.waitForFunction(() => {
      const button = document.querySelector('#hen-wallet-connect');
      const cliText = document.querySelector('#hen-cli-output')?.innerText || '';
      return button && !button.disabled && button.textContent.trim() === 'connect' && /timed out/i.test(cliText);
    }, null, { timeout: 5000 });
    await timeoutContext.close();

    log('ok - HEN mode smoke');
  }

  return { smokeOptionalStartup, smokeHenStandalone, smokeHenMode };
}
