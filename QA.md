# Tezos Systems QA

Run these checks before deploying changes to `main`.

## One-time setup

```sh
npm ci
npx playwright install chromium
npm run install-hooks
```

If Playwright's bundled Chromium is not installed, the smoke runner will fall back to a local Chrome/Chromium-family browser when available. You can force a specific browser with `node tests/smoke.mjs --browser-executable /path/to/chrome`.

The installed pre-commit hook also runs the README guard. If staged changes touch documented behavior but `README.md` is not staged, the hook will block and list the files that need a README audit.

## Standard pre-deploy pass

```sh
npm test
```

This runs:

- `npm run test:static`: source and fixture checks for JSON validity, local asset references, cache-bust alignment, CSP domains, core DOM selector contracts, and served CSS freshness, plus local HTTP cache and fixture-server checks. No browser or live upstream is needed.
- `npm run test:smoke`: starts a local static server, opens Chromium, checks the app shell/PWA/cache contract, desktop and mobile dashboard flows, governance/LB, feature workflows, themes, widgets, HEN, and standalone routes.

## Useful variants

```sh
npm run test:static
npm run check:readme
npm run test:smoke:list
npm run test:smoke:headed
npm run test:smoke:strict
npm run test:smoke:live
npm run test:initial-load
npm run measure:load:ci
node tests/smoke.mjs --only app-shell,route-crawl
node tests/smoke.mjs --base-url http://127.0.0.1:9000 --only governance-lb
```

- `--list` shows the available smoke suites.
- `--only` runs one or more suites by name, comma-separated.
- `--base-url` points the browser smoke suite at an already-running local server or the live site.
- `--headed` opens the browser visibly for debugging.
- `--strict-external` fails on upstream data warnings that are normally tolerated, such as CoinGecko or TzKT rate limits.
- `--browser-executable` pins the browser executable used for the smoke crawl.

## Initial load budgets

For viewport scheduling changes, run `tzkt-throttle`, `viewport-loading`, and
`lazy-chamber-loading` twice with no assertion retries. They cover scroll and
Chamber/drawer reprioritization, aborts and dispatch deadlines, delayed-history first
paint on desktop/phone, head advancement while history is pending, and stable
rows/focus/scroll as details finish. With
`--artifacts-dir`, `viewport-loading` saves pending, essential, live-during-history, and enriched
screenshots. Also capture timed cold loads: the state-based screenshots alone
do not show how long a visitor sees each stage.

Run `npm run measure:load:ci` before accepting startup or asset-loading changes.
It starts a local server and measures desktop and phone views, anonymous and
saved-wallet state, and cold, warm, and installed-worker caches. Each of the
twelve populated-fixture profiles gets one unscored warm-up and three measured
runs. The report and diagnostics stay in `test-artifacts/initial-load/` on both
success and failure; CI uploads this directory and Pages waits for the job.

Review decoded JavaScript, CSS, JSON and total page bytes, same-origin page request count, and DOM
count against `tests/fixtures/initial-load-budgets.json`. Resource policy and
duplicate-module failures also block the gate. Timings, layout shift and long
tasks are diagnostic evidence, not machine-dependent pass/fail thresholds.
The matrix uses synthetic source data and system fallback fonts, so keep live
network timing and rendered theme/font QA separate from these budget results.
The default window extends 2.5 seconds past readiness, then allows up to two
seconds for started fixture response bodies to finish. Fixture transport and
server-only/worker bytes are separate diagnostics, outside the page budgets;
these measurements do not estimate all production network traffic.
Do not increase a budget just to make a failed run pass; justify any deliberate
increase with its feature scope and measured resource changes.
The dated matrix reference is `tests/fixtures/initial-load-baseline-2026-09-16.json`.
Initial per-profile ceilings add 5% to measured maximum total/JavaScript/CSS
bytes and 10% to JSON bytes, rounded up to KiB; request counts add the greater
of three or 2%, and DOM counts add 10%. Keep its provenance and the budget's
calibration metadata reviewable; neither file is automatically regenerated.

