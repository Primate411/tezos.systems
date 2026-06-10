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

- Live hosting: GitHub Pages from `main`, with custom domain from `CNAME`.
- Local server: `npm run serve`, which runs `python3 -m http.server 9000`.
- Served stylesheet: `css/styles.min.css`; edit `css/styles.css` first, then
  run `npm run build:css`.
- Shared hook wrapper: `.githooks/pre-commit`; enable it once per clone with
  `npm run install-hooks`.
- README sync guard: pre-commit blocks when staged changes touch
  README-documented behavior but `README.md` is not staged.
- Version metadata: `version.json` is stamped by the pre-commit hook and shown
  in the faint footer build marker alongside the latest GitHub `main` commit.
- Standard verification: `npm test`, which runs static checks and browser smoke
  tests.

## Project Structure

```text
tezos.systems/
├── index.html                         # Main SPA shell, CSP, schema, dashboard DOM
├── landing.html                       # First-visit landing page
├── css/
│   ├── styles.css                     # Source dashboard styles and themes
│   ├── styles.min.css                 # Served dashboard stylesheet
│   ├── hen-mode.css                   # HEN overlay styles
│   └── landing.css                    # Landing and SEO page styles
├── js/
│   ├── core/
│   │   ├── app.js                     # App orchestration, DOM wiring, refresh loop
│   │   ├── api.js                     # TzKT, Octez RPC, Supabase, Tezos data fetches
│   │   ├── config.js                  # Endpoints, refresh intervals, constants
│   │   ├── storage.js                 # localStorage/sessionStorage wrappers
│   │   └── utils.js                   # Formatting, sanitization, utility helpers
│   ├── features/                      # Governance, LB, bakers, market, feeds, widgets
│   ├── ui/                            # Theme, share, gauge, title, animations
│   └── effects/                       # Matrix, themed backgrounds, audio/vibes
├── data/
│   ├── protocol-data.json             # Activated protocol timeline and lore
│   ├── protocol-debates.json          # Debate/rejection narratives
│   ├── governance-votes.json          # Generated governance vote history
│   ├── governance-refresh-report.json # Generated stale-data/lore audit
│   └── tweets.json                    # Share-copy templates
├── widgets/                           # Standalone embeddable widgets and builder
├── staking/ governance/ bakers/ hen/ compare/
│                                      # SEO and standalone pages
├── tests/
│   ├── static-checks.mjs              # Dependency-free repo contract checks
│   └── smoke.mjs                      # Playwright browser smoke suites
├── scripts/
│   ├── refresh-governance-data.mjs    # Canonical governance refresh command
│   ├── update-governance-votes.mjs    # Compatibility wrapper
│   ├── stamp-version.sh               # Pre-commit version metadata stamp
│   └── generate-og-image.js           # OG image generator
├── .githooks/pre-commit               # Shared local hook wrapper
├── sw.js                              # Service worker cache and offline strategy
├── version.json                       # Served build metadata
├── site.webmanifest
├── robots.txt
└── sitemap.xml
```

## Runtime Flow

1. `index.html` loads `css/styles.min.css` and `js/core/app.js` as an ES
   module.
2. `app.js` initializes feature modules behind safe wrappers, registers the
   service worker, handles deep links, and starts the refresh loop.
3. Cached stats and protocol data are displayed first when available.
4. First-visit default content is the protocol panel plus the Chambers section.
   Network Stats sections are hidden until the user enables Network Stats from
   Explore.
5. Background refreshes update hero stats, comparison data, governance state,
   cycle pulse, daily briefing, rewards tracker, price intelligence, baker
   tools, leaderboard, My Tezos, and share-ready UI.
6. Sparkline cards draw their series from historical snapshots, then align the
   final point with the latest live stat so chart endpoints and card values
   agree.
7. DOM elements are updated directly by id and class. There is no app state
   framework.

Current refresh and cache intervals from `js/core/config.js`:

- Main dashboard refresh: 2 hours.
- Sparkline refresh: 10 minutes.
- Price refresh: 30 minutes.
- Memory cache TTL: 1 minute.
- Storage cache TTL: 4 hours.

## Themes

There are 13 visual themes in `js/ui/theme.js`. `aurora` is the default theme.
The theme picker groups animated themes separately from classic data-focused
themes, and stores the selection in `localStorage` under
`tezos-systems-theme`.

| Theme | Role |
|-------|------|
| `aurora` | Default animated aurora theme |
| `matrix` | Terminal/data-rain theme |
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
| `warzone` | Amber command theme |

HEN mode is a separate overlay entry point, not a persisted dashboard theme.

Theme support is intentionally broad but scattered. When changing themes, check
`js/ui/theme.js`, CSS variables and overrides, `js/ui/share.js`,
`js/ui/gauge.js`, `js/features/history.js`, `js/effects/bg-effects.js`, and
inline modal styles in `js/core/app.js`.

