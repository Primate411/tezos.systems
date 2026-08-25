# tezos.systems Agent Map

This file is the durable handoff for future Codex agents working on
`tezos.systems`. It summarizes verified repo knowledge, local conventions, and
the highest-risk gotchas.

## Identity

- Repo: `/Users/primate/Code/tezos.systems`
- Live site: `https://tezos.systems/`
- Remote: `git@github.com:Primate411/tezos.systems.git`
- Branch: `main`
- Hosting: GitHub Pages with custom domain from `CNAME`
- License: Mozilla Public License 2.0 (`MPL-2.0`); preserve `LICENSE` and
  `NOTICE` when distributing covered source.
- Stack: static client-side dashboard, vanilla HTML/CSS/JavaScript, ES modules,
  no framework, no bundler
- Runtime is framework-free, but the repo has tooling dependencies such as
  Playwright and Knip in `package.json`.

## Local Development and Deploy

- Local dev server: `python3 -m http.server 9000`
- Deploy: push to `main`
- Before deploy after JS/CSS changes, review cache busting:
  - bump the service worker cache name in `sw.js`
  - update `version.json` or run the stamp script if appropriate
  - update any explicit asset query params if they exist
- Generated distribution surfaces can be refreshed together with
  `npm run refresh:generated`. The pre-commit hook runs the same orchestrator in
  commit mode, stages generated governance/feed and root OG output, and refreshes
  other generated outputs when their source files are already staged. The
  milestone catalog is checked on the same path but regenerates only after 14
  days or 100 commits; `npm run refresh:milestones` forces it manually.
- Scheduled dynamic data uses `scripts/refresh-scheduled-data.mjs`, not the
  manual/pre-commit distribution orchestrator. It runs declared source-family
  lanes in an isolated temporary Git worktree, restores a failed lane to its
  exact last-good files, continues unrelated lanes, publishes successful lanes,
  and leaves the Action red with a machine-readable failure report.
- `.github/workflows/audit-generated-freshness.yml` is a separate read-only
  six-hour alarm. It enforces an 18-hour generated-data ceiling, the completed
  Monday-to-Monday Ecosystem rollover after an 18-hour grace period, and the
  native Release Radar, comparison, milestone, TezosCRP, and Supabase clocks.
- `index.html` currently serves `css/styles.min.css`, not `css/styles.css`.
  Edit `styles.css` first, then regenerate/minify `styles.min.css`.
- Playwright callers should use `scripts/lib/playwright-browser.cjs`. It tries
  bundled Chromium first, falls back to system Chrome/Chromium, and honors
  `BROWSER_EXECUTABLE_PATH`; do not copy browser-candidate lists into new
  scripts.
- `README.md` contains some stale guidance. Verify against code before relying
  on README claims.

## Core Files

- `index.html`: main SPA shell, CSP, SEO/schema, dashboard DOM, modals, drawers,
  script loading, Chart.js CDN imports.
- `css/styles.css`: source styles and theme rules.
- `css/styles.min.css`: served stylesheet.
- `css/network-health.css`: lazy Network Health Consensus Lens and Nakamoto panel styles.
- `css/minerals-chamber.css`: lazy Critical Minerals atlas, supply, market, and proofbook styles.
- `css/tezoscrp.css`: lazy TezosCRP Recognition Hall styles.
- `css/hen-mode.css`: HEN overlay styles.
- `css/landing.css`: landing and SEO page styles.
- `css/site-map.css`: shared complete-map, standalone circulation, and chamber
  wayfinder styles.
- `js/core/app.js`: app orchestrator, DOM wiring, modals, refresh loop, feature
  initialization, service worker registration, deep links.
- `js/core/api.js`: Tezos data fetching, RPC/TzKT/Supabase calls, deduping,
  caching helpers, stats assembly.
- `js/core/config.js`: endpoints, refresh intervals, constants, Supabase anon
  config, chain comparison data.
- `js/core/storage.js`: localStorage/sessionStorage wrappers.
- `js/core/release-radar.mjs`: validated, expiring Release Radar receipt schema
  and Live Pulse signal builder. The browser renders reviewed evidence; it does
  not infer release readiness from repository activity.
- `js/core/site-map.js`: canonical destination, search, sitemap/crawl, nested
  view, alias, and semantic-relations graph used by the command bar, dashboard
  map, standalone pages, XML sitemap, share/copy routes, and journey
  recommendations. Add new first-party wares here instead of creating another
  hard-coded navigation catalog.
- `js/core/tezos-domains.js`: shared multi-label `.tez` validation and forward
  resolution with address-first, owner-fallback semantics.
- `js/core/etherlink-governance-contracts.mjs`: shared reviewed FAST, SLOW, and
  Sequencer mainnet lineage plus current-address/config classification used by
  both the live L2 Chamber and generated L2 Governance Maxi careers. Do not
  revert to creator-only discovery; the corrected current Sequencer deployment
  has a different origin.
- `js/core/utils.js`: formatters, debounce/throttle, sanitization helpers.
- `js/ui/pulse-ticker.js`: Live Pulse ticker presentation, phase-preserving CSS
  drift, pause/hold interaction, detail shelf, and reduced-motion fallback.
- `sw.js`: bounded shell/runtime caching and explicit offline navigation. Cross-
  origin API responses are never cached or replayed as current data.
- `version.json`: build metadata.
- `LICENSE`: unmodified Mozilla Public License 2.0 terms.
- `NOTICE`: Tezos Systems / Primate attribution, covered-work scope, and
  third-party/trademark boundary.