Keep ownership explicit: `js/core/site-map.js` is the category catalog;
`scripts/lib/chamber-catalog.mjs` reads it for both startup measurement and
browser smoke. `initial-load-policy.mjs` owns readiness/resource rules,
`initial-load-config.mjs` owns profiles, and `initial-load-report.mjs` owns
aggregation/budget validation. The smoke suite keeps independently reviewed
room DOM/layout expectations, but does not duplicate category copy or counts.
After catalog-reader changes, run `node tests/initial-load-policy-check.mjs`
and the `chamber-categories` browser suite. Existing policy tests reject missing,
duplicate, misordered, and same-count substituted launcher IDs.

Older optimization documents and baseline fixtures are dated receipts, not
current measurements. In particular, HEN feed JavaScript is deferred while its
shared stylesheet remains eager, and historical query windows retain exact
timestamps rather than cadence rounding. Verify current behavior before
implementing an old recommendation; do not change runtime to fit old prose.

For the older blocked-upstream experiment, use
`npm run measure:load -- --network blocked --runs 5`; an explicit `--base-url`
uses an existing local server. `--mode installed-worker` and `--require-stable`
remain available for focused diagnostics. Keep the historical baseline fixture
separate from the reviewed budget file.

Run `npm run test:initial-load` when changing the measurement harness itself.
Its browser checks exercise the real runner, adverse requests, missing telemetry,
real cache receipts, budget failures, and cancellation cleanup; CI runs them
before the budget matrix. The pure policy, fixture-response, and report checks run in
`npm run test:static`, alongside local HTTP server/cache/proxy checks.

## Root share image

Run `npm run test:root-og` for lossless PNG and source contracts, and the
`root-og` browser suite for actual fonts, 1200×630 geometry, enlarged 30-day
change-pill typography, and clipping. The generator uses current observations;
the tests use controlled source receipts. PNG optimization must preserve exact
pixels and retain the original bytes whenever compression would grow the file.

## Theme effect loading

Run the `theme-effects-lazy` browser suite alongside `themes`, `valley-theme`
and `standalone-chamber-lifecycle`. Verify renderer request absence for themes
that do not use them, first activation, rapid previews and cancellation, failed
download recovery, reduced-motion changes, and a single initialization across
the standalone-to-home handoff. Keep Valley's early statistics subscription.
Use the startup matrix to measure the net saving including the shared loader;
do not count existing lazy theme styles, fonts or the Valley renderer as new savings.

## Unused-code review

Run `npm run audit:unused`. Read `test-artifacts/unused-code/report.md` for
candidates and `report.json` for exact checkout/tool provenance and category
counts. The raw Knip output is retained beside them. This command is read-only:
findings exit successfully, while invalid configuration, tool failures, or
malformed reports fail and replace any earlier success report. CI uploads the
same informational artifact; it is not a Pages dependency or a zero-findings gate.

`knip.config.js` delegates to `scripts/lib/knip-config.mjs`. The adapters exist
only in Knip's view of the source. They extract local HTML scripts (including
widget inline modules), normalize browser cache queries/root paths, and model
the named chamber catalog and bounded lazy-loading patterns. The Maxis version
registries retain their reviewed public APIs through an analysis-only bridge;
other implementation exports remain candidates. Existing package
commands, workflows, static-check and scheduled-lane catalogs, hooks, and
generator dispatchers supply tooling roots. Only the favicon generator and
standalone rendered-transport check are explicitly listed as manual CLIs.
Do not mark all JavaScript files as entries or add broad ignore patterns.

Treat every finding as a review lead. Runtime and test reachability are combined;
test-only references can retain runtime code. Indirect namespace access can
either retain extra exports or hide real consumers from static analysis;
review new dispatch patterns when they are introduced. Actual CLI entry-file
exports use Knip's default exemption.
Catalog-only chamber modules retain unused-export analysis. An unused export
may still be called inside its file: removing its implementation can break the
site. Computed/global APIs and external consumers still need manual checks.
This audit makes no claims about unused CSS, images, data, or frozen archives.