## Main Surfaces

- Chambers section is visible by default and groups The Chamber, Tezlink
  Governance, Tezlink L2, Liquidity Baking Monitor, tz4 Adoption, and Network
  Health as one hideable feature with card-level direct-link controls.
- Tezlink Governance Chamber with direct `#l2chamber` access,
  live FAST, SLOW, and Sequencer track status sourced from TzKT contract
  discovery, storage, and bigmaps, plus official-track and TzKT links for
  action/audit.
- Tezlink Chamber with direct `#tezlink` access, atomic L2 TVL, daily
  transactions, gas, addresses, Blockscout transaction tape, and DefiLlama
  protocol TVL sourced from current Tezlink rails.
- Live network stat cards for consensus, economy, governance, network activity,
  and ecosystem metrics are opt-in from Explore under Network Stats.
- Network Health Chamber with direct `#health` access, recent block cadence,
  consensus round, missed attestation, missed baking-right detail, and a
  compact saved My Tezos baker summary. Its Chambers card spans two tiles and
  includes a throttled 1,000+ XTZ live activity tape; the open chamber refreshes
  on the block cadence with in-place row updates instead of a full rerender.
- Price bar, cycle pulse, daily briefing, rewards tracker, and price
  intelligence.
- Protocol timeline and history modals backed by `data/protocol-data.json` and
  `data/protocol-debates.json`.
- Governance panel prompt and The Chamber for live and historical amendment
  voting, including a current-stage chronological ballot feed and the bottom
  historical vote log sourced from `data/governance-votes.json`. The Chamber
  card expands during active ballot periods to show time left, quorum,
  supermajority, and ballot context.
- Liquidity Baking dashboard tile and monitor with EMA state, recent block
  votes, latest baker votes, contextual help, protocol-history lore, 6-second
  open-monitor refreshes, and 60-second dashboard-tile refreshes.
- tz4 Adoption Chamber with current baker BLS/tz4 status, pending consensus-key
  switches, saved-baker highlighting, and first-switch timing.
- My Tezos drawer and My Baker lookup, including baker performance, latest
  LB vote state, and recent baker delegator/staker activity.
- Baker leaderboard, staking calculator, chain comparison, whale feed, sleeping
  giants, OBJKT/NFT profile lookup, HEN mode, changelog, share captures, and
  embeddable widgets.

Useful deep links include:

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
- `#chambers`
- `#l2chamber`
- `#tezlink`
- `#health`
- `#chamber`
- `#lb`
- `#lb-tile`
- `#tz4`

## Data Sources

| Source | Purpose |
|--------|---------|
| TzKT `https://api.tzkt.io/v1` | Chain stats, delegates, blocks, operations, governance, accounts, Etherlink governance contract discovery/storage/bigmaps |
| Octez RPC `https://eu.rpc.tez.capital` | Issuance, supply, constants, cycle/head metadata |
| CoinGecko | XTZ price, market cap, 24h change, volume |
| Tezos Domains GraphQL | Domain and reverse-record lookups |
| OBJKT GraphQL | NFT/profile surfaces |
| Supabase REST | Historical Tezos snapshots via public anon client config |
| DefiLlama `https://api.llama.fi` | Tezlink chain TVL and protocol TVL; DefiLlama currently indexes the chain as Etherlink |
| Tezlink Blockscout `https://explorer.etherlink.com/api/v2` | Tezlink transaction, address, gas, and block stats |
| Tezlink JSON-RPC `https://node.mainnet.etherlink.com` | Tezlink RPC head and gas fallback |
| Etherlink governance `https://governance.etherlink.com/governance` | Official FAST, SLOW, and Sequencer action pages linked from the read-only chamber |

Live staking ratio and APY surfaces use TzKT `statistics/current` totals for
`totalOwnStaked + totalExternalStaked`, paired with TzKT `totalSupply`. Octez
RPC still supplies issuance, constants, cycle/head metadata, and fallback values
when TzKT stats are unavailable.

The Supabase anon key in `js/core/config.js` is public client configuration, not
a secret. Browser fetch domains must be allowed by the CSP in `index.html`.

## Local Development

```bash
git clone https://github.com/Primate411/tezos.systems.git
cd tezos.systems
npm ci
npm run install-hooks
npm run serve
# Open http://localhost:9000
```

The lockfile is tracked so fresh clones can use `npm ci`. If Playwright's
bundled Chromium is missing, the smoke runner and OG image generator can fall
back to a local Chrome/Chromium-family browser.

The README guard reads staged files. If package/tooling, hook, handoff docs,
smoke-test, config, theme, app-shell, service-worker, SEO, widget, or
standalone-page contracts change without `README.md` staged, pre-commit fails
with the affected files and reasons. If you audit a change and README truly
does not need an update, commit with `SKIP_README_GUARD=1`.