- `data/*.json`: protocol history, governance refresh artifacts, protocol
  debates, and tweet/share templates.
- `widgets/*.html`: standalone embeddable widgets.

## Data Sources

- TzKT: `https://api.tzkt.io/v1`
  - Ecosystem Activity exhaustively pages the aliased smart-contract and asset
    catalogs, resolves its disclosed Tezos app families server-side, freezes
    the resolved addresses, and reconstructs applied top-level transaction
    senders into Monday-to-Monday UTC aggregates.
- Etherlink Blockscout: `https://explorer.etherlink.com/api`
  - Ecosystem Activity reconstructs successful inbound transactions for
    reviewed Etherlink contracts; raw wallet cohorts remain generator-only.
    The reviewed exchange slice follows Etherlink's official directory and
    freezes first-party Curve, Hanji, Oku, and IguanaDEX deployment receipts.
  - Critical Minerals retains only bounded xCo, xNi, and RARE token metadata,
    counters, holder-address/latest-transfer pages, and verified proxy lineage;
    addresses are not people and chain state is not backing or market evidence.
- Octez RPC: `https://eu.rpc.tez.capital`
- Official Octez mainnet RPC: `https://tezos-mainnet.octez.io`
  - current-cycle baking-power distribution for live one-third and two-thirds
    address-level Nakamoto coefficients
- Teztale: `https://teztale-server-mainnet-ro-prd.octez.tech`
  - used as an extra Network Health consensus lens for quorum timing,
    validation/application delay, source count, and operations-report context
  - Teztale is by Nomadic Labs; keep visible credit when surfacing its data
- CoinGecko: XTZ price data
- Federal Register 90 FR 50494
  - canonical final 2025 U.S. critical-minerals list of 60 entries; membership
    is taxonomy, not proof of a price, reserve, chain asset, or investable product
- U.S. Geological Survey Mineral Commodity Summaries 2026 and data release
  DOI `10.5066/P1WKQ63T`
  - form-specific 2021–2025 supply, import-reliance, annual-price, and world-
    production receipts; preserve exact units, periods, raw qualifiers/codes,
    group context, and unavailable values rather than coercing point estimates
- World Bank Commodity Price Data (Pink Sheet) monthly workbook
  - bounded Critical Minerals history for its exact ten matching products;
    preserve product forms and units, and never substitute thermal coal for
    metallurgical coal
- IMF Primary Commodity Price System monthly workbook
  - canonical comparable Precious Metals history for gold, silver, platinum,
    and palladium is completed-month USD per troy ounce, never a live close
- Gold API public price endpoints
  - generator-only indicative-current observations for gold, silver, platinum,
    and palladium; upstream inputs and weighting are undisclosed, so never call
    these a benchmark, official fixing, dealer quote, or executable price
- U.S. Geological Survey precious-metals publications
  - eight-metal taxonomy plus source-bounded annual specialist PGM context;
    grouped observations stay grouped and missing osmium pricing stays missing
- VNX and Metals.io documentation
  - issuer terms, operational notices, and dated VNXAU procedure receipts plus
    xCo, xNi, and RARE product statements and issuer-described RARE composition
    are attributed claims, not independent proof of backing, custody, commodity
    entitlement, liquidity, reserves, redemption, or execution
- Tezos Domains GraphQL: reverse/domain lookups
- OBJKT GraphQL: NFT/profile mode
- Supabase REST: historical snapshots using a public anon key from
  `js/core/config.js`
- Tezos Commons: `https://tezoscommons.org/rewards/` for current TezosCRP
  category definitions/icons and `https://medium.com/feed/tezoscommons` for
  official monthly winner announcements.

Treat the Supabase anon key as public client configuration, not as a secret.
If adding new network domains, update the CSP in `index.html` or fetches,
scripts, images, and frames can fail in-browser.

Licensing boundaries:

- Original source code and repository-authored documentation are covered by
  MPL-2.0 through the root `LICENSE` and `NOTICE`.
- The Tezos Network Statistics dataset schema advertises CC BY 4.0 only for
  original selection, arrangement, and commentary to the extent Primate
  owns those rights; underlying facts and third-party API data retain their
  source terms.