Run `npm run test:unused-code` after changing analysis rules. Its real Knip
fixtures retain live browser/widget/chamber/tooling paths while detecting
deliberate orphan files, unused exports, and an unused dependency. Negative
checks cover broken configuration, malformed output, tool failure, unsupported
flags, and source immutability. The shared static gate runs these checks; it
does not assert that the repository has zero findings. For adapter changes,
also run `npx --no-install knip --no-progress --no-exit-code` and review any
configuration hints. [Knip configuration](https://knip.dev/overview/configuration)
and [compiler adapters](https://knip.dev/features/compilers) describe the supported
interfaces; the lockfile pins the analyzed version.

## Shared live time labels

For header copy links and card history wiring, run `node tests/smoke.mjs --only
dom-affordances --repeat-each 2 --retry-failures 0 --hermetic --isolate-suites`.
This checks zero selector scans on text-only changes, bounded structural work,
late/nested insertion, removed or cloned controls, copy/history actions, and
desktop/mobile focus, selection, and node identity. Pair with `overlay-stack`,
`cycle-history-chamber`, `lazy-chamber-loading`, `standalone-chamber-lifecycle`,
`quiet-refresh`, and the desktop/mobile feature workflows.

For the shared time updater, run `node tests/smoke.mjs --only live-time-labels
--repeat-each 2 --retry-failures 0 --hermetic --isolate-suites`. It uses a controlled
clock and real DOM observations to verify unchanged-text suppression, text-node
and selection preservation, age/countdown/duration boundaries, and stale state.
Pair first-visit style cleanup with `first-visit-tour,themes` and inspect desktop
and mobile rendering; unused selectors alone are not visual-regression proof.

## My Tezos loading geometry

Run `my-tezos-baker-incidents` for receipt identity, finality, cycle rollover,
source failures, empty history, and retained reader state.
Run `my-tezos-layout-states` alongside `my-tezos-layout` and the affected live-refresh suites.
The loading-state smoke holds external reads and compares real rendered x/y/width/height
before and after completion across all seven tabs at 1440px, 390px, 320px, and 844px landscape. A change over
one CSS pixel fails. Same-row peer cards must have equal heights, their content must
fit, and the drawer must not overflow horizontally. Negative probes remove the grade
card and break its shared row height to prove both regressions are detected.

Unknown-length receipt lists may grow downward at the end of a view. Their top and
width stay fixed, with all unrelated controls and cards above them; the smoke rejects
controls stranded below those lists. This exception covers transaction/NFT receipts,
recent baker accounts, and supplemental network receipts. It does not excuse missing
fixed cards or shifting list headers. Opening a disclosure, switching receipt types,
changing wallets, resizing, and explicit pagination are user-driven layout changes.
Do not add blanket selector exclusions or increase the pixel tolerance to hide drift.

Save pending/loaded screenshots and geometry JSON with `--artifacts-dir`. Visually
review content density as well: matching giant empty placeholders is not acceptance.

## Pending text indicators

Run `node tests/smoke.mjs --only text-loading-chambers,text-loading-my-tezos,text-loading-widgets,text-loading-tools,text-loading-secondary,baker-roster-loading,live-number-motion --repeat-each 2 --retry-failures 0 --hermetic --isolate-suites`.

The browser matrix holds data requests before checking the actual future text
areas, including launcher previews, below-fold chart readings, account lookups,
and secondary governance, lore, and Passport receipts. It checks computed size,
rounded shape, opaque backing, hidden placeholder text, and shimmer animation.
Desktop and phone cases include reduced motion, which keeps a stationary bubble.
Negative probes remove the visual while retaining its marker: they must fail.
Existing themed chamber text effects and widget primary pulses remain valid.

Release held receipts and assert that placeholders disappear, including empty and
unavailable results. Check cached reopening and preserve last-good facts during
refresh. My Tezos checks distinguish missing cached records from a confirmed empty
read. `my-tezos-layout-states` remains the loading-to-loaded geometry gate; the
baker suite additionally checks scroll, focus, selection, and keyed row identity.

Every new asynchronous text area needs an explicit pending selector and a
completion assertion in `tests/lib/text-loading-smoke.mjs` (or its owning feature
smoke). `tests/text-loading-check.mjs` rejects new chamber routes without a loading
coverage decision. A spinner, nearby progress bar, generic text search, or an
`aria-busy` attribute alone does not satisfy this contract. Static navigation,
input-required prompts, confirmed empty results, and errors are exempt. Request
owners use `js/ui/text-loading.js`; do not infer loading globally from dashes or
zeroes. Preserve existing themed loading effects instead of replacing them.

## Manual visual pass

Automated tests catch regressions, but still do this visual pass for UI-heavy changes:

1. Fresh load with no saved theme or address.
2. Matrix plus one light theme (`clean`) and one dark theme (`dark`).
3. Desktop width and mobile width.
4. Settings menu, Features menu, theme picker, changelog, shortcuts, and About modal.
5. My Tezos drawer empty state and one known Tezos address.
6. Calculator, comparison, leaderboard, whales, giants, NFT profile, history modal.
7. Share picker opens; at least one share capture produces a sane image.
8. HEN mode opens and exits.
9. Footer build marker shows build metadata and latest GitHub main commit.
10. Hard refresh or unregister the service worker if edited JS/CSS looks stale.

## Tezos Maxis crown-and-season release matrix

Run the focused deterministic checks before the visual matrix:

```sh
npm run check:maxis
npm run check:maxis-careers
node tests/smoke.mjs --only maxis,my-tezos-address-switch
```

The Maxis visual gate is the Cartesian product of every theme, viewport, and
room below. Do not substitute representative sampling for this release pass.

| Axis | Required cases |
| --- | --- |
| Themes | `aurora`, `matrix`, `hen`, `default`, `void`, `ember`, `signal`, `nerv`, `clean`, `dark`, `bubblegum`, `abyss`, `moss`, `valley`, `warzone` |
| Desktop viewports | `1440x1000`, `1280x900` |
| Mobile viewports | `390x844`, `375x812`, `360x720` |
| Rooms | Maxis, Season, Passport, Champions |

At every theme × viewport × room combination, verify no horizontal escape,
clipped identity, covered heading, unreadable contrast, accidental page scroll,
or control below a 44 px mobile target. At the chamber top in Season and
Passport, the 44 px season and close controls must share one baseline, remain
fully inside the hero, and use mirrored corner insets; the open selector must
not collide with the close control, clip against the modal, or leave the
viewport. Maxis must remain the default room and
show a scannable all-lane crown overview whose all-time, all-time-active, live,
rolling, and cross-lane clocks are explicit. Season must show only one expanded lane
at a time, with the protocol header and lane switcher still reachable. Passport
must keep career records visually distinct from current-season badges and
near-miss progress. Champions must render both archive cards and a useful
first-season empty state.

### Selector, routing, and focus

Test once with a desktop keyboard and once with a touch-sized mobile viewport:

1. Open `/maxis/` with no query and confirm Maxis is selected, the non-season
   hero and all-lane overview are visible, and the circular season selector is
   absent because it cannot change the canonical crown board.
2. Switch to Season and confirm the circular selector identifies the current
   protocol season without obscuring the room title. Confirm it is aligned with
   the circular close control on the opposite corner, with neither control
   straddling the hero border. Open it with Enter and Space. Confirm its menu
   semantics, `menuitemradio` selection state, and current-season announcement.
3. Use Arrow Up, Arrow Down, Home, and End to move through available seasons;
   choose one with Enter and confirm the season, lane, and room query state is
   preserved in a shareable `/maxis/?view=...&season=...&lane=...` URL.
4. Press Escape once while the selector is open: only the selector closes and
   focus returns to its circular toggle. Press Escape again: the Maxis chamber
   closes and focus returns to the launcher that opened it.
5. Reopen the chamber and switch Maxis → Season → Passport → Champions →
   Maxis. Confirm room state changes in place without resetting valid selected
   season/lane/address state or jumping the page behind the modal. Confirm the
   season selector appears only in a room where selecting a protocol season
   changes the displayed result.
6. On mobile, confirm the selector becomes a contained toggle-anchored popover,
   closes by outside tap, and leaves the chamber scroll position intact.

### Passport identity cases

Verify each identity case independently; clear local storage only where the
case explicitly requires it:

| Case | Required result |
| --- | --- |
| Saved My Tezos address | Passport opens from the drawer handoff with the saved address and does not alter it. |
| Explicit `?view=passport&address=tz...` | The explicit address wins for this view but does not overwrite the saved My Tezos address. |
| Raw implicit account input | A valid `tz1`/`tz2`/`tz3`/`tz4` address loads the deterministic shard and preserves the raw address as identity even when an alias resolves. |
| `KT1` input | Render supported contract data or an explicit unsupported-identity explanation; never merge it into a manager wallet. |
| No address | Show the purposeful Passport search/empty state with a My Tezos handoff, not a failed leaderboard or fabricated progress. |

For a populated Passport, check enduring career badges, career personal bests
and crown history separately from current-season lane positions, moving top-ten
cutoff near misses, supported streak evidence, and same-season Unicorn breadth.
The career receipt must state how many manifest season shards verified; a failed
historical shard is scoped unavailable rather than silently erasing its season.
Badge progress must not move merely because rank #10 changes. A newly ranked
address is labeled as a debut,
not as a climb from an invented previous rank. In a two-season fixture, earning
the same repeatable top-ten, streak, or Unicorn achievement twice must preserve
two season-scoped badge receipts rather than deduplicating the later season.

### Artifact and failure states

Exercise these states with deterministic fixtures or request interception:

| State | Required result |
| --- | --- |
| Fresh canonical Maxis snapshot | All current lane holders are scannable together; each lane displays its own all-time, all-time-active, live, rolling, or cross-lane clock and exact method. No mixed-clock result is called a season score or a single all-time table. |
| Governance clock split | The all-time-active Governance Maxi remains visible, current-period context states whether voting is actionable now, and a quiet/empty protocol-season governance lane does not erase or replace either enduring surface. |
| Governance career integrity | `data/maxis-careers.json` validates its exact ballot/proposal counts, complete period ledger, active-delegate reconciliation, deterministic streaks, and content hash. A missing/invalid career artifact degrades only career context; it never rewrites a frozen season. |
| Fresh active season | Protocol activation boundary, generated time, leader, nearest challenger, actionable primary-metric guarantee, conservative frozen-vector path, rank delta, cutoff, Honors, and per-source completeness receipts agree with the fixture. No conservative path is labeled as a live minimum. |
| Stale active season | Last valid standings remain visible with an unmistakable stale label and unchanged source receipts. |
| Declared Passport shard fetch/hash failure | Only that Passport reports the shard failure and offers retry; a manifest-declared empty bucket instead shows honest no activity. Maxis, Season, Champions, and another shard continue working. |
| Single-season manifest | Selector remains usable, Champions explains that no prior champion archive exists, and the current season end stays open-ended when the next activation is unknown. |
| Unavailable/incomplete lane | Explain the missing exhaustive coverage and publish no crown, cutoff, rank delta, badge, Honor, or Unicorn credit for that lane. |
| Protocol rollover before settlement | New season opens and resets immediately while the ending season is concurrently `settling`; no champion archive or permanent crown badge is published before the 24-hour guard and exact-boundary rebuild. |
| Missed protocol refresh | A non-adjacent protocol jump fails closed or backfills every intervening activation in order; it never closes the old season at the wrong boundary or omits a protocol season. |
| Older frozen lane catalog | A finalized older season validates and renders from its own frozen lane definitions after a later evaluator adds, removes, or renames a lane. |
| Resumed Transaction checkpoint | Resuming from the stored strict ID cursor produces the same counts, active days, and last activity as a one-pass fixture; duplicate/non-increasing IDs and boundary leakage are rejected. |
| Deferred Transaction build | A bounded run writes only a signed `transaction-state.building.json`; the prior manifest, summary, complete state, and Passport bytes remain unchanged until the raw count reconciles and the sidecar is promoted. The frozen rules file exists before the first sidecar write. |
| No-change Passport refresh | A shard whose Passport content did not change remains byte-for-byte identical with the same SHA-256 hash even though the active summary receives a newer snapshot time. |
| Mixed-deploy summary | A summary whose season, protocol, evaluator, or rules receipts do not match its manifest entry fails closed before any board or Passport shard is accepted. |
| Finalization crash retry | Retrying after the finalized summary/shards were written but before the manifest preserves the summary's original `finalizedAt` and produces the same manifest identity. |

Finally, compare the active rules file before and after a refresh, then compare a
finalized season archive before and after refreshing the next season. Frozen
rules and archived champions must remain byte-for-byte stable. Verify
`data/maxis-leaders.json` still feeds the canonical Maxis room only, while
season-wide Unicorn counts activity from one protocol window and one frozen
ruleset.

Known noisy upstream conditions: TzKT `429`, CoinGecko `429/503`, and GoatCounter localhost warnings. Treat syntax errors, page errors, missing selectors, 404s, or blank widgets as blockers.