Common commands:

```bash
npm run build:css
npm run refresh:governance
npm run guard:readme
npm run check:readme
npm test
npm run test:static
npm run test:smoke
npm run test:smoke:list
npm run test:smoke:headed
npm run test:smoke:strict
npm run test:smoke:live
node tests/smoke.mjs --only app-shell,route-crawl
node tests/smoke.mjs --base-url http://127.0.0.1:9000 --only governance-lb
```

`QA.md` has the pre-deploy checklist and manual visual pass.

## Testing

`npm test` runs:

- `npm run test:static`: JSON validity, generated governance freshness, local
  asset references, cache-stamp alignment, CSP domains, selector contracts,
  launch-date wording, module import sanity, historical chart pagination and
  render-performance settings, LB-aware issuance contracts, CSS freshness,
  lockfile/tooling, and shared hook checks.
- `npm run test:smoke`: a Playwright browser run against a throwaway local
  server by default. It uses mocked live-data endpoints for deterministic
  feature flows.

Current smoke suites:

- `first-visit-tour`
- `app-shell`
- `dashboard-desktop`
- `dashboard-mobile`
- `my-tezos-baker-activity`
- `my-tezos-baker-capacity`
- `tezlink`
- `network-health`
- `governance-lb` (covers Chamber current-stage/historical vote ordering, Tezlink Governance, and mobile vote-row geometry)
- `ux-regressions`
- `feature-workflows` (covers all sparkline card latest values, history, share, and optional feature flows)
- `info-modals`
- `themes`
- `widget-builder`
- `hen-mode`
- `route-crawl`

Run `npm run test:smoke:list` for the current suite descriptions.

## Deployment, Hooks, And Versioning

Deploy by pushing `main`; GitHub Pages serves the committed files as-is.

Before deploying JS, CSS, or data-dependency changes, review cache and version
metadata:

- `index.html` serves `css/styles.min.css?v=...` and `js/core/app.js?v=...`.
- `sw.js` uses `CACHE_NAME = 'tezos-systems-v...'`.
- `version.json` is stamped by `.githooks/pre-commit`.
- The pre-commit hook runs the README guard, refreshes governance artifacts,
  runs focused README contract checks, then stamps version metadata.

New clones must run `npm run install-hooks` once so `core.hooksPath` points at
`.githooks`. Using `git commit --no-verify` skips the refresh/stamp hook and can
deploy stale metadata.

Important version model:

- `version.json` is pre-commit stamped, so its `commit` value points at the
  parent/pre-commit `HEAD`.
- `build` predicts the commit count after the commit being created and is the
  useful deployed-version handle.
- The footer fetches `version.json` with `cache: 'no-store'` and also fetches
  the latest GitHub `main` commit at runtime.
- `sw.js` treats `/version.json` as network-first and same-origin shell assets
  as network-first with cache fallback.

## Governance Data

Use `npm run refresh:governance` before touching governance or protocol data.
It updates:

- `data/governance-votes.json`
- `data/governance-refresh-report.json`

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

Widgets:

- `widgets/baker-count.html`
- `widgets/block-height.html`
- `widgets/staking-ratio.html`
- `widgets/price.html`
- `widgets/protocol.html`
- `widgets/governance.html`
- `widgets/combo.html`
- `widgets/baker-card.html`
- `widgets/builder.html`

## SEO And Analytics

- `robots.txt` allows major AI crawlers and points at `sitemap.xml`.
- `sitemap.xml` includes the canonical site, SEO pages, compare pages, widgets,
  and theme/deep-link URLs.
- `index.html` includes CSP, Open Graph/Twitter metadata, and JSON-LD.
- GoatCounter is used for privacy-friendly analytics: `tezsys.goatcounter.com`.

## Gotchas

- Service worker cache can hide changes during QA. Hard refresh or unregister
  the service worker if local behavior looks stale.
- `index.html` serves `css/styles.min.css`; editing only `css/styles.css` is
  not enough for deploy.
- Share captures are fragile around chart rendering, gradient text, canvas
  conversion, and word spacing. Test them visually after share or theme work.
- Theme support lives in multiple files, and newer themes may fall back in some
  components if their color maps are not updated.
- TzKT filters can be surprising; some whale and sleeping-giant amount filters
  are intentionally done client-side.
- Tezos mainnet launch copy should use September 17, 2018. June 2018 refers to
  fundraiser genesis, not the mainnet launch date used by the app.
- Adding a new network source requires a CSP update in `index.html`.

## Credits

- Data: [TzKT](https://tzkt.io), [Tez Capital](https://tez.capital), Octez RPC,
  CoinGecko, Tezos Domains, OBJKT, and Supabase.
- Built by: [Tez Capital](https://tez.capital).

Built for the Tezos ecosystem.
