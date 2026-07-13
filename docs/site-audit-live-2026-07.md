# Exhaustive Live-Crawl Audit — tezos.systems

**Prepared:** 2026-07-13
**Method:** full Playwright crawl of a locally-served copy (`python3 -m http.server 9000`, Chromium via
`scripts/lib/playwright-browser.cjs`): 100 page audits (36 routes × 2 viewports at 1440×1000 and 390×844,
plus 27 hash deep-links), a 14-theme rendered contrast matrix (real computed styles, WCAG math on
composited backgrounds), interactive flows driven end-to-end against a mock API layer (request
interception with realistic TzKT/RPC/CoinGecko fixtures), per-API failure isolation, service-worker
lifecycle tests against a mutable copy on :9001, widget isolation/embedding tests, and static
reconnaissance (link graph, orphan scan, storage-key inventory, data JSON validation).
**Rules honored:** read-only — no repository file was modified, nothing committed or pushed.
All test scripts, JSON results, and screenshots live in the session scratchpad
(`crawl-results.json`, `theme-results.json`, `flow-results.json`, `widget-results.json`,
`sw-results.json`, `shots/`, `theme-shots/`, `flow-shots/`, `widget-shots/`).

**Deduplication:** findings already recorded in `docs/ui-ux-audit-2026-07.md` or in the July
performance/security/SEO/code-quality audit (modulepreload, unconditional Chart.js/HEN loading,
preconnects, minification, CSP missing on shells, SRI, SW cache-first CDN caching, hen CSP drift,
sitemap lastmod, meta robots, 404 noindex, compare JSON-LD, app.js size, whales/giants/moments
duplication, no lint in CI, zero unit tests, window.* coupling, Knip, canvas text alternatives,
ticker aria-live, hash-deep-links-not-moving-focus, hen-cli-input label, arcade reduced-motion,
navigation fragmentation, glossary, landing orphan, breakpoints, modal ARIA, chamber body
duplication, HEN toolbar, command center) are **not repeated below**. Where a new finding borders
one of those, the relationship is stated.

**Environment honesty:** the sandbox blocks all external hosts (transparent proxy returns 403).
Consequences: live TzKT/CoinGecko/RPC data rendering could not be compared against production;
html2canvas and Chart.js (CDN) could not load, so share-image *quality* and history-chart theming
were not verifiable (their failure paths were tested instead); production HTTP headers on GitHub
Pages were not inspectable. Everything below distinguishes "broken" from "offline environment".

---

## Severity: HIGH

### H1 — `clean` theme renders several components illegible or near-illegible (measured, not inferred)

The rendered contrast matrix checked ~308 visible text elements per theme across the top six
screens of the dashboard. Dark themes fail only on intentionally-faint items (see L10). `clean`
fails on 24 distinct elements, including body-copy-critical ones:

| Ratio | Requirement | Element | Evidence |
| --- | --- | --- | --- |
| **1.03:1** | 4.5:1 | `.tezos-loop-kicker` "Not sure where to begin?", `Paste`/`Type`/`Run` strongs, **"Try My Tezos" button**, "New" badge, active "Wallet" chip — teal `rgb(69,224,200)` on gray `rgb(203,204,207)` | `theme-shots/clean-loop-card.png` |
| 1.35:1 | 3:1 | `#protocol-history-entry-count` "21" (51px) — mint on white | `theme-shots/clean-protocol-count.png` |
| 1.43–2.86:1 | 4.5:1 | Ledger-Flow legend words "GOLD", "BLUE", "PINK" on white tiles | same screenshot |
| 1.54:1 | 4.5:1 | `.td-entry-mark` ".tez" mark | theme-results.json |
| 1.63:1 | 4.5:1 | `.maxis-entry-season-label` "✺ Ongoing Tezos identities", "87" count — gold on white | same screenshot |
| 2.96–3.77:1 | 4.5:1 | `#network-health-status` "Offline", `.chamber-entry-freshness` "refresh failed", `.site-map-kicker`, cycle chip "sync", hero "12s" finality, "Open My Tezos" links | theme-results.json |