- Public identity: Tezos Systems is built by Primate, whose public contact is
  `primate@tez.capital`; Primate is the baker behind
  [Baking Benjamins](https://x.com/BakingBenjamins) and a co-founding member of
  Tez Capital. Represent Tez Capital as the affiliated brand and RPC
  infrastructure provider.
- Legal metadata: keep Primate as the repository's current copyright holder
  and site/schema creator, and as publisher where publisher metadata is present,
  unless ownership actually changes. Keep `Primate411` only in technical GitHub
  repository, API, issue, security, and source URLs while that remains the
  account name.
- The live footer and document metadata must retain public Source and MPL-2.0
  links when `index.html` or generated chamber shells are refreshed.

## Runtime Flow

- `app.js` imports most modules and initializes features with safe wrappers.
- Cached stats/protocols are loaded first, then background refresh updates live
  UI.
- Main refresh path updates hero stats, optional full stats, comparisons, cycle
  pulse, daily briefing, rewards tracker, price intelligence, baker features,
  leaderboard, and My Tezos state.
- Main dashboard cards are updated by DOM id. There is no app state framework.
- Service worker registration happens from `app.js`.
- Useful deep links include:
  - `#my-baker=...`
  - `#baker=...`
  - `#calculator`
  - `#compare`
  - `#leaderboard`
  - `#whales`
  - `#giants`
  - `#history`
  - `#theme=...`
  - `#section=...`
  - `#price`
  - `#minerals` (Critical Minerals Chamber; aliases `#critical-minerals` and
    `#strategic-minerals`; pretty route `/minerals/`)
  - `#metals` (Precious Metals Chamber; pretty route `/metals/`)
  - `#staking` (Staking Chamber; pretty route `/stake/`)

## Quiet Live Refresh Contract

This is the default contract for every new Chamber, dashboard card, feed,
drawer, carousel, and live-data feature. The reference experience is the
Network Health Chamber: **live data changes; the reader does not move**.

- After first render, timed/background updates must reconcile into the existing
  DOM through `js/core/quiet-refresh.js` (`quietlySyncHtml`,
  `quietlySyncElement`, or `quietlyMutate`) or an equivalently tested in-place
  updater. Do not use a timer to replace a whole live surface with `innerHTML`.
- Preserve the exact browsing state across every background update: window
  scroll, Chamber/drawer scroll, horizontal rail position, focused control,
  text selection, compatible DOM nodes, open tab/filter state, and retained
  canvas/chart instances. Chart data should update without animation where the
  library supports it.
- A background update must never reload or navigate the page, change the URL or
  hash, call `scrollTo`/`scrollIntoView`, move focus, auto-rotate a carousel,
  reset a scroller, or replay an entrance/pulse animation. Those behaviors are
  allowed only after a direct user action when they are part of that action.
  The Live Pulse ticker (`js/ui/pulse-ticker.js`) is the one surface with
  intended continuous motion. That motion is a property of the surface, not of
  a refresh: it pauses on hover, tap, focus, search, hidden tabs, and off-screen,
  it is disabled under `prefers-reduced-motion`, and a background refresh must
  restore its exact phase. Every other rule in this contract applies unchanged.
- Live feeds must compensate for prepends/appends so the visible content stays
  under the reader's eyes. Preserve vertical position by the scroll-height
  delta and preserve horizontal position by the scroll-width delta when items
  are inserted before the current view. Never pull the reader to the live edge.
- Gate network polling and DOM mutation so they run only while
  `document.visibilityState === 'visible'`, then perform one quiet catch-up
  when the tab becomes visible.
- On a refresh failure, keep the last-good rendered data and expose freshness or
  retry state without replacing the reading surface or causing an in-flow
  layout shift.
- Background reconciliation must suppress transitions and entrance animations
  while leaving settled content fully visible with `opacity: 1` and
  `transform: none`. Retaining `animation: none` must not strand an element in
  its hidden pre-animation state.
- Initial render and explicit user-triggered view changes may build a surface
  normally. The moment a feature begins polling, its subsequent renders must
  use the quiet-refresh contract.

Required regression coverage for every new live surface:

- Add or extend a static contract proving the timer is visibility-gated and the
  background path uses quiet reconciliation.
- Add a focused browser smoke that shortens/forces the refresh interval and
  asserts unchanged page and nested scroll, DOM identity, focus, selection, tab
  state, and settled animation state. Also assert that a reader scroll made
  immediately after reconciliation is not overwritten by a delayed restore.
- Run rendered desktop and mobile QA in a real browser. Test while scrolled
  inside the surface, not only at its top, and verify that a second/cached
  Chamber render remains visible and does not re-fade.
- Reuse the `quiet-refresh` smoke suite and Network Health implementation as the
  baseline. If a feature cannot use the shared helper, document the reason and
  provide equivalent preservation tests before considering it complete.

## Refresh and Cache Settings

Current verified intervals in `js/core/config.js`:

- Headline telemetry refresh: 15 minutes
- Full dashboard refresh: 2 hours
- Sparkline refresh: 10 minutes
- Price refresh: 30 minutes
- Memory cache TTL: 1 minute
- Storage cache TTL: 4 hours

Cache/build details to verify when relevant:

- Service worker cache name: `tezos-systems-v554`
- `version.json` contains the served build stamp.
- `git log -1 --oneline` shows the local current commit.

## Version and Footer Sanity Check

The footer marker at the bottom of `index.html` is intentionally faint but
visible. It is rendered by `js/core/app.js`.

It combines:

- served build metadata from `version.json`
- the exact latest `main` commit fetched from GitHub at runtime via
  `https://api.github.com/repos/Primate411/tezos.systems/commits/main`

Display shape:

- `build <build> · latest <github-main-sha> · stamp <version-json-sha> · <date>`

This split is deliberate. A committed file cannot reliably contain its own
final commit SHA because changing the file changes the commit hash. The exact
latest commit therefore comes from GitHub at runtime; the local committed JSON
remains the served build metadata.

`version.json` is pre-commit stamped, not post-commit stamped.

The stamp script is `scripts/stamp-version.sh`. It writes compact JSON to
`version.json`, then stages the file with `git add`.

Current script behavior:

- `build`: `git rev-list --count HEAD + 1`
- `commit`: `git rev-parse --short HEAD`
- `date`: `date -u +%Y-%m-%d`

Important model:

- During a pre-commit hook, `HEAD` is still the previous commit.
- The displayed commit hash is therefore intentionally one commit behind.
- The build number predicts the commit count after the commit being created.
- Treat `build` as the authoritative deployed-version handle.
- Treat `commit` as a breadcrumb to the parent/pre-commit `HEAD`, not the exact
  deployed commit.

Illustrative verified example from the first footer implementation commit:

- `version.json` says `{"build":336,"commit":"0848b45","date":"2026-05-01"}`.
- Local `HEAD` after that commit was `e94e7de`.
- `git rev-list --count HEAD` after that commit was `336`.
- This is consistent with version metadata stamped before commit `e94e7de`,
  when `HEAD` still pointed at `0848b45`.
- On the next normal commit from that state, the script would stamp build `337`
  and commit `e94e7de`.

Frontend rendering:

- `js/core/app.js` fetches `version.json` with `cache: 'no-store'`.
- It also fetches the latest GitHub `main` commit with `cache: 'no-store'`.
- `sw.js` treats `/version.json` as network-first so the footer sanity check is
  not quietly fed stale cache metadata.
- `sw.js` also uses network-first with cache fallback for same-origin shell
  assets. New workers wait for the visible Update action before taking control,
  preventing mixed HTML/module builds. Offline navigations deliberately render
  `offline.html`; cached assets are not presented as an offline live dashboard.
- Cross-origin API requests bypass Cache Storage; failed requests return an
  explicit unavailable response so stale telemetry cannot masquerade as live.

Hook installation caveat:

- The repo now contains a tracked `.githooks/pre-commit` wrapper that runs the
  README sync guard, refreshes commit-relevant generated surfaces through
  `scripts/refresh-generated-surfaces.mjs`, runs focused README contract checks,
  then runs `scripts/stamp-version.sh`.
- This checkout has `core.hooksPath` set to `.githooks`, so the hook is active
  locally.
- Git hooks are local and do not travel with the repo.
- New clones need `git config core.hooksPath .githooks` once, or README sync,
  governance refresh, and `version.json` stamping will not run automatically.
- `npm run install-hooks` runs that config command.

Stamping gotchas:

- `git commit --no-verify` skips local hooks and can deploy stale README,
  governance, or `version.json` metadata.
- `git commit --amend` can keep the same build number because commit count does
  not increase; the hash still points at the pre-amend `HEAD`.
- Rebases and cherry-picks can change the meaning of `build` because it is based
  on commit count. This is acceptable for a linear GitHub Pages flow, but muddy
  on messy branches.
- GitHub Pages serves committed files as-is. There is no current CI deploy step
  that rewrites `version.json` with the final `GITHUB_SHA`.
- Exact final commit hashes would require CI stamping with `GITHUB_SHA` and
  either committing generated changes back or deploying a generated artifact
  instead of raw repo contents.

## Feature Modules

- Governance: `js/features/governance.js`, `js/features/chamber.js`
- Tezos Maxis: `js/features/maxis.js`; source presentation lives in
  `css/maxis.css` rather than the main minified bundle. Maxis is the default
  canonical all-lane room and uses each crown's honest natural clock; Season is
  the separate protocol-bounded game, Passport combines career and season
  progress, and Champions is the finalized archive. Passport career reads one
  verified address shard from every manifest season; it must preserve repeated
  season-scoped badge receipts and keep historical shard failures local.
- TezosCRP: `js/features/tezoscrp.js`; this is a separate human-identity
  recognition archive, not a Maxis lane. Count official category listings and
  distinct recognized months separately, never infer missing per-person XTZ
  payouts, and retain an official Tezos Commons source on every award row.
- Cycle History Chamber: `js/features/history.js`; `/history/` exposes fifteen
  captured signals from five Supabase ledgers with 24h/7d/30d/all ranges,
  source-specific cadence and returned coverage. A failed range refresh must
  retain the complete last-good charts and route; a valid empty ledger is an
  empty range, not a source failure. Protocol Anthology remains a separate
  app-shell surface in `js/core/app.js`.
- Ecosystem Activity: `js/features/ecosystem-chamber.js`; `/ecosystem/` ranks
  reviewed Tezos L1 and Etherlink apps by distinct active wallet addresses in
  the last completed UTC week. Keep the current week explicitly partial and
  unranked, never infer cross-layer ownership, and load only
  `data/ecosystem-entry-summary.json` before the room opens.
- Baker tools: `leaderboard.js`, `my-baker.js`, `my-tezos.js`,
  `rewards-tracker.js`, `baker-report-card.js`. `leaderboard.js` also owns the
  `/leaderboard/` Baker Directory Chamber: Discover uses disclosed strict
  filters and lexicographic factual ordering, never a blended quality score.
- Market tools: `price.js`, `price-intelligence.js`, `calculator.js`,
  `comparison.js`
- Critical Minerals Chamber: `js/features/minerals-chamber.js`; `/minerals/`
  preserves the canonical final 2025 U.S. 60-item taxonomy, form-specific
  2021–2025 USGS observations, raw qualifiers, source-native units and clocks,
  group-only REE/PGM context, explicit gaps, and a bounded ten-product World
  Bank monthly market subset. Its Etherlink view keeps Metals.io-attributed xCo,
  xNi, and RARE product statements and RARE composition separate from bounded
  Blockscout token metadata, counters, holder-address, latest-transfer, and
  verified-proxy receipts. Do not infer backing, custody, entitlement, people,
  ownership, liquidity, price, reserves, redemption, or execution; do not fold
  xU3O8, VNXAU, commercial catalogs, token contracts, or thermal-coal prices into
  the taxonomy; provide no execution action; and do not infer element-level
  values from grouped observations.
- Precious Metals Chamber: `js/features/metals-chamber.js`; `/metals/` covers
  gold, silver, platinum, palladium, rhodium, ruthenium, iridium, and osmium.
  IMF gold/silver/platinum/palladium history is completed-month data; any
  separately sourced indicative current observation keeps its own clock and is
  not an executable spot quote or IMF close. Preserve source-native aggregation
  for USGS PGM data and render unavailable osmium pricing as unavailable, never
  zero. Keep VNXAU venue quotes, Tezos and Etherlink contract state, issuer
  terms, operational notices, and dated agreed-upon-procedures evidence
  independent. Never infer custody, ownership, liquidity, redemption,
  cross-chain backing, or execution from token activity or issuer material, and
  provide no buy/sell/swap/bridge/redeem action.
- Whale Watch Chamber: `js/features/whale-chamber.js`, with shared operation
  semantics in `whales.js` and local dormant-account monitoring in
  `sleeping-giants.js`. `/whales/` unifies the generated complete 24-hour
  transfer archive, bounded all-or-nothing live transaction/delegation/stake/
  unstake lanes, grouped flow stories, Deep Sleep, and receipt-to-receipt
  awakenings. TzKT aliases are source context, not inferred ownership; legacy
  `#giants` opens the Chamber's Deep Sleep view.
- Activity feeds: `moments.js`, `cycle-pulse.js`, `daily-briefing.js`
- Network Health: `js/features/network-health.js`; Home Live Head combines the
  newest four desktop or three mobile TzKT blocks, the exact next round-zero
  baking right, catalog-backed human contents, one optional size-aware quiet-
  baker line for missed rights in the visible sample, and the site-wide search
  well. Keep the R0 right explicitly non-guaranteed, classify only reviewed
  Art/DeFi/Gaming/Bridge/Etherlink identities or factual staking/transfers, and
  preserve unavailable receipts as unknown. Background head and supplemental
  updates must keep keyed row DOM, search focus/selection, reader state, last-
  good data, the visibility gate, one catch-up, reduced-motion behavior, first-
  fact reveal only once, and announcement-only-on-new-block behavior.
- Staking Chamber: `js/features/staking-chamber.js`; strict applied explicit
  stake/unstake moves over 10,000 tez, with `/stake/` as the chamber route.
  Preserve `/staking/` for the existing explanatory guide.
- OBJKT/HEN: `objkt.js`, `hen-mode.js`
- Extras: `streak.js`, `state-of-tezos.js`, `upgrade-effect.js`,
  `tooltip-tour.js`, `changelog.js`

## UI and Effects

- `js/ui/pulse-ticker.js`: continuously drifting Live Pulse bar, intent pause,
  two-step touch activation, source shelf, and quiet-refresh phase retention.
- `js/ui/theme.js`: theme registry, picker, first-visit landing redirect.
- `js/ui/wayfinder.js`: injects four semantic next steps into chamber overlays
  that do not already provide a native adjacent-room map. Keep contextual
  recommendations visible, but keep exhaustive directories behind an explicit
  disclosure on standalone/mobile surfaces.
- `js/ui/share.js`: html2canvas-powered branded 1200x630 captures, tweet
  picker, card/dashboard/protocol/history sharing.
- `js/ui/gauge.js`: Stake-O-Meter canvas gauge.
- `js/ui/title.js`: dynamic rotating page title.
- `js/effects/matrix-effects.js`: Matrix rain.
- `js/effects/bg-effects.js`: animated themed backgrounds.
- `js/effects/valley-loader.js`: race-guarded lazy loader for the Valley
  painterly background in `js/effects/valley-effects.js`.
- `js/effects/arcade-effects.js`, `audio.js`, `vibes.js`: playful effects.

Verified theme list in `theme.js`:

- `aurora`
- `matrix`
- `hen`
- `default`
- `void`
- `ember`
- `signal`
- `nerv`
- `clean`
- `dark`
- `bubblegum`
- `abyss`
- `moss`
- `valley`
- `warzone`

Theme support is scattered. When changing themes, check `theme.js`, CSS
variables/overrides, `share.js`, `gauge.js`, `history.js`, `bg-effects.js`, and
inline modal styles in `app.js`.

Some theme-aware modules do not fully cover newer themes. In particular,
`gauge.js`, `history.js`, `share.js`, and some `app.js` protocol modal styles
fall back for themes such as `nerv`, `abyss`, `moss`, and `warzone`.

## Data Files

- `data/protocol-data.json`: protocol timeline from Athens through Ushuaia.
- `data/protocol-debates.json`: debate and rejection narratives.
- `data/governance-votes.json`: generated TzKT voting epochs plus
  Exploration/Promotion vote rows, including failed windows.
- `data/governance-refresh-report.json`: generated stale-data audit with live
  current protocol/period, lore coverage, active proposal watch notes, and
  blocker/warning status.
- `data/whale-watch.json`: generated complete TzKT large-account and exact
  trailing-24-hour applied-transfer snapshot. It keeps operation ids distinct
  from group hashes, last-activity timestamps distinct from block levels, and
  awakening moved amounts limited to applied transfers or actual processed
  stake/unstake amounts. Coverage and receipt semantics are validated offline.
- `data/ecosystem-apps.json`: reviewed L1/L2 app identity, start, contract
  discovery, and proof manifest.
- `data/ecosystem-stats.json`: generated complete weekly app and ecosystem
  aggregates, completed-week rankings, partial current-week pulse, frozen
  contract receipts, and stable content hash. Raw wallet sets are never
  published.
- `data/ecosystem-entry-summary.json`: compact integrity-checked launcher
  projection generated from the complete Ecosystem artifact.
- `data/minerals-snapshot.json`: generated canonical 60-item Critical Minerals
  atlas, form-specific USGS supply and annual-price receipts, bounded World Bank
  monthly market history, separate xCo/xNi/RARE product and chain receipts,
  explicit gaps, and stable content/source hashes.
- `data/minerals-entry-summary.json`: compact integrity-checked Critical
  Minerals launcher projection. The complete source and methodology ledger
  loads only after the room opens.
- `data/metals-snapshot.json`: generated eight-metal market, annual-context,
  and VNXAU receipt ledger. It keeps completed-month IMF observations,
  indicative current references, USGS reporting periods, issuer
  evidence dates, and chain observations on separate source clocks with stable
  content and source hashes.
- `data/metals-entry-summary.json`: compact integrity-checked Precious Metals
  launcher projection. The complete source and methodology ledger loads only
  after the room opens.
- `data/maxis-leaders.json`: canonical lane-native-clock Maxis snapshot. It
  intentionally mixes explicitly labeled all-time, all-time-active, live,
  rolling, and cross-lane clocks rather than pretending every crown shares one
  window.
- `data/maxis-careers.json`: mutable canonical career layer, currently covering
  the complete applied ballot/proposal history, voting-period ledger, streaks,
  and current active-delegate ranks. It is deliberately independent of frozen
  protocol-season evaluators and artifacts.
- `data/maxis-l2-governance.json`: independent exact Etherlink governance
  career and all-time-active crown. Official FAST, SLOW, and Sequencer
  `pastPeriods` responses define completed canonical windows; complete TzKT
  participant big-map keys prove applied participation. Score one distinct
  window per represented baker, regardless of extra receipts, proposal count,
  ballot choice, or voting power. Attribute a delegated voting-key transaction
  to the baker stored in governance state, never to its sender. Retain inactive
  careers but rank only the current complete active-delegate set. This artifact
  must not change immutable v2 Season, Season Unicorn, frozen Passport shards,
  or Champions.
- `data/tezoscrp-awards.json`: full official TezosCRP archive from October 2020
  onward. Recipients are merged only through the evidence-backed
  `data/tezoscrp-identity-aliases.json` registry because the program does not
  publish a verified wallet for each winner. Preserve raw published names,
  handles, aliases, categories, periods, and source receipts; keep uncertain
  lookalikes in `pending_review` rather than guessing.
- `data/tezoscrp-summary.json`: compact launcher/latest-winners projection of
  the full TezosCRP archive. Its totals must reconcile exactly to the full file.
- `data/maxis/manifest.json`: protocol-season catalog and active/settling/final
  lifecycle entry point. Each `data/maxis/seasons/<season-id>/` directory keeps
  its frozen rules, summary, integrity-checked Passport shards, and resumable
  season-owned `transaction-state.json`. A long first scan may also leave a
  signed `transaction-state.building.json` resume sidecar; it is never a
  publishable receipt and must not advance the manifest, summary, or Passport
  hashes until atomically promoted. Both checkpoints are generator input, not
  browser payloads. Final archives must validate from their own
  frozen lane catalog rather than current category constants.
- Maxis Governance has three non-interchangeable clocks: the canonical crown is
  all-time participation among currently active delegates, the current voting
  period supplies live actionable/quiet context, and the protocol-season result
  is an episodic race. A quiet season must not erase the enduring Governance
  Maxi or be presented as evidence that governance participation does not exist.
- Maxis L2 Governance uses its own all-time-active clock and tie-breaks by
  distinct completed windows, track breadth, Promotion windows, receipt count,
  recency, then raw address. It is an ongoing career surface and an independent
  Passport career card, not a new v2 protocol-season lane.
- `data/tweets.json`: share-copy templates used by the share system.
- `data/release-radar.json`: short-lived reviewed forecast receipt for separate
  Tezos X mainnet, Octez, and EVM-node release lanes, including the six Tezos X
  readiness gates, explicit confidence/horizon semantics, exact blockers, and
  primary evidence. Live Pulse keeps the default card compact and opens the
  complete receipt in a dedicated accessible overlay. Expired receipts disappear
  from Live Pulse.
- `data/nakamoto-sources.json`: dated external Nakamoto reports with their
  original thresholds, windows, entity bases, and source provenance.

## Version History Log

- `js/features/changelog.js` contains the in-app version history shown from the
  Changelog button.
- Any time an agent fixes, adds, removes, or materially changes behavior, update
  the `CHANGELOG` array in `js/features/changelog.js` in the same change set.
- Add the newest date section at the top of the array, or append entries to the
  current date section if one already exists.
- Keep entries concise and user-facing. Use the existing `type` conventions:
  `✨` for features, `🔧` for fixes/behavior changes, `🎨` for visual work,
  `⚡` for performance/caching, and `🔒` for security.
- Do not use `version.json` as the human changelog. `version.json` is only the
  build/footer sanity metadata.

## Widgets and Standalone Pages

- `widgets/*.html`: standalone embeds for baker cards, baker count, block
  height, widget builder, combo widget, governance, price, protocol, and staking
  ratio.
- SEO/landing pages include:
  - `staking/index.html`
  - `governance/index.html`
  - `bakers/index.html`
  - `hen/index.html`
  - `compare/index.html`
  - `compare/tezos-vs-*.html`

## Automation and Scripts

- `.github/workflows/collect-data.yml`: scheduled historical data collector,
  currently every 2 hours.
- `.github/workflows/refresh-tezoscrp.yml`: checks the official Tezos Commons
  Medium feed on the 10th and 25th monthly and commits only a new official award
  period. The read-only freshness audit watches its 45-day delivery envelope;
  the six-hour data writer does not poll this feed again.
- `.github/workflows/refresh-governance-surfaces.yml`: six-hour dynamic-data
  writer using failure-isolated lanes. One upstream or validator failure must
  not suppress unrelated successful data; failed lanes retain last-good files
  and the final report still fails the Action.
- `.github/workflows/audit-generated-freshness.yml`: independent read-only
  six-hour audit of committed generated and Supabase delivery clocks.
- `.github/scripts/collect-data.js`: collects TzKT/Octez stats and writes to
  Supabase, with guardrails against critical zero values.
- `scripts/refresh-governance-data.mjs`: canonical governance refresh entry
  point. It updates generated governance vote artifacts from TzKT and fails when
  an accepted/current protocol is missing curated lore in
  `data/protocol-data.json`.
- `scripts/refresh-generated-surfaces.mjs`: manual/pre-commit generated-surface orchestrator.
  Commit mode refreshes governance/feed and root OG on every normal commit, plus
  staged-source outputs for CSS bundles, pretty chamber route shells, sitemap,
  chamber OG images, and compare pages; manual all mode refreshes the full
  generated set. `sitemap.xml` is rendered from `js/core/site-map.js`, while
  pretty Chamber shells remain generated from `scripts/lib/chamber-routes.mjs`;
  static contracts keep those two route identities aligned.
- `scripts/refresh-scheduled-data.mjs`: scheduled dynamic-data runner. Its lane
  catalog and rollback/publish mechanics live in
  `scripts/lib/scheduled-refresh-lanes.mjs` and
  `scripts/lib/scheduled-refresh-runner.mjs`. Targets must be unique and
  declared; an undeclared write is fatal and publishes nothing from that run.
- `scripts/check-generated-freshness.mjs`: read-only operational audit for
  committed artifact age and semantic rollover. Keep deterministic boundary
  coverage in `tests/generated-freshness-check.mjs` and failure injection in
  `tests/scheduled-refresh-check.mjs`.
- `scripts/refresh-tezoscrp-awards.mjs`: parses the official Tezos Commons
  Medium RSS, adds only unseen winner periods, preserves historical category
  names, applies the evidence-backed identity registry, rebuilds the
  full/compact derived summaries, and validates offline with `npm run
  check:tezoscrp`. Parser/alias coverage lives in
  `tests/tezoscrp-check.mjs`.
- `scripts/refresh-whale-watch-data.mjs`: rebuilds `data/whale-watch.json` from
  complete paged TzKT ledgers with a generated-at-bounded 24-hour window and
  receipt-to-receipt awakening intervals. `npm run check:whales` validates the
  committed artifact without network access; scheduled/full generated runs
  refresh it, while normal pre-commit checks it.
- `scripts/refresh-minerals-data.mjs`: rebuilds
  `data/minerals-snapshot.json` and `data/minerals-entry-summary.json` from the
  final 2025 federal list, USGS MCS 2026/data-release receipts, and the bounded
  World Bank monthly subset plus reviewed Metals.io/Blockscout receipts through
  `npm run refresh:minerals`. `npm run check:minerals` validates taxonomy,
  hashes, payload budgets, forms, units, qualifiers, clocks, group context,
  market membership, explicit gaps, contracts, and product-versus-chain
  non-inference boundaries without network access.
- `scripts/refresh-metals-data.mjs`: rebuilds `data/metals-snapshot.json` and
  `data/metals-entry-summary.json` from the reviewed IMF, USGS,
  token-market, issuer, and chain receipts through `npm run refresh:metals`.
  `npm run check:metals` validates the eight-metal taxonomy, hashes, units,
  payload budgets, independent clocks, unavailable values, contracts, and
  non-inference boundaries without network access. Failed sources preserve only
  their own last-good section as stale.
- `scripts/refresh-ecosystem-stats.mjs`: exhaustively pages aliased TzKT
  contracts, resolves and freezes the reviewed contract universe, reconstructs
  complete weekly Tezos/Etherlink active-wallet and interaction history, and
  uses one complete Blockscout transaction CSV export per reviewed Etherlink
  contract for full backfills. Incremental runs use paced bounded JSON ranges
  and rebuild a warm-up week plus the latest three completed weeks. Newly
  discovered alias contracts remain append-only and move the rebuild boundary
  to their first eligible week. `npm run check:ecosystem`
  validates the manifest, content, and exact contract-universe receipts without
  network access; scheduled/full generated runs refresh it before launcher
  projections.
- `scripts/refresh-maxis-l2-governance.mjs`: rebuilds the independent L2
  Governance career artifact from all three official Etherlink canonical-period
  ledgers and complete TzKT big-map key receipts. The command
  `npm run check:maxis-l2-governance` validates the committed reconstruction and
  stable content hash without network access. Pre-commit checks it before other
  Maxis artifacts; the isolated scheduled lane and manual all-mode refresh it
  before the remaining Maxis family.
- `scripts/refresh-maxis-data.mjs`: generates the canonical mixed-clock Maxis
  board and frozen protocol-season artifacts. It must run after governance refresh,
  preserve active rules and finalized archives byte-for-byte, open a new season
  at activation while the prior one settles for 24 hours, and fail closed on a
  non-adjacent protocol jump rather than assigning an ending season the wrong
  boundary. `npm run check:maxis` validates without rescanning live sources.
- `scripts/refresh-maxis-careers.mjs`: rebuilds the separate all-history
  Governance career artifact from TzKT count receipts and terminal period
  exhaustion. `npm run check:maxis-careers` validates the committed artifact,
  and normal pre-commit runs check it without rewriting frozen season data.
- `scripts/lib/maxis-evaluator-v2.mjs` and
  `scripts/lib/maxis-source-v2.mjs`: immutable v2 scoring plus source/build
  semantics. `scripts/lib/maxis-transactions-v2.mjs` owns the resumable exact
  transaction state, and `scripts/lib/maxis-artifact-budget.mjs` measures the
  committed UTF-8 envelope (pretty core artifacts, compact Passport shards).
  Future evaluators must register as new
  versioned modules; changing a v2 semantic dependency invalidates
  active/settling v2 rules and is not a routine refactor. Active artifacts are
  capped at 16 MiB for the transaction state, 1 MiB per Passport shard, and 64
  MiB for rules + summary + state + shards; a budget fallback may withhold
  Transaction but must never truncate its eligible-wallet Passport set.
- `scripts/generate-milestone-catalog.mjs`: refreshes
  `data/milestone-catalog.json` from an Octez block/cycle head plus TzKT indexed
  statistics when either 14 days or 100 commits have elapsed. The pre-commit
  path projects the pending commit; scheduled runs use wall-clock age, and
  `--force` bypasses both gates. Preserve unexpired `recentCrossings` receipts
  across refreshes so every visitor shares the same 72-hour celebration window;
  block-height milestones use their target block timestamp and every 100th
  cycle uses its exact Octez boundary timestamp, falling back to the official
  Octez archive when the primary RPC has pruned that historical level. Cycle
  1250 remains a curated landmark.
- `scripts/refresh-nakamoto-sources.mjs`: refreshes reproducible Chainspect and
  Edinburgh EDI rows server-side, preserves manual/secondary reports and
  last-known-good data, and validates locally with `--check` during pre-commit.
- `scripts/update-governance-votes.mjs`: compatibility wrapper around
  `scripts/refresh-governance-data.mjs`.
- `scripts/stamp-version.sh`: updates `version.json` and stages it.
- `scripts/generate-og-image.js`: uses Playwright to generate OG imagery from
  live data.
- `scripts/lib/playwright-browser.cjs`: shared Playwright Chromium launcher for
  smoke and OG scripts, including system-browser fallback.

## Governance Stale-Data Control

- Use `npm run refresh:governance` as the single command before touching
  governance/protocol data. It refreshes `data/governance-votes.json` and
  `data/governance-refresh-report.json`.
- The tracked `.githooks/pre-commit` runs
  `scripts/refresh-generated-surfaces.mjs --mode precommit --stage` before
  version stamping, so generated governance/feed artifacts and other
  source-relevant generated outputs are refreshed on every normal commit.
- `npm run update:governance-votes` remains as an alias for older instructions,
  but new work should name `refresh:governance`.
- If Exploration or Promotion fails, the generated vote history should pick it
  up automatically from TzKT and The Chamber should show it in historical
  context.
- If a proposal reaches Adoption or becomes the current protocol and
  `data/protocol-data.json` does not have lore for it, the refresh report should
  block the commit. Add a balanced, sourced protocol entry before proceeding.
- For accepted protocol lore, use official Octez/changelog docs for technical
  facts, then steelman the TezosAgora and X/community debate on both sides.
  Keep `headline`, `changes`, `debate`, `contention`, and `history` aligned so
  the front page, tooltips, share cards, and Chamber names do not drift.

## Known Stale or Risky Claims

- README is guarded by `scripts/guard-readme-sync.mjs` plus
  `tests/static-checks.mjs --readme-only`; staged changes to documented
  contracts should stage `README.md` too, or use `SKIP_README_GUARD=1` after a
  deliberate no-docs-needed audit.
- Mainnet age and anniversaries use the Block 1 timestamp
  `2018-06-30T17:39:57Z` from `js/core/mainnet.mjs`, re-exported by `config.js`.
- A comment near the comparison section says it defaults visible, but the local
  storage toggle defaults to hidden unless explicitly set to `true`.
- TzKT filters can be surprising. The shared Whale archive uses complete paged
  server-side thresholds, while its explicitly bounded live tape filters large
  delegation balances and processed staking amounts client-side. All four live
  lanes must succeed before a new snapshot is committed; keep the last-good
  tape on any lane failure. Sleeping Giants remains a bounded local monitor,
  while the generated artifact is the shared Deep Sleep source.
- Share captures are fragile. Test visually after touching share UI, chart
  rendering, gradient text, canvas conversion, or word spacing.
- Service worker cache can hide changes during QA. Hard refresh or unregister
  the service worker if behavior looks stale.

## Browser QA Checklist

Use a real browser for visual verification. The app is heavily theme-dependent
and localStorage-dependent.

Check at least:

- fresh load with default state
- one dark theme and one light theme
- mobile width and desktop width
- live stats render without CSP errors
- share capture opens and produces a sane image
- protocol history modal remains readable
- Tezos Maxis opens on its scannable all-lane canonical crown overview, while
  Season keeps one lane expanded at a time. The circular selector appears only
  where selecting a season changes the result and remains contained on mobile.
  Passport separates career records from current-season progress, shard/hash
  errors stay local, and no active/settling result appears as a finalized
  champion
- My Baker / My Tezos drawer still opens
- service worker/cache does not serve stale edited assets
