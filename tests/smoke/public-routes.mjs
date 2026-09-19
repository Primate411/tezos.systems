// Browser workflows owned by public-routes. Shared dependencies remain explicit.
export function createPublicRoutesSmokeSuites({
  SAMPLE_ADDRESS,
  assert,
  attachIssueCollectors,
  browserRoutes,
  formattingRoutes,
  formattingViewports,
  fulfillJson,
  installFeatureMocks,
  log
}) {
  async function smokeStandaloneLinks(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    const page = await context.newPage();
    attachIssueCollectors(page, 'standalone links', issues);
    const checkedTargets = new Map();
    const unsafeHrefs = [];

    for (const route of browserRoutes) {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      assert((response?.status() || 0) < 500, `standalone links: route returned ${response?.status()}: ${route}`);

      const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]'))
        .filter((anchor) => {
          const box = anchor.getBoundingClientRect();
          const style = getComputedStyle(anchor);
          return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        })
        .map((anchor) => ({
          href: anchor.getAttribute('href') || '',
          absolute: anchor.href,
          text: (anchor.textContent || anchor.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80)
        })));

      for (const link of links) {
        if (/^(javascript:|mailto:|tel:)/i.test(link.href)) continue;
        if (/localhost|127\.0\.0\.1|file:\/\//i.test(link.href)) unsafeHrefs.push(`${route} ${link.href}`);
        const target = new URL(link.absolute);
        const isFirstParty = target.origin === new URL(baseUrl).origin || target.origin === 'https://tezos.systems';
        if (!isFirstParty) continue;
        const pathWithSearch = `${target.pathname || '/'}${target.search || ''}`;
        checkedTargets.set(pathWithSearch, { route, text: link.text });
      }
    }

    const disclosureResponse = await page.goto(`${baseUrl}/governance/`, { waitUntil: 'domcontentloaded' });
    assert(disclosureResponse?.ok(), 'standalone links: governance disclosure route failed');
    const footerSeparation = await page.evaluate(() => {
      const handoff = document.querySelector('[data-site-handoff]');
      const footer = document.querySelector('[data-site-footer]');
      return {
        separateSiblings: handoff?.nextElementSibling === footer,
        footerHasAttribution: Boolean(footer?.querySelector('[data-site-footer-attribution]')),
        nestedEitherWay: Boolean(handoff?.querySelector('[data-site-footer]') || footer?.querySelector('[data-site-handoff]'))
      };
    });
    assert(footerSeparation.separateSiblings && footerSeparation.footerHasAttribution && !footerSeparation.nestedEitherWay, `standalone links: Handoff and footer should render as separate sibling surfaces: ${JSON.stringify(footerSeparation)}`);
    const disclosure = page.locator('.site-map-footer .site-map-disclosure');
    await disclosure.waitFor({ state: 'visible', timeout: 5000 });
    assert((await disclosure.getAttribute('open')) === null, 'standalone links: exhaustive directory should start collapsed');
    const disclosureLabel = await disclosure.locator('summary').innerText();
    const disclosureCount = Number.parseInt(disclosureLabel.match(/(\d+) destinations/)?.[1] || '', 10);
    assert(Number.isFinite(disclosureCount) && disclosureCount > 0, `standalone links: invalid disclosure count: ${disclosureLabel}`);
    await disclosure.locator('summary').click();
    assert((await disclosure.getAttribute('open')) !== null, 'standalone links: directory disclosure did not open');
    const disclosedLinks = await disclosure.locator('.site-map-link, .site-map-sublink').count();
    assert(disclosedLinks === disclosureCount, `standalone links: opened directory rendered ${disclosedLinks} of ${disclosureCount} canonical destinations`);

    assert(unsafeHrefs.length === 0, `standalone links: unsafe local/file hrefs found:\n${unsafeHrefs.join('\n')}`);
    assert(checkedTargets.size >= 12, `standalone links: expected broad first-party link coverage, saw ${checkedTargets.size}`);

    const failures = [];
    for (const [target, source] of checkedTargets) {
      const response = await context.request.get(`${baseUrl}${target}`, { failOnStatusCode: false });
      if (response.status() >= 500 || response.status() === 404) {
        failures.push(`${source.route} -> ${target} (${response.status()}) "${source.text}"`);
      }
    }

    await context.close();
    assert(failures.length === 0, `standalone links: first-party targets failed:\n${failures.join('\n')}`);
    assert(issues.length === 0, `standalone links browser issues:\n${issues.join('\n')}`);
    log(`ok - standalone link integrity (${checkedTargets.size} first-party targets)`);
  }

  async function smokeRouteFormatting(browser, baseUrl) {
    const issues = [];

    for (const { label, viewport } of formattingViewports) {
      const context = await browser.newContext({
        viewport,
        serviceWorkers: 'block'
      });
      // The default Ledger Flow account follows Whale Watch's largest sender.
      // Keep both sides inside one fixture, independent of scheduled data.
      const mocks = await installFeatureMocks(context, { whaleChamberMocks: true, ledgerFlowMocks: true });
      await context.route('https://api.tzkt.io/v1/operations/transactions**', (route) => fulfillJson(route, []));
      await context.route('https://api.tzkt.io/v1/operations/staking**', (route) => fulfillJson(route, []));
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
      attachIssueCollectors(page, `route formatting ${label}`, issues);
      const formattingIssues = [];

      for (const route of formattingRoutes) {
        const url = `${baseUrl}${route}`;
        // This suite checks route geometry, not the complete account model. Wait
        // for the seeded receipt itself; full loading is covered by the Chamber suite.
        const ledgerReceipt = route === '/ledger-flow/'
          ? page.waitForResponse(response => new URL(response.url()).pathname === `/v1/accounts/${SAMPLE_ADDRESS}`)
          : null;
        const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        assert((response?.status() || 0) < 500, `route formatting ${label}: route returned ${response?.status()}: ${route}`);
        await page.locator('body').waitFor({ state: 'attached', timeout: 5000 });
        await page.waitForTimeout(300);
        if (route === '/ledger-flow/') {
          assert((await ledgerReceipt).ok(), 'Route formatting receives the seeded account fixture');
          assert(mocks.whaleArtifactRequests > 0, 'Route formatting uses the pinned Whale Watch seed');
          assert(mocks.ledgerFlowTzktRequests.some(url => new URL(url).pathname === `/v1/accounts/${SAMPLE_ADDRESS}`), 'Route formatting exercises the seeded account receipt');
        }
        if (route === '/my/') {
          await page.waitForFunction(() => {
            const drawer = document.querySelector('#my-tezos-drawer.open');
            const rect = drawer?.getBoundingClientRect();
            return Boolean(rect) && Math.abs(rect.right - window.innerWidth) <= 1;
          }, null, { timeout: 3000 });
        }

        if (['/governance/', '/bakers/'].includes(route)) {
          const navState = await page.evaluate(() => {
            const nav = document.querySelector('.landing-nav');
            const menu = document.querySelector('.landing-nav-menu');
            const toggle = document.querySelector('.landing-nav-toggle');
            const links = document.querySelector('.landing-nav-links');
            const navRect = nav?.getBoundingClientRect();
            const linksRect = links?.getBoundingClientRect();
            return {
              open: Boolean(menu?.open),
              toggleDisplay: toggle ? getComputedStyle(toggle).display : '',
              linksDisplay: links ? getComputedStyle(links).display : '',
              linkCount: links?.querySelectorAll('a').length || 0,
              nav: navRect ? { left: navRect.left, right: navRect.right, top: navRect.top, bottom: navRect.bottom } : null,
              links: linksRect ? { left: linksRect.left, right: linksRect.right, top: linksRect.top, bottom: linksRect.bottom } : null,
              viewportWidth: window.innerWidth
            };
          });
          assert(navState.linkCount === 6, `route formatting ${label}: ${route} guide nav should expose six routes: ${JSON.stringify(navState)}`);
          if (label === 'desktop') {
            assert(navState.open && navState.toggleDisplay === 'none' && navState.linksDisplay === 'flex'
              && navState.links && navState.nav
              && navState.links.left >= navState.nav.left - 1 && navState.links.right <= navState.nav.right + 1
              && navState.links.top >= navState.nav.top - 1 && navState.links.bottom <= navState.nav.bottom + 1,
            `route formatting desktop: ${route} guide nav must stay visible in one header row: ${JSON.stringify(navState)}`);
          } else {
            assert(!navState.open && navState.toggleDisplay === 'inline-flex' && navState.linksDisplay === 'none',
              `route formatting mobile: ${route} guide nav must start collapsed: ${JSON.stringify(navState)}`);
            await page.locator('.landing-nav-toggle').click();
            const openState = await page.evaluate(() => {
              const menu = document.querySelector('.landing-nav-menu');
              const links = document.querySelector('.landing-nav-links');
              const rect = links?.getBoundingClientRect();
              return {
                open: Boolean(menu?.open),
                display: links ? getComputedStyle(links).display : '',
                left: rect?.left ?? null,
                right: rect?.right ?? null,
                viewportWidth: window.innerWidth
              };
            });
            assert(openState.open && openState.display === 'grid'
              && openState.left >= -1 && openState.right <= openState.viewportWidth + 1,
            `route formatting mobile: ${route} guide nav disclosure must stay inside the viewport: ${JSON.stringify(openState)}`);
            await page.locator('.landing-nav-toggle').click();
          }
        }

        const routeIssues = await page.evaluate(() => {
          const found = [];
          const viewportWidth = window.innerWidth;
          const doc = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(doc?.scrollWidth || 0, body?.scrollWidth || 0);
          const horizontalOverflow = scrollWidth - viewportWidth;

          if (horizontalOverflow > 4) {
            found.push(`document overflows viewport by ${horizontalOverflow.toFixed(1)}px (scrollWidth ${scrollWidth}, viewport ${viewportWidth})`);
          }

          const ignoredAncestorSelector = [
            '[hidden]',
            '[aria-hidden="true"]',
            '#my-tezos-drawer:not(.open):not(.active)',
            '#features-dropdown:not(.open)',
            '#settings-dropdown:not(.open)',
            '#theme-picker-dropdown:not(.open)',
            '.modal-overlay:not(.active):not(.visible):not([aria-hidden="false"])',
            '.changelog-modal:not(.active):not([aria-hidden="false"])'
          ].join(', ');
          const skippedTags = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE']);
          const elementName = (node) => {
            if (node.id) return `#${node.id}`;
            const className = typeof node.className === 'string'
              ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
              : '';
            return className ? `${node.tagName.toLowerCase()}.${className}` : node.tagName.toLowerCase();
          };
          const textSample = (node) => (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
          const isVisible = (node) => {
            if (!node || skippedTags.has(node.tagName)) return false;
            if (node.closest(ignoredAncestorSelector)) return false;
            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
            const box = node.getBoundingClientRect();
            return box.width > 1 && box.height > 1;
          };
          const clippedByHorizontalContainer = (node, box) => {
            let ancestor = node.parentElement;
            while (ancestor && ancestor !== document.body) {
              const ancestorStyle = window.getComputedStyle(ancestor);
              const boundsHorizontalOverflow = ['auto', 'scroll', 'hidden', 'clip'].includes(ancestorStyle.overflowX)
                && ancestor.scrollWidth > ancestor.clientWidth + 1;
              if (boundsHorizontalOverflow) {
                const ancestorBox = ancestor.getBoundingClientRect();
                if (ancestorBox.left >= -4 && ancestorBox.right <= viewportWidth + 4 && (box.left < ancestorBox.left - 1 || box.right > ancestorBox.right + 1)) {
                  return true;
                }
              }
              ancestor = ancestor.parentElement;
            }
            return false;
          };

          const escaped = [];
          for (const node of Array.from(document.body.querySelectorAll('*'))) {
            if (!isVisible(node)) continue;
            const box = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            if (style.position === 'fixed' && box.width >= viewportWidth - 2) continue;
            if ((box.left < -4 || box.right > viewportWidth + 4) && !clippedByHorizontalContainer(node, box)) {
              escaped.push(`${elementName(node)} at ${box.left.toFixed(1)}..${box.right.toFixed(1)} "${textSample(node)}"`);
            }
          }

          if (escaped.length) {
            found.push(`visible content escapes viewport: ${escaped.slice(0, 8).join(' | ')}`);
          }

          const clipped = [];
          const controlSelector = [
            'button',
            'a',
            'input',
            'select',
            'textarea',
            '.landing-card',
            '.theme-card',
            '.feature-launcher-item',
            '.widget-type-btn',
            '.comparison-card'
          ].join(', ');
          for (const node of Array.from(document.querySelectorAll(controlSelector))) {
            if (!isVisible(node)) continue;
            // Single-line text controls intentionally pan long wallet addresses
            // inside their fixed box; their native inner editor reports that as
            // clipped scroll width even when the control itself fits perfectly.
            if (node instanceof HTMLInputElement
              && ['text', 'search', 'url', 'email', 'tel', 'password'].includes(node.type)) continue;
            const style = window.getComputedStyle(node);
            const clipsX = ['hidden', 'clip'].includes(style.overflowX);
            const clipsY = ['hidden', 'clip'].includes(style.overflowY);
            if ((clipsX && node.scrollWidth > node.clientWidth + 3) || (clipsY && node.scrollHeight > node.clientHeight + 3)) {
              // Anthology's decorative arrow intentionally bleeds outside its
              // tile. Measure every real text fragment rather than pseudo bounds.
              if (node.matches('[data-anthology-lens]') && getComputedStyle(node, '::after').content.includes('↗')) {
                const box = node.getBoundingClientRect();
                const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
                let fits = true, text;
                while ((text = walker.nextNode())) {
                  if (!text.textContent.trim()) continue;
                  const range = document.createRange(); range.selectNodeContents(text);
                  for (const rect of range.getClientRects()) {
                    if (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1) fits = false;
                  }
                }
                if (fits) continue;
              }
              clipped.push(`${elementName(node)} ${node.scrollWidth}x${node.scrollHeight} > ${node.clientWidth}x${node.clientHeight} "${textSample(node)}"`);
            }
          }

          if (clipped.length) {
            found.push(`visible control text/content clips: ${clipped.slice(0, 8).join(' | ')}`);
          }

          return found;
        });

        formattingIssues.push(...routeIssues.map((issue) => `${label} ${route}: ${issue}`));
      }

      await context.close();
      assert(formattingIssues.length === 0, `route formatting issues:\n${formattingIssues.join('\n')}`);
      log(`ok - route formatting (${label}, ${formattingRoutes.length} routes)`);
    }

    assert(issues.length === 0, `route formatting browser issues:\n${issues.join('\n')}`);
  }

  async function crawlRoutes(browser, baseUrl) {
    const issues = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await installFeatureMocks(context);
    const page = await context.newPage();
    attachIssueCollectors(page, 'route crawl', issues);

    for (const route of browserRoutes) {
      const url = `${baseUrl}${route}`;
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      assert(response?.status() !== 404, `route returned 404: ${route}`);
      assert((response?.status() || 0) < 500, `route returned ${response?.status()}: ${route}`);
      if (route === '/hen/') {
        await page.locator('#hen-overlay.active').waitFor({ state: 'visible', timeout: 15000 });
        assert(await page.evaluate(() => location.pathname === '/hen/' && !new URLSearchParams(location.search).has('hen')), '/hen/ must remain the canonical live-feed URL');
      }
      const bodyText = (await page.locator('body').innerText({ timeout: 5000 })).trim();
      assert(bodyText.length > 0, `route rendered empty body: ${route}`);
      log(`ok - route ${route} (${response?.status()})`);
    }

    await context.close();
    assert(issues.length === 0, `route crawl browser issues:\n${issues.join('\n')}`);
  }

  return { smokeStandaloneLinks, smokeRouteFormatting, crawlRoutes };
}
