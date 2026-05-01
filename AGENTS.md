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
- `index.html` currently serves `css/styles.min.css`, not `css/styles.css`.
  Edit `styles.css` first, then regenerate/minify `styles.min.css`.
- `README.md` contains some stale guidance. Verify against code before relying
  on README claims.

## Core Files

- `index.html`: main SPA shell, CSP, SEO/schema, dashboard DOM, modals, drawers,
  script loading, Chart.js CDN imports.
- `css/styles.css`: source styles and theme rules.
- `css/styles.min.css`: served stylesheet.
- `css/hen-mode.css`: HEN overlay styles.
- `css/landing.css`: landing and SEO page styles.
- `js/core/app.js`: app orchestrator, DOM wiring, modals, refresh loop, feature
  initialization, service worker registration, deep links.
- `js/core/api.js`: Tezos data fetching, RPC/TzKT/Supabase calls, deduping,
  caching helpers, stats assembly.
- `js/core/config.js`: endpoints, refresh intervals, constants, Supabase anon
  config, chain comparison data.
- `js/core/storage.js`: localStorage/sessionStorage wrappers.
- `js/core/utils.js`: formatters, debounce/throttle, sanitization helpers.
- `sw.js`: static/API cache logic.
- `version.json`: build metadata.
- `data/*.json`: protocol history, protocol debates, and tweet/share templates.
- `widgets/*.html`: standalone embeddable widgets.

## Data Sources

- TzKT: `https://api.tzkt.io/v1`
- Octez RPC: `https://eu.rpc.tez.capital`
- CoinGecko: XTZ price data
- Tezos Domains GraphQL: reverse/domain lookups
- OBJKT GraphQL: NFT/profile mode
- Supabase REST: historical snapshots using a public anon key from
  `js/core/config.js`

Treat the Supabase anon key as public client configuration, not as a secret.
If adding new network domains, update the CSP in `index.html` or fetches,
scripts, images, and frames can fail in-browser.

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

## Refresh and Cache Settings

Current verified intervals in `js/core/config.js`:

- Main refresh: 2 hours
- Sparkline refresh: 10 minutes
- Price refresh: 30 minutes
- Memory cache TTL: 1 minute
- Storage cache TTL: 4 hours

Cache/build details to verify when relevant:

- Service worker cache name: `tezos-systems-v53`
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
  assets, so front-page JS/CSS should not lag behind deployed code after the
  updated service worker is active.

Hook installation caveat:

- The repo now contains a tracked `.githooks/pre-commit` wrapper that runs
  `scripts/stamp-version.sh`.
- This checkout has `core.hooksPath` set to `.githooks`, so the hook is active
  locally.
- Git hooks are local and do not travel with the repo.
- New clones need `git config core.hooksPath .githooks` once, or `version.json`
  will not be stamped automatically.
- `npm run install-hooks` runs that config command.

Stamping gotchas:

- `git commit --no-verify` skips local hooks and can deploy stale
  `version.json` metadata.
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
- Protocol history: `js/features/history.js`
- Baker tools: `leaderboard.js`, `my-baker.js`, `my-tezos.js`,
  `rewards-tracker.js`, `baker-report-card.js`
- Market tools: `price.js`, `price-intelligence.js`, `calculator.js`,
  `comparison.js`
- Activity feeds: `whales.js`, `sleeping-giants.js`, `moments.js`,
  `cycle-pulse.js`, `daily-briefing.js`
- OBJKT/HEN: `objkt.js`, `objkt-ui.js`, `hen-mode.js`
- Extras: `streak.js`, `state-of-tezos.js`, `upgrade-effect.js`,
  `tooltip-tour.js`, `changelog.js`

## UI and Effects

- `js/ui/theme.js`: theme registry, picker, first-visit landing redirect.
- `js/ui/share.js`: html2canvas-powered branded 1200x630 captures, tweet
  picker, card/dashboard/protocol/history sharing.
- `js/ui/gauge.js`: Stake-O-Meter canvas gauge.
- `js/ui/title.js`: dynamic rotating page title.
- `js/effects/matrix-effects.js`: Matrix rain.
- `js/effects/bg-effects.js`: animated themed backgrounds.
- `js/effects/arcade-effects.js`, `audio.js`, `vibes.js`: playful effects.

Verified theme list in `theme.js`:

- `matrix`
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
- `warzone`

Theme support is scattered. When changing themes, check `theme.js`, CSS
variables/overrides, `share.js`, `gauge.js`, `history.js`, `bg-effects.js`, and
inline modal styles in `app.js`.

Some theme-aware modules do not fully cover newer themes. In particular,
`gauge.js`, `history.js`, `share.js`, and some `app.js` protocol modal styles
fall back for themes such as `nerv`, `abyss`, `moss`, and `warzone`.

## Data Files

- `data/protocol-data.json`: protocol timeline from Athens through Tallinn.
- `data/protocol-debates.json`: debate and rejection narratives.
- `data/tweets.json`: share-copy templates used by the share system.

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
- `.github/scripts/collect-data.js`: collects TzKT/Octez stats and writes to
  Supabase, with guardrails against critical zero values.
- `scripts/stamp-version.sh`: updates `version.json` and stages it.
- `scripts/generate-og-image.js`: uses Playwright to generate OG imagery from
  live data.

## Known Stale or Risky Claims

- README/local docs may say local dev port `8888`; current handoff uses `9000`.
- README/SEO may say updates happen every 2 minutes; current config is slower.
- README may say 8 themes; current code defines 12.
- README may say zero dependencies; better wording is no runtime framework or
  bundler.
- Some text still references June 2018 or June 30, 2018 for Tezos mainnet, while
  `config.js` uses `2018-09-17T00:00:00Z`.
- A comment near the comparison section says it defaults visible, but the local
  storage toggle defaults to hidden unless explicitly set to `true`.
- TzKT filters can be surprising. Some amount-based filtering is done
  client-side for whales and sleeping giants.
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
- My Baker / My Tezos drawer still opens
- service worker/cache does not serve stale edited assets
