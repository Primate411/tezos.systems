# Tezos Systems

Real-time Tezos network dashboard for consensus, economics, governance, market
state, baker activity, and ecosystem signals.

Live site: [tezos.systems](https://tezos.systems)

## What This Is

Tezos Systems is a static, client-side dashboard for understanding what is
happening on Tezos without digging through several explorers and data services.
It is built for bakers, stakers, governance watchers, and people who want a
fast read on network health.

The app is vanilla HTML, CSS, and JavaScript ES modules. There is no runtime
framework, no bundler, and no client-side build step for JavaScript or HTML.
The repo does use npm tooling for reproducible installs, smoke tests, CSS
minification, Playwright, governance refresh scripts, and shared git hooks.

## Current Reality

- Live hosting: GitHub Pages with custom domain from `CNAME`; the validation
  workflow publishes a `main` artifact only after static and browser checks pass.
- Local server: `npm run serve`, which runs `python3 -m http.server 9000`.
- Served stylesheet: `css/styles.min.css`; edit `css/styles.css` first, then
  run `npm run build:css`.
- Critical first-paint skeletons live in `css/loading.css`.
- Shared hook wrapper: `.githooks/pre-commit`; enable it once per clone with
  `npm run install-hooks`.
- README sync guard: pre-commit blocks when staged changes touch
  README-documented behavior but `README.md` is not staged.
- Version metadata: `version.json` is stamped by the pre-commit hook, carries
  the latest user-facing changelog entry for the update transmission, and is
  shown in the faint footer build marker alongside the latest GitHub `main`
  commit.
- Standard verification: `npm test`, which runs static checks and browser smoke
  tests.

## Project Structure

```text
tezos.systems/
├── index.html                         # Main SPA shell, CSP, schema, dashboard DOM
├── landing.html                       # Welcome and SEO landing page
├── css/
│   ├── styles.css                     # Source dashboard styles and themes
│   ├── styles.min.css                 # Served base dashboard stylesheet
│   ├── loading.css                    # Critical first-paint skeleton states
│   ├── network-health.css             # Lazy Network Health detail-panel styles
│   ├── capital.css                    # Lazy Capital Chamber styles
│   ├── minerals-chamber.css           # Lazy Critical Minerals atlas/market styles
│   ├── uranium-chamber.css            # Lazy Uranium market/proofbook styles
│   ├── ecosystem.css                  # Lazy Ecosystem Activity Chamber styles
│   ├── leaderboard.css                # Lazy Baker Directory Chamber styles
│   ├── whale-chamber.css              # Lazy Whale Watch Chamber styles
│   ├── history-chamber.css            # Lazy Cycle History Chamber styles
│   ├── tezoscrp.css                   # Lazy TezosCRP Recognition Hall styles
│   ├── themes/                        # Generated lazy-loaded theme bundles
│   ├── hen-mode.css                   # HEN overlay styles
│   └── landing.css                    # Landing and SEO page styles
├── js/
│   ├── core/
│   │   ├── app.js                     # App orchestration, DOM wiring, refresh loop
│   │   ├── api.js                     # TzKT, Octez RPC, Supabase, Tezos data fetches
│   │   ├── config.js                  # Endpoints, refresh intervals, constants
│   │   ├── etherlink-governance-contracts.mjs # Reviewed L2 governance lineage
│   │   ├── tzkt-throttle.js           # Browser-local TzKT request pacing
│   │   ├── protocol-count.js          # Human-facing upgrade count convention
│   │   ├── home-layout-preload.js      # Render-blocking saved Home visibility
│   │   ├── wallet.js                  # Lazy Octez.Connect wallet bridge
│   │   ├── storage.js                 # localStorage/sessionStorage wrappers
│   │   └── utils.js                   # Formatting, sanitization, utility helpers
│   ├── features/                      # Governance, LB, bakers, market, feeds, widgets
│   ├── ui/                            # Theme, Home/Explore visibility, share, toast queue, gauge, title, animations
│   └── effects/                       # Matrix, themed backgrounds, audio/vibes, data-magic text reveals
├── data/
│   ├── protocol-data.json             # Activated protocol timeline and lore
│   ├── search-catalog.json             # Generated compact site-wide search index
│   ├── protocol-debates.json          # Debate/rejection narratives
│   ├── governance-votes.json          # Generated governance vote history
│   ├── governance-refresh-report.json # Generated stale-data/lore audit
│   ├── milestone-catalog.json         # Cadence-generated milestone thresholds
│   ├── nakamoto-sources.json          # Dated external Nakamoto source ledger
│   ├── chain-comparison-verification.json # Monthly double-check receipts for static comparison numbers
│   ├── capital-snapshot.json          # Generated, source-receipted Capital snapshot
│   ├── capital-entry-summary.json     # Compact integrity-checked Capital launcher projection
│   ├── minerals-snapshot.json         # Generated critical-minerals atlas, supply, and market proofbook
│   ├── minerals-entry-summary.json    # Compact integrity-checked Critical Minerals launcher projection
│   ├── uranium-snapshot.json          # Generated xU3O8 market, physical-evidence, and chain proofbook
│   ├── uranium-entry-summary.json     # Compact integrity-checked Uranium launcher projection
│   ├── metals-snapshot.json           # Generated eight-metal market, supply, and receipt proofbook
│   ├── metals-entry-summary.json      # Compact integrity-checked Precious Metals launcher projection
│   ├── ecosystem-apps.json            # Reviewed L1/L2 app and contract-discovery manifest
│   ├── ecosystem-stats.json           # Network-wide active addresses plus reviewed-dapp history
│   ├── ecosystem-entry-summary.json   # Compact network and dapp Ecosystem launcher projection
│   ├── whale-watch.json               # Complete 24h whale/dormancy snapshot and receipts
│   ├── maxis-contracts.json            # Reviewed app/entrypoint taxonomy
│   ├── maxis-careers.json              # Exact all-history governance career records
│   ├── baker-governance-signals.json    # Compact Baker Directory governance projection
│   ├── maxis-l2-governance.json         # Exact all-history Etherlink governance careers
│   ├── maxis-leaders.json              # Generated canonical lane-native-clock Maxis snapshot
│   ├── tezoscrp-awards.json             # Full official human-identity recognition archive
│   ├── tezoscrp-awards.compact.json     # Lossless dictionary-encoded browser projection
│   ├── tezoscrp-identity-aliases.json    # Evidence-backed identity continuity registry
│   ├── tezoscrp-summary.json            # Compact launcher/latest-winners projection
│   ├── maxis/
│   │   ├── entry-summary.json          # Compact integrity-checked Maxis launcher projection
│   │   ├── manifest.json               # Protocol-season index and active season
│   │   └── seasons/<season-id>/
│   │       ├── summary.json            # Season lanes, standings, deltas, and Honors
│   │       ├── rules.json              # Frozen season scoring and badge rules
│   │       ├── transaction-state.json  # Last complete signed accumulator; not a browser payload
│   │       ├── transaction-state.building.json # Optional signed resume sidecar; never publishable
│   │       └── passports/00.json..3f.json # 64 deterministic address buckets
│   └── tweets.json                    # Share-copy templates
├── widgets/                           # Standalone embeddable widgets, shared runtime, and builder
├── staking/ governance/ bakers/ hen/ compare/
│                                      # SEO and standalone pages
├── chamber/ pulse/ capital/ minerals/ uranium/ metals/ ecosystem/ whales/ stake/ leaderboard/ history/ maxis/ tezoscrp/ health/ tezosx/ l2chamber/ tz4/ lb/ ledger-flow/ domains/ ctez/
│                                      # Pretty share/OG routes into live Chambers
├── og/                                # Generated per-chamber OG images
├── feed.xml                           # Generated Tezos governance RSS feed
├── llms.txt                           # Generated canonical routes and public-data catalogue
├── _config.yml                        # Include dot-prefixed public paths in GitHub Pages
├── supabase/
│   └── migrations/                    # SQL contract for historical capture
├── tests/
│   ├── static-checks.mjs              # Dependency-free repo contract checks
│   └── smoke.mjs                      # Playwright browser smoke suites
├── scripts/
│   ├── resolve-playwright-version.mjs # Portable GitHub Actions cache-key output
│   ├── refresh-governance-data.mjs    # Canonical governance refresh command
│   ├── refresh-maxis-data.mjs         # Canonical Maxis and protocol-season artifacts
│   ├── refresh-maxis-careers.mjs      # Canonical governance career history
│   ├── generate-baker-governance-signals.mjs # Compact Baker Directory governance projection
│   ├── refresh-maxis-l2-governance.mjs # Canonical Etherlink governance career history
│   ├── refresh-nakamoto-sources.mjs   # Dated external Nakamoto source ledger
│   ├── refresh-capital-data.mjs       # Public-source Capital snapshot generator/checker
│   ├── refresh-minerals-data.mjs      # Critical Minerals snapshot and launcher generator/checker
│   ├── refresh-metals-data.mjs        # Precious Metals snapshot and launcher generator/checker
│   ├── refresh-ecosystem-stats.mjs    # Network active-address and reviewed-dapp generator/checker
│   ├── generate-ecosystem-entry-summary.mjs # Compact Ecosystem launcher projection
│   ├── refresh-whale-watch-data.mjs   # Complete large-transfer/dormancy snapshot generator
│   ├── refresh-tezoscrp-awards.mjs    # Official Medium RSS award refresh/checker
│   ├── lib/maxis-l2-governance.mjs     # Etherlink career scoring and validation
│   ├── lib/maxis-artifact-budget.mjs  # Exact pretty-JSON byte-budget receipts
│   ├── lib/maxis-evaluator-v2.mjs     # Immutable v2 season scoring/validation
│   ├── lib/maxis-source-v2.mjs        # Immutable v2 source/query and build adapter
│   ├── lib/maxis-transactions-v2.mjs  # Immutable v2 transaction checkpoint semantics
│   ├── refresh-generated-surfaces.mjs  # Manual/pre-commit generated-surface orchestrator
│   ├── refresh-scheduled-data.mjs      # Failure-isolated scheduled data delivery
│   ├── check-generated-freshness.mjs   # Cross-family cadence and rollover alarm
│   ├── generate-chamber-routes.mjs    # Pretty Chamber route generator
│   ├── generate-anthology-routes.mjs  # Per-chapter Anthology share-route generator
│   ├── generate-chamber-og-images.mjs # Per-Chamber OG image generator
│   ├── generate-milestone-catalog.mjs # 14-day/100-commit milestone refresh
│   ├── bake-compare-pages.mjs         # Static compare-page content baker
│   ├── build-css.mjs                  # Base/theme CSS splitter and minifier
│   ├── update-governance-votes.mjs    # Compatibility wrapper
│   ├── latest-changelog-entry.mjs     # Latest user-facing release-note projection
│   ├── stamp-version.sh               # Pre-commit version metadata stamp
│   └── generate-og-image.js           # Valley root OG social-card generator
├── .github/scripts/
│   ├── collect-data.js                # 2-hour global Supabase history row
│   ├── collect-chamber-history.js     # 30-minute chamber/domain snapshots
│   └── supabase-write.js              # Idempotence-aware bounded write retries
├── .githooks/pre-commit               # Shared local hook wrapper
├── LICENSE                             # Mozilla Public License 2.0 terms
├── NOTICE                              # Project attribution and license scope
├── sw.js                              # Bounded shell cache and offline strategy
├── version.json                       # Served build metadata
├── site.webmanifest
├── robots.txt
└── sitemap.xml
```

## Runtime Flow

1. `index.html` loads `css/styles.min.css` and `js/core/app.js` as an ES
   module.
   All 25 generated Chamber routes and the 22 Protocol Anthology chapters use
   `js/core/standalone-chamber.js` instead: no hidden home DOM or dashboard
   refresh starts until the visitor leaves or searches. My Tezos, Anthology,
   and the directory reuse deferred app controllers without initializing home.
   Other rooms import their own feature directly. History/Chart.js load only
   for a chart surface; shared Octez receipts no longer import the Health UI.
   Static drawer/chart nodes and room module instances survive the same-document
   home handoff, and a failed handoff leaves the reading surface available.
   Only the selected animated theme's existing painter loads before home.
2. `app.js` installs `js/core/tzkt-throttle.js` before feature startup so
   browser-side TzKT API fetches are queued at six request starts per second.
   Standalone landing, compare, and widget entry points import the same shim
   for their separate browser windows or iframes. Widget pages go through
   `widgets/runtime.js`, which also shares the dashboard theme metadata,
   endpoint config, fetch retry/cache helper, and widget catalog.
3. `app.js` initializes feature modules behind safe wrappers, registers the
   service worker, handles deep links, and starts the refresh loop.
4. Cached stats and protocol data are displayed first when available.
5. First-visit default content is the Live Head block/search panel plus the question-led
   Explore Tezos section at `/chambers/`.
   During proposal and ballot windows, a compact Governance Alert strip sits
   above Chambers and reuses the live voting/My Tezos baker-vote logic to expose
   Chamber, My Tezos, RSS, and browser-reminder actions. Outside active voting
   windows, the strip stays hidden. Explore now leads with Ecosystem Activity
   open, while every other live signal and specialist tool stays folded by
   category; legacy `#section=...` links can
   still reveal the inline stat sections for focused QA and deep links.
6. Background refreshes update hero stats, comparison data, governance state,
   cycle pulse, daily briefing, rewards tracker, price intelligence, baker
   tools, leaderboard, My Tezos, and share-ready UI through quiet DOM
   reconciliation: timed updates preserve page and chamber scroll, focused
   controls, text selection, and existing panel nodes, including when several
   cards change in the same refresh. Hidden tabs defer network polling until
   they become visible. Welcome, streak,
   anniversary, network-moment, and cycle toasts go through a shared priority
   queue after the hero arrival settles so first-load signals do not stack over
   one another.
7. Sparkline cards draw their series from historical snapshots, then align the
   final point with the latest live stat so chart endpoints and card values
   agree.
8. DOM elements are updated directly by id and class. There is no app state
   framework.

Current refresh and cache intervals from `js/core/config.js`:

- Headline telemetry refresh: 15 minutes; full dashboard refresh: 2 hours.
- Sparkline refresh: 10 minutes.
- Price refresh: 30 minutes.
- Memory cache TTL: 1 minute.
- Storage cache TTL: 4 hours.

## Themes

There are 15 visual themes in `js/ui/theme.js`. `aurora` is the default theme.
The theme picker groups animated themes separately from classic data-focused
themes, and stores the selection in `localStorage` under
`tezos-systems-theme`. Every picker row includes a compact copy control for its
canonical `#theme=<name>` direct link, such as `/#theme=valley`; a valid hash
theme takes precedence over the saved preference from first paint onward.
Aurora's header title uses a desktop-specific multicolor sweep so the one-line
wordmark stays as vivid as the wrapped mobile title.
Character-by-character theme reveals reserve the settled text geometry: their
temporary words and glyphs stay inline, and Chamber metric styles target only
their real label/value children. Initial and changed values therefore cannot
turn into vertical lettering, resize cards, or replace surrounding view nodes.
Visible first values reveal after their loading shell arrives, and later reveals run
only when the verified formatted value changes. Duplicate publishers preserve
the reveal already in flight instead of canceling it. Offscreen, hidden, and
reduced-motion updates settle immediately; ambient personality stays
decorative instead of mutating readable data.

| Theme | Role |
|-------|------|
| `aurora` | Default animated aurora theme |
| `matrix` | Terminal/data-rain theme |
| `hen` | hic et nunc terminal/CRT theme |
| `default` | Midnight classic |
| `void` | Deep-space particle theme |
| `ember` | Warm particle theme |
| `signal` | Tech/signal theme |
| `nerv` | Operations-console theme |
| `clean` | Light analytics theme |
| `dark` | Achromatic dark analytics theme |
| `bubblegum` | Pink playful theme |
| `abyss` | Deep-ocean theme |
| `moss` | Green organic theme |
| `valley` | Warm painterly landscape with gently swaying trees, dense full-depth meadow grass, and an earthy path ending at a hilltop bench |
| `warzone` | Amber command theme |

HEN is both a selectable persisted dashboard theme and a separate live-feed
overlay entry point. `/hen/` is the canonical, crawlable live-feed page and
opens the collecting surface immediately; the legacy `/?hen=1` entry still
activates the feed and canonicalizes to `/hen/`. The feed shows Teia/HEN contract mints and OBJKT artist
collection mints together by default. The HEN overlay uses a fixed grid shell:
header, status, feed, and CLI rows stay stable while terminal scrollback, new
mint pulses, the collecting hint, idle/listening state, and the now-playing
arrival panel float off-flow over the feed. Live arrival chrome is suppressed
while the expanded piece viewer is open, `now playing` is throttled to avoid
interrupting readers, and the sticky new-mints pill accumulates unseen mints
until the visitor jumps back to the top. The visible HEN filter bar is the
primary collecting surface: explicit Source, Price (ꜩ), Edition, and Sort
labels keep its for-sale, price, search, edition, sort, saved, hide-owned, and
shuffle controls understandable without requiring the CLI; desktop gets
a clipped edge fade when controls overflow, while mobile keeps the controls
collapsed behind an anchored `filters` toggle; opening it drops the filter tray
below the status line without dislodging the toggle. First-time HEN visitors see
a dismissible hint that points
them to For Sale plus wallet-owned flags. Inside the HEN CLI,
`all`, `teia`, and `objkt` switch source scope; `forsale on|off`,
`price <max>`, `editions <max>`, `sort <newest|cheapest|scarce>`,
`saved on|off`, `hideowned on|off`, `wallet <tz1...|name.tez|me|clear>`,
`random`/`r`, `crt`, and `filters` mirror or extend the visible controls. CLI
dismissal clears retained scrollback, `artist <tz1...>` validates Tezos
addresses before querying, and global arrow/random shortcuts stop at the
expanded viewer boundary. The selected source and sort are remembered for the
next HEN session, and non-newest sorts show that live prepend is paused instead
of silently going quiet. HEN
starts from the current My Tezos
address when one is saved, and its wallet controls explain that connecting flags
owned pieces; they can pair through Octez.Connect, accept a raw address, or
resolve a `.tez` name. Any HEN address update writes back to My Tezos and saved
address history. HEN preloads Octez.Connect on entry, keeps wallet pairing
overlays visible above the NFT overlay, and returns the connect control to a
retryable state if a wallet prompt never answers. New live arrivals prepend
themselves into the top of the feed automatically when the feed is sorted by
newest; if a visitor is scrolled down, the feed compensates scroll position and
shows a floating `new mints` pill instead of shoving visible cards. Quiet newest
polls let the header dot enter a real `listening` state, busy poll windows page
through multiple fresh batches before advancing the high-water mark, and long
sessions cap token/profile/domain caches while card timestamps update only while
HEN is active. Teia cards carry a cyan left edge, OBJKT cards carry a green top
edge, and source tabs pulse when a source delivers a mint. HEN card media retries
failed IPFS loads across fallback gateways, HEN grid/profile thumbnails load from
OBJKT's media CDN first before falling back to live IPFS gateways, and video
pieces autoplay only for the first eager rows or on hover/focus. The overlay now
owns the reusable OBJKT profile stats for owned NFTs, recent acquisitions,
created NFTs, marketplace activity, and lifetime totals.

Theme support is intentionally broad but scattered. When changing themes, check
`js/ui/theme.js`, CSS variables and overrides, `js/ui/share.js`,
`js/ui/gauge.js`, `js/features/history.js`, `js/effects/bg-effects.js`, and
inline modal styles in `js/core/app.js`.

## Main Surfaces

- Setup starts with **Customize home**, a device-local six-switch layout for
  the unified Live Head block/search panel, the continuously drifting Live
  Pulse ticker (including its governance strip), Explore Tezos, Network Moments, and the Keep Exploring
  handoff, plus the Credits and sources footer. Every block is shown by default
  and also has an inline eye-off action with Undo. The header, Setup, and My
  Tezos are permanent recovery surfaces; blocks are not reordered. Preferences use
  `tezos-systems-home-layout-v1` with the shape
  `{ "version": 1, "hidden": ["live-head", "live-pulse", "explore", "moments", "handoff", "credits"] }`,
  synchronize between open tabs, and never leave the current browser/device.
  Explicit Home deep links and the `/` search shortcut reveal and save their
  target, while the guided tour temporarily reveals all six without changing
  the saved layout.
- Live Pulse sits directly above Live Head as a right-to-left signal
  ticker with word-aware, content-sized labels and narrow feathered edges aligned
  to the Home content column. Hover, tap, or keyboard focus on either repeated run
  pauses a signal and opens its correctly anchored detail shelf; activating the
  held signal opens its source Chamber. All items keep one transparent surface;
  priority, breaking, and milestone states use explicit words, type color, and
  weight instead of persistent card highlighting, and regular/priority items do
  not reserve a leading glyph. Motion pauses off-screen and in hidden tabs,
  becomes an unfaded manual horizontal scroller under reduced motion, and
  retains its exact phase across quiet background refreshes.
  Contested-round news starts at **R2**; R0 and R1 remain ordinary block
  receipts and do not consume the contested-round alert cooldown. The new R2
  cooldown ignores timestamps from the previous R1-inclusive alert policy.
  R1+ block rows list prior-round missed baking rights separately, including
  both R0 and R1 on an R2 block. Only exact TzKT `status=missed` receipts name a
  missed baker; missing identities remain unavailable. These pills are not
  activity-filtered, and the inspector preserves the full per-round identities,
  TzKT/My Tezos links, and the same reading lock as the rest of the receipt.
- Explore's seven topics and all 21 individual Chamber launchers are independently
  hideable. Topic headers and Chamber cards provide quick eye-off actions with
  Undo, while **Choose Explore Chambers** in Customize home keeps a compact
  topic-first manager with individual room switches and one Show all recovery.
  Choices use `tezos-systems-explore-layout-v1` with the shape
  `{ "version": 1, "hiddenCategories": ["network"], "hiddenRooms": ["pulse"] }`.
  They stay private to the browser, synchronize across open tabs, and hide
  before first paint. A topic header disappears when its final visible Chamber
  is hidden; hiding the final Chamber hides the empty Explore block. Explicit
  Home Chamber links restore and save their target, while full Chamber routes
  continue opening without changing Home preferences. Valid preferences from
  `tezos-systems-chamber-categories-v1` migrate automatically.
- Explore is a progressively disclosed launcher rather than a second dashboard:
  the question-led Explore Tezos topics stay central, Ecosystem Activity is the
  one default-open launcher, and live signals, baker tools, account tools, markets, publishing,
  and recovery open only when requested. Its mobile corner gift launcher owns a
  dedicated in-flow slot beside the top price rail and scrolls away with that
  rail instead of painting over telemetry or the centered wordmark.
- Explore Tezos is visible by default and organizes all 21 room launchers into
  seven question-led topics: Ecosystem, Network, Capital, Bakers, Governance,
  People & Accounts, and History. ctez Oven Exit and KT1 Multisig Recovery stay off the
  default topic grid and open from Explore's collapsed Recovery tools drawer or
  the corner gift tray launcher.
  Each visible topic keeps independent expand/collapse and eye-off controls;
  hiding a topic removes its complete row, including the collapsed header.
  Each Chamber row is wrapped responsively so wide cards keep their companion
  card instead of creating desktop grid holes; cards also keep a canonical
  app-shell open affordance in the fixed footer rail, card-level direct-link
  controls, a matching section info button, and quiet source-aware freshness
  stamps that distinguish generated archive age, live source observation, and
  the oldest contributing source in a multi-ledger room.
  Open Chambers use the available viewport height with 16px desktop margins
  and edge-to-edge mobile layouts; tall displays have no fixed height cap.
- The **Live Head** card combines recent blocks and site-wide search below
  the header/title row. Four desktop rows or three mobile rows reuse Network
  Health's Passing Blocks language: level, round, previous-block delta,
  attested power/committee, a compact health bar, age, and baker are always
  present once a block is known. Its bottom-right mini selector and matching
  Setup selector offer 4 blocks (3 on mobile), 10, 15, 20,
  and a custom count (1–25 rows). A borderless, centered chevron points down
  when closed and up when open without changing position.
  Chain Health uses whole-pixel line slots, while the safety-margin pills size
  their fills directly and use fixed-height labels to stay crisp on 1× displays.
  The matching `1H ACTIVITY` and `CHAIN HEALTH • 1/25 LOW |` headings stay on one line;
  on screens up to 900px the controls stack so headings and Activity metrics fit.
  Chain Health reserves two digits for the numerator, centers its divider in
  the remaining status gap, and fits its border to exact-width bars with matching outer padding.
  Non-default counts stay exact on mobile. The custom option
  uses a blank number field with stacked +/− buttons; typing applies on Enter
  or leaving the field, while the stepper applies immediately. Both controls
  stay synchronized, and the mode and
  custom count persist locally; legacy expanded preferences migrate to 10.
  A second line adds applied Tezos L1 voting, current Etherlink L2 governance,
  exact Tezos X rollup publish/cement/outbox actions, DAL commitment
  publications, reviewed Art, DeFi, Gaming, Bridge, and Tezos Domains calls,
  Stake, Unstake, delegation, non-Art FA token movement, originations,
  tez transfers, and uncatalogued top-level zero-tez contract calls in distinct
  color-coded, truncated pills. A generic `sr1` target is not enough to claim
  Etherlink, a DAL publication does not claim slot availability, and a contract
  origination is not called a new app. Complete empty receipts are marked `Quiet`
  only after every required activity lane is known, never in place of block
  telemetry. The title row keeps the exact
  next round-zero baking right as a right, not a guarantee. Every block below
  6,969 attested power, and every `Quiet` block, owns its own missed-attester
  receipt. Those pills prefer `.tez` or TzKT aliases, fall back to truncated
  `tz1`–`tz4` addresses, retain the full identity in their receipt title, and
  say explicitly when no miss was indexed or the source is unavailable. Every
  returned identity is rendered; a width observer shows the full kitchen sink
  whenever it fits and introduces `+N bakers` only for pills that actually
  overflow at the current size. Producer aliases use a restrained JetBrains Mono
  identity face. A uniform low-opacity hairline grows through the baker column's
  remaining measured width and ends in a right arrow immediately before the
  receipt lane, so short and long baker names share one exact pill alignment
  without clipping. An unaliased producer keeps its full address wherever it fits;
  when the producer column runs out of room, the middle shortens while the `tz1`–`tz4`
  prefix and last five characters remain visible. This adapts to the actual column
  width and font without rewriting the full address used by copy, tooltips, or receipts.
  The first-line cluster
  reads power fraction, safety-margin rail, then activity state. The number on
  the rail shows missing attestation power relative to the full committee:
  `6,999/7,000` displays `−1`, full attestation displays `0`, and unavailable
  power stays `--`. The rail fill still depicts the quorum safety margin; its
  width is about 20% more compact, with a minimum that keeps its number readable.
  `Quiet` appears immediately after
  the rail only for a complete empty receipt. Every
  Quiet, gas, activity, and missed-attester pill uses the same opaque dark
  backing, shadow, and blur so it survives every theme without surrendering
  its category or severity color. Activity-category pills such as Baker,
  Transfers, Art, Tokens, Calls, and missed-attester addresses have no visible
  border or inset edge. Only yellow missed-round receipts retain an edge on the
  lower line; Quiet/Gas pills and health bars retain their existing edges.
  Every non-quiet block replaces it
  with a `Gas N%` pill derived from exact outer and internal manager-operation
  milligas against the active protocol block limit. Gas fills progress from
  cool/open through active, busy, and hot as capacity is consumed, leaving the
  second line for baker identities and real activity.
  Every normal activity pill begins with a compact category and count. When
  measured row width is genuinely spare, Art progressively appends available
  TzKT token titles, generic Tokens append source-native symbols or names,
  Tezos X names publish/cement/outbox actions, DAL names observed slot indexes,
  delegation distinguishes new, switch, undelegate, and self-registration when
  TzKT enrichment is available, Transfers adds its total tez and then the
  largest sender-to-recipient route, and Stake or Unstake adds its amount. Each
  pill earns richer detail independently so one long title cannot suppress
  another receipt; narrow and mobile rows keep compact factual counts.
  Double-baking, double-attestation, double-preattestation, DAL-entrapment, and
  delegate-drain evidence; cycle, voting-period, and protocol-activation
  milestones; and baker key, staking-policy, or deposit-limit changes outrank
  ordinary activity and remain visible even when every normal category is
  filtered off.
  A tiny info control immediately before each block age opens its complete
  receipt on hover or focus; ordinary row hover stays quiet, while clicking any
  non-link, non-control area of the row opens that same receipt. The inspector
  is a reading lock: the exact rows, ages, next-right clock, and visible facts
  stay still while polling may finish behind the surface. The receipt may
  scroll internally when its complete facts exceed the viewport; leaving that
  surface, Escape, page/outside scroll, or a click away releases the lock and
  applies only the newest queued snapshot as one motionless catch-up.
  The compact health rail's fill excludes the power every block must have and shows
  only the margin above the exact two-thirds quorum; sub-quorum power
  becomes a red deficit. There is no threshold marker or separate Safe/Strong
  pill. Its missing-power number has an opaque theme-aware backing over the full-height fill,
  keeping it legible across severity states; round, timing, and attestation
  colors use the theme's readable health palette. Each rail paints its factual
  length immediately, with no delayed empty-to-full sweep or right-edge flash;
  only the containing row has an entrance animation, disabled under reduced motion. The raw
  fraction remains a receipt while rail length, number, and color
  communicate how comfortably the block cleared quorum.
  First paint uses opaque slotted bars rather than loading sentences. Six-second
  visible-tab polling quietly reconciles stable keyed rows, retains last-good
  data, catches up once without motion, and announces only a genuinely new
  block. A source-confirmed head gap first becomes an amber `BLOCKS DELAYED`
  warning after 18 seconds and then a large red `CHAIN STALLED` banner after 30
  seconds. Both alerts occupy the card's reserved overlay plane, so a delayed
  chain never changes the Live Head card's outer size. The critical state keeps
  the last-good receipts visible, opens
  Network Health as a whole control, survives a later source-check failure, and
  remains latched until a genuinely newer block arrives. A new level softly
  fades and resolves into place while retained keyed
  rows glide together and the outgoing row dissolves, then its margin rail fills
  once. The full-width search well stays at the card floor, aligns its title and
  expanded wallet/domain/baker/contract/operation/block/protocol/Chamber help
  with the block number and baker column, and keeps that guidance on the idle
  surface. The optional Quick tour action sits at the search floor's right edge.
  Focusing it launches the same search node into an instant full-visual-viewport
  Index Chamber. The six starter actions paint synchronously without waiting
  for a catalog or network read; the opaque room leaves the underlying blocks,
  Pulse, header, and landing page visually undimmed while the shared overlay
  stack makes that background inert, traps focus, and locks scroll. Closing
  restores the exact opener, page position, and search node at the card floor.
  The block rows use generous breathing
  room, not horizontal separator lines; the card has no decorative top cap; and
  the search well is the card's full-bleed bottom edge rather than an inset box.
  A synchronized Setup and activity-menu control can restrict both Home and
  Network Health to blocks produced by or carrying activity from a saved My
  Tezos address. The filter stays silent when nothing matches and preserves the
  canonical compact or expanded ticker height as blocks arrive and leave.
  The top-right control rail shows **1H Activity**, then **Chain health**:
  25 attestation receipts, oldest left and newest right, sliding left once per
  new head.
  Green means at least 98.5% attested, amber means below 98.5% but at quorum,
  red means below quorum, and gray means unavailable. Full, half-height, short,
  and tick-height lines encode those same states without color. The newest line
  has a small marker. A stable-width status area beside the label shows `OK`, `LOW`,
  `RISK`, or `?` with the corresponding count out of 25, separated from the label
  by a bullet and from the lines by a divider; its accessible summary accounts
  for all 25 blocks, including unavailable data. Source failures show `STALE`.
  Hover or tap a line to inspect that block's missed attesters, including small
  misses on green blocks. The popup lists baker identities and missed power
  with receipt links in a small tooltip. Tap another line or use keyboard arrows
  to explore the retained window. Unavailable, unindexed, and clipped receipts
  remain explicit. The tooltip has no large actions or duplicate native tooltip.
  The shared missed-rights request covers all 25 blocks, and the strip pauses
  while the popup is being read. Clicking the label opens Network Health.
  All 25 lines remain on mobile. The visible controls stay 30px
  tall across devices, with invisible 44px hit areas for touch input.
  Keyed lines survive refreshes, failures retain the last received history,
  and hidden-tab catch-up, reading locks, and reduced motion remain quiet.
  A separate polite announcement speaks only when the strip enters risk and
  clears on every exit, including partial data and source failure.
  The trailing-hour `1H Activity / TX / Moved / NFT` receipt leads the rail;
  one setup icon and the `Live` state follow Chain health. Setup expands into
  persisted All, L1 voting, L2 voting,
  Etherlink / Tezos X, DAL, Art, DeFi, Gaming, Bridge, Domains, Stake, Unstake,
  Delegation, Tokens, Contracts, Transfers, and Calls selectors. Every normal
  category is on by default, prior all-on preferences migrate forward, and
  deselected normal pills stop spending the row's measured receipt width
  without hiding missed-attester receipts or mandatory evidence, milestone, and
  baker-change pills.
  There is no global missed-rights sentence. Each real row's info control and
  non-interactive row click open a compact complete receipt with direct TzKT
  links for the block, every metric and activity category, and every missed baker;
  producer, proposer, and
  missed-baker identities also expose My Tezos handoffs. The receipt footer and
  non-link receipt space open the Network Health Chamber while receipt links
  remain independently clickable.
- The compact two-row desktop header keeps the current protocol beside the
  Tezos Systems title whenever the available title row can hold both; it wraps
  beneath only when the title, protocol badge, and right-side navigation no
  longer fit without collision.
  It orders its right-side navigation as My Tezos,
  Explore, then Setup. Mainnet age shares the second row with content-sized
  network stat pills, including on portrait monitors; below 801px the masthead
  stacks centrally, and phones retain a two-column metric grid. Existing
  navigation-button styling and the corner gift launcher are unchanged. HEN stays
  tucked inside the corner gift tray instead of appearing as a separate header
  action. My Tezos stays expanded with its emoji and label at narrow widths.
  The header also turns mainnet age into a first-screen statement with years,
  days, hours, and minutes plus a
  `mainnet age · since 2018` label. The counter measures elapsed time
  since launch, not an availability percentage or incident ledger. Active baker
  count, finality, staked share, and issuance rate remain in theme-matched stat
  pills. Each pill's explanation keeps the all-time chart action beside a
  contextual Chamber handoff: Baker Directory for baker count, Network Health
  for finality, and Staking Chamber for staked share or issuance. The
  trailing-hour activity receipt now belongs to Live Head's compact
  top-right control rail instead of competing with mainnet age; it shows
  transaction count, XTZ moved, and NFT transfers and opens Network Health. Its
  first paint reserves the final `1H Activity / TX / Moved / NFT` metric shape
  instead of flashing loading prose. On iOS and iPadOS, the unsupported Tezos
  currency glyph is rendered as the small letters `tz`, including live text
  inserted after first paint.
  On the June 30 UTC mainnet anniversary, the continuity statement switches to
  a congratulatory anniversary message while preserving the live counter.
  An unseen imminent or newly crossed network milestone gives the live runtime
  a tight, transparent theme-derived hairline while preserving
  `MAINNET AGE · SINCE 2018`: approaching thresholds use a lighter dashed
  outline with a separate `SOON` marker, then crossed thresholds re-arm with a
  stronger solid outline and `NEW` marker above the top-right corner.
  Hover or keyboard focus reveals an anchored event card on desktop. On phones
  and touch-first layouts, the first tap pins that explanation without
  navigating; a second tap on the runtime, or the card's explicit action,
  records that milestone id and status as seen, opens Network Pulse or the most
  relevant Chamber, and retires the treatment across reloads and open tabs. A
  later `near` to `crossed` transition is new news and re-arms it. Once seen, or
  without an active milestone, the continuity statement continues to open
  Protocol Anthology.
  Clicking a stat pill opens that metric's historical stats surface.
- The Network Health Chamber contains the fuller Mainnet Continuity panel with
  the same chain-age and upgrade-history context, explicitly separated from
  availability monitoring. Its compact cycle-progress and timing panel sits
  directly below that continuity context before the detailed health grid.
- Tezos X Governance Chamber with direct `#l2chamber` access and visible L2
  Governance labeling,
  live FAST, SLOW, and Sequencer track status sourced from TzKT contract
  discovery, storage, bigmaps, and recent historical proposal submissions, plus
  official-track and TzKT links for action/audit. The dashboard card keeps
  compact track chips visible even when all tracks are idle, keeps its open
  control clear of those chips, computes period countdowns from the current
  head block, and the open chamber now includes track rules, track memory, and
  a merged submission/vote timeline for each L2 governance track. Active
  proposal and Promotion views lead with the complete represented-baker receipt
  ledger in first-to-latest order. Every row shows its ballot or upvote, exact
  UTC receipt time and level, matching L1-period voting power, individual and
  cumulative quorum contribution, and the receipt that crossed quorum. Shared
  voting-key calls are expanded into the baker accounts they represent and every
  row retains its operation link for audit.
- Tezos X Chamber with direct `#tezosx` access, atomic L2 TVL, daily
  transactions, gas, addresses, grouped Blockscout transaction tape rows, and
  DefiLlama protocol TVL sourced from current Etherlink rails. The open chamber
  also layers in 30-day TVL/transaction/active-address direction with
  quiet-state fallbacks, TzKT smart-rollup anchor metadata, gas oracle detail,
  and top tokens by holders when those upstream feeds are available.
- Network Pulse Chamber with direct `#pulse` and `/pulse/` access. It gathers
  consensus, economy, governance, network activity, ecosystem, and adjacent
  chamber signals into one categorized live card field while keeping the
  original inline stat sections available through `#section=...` deep links.
  The homepage Live Pulse reuses its freshness-aware 7- and 30-day history
  receipts for complete-window context, labels every rail destination, exposes
  honest per-card observation timing, and distinguishes loading, quiet,
  unavailable, and bounded last-good states without moving the reader during a
  background refresh. Its high-priority Release Radar reads one reviewed daily
  same-origin forecast and keeps Octez node software, EVM-node software, Tezos X
  Previewnet, Tezos X mainnet, Etherlink governance, and L1 protocol proposals
  explicitly separate. Its compact default card highlights the likely next
  ship, exact blocker, supported horizon, and most exciting recent artifact;
  the full Release Radar overlay opens every lane, all six Tezos X gates,
  dependency boundaries, status history, primary evidence, confidence meanings,
  and methodology without a fake completion percentage. It quietly marks when
  the forecast review is due before the ephemeral card expires, and the browser
  never infers readiness from GitLab merge volume. My Tezos draws from the same
  live candidate set and
  combines address-scoped account changes with daily network changes in one
  return report. When fewer than eight stronger signals are present, Live Pulse
  may also show one score-58 Curio per UTC day from a protocol anniversary,
  fresh 30-day baker-address comparison, or mainnet-age fact.
- Capital Chamber with direct `#capital` and `/capital/` access. Four sourced
  views organize the cross-layer capital picture without pretending their
  unlike metrics share one definition: **One System** (`?view=system`) connects
  Tezos and Etherlink activity, TVL, stablecoins, layer-separated transaction
  fees, gas prices, protocols, and Octez development; **Markets**
  (`?view=markets`) leads with a full-width XTZ/USD daily-close chart and
  open/high/low/latest context, compares XTZ in USD, BTC, and ETH, and exposes
  exchange-market snapshots. The dashboard launcher carries a compact 90-day
  XTZ/USD line from the same snapshot; **Assets** (`?view=assets`)
  separates public registry discoveries from issuer-confirmed xU3O8 evidence;
  and **Art** (`?view=art`) presents OBJKT-indexed sales, mints, collections,
  buyers, and artists. One System offers 30D, 3M, 6M, 1Y, and 2Y; Markets shows
  only its supported 30D through 1Y choices; and Art labels its fixed 30D source
  window instead of presenting unavailable controls. The browser reads one
  same-origin generated snapshot, refreshes it only while the room and tab are
  visible, and keeps its per-source status, timestamp, coverage, and methodology
  visible instead of making a third-party request fan-out when the room opens.

  Capital's limits are part of the product contract. Tezos transaction history
  is a truncated 30-day count of applied TzKT operations, including indexed
  internal calls, and is not labeled as equivalent to an Etherlink EVM
  transaction. Its fee history separately sums each completed day's indexed
  block fee pools and never divides those fees by the transaction-only count.
  Etherlink's public stats service supplies daily transaction-fee, average-fee,
  and gas-price series. L1 and L2 fee receipts share an XTZ denomination but are
  not added into a fictional combined network total. Stablecoin USD totals keep
  canonical and bridged components
  separate because bridge double counting remains possible. CoinGecko exchange
  rows are capped at 100; comprehensive CEX net flows are not calculated without
  audited exchange-wallet clusters. Public RWA registry rows do not imply issuer
  verification; only xU3O8 carries its issuer proof receipt, its Blockscout
  transfer detail is a recent/current truncated view, and the exact xU3O8 versus
  SRUUF return spread remains unavailable without licensed SRUUF closes. OBJKT
  coverage can be a capped most-recent prefix and does not prove every historical
  or independent marketplace. The development view covers 28 days of the
  canonical Octez `master` branch only, counts distinct author-name strings rather
  than verified identities, and is not a measure of all Tezos development.
  Comprehensive community/X/podcast composites remain explicitly unavailable
  until licensed coverage and a versioned deduplication/sentiment methodology
  exist.
- Critical Minerals Chamber with direct `#minerals`, `#critical-minerals`,
  `#strategic-minerals`, and `/minerals/` access. **Atlas** preserves the
  canonical 60-item final 2025 U.S. critical-minerals list rather than merging
  it with adjacent commodity or commercial product catalogs. **Supply** keeps
  the 2021–2025 USGS Mineral Commodity Summaries observations in their exact
  material forms, units, reporting periods, and raw qualifiers; categorical or
  bounded values such as `E`, `NA`, `W`, `s`, `>75`, and `<50` are never
  coerced into invented point estimates. Rare-earth and platinum-group
  statistics remain group context where the source does not publish a
  reproducible element-level value.

  **Markets** exposes only the ten exact critical-mineral products covered by
  the World Bank Pink Sheet monthly workbook, with its product identities,
  units, and monthly clocks visible. Thermal coal is not substituted for
  metallurgical coal, and absent USGS chapters remain explicitly unavailable.
  **Etherlink** keeps Metals.io-attributed xCo, xNi, and RARE product statements
  separate from Blockscout token metadata, counters, bounded holder-address and
  latest-transfer pages, and verified proxy lineage. Issuer claims and RARE
  basket composition are not independent backing, custody, entitlement, or
  reserve proof; chain supply, addresses, and transfers do not prove people,
  ownership, liquidity, price, reserves, redemption, or execution. xU3O8 and
  VNXAU remain in their dedicated Chambers, and the room exposes no execution
  action. **Proofbook** exposes every source receipt, transformation, gap, and
  non-inference boundary. The compact launcher
  reads an integrity-checked projection; the complete atlas loads only after the
  room opens and retains last-good state through quiet refreshes.
- Uranium Chamber with direct `#uranium` and `/uranium/` access. **Core Sample**
  connects the xU3O8 token, the separately dated Cameco contract-balance
  statement, the non-executable Uranium.io uranium reference, and Etherlink
  state without treating one as proof of another. **Markets**
  (`?view=markets`) leads with Kraken's public XU3O8/USD pair, bounded book and
  trade receipts, and an inspectable price-and-volume explorer. The current
  24-hour view uses Kraken's public WebSocket 5-minute candles and ticker while
  the 7-day view uses its separate 15-minute Kraken snapshot; 30-day through
  1-year history uses separately labeled CoinGecko daily aggregates. Exact
  point lookup, visible axes, actual coverage, and source clocks keep those
  series from being silently spliced together. Markets also retains attributed
  venues and an explicitly derived premium or discount to the indicative
  physical reference.
  **On-chain** (`?view=onchain`) keeps indexed addresses distinct from people,
  separates the xU3O8 token from the Uranium.io app contract, and discloses
  current contract controls. **Proofbook** (`?view=proofbook`) shows the dated
  physical balance, transparent reserve-pounds-to-token-supply arithmetic,
  custody, redemption, fees, rights, source clocks, and unavailable claims.
  The compact launcher uses its own polished, inanimate light-green specimen,
  a theme-independent emerald glow, short current-market metrics, and a labeled
  30-day pulse in a collision-free mobile layout. The expanded room retains its
  playful mascot and explicit caveat that
  physical U3O8 is yellowcake concentrate, not a luminous rock. The launcher
  reads a compact integrity-checked projection; the complete proofbook loads
  only after the room opens and follows the quiet-refresh and last-good
  contracts.
- Precious Metals Chamber with direct `#metals` and `/metals/` access. Its
  complete assay covers gold, silver, platinum, palladium, rhodium, ruthenium,
  iridium, and osmium without filling unsupported values with zero. Comparable
  gold, silver, platinum, and palladium history uses IMF Primary Commodity
  Price System completed-month USD-per-troy-ounce averages. Separately sourced
  indicative current observations keep their own observation and retrieval
  clocks; they are never relabeled as an IMF close, executable spot quote, or
  continuous market price. Annual USGS specialist-PGM context retains its
  source-native units, aggregation, and reporting date; unsupported osmium
  pricing remains unavailable.

  The on-chain receipt lane keeps VNXAU venue quotes, Tezos and Etherlink
  contract state, issuer terms, dated operational notices, and dated
  agreed-upon-procedures evidence separate. A token transfer or supply value is
  not evidence of custody, ownership, liquidity, redemption, or execution; an
  issuer claim is not an independent audit; and a report that predates or omits
  a chain cannot prove that chain's present backing. The Chamber contains no
  buy, sell, swap, bridge, or redeem action. Its compact launcher reads an
  integrity-checked projection while the complete source ledger loads only
  after the room opens and retains per-source last-good state.
- Ecosystem Activity with direct `#ecosystem` and `/ecosystem/` access. Its
  primary measure is every transaction-active source-native wallet-layer
  address in the last completed Monday-to-Monday UTC week, with the in-progress
  week shown separately as partial. Tezos L1 counts distinct implicit senders
  of applied top-level transactions; Etherlink uses the official weekly Active
  Accounts series, which counts distinct transaction `from` addresses in
  consensus blocks. The two source-native layer counts are summed without
  claiming that addresses are people or inferring cross-layer ownership. This
  network monitor starts with the latest completed week and appends completed
  weeks over time rather than presenting an invented historical backfill.

  A separate reviewed-dapp subset ranks the disclosed Tezos L1 and Etherlink
  app universe by distinct source-native wallet addresses, retains its complete
  historical ledger, and exposes interactions, calls per wallet,
  returning-wallet rate, WoW, YoY, and selectable 12W/1Y/3Y/all history. The
  reviewed Etherlink exchange slice
  includes every exchange in Etherlink's
  [current official directory](https://docs.etherlink.com/tools/exchanges/):
  Curve, Hanji, Oku Trade, and IguanaDEX, using their first-party deployment
  registries. Layer and category filters lead to a
  complete app directory; selecting an app opens its weekly ledger, generated
  contract set, identity proofs, and source receipts. L1 and L2 addresses are
  counted as separate wallet-layer identities because ownership is never
  inferred across layers. Weeks before a layer's first tracked app are marked
  `not-active`, never plotted as measured zero activity. Addresses are
  aggregate inputs only and are not published in the browser artifact. The
  homepage fetches a compact projection;
  the complete history waits for an explicit room open and then follows the
  quiet-refresh contract. That compact launcher leads with all active
  wallet-layer addresses, keeps the reviewed-dapp subset visibly distinct,
  and retains the completed-week app leaders on desktop and narrow phones.
- Staking Chamber with direct `#staking` and canonical `/stake/` access. Its
  progressive guide preserves the former `/staking/` page's delegation,
  direct-staking, baking, liquidity, penalty, reward-policy, baker-edge, and
  getting-started explanations alongside source-state-aware gross rate and
  participation context. `/staking/` is retained only as a noindex compatibility
  redirect into `/stake/?view=guide`. The narrow launcher keeps one latest
  applied stake and one latest applied unstake strictly over 10,000 tez visible.
  The opened room shows the canonical current staking ratio,
  seven-day direction, threshold-scoped 24-hour gross/net flow, a cursor-scanned
  persistent incremental history of qualifying TzKT receipts, local address
  search, filtered CSV export, and full per-mover stake/unstake trails with
  Ledger Flow and TzKT links. The archive resumes from per-action high-water
  marks instead of rebuilding the same history on every visit. It uses each operation's processed
  `amount`; `requestedAmount`, finalize operations, rewards, slashes, and baker
  autostaking are not presented as new user staking decisions.
- Tezos Maxis Chamber with direct `#maxis` and `/maxis/` access, organized into
  four rooms: **Maxis**, **Season**, **Passport**, and **Champions**. **Maxis is
  the default canonical identity layer**: its scannable all-lane overview answers
  who holds each objective crown using that lane's honest natural clock, such as
  all-time Transaction, all-time-active Governance, live Staking, rolling
  Art/DeFi, or cross-lane Unicorn breadth. These unlike clocks are labeled
  prominently and are never blended or relabeled as one time window. The
  full-width homepage launcher names all ten current crown holders beside their
  lane-native clocks, discloses the ranked-wallet universe, and treats the
  active protocol season as a smaller pulse with its boundary, Season Unicorn,
  Passport coverage, lane count, and a compact larger-screen lane-leader board
  rather than replacing the enduring Maxis view. Wide-phone launchers size to
  that content instead of retaining an empty fixed-height tail; compact layouts
  keep the complete holder and season receipts contained above the footer rail.
- TezosCRP Recognition Hall with direct `#tezoscrp` and `/tezoscrp/` access is
  deliberately separate from Tezos Maxis. Maxis assigns objective on-chain
  crowns to wallet addresses and verified receipts; TezosCRP publishes human
  and social identities, usually without a verified wallet. The Hall therefore
  ranks official category recognitions, shows distinct recognized months as a
  separate measure, preserves aliases conservatively, and links every row to an
  official Tezos Commons article or X post. Its five views cover the all-time
  Recognition Hall, category and calendar-year records with explicit ties,
  latest winners, the nine current categories with official category icons,
  and the complete monthly archive. Published per-person XTZ
  amounts are shown only where a source states them; missing payout amounts are
  never inferred from award counts.
- Season is the protocol-bounded game layer, beginning with Ushuaia. Its end is the next known
  activation, or honestly remains open-ended while that activation is
  unscheduled. A circular selector appears only in room contexts where choosing
  a season changes the displayed result. One-lane progressive disclosure keeps
  the active race, podium, ranks four through ten, nearest challenger, an
  actionable primary-metric guarantee plus a clearly labeled conservative
  score-vector path, rank movement, cutoff, and trajectory Honors readable.
  Crown metrics remain objective standings; climb, debut, consistency, and
  comeback Honors are a separate game layer.
  A manifest or summary fetch failure renders as a scoped unavailable state
  with retry affordance; it must never masquerade as an empty or pre-season
  result.
- Governance deliberately has three distinct clocks: the canonical Maxis crown
  uses all-time participation among currently active delegates, the current
  governance-period context explains whether an actionable vote exists now, and
  the protocol-season lane is an episodic race that may honestly be quiet. An
  empty seasonal interval never erases or replaces the enduring Governance Maxi.
  `data/maxis-careers.json` independently reconstructs every applied ballot and
  proposal against the complete voting-period ledger, exposing lifetime actions,
  participated periods, longest/current ballot-period streaks, last activity,
  and current active-delegate rank without changing any frozen season evaluator.
- L2 Governance is a second, independent all-time-active crown. A represented
  baker earns one participation unit for each distinct completed official
  Etherlink FAST, SLOW, or Sequencer proposal/Promotion window in which the
  complete TzKT governance big-map state contains that baker. Extra proposal
  upvotes, authored proposals, ballot choice, voting power, and repeated
  receipts never multiply the window score. The official Etherlink
  `/api/{track}/pastPeriods` ledgers define the canonical production windows;
  TzKT big-map inventories and every key in the matching participant maps prove
  applied participation. Identity comes from the represented baker stored in
  those maps, never the transaction sender, so a delegated voting key remains
  attributed to its baker. Career records retain inactive bakers, while the
  crown ranks only the complete current active-delegate set by distinct windows,
  then track breadth, Promotion windows, receipt count, recency, and address.
  `data/maxis-l2-governance.json` and its Passport career card remain outside
  the immutable v2 protocol-season evaluator: they do not alter Season,
  Season Unicorn, frozen Passport shards, or Champions.
- Maxi Passport is the address-level progression view. It accepts an explicit
  address, a `.tez` name or subdomain, or the saved My Tezos address without
  changing that saved identity. Domain lookups prefer the configured forward
  address and fall back to the domain owner only when no valid address is set,
  then canonicalize the Passport route to the resolved account. The view
  separates enduring career badges, bests, and crown history from
  current-season lanes, near misses, supported streaks, and progress toward Season
  Unicorn. The career ledger loads this address's independently verified shard
  from every season in the manifest, preserving repeated receipts by season and
  deriving cross-season high-water marks without comparing raw scores across
  changed rulesets. Stable badge thresholds and the moving “pass #10” cutoff are
  deliberately distinct; repeatable achievements carry season-scoped IDs so
  later protocol seasons do not overwrite earlier receipts. My Tezos exposes a
  direct Passport handoff for the active saved address.
- The launcher first reads the compact, integrity-checked
  `data/maxis/entry-summary.json` projection. The canonical Maxis room reads
  the full generated `data/maxis-leaders.json`
  lane-native-clock snapshot plus the independently integrity-checked
  `data/maxis-l2-governance.json` crown. Champions reads finalized protocol-season
  archives and preserves past winners, exposing the champion address and score,
  Ledger Flow trail, source receipt, final standings, and frozen rules for each
  result. At activation the new season opens at
  once while the prior season spends at least 24 hours concurrently in a
  non-champion settling state, then receives one exact-boundary rebuild under
  its frozen evaluator; temporary active leaders never receive permanent
  champion badges and there is no rollover board blackout. Current season data is indexed by
  `data/maxis/manifest.json`, with frozen rules and standings under
  `data/maxis/seasons/<season-id>/` and deep Passport coverage split across 64
  deterministic `00`–`3f` address shards. Every lane publishes its method and
  per-source completeness receipt; a lane that cannot be measured exhaustively
  renders as unavailable rather than promoting a sampled winner. Curated app
  lanes use `data/maxis-contracts.json`, and same-season Unicorn breadth never
  mixes activity from different protocol windows. Transaction Maxi uses a
  season-owned, strict-ID resumable accumulator with a fixed exclusive block
  boundary and replacement tail; its raw TzKT count must reconcile before the
  lane can publish. Long scans checkpoint into a signed
  `transaction-state.building.json` sidecar without changing the last published
  manifest, summary, or Passport shards; only a complete reconciled scan is
  atomically promoted to `transaction-state.json`. Neither file is a browser
  payload.
- Baker Directory Chamber with direct `#leaderboard` and `/leaderboard/`
  access. Discover first applies an explicit minimum free-room threshold and
  optional tz4 or Veteran evidence filter, then orders lexicographically by
  either free room or the disclosed delegator-plus-staker count. It uses no
  blended fit score. These are transparent on-chain facts; Discover is not
  a quality, payout, uptime, reliability, or performance grade. Directory keeps
  the complete funded active-baker set searchable and sortable, while Signals
  explains launch-era OG, through-2021 Veteran, accepted-proposal initiator,
  completed-ballot streak, capacity, and tz4 receipts. Selecting a baker keeps
  the full profile, My Tezos, Ledger Flow, and delegation handoffs explicit.
  Every complete Directory row and selected-baker detail exposes wallet-reviewed
  Delegate and Stake actions. Delegation is first-time-only; staking requires
  confirmed delegation to that baker, current external-stake room, an explicit
  amount and risk acknowledgement, and at least 1 XTZ left liquid for fees.
- Whale Watch Chamber with direct `#whales` and `/whales/` access unifies the
  large-operation Live Tape, complete applied-transfer Overview for the latest
  24 hours, related operation-group Flow Stories, large accounts inactive for
  at least one year in Deep Sleep, and verified post-dormancy Awakenings. TzKT
  operation IDs identify individual receipts; hashes group related hops without
  deduplicating them. Totals are labeled gross observed tez transferred rather
  than economic volume, accounts are not presumed to be individual wallets,
  and an awakening's moved amount appears only for the earliest applied
  transaction or actual processed stake/unstake receipt after dormancy. Sender
  balances, requested amounts, deposits, and activation allocations are never
  substituted. The live tape publishes only when its transaction, delegation,
  stake, and unstake lanes all succeed, and TzKT aliases are source context—not
  inferred exchange ownership or beneficial control. Its shared-archive strip
  names the exact UTC bounds represented by “24 hours” and discloses the
  generator's six-hour schedule. Legacy `#giants` opens Deep Sleep inside this
  room.
- Network Health Chamber with direct `#health` access, recent block cadence,
  consensus round, missed attestation, missed baking-right detail, TzKT cyclic
  cycle-time drift, exact current-cycle percentage and remaining time from the
  shared Octez RPC cycle calculation, TzKT-reported Octez baker version
  distribution by baking power, a full-width Teztale observer-reception
  histogram plus exact
  two-thirds/90% arrival and validation-to-quorum timing credited to Nomadic
  Labs, live current-cycle address-level Nakamoto coefficients at strict
  one-third and two-thirds thresholds, dated Chainspect/Edinburgh EDI/CoinClear
  reports with their original methods intact, print/tweet-ready coefficient
  cards that retain the address-versus-operator caveat, and a compact saved My Tezos
  baker summary. Its Chambers card spans two
  tiles and includes compact block-power bars plus a deduped throttled 1,000+
  XTZ live activity tape; the open chamber refreshes on the block cadence with
  in-place row updates instead of a full rerender. Its Passing Blocks table
  keeps a narrow level lane and spends the reclaimed right-hand space on the
  same Gas, Quiet, normal activity, mandatory chain-event, and missed-attester
  receipts as Live Head. A top-right Setup menu shares Live Head's persisted
  normal-activity filters while evidence, milestones, and baker changes remain
  visible. The shared depth control keeps eight desktop or six mobile rows compact and
  expands to fifteen desktop or twelve mobile rows. The chamber also adds incident memory,
  current-cycle progress, completed-cycle timing, Octez versions, period
  telemetry, network-load, and Consensus Lens panels.
- Ledger Flow Chamber with direct `#ledger-flow` and `/ledger-flow/` access,
  plus address-scoped hashes such as `#ledger-flow=tz1...`. It resolves tz/KT
  accounts and `.tez` names including subdomains, while explicitly identifying
  a Tezos Domains owner-wallet fallback. It freezes one observation boundary,
  counts matching applied tez transaction rows first, then loads an exact
  window up to 20,000 rows or a clearly qualified 10,000-largest-row sample.
  Superseded, closed, and timed-out reads are aborted; a failed refresh keeps
  the last-good account, controls, focus, selection, and chamber scroll mounted.
  Per-transfer thresholds, fetch time, last matching transfer, tez-only scope,
  contract origination, and first inbound transaction are labelled separately
  as all-time account context.
  Desktop caps each direction at four named paths plus a receipt-safe “Other”
  roll-up, then exposes every loaded counterparty through local alias/address
  search, factual sorting, and progressive rows. Exact bounded windows add a
  passive UTC time profile and receipt-proven contract, aliased-address, and
  unaliased-address composition without inferring ownership or business type.
  Phones lead with the selected account, direction ratio, and selected path,
  then reveal at most five paths per direction before an explicit disclosure.
  The dashboard card passively reuses the validated Whale Watch artifact for
  its complete 24-hour metrics and largest observed move, with no added request;
  any browser-local last account is a private resume action excluded from
  sharing.
  Address-scoped My Tezos links close the profile drawer before handing focus
  and scroll ownership to the Ledger Flow Chamber.
- Tezos Domains Chamber with direct `#domains` and `/domains/` access, backed by
  the Tezos Domains GraphQL API. Its default Chambers card is a full-width
  bottom strip, not paired with any other chamber, and its chamber lookup checks
  individual `.tez` names for availability, owner, expiry, offers, auctions,
  and recent activity while still surfacing fresh registrations, renewals,
  reverse-record moves, transfers, live auctions, sell offers, buy offers, and
  names nearing expiration.
- Price bar, cycle pulse, daily briefing, rewards tracker, and price
  intelligence.
- First-screen Live Head is built for liveness and retrieval: the top of the
  page moves from live cycle/market data to `Tezos Systems`, a clickable
  `Running on <current protocol>` Protocol History launcher, Live Pulse, then
  recent Passing Blocks telemetry flowing into a pure search well before Chambers.
  The search accepts
  Tezos addresses, `.tez` names, protocol names, block levels, block hashes,
  operation hashes, KT1 contracts, and slash commands. Empty focus exposes six
  calm starters plus the Index Loom: six connected, keyboard-reachable paths
  through wallets, the network, rooms, bakers, receipts, and the complete site
  directory. Choosing any Loom node seeds the matching search. Typing replaces
  both idle layers with the ranked canonical destination and runtime-action list,
  keeps a quiet semantic path above the results that links to the related
  Chamber, and expands the result sheet to the bottom of the remaining
  full-height scroller. An unmatched query retains
  the closest path as a recovery route instead of ending in a dead state. The
  first paint is globally capped at ten selectable results, then an anchored
  `Show all` row reveals the remainder without sending the reader back to the
  top. Literal matches are highlighted; rows ranked by a hidden alias or keyword
  expose that matching context instead of appearing arbitrary. Focus moves the
  same search node into the full-viewport Index Chamber, putting the field at the
  top and the idle or result surface inside the remaining full-height scroller.
  Launch is synchronous, opaque, and
  free of backdrop blur; the shared
  overlay contract isolates the visually undimmed background, contains keyboard
  focus, follows the mobile visual viewport, and restores the exact opener and
  scroll position. HEN terminal chrome is limited to HEN theme/mode. The
  compact `What's hot today` live pulse
  sits above Chambers as a horizontally scrolling strip for non-obvious daily
  signals instead of repeating the header's cycle, baker, staking, or security
  facts. Its initial loading state lasts at least 20 seconds before an unavailable
  message, including early failures; successful and confirmed quiet reads appear
  immediately. The timeout does not mutate a hidden surface and catches up when
  it becomes visible again. Quiet, curious, headliner, peacock, and historic tiers give stronger
  stories progressively larger and more distinctive cards, while June 30
  UTC still leads with the uptime anniversary.
  Pace-aware milestone cards normally appear only within the final 14 days and
  are hard-capped at 30 days before a target; newly crossed milestones remain
  celebratory for 72 hours. Generated catalog receipts make that window shared
  across visitors, target block timestamps provide exact block-height timing,
  every 100th cycle uses its exact Octez cycle-boundary timestamp, and bounded
  local observation remains only as a fallback. The existing Cycle 1250
  landmark remains part of the catalog. Each milestone card
  can open the existing branded
  image-share composer with milestone-specific promotional tweet styles.
  Internal routes open My Tezos, baker profiles, protocol lore/history,
  Chambers, themes, calculator, comparisons, leaderboard, whale/giant feeds,
  NFT lookup, History, Network Snapshot, and native account/contract/operation/
  block receipt views. Full Tezos identifiers and approved explorer URLs are
  parsed into explicit entity types and Base58 checksums are verified before a
  native destination becomes actionable; prefix normalization never changes
  the case-sensitive address body. KT1 results open a contract-specific lens
  with deployment identity, decoded entrypoints, indexed tokens/events,
  recent flow, raw code, and TzKT same-code deployments. Etherlink identifiers
  receive an explicitly external Blockscout route.
  `js/core/site-map.js` is the discovery source of truth:
  it owns featured search chips/defaults, relevance-ranked destinations and
  subfeature intents, sitemap metadata, the complete grouped footer map, and
  semantic next-step relationships. The same manifest also declares hash/path
  aliases, canonical share/copy routes, nested Maxis/compare/widget views, and
  the public crawl set, so those surfaces cannot quietly become parallel route
  catalogs. Token-aware intent ranking handles natural phrases without matching
  short substrings inside unrelated words, exact slash commands remain
  first-class, and spelling recovery is offered only when it resolves to a real
  destination. Generated `data/search-catalog.json` rows add reviewed ecosystem
  apps, TezosCRP identities, protocol debates, and network milestones without
  loading the large source archives into the command bar. Landing-page search
  uses the same route, intent, entity, and catalog logic. Exact intent ranks
  before broad keyword matches; Maxis Season,
  Passport, Champions, and lane queries preserve their room state, and pasted
  addresses or `.tez` names also expose a scoped Maxi Passport path. Baker-name
  searches hydrate from active leaderboard data and bounded TzKT alias
  suggestions that remain labeled as source aliases rather than verified
  identities. Loading rows are never selectable and use an explicit
  `Searching…` header, keyboard selection survives
  asynchronous result arrival, blank Enter is inert, focus is contained and
  restored, and search stores no raw query history. TzKT remains available from
  native receipts as an audit trail. Blank search stays intentionally compact
  with six useful starting points; `Browse all` explicitly opens the complete
  manifest directory without making every search session begin in an atlas.
  Runtime shortcut chips remain a HEN-only affordance.
- Cycle History Chamber with direct `#history` and `/history/` access keeps the
  fifteen captured global, market, Network Health, Tezos X, and governance
  signals in one measured archive. Its 24-hour, 7-day, 30-day, and all-captured
  ranges never synthesize missing intervals; `?range=...&metric=...` links can
  reopen one exact chart without replacing the surrounding source and freshness
  context. Each source names its configured capture schedule separately from
  the median interval observed in the returned rows.
- Protocol History Chamber with direct `#protocol-history` access, backed by
  `data/protocol-data.json` and `data/protocol-debates.json`. It preserves the
  protocol timeline, individual protocol lore modals, share capture, and impact
  views while keeping proposal history out of the first-visitor hero path. The
  Chambers entry presents this as a Protocol Anthology: a current chapter,
  lore/impact/memory facets, and recent protocol spines that open into a
  current-first fold-out archive.
  Human-facing upgrade totals use `js/core/protocol-count.js`: Paris C remains
  visible as a protocol-history chapter and DAL follow-up, but it is not counted
  as a separate self-amendment total, so public upgrade counts show 21 while the
  archive still has 22 protocol records.
- The compact Tezos Loop Console near the bottom of the dashboard starts from
  a wallet, baker, contract, collectible, governance, or market intent without
  repeating those six recipes as a second card grid. Its primary destination
  and semantic next steps resolve through the canonical site map, so newly
  added rooms enter the loop without another hand-maintained catalog.
- The footer renders Dashboard plus every canonical Story Room, Live Room,
  Account Room, live signal, guide, tool, and culture/feed destination instead
  of a handpicked subset. Crawlable comparison/widget pages and the core Maxis
  rooms appear as nested views under their parent destination. The Dashboard
  keeps that atlas expanded; standalone pages preserve it behind a local
  `Browse all destinations` disclosure. Expanded Chambers add four semantic
  next steps, and native Network Pulse and Staking now use the same four-link
  model plus quiet Chambers/search exits. Full internal routes prevent modal
  stacks during room-to-room navigation.
- Tezos L1 Governance for live and historical amendment voting, including a
  current-stage chronological ballot feed and the bottom historical vote log
  sourced from `data/governance-votes.json`. The command deck does not carry a
  separate governance prompt; live and quiet governance context lives
  in the Tezos L1 Governance card and modal. The Tezos L1 Governance card refreshes every 60 seconds
  and expands during active ballot periods to show proposal name, time left,
  quorum, supermajority, and ballot context; during Adoption it expands with a
  no-ballot runway explanation and activation timing. During an empty Proposal
  period, the compact card leads with `No Proposal` while retaining the current
  phase as secondary context. The opened L1 governance panel renders
  live vote instrumentation before the process explainer and includes a
  phase-aware current-state panel for quiet proposal/cooldown/adoption moments,
  proposal intel, quorum/non-voter gap analysis, and a vote share capture
  button.
- Governance Alert strip above Chambers during Proposal, Exploration, or
  Promotion only. It turns a saved My Tezos baker into a visible vote/upvote
  check with Chamber, RSS, My Tezos, and optional browser-reminder actions; it
  stays hidden outside active voting windows.
- Liquidity Baking dashboard tile and monitor with EMA state, a compact latest
  baker vote tape and recent unique vote-switcher strip on the tile, recent
  block votes, latest baker votes, contextual help, protocol-history lore, EMA
  threshold meter and auto-scaled trend sparkline, 6-second open-monitor
  refreshes, and 60-second dashboard-tile refreshes. The tile and open monitor
  share one contiguous 2,500-block window with bounded 32-block overlap
  refreshes. The open monitor also
  shows sampled EMA drift/forecasting, a history strip, vote-change feed, and
  top baker signals when no baker is saved.
- tz4 Adoption Chamber with a wide Chambers tile for latest completed switches
  and pending activations, plus baker-count and baking-power adoption readouts,
  current baker BLS/tz4 status, saved-baker highlighting/share, first-switch
  timing, projection to 50%, largest holdouts, visible monthly switch-count
  momentum, power milestones, top-10 first movers, and a capped Baker Status
  table with a Show all control.
- ctez End of Life with direct `#ctez` access, a corner gift-tray launcher, a
  collapsed Recovery tools Explore entry, a native Tezos.Systems My Ovens
  summary/detail console,
  Octez.Connect pairing, TzKT contract storage and big-map discovery for ovens
  owned by the connected wallet, read-only address inspection that does not
  replace the saved wallet, and wallet-reviewed one-batch close requests that
  burn outstanding ctez before withdrawing tez when both legs are needed,
  remain disabled until the connected wallet matches the inspected owner.
  Purple Matter/community fallback links and signing-safety reminders remain
  available for users recovering tez from old ctez ovens.
- TzSafe Recovery as an external stewardship entry in the corner gift tray and
  Explore's collapsed Recovery tools group, linking to
  `https://tzsafe.tez.page/` for the community fork and legacy KT1 multisig
  migration path while new multisig setups move toward protocol-native accounts.
- My Tezos adaptive personal room with Overview, Portfolio, Transactions,
  Collection, Your Story, and Tezos X tabs. Its empty state separates two
  read-only setup paths: Octez.Connect opens the compatible Temple/Kukai wallet
  chooser and requests the selected public account, while watch-only setup
  accepts a public Tezos address or `.tez` name without an extension, pairing,
  or signature. Both paths keep data in this browser and explain the six views
  plus the Ledger Flow and Maxi Passport handoffs before setup. Your Story separates the account's
  on-chain identity, protocol-era milestones, share surface, and browser-local
  recent chapter from the live Overview. Its single Show changes action opens
  the unseen receipt lane when new indexed activity exists. Overview shows the three newest applied
  account receipts with a direct handoff to the complete Transactions view, and
  one shared wallet-scope control now governs all six tabs. It defaults to all
  included L1 wallets, keeps current total, spendable, and staked XTZ visible
  above every view, and deliberately narrows Portfolio history, Transactions,
  Collection, and linked Tezos X accounts when one wallet is selected. A direct
  wallet choice also becomes the active account for baker, rewards, identity,
  and Story surfaces. Combined mode labels those account-only facts instead of
  pretending multiple wallets have one baker, identity, or on-chain timeline.
  Transactions also exposes loaded receipt, transfer/call, NFT-interaction, and
  in-scope wallet totals. While the drawer and browser tab remain visible, the
  active view quietly catches up every 30 seconds: Overview, Transactions, and
  Story reconcile recent applied receipts; Portfolio reconciles current
  balances; Collection publishes a complete new Objkt snapshot atomically; and
  Tezos X merges a fresh first page without discarding already loaded older
  activity. Hidden or closed drawers do not poll, and one catch-up runs when the
  tab becomes visible again. These updates preserve the active tab, wallet
  scope, filters, progressive card depth, pagination cursor, Chart.js instance,
  nested scroll, focus, input selection, and text selection. Overview's Network
  Context is a two-part personalized
  briefing: a full-width row
  places the wallet story and the live Tezos story in equal side-by-side panels
  on desktop, then stacks them on narrow screens. The wallet panel selects the
  account's most distinctive capital, staking, reward, baker, identity,
  collection, creator, and on-chain-history facts. When saved evidence exists,
  the Tezos panel leads with one quietly reconciled `While you were away` card:
  up to three changes from the existing account snapshot plus the two
  highest-scoring daily network deltas, retaining the daily snapshot's honest
  `since yesterday` or named-weekday wording. Either half can stand alone, and
  no empty card renders when both are absent. The panel then ranks up to four
  live signals from the shared network pulse in two tiers: signals with a proven
  connection to the loaded account lead, followed by general network context.
  Price, stake, baker, governance, collection, identity, creator,
  account-age, active-baker-set, APY, numeric whale-move, and explicitly linked
  Etherlink evidence can explain that relevance; missing evidence stays silent
  and tz4 or Maxi claims are not inferred. These fact and signal cards retain
  direct routes into the matching My Tezos view or
  first-party Chamber and reconcile in place as account, Memory, Portfolio, or
  shared hot-signal data arrives. Portfolio composition changes are immediate:
  include, exclude, add, and remove actions
  immediately invalidate the prior aggregate and complete a fresh current read,
  while the visible Update Portfolio control always forces that same full
  reload and names the number of wallets being updated. Portfolio also states
  that public wallet data is downloaded directly into the browser and processed
  locally, so a complete multi-wallet update can take a few seconds. The
  active L1 address stays synchronized with Ledger Flow, Maxi Passport, HEN,
  and the existing
  baker/reward lifecycle, while its baker
  signal uses one full-width next-round band plus four equal Octez, working,
  attestation, and DAL tiles. Shape-correct first-read cards hold the Overview
  frame while live sections settle into independent desktop columns, and later
  refreshes reconcile in place. Undelegated accounts link to the factual Baker
  Directory and show a disclosed Baking Benjamins site-builder recommendation
  with live delegation room; its connected-wallet action is disabled when the
  baker is inactive, capacity is insufficient, or that wallet already has a
  delegate. The existing two-card account-journey section
  follows the active tab and verified account role, scopes supported routes to
  the current address, and requires an explicit device-local L1/L2 link before
  recommending Tezos X. A contextual room can enter the relevant My Tezos view
  and receive one session-only canonical Return card; the stored origin contains
  only parent/child destination IDs, never an address or raw URL. The section
  remains one equal desktop row and a single mobile stack. Portfolio aggregates up to ten locally saved,
  independently includable Tezos L1 addresses through one bounded TzKT read and
  shows total, spendable, staked, and unstaking XTZ with current USD/EUR context
  when available. Its ten-address manager stays compact in a bounded desktop
  scroller with a sticky column guide, while narrow screens retain the natural
  page scroll. The drawer-wide L1 scope and Tezos X's genuinely separate
  Etherlink-account selector share one theme-aware, keyboard-visible control
  treatment. Saved entries use the versioned
  `{ network, address, label, included, addedAt }` shape. The v2 JSON
  import/export path carries only user-authored L1 configuration, device-local
  L2 links, exact browser-observed snapshots, and seen watermarks; it never
  carries keys, permissions, current balances, holdings, historical cache points,
  or estimates.
  Portfolio history is an exact L1 total-XTZ track rather than a visit-based
  chart or liquid-balance reconstruction. It loads daily samples for the latest
  365 days first, then weekly samples back to the earliest included account's
  first activity, restarting the level schedule at protocol boundaries. The
  default line is the complete included-address total; the drawer-wide wallet
  scope selects an individual address, while 30D, 90D, 1Y, and All control the
  time range. TzKT stepped balance history supplies
  pre-Paris points, bakers/delegates, KT1 accounts, and tz accounts confirmed
  never to have staked. From Paris level 5,726,209, other tz accounts use
  historical contract `full_balance` from the verified
  `octez-mainnet-archive.octez.io` archive, with
  `rpc.tzkt.io/mainnet` as a verified archive fallback. Pre-creation points are
  exact zero; a missing post-creation wallet point omits that portfolio point
  instead of substituting liquid balance, carrying a prior value, or showing a
  partial sum. Normalized immutable points, per-address daily/lifetime coverage,
  gaps, retry state, schedule version, and source receipts remain in IndexedDB
  and are reused across portfolio compositions. Backfill pauses when My Tezos
  or the browser tab is hidden, resumes on the next visible visit, keeps
  last-good points through provider failures, and updates the retained Chart.js
  canvas without resetting range, wallet selection, focus, or scroll.
  Transactions gives human-readable applied receipts their own
  view, separating transfers and account calls from NFT interactions with
  selectable lanes and distinct quiet color treatments. Resumable 365-day
  activity and While You Were Away share one provenance-aware Memory store. Large
  histories, compact rewards, current holdings, and sync cursors live in
  bounded IndexedDB rather than localStorage; last-good current totals survive
  reloads and incomplete source reads never replace them.
  Collection completes current Objkt coverage in the background while keeping
  card rendering progressively disclosed, separates Collected from Created,
  hides flagged metadata by default, reuses the HEN feed's Objkt-CDN-first media
  fallback path, and exposes active asks only as reference—not portfolio value.
  Tezos X accepts
  up to ten manually linked Etherlink `0x` accounts, keeps L1 associations and
  L2 inclusion independently editable, and permanently labels every link
  `Linked on this device` and not an ownership proof. Versioned v2 export carries
  user-authored L1 configuration, device-local L2 links, observed snapshots, and
  seen watermarks, but no balances, reconstructed caches, images, or valuation.
  This watch-only grouping is a private browser convenience and never claims
  common ownership.
- Staking calculator, chain comparison, HEN NFT/profile mode, TzSafe Recovery,
  changelog, share captures, and embeddable widgets. The calculator opens with
  a 1,000 XTZ starting amount, live APY context, protocol
  timing for first-payout copy, animated results, and private-by-default
  projection sharing. Cycle whispers only announce a real cycle advance near
  the beginning of the cycle.

Useful deep links include:

- `#my-baker=...`
- `/my/`, `/my/?view=portfolio`, `/my/?view=transactions`,
  `/my/?view=collection`, `/my/?view=story`, or `/my/?view=tezos-x` for the six
  My Tezos views
- `/tz1...`, `/name.tez`, or `/sub.name.tez` to resolve directly into My Tezos
- `#baker=...`
- `#calculator`
- `#compare`
- `#leaderboard`
- `#whales`
- `#giants`
- `#history`
- `#protocol-history`
- `#protocol=Ushuaia`
- `#theme=...`
- `#section=...`
- `#price`
- `#chambers`
- `#pulse`
- `#capital`
- `#minerals`, `#critical-minerals`, or `#strategic-minerals`
- `#uranium`, `#xu3o8`, or `#u3o8`
- `#metals`
- `#ecosystem`
- `#staking`
- `#maxis`
- `#tezoscrp` or `#community-rewards`
- `#l2chamber`
- `#tezosx`
- `#health`
- `#chamber`
- `#lb`
- `#lb-tile`
- `#tz4`
- `#ledger-flow` or `#ledger-flow=tz1...`
- `#domains` or `#domains=name.tez`
- `#ctez`

Public share routes are also available at `/chambers/`, `/my/`, `/chamber/`, `/pulse/`,
`/capital/`, `/minerals/`, `/uranium/`, `/metals/`, `/ecosystem/`, `/whales/`, `/stake/`, `/leaderboard/`, `/history/`, `/maxis/`,
`/tezoscrp/`, `/health/`, `/tezosx/`, `/l2chamber/`, `/tz4/`, `/lb/`,
`/ledger-flow/`, `/domains/`, and `/ctez/`.
These routes carry unique Open Graph metadata and hydrate the corresponding
live dashboard room at the clean URL.
`/feed.xml` exposes the generated governance RSS feed for relay bots.
The governance SEO page also funnels high-intent searches into `/chamber/`,
`/my/`, and `/feed.xml` for live vote checks and syndication.

## Data Sources

| Source | Purpose |
|--------|---------|
| TzKT `https://api.tzkt.io/v1` | Chain stats, delegates, baker Octez software/version telemetry, blocks, operations, account transfer flow, governance, accounts, Maxis account/delegate ranks and recognized app calls, Ecosystem Activity's network-wide distinct implicit senders of applied top-level transactions plus its frozen L1 contract catalog and complete reviewed-dapp backfill, Etherlink governance contract discovery/storage/bigmaps, ctez oven discovery, and Capital's Tezos counters, 30-day transaction-operation series, and completed-day L1 block-fee pools |
| Octez RPC `https://eu.rpc.tez.capital` | Issuance, supply, constants, cycle/head metadata |
| Official Octez mainnet RPC `https://tezos-mainnet.octez.io` | Current-cycle baking-power distribution used for Network Health's live one-third and two-thirds address coefficients |
| Teztale `https://teztale-server-mainnet-ro-prd.octez.tech` | Consensus timing lens for Network Health, including earliest-observer, endorsing-power-weighted reception distributions, exact two-thirds and 90% arrival thresholds, validation-to-quorum phases, and observer count; Teztale is by Nomadic Labs |
| `data/nakamoto-sources.json` | Same-origin dated ledger of Chainspect, Edinburgh EDI, CoinClear, and explicitly marked Chainspect-derived historical reports; scheduled server-side refresh avoids third-party browser CORS limits |
| Official Tezos, Ethereum, Solana, Cardano, and Algorand documentation plus source-native RPC samples | Monthly chain-comparison refresh; each published static number requires two distinct checks |
| `data/chain-comparison-verification.json` | Same-origin monthly receipt ledger with the displayed value, observed source values, source hashes, check type, and fail-closed policy for every static comparison number |
| CoinGecko | XTZ price, market cap, 24h change, volume, USD/BTC/ETH histories, exchange ticker snapshots, public RWA token mappings, and attributed xU3O8 and VNXAU token-market context; token quotes are not commodity benchmarks or backing receipts |
| Tezos Domains GraphQL | Domain/reverse-record lookups plus live events, auctions, offers, buy offers, and 30-day expiration pressure |
| OBJKT APIs | HEN mode's live Teia + OBJKT feed, My Tezos summary-first Collection holdings and profiles, Maxis 30-day buyer/artist ranks, and Capital's source-bounded art-economy history |
| Supabase REST | Historical Tezos snapshots via public anon client config |
| DefiLlama `https://api.llama.fi` | Tezos and Etherlink TVL, protocol, stablecoin, and public RWA registry histories plus Uranium.io protocol context; DefiLlama currently indexes Tezos X as Etherlink |
| Etherlink Blockscout `https://explorer.etherlink.com/api` plus `/api/v2` and stats service | Ecosystem Activity's official weekly Active Accounts series and successful inbound transaction histories for reviewed app contracts; My Tezos account-linked L2 counters, assets, and receipts; Tezos X chamber transaction, address, gas, and block stats; Capital's current counters, daily activity, transaction fees, average user fees, and gas-price history; Uranium's xU3O8 supply; Metals' VNXAU contract state; and Critical Minerals' bounded xCo, xNi, and RARE token metadata, counters, holder-address, latest-transfer, and verified-proxy receipts, all kept separate from custody or backing evidence |
| Kraken public API and official listing notice | XU3O8/USD pair identity, status, ticker, OHLC, book levels, and bounded public trade receipts; a market venue, not backing or redemption proof |
| Uranium.io issuer documentation, oracle, and proof-of-reserves page | Issuer-confirmed xU3O8 contract and terms, indicative USD/lb uranium reference, and the dated Cameco contract-balance statement |
| Federal Register 90 FR 50494 | Canonical final 2025 U.S. critical-minerals list of 60 entries; list membership is taxonomy, not evidence of a current price, reserve, or investable product |
| USGS Mineral Commodity Summaries 2026 and data release DOI `10.5066/P1WKQ63T` | Form-specific 2021–2025 U.S. and world production, import-reliance, annual-price, and related supply receipts with raw qualifiers, codes, group context, units, and unavailable fields preserved |
| World Bank Commodity Price Data (Pink Sheet) | Monthly history for the exact ten matching critical-mineral products only; product forms and units remain source-native, and thermal coal is never substituted for metallurgical coal |
| IMF Primary Commodity Price System | Completed-month gold, silver, platinum, and palladium USD-per-troy-ounce averages plus the precious-metals index; these are comparable monthly observations, not live or executable quotes |
| Gold API public price endpoints | Generator-only indicative-current gold, silver, platinum, and palladium observations with independent clocks; undisclosed upstream inputs mean these are not benchmarks, official fixings, dealer quotes, or executable prices |
| U.S. Geological Survey precious-metals publications | The complete eight-metal taxonomy plus source-bounded annual specialist-PGM context; grouped observations remain grouped and unavailable osmium pricing remains unavailable |
| VNX and Metals.io documentation | VNXAU token identity, issuer terms, operational notices, and dated agreed-upon-procedures receipts, plus attributed xCo, xNi, and RARE product statements and issuer-described RARE basket composition; issuer material is not an independent audit or proof of backing, custody, commodity entitlement, liquidity, reserves, redemption, or execution |
| GitLab public API | Capital's 28-day canonical Octez `master`-branch commit activity |
| `data/capital-entry-summary.json` | Compact, integrity-checked launcher projection generated from the reviewed Capital snapshot; full room data waits for an explicit Chamber open |
| `data/capital-snapshot.json` | Same-origin generated Capital dataset with stable content hash and per-source URLs, endpoint receipts, status, timestamps, coverage, truncation, and unavailable-methodology records |
| `data/minerals-entry-summary.json` | Compact integrity-checked Critical Minerals launcher projection; the complete taxonomy, supply, market, Etherlink, and proof ledger waits for an explicit room open |
| `data/minerals-snapshot.json` | Same-origin generated Critical Minerals dataset with stable content and source hashes, canonical 60-item membership, form-specific USGS observations and raw qualifiers, a bounded World Bank monthly subset, explicit gaps, and separate xCo, xNi, and RARE issuer/chain receipts |
| `data/uranium-entry-summary.json` | Compact integrity-checked xU3O8 launcher projection; the complete market, chain, and physical-evidence proofbook waits for an explicit room open |
| `data/uranium-snapshot.json` | Same-origin generated Uranium dataset with separate market, physical-reference, custody-document, protocol, and Etherlink clocks plus stable content and source receipts |
| `data/metals-entry-summary.json` | Compact integrity-checked Precious Metals launcher projection; the complete eight-metal market, annual-context, and VNXAU receipt ledger waits for an explicit room open |
| `data/metals-snapshot.json` | Same-origin generated Precious Metals dataset with stable content and source hashes, completed-month IMF observations, separately clocked indicative references, USGS annual context, and chain-scoped VNXAU receipts |
| `data/ecosystem-apps.json` | Reviewed app identity, layer, start-time, contract-discovery, and proof manifest for the disclosed ranking universe |
| `data/ecosystem-stats.json` | Same-origin generated network-wide completed/partial active-address totals plus the separate reviewed-dapp weekly wallet and interaction ledger, with stable content hash, frozen contract receipts, and last-completed-week app rankings |
| `data/ecosystem-entry-summary.json` | Compact, integrity-checked network-wide active-address and reviewed-dapp launcher projection; the complete per-app history waits for an explicit room open |
| `data/maxis/entry-summary.json` | Compact, integrity-checked launcher projection generated from the reviewed ongoing, L2 Governance, manifest, and active-season Maxis artifacts; full Maxis and Baker Directory governance ledgers wait for an explicit room open |
| Tezos Commons rewards page and official Medium publication | TezosCRP category definitions, official icons, monthly winner announcements, and source receipts |
| `data/tezoscrp-awards.json` | Same-origin full TezosCRP recognition archive, with human-identity aliases, monthly/category coverage, and known published amounts kept separate from award counts |
| `data/tezoscrp-awards.compact.json` | Lossless schema-2 browser projection with shared raw-category and full-source dictionaries; the expanded public archive remains compatible |
| `data/tezoscrp-identity-aliases.json` | Auditable high-confidence handle, spelling, and cross-platform continuity; uncertain lookalikes remain explicitly pending instead of being guessed |
| Etherlink JSON-RPC `https://node.mainnet.etherlink.com` | My Tezos linked-account native XTZ balances plus Tezos X chamber RPC head and gas fallback |
| Etherlink governance `https://governance.etherlink.com/governance` | Official FAST, SLOW, and Sequencer action pages linked from the read-only chamber |
| Octez.Connect `@tezos-x/octez.connect-sdk` via `https://esm.sh` | Lazy browser wallet pairing plus wallet-approved delegation, protocol-native stake self-transactions, ctez, and My Tezos account actions |

Live staking ratio and APY surfaces use TzKT `statistics/current` totals for
`totalOwnStaked + totalExternalStaked`, paired with TzKT `totalSupply`. Octez
RPC still supplies issuance, constants, cycle/head metadata, and fallback values
when TzKT stats are unavailable.

The core statistics payload also exposes TzKT's all-time transaction operation
count as `totalTransactions`, which feeds the pace-aware transaction milestone.

Visitor-side TzKT fetches are paced in the browser by `js/core/tzkt-throttle.js`
at six request starts per second. Request deadlines begin when a queued call
actually leaves the throttle, so time spent waiting for the shared budget does
not consume the upstream fetch timeout. This shim is installed by the dashboard,
SEO landing pages, standalone compare pages, and TzKT-backed widgets so embeds
do not bypass the visitor-side request budget. The core API helper also honors
TzKT `429` Retry-After responses and shares the current governance-period
snapshot across dashboard consumers.

Generated distribution surfaces now have one orchestration path:
`npm run refresh:generated` refreshes governance vote/report/feed artifacts,
pretty Chamber route pages, `sitemap.xml`, root and per-Chamber share images,
crawlable compare content, generated CSS bundles, the milestone catalog, and
the Maxis artifact family plus its launcher projection,
`data/capital-snapshot.json` plus its launcher projection,
`data/minerals-snapshot.json` plus its launcher projection,
`data/uranium-snapshot.json` plus its launcher projection,
`data/metals-snapshot.json` plus its launcher projection,
`data/ecosystem-stats.json` plus its launcher projection,
`data/whale-watch.json`, and the canonical `llms.txt` discovery document; manual full runs
also check the official Tezos Commons feed for a new TezosCRP period. It also refreshes
the reproducible Chainspect and
Edinburgh EDI rows in `data/nakamoto-sources.json`; normal pre-commit runs only
validate that ledger, while scheduled/full runs preserve last-known-good data
if a third-party parser is temporarily unavailable. `npm run refresh:nakamoto`
forces that source refresh directly. `npm run refresh:comparison` rechecks every
static chain-comparison number against two sources, updates the dated
snapshot only when all checks agree, and fails closed during ambiguous protocol
transitions; `npm run check:comparison` validates the committed receipt offline.
`npm run refresh:maxis` forces both the canonical
lane-native-clock Maxis snapshot and the protocol-season manifest, active-season
summary, frozen rules, transaction checkpoint, and non-empty Passport shards.
The scheduled Maxis lane retries a failed source build with bounded multi-minute
backoff outside the frozen evaluator implementation, so a short OBJKT indexer
incident does not discard an otherwise complete scheduled refresh.
`npm run refresh:maxis-careers` refreshes the separate exact all-history L1
Governance career artifact; `npm run check:maxis-careers` validates its source
receipts and content hash without a network scan.
`npm run refresh:baker-governance-signals` derives the compact active-baker
governance badge projection from that career ledger and the accepted-proposal
history; `npm run check:baker-governance-signals` verifies its exact source
receipts and byte budget without making the Baker Directory download either
full source artifact.
`npm run refresh:maxis-l2-governance` rebuilds the independent L2 career and
all-time-active crown from official canonical period ledgers plus complete TzKT
big-map receipts; `npm run check:maxis-l2-governance` validates its coverage,
reconstructed standings, and stable content hash without a network scan.
Normal pre-commit runs
validate committed Maxis artifacts without rescanning chain activity, while
scheduled/full generated runs refresh the L2 career before the remaining Maxis
family and stage its artifact when requested. After a protocol change, the ending
season waits concurrently with the new active board through the declared
24-hour source-settlement guard and is rebuilt to the exact activation boundary
before becoming an immutable archive; its
published rules and champions must not drift during later refreshes. Passport
shards are addressed independently so a declared shard fetch failure produces
a local Passport error rather than blanking the canonical Maxis board, current
Season, or other addresses; a bucket declared empty is an honest no-activity state.
Snapshot time lives in the summary rather than every Passport file, so an
unchanged shard preserves its exact bytes and SHA-256 receipt across refreshes.
Each active season also carries a recomputable UTF-8 serialization budget
receipt. Auditable rules, summary, and state stay pretty-printed while high-volume
Passport shards use stable compact JSON with raw SHA-256 receipts. The
transaction state may not exceed 16 MiB, any Passport shard may not exceed 1
MiB, and rules + summary + state + shards may not exceed 64 MiB. If the
complete Transaction Passport tree would cross those limits, that lane is
withheld and the other exhaustive lanes publish from the already collected
source data rather than silently truncating wallets.

`npm run refresh:capital` manually rebuilds the Capital snapshot from its
documented public sources. `npm run check:capital` performs a network-free check
of the committed schema, byte envelope, source receipts, required explicit
unavailable methodologies, and stable content hash. Each source refresh is
independent: a failed source preserves that section's last-known-good values as
`stale`, or publishes an explicit `unavailable` section when no prior values
exist. Scheduled/full generated runs refresh and optionally stage the snapshot;
normal pre-commit runs validate the committed artifact without contacting every
provider. The browser consumes that artifact and never silently upgrades stale
or partial coverage into a current, comprehensive claim.
`npm run refresh:minerals` rebuilds the Critical Minerals snapshot and compact
launcher projection from the final 2025 U.S. critical-minerals list, USGS
Mineral Commodity Summaries 2026 and its 2021–2025 data release, and the exact
matching World Bank Pink Sheet monthly products, plus reviewed Metals.io product
statements and Etherlink Blockscout receipts. `npm run check:minerals`
validates the committed 60-item taxonomy, schema, hashes, payload budgets,
source forms, units, clocks, raw qualifiers, bounded ten-product market subset,
group-context rules, explicit unavailable values, reviewed xCo/xNi/RARE
contracts, and product-versus-chain non-inference boundaries without contacting
those providers. Scheduled/full generated runs refresh and optionally stage both
artifacts; normal pre-commit runs only validate them.
`npm run refresh:uranium` rebuilds the Uranium snapshot and compact launcher
projection from public Kraken, CoinGecko, Blockscout, DefiLlama, Uranium.io,
and custody-document receipts. While the Markets view is open in a visible tab,
Kraken's public WebSocket adds a current ticker plus separate 5- and 15-minute
OHLC snapshots; the generated receipt remains the labeled last-good fallback.
`npm run check:uranium` validates the committed
schema, hashes, payload budgets, source clocks, contracts, physical statement,
derived arithmetic, and market/physical-evidence boundaries without contacting those
providers. Scheduled/full generated runs refresh and optionally stage both
artifacts; normal pre-commit runs only validate them.
`npm run refresh:metals` rebuilds the Precious Metals snapshot and compact
launcher projection from IMF, USGS, token-market, VNX issuer,
and Tezos/Etherlink contract receipts. IMF completed-month observations and
indicative current references retain separate clocks and cannot substitute for
one another. `npm run check:metals` validates the committed eight-metal
taxonomy, schema, hashes, payload budgets, units, clocks, unavailable-value
semantics, contracts, and VNXAU evidence boundaries without contacting those
providers. A failed source preserves only that source's last-good section as
stale; it cannot make another source appear current or turn missing data into
zero. Scheduled/full generated runs refresh and optionally stage both artifacts;
normal pre-commit runs only validate them.
`npm run refresh:ecosystem -- --backfill` exhaustively pages the aliased TzKT
smart-contract and asset catalogs, resolves and freezes the reviewed contract
universe, reconstructs every completed UTC week from the earliest declared app
start, and writes a separate explicitly partial current-week pulse. Full
Etherlink backfills use Blockscout's complete per-address transaction CSV
export once per reviewed contract; routine incremental refreshes use bounded
JSON ranges split into at most seven-day requests before fetch, with explicit
rate-limit pacing. A normal
refresh re-fetches a warm-up cohort plus the latest three completed weeks so
returning-wallet rates remain reproducible; newly resolved contracts are
append-only and move that rebuild boundary back to their first eligible week.
Every refresh also cursor-scans the latest completed and current partial Tezos
week for distinct implicit senders of applied top-level transactions and reads
Etherlink's official weekly Active Accounts series. Those network-wide rows are
kept separate from the reviewed-dapp ledger and begin at the first monitored
completed week; future completed weeks append to that history.
`npm run check:ecosystem` is network-free and validates the manifest receipt,
stable content and contract-universe hashes, network layer sums and continuity,
app and contract coverage, top-10 availability, and 4 MiB browser payload
budget. Scheduled/full generated runs
refresh and optionally stage the ledger; pre-commit validates it without
rescanning chain history.
`npm run refresh:whales` rebuilds the Whale Watch snapshot from complete,
paginated TzKT large-account and applied-transfer ledgers. The artifact retains
last-activity time and level separately, operation IDs separately from group
hashes, source/coverage receipts, and previously verified awakenings.
`npm run check:whales` validates the committed snapshot without network access;
pre-commit uses that check while scheduled/full generated runs refresh and can
stage the artifact.
The evaluator used by a settling season must remain executable and unchanged
until close; a future scoring upgrade must live in a separately versioned
evaluator rather than reinterpreting an old season through new code. Finalized
archives validate and render against their own frozen lane catalog, not the
current evaluator's category constants.
The milestone generator is cadence-gated: scheduled runs refresh it after 14
days, while pre-commit runs refresh it after 100 commits, whichever happens
first. `npm run refresh:milestones` forces a manual refresh. The browser consumes
the union of generated and shared base thresholds plus unexpired crossing
receipts, so an older manifest cannot suppress a newly shipped target. Octez
supplies canonical block/cycle truth while TzKT supplies indexed statistics.
The pre-commit hook runs `scripts/refresh-generated-surfaces.mjs` in commit mode
so fast-moving governance/feed outputs update with each normal commit and other
derived surfaces follow staged source changes. Manual
`npm run refresh:generated` still rebuilds the complete distribution set.
`.github/workflows/refresh-governance-surfaces.yml` runs dynamic generated data
every six hours through `scripts/refresh-scheduled-data.mjs`. Each source family
runs and validates in an isolated temporary Git worktree. A failed family is
restored to its exact last-good files while later, unrelated families continue;
the workflow commits the successful lanes and then remains red with the failed
lane named in its report. Static CSS, route, sitemap, comparison, and OG outputs
stay on their source-driven pre-commit/manual paths rather than being rebuilt by
the data clock. Capital, Uranium, Ecosystem Activity, Maxis, and Whale Watch
surface the configured schedule beside the artifact's actual generation or
source-observation age; Capital also preserves the CoinGecko quote time and
last-good status in its compact launcher.
`.github/workflows/audit-generated-freshness.yml` independently checks the
committed result every six hours. It raises an 18-hour delivery alarm by default
and a 30-hour alarm for the once-daily Edinburgh EDI Nakamoto source, accepts
either the previous or newly completed Ecosystem week during Monday's 18-hour
grace period, then requires the newest Monday-to-Monday UTC week. It also
enforces Release Radar, comparison, milestone, TezosCRP, and Supabase freshness
receipts. The audit never rewrites or promotes stale data. It maintains one
GitHub issue for the current failure signature, updates that issue only when the
failing contracts change, and closes it automatically after recovery so an
unchanged incident does not generate a new failed-workflow email every six hours.
`.github/workflows/refresh-chain-comparison.yml` runs on the first day of each
month, refreshes and validates the comparison receipt, rebakes the standalone
pages, and commits only a fully verified snapshot.
`.github/workflows/refresh-tezoscrp.yml` checks the official Tezos Commons
Medium feed every day. It adds only a newly published
winner period, rebuilds the full and compact artifacts, validates identity and
category coverage, and commits only when the official archive changes. The
read-only freshness audit watches this dataset's 45-day delivery envelope; the
six-hour data writer does not create extra TezosCRP polling.

The Supabase anon key in `js/core/config.js` is public client configuration, not
a secret. Browser fetch domains must be allowed by the CSP in `index.html`.
Tracked schema changes live in `supabase/migrations/`; apply them in Supabase
before collector code that writes new columns is deployed. The GitHub Actions
collector should use a service-role or equivalent server-side secret for
`SUPABASE_KEY`; the browser anon key should remain read-only under RLS.
`.github/workflows/collect-data.yml` writes the 2-hour global `tezos_history`
row, while `.github/workflows/collect-chamber-history.yml` writes 30-minute
market, Network Health, Tezos X, and governance-period snapshots. Both retry
temporary Supabase transport, rate-limit, and 5xx failures with bounded backoff
and confirm the exact timestamp before retrying an ambiguous write. If those
retries are exhausted, the workflow keeps the last-good ledger and records a
warning; the shared five-hour freshness audit opens one incident only if the
delivery budget is actually exceeded. Authentication, schema, and other hard
write failures still fail immediately.
The Cycle History Chamber reads those domain tables directly for trend charts
plus expanded `tezos_history` fields such as total staked, APY, tz4 power,
protocol issuance, and Liquidity Baking EMA. It starts with a captured-signal
digest so the extra rows become plain-language status for tz4 power, staking,
Liquidity Baking, market, Network Health, Tezos X, and governance before the
full chart grid. Chamber entry cards and expanded economy cards use the `📊`
stats control to open their matching historical series where capture exists,
and the modal shows a compact capture-status strip for the latest global,
market, health, Tezos X, and governance rows.
`scripts/backfill-supabase-history.mjs` can repair old `tezos_history` rows
after schema expansion by using each row's timestamp to pull historical TzKT
statistics and archival Octez issuance/Liquidity Baking state. Run it through
the manual `Backfill Supabase History` GitHub Action so it can use the
service-role `SUPABASE_KEY`; it defaults to dry-run mode and intentionally
leaves older tz4 power fields blank because TzKT exposes baker power as current
delegate state rather than a reliable historical snapshot.
`npm run check:supabase:freshness` uses the shared browser/operations contract
to raise a delivery alarm when any of the five history ledgers is more than five
hours old. The Chamber still discloses their configured two-hour or 30-minute
capture schedules and the median interval actually observed in returned rows;
the five-hour threshold is an operational stale alarm, not a cadence claim.

## Local Development

```bash
git clone https://github.com/Primate411/tezos.systems.git
cd tezos.systems
npm ci
npm run install-hooks
npm run serve
# Open http://localhost:9000
```

The lockfile is tracked so fresh clones can use `npm ci`. Repo Playwright
callers use `scripts/lib/playwright-browser.cjs`, which tries Playwright's
bundled Chromium first and falls back to a local Chrome/Chromium-family browser.
Set `BROWSER_EXECUTABLE_PATH` only when you need to force a specific executable.
The smoke runner supports deterministic runtime-balanced `--shard index/total`
selection from `tests/fixtures/smoke-suite-costs.json`, fresh-browser
`--isolate-suites`, repeated focused runs through
`--repeat-each`, aggregate reporting through `--continue-on-failure`, and
diagnostic `--retry-failures`. CI also uses `--hermetic`: every request outside
the tested origin must be handled by a suite mock or one of the pinned shared
browser fixtures, including the Kraken WebSocket feed. `npm run test:smoke:live`
is the explicit upstream-network canary; the nightly live job exercises both
the Octez.Connect SDK and Kraken ticker subscription. A suite that passes only on an assertion retry is reported as flaky and
still fails the gate; only a typed browser/server startup failure can use the
separate transparent `--retry-infrastructure` allowance. When
`--artifacts-dir` is set, every run writes a machine-readable `results.json`,
and diagnostic retries additionally retain Playwright traces, viewport
screenshots, and DOM snapshots.

Cross-room navigation and route-formatting tests pin the Whale Watch archive
and Ledger Flow account receipts together, so scheduled changes to the largest
sender cannot leak an unmocked account lookup into hermetic validation.
Live Head inspector checks use a real pointer move to a hit-tested, keyed trigger
and then verify the opened receipt. This avoids repeating a hover action after
the inspector has opened over its own trigger, while retaining reading-lock,
receipt-link, focus, geometry, and pointer-exit assertions.
Cycle milestone checks hold unrelated mock block progression steady and wait
for the exact cycle-start RPC receipt before the bounded render assertion,
including cached reloads, peer tabs, and expired milestones. Desktop startup
also runs at 6× CPU slowdown; an early ticker from other signals cannot satisfy
the expired-cycle check before its own receipt and briefing have settled.

`npm run test:affected` runs the static gate, maps files changed since
`origin/main` to suite-declared `files`, `tags`, and `risk`, and repeats selected
high-risk owners three times. Shared harness/runtime files or any unmapped
product file conservatively fall back to the full browser catalog. This is a
preflight optimization only; the push/release workflow always runs the full
catalog. Direct fixed waits of one second or longer are forbidden unless they
are named and justified in `tests/fixtures/smoke-intentional-waits.json`;
long timer assertions use Playwright's controlled clock instead.
`npm test` uses the same aggregate, retry-classifying, isolated-browser profile
as CI so the standard local gate and the push gate do not exercise different
runner semantics.

`npm run measure:load -- --base-url http://127.0.0.1:9000 --runs 5` records a
repeatable clean-profile initial-load row with request and decoded-byte totals,
eager JavaScript size, DOM and navigation timing, layout shift, long tasks, and
largest resources. Add `--mode installed-worker` to audit the installed service
worker separately. `npm run measure:load:stable -- --base-url
http://127.0.0.1:9000 --runs 5` first records one explicit, unscored
browser-process warm-up navigation for the plan's stated warm-CPU profile, then
exits non-zero unless every adjacent pair of the five measured clean-profile
runs stays within the plan's 5% decoded-byte and 15% responsiveness limits.
Responsiveness stability uses Total Blocking Time—the sum of each long task's
milliseconds beyond the browser's 50ms budget—so a task that merely crosses
the reporting threshold by 1ms does not masquerade as 50ms of new blocking.
The report still preserves raw long-task total, longest task, and worst raw
variance as diagnostics. Each measured run uses an isolated HTTP cache,
storage, and service-worker context, and the report retains the warm-up timing
rather than silently discarding it. Set `--warmup-runs 0` when the first
navigation in a new browser process is itself the subject of the audit. The
dated comparison fixture in
`tests/fixtures/initial-load-baseline.json` preserves the actual historical
result—including its diagnostic stability flags—rather than silently moving
the budget.

The README guard reads staged files. If package/tooling, hook, handoff docs,
smoke-test, config, theme, app-shell, service-worker, SEO, widget, or
standalone-page contracts change without `README.md` staged, pre-commit fails
with the affected files and reasons. If you audit a change and README truly
does not need an update, commit with `SKIP_README_GUARD=1`.

Common commands:

```bash
npm run build:css
npm run refresh:generated
npm run refresh:generated:scheduled
npm run test:scheduled-refresh
npm run check:generated:freshness
npm run refresh:capital
npm run check:capital
npm run refresh:ecosystem -- --backfill
npm run check:ecosystem
npm run test:ecosystem
npm run refresh:launcher-projections
npm run check:launcher-projections
npm run refresh:whales
npm run check:whales
npm run refresh:milestones
npm run refresh:comparison
npm run check:comparison
npm run refresh:maxis
npm run check:maxis
npm run refresh:maxis-careers
npm run check:maxis-careers
npm run refresh:baker-governance-signals
npm run check:baker-governance-signals
npm run refresh:maxis-l2-governance
npm run check:maxis-l2-governance
npm run refresh:tezoscrp
npm run check:tezoscrp
npm run check:release-radar
npm run routes:chambers
npm run og:chambers
npm run bake:compare
npm run refresh:governance
npm run guard:readme
npm run check:readme
npm run check:supabase
npm run check:supabase:freshness
npm run backfill:supabase
npm test
npm run test:static
npm run test:smoke
npm run test:smoke:ci
npm run test:affected
npm run test:smoke:harness
npm run test:smoke:list
npm run test:smoke:headed
npm run test:smoke:strict
npm run test:smoke:live
npm run test:smoke:costs:update -- test-artifacts/hosted
npm run measure:load -- --base-url http://127.0.0.1:9000 --runs 5
node tests/smoke.mjs --only app-shell,route-crawl
node tests/smoke.mjs --base-url http://127.0.0.1:9000 --only governance-lb-active
node tests/smoke.mjs --only network-health --repeat-each 3 --isolate-suites
node tests/smoke.mjs --shard 1/6 --continue-on-failure --retry-failures 1 --retry-infrastructure 1 --isolate-suites --hermetic --artifacts-dir test-artifacts/smoke-1
```

`QA.md` has the pre-deploy checklist and manual visual pass.

## Testing

Startup keeps the changelog archive and its DOM deferred until an explicit open.

Capital, Ecosystem, Critical Minerals, Precious Metals, Uranium, and Whale Watch
can paint a previously verified generated snapshot before network revalidation.
The optional `tezos-chamber-snapshots-v1` IndexedDB store keeps one bounded
record per room and reuses it for at most seven days after storage. Original bytes, source
dates, schema checks, and exact launcher receipts are rechecked before reuse;
saved content is explicitly labeled until revalidation succeeds. Storage denial,
corruption, or expiry falls back to the normal fetch path. No live API response
is stored here, and the service worker still fails closed for generated receipts.
An explicitly requested first render may finish while hidden; subsequent polling
and rendering remain visibility-gated, coalesce in flight, and quietly apply a
verified queued response on return. Five large rooms show static section frames
while cold. Whale Watch's generated archive does not wait for its separate live
lanes. The `chamber-first-paint` smoke covers all six at desktop and phone widths;
`tests/chamber-snapshot-cache-check.mjs` covers corrupt, mismatched, expired,
oversized, denied, and blocked cache reads.

The standalone `/tezoscrp/` pilot now covers all 25 generated Chamber routes and
22 Anthology chapters. Each boots its own room, shared theme styles, selected
theme painter, wayfinder, and build/update lifecycle. They do not initialize dashboard
telemetry on an idle timer. Closing the room or following its dashboard/search
actions loads the canonical dashboard shell on intent, checks the asset version,
and initializes the existing app once without reloading the document. Failed
transitions retain the room and offer retry or normal navigation. The pure `js/core/chamber-features.mjs`
catalog is shared by the dashboard, standalone loader, and route generator.
Opted-in rooms bind visibility handling on open without starting launcher polling.
Their cancelled closes retain timers and reading state until the dashboard is ready;
successful closes remove only that room's query state and restore launcher focus.
`standalone-chamber-expansion` checks all five new routes at desktop and mobile,
including navigation, failed-exit continuity, and cancelled stylesheet loads.
`standalone-chamber-completion` checks every route and an Anthology chapter at
desktop/mobile widths, with resource inventories and same-document home/Back
checks. `standalone-chamber-lifecycle` covers retained My Tezos/History nodes on
failed exits, early home topic/Search input, nested chart failure/retry, directory
controls, and theme painters. Fixed Chamber rows never become scroll anchors for
the dashboard behind them; the shared quiet-refresh test covers that boundary.
Shared info-tooltip styling lives in the shell, not a lazy room stylesheet;
open tooltips follow late card layout changes and stay inside the viewport even
when their opener moves offscreen. History's Clean view keeps a coherent light palette.
My Tezos, Anthology, and the directory reuse app-owned controllers without
starting home; all other rooms import their own feature. Directory room choices
navigate to the chosen room's scoped shell. History, My Tezos, and Health are in
the feature catalog; shared Octez software data lives separately from Health UI.
Service-worker installation no longer
preloads dashboard-only modules; runtime assets are still cached when requested.

Chambers share a compact reading summary through `js/ui/chamber-reading.js`,
while Network Health retains its native consensus verdict. Each summary names
its scope and supporting receipts without inventing cross-source comparisons or
a universal health score. Capital, Minerals, Metals, Uranium, and Ledger Flow
also explain their units and coverage in a three-row `Right now` guide. Market
guides scroll with the content rather than enlarging the sticky navigation.
Shared age labels retain the original generated, event, head, or read clock;
they advance every 30 seconds only while a room and browser tab are visible,
catch up quietly on return, and do not announce age ticks to screen readers.
Unknown clocks remain unknown and future clocks are explicitly flagged.
First-paint rows and values may settle briefly when motion is enabled. Cached
reopens and background changes never replay this effect. Reconciliation runs
through the existing quiet-refresh helpers, preserving focus, selection, nodes,
scroll, and charts. The `chamber-reading` smoke tests this at 1440, 390, and 320px;
the all-route completion matrix requires exactly one summary in every room.

TezosCRP's browser uses `data/tezoscrp-awards.compact.json`, decoded once at the
read boundary by `js/core/tezoscrp-codec.mjs`. Schema `2.0.0` stores each complete
source record and raw category label once; `category_raw_id` and ordered
`source_ids` resolve back to the unchanged expanded schema `1.2.0`. Sources are
not merged by URL alone. The decoder rejects missing/out-of-range references
and unsupported encodings, and shares immutable source objects/lists. The
original `data/tezoscrp-awards.json` remains the generator input and compatible
public export for old tabs and external consumers; browsers do not fetch both.
The refresh/check commands and scheduled publisher keep all three CRP artifacts
in sync. `--rebuild-only` refreshes the projection without advancing source dates
or polling the feed. Maxis careers use whitespace-free JSON with the same schema,
semantic integrity hash, and source clocks; `npm run refresh:maxis-careers --
--compact-only` reformats a validated artifact offline without touching any frozen
season. `npm run measure:chamber-data` proves full CRP round-trip equality and
reports raw/gzip sizes and source-object sharing. Its optional `--benchmark`
reports local Node parse/decode timings, not browser-paint or network guarantees.

`npm run measure:chamber-boot -- --baseline-root /absolute/path/to/exported-pre-pilot-tree --runs 3 --output /tmp/chamber-boot/results.json`
compares this pilot with an exported full-shell baseline. It serves both trees on temporary loopback ports,
verifies identical Recognition Hall data, and alternates cold/cached-repeat pairs
at desktop and 390px/6× CPU slowdown. Unlike routed smoke fixtures, it leaves the
HTTP cache enabled and asserts that repeat scripts never reach the server. The
controlled server uses ten-minute asset caching and ETag revalidation for
HTML/JSON. This is a local lab comparison, not physical-phone or production
network timing. Run it without concurrent browser QA; retain its JSON and rendered
screenshots alongside the normal navigation/recovery smoke evidence. The
`standalone-chamber-boot` smoke also runs its mobile navigation, Search, and
My Tezos handoff at 6× CPU slowdown, separately from performance measurements.
The dated local comparison is retained in `tests/fixtures/chamber-boot-pilot.json`:
99 to 14 JavaScript resources and 4,792 to 632 DOM elements, with unchanged award
data. Its 6×-slowdown medians were 1,175 to 357ms cold and 611 to 162ms HTTP-cached;
these are diagnostics from that controlled run, not user-facing speed guarantees.

HEN's feed runtime loads only for its route, query/legacy NFT link, or launcher;
its shared gift-tray, TzSafe, and theme stylesheet remains eager. Protocol Anthology
loads its editorial stylesheet before opening either the library or a chapter.
Failed optional loads can be retried without reloading the dashboard. Concurrent
Supabase history readers share a complete paginated receipt, including slow
in-flight requests; ranges and source availability semantics are unchanged.

`npm test` runs:

- `npm run test:static`: JSON validity, generated governance freshness, local
  asset references, cache-stamp alignment, CSP domains, selector contracts,
  chamber card control spacing, chamber share-capture contracts, share composer
  and Network Moment capture contracts, launch-date wording, module import
  sanity, historical chart pagination and
  render-performance settings, LB-aware issuance contracts, CSS freshness,
  lockfile/tooling, shared hook checks, and strict Live Pulse history semantics
  for complete daily windows, ties, records, ratios, and missing coverage, plus
  strict personal-signal ranking semantics for proven evidence and missing-data
  silence, plus deterministic daily Curio selection, scarcity, replay, and
  truthfulness contracts, plus Release Radar schema, six-gate separation,
  confidence/horizon, expiry, last-good, and priority-card contracts, plus
  deterministic scheduled-lane rollback, partial-success delivery, declared
  write-scope, artifact-age, and Monday-to-Monday rollover contracts. The
  default static chain also includes the strict TezosCRP archive and Ecosystem
  generated-artifact checks described below.
- `npm run test:tezoscrp`: focused full/compact archive reconciliation, consecutive
  monthly coverage, official icon presence, RSS parsing, and conservative alias
  continuity.
- `npm run test:ecosystem`: focused Ecosystem manifest, completed-week,
  contract-receipt, projection, and content-hash reconciliation.
- `npm run test:smoke:ci`: the full Playwright gate used by `npm test` and CI.
  It runs against a throwaway local server with hermetic external I/O, isolates
  every suite, gathers all failures, retries failed assertions once for
  diagnosis, and rejects retry-only passes as flaky. Pre-test infrastructure
  recovery is reported separately and does not launder an assertion failure.
- `npm run test:affected`: conservative static-plus-owned-suite preflight with
  three repetitions for selected high-risk suites and full-suite fallback for
  shared or unmapped changes.
- `npm run test:smoke`: the same browser catalog with fail-fast/shared-browser
  defaults for quick focused `--only` development loops.
- `npm run test:smoke:harness`: fast non-browser contracts for suite selection,
  stable sharding, affected-file ownership, aggregate failure collection,
  assertion versus infrastructure retry classification, per-risk repetition,
  and summary accounting. It is also part of `test:static`.

Current smoke suites:

- `tall-screen` (covers full-height narrow, standard, and wide Chambers plus
  whole-pixel health lines and unscaled margin pills at 1×/2× on desktop/mobile)
- `first-visit-tour`
- `app-shell`
- `release-update` (covers the compact-by-default update pill, explicit
  expansion, Later behavior, activation fallback, and cross-tab worker state)
- `hero-command-bar-first-paint`, `hero-command-bar-desktop`, and
  `hero-command-bar-mobile` (independent first-paint, desktop interaction, and
  mobile geometry failure domains)
- `route-search-state` (covers alias transitions, bare routes, relevant-only
  TzKT suggestions, query-preserving close, Back/Forward cleanup, and routed
  title ownership)
- `breakpoint-accessibility` (covers exact 759/760, 767/768, 899/900,
  1023/1024, 1179/1180, and 1299/1300 width pairs across the shell, command
  surface, and Network Health Chamber, plus representative 200% reflow,
  forced-colors focus, and reduced-motion containment)
- `tzkt-throttle`
- `dashboard-desktop`
- `dashboard-mobile`
- `live-pulse-daily-curio` (covers score/rank, one-per-UTC-day replay
  prevention, eight-signal scarcity, desktop/mobile rendering, and quiet
  preservation of card identity, focus, selection, and rail scroll)
- `my-tezos-baker-activity` (covers shape-correct first-read geometry,
  independent no-gap desktop stacks, and recent delegator/staker rows)
- `my-tezos-live-signal`
- `my-tezos-cold-start` (covers lazy-style startup plus an all-wallet Story
  route that never leaks an active-wallet-only dossier)
- `my-tezos-drawer-live-refresh`
- `my-tezos-view-live-refresh` (covers timed live reconciliation across all six
  views, hidden-tab catch-up, and preservation of filters, progressive card
  depth, loaded L2 history, charts, focus, selection, and nested scroll)
- `my-tezos-empty-state`
- `my-tezos-wallet-connect`
- `octez-connect-sdk-loader`
- `kraken-websocket-canary`
- `my-tezos-baker-capacity`
- `my-tezos-staker-rewards`
- `my-tezos-delegator-rewards`
- `my-tezos-portfolio` (covers tabs, session state, exact four-way account
  totals from TzKT full-balance partitioning, inclusion, active-address
  handoffs, last-complete failure behavior,
  quiet chart/list reconciliation, `/my/?view=portfolio`, and responsive room
  geometry, including the one-line desktop history selector label)
- `my-tezos-balance-history` (covers exact daily and lifetime schedules,
  immutable cache reuse, archive fallback and throttling, portfolio completeness,
  visibility-gated resume, and quiet chart/range/wallet reconciliation)
- `my-tezos-ledger-flow-handoff`
- `my-tezos-subdomain-input`
- `my-tezos-proposal-attribution`
- `my-tezos-deep-link-hash`
- `my-tezos-deep-link-path`
- `tezlink`
- `network-health`
- `staking-chamber` (covers the narrow latest stake/unstake tape, strict >10K
  boundary, complete applied-operation scan, current ratio, flow summaries,
  mover trails, receipts, the progressive guide and live economics, canonical
  `/stake/`, and the `/staking/` compatibility redirect)
- `ledger-flow`
- `maxis-domain-passport` (covers normalized `.tez` names, multi-label owner
  fallback, canonical resolved routes, unresolved names, KT1 rejection, and
  unchanged My Tezos state)
- `maxis` (covers the default all-lane Maxis overview, all ten launcher crown
  holders, complete Season pulse, fixed-height-tail regression at the
  430-pixel wide-phone breakpoint, full-width desktop/tablet/mobile containment,
  room-aware protocol-season selector, Maxis/Season/Passport/Champions views,
  scoped load failures and finalization phases, career-plus-season address
  progression, Champion/rank receipts, and Ledger Flow handoff)
- `ecosystem-activity` (covers network-wide completed and partial active-address
  totals, their separation from reviewed-dapp activity, last-completed-week app
  ranking, L1/L2 and category filters, complete app directory, historical range
  controls, app proofbooks, quiet refresh, direct `/ecosystem/` routing, and
  desktop/mobile containment)
- `launcher-projections` (proves Capital, Ecosystem Activity, and Maxis request only their compact
  summaries at first render, defers the Baker Directory governance ledger and
  reviewed full artifacts until room open, preserves launcher parity, accepts
  a newer verified Capital deploy over a stale in-memory receipt, and falls
  back safely when a projection is unavailable)
- First-class Chamber dialogs normalize through the shared accessibility seam
  into narrow, standard, or wide desktop viewports and full-bleed `100dvh`
  mobile rooms. The same seam owns focus containment, Escape, focus return,
  nested topmost-dialog ordering, background isolation, and the real room
  scroller. Persistent update notices arrive as a compact 44px transmission
  pill and expand only after direct reader action, without moving focus or
  scroll.
- Capital, Uranium, Precious Metals, and Critical Minerals share the lazy
  `market-room.min.css` structural layer for headers, responsive title scale,
  tabs, view shells, states, tables, artwork frames, and mobile captions. Their
  palettes and display/editorial title identities remain room-owned.
- `tezoscrp` (covers the human-identity Recognition Hall, award/month count
  separation, source-complete person history, tied category and annual records,
  official category icons, latest winners, archive filters, `/tezoscrp/`, and
  desktop/mobile containment)
- `tezos-domains`
- `ctez`
- `governance-lb` (covers Chamber current-stage/historical vote ordering, paired Chambers card layout, fixed Chamber footer geometry, Tezos X Governance card geometry and rollover timing, Tezos X direction fallbacks, LB tile latest-vote tape, LB auto-scaled EMA trend, tz4 card preview/month bars/holdout wrapping, and mobile vote-row geometry)
- `ux-regressions`
- `quiet-refresh` (covers passive Hot Today, nested-scroll, focus, selection,
  in-flow status anchoring, and open-chamber refresh stability)
- `overlay-stack` (covers Share, Protocol Stories, nested card history, and
  Native Explorer focus containment, topmost Escape, background isolation,
  route cleanup, and opener/scroll restoration)
- `leaderboard-signals` (covers the 2018 OG and through-2021 Veteran tiers,
  accepted-proposal initiator attribution, completed-ballot streaks, factual
  legend copy, quiet refresh, and desktop/mobile containment)
- `feature-workflows-desktop` and `feature-workflows-mobile` (independent
  desktop feature-map and mobile lifecycle failure domains)
- `share-actions` (covers share modal copy, editable X post text, optional handle persistence, download, native share, Network Moment image cards, and mobile photo fallback buttons)
- `info-modals`
- `cycle-history-chamber` (covers direct range/metric routes, focused charts,
  close lifecycle, focus restoration, and collision-free mobile controls)
- `themes`
- `widget-builder`
- `hen-mode`
- `route-formatting`
- `route-crawl`

Run `npm run test:smoke:list` for the current suite descriptions.

## Deployment, Hooks, And Versioning

The `Validate Site` workflow deploys pushes to `main` only after static contracts
and all six deterministic browser-smoke shards pass. Each shard runs suites
sequentially in isolated browser processes, continues after a failure to expose
the complete shard result, retries only the failed suite once for diagnosis,
and keeps the gate red when that retry is the only pass. Every shard uploads its
result ledger; failed retry attempts add traces and rendered diagnostics. A
post-success job blends robust hosted timings into an adaptive cache ledger for
the next run while the committed cost fixture remains the cold-start fallback.
The workflow installs only Chromium's headless shell, retries its download, and
caches it by the resolved Playwright version rather than invalidating the large
browser cache for unrelated lockfile edits. A scheduled high-risk five-repeat
canary and a separate live pinned-dependency canary expose flakes and upstream
drift without weakening the release gate.
GitHub Pages must use **GitHub Actions** as its build source; the workflow uploads
the validated repository artifact and preserves dot-prefixed public paths such
as `.well-known`. Scheduled repository writers explicitly dispatch that workflow
after a bot-authored commit because GitHub does not emit another push-triggered
workflow from its own token; their generated-data updates therefore pass the
same validation gate before Pages.

Before deploying JS, CSS, or data-dependency changes, review cache and version
metadata:

- `index.html` serves `css/styles.min.css?v=...` and `js/core/app.js?v=...`.
- `sw.js` uses `CACHE_NAME = 'tezos-systems-v...'`.
- Current aligned shell cache stamp: `v622`, including the full-viewport Index
  Chamber search, theme
  bundles, and the Baker Directory, Ledger Flow, Network Pulse, Network Health,
  Staking, Maxis, shared market-room, Uranium, Precious Metals, and Critical
  Minerals lazy CSS loaders.
- Current Tezos Domains lazy CSS stamp: `v321`.
- `version.json` is stamped by `.githooks/pre-commit`.
- The pre-commit hook runs the README guard, refreshes commit-relevant generated
  surfaces, runs focused README contract checks, then stamps version metadata.

New clones must run `npm run install-hooks` once so `core.hooksPath` points at
`.githooks`. Using `git commit --no-verify` skips the refresh/stamp hook and can
deploy stale metadata.

Important version model:

- `version.json` is pre-commit stamped, so its `commit` value points at the
  parent/pre-commit `HEAD`.
- `build` predicts the commit count after the commit being created and is the
  useful deployed-version handle.
- `latestChange` projects the final entry in the newest Changelog date section
  so the waiting-worker prompt can explain the incoming build before reloading.
- The footer fetches `version.json` with `cache: 'no-store'` and also fetches
  the latest GitHub `main` commit at runtime.
- `sw.js` treats `/version.json` as network-first and same-origin shell assets
  as network-first with cache fallback.
- Cross-origin API responses bypass Cache Storage and failed requests surface
  as unavailable instead of replaying stale telemetry as current.

## Governance Data

Use `npm run refresh:governance` before touching governance or protocol data.
It updates:

- `data/governance-votes.json`
- `data/governance-refresh-report.json`
- `feed.xml`

The refresh report blocks when an accepted/current protocol is missing curated
lore in `data/protocol-data.json`. Accepted protocol entries should keep
technical facts sourced from official Octez/changelog material and present the
community debate fairly.

## Standalone Pages And Widgets

SEO and standalone pages:

- `staking/`
- `governance/`
- `bakers/`
- `hen/`
- `compare/`
- `compare/tezos-vs-ethereum.html`
- `compare/tezos-vs-solana.html`
- `compare/tezos-vs-cardano.html`
- `compare/tezos-vs-algorand.html`

These pages, the welcome page, HEN gateway, 404 page, and widget builder all
render contextual next steps plus a collapsed, on-demand copy of the complete
manifest-backed footer map. Contextual recommendations stay visible; the atlas
does not consume the page until a visitor requests it.
The staking, governance, and baker guides keep their shared navigation on one
desktop row and collapse it into a contained `Explore` disclosure on mobile.
Primary dashboard, Chamber, guide, HEN, comparison, welcome, and 404 templates
also expose a skip link, while static dashboard modal shells carry dialog names
and modal state before JavaScript initializes.
Comparison rails live outside `#compare-content` so static and browser-side
comparison regeneration cannot erase them.

Widgets:

- `widgets/runtime.js` is the shared embed runtime and catalog. Raw widget
  pages import it for theme defaults, endpoint URLs, TzKT pacing, fetch
  retry/cache behavior, refresh sanitization, formatting helpers, and tracked
  dashboard attribution links.
- `widgets/baker-count.html`
- `widgets/block-height.html`
- `widgets/staking-ratio.html`
- `widgets/price.html`
- `widgets/protocol.html`
- `widgets/governance.html`
- `widgets/combo.html`
- `widgets/baker-card.html`
- `widgets/builder.html`

The builder renders its widget type buttons, theme swatches, combo-stat
checkboxes, preview URLs, and embed snippets from `widgets/runtime.js`. The
combo widget supports baker count, XTZ price, block height, staking ratio,
current protocol, cycle, head freshness, and tz4 baking-power adoption, capped
to four stats per embed. Builder iframe and Markdown-link snippets add widget
UTM params. Raw widgets retain visible Tezos Systems attribution but do not load
third-party analytics in an embedding site; the first-party builder can still
measure its own copy actions. Builder copy success uses the site-owner language
and heartbeat affordance from the dashboard polish pass.

## SEO And Analytics

- `robots.txt` allows major AI crawlers and points at `sitemap.xml`.
- `sitemap.xml` is generated from the canonical sitemap metadata and nested
  intents in `js/core/site-map.js` by
  `scripts/refresh-generated-surfaces.mjs`. Chamber route generation remains a
  separate distribution concern, and static checks require its canonical
  routes to agree with the site map.
- `index.html` includes CSP, Open Graph/Twitter metadata, and JSON-LD.
- `.well-known/ai-plugin.json` describes the current live/historical data model
  using the canonical June 30, 2018 mainnet date and avoids stale
  two-minute refresh claims. It points to the site-owned read-only OpenAPI
  document; `.well-known/security.txt` publishes private reporting routes.
- `.well-known/openapi.json` catalogues every intentionally public JSON
  artifact family with refresh cadence and license boundaries. Generated
  `llms.txt` combines that catalogue with the exact canonical destination graph
  used by `sitemap.xml`; other tracked data files are explicitly internal.
  The tracked `_config.yml` explicitly includes `.well-known` in the
  branch-backed GitHub Pages/Jekyll artifact.
- GoatCounter is used for privacy-friendly analytics: `tezsys.goatcounter.com`.
  The shared initializer also exposes loop events for share actions,
  governance-alert actions, and widget-builder copy events. Embeddable raw
  widgets do not load GoatCounter in third-party pages.
- Shared PNG/tweet/native share flows rewrite Tezos Systems links with campaign
  params, keep X copy editable in the modal, and can persist an optional handle
  for card credit; the History modal has a direct `#history` copy control plus
  tracked share copy.

## Gotchas

- Service worker cache can hide changes during QA. Hard refresh or unregister
  the service worker if local behavior looks stale.
- A newly installed service worker waits in a compact bottom-center System
  Transmission. The reader can expand it to see the latest change and accept
  Update & reload; it never takes control automatically, preventing both a
  blocked reading surface and a mid-session HTML/module split.
  Offline navigations deliberately render `offline.html`; the shell/runtime
  cache is an asset accelerator, not an offline copy of live telemetry.
- `index.html` serves `css/styles.min.css`; editing only `css/styles.css` is
  not enough for deploy.
- Share captures are fragile around chart rendering, gradient text, canvas
  conversion, and word spacing. Test them visually after share or theme work.
- Theme support lives in multiple files, and newer themes may fall back in some
  components if their color maps are not updated.
- TzKT filters can be surprising; some whale and sleeping-giant amount filters
  are intentionally done client-side.
- TzKT requests are queued per browser tab or widget iframe at six starts per
  second. TzKT limits by visitor IP, so several open dashboard tabs or embed
  iframes can still add up; expect a small delay when several feature modules
  ask for live TzKT data at once.
- Tezos mainnet launch copy should use June 30, 2018.
- Adding a new network source requires a CSP update in `index.html`.

## License

Except where a file or directory expressly states otherwise, the original
source code and repository-authored documentation in this repository are
available under the [Mozilla Public License 2.0](LICENSE). The package license
identifier is `MPL-2.0`; the project attribution and scope notice live in
[NOTICE](NOTICE).

MPL-2.0 is file-level copyleft. You may use, modify, and distribute the covered
work, including as part of a larger work. When you distribute covered source or
executable forms, modified covered files must remain available under MPL-2.0,
the corresponding covered source must be available, and the license and
attribution notices must remain intact. Separate new files in a larger work may
use other terms.

Third-party software, fonts, API-sourced data, images, trademarks, service
marks, and logos remain under their respective terms. MPL-2.0 does not grant a
right to use contributor branding except as needed to identify and attribute
the project.

The Tezos Network Statistics dataset advertised in the site's structured data
is separately offered under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
only for original selection, arrangement, and commentary to the extent
Primate owns those rights. Underlying facts and third-party API data remain
subject to their source terms.

Tezos Systems is built by Primate, a co-founding member of
[Tez Capital](https://tez.capital). The Tez Capital brand is represented
through that affiliation, and Tez Capital provides RPC infrastructure used by
the site. The copyright notice in [NOTICE](NOTICE) identifies the repository's
current copyright holder.

Some earlier revisions carried MIT or ISC declarations. This section governs
the current distribution and does not purport to rewrite the terms under which
historical copies were received.

## Credits

- Data: [TzKT](https://tzkt.io), CoinGecko, Tezos Domains, OBJKT, and Supabase.
- Built by: [Primate](mailto:primate@tez.capital), the baker behind
  [Baking Benjamins](https://x.com/BakingBenjamins) and a co-founding member of
  [Tez Capital](https://tez.capital).
- RPC infrastructure: [Tez Capital](https://tez.capital).

Built for the Tezos ecosystem.