The dominant pattern is **dark-theme accent custom properties composited onto light surfaces**
(the aurora teal `#45E0C8` appears verbatim on `clean`'s gray panels). The "Start from anything"
recruit card — a primary onboarding CTA — is effectively invisible in the light theme.

Notably, `npm run test:static` passes "theme small-text contrast checked across 14 themes": the
project's contrast gate checks token pairs, not composed rendering, so this whole class escapes it.
Related to (but concretely beyond) the prior audit's forward-looking theme-token cleanup item: that
item predicted risk; this is a measured, user-facing failure today.

Also measured, lower priority: `hen` has 4.0:1 small gray-on-black text; `dark` has
`.stat-description` at 3.36:1 (14px).

---

## Severity: MEDIUM

### M1 — My Tezos drawer swallows all input errors: the error element renders at 0×0

Typing an invalid address in the drawer and pressing **TRACK ADDRESS** (or Enter) produces **no
visible feedback whatsoever** — the input keeps the bad value, nothing is announced. The code path
works: `saveAddress()` writes "Invalid address. Enter a tz1.../KT1... address or a .tez domain."
— but into `#my-baker-error-msg`, which lives inside the hidden legacy My Baker panel and renders
at 0×0 px (verified: `display:block` but zero box; screenshot `flow-shots/invalid-address.png`).

- `js/features/my-baker.js:1046` — the drawer's Track handler passes `statusEl: errorMsg`
  (the hidden legacy element) instead of a drawer-visible status node.
- Same silent fate for the "Paste a wallet or .tez name first." empty-input message
  (`my-baker.js:926`) and the "Could not resolve …" domain-resolution failure (`my-baker.js:933`).
- The element also has no `role=alert`/`aria-live`, so even if made visible it would be silent
  to screen readers.

This is the primary personalization input on the dashboard (and the `#my-tezos` deep-link target).
The happy path works (valid address loads, persists, focus lands on `#drawer-close`, dialog
semantics correct — verified with mocked TzKT).

### M2 — SPA URL rewrites break the favicon: 404s for `/domains/favicon.*` and `/hen/favicon.*`

`index.html:47-51` declares favicons with **relative** hrefs (`favicon.svg`, `favicon-32.png`…),
unlike every chamber shell and 404.html (absolute `/favicon.svg`). The dashboard rewrites its URL
in place: `app.js:5543` (`replaceState('/domains/')` for the domains deep link),
`hen-mode.js:610/1566/1621/2204/2723` (`/hen/…`). After the rewrite the browser re-resolves the
icon links against the new directory. Crawl-captured evidence (would be identical 404s on GitHub
Pages, plus a broken tab icon):

- `/#domains` → `404 /domains/favicon.svg`, `404 /domains/favicon-32.png`, `-16`, `-48`
- `/#nfts` → `404 /hen/favicon.svg`, `404 /hen/favicon-32.png`, `-16`, `-48`

### M3 — State-of-Tezos snapshot reads a price cache that nothing writes (localStorage schema drift, live instance)

`js/features/state-of-tezos.js:143` reads `localStorage['tezos-systems-price-cache']` and expects
`{price}`. The price module writes **`sessionStorage['tezos_price_cache']`** with shape
`{timestamp, data:{usd,…}}` (`js/features/price.js:9,20,38`; hen-mode uses the same sessionStorage
key). Wrong key, wrong storage, wrong shape — the fallback can never fire. Consequence: whenever
the direct CoinGecko fetch fails (known-noisy 429/503 upstream), the shareable Network Snapshot
shows "N/A" for price even though a fresh price sits in sessionStorage. This is a concrete case of
the storage-naming drift visible across the codebase (`tezos-systems-*` vs `tezos_*` families).

### M4 — Widget builder's Markdown embed can never render: it emits image-Markdown pointing at an HTML page

`widgets/runtime.js:286-292` (`markdownCode`) produces
`[![Tezos price widget](https://tezos.systems/widgets/price.html?…)](…)` — an image whose `src`
is an HTML document. GitHub/Markdown renderers will show a broken image; GitHub's camo proxy
rejects `text/html`. The Markdown tab is a first-class option in the builder UI
(`widgets/builder.html:403,667`). Either an image-endpoint is missing or the tab is misleading.

### M5 — Default widget refresh re-downloads the full 10,000-row delegate list every 60 s from third-party pages

`WIDGET_ENDPOINTS.activeBakers()` (`widgets/runtime.js:120-122`) fetches
`/delegates?active=true&select=address,alias,consensusAddress,bakingPower&limit=10000` — used by
`baker-count` (which only displays a count) and `combo`'s bakers/tz4 stats. Default
`refresh=60` (`runtime.js:6`), fetched with `cache:'no-store'` (`runtime.js:303-305`), and
`startWidgetRefresh` (`runtime.js:307-310`) has no visibility gating — hidden embedder tabs keep
polling. TzKT exposes `/delegates/count`; the count widget pulls megabytes to render one integer,
multiplied across every third-party embed. (tz4 power genuinely needs the list; the count does not.)

### M6 — The client's stale-data receipt machinery is production-dead, and a static check pins it that way

`js/core/api.js:81-92` (`responseQuality`) only activates when a response carries
`X-Tezos-Systems-Cache: stale`; `mergeStaleResponseQuality` (api.js:106-123) and the
`staleResponseEvents` ledger hang off it. The current service worker **never emits that header** —
its only custom header is `X-Tezos-Systems-Cache: miss` on the 503 fallback (`sw.js:92`), by
design ("cross-origin API responses are never replayed as current data", AGENTS.md). The only
producer of `stale` is the smoke-test mock (`tests/smoke.mjs:1179-1181`), and
`tests/static-checks.mjs:1247` requires api.js to keep reading it. So a data-honesty subsystem
(stale categories, observed-at receipts from SW replays) silently no-ops in production while tests
assert its plumbing. Either the SW should emit stale replays again, or this reader + its test
contract is vestigial and misleading to maintainers.

### M7 — CI runs 3 of the 40 smoke suites

`.github/workflows/ci.yml:56` runs `--only app-shell,hen-mode,route-crawl`. The catalog
(`node tests/smoke.mjs --list`) has 40 suites, including every My Tezos flow, maxis, themes,
governance-lb, feature-workflows, share-actions, widget-builder, route-formatting, and
ux-regressions. None of those run on push/PR; the pre-commit hook (`.githooks/pre-commit`) runs
only the README guard, generated-surface refresh, and version stamp. Regression coverage for ~92%
of the browser suites depends entirely on a developer remembering `npm test` locally. (Distinct
from the prior audit's "zero unit tests / no lint in CI": these tests exist and are good — they're
just not wired to CI.)

---

## Severity: LOW

- **L1 — Hardcoded "12s" finality poses as live data.** `index.html:634` and `:687` ship `12s`
  as static text in the hero continuity strip; with APIs unreachable it stays there looking live
  while sibling stats (bakers/staked/issuance) honestly show skeletons (screenshot
  `flow-shots/share-fail-2.png`). Wrong the day block time changes; at odds with the repo's
  no-fabricated-telemetry principle.
- **L2 — No service-worker update UX; version-skew window for long-lived tabs.**
  `registerServiceWorker` (`js/core/app.js:4912-4920`) is fire-and-forget: no `reg.update()` on
  visibility/interval, no `updatefound`/`controllerchange` handling, no "new version" prompt.
  With `skipWaiting`+`clients.claim` (sw.js:143,153) a deploy takes over mid-session; a tab open
  for days (the 2-hour refresh loop encourages this) lazy-imports *new* feature modules into *old*
  core code. Verified mechanics on :9001 copy: v426→v427 replaced caches cleanly, silently.
- **L3 — The SW precaches `/` + `/index.html` that navigations can never use.** For offline
  navigations `networkFirstRuntime` returns `offline.html` *before* consulting the cache
  (`sw.js:105-107`), including for the fully-precached `/` (verified live). The offline page is a
  deliberate honesty choice (its copy says so), but then `SHELL_ASSETS`' `'/'`/`'/index.html'`
  entries (`sw.js:19-20`) are dead install weight, and the PWA (standalone `site.webmanifest`)
  never works offline by design — worth stating explicitly in AGENTS.md.
- **L4 — `#theme=` deep links flash the wrong theme.** `js/core/theme-preload.js:15-16` honors
  only `?theme=`; the documented `#theme=` (AGENTS.md, share links) is applied later by
  `app.js:5621-5627` after module load. First paint uses saved/default theme, then switches.
  (Hash-theme persistence and cross-page carry-over verified correct otherwise.)
- **L5 — `js/features/objkt-ui.js` is an orphan.** Zero references anywhere (script tags,
  imports, dynamic imports); `AGENTS.md` still documents it as part of the OBJKT/HEN module set.
  ~230 lines of dead code with its own storage keys.
- **L6 — The 6-second RPC head poller ignores visibility.** `setInterval(pollBlock, 6000)`
  (`js/core/app.js:3189`) runs regardless of `document.visibilityState`, while the adjacent 1-s
  tickers gate on it (app.js:3131-3132). Hidden tabs poll `eu.rpc.tez.capital` indefinitely
  (browser throttling reduces but doesn't stop it).
- **L7 — Notification icons reference `/favicon.ico`, which doesn't exist.**
  `js/features/rewards-tracker.js:251` and `js/features/price-intelligence.js:186` use
  `icon: '/favicon.ico'` for Web Notifications; the repo ships no `favicon.ico` (crawl: default
  browser probe 404s on pages like `offline.html`). Notifications will show a missing/blank icon.
- **L8 — Versioned cache keys never clean up their ancestors.**
  `tezos-systems-leaderboard-cache-v5` (`js/features/leaderboard.js:14`) — no `removeItem` for
  v1–v4 anywhere; users upgraded through versions carry dead multi-hundred-KB blobs forever.
- **L9 — `saveStats` persists partial-quality snapshots.** `storage.js:34-48` stores whatever it
  gets; only `saveVisitSnapshot` filters on `_quality.status` (storage.js:174). A `partial`
  snapshot (some categories unavailable) becomes the "instant" cached render for up to 4 h. The
  `_quality` object is preserved in the blob so consumers *can* see it — but the two functions'
  inconsistent guards look unintentional.
- **L10 — The footer build marker fails contrast in every theme.** `#build-version` renders at
  ~1.5–1.7:1 (`rgba(255,255,255,0.18)` at 8.8 px; light themes equivalent). It's real content —
  QA.md's manual pass asks humans to read it ("Footer build marker shows build metadata").
- **L11 — Widgets ship analytics into third-party pages.** Every widget loads GoatCounter and
  fires a `widget_impression` event with embed context (`widgets/runtime.js:242-248`). GoatCounter
  is cookieless so exposure is small, but embedders aren't told; a doc note (or dropping analytics
  in embeds) would make it a deliberate choice.
- **L12 — `i.github.com` in the dashboard CSP connect-src** (`index.html:35`). Not a GitHub API
  host (`api.github.com` is already allowlisted); appears to be a typo'd dead entry. Harmless but
  allowlists should be exact.
- **L13 — `.well-known/ai-plugin.json` metadata nits.** `api.url` points at `https://api.tzkt.io/v1/`
  (not an OpenAPI *document*); `legal_info_url` serves the raw MPL text file. Also no
  `.well-known/security.txt`. All cosmetic, but this file exists specifically for machine consumers.
- **L14 — First-run mobile shows two overlapping onboarding prompts.** The welcome toast
  ("Welcome 👋 — this dashboard is watching Tezos live…") floats mid-viewport occluding the
  Live-Pulse header/SYNCING label while the "Need a hand?" panel is also open
  (`shots/root__mobile.png`). Desktop bottom-right toast likewise covers a button
  (`shots/whales__desktop.png`). Adjacent to—but not part of—the prior audit's onboarding findings.
- **L15 — Compounding frequency is hardcoded to 486.7 cycles/year.** `calculator.js:12` bakes an
  ~18 h cycle into `calcCompound` and the payout-line fallback, while actual cycle length is
  fetched live elsewhere (`getProtocolTiming`). Numerically the compound result is insensitive to
  the frequency, so this is drift-risk hygiene, not a math error (all displayed calculator math
  verified exact — see clean list).
- **L16 — HEN lore banner's dismiss button wraps into the sentence at 390 px** — reads as
  punctuation after "daily." (`shots/hen__mobile.png`).
- **L17 — Snapshot failure toast says "Snapshot failed — check console"**
  (`state-of-tezos.js:608`) — developer-facing copy shown to end users (compare share.js's
  "Screenshot failed. Try again.").

---

## Verified clean (checked, with method — absence of findings above is meaningful)

**Crawl-level (100 audits: 36 routes × 2 viewports + 27 hash deep-links):**
- Zero uncaught page errors on every route and hash, both viewports.
- Zero horizontal overflow at 1440 px and 390 px on every page (documentElement scrollWidth vs innerWidth, plus offender scan).
- Every console error/warning is a *handled* degradation of a blocked external API (503-from-SW or fetch failure logged with context); no unhandled promise rejections.
- All 34 sitemap URLs, `/tezlink/`, `/landing.html`, `/404.html`, `/offline.html` load with correct titles, meta descriptions, and self-canonicals; `/tezlink/` correctly canonicalizes to `/tezosx/` with `noindex,follow`.

**Links/files/data:**
- 933 static `href`/`src`/`srcset` links across all 37 HTML files: zero broken, zero unexpected redirects; all absolute `https://tezos.systems/...` self-references resolve; all `feed.xml` links resolve.
- `sitemap.xml` and `feed.xml` are valid XML; RSS structure (guid/pubDate/atom:self) well-formed.
- All 78 `data/**/*.json` files parse; `governance-refresh-report.json` status ok, no warnings/blockers.
- Orphan scan: `objkt-ui.js` is the only unreferenced module (L5); all `css/themes/*.css` are minifier sources, not orphans; `og/*.png` exists for every chamber including tezlink.
- `npm run test:static`: 191 passed, 0 failed (the 14 "min.css older than styles.css" warnings are mtime artifacts of the fresh clone — git status clean, content matches HEAD).

**Interactive flows (mocked APIs with deterministic fixtures):**
- **Calculator math verified exactly** for fixture APY (stake 16.8 % / delegate 5.6 %): delegate mode @1000 ꜩ, 80 % payout → daily 0.1227 ꜩ, monthly 3.73, yearly 44.80, compound 1Y 1,045.82 (= 1000·(1+0.0448/486.7)^486.7); stake mode @10 % edge → 15.1 % APY, daily 0.4140, yearly 151.20. Race-guarded via `updateSequence`; empty/invalid amounts clear correctly; assumption-required states render.
- **Per-API failure isolation:** CoinGecko down → price shows "—", everything else lives; TzKT down → price/RPC-driven values live, stats degrade with "Live data delayed — showing last known values" + Retry banner and honest per-tile states ("L2 data unavailable · Retrying", "tz4 switch list delayed", "LB STATUS UNAVAILABLE"); RPC down → cycle/finality inputs degrade without cascade.
- **My Tezos happy path:** drawer ships `role=dialog aria-modal=true` statically, focus moves to `#drawer-close`, valid `tz1…` loads (mocked), persists to `tezos-systems-my-baker-address`, saved-wallets list updates, Ledger-Flow/Passport links wire up. `#baker=`/`#my-baker=` deep-links open the drawer with focus managed; deep-link-overrides-saved is documented intent (smoke: `my-tezos-deep-link-override`).
- **Theme system:** all 14 `#theme=` values apply and persist; carry over to chamber shells pre-paint via `theme-preload.js`; invalid names fall back safely; every `css/themes/*.min.css` loads with non-empty rule sheets.
- **Share:** picker opens with section preview; capture failure (CDN blocked) surfaces "Screenshot failed. Try again." and restores UI state (button, hidden elements). Capture image quality untestable here (environment).
- **Service worker (on the :9001 mutable copy):** registers, precaches the declared shell, controls clients; `version.json` bypasses cache correctly; cache-name bump v426→v427 installs, activates, prunes old caches completely, takes control with no stuck waiting worker; offline navigation lands on the honest offline page (by design — see L3).

**Widgets (9/9, standalone + embedded):**
- All render correct data (mocked) inside the builder's default 300×120 / 400×120 without any overflow; offline states degrade to "—" with frame + attribution intact; `baker-card` without `?baker=` shows a helpful hint; `?baker=<script>…` does not execute (escaping holds); cross-origin iframe embedding works with theme param; combo respects `stats=` selection and order.

**Security spot-checks (not a full audit):**
- API-sourced strings (aliases, token names, search results) are `escapeHtml`-ed at the render sites checked: `search.js:608-619,712-719`, `whales.js:344-366`, widget `runtime.js`/`baker-card.html`; hero search handles arbitrary pasted input without injection.
- No secrets in the repo beyond the intentionally-public Supabase anon key (documented as RLS-scoped).

**Data-layer review:**
- `fetchWithRetry` 429 handling (Retry-After, capped backoff, body cancel) is correct; in-flight dedupe exists for stats/voting/bakers/constants/yearly-rate; TzKT throttle queues at 6 rps with abort propagation; `fetchAllStats`/`fetchHeroStats` quality synthesis (`qualityFromSettled`) correctly classifies fulfilled/stale/unavailable and keeps last-good values per category.

**Not verifiable from this sandbox (stated, not silently skipped):** production response headers (HSTS/XFO on GitHub Pages), live-data rendering vs. real TzKT values, share-capture image output, history-chart theming under the four flagged themes (Chart.js CDN blocked; AGENTS.md already flags those modules' theme fallbacks), and the full Maxis release matrix (QA.md defines it as a release gate requiring its fixture tooling; the `/maxis/` route, its data files, and passport shards all load and validate).

---

## Suggested order of attack

1. **H1** clean-theme contrast cluster (one CSS pass over the components listed; add one rendered-contrast case to the static gate so it can't regress).
2. **M1** drawer error visibility (point `statusEl` at a visible drawer node + `role=alert`).
3. **M2** absolute favicon hrefs in `index.html` (one-line-per-link fix; kills production 404s).
4. **M4/M5** widget builder Markdown tab + count endpoint (small, third-party-facing).
5. **M3, L7, L8** storage/asset hygiene batch.
6. **M6, M7** decide the SW stale-receipt contract; wire more smoke suites into CI (even a weekly full run).
