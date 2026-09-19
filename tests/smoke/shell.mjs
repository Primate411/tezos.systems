// Browser workflows owned by shell. Shared dependencies remain explicit.
export function createShellSmokeSuites({
  ARTIFACTS_DIR,
  assert,
  attachIssueCollectors,
  createServer,
  fulfillJson,
  installFeatureMocks,
  log,
  path,
  sampleDomainHistoryRows,
  sampleHistoryRows
}) {
  async function smokeAppShell(browser, baseUrl) {
    const issues = [];
    const mockHistorySources = async (targetContext) => {
      for (const table of ['market_history', 'network_health_history', 'tezosx_history', 'governance_period_history']) {
        await targetContext.route(`https://iijpfczftroespicmufb.supabase.co/rest/v1/${table}**`, (route) => (
          fulfillJson(route, sampleDomainHistoryRows(table))
        ));
      }
      await targetContext.route('https://iijpfczftroespicmufb.supabase.co/rest/v1/tezos_history**', (route) => (
        fulfillJson(route, sampleHistoryRows())
      ));
    };
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'allow'
    });
    await installFeatureMocks(context);
    await mockHistorySources(context);
    await context.route('https://api.github.com/repos/Primate411/tezos.systems/commits/main', (route) => fulfillJson(route, {
      sha: 'cafebabecafebabecafebabecafebabecafebabe',
      html_url: 'https://github.com/Primate411/tezos.systems/commit/cafebabe',
      commit: { committer: { date: '2026-06-07T00:00:00Z' } }
    }));
    await context.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const page = await context.newPage();
    attachIssueCollectors(page, 'app shell', issues);

    const response = await page.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `app shell: dashboard failed with HTTP ${response?.status()}`);
    await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-footer-delegate]').waitFor({ state: 'attached', timeout: 15000 });

    const shell = await page.evaluate(async () => {
      const fetchText = async (pathname) => {
        const response = await fetch(pathname, { cache: 'no-store' });
        return {
          pathname,
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get('content-type') || '',
          text: response.ok ? await response.text() : ''
        };
      };
      const fetchJson = async (pathname) => {
        const result = await fetchText(pathname);
        let json = null;
        let parseError = '';
        if (result.ok) {
          try {
            json = JSON.parse(result.text);
          } catch (error) {
            parseError = error.message;
          }
        }
        return { ...result, json, parseError };
      };

      const sw = await fetchText('/sw.js');
      const version = await fetchJson('/version.json');
      const manifest = await fetchJson('/site.webmanifest');
      const robots = await fetchText('/robots.txt');
      const sitemap = await fetchText('/sitemap.xml');
      const license = await fetchText('/LICENSE');
      const aiPlugin = await fetchJson('/.well-known/ai-plugin.json');
      const openApi = await fetchJson('/.well-known/openapi.json');
      const llms = await fetchText('/llms.txt');
      const shellAssetsBlock = sw.text.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/)?.[1] || '';
      const shellAssets = Array.from(new Set(
        Array.from(shellAssetsBlock.matchAll(/['"]((?:\/|\.\.?\/)[^'"]+)['"]/g))
          .map((match) => match[1])
          .filter((asset) => asset.startsWith('/') && !asset.includes('*'))
      )).sort();

      const assetResults = [];
      for (const asset of shellAssets) {
        const assetResponse = await fetch(asset, { cache: 'no-store' });
        assetResults.push({
          asset,
          ok: assetResponse.ok,
          status: assetResponse.status,
          contentType: assetResponse.headers.get('content-type') || ''
        });
      }

      const iconResults = [];
      for (const icon of manifest.json?.icons || []) {
        const iconResponse = await fetch(icon.src, { cache: 'no-store' });
        iconResults.push({ src: icon.src, ok: iconResponse.ok, status: iconResponse.status });
      }

      const stylesheet = document.querySelector('link[rel="stylesheet"][href^="css/styles.min.css"]')?.getAttribute('href') || '';
      const appScript = document.querySelector('script[type="module"][src^="js/core/app.js"]')?.getAttribute('src') || '';
      const appPreload = document.querySelector('link[rel="modulepreload"][href^="js/core/app.js"]')?.getAttribute('href') || '';
      const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '';
      const cacheVersion = sw.text.match(/CACHE_NAME\s*=\s*['"]tezos-systems-v(\d+)['"]/)?.[1] || '';
      const cssVersion = stylesheet.match(/\?v=(\d+)/)?.[1] || '';
      const appScriptVersion = appScript.match(/\?v=(\d+)/)?.[1] || '';
      const appPreloadVersion = appPreload.match(/\?v=(\d+)/)?.[1] || '';
      const buildVersionText = document.querySelector('#build-version')?.textContent?.trim() || '';
      const buildVersionTitle = document.querySelector('#build-version')?.getAttribute('title') || '';
      const footerBuilderHtml = document.querySelector('.powered-by')?.innerHTML || '';
      const footerLinksHtml = document.querySelector('.footer-contribute')?.innerHTML || '';
      const footer = document.querySelector('#site-footer');
      const footerAttribution = footer?.querySelector('.site-footer-inner');
      const footerBuild = footer?.querySelector('.build-version');
      const footerSource = footer?.querySelector('.footer-source-line');
      const footerRows = footer ? [
        footer.querySelector('.powered-by'),
        footer.querySelector('.footer-baker-support'),
        footer.querySelector('.footer-contribute'),
        footer.querySelector('.footer-source-line'),
        footer.querySelector('.build-version')
      ] : [];
      const handoff = footer?.previousElementSibling?.matches('[data-site-handoff]')
        ? footer.previousElementSibling
        : null;
      const footerRect = footer?.getBoundingClientRect();
      const buildRect = footerBuild?.getBoundingClientRect();
      const sourceRect = footerSource?.getBoundingClientRect();
      const footerRowRects = footerRows.map((row) => row?.getBoundingClientRect()).filter(Boolean);
      const footerRowGaps = footerRowRects.slice(1).map((rect, index) => rect.top - footerRowRects[index].bottom);
      const handoffRect = handoff?.getBoundingClientRect();

      return {
        appPreload,
        appPreloadVersion,
        appScript,
        appScriptVersion,
        aiPlugin,
        assetResults,
        buildVersionText,
        buildVersionTitle,
        cacheVersion,
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
        csp,
        cssVersion,
        faviconCount: document.querySelectorAll('link[rel="icon"]').length,
        faviconHrefs: Array.from(document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]')).map((link) => link.getAttribute('href') || ''),
        footerAffiliationHref: document.querySelector('.powered-by a[href="https://tez.capital"]')?.getAttribute('href') || '',
        footerBuilderHref: document.querySelector('.powered-by a[href="https://x.com/BakingBenjamins"]')?.getAttribute('href') || '',
        footerBuilderHtml,
        footerBuilderText: document.querySelector('.powered-by')?.textContent?.trim() || '',
        footerBakerSupportText: document.querySelector('.footer-baker-support')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        footerBakingBenjaminsHref: document.querySelector('.footer-baker-support a[href="/#my-baker=bakingbenjamins.tez"]')?.getAttribute('href') || '',
        footerBakingHref: document.querySelector('.footer-baker-support a[href="/#my-baker=baking.tez"]')?.getAttribute('href') || '',
        footerDelegateButtonText: document.querySelector('[data-footer-delegate]')?.textContent?.trim() || '',
        footerLicenseHref: document.querySelector('.footer-contribute a[href="/LICENSE"][rel~="license"]')?.getAttribute('href') || '',
        footerRpcHref: document.querySelector('.footer-source-line a[href="https://eu.rpc.tez.capital"]')?.getAttribute('href') || '',
        footerRpcText: document.querySelector('.footer-source-line')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        footerSourceHref: document.querySelector('.footer-contribute a[href="https://github.com/Primate411/tezos.systems"]')?.getAttribute('href') || '',
        footerLinksHtml,
        footerLayout: {
          display: footer ? getComputedStyle(footer).display : '',
          innerDisplay: footerAttribution ? getComputedStyle(footerAttribution).display : '',
          gapFromHandoff: footerRect && handoffRect ? footerRect.top - handoffRect.bottom : Number.NaN,
          height: footerRect?.height || 0,
          fiveRows: footerRowRects.length === 5 && footerRowRects.slice(1).every((rect, index) => rect.top > footerRowRects[index].bottom),
          maxCenterDelta: footerRect && footerRowRects.length === 5
            ? Math.max(...footerRowRects.map((rect) => Math.abs((rect.left + rect.width / 2) - (footerRect.left + footerRect.width / 2))))
            : Number.NaN,
          minRowGap: footerRowGaps.length ? Math.min(...footerRowGaps) : Number.NaN,
          pillOnBottom: sourceRect && buildRect
            ? buildRect.top > sourceRect.bottom
            : false,
          leadingMarker: footer?.querySelector('.footer-baker-support')
            ? getComputedStyle(footer.querySelector('.footer-baker-support'), '::before').content
            : '',
          overflow: footer ? footer.scrollWidth - footer.clientWidth : Number.NaN
        },
        iconResults,
        license,
        licenseMetaHref: document.querySelector('link[rel="license"]')?.getAttribute('href') || '',
        manifest,
        manifestHref: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '',
        llms,
        openApi,
        robots,
        sitemap,
        stylesheet,
        sw,
        version
      };
    });

    const swReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { ready: false, state: 'unsupported' };
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 10000));
      const registration = await Promise.race([navigator.serviceWorker.ready, timeout]);
      return {
        ready: Boolean(registration),
        active: registration?.active?.state || '',
        installing: registration?.installing?.state || '',
        waiting: registration?.waiting?.state || ''
      };
    });

    assert(shell.sw.ok, `app shell: /sw.js failed with HTTP ${shell.sw.status}`);
    assert(shell.version.ok && !shell.version.parseError, `app shell: /version.json invalid (${shell.version.status} ${shell.version.parseError})`);
    assert(Number.isInteger(shell.version.json?.build), `app shell: version.json build should be an integer, saw ${JSON.stringify(shell.version.json)}`);
    assert(/^[a-f0-9]{7,12}$/i.test(shell.version.json?.commit || ''), `app shell: version.json commit should be a short hash, saw ${shell.version.json?.commit}`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(shell.version.json?.date || ''), `app shell: version.json date should be yyyy-mm-dd, saw ${shell.version.json?.date}`);
    assert(shell.manifest.ok && !shell.manifest.parseError, `app shell: site.webmanifest invalid (${shell.manifest.status} ${shell.manifest.parseError})`);
    assert(shell.manifest.json?.name === 'Tezos Systems', `app shell: manifest name mismatch: ${shell.manifest.json?.name}`);
    assert((shell.manifest.json?.icons || []).length >= 4, 'app shell: manifest should expose standard and maskable icons');
    assert(shell.iconResults.every((icon) => icon.ok), `app shell: manifest icons failed: ${shell.iconResults.filter((icon) => !icon.ok).map((icon) => `${icon.src} ${icon.status}`).join(', ')}`);
    assert(shell.manifestHref === '/site.webmanifest', `app shell: manifest link mismatch: ${shell.manifestHref}`);
    assert(shell.faviconCount >= 3, `app shell: expected multiple favicon links, saw ${shell.faviconCount}`);
    assert(shell.faviconHrefs.every((href) => href.startsWith('/')), `app shell: favicon links must survive route rewrites: ${shell.faviconHrefs.join(', ')}`);
    assert(shell.canonical === 'https://tezos.systems/', `app shell: canonical URL mismatch: ${shell.canonical}`);
    assert(shell.license.ok && shell.license.text.startsWith('Mozilla Public License Version 2.0'), `app shell: /LICENSE missing or invalid (${shell.license.status})`);
    assert(shell.aiPlugin.ok
      && !shell.aiPlugin.parseError
      && shell.aiPlugin.json?.api?.url === 'https://tezos.systems/.well-known/openapi.json',
    `app shell: AI plugin discovery metadata is missing or invalid (${shell.aiPlugin.status} ${shell.aiPlugin.parseError})`);
    assert(shell.openApi.ok
      && !shell.openApi.parseError
      && /application\/json/i.test(shell.openApi.contentType)
      && shell.openApi.json?.openapi === '3.0.3'
      && Object.keys(shell.openApi.json?.paths || {}).length >= 20,
    `app shell: OpenAPI public-data catalogue is missing or invalid (${shell.openApi.status} ${shell.openApi.parseError})`);
    assert(shell.llms.ok
      && /text\/plain/i.test(shell.llms.contentType)
      && /## Canonical destinations/.test(shell.llms.text)
      && /## Public JSON data/.test(shell.llms.text)
      && !/%7B|%7D/.test(shell.llms.text),
    `app shell: llms.txt discovery surface is missing or publishes broken template links (${shell.llms.status})`);
    assert(shell.licenseMetaHref === '/LICENSE' && shell.footerLicenseHref === '/LICENSE', `app shell: MPL-2.0 metadata/footer links missing (${shell.licenseMetaHref}, ${shell.footerLicenseHref})`);
    assert(shell.footerSourceHref === 'https://github.com/Primate411/tezos.systems', `app shell: public source link mismatch: ${shell.footerSourceHref}`);
    assert(shell.footerBuilderHref === 'https://x.com/BakingBenjamins'
      && shell.footerAffiliationHref === 'https://tez.capital'
      && shell.footerBuilderText === 'Built by Primate — baker behind Baking Benjamins and co-founding member of Tez Capital',
    `app shell: Primate builder, Baking Benjamins baker identity, X link, and Tez Capital affiliation credit mismatch: ${JSON.stringify({ builderHref: shell.footerBuilderHref, affiliationHref: shell.footerAffiliationHref, text: shell.footerBuilderText })}`);
    assert(shell.footerBakerSupportText.startsWith('Support this work: delegate or stake to BakingBenjamins.tez or baking.tez')
      && shell.footerBakingBenjaminsHref === '/#my-baker=bakingbenjamins.tez'
      && shell.footerBakingHref === '/#my-baker=baking.tez',
    `app shell: Baking Benjamins delegate/stake support credit mismatch: ${JSON.stringify({ text: shell.footerBakerSupportText, bakingBenjamins: shell.footerBakingBenjaminsHref, baking: shell.footerBakingHref })}`);
    assert(shell.footerDelegateButtonText === 'Delegate with wallet', `app shell: direct wallet delegation action missing: ${shell.footerDelegateButtonText}`);
    assert(/Built by\s+<a/.test(shell.footerBuilderHtml)
      && /of\s+<a/.test(shell.footerBuilderHtml)
      && /<\/a>\s+·\s+<a/.test(shell.footerLinksHtml),
    `app shell: footer credit links should preserve visible word and separator spacing: ${JSON.stringify({ builder: shell.footerBuilderHtml, links: shell.footerLinksHtml })}`);
    assert(shell.footerRpcHref === 'https://eu.rpc.tez.capital' && /RPC by Tez Capital/.test(shell.footerRpcText), `app shell: Tez Capital RPC credit mismatch: ${JSON.stringify({ href: shell.footerRpcHref, text: shell.footerRpcText })}`);
    assert(shell.footerLayout.display === 'block'
      && shell.footerLayout.innerDisplay === 'grid'
      && shell.footerLayout.fiveRows
      && shell.footerLayout.maxCenterDelta <= 1
      && shell.footerLayout.minRowGap >= 6
      && shell.footerLayout.pillOnBottom
      && shell.footerLayout.leadingMarker === 'none'
      && shell.footerLayout.height <= 180
      && shell.footerLayout.gapFromHandoff >= 80
      && shell.footerLayout.gapFromHandoff <= 100
      && shell.footerLayout.overflow <= 1,
    `app shell: desktop footer should be five centered, evenly spaced lines with the build pill alone at the bottom: ${JSON.stringify(shell.footerLayout)}`);
    assert(shell.csp.includes('api.github.com') && shell.csp.includes('*.tzkt.io'), 'app shell: CSP missing core live-data domains');
    assert(shell.stylesheet && shell.appScript && shell.appPreload, `app shell: missing stamped stylesheet/app script (${shell.stylesheet}, ${shell.appPreload}, ${shell.appScript})`);
    assert(shell.cacheVersion && shell.cacheVersion === shell.cssVersion && shell.cacheVersion === shell.appPreloadVersion && shell.cacheVersion === shell.appScriptVersion, `app shell: cache stamps mismatch cache=${shell.cacheVersion} css=${shell.cssVersion} preload=${shell.appPreloadVersion} script=${shell.appScriptVersion}`);
    assert(shell.robots.text.includes('Sitemap:'), 'app shell: robots.txt should point at the sitemap');
    assert(shell.sitemap.text.includes('https://tezos.systems/'), 'app shell: sitemap should include the canonical root URL');
    assert(/build \d+ · latest cafebab · stamp [a-f0-9]{7,12} · \d{4}-\d{2}-\d{2}/i.test(shell.buildVersionText), `app shell: build footer should include build/latest/stamp/date, saw: ${shell.buildVersionText}`);
    assert(/Latest main commit: cafebabe/i.test(shell.buildVersionTitle), `app shell: build footer title missing latest commit, saw: ${shell.buildVersionTitle}`);
    assert(swReady.ready, `app shell: service worker did not become ready (${JSON.stringify(swReady)})`);

    const failedAssets = shell.assetResults.filter((asset) => !asset.ok);
    assert(failedAssets.length === 0, `app shell: service worker shell assets failed: ${failedAssets.map((asset) => `${asset.asset} ${asset.status}`).join(', ')}`);
    assert(shell.assetResults.length === 8, `app shell: expected the eight shared/offline bootstrap assets, saw ${shell.assetResults.length}`);
    for (const asset of ['/offline.html', '/css/styles.min.css', '/css/loading.min.css', '/css/site-map.min.css', '/js/core/theme-preload.js', '/js/ui/release-update.js', '/favicon.svg', '/site.webmanifest']) {
      assert(shell.assetResults.some(result => result.asset === asset), `app shell: missing shared bootstrap asset ${asset}`);
    }

    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 10000 });
    const cachePolicySeed = await page.evaluate(async () => {
      const [immutable, mutable] = await Promise.all([
        fetch('/data/protocol-data.json?v=2'),
        fetch('/data/metals-entry-summary.json')
      ]);
      return { immutable: immutable.status, mutable: mutable.status };
    });
    assert(
      cachePolicySeed.immutable === 200 && cachePolicySeed.mutable === 200,
      `app shell: cache-policy seed requests failed ${JSON.stringify(cachePolicySeed)}`
    );
    // Keep the already-controlled client for the offline transition. A fresh
    // about:blank page created after the browser is taken offline is not a
    // reliable service-worker client in every Chromium build.
    const offlinePage = page;
    let offlineResponse = null;
    let offlineHeading = '';
    let offlineCachePolicy = null;
    try {
      await context.setOffline(true);
      offlineResponse = await offlinePage.goto(`${baseUrl}/offline-navigation-smoke`, { waitUntil: 'domcontentloaded' });
      offlineHeading = await offlinePage.locator('h1').innerText();
      offlineCachePolicy = await offlinePage.evaluate(async () => {
        const immutable = await fetch('/data/protocol-data.json?v=2');
        const mutable = await fetch('/data/metals-entry-summary.json');
        const mutableBody = await mutable.json().catch(() => null);
        return {
          controller: navigator.serviceWorker?.controller?.scriptURL || '',
          online: navigator.onLine,
          immutable: {
            status: immutable.status,
            textStartsWithJson: (await immutable.text()).trim().startsWith('{')
          },
          mutable: {
            status: mutable.status,
            cache: mutable.headers.get('x-tezos-systems-cache') || '',
            body: mutableBody?._quality ? { _quality: mutableBody._quality } : null
          }
        };
      });
    } finally {
      await context.setOffline(false);
    }
    assert(offlineResponse?.ok(), `app shell: offline navigation did not return the cached explanation (${offlineResponse?.status()})`);
    assert(/offline/i.test(offlineHeading), `app shell: offline navigation should render the self-contained offline page, saw ${offlineHeading}`);
    assert(
      offlineCachePolicy?.immutable?.status === 200
        && offlineCachePolicy.immutable.textStartsWithJson
        && offlineCachePolicy?.mutable?.status === 503
        && offlineCachePolicy.mutable.cache === 'miss'
        && offlineCachePolicy.mutable.body?._quality?.status === 'unavailable',
      `app shell: service worker replayed a mutable generated receipt or failed to retain an immutable asset ${JSON.stringify(offlineCachePolicy)}`
    );

    await offlinePage.close();
    await context.close();

    const fallbackContext = await browser.newContext({
      viewport: { width: 960, height: 720 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(fallbackContext);
    await mockHistorySources(fallbackContext);
    await fallbackContext.route('https://api.github.com/repos/Primate411/tezos.systems/commits/main', (route) => route.fulfill({ status: 403, body: '{}' }));
    await fallbackContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const fallbackPage = await fallbackContext.newPage();
    attachIssueCollectors(fallbackPage, 'app shell footer fallback', issues);
    const fallbackResponse = await fallbackPage.goto(`${baseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(fallbackResponse?.ok(), `app shell footer fallback: dashboard failed with HTTP ${fallbackResponse?.status()}`);
    await fallbackPage.waitForFunction(() => /latest unavailable/.test(document.querySelector('#build-version')?.textContent || ''), null, { timeout: 10000 });
    const fallbackFooter = await fallbackPage.locator('#build-version').innerText();
    assert(/build \d+ · latest unavailable · stamp [a-f0-9]{7,12} · \d{4}-\d{2}-\d{2}/i.test(fallbackFooter), `app shell footer fallback: footer shape mismatch: ${fallbackFooter}`);
    await fallbackContext.close();

    const unexpectedIssues = issues.filter((issue) => !(
      /app shell console error: Failed to load resource: the server responded with a status of 503[\s\S]*\/data\/metals-entry-summary\.json/i.test(issue)
    ));
    assert(unexpectedIssues.length === 0, `app shell browser issues:\n${unexpectedIssues.join('\n')}`);
    log(`ok - app shell smoke (${shell.assetResults.length} shell assets)`);
  }

  async function smokeReleaseUpdateDock(browser, baseUrl) {
    const issues = [];
    const versionResponse = await fetch(`${baseUrl}/version.json`);
    assert(versionResponse.ok, `release update dock: version metadata failed with HTTP ${versionResponse.status}`);
    const version = await versionResponse.json();
    const latestChange = typeof version?.latestChange === 'string'
      ? version.latestChange.replace(/\s+/g, ' ').trim().slice(0, 280)
      : '';
    assert(latestChange, 'release update dock: version metadata is missing latestChange');
    const expectedHydratedDetail = `Latest: ${latestChange}`;

    for (const testCase of [
      {
        label: 'desktop valley',
        viewport: { width: 1440, height: 900 },
        theme: 'valley',
        reducedMotion: 'no-preference',
        edge: 20
      },
      {
        label: 'mobile clean reduced motion',
        viewport: { width: 390, height: 844 },
        theme: 'clean',
        reducedMotion: 'reduce',
        edge: 12
      },
      { label: 'small phone clean', viewport: { width: 320, height: 740 }, theme: 'clean', reducedMotion: 'reduce', edge: 12 }
    ]) {
      const context = await browser.newContext({
        viewport: testCase.viewport,
        reducedMotion: testCase.reducedMotion,
        serviceWorkers: 'block'
      });
      await installFeatureMocks(context);
      await context.addInitScript((theme) => {
        localStorage.setItem('tezos-systems-theme', theme);
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
        localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
      }, testCase.theme);

      const page = await context.newPage();
      attachIssueCollectors(page, `release update dock ${testCase.label}`, issues);
      const response = await page.goto(`${baseUrl}/?theme=${testCase.theme}`, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `release update dock ${testCase.label}: dashboard failed with HTTP ${response?.status()}`);
      await page.locator('main').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('#settings-gear').focus();
      await page.evaluate(() => {
        const input = document.getElementById('hero-search-input');
        input?.setSelectionRange?.(0, 0);
        window.__releaseUpdateBaseline = {
          focus: document.activeElement,
          scrollY: window.scrollY
        };
      });

      await page.evaluate(async () => {
        const ui = await import('/js/ui/release-update.js');
        window.__releaseUpdateUi = ui;
        window.__releaseUpdateActions = 0;
        window.__releaseUpdateLater = 0;
        ui.showReleaseUpdateDock({
          detail: 'Latest: Baker Directory now shows observation time.',
          meta: 'Build 919 · 2026-07-30',
          onAction: () => { window.__releaseUpdateActions += 1; },
          onLater: () => { window.__releaseUpdateLater += 1; }
        });
      });

      const dock = page.locator('[data-release-update-dock]');
      await dock.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('[data-release-update-dock]')?.classList.contains('is-visible'));
      await dock.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
      const compactArrival = await page.evaluate(() => {
        const dock = document.querySelector('[data-release-update-dock]');
        const pill = dock?.querySelector('.release-update-pill');
        const rect = dock?.getBoundingClientRect();
        const action = dock?.querySelector('[data-release-update-action]');
        const actionRect = action?.getBoundingClientRect();
        const pillRect = pill?.getBoundingClientRect();
        return {
          adjacent: actionRect?.left >= pillRect?.right && Math.abs(actionRect?.top - pillRect?.top) <= 1,
          actionText: action?.textContent,
          disclosureText: pill?.textContent,
          cardHidden: dock?.querySelector('.release-update-card')?.hidden ?? false,
          collapsed: dock?.classList.contains('is-collapsed') || false,
          height: rect?.height || 0,
          pillHeight: pill?.getBoundingClientRect().height || 0,
          pillHidden: pill?.hidden ?? true,
          width: rect?.width || 0,
          viewportWidth: innerWidth
        };
      });
      assert(compactArrival.adjacent && compactArrival.actionText === 'Update & reload' && /Update transmission/.test(compactArrival.disclosureText) && compactArrival.collapsed
        && compactArrival.cardHidden
        && !compactArrival.pillHidden
        && compactArrival.pillHeight >= 44
        && compactArrival.height <= 48
        && (compactArrival.viewportWidth > 600 || compactArrival.width <= compactArrival.viewportWidth - 24),
      `release update dock ${testCase.label}: a routine update must arrive as the compact transmission pill ${JSON.stringify(compactArrival)}`);
      if (ARTIFACTS_DIR) await page.screenshot({ path: path.join(ARTIFACTS_DIR, `release-update-compact-${testCase.theme}-${testCase.viewport.width}.png`) });
      await page.evaluate(() => window.__releaseUpdateUi.expandReleaseUpdateDock());
      await page.waitForFunction(() => !document.querySelector('[data-release-update-dock]')?.classList.contains('is-collapsed'));
      const initial = await page.evaluate(({ edge, mobile, reducedMotion }) => {
        const dock = document.querySelector('[data-release-update-dock]');
        const card = dock?.querySelector('.release-update-card');
        const action = dock?.querySelector('[data-release-update-action]');
        const later = dock?.querySelector('[data-release-update-later]');
        const copy = dock?.querySelector('.release-update-copy');
        const dockRect = dock?.getBoundingClientRect();
        const cardRect = card?.getBoundingClientRect();
        const actionRect = action?.getBoundingClientRect();
        const laterRect = later?.getBoundingClientRect();
        const rootStyles = getComputedStyle(document.documentElement);
        const dockStyles = dock ? getComputedStyle(dock) : null;
        const cardStyles = card ? getComputedStyle(card) : null;
        const actionStyles = action ? getComputedStyle(action) : null;
        const baseline = window.__releaseUpdateBaseline;
        return {
          activePreserved: document.activeElement === baseline?.focus,
          actionBg: actionStyles?.backgroundColor || '',
          actionColor: actionStyles?.color || '',
          actionHeight: actionRect?.height || 0,
          actionWidth: actionRect?.width || 0,
          ariaLive: copy?.getAttribute('aria-live') || '',
          bottom: dockRect ? innerHeight - dockRect.bottom : Number.NaN,
          cardBorder: cardStyles?.borderColor || '',
          cardBg: cardStyles?.backgroundImage && cardStyles.backgroundImage !== 'none'
            ? cardStyles.backgroundImage
            : cardStyles?.backgroundColor || '',
          cardWidth: cardRect?.width || 0,
          centerOffset: dockRect ? Math.abs(dockRect.left + (dockRect.width / 2) - (innerWidth / 2)) : Number.NaN,
          detail: dock?.querySelector('.release-update-detail')?.textContent || '',
          dockWidth: dockRect?.width || 0,
          edge,
          focusId: document.activeElement?.id || '',
          laterHeight: laterRect?.height || 0,
          meta: dock?.querySelector('.release-update-transmission-meta')?.textContent || '',
          mobile,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          reducedTransition: reducedMotion ? dockStyles?.transitionDuration || '' : '',
          releaseSafeBottom: rootStyles.getPropertyValue('--release-update-safe-bottom').trim(),
          releaseSafeClass: document.body.classList.contains('release-update-safe-area-raised'),
          safeBottom: rootStyles.getPropertyValue('--toast-safe-bottom').trim(),
          scrollPreserved: Math.abs(window.scrollY - (baseline?.scrollY || 0)) <= 1,
          title: dock?.querySelector('.release-update-title')?.textContent || '',
          transmission: dock?.querySelector('.release-update-transmission-header')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          zIndex: Number(dockStyles?.zIndex || 0)
        };
      }, {
        edge: testCase.edge,
        mobile: testCase.viewport.width <= 600,
        reducedMotion: testCase.reducedMotion === 'reduce'
      });

      assert(initial.activePreserved && initial.focusId === 'settings-gear' && initial.scrollPreserved, `release update dock ${testCase.label}: appearance stole focus or scroll ${JSON.stringify(initial)}`);
      assert(initial.title === 'Update ready'
        && initial.detail === 'Latest: Baker Directory now shows observation time.'
        && initial.meta === 'Build 919 · 2026-07-30'
        && /System transmission · incoming/i.test(initial.transmission)
        && initial.ariaLive === 'polite', `release update dock ${testCase.label}: release copy/accessibility missing ${JSON.stringify(initial)}`);
      assert(initial.actionHeight >= 43.9 && initial.laterHeight >= 43.9, `release update dock ${testCase.label}: actions are undersized ${JSON.stringify(initial)}`);
      assert(initial.zIndex >= 10004
        && initial.cardBg !== 'none'
        && /91, 141, 239/.test(initial.actionBg)
        && /69, 224, 200/.test(initial.cardBorder)
        && !/239, 35, 60/.test(`${initial.actionBg} ${initial.cardBorder}`)
        && initial.actionBg !== initial.actionColor, `release update dock ${testCase.label}: routine update state must be calm cyan/blue rather than failure red ${JSON.stringify(initial)}`);
      assert(initial.safeBottom && initial.releaseSafeBottom && initial.releaseSafeClass && !initial.pageOverflow, `release update dock ${testCase.label}: safe-area or overflow contract failed ${JSON.stringify(initial)}`);
      assert(Math.abs(initial.bottom - testCase.edge) <= 2 && initial.centerOffset <= 1, `release update dock ${testCase.label}: dock missed the bottom-center target ${JSON.stringify(initial)}`);
      if (testCase.viewport.width <= 600) {
        assert(initial.dockWidth >= testCase.viewport.width - 26 && initial.actionWidth >= initial.cardWidth - 30, `release update dock ${testCase.label}: mobile dock/action should span the safe width ${JSON.stringify(initial)}`);
        assert(initial.reducedTransition === '0s', `release update dock ${testCase.label}: reduced motion kept an entrance transition ${JSON.stringify(initial)}`);
      } else {
        assert(initial.dockWidth >= 580 && initial.dockWidth <= 620.5, `release update dock ${testCase.label}: desktop transmission width drifted ${JSON.stringify(initial)}`);
      }

      await page.evaluate(() => {
        window.__releaseUpdateUi.setReleaseUpdateDockState({ state: 'error' });
        const action = document.querySelector('[data-release-update-action]');
        if (action) getComputedStyle(action).backgroundColor;
      });
      await page.locator('[data-release-update-action]').evaluate(element =>
        Promise.all(element.getAnimations().map(animation => animation.finished)));
      const errorPalette = await page.evaluate(() => {
        const dock = document.querySelector('[data-release-update-dock]');
        const card = dock?.querySelector('.release-update-card');
        const action = dock?.querySelector('[data-release-update-action]');
        return {
          actionBg: action ? getComputedStyle(action).backgroundColor : '',
          cardBorder: card ? getComputedStyle(card).borderColor : ''
        };
      });
      assert(/239, 35, 60/.test(errorPalette.actionBg) && /239, 35, 60/.test(errorPalette.cardBorder), `release update dock ${testCase.label}: actual failure state must retain clear red semantics ${JSON.stringify(errorPalette)}`);
      await page.evaluate(() => window.__releaseUpdateUi.setReleaseUpdateDockState({ state: 'ready' }));

      await page.evaluate(() => {
        window.__releaseUpdateUi.showReleaseUpdateDock({
          detail: 'Reload for the latest Tezos Systems fixes and features.',
          expanded: true,
          onAction: () => { window.__releaseUpdateActions += 1; },
          onLater: () => { window.__releaseUpdateLater += 1; }
        });
      });
      await page.waitForFunction(
        expected => document.querySelector('.release-update-detail')?.textContent === expected,
        expectedHydratedDetail
      );
      const bootstrapContext = await page.evaluate(() => ({
        detail: document.querySelector('.release-update-detail')?.textContent || '',
        meta: document.querySelector('.release-update-transmission-meta')?.textContent || ''
      }));
      assert(/^Build \d+ · \d{4}-\d{2}-\d{2}$/.test(bootstrapContext.meta), `release update dock ${testCase.label}: bootstrap metadata hydration failed ${JSON.stringify(bootstrapContext)}`);

      const later = page.locator('[data-release-update-later]');
      assert(await later.count() === 1, `release update dock ${testCase.label}: expected one Later action`);
      await later.click();
      await page.waitForFunction(() => document.activeElement?.classList.contains('release-update-pill'));
      const collapsed = await page.evaluate(() => {
        const dock = document.querySelector('[data-release-update-dock]');
        const pill = dock?.querySelector('.release-update-pill');
        const rect = dock?.getBoundingClientRect();
        return {
          activePill: document.activeElement === pill,
          cardHidden: dock?.querySelector('.release-update-card')?.hidden || false,
          collapsed: dock?.classList.contains('is-collapsed') || false,
          laterCount: window.__releaseUpdateLater || 0,
          pillHeight: pill?.getBoundingClientRect().height || 0,
          pillHidden: pill?.hidden ?? true,
          width: rect?.width || 0
        };
      });
      assert(collapsed.activePill && collapsed.cardHidden && collapsed.collapsed && !collapsed.pillHidden && collapsed.laterCount === 1 && collapsed.pillHeight >= 44, `release update dock ${testCase.label}: Later did not preserve a reachable pill ${JSON.stringify(collapsed)}`);

      const pill = page.locator('.release-update-pill');
      assert(await pill.count() === 1, `release update dock ${testCase.label}: expected one collapsed update pill`);
      await page.getByRole('button', { name: 'Update transmission — see what changed', exact: true }).click();
      await page.waitForFunction(() => document.activeElement?.matches('[data-release-update-action]'));
      const replay = await page.evaluate(() => {
        const ui = window.__releaseUpdateUi;
        const dock = document.querySelector('[data-release-update-dock]');
        ui.showReleaseUpdateDock({
          expanded: true,
          onAction: () => { window.__releaseUpdateActions += 1; },
          onLater: () => { window.__releaseUpdateLater += 1; }
        });
        return {
          activeAction: document.activeElement?.matches('[data-release-update-action]') || false,
          stillVisible: dock?.classList.contains('is-visible') || false
        };
      });
      assert(replay.activeAction && replay.stillVisible, `release update dock ${testCase.label}: resurface replayed or lost the settled dock ${JSON.stringify(replay)}`);

      const activeChamber = await page.evaluate(async () => {
        const accessibility = await import('/js/ui/chamber-accessibility.js');
        const overlay = document.createElement('div');
        overlay.className = 'chamber-overlay active';
        overlay.innerHTML = '<div class="chamber-content" style="overflow-y:auto"><button class="chamber-close" type="button">Close</button><div style="height:900px"></div></div>';
        document.body.appendChild(overlay);
        const dialog = overlay.querySelector('.chamber-content');
        dialog.scrollTop = 40;
        accessibility.activateChamberDialog(overlay, { close() {}, label: 'Test Chamber' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const dock = document.querySelector('[data-release-update-dock]');
        const result = {
          basePadding: parseFloat(dialog.style.getPropertyValue('--chamber-room-base-padding-bottom')),
          bodySafe: document.body.classList.contains('release-update-safe-area-raised'),
          dockHidden: dock?.hidden ?? false,
          normalized: overlay.classList.contains('chamber-shell-normalized'),
          paddingBottom: parseFloat(getComputedStyle(dialog).paddingBottom),
          roomSize: dialog.dataset.roomSize || '',
          safeBottom: document.documentElement.style.getPropertyValue('--release-update-safe-bottom'),
          scrollTop: dialog.scrollTop
        };
        accessibility.deactivateChamberDialog(overlay, { restoreFocus: false });
        overlay.remove();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        result.resumed = {
          collapsed: dock?.classList.contains('is-collapsed') || false,
          dockHidden: dock?.hidden ?? true,
          focusedDock: Boolean(dock?.contains(document.activeElement)),
          pillHidden: dock?.querySelector('.release-update-pill')?.hidden ?? true
        };
        window.__releaseUpdateUi.expandReleaseUpdateDock();
        return result;
      });
      assert(activeChamber.normalized
        && activeChamber.roomSize === 'standard'
        && activeChamber.dockHidden
        && !activeChamber.bodySafe
        && activeChamber.basePadding >= 20
        && Math.abs(activeChamber.paddingBottom - activeChamber.basePadding) <= 1
        && !activeChamber.safeBottom
        && activeChamber.scrollTop === 40
        && !activeChamber.resumed.dockHidden
        && activeChamber.resumed.collapsed
        && !activeChamber.resumed.pillHidden
        && !activeChamber.resumed.focusedDock,
      `release update dock ${testCase.label}: active modal suppression/compact resume failed ${JSON.stringify(activeChamber)}`);

      const action = page.locator('[data-release-update-action]');
      assert(await action.count() === 1, `release update dock ${testCase.label}: expected one primary update action`);
      await page.locator('[data-release-update-later]').click();
      await action.click();
      // A second click must not dispatch the same update again.
      await action.evaluate(button => button.click());
      const updating = await page.evaluate(() => {
        const dock = document.querySelector('[data-release-update-dock]');
        const action = dock?.querySelector('[data-release-update-action]');
        return {
          actionCount: window.__releaseUpdateActions || 0,
          disabled: action?.disabled,
          pillText: dock?.querySelector('[data-release-update-pill-label]')?.textContent || '',
          collapsed: dock?.classList.contains('is-collapsed'),
          state: dock?.dataset.state || '',
          text: action?.textContent || ''
        };
      });
      assert(updating.collapsed && updating.pillText === 'Update transmission' && updating.actionCount === 1 && updating.disabled && updating.state === 'updating' && updating.text === 'Updating…', `release update dock ${testCase.label}: primary progress state failed ${JSON.stringify(updating)}`);

      await page.evaluate(() => {
        window.__releaseUpdateUi.setReleaseUpdateDockState({
          state: 'reload',
          title: 'Update applied in another tab',
          detail: 'Reload this tab to finish using the new Tezos Systems build.',
          actionLabel: 'Reload this tab',
          pendingLabel: 'Reloading…',
          pillLabel: 'Reload to update',
          onAction: () => { window.__releaseUpdateActions += 1; }
        });
      });
      const fallback = await page.evaluate(() => {
        const dock = document.querySelector('[data-release-update-dock]');
        const action = dock?.querySelector('[data-release-update-action]');
        return {
          disabled: action?.disabled || false,
          state: dock?.dataset.state || '',
          text: action?.textContent || '',
          title: dock?.querySelector('.release-update-title')?.textContent || ''
        };
      });
      assert(!fallback.disabled && fallback.state === 'reload' && fallback.text === 'Reload this tab' && fallback.title === 'Update applied in another tab', `release update dock ${testCase.label}: reload fallback did not recover the action ${JSON.stringify(fallback)}`);

      await page.evaluate(() => window.__releaseUpdateUi.hideReleaseUpdateDock());
      await dock.waitFor({ state: 'hidden', timeout: 2000 });
      const released = await page.evaluate(() => ({
        raised: document.body.classList.contains('toast-safe-area-raised'),
        safeBottom: getComputedStyle(document.documentElement).getPropertyValue('--toast-safe-bottom').trim()
      }));
      assert(!released.raised && !released.safeBottom, `release update dock ${testCase.label}: safe-area reservation leaked after hide ${JSON.stringify(released)}`);

      await context.close();
    }

    let serviceWorkerVersion = 1;
    let renderedVersion = 1;
    let serviceWorkerRevision = 0;
    let releaseActivation = null;
    const lifecycleServer = createServer(async (request, response) => {
      try {
        const requestUrl = request.url || '/';
        const pathname = new URL(requestUrl, 'http://127.0.0.1').pathname;
        if (pathname === '/__release-activation') {
          if (new URL(requestUrl, 'http://127.0.0.1').searchParams.get('version') === '3') {
            releaseActivation = () => response.writeHead(200).end('ready');
          } else response.writeHead(200).end('ready');
          return;
        }
        if (pathname === '/version.json') {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify(version));
          return;
        }
        if (pathname === '/sw.js') {
          response.writeHead(200, {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/javascript',
            'Service-Worker-Allowed': '/'
          });
          response.end(`
            const VERSION = ${serviceWorkerVersion};
            const REVISION = ${serviceWorkerRevision};
            self.addEventListener('install', () => {});
            self.addEventListener('message', (event) => {
              if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
              if (event.data?.type === 'GET_RELEASE_VERSION') event.ports[0]?.postMessage({ type: 'RELEASE_VERSION', version: String(VERSION) });
            });
            self.addEventListener('activate', (event) => {
              event.waitUntil(fetch('/__release-activation?version=' + VERSION).then(() => self.clients.claim()));
            });
          `);
          return;
        }

        const upstream = await fetch(`${baseUrl}${requestUrl}`);
        let body = Buffer.from(await upstream.arrayBuffer());
        if (/text\/html/i.test(upstream.headers.get('content-type') || '')) {
          body = Buffer.from(body.toString().replace(/\?v=\d+/g, '?v=' + renderedVersion));
        }
        response.statusCode = upstream.status;
        for (const header of ['cache-control', 'content-type', 'etag', 'last-modified']) {
          const value = upstream.headers.get(header);
          if (value) response.setHeader(header, value);
        }
        response.end(body);
      } catch (error) {
        response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(`Lifecycle proxy failed: ${error.message}`);
      }
    });
    await new Promise((resolve, reject) => {
      lifecycleServer.once('error', reject);
      lifecycleServer.listen(0, '127.0.0.1', resolve);
    });
    const lifecycleAddress = lifecycleServer.address();
    const lifecycleBaseUrl = `http://127.0.0.1:${lifecycleAddress.port}`;

    const lifecycleContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'allow'
    });
    await installFeatureMocks(lifecycleContext);
    await lifecycleContext.addInitScript(() => {
      localStorage.setItem('tezos-systems-theme', 'matrix');
      localStorage.setItem('tezos-toured', '1');
      localStorage.setItem('tezos-welcomed', '1');
      localStorage.setItem('tezos-systems-my-tezos-dismissed', '1');
    });
    const updatingPage = await lifecycleContext.newPage();
    const siblingPage = await lifecycleContext.newPage();
    attachIssueCollectors(updatingPage, 'release update lifecycle primary', issues);
    attachIssueCollectors(siblingPage, 'release update lifecycle sibling', issues);

    let response = await updatingPage.goto(`${lifecycleBaseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `release update lifecycle: first load failed with HTTP ${response?.status()}`);
    await updatingPage.evaluate(() => navigator.serviceWorker.ready);
    await updatingPage.reload({ waitUntil: 'domcontentloaded' });
    await updatingPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });

    response = await siblingPage.goto(`${lifecycleBaseUrl}/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `release update lifecycle: sibling load failed with HTTP ${response?.status()}`);
    await siblingPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });

    // A controller can survive navigation before this document has initialized.
    // Drain both startup update checks before changing the fixture worker bytes;
    // otherwise update() may join an in-flight check that still fetched version 1.
    for (const page of [updatingPage, siblingPage]) {
      await page.waitForFunction(() => document.documentElement.dataset.dashboardReady === 'true');
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    }

    serviceWorkerVersion = 2;
    await updatingPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });
    try {
      await updatingPage.locator('[data-release-update-dock].is-visible').waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      const state = await updatingPage.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        const dock = document.querySelector('[data-release-update-dock]');
        return {
          ready: document.documentElement.dataset.dashboardReady,
          visibility: document.visibilityState,
          installing: registration?.installing?.state,
          waiting: registration?.waiting?.state,
          active: registration?.active?.state,
          dock: dock?.outerHTML
        };
      });
      throw new Error(`release update lifecycle: prompt missing ${JSON.stringify(state)}`, { cause: error });
    }
    const waitingState = await updatingPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return {
        action: document.querySelector('[data-release-update-action]')?.textContent || '',
        detail: document.querySelector('.release-update-detail')?.textContent || '',
        transmission: document.querySelector('.release-update-transmission-label')?.textContent || '',
        waiting: registration.waiting?.state || ''
      };
    });
    assert(waitingState.action === 'Update & reload'
      && waitingState.detail === expectedHydratedDetail
      && /System transmission · incoming/i.test(waitingState.transmission)
      && waitingState.waiting === 'installed', `release update lifecycle: waiting worker did not produce the release transmission with current change context ${JSON.stringify(waitingState)}`);

    await updatingPage.getByRole('button', { name: 'Update transmission — see what changed', exact: true }).click();
    await updatingPage.locator('[data-release-update-later]').click();
    await updatingPage.locator('[data-release-update-dock]').waitFor({ state: 'hidden' });
    response = await updatingPage.goto(`${lifecycleBaseUrl}/uranium/?theme=matrix`, { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `release update lifecycle: deferred Uranium navigation failed with HTTP ${response?.status()}`);
    await updatingPage.locator('#uranium-modal.active').waitFor({ state: 'visible', timeout: 15000 });
    await updatingPage.evaluate(() => navigator.serviceWorker.ready);
    const deferredRouteState = await updatingPage.evaluate(() => ({
      chamberActive: Boolean(document.querySelector('#uranium-modal.active')),
      deadline: Number(sessionStorage.getItem('tezos-systems-release-update-deferred-until-v1')),
      dockHidden: document.querySelector('[data-release-update-dock]')?.hidden ?? true,
      pathname: location.pathname
    }));
    assert(deferredRouteState.chamberActive
      && deferredRouteState.dockHidden
      && deferredRouteState.deadline > Date.now()
      && deferredRouteState.pathname === '/uranium/', `release update lifecycle: Later did not survive pretty-route navigation without competing with its active modal ${JSON.stringify(deferredRouteState)}`);

    await updatingPage.locator('#uranium-modal .chamber-close').click();
    await updatingPage.waitForFunction(() => !document.querySelector('#uranium-modal.active'));
    assert(await updatingPage.locator('[data-release-update-dock]:not([hidden])').count() === 0, 'release update lifecycle: Later must remain dismissed after closing a Chamber');
    // Expire this tab's deferral, as a later visit would, without a real 30-minute wait.
    await updatingPage.evaluate(() => sessionStorage.removeItem('tezos-systems-release-update-deferred-until-v1'));
    await updatingPage.reload({ waitUntil: 'domcontentloaded' });
    await updatingPage.locator('[data-release-update-dock].is-visible').waitFor({ state: 'visible', timeout: 10000 });
    // Repeated visible-tab checks must leave the same prompt and focus intact.
    await updatingPage.getByRole('button', { name: 'Update transmission — see what changed', exact: true }).click();
    await updatingPage.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert(await updatingPage.locator('.release-update-card').isVisible(), 'release update lifecycle: duplicate checks collapsed the open details');
    // Use a fresh document to verify the default one-click action.
    await updatingPage.reload({ waitUntil: 'domcontentloaded' });
    const lifecycleAction = updatingPage.locator('[data-release-update-action]');
    await lifecycleAction.waitFor({ state: 'visible' });
    // Build 2 is waiting, but build 3 arrives before the click. One action must
    // discover and activate 3 without reloading onto 2 and asking again.
    serviceWorkerVersion = 3;
    renderedVersion = 3;
    let updateNavigations = 0;
    updatingPage.on('framenavigated', frame => { if (frame === updatingPage.mainFrame()) updateNavigations += 1; });
    const finishedNavigation = updatingPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await lifecycleAction.click();
    // A worker activation receipt, not elapsed time, releases this held update.
    while (!releaseActivation) {
      await updatingPage.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activating');
      await new Promise(resolve => setImmediate(resolve));
    }
    await updatingPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert(updateNavigations === 0 && await lifecycleAction.isDisabled() && await lifecycleAction.textContent() === 'Updating…', 'release update lifecycle: pending activation must remain one action without a Reload step');
    releaseActivation();
    await finishedNavigation;
    assert(updateNavigations === 1, 'release update lifecycle: one click must navigate exactly once');
    await updatingPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
    const activatedState = await updatingPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return {
        dockCount: document.querySelectorAll('[data-release-update-dock]:not([hidden])').length,
        waiting: registration.waiting?.state || '',
        version: await new Promise(resolve => {
          const channel = new MessageChannel();
          channel.port1.onmessage = event => resolve(event.data.version);
          navigator.serviceWorker.controller.postMessage({ type: 'GET_RELEASE_VERSION' }, [channel.port2]);
        })
      };
    });
    assert(activatedState.version === '3' && activatedState.dockCount === 0 && !activatedState.waiting, `release update lifecycle: primary tab did not finish on the active worker ${JSON.stringify(activatedState)}`);

    await siblingPage.locator('[data-release-update-dock].is-visible').waitFor({ state: 'visible', timeout: 10000 });
    const siblingState = await siblingPage.evaluate(() => ({
      action: document.querySelector('[data-release-update-action]')?.textContent || '',
      title: document.querySelector('.release-update-title')?.textContent || ''
    }));
    assert(siblingState.title === 'Update applied in another tab' && siblingState.action === 'Update & reload', `release update lifecycle: sibling tab did not receive a reload-safe cross-tab notice ${JSON.stringify(siblingState)}`);
    await Promise.all([
      siblingPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
      siblingPage.locator('[data-release-update-action]').click()
    ]);
    await siblingPage.evaluate(() => navigator.serviceWorker.ready);
    assert(await siblingPage.locator('[data-release-update-dock]:not([hidden])').count() === 0, 'release update lifecycle: sibling reload repeated the notice');
    // A changed worker file for the very same rendered asset version must not
    // start the user's update/reload/update loop again.
    serviceWorkerRevision += 1;
    await updatingPage.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await updatingPage.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed');
    await updatingPage.evaluate(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert(updateNavigations === 1 && await updatingPage.locator('[data-release-update-dock]:not([hidden])').count() === 0, 'release update lifecycle: the already-loaded build asked for another click');
    await lifecycleContext.close();
    await new Promise((resolve, reject) => lifecycleServer.close(error => error ? reject(error) : resolve()));

    assert(issues.length === 0, `release update dock browser issues:\n${issues.join('\n')}`);
    log('ok - persistent responsive release update dock and service-worker lifecycle smoke');
  }

  return { smokeAppShell, smokeReleaseUpdateDock };
}
