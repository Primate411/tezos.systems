# Codebase and data audit — 4–5 September 2026

Scope: the complete tracked site at `2f9b08d5`, followed by the safe changes on
`audit/safe-codebase-cleanup-2026-09-04`. The main checkout contained unrelated
edits and changed during inspection. Implementation and verification therefore
use `/Users/primate/Code/tezos.systems-code-audit`, an isolated local worktree.
This work is commit-only; it does not publish or push anything.

## What was examined before editing

The read-only phase inventoried all 589 tracked files, mapped entry points and
imports, inspected runtime and generator ownership, and reproduced candidate
failures before changing source. The committed inventory includes:

| Area | Files | Bytes | Inspection |
| --- | ---: | ---: | --- |
| Browser JavaScript | 145 | 4,805,845 | Dashboard boot, standalone handoff, routing, all feature families, caches, requests, timers, effects, overlays and shared UI |
| CSS, including generated bundles | 73 | 3,352,460 | Source/output relationships, themes, responsive overrides, lazy loading and actual browser geometry |
| Data artifacts | 101 | 76,656,136 | Schemas, sizes, consumers, compact projections, source clocks, integrity binding and generator-only state |
| Scripts and libraries | 63 | 1,076,826 | Collection, paging, generation, scheduled lanes, CSS/routes, measurement and release machinery |
| Tests and fixtures | 41 | 3,343,720 | Static contracts, browser ownership, hermetic fixtures, retry classification and existing regression coverage |
| Other tracked surfaces | 166 | — | Root and generated HTML, widgets, workflows, Supabase schema, assets, metadata, licensing and documentation |

Checks across that inventory included:

- AST parsing of all 248 tracked JavaScript/module files across runtime and
  tooling: no parse errors. All 644 literal relative module references resolved.
- Parsing all 110 tracked JSON files, including metadata outside `data/`: no
  invalid JSON or duplicate object keys. HTML local asset references resolved.
- Dependency audit: zero reported security advisories at audit time. Knip and
  identifier-reference scans were treated as candidate generators; dynamic
  feature entries, test exposures, public exports and frozen Maxis evaluators
  were inspected separately before any removal.
- Source-to-consumer tracing for TzKT/RPC/Supabase, prices, My Tezos, governance,
  Maxis careers/seasons/passports, Ecosystem wallets, TezosCRP, commodity receipts,
  launcher projections, snapshot validation and service-worker cache boundaries.
- Baseline static checks, focused real-browser reproduction, startup resource
  capture and controlled slow/failing-request experiments. A broad run against
  the changing main checkout was stopped and was not used as final evidence.

This combines a complete inventory and systematic scans with detailed tracing
of the highest-risk paths. It does not establish correctness of every upstream
fact or every possible browser interaction.

## Safe changes implemented

| ID | Finding and change | Evidence / benefit |
| --- | --- | --- |
| S1 | Keep shared statistics, constants, issuance-rate and CoinGecko promises until settlement. Bound price endpoint reads to 15 seconds so a stalled request cannot pin the shared slot indefinitely. Route the price bar through the same price loader. Clear an existing price timer on reinitialization. | Holding a request open for six seconds previously started a second request for each API helper and duplicated both CoinGecko endpoints. These now remain shared and can recover after failure or timeout. Existing one-minute API and thirty-minute price data caches retain their clocks. |
| S2 | Give forced voting-period and JSON-asset refreshes ownership of their promise/cache slot. | An old asset failure previously discarded a newer pending request, producing three requests instead of two. An older voting response could overwrite newer cached data or clear its pending request. Tests cover both completion orders. |
| S3 | Release failed search-catalog and My Tezos contract-registry promises. Track actual catalog loading separately and prevent a completion render from starting another lookup. | One transient failure previously stuck the catalog at an empty result for the session. A later search can now recover, without an automatic retry loop or a stuck loading indicator. Browser coverage checks failure, query/focus preservation, and recovery on desktop and mobile. |
| S4 | Reject already-aborted broker callers before enqueueing; remove abort listeners on completion; distinguish absent `Retry-After` from explicit zero. Remove the unused cancellable-wait branch. | An already-aborted caller previously started network work. `Number(null)` previously bypassed retry backoff. Tests preserve cancellation isolation between shared callers, explicit zero, numeric and HTTP-date headers. |
| S5 | Allow only one widget refresh at a time and catch synchronous fetcher failures. | Slow refreshes previously overlapped on interval/visibility events. Hidden widgets remain gated and perform one catch-up when visible. |
| S6 | Remove 24 unreferenced private functions and 15 unused declarations. | Removed 15,678 bytes of function bodies, plus obsolete comments/declarations. Includes the abandoned Cycle Pulse strip/style injector, old My Tezos canvas renderer, unused share selectors and private formatting helpers. Active effects, public exports and frozen Maxis files are preserved. |
| S7 | Replace the unused `clean-css-cli` dependency with direct `clean-css` 5.3.3. | Removes 29 lockfile packages. No retained package changes version. The existing CSS compiler version and generated output are preserved, apart from the intentional status-label CSS change. |
| S8 | Include `market-room.css` in generated-surface rebuild/staging and verify every lazy stylesheet is catalogued. | The compiler knew about this file but the commit orchestrator did not; a source-only change could miss its served output. All 16 lazy surface pairs are now covered. |
| S9 | Share source-file reads within the read-only static-check process. | Repeated contracts no longer re-read the same large source files. No persistent cache or cross-run invalidation behavior is introduced. |
| S10 | Reserve a consistent width for every Chamber status label. | On 390px screens, changing `watch` to `snapshot` moved the sentence by about 20px and changed its height. The existing browser test failed on pristine committed code. It now checks all nine statuses, including `unavailable`, at 1440/390/320px. |
| S11 | Make initial-load measurement observe launcher intersections before allowing hydration. Keep the full-artifact guard. | The old audit rejected the default visible Ecosystem card's module, CSS and small projection. New checks distinguish legitimate visible hydration from requests made before visibility or for another card. |
| S12 | Align My Tezos's module preload with its versioned runtime import. Reject duplicate module URLs in startup measurement and enforce preload stamp alignment statically. | Browser capture showed both unversioned and versioned copies downloaded. The change removes one approximately 149 KB decoded download after cleanup; it does not change module initialization. |
| S13 | Refresh runtime documentation, changelog and cache references. | Replace the stale `v554` handoff claim with its canonical source; describe lazy Chamber boot accurately. Align asset/cache stamp 627 and regenerate the 25 Chamber and 22 Anthology route shells. |
| S14 | Wait for dashboard readiness before the Home layout smoke clicks Settings and the reward-report helper opens My Tezos. | A controlled module delay reproduced the race: layout state was exposed while Settings was still unwired; the reward helper likewise clicked an early visible button. The broad run correctly marked retry-only passes as flaky. Focused checks are repeated without retries after correcting readiness. |
| S15 | Measure Uranium after fonts and entrance animation settle; verify its contained scrolling tab rail and actually open the last tab. | The old smoke assumed all four readable phone tabs fit simultaneously. The current shared room CSS deliberately scrolls that rail. With fallback fonts, Proofbook extended about 4px past the initial viewport but remained scrollable. The new check proves containment and reachability without shrinking labels or weakening page-overflow checks. |
| S16 | Wait for populated Health, Staking and Ecosystem room content in the tall-screen smoke. | Two fresh-browser repeats reproduced a scroll assertion against the short Network Health loading screen; its screenshot confirmed content was still pending. The shell remains immediately visible, and the test now checks overflow and scrolling after the room's data content renders. |
| S17 | Correct share-image route fallbacks and missing governance metrics. | Final inspection of hook-generated and baseline images exposed the same stale defaults: the topic directory, archive and Tezlink alias inherited governance facts, while null percentages became zero. The generator now uses route-specific directory/archive content, canonical aliases and an identity-only fallback. Anthology metadata points to its own artwork. Missing percentages and closing dates stay unavailable; actual numeric zero remains zero. |

Regression logic is in `tests/request-lifecycle-check.mjs`, the existing static
contracts, and the extended `chamber-reading` browser suite. These tests execute
controlled failures and completion races; they do not contact live upstreams.

## Risky improvements recommended, not implemented

### 1. Split the eager dashboard module graph

`js/core/app.js` is about 374 KB, `network-health.js` about 314 KB,
`daily-briefing.js` about 174 KB, and `my-tezos.js` about 156 KB before cleanup.
The resource trace confirms that substantial dashboard code loads even with
external requests blocked. Changelog and some large archives are already lazy;
file size alone is insufficient evidence that a resource harms first paint.

Extract pure models and narrow entry renderers, then defer optional drawer,
export/share and deep-inspector work at explicit intent boundaries. Start with
one measured slice. Preserve synchronous search starters, standalone-to-dashboard
handoff, cached visits, route restoration, saved My Tezos state and keyed Live
Head rows. Splitting these closure-heavy modules can change state ownership,
initialization order and reader locks. Budget using repeated desktop/mobile
measurements and representative interactions, not only source-byte totals.
Some shell buttons are visible before their handlers are installed while
`prepareDashboardDependencies()` is pending. A further boot redesign should
queue or disable those actions explicitly instead of relying on fast loading.

### 2. Consolidate and split CSS by actual lifecycle

`css/hero-search.css` is about 237 KB; the served base bundle is about 307 KB.
Shared shell and room-specific overrides span several files. Initial-view CSS
coverage shows only one state and must not justify deleting theme, focus,
keyboard, reduced-motion, disclosure or overlay rules.

Separate the idle search rail, full Index Chamber and optional room styles;
consolidate competing overrides into their owning component after inspecting all
15 themes and responsive states. Keep precreated opaque loading surfaces and
font/layout stability. This is a visual regression project, especially while
other work is actively changing these surfaces.

### 3. Extend lossless data codecs and narrower projections

Candidates include `ecosystem-stats.json` (2.57 MB),
`minerals-snapshot.json` (1.86 MB), `capital-snapshot.json` (1.50 MB), and Maxis
Passport shards approaching 1 MB. The 7.31 MB transaction-state file is
**generator state**, so shrinking it is not automatically a browser-startup win.
TezosCRP already has a lossless compact transport; Maxis careers already use
compact JSON, and unopened Chambers already use small entry projections.

Profile parsing and the largest real consumer before extending dictionaries,
columnar transport or view-specific shards. Require semantic round trips,
source-link preservation, exact counts and null/qualifier/unit preservation.
Regenerate snapshot/projection hash bindings together. Frozen Maxis season
rules, source code and receipts require their versioned migration rules; never
rewrite them as routine cleanup. Do not shorten receipt history, sample wallets,
or replace exact paged aggregates with approximate counts to reduce size.

### 4. Unify request budgets and cache ownership across feature families

`api.js`, `tzkt-throttle.js`, `my-tezos-request-broker.mjs`, provider adapters,
Chamber caches and snapshot validation have different scope and failure
contracts. The safe fixes here repair local lifetime mistakes. Replacing those
layers with one cache could mix current data with historical receipts or allow
an old response to overwrite a newer observation.

Define provider deadlines, response types, priorities, caller ownership and
source freshness explicitly before consolidating. The My Tezos broker also
needs a separately designed deadline for a fetch that never settles. Its generic
fingerprint does not include headers/provider, and object-body normalization
can lose nested keys; current JSON callers generally pass serialized strings.
Broaden that API only with collision, retry, pause/resume and cancellation tests.
Keep cross-origin API responses out of service-worker Cache Storage replay.

### 5. Bring older widgets fully under quiet refresh

The safe change prevents overlapping refreshes. Individual widgets still own
older render/error behavior. For example, `widgets/baker-card.html` rebuilds its
content and reports “Baker not found” after a fetch failure; the staking-ratio
widget replaces its value on failure.

Reconcile keyed content, preserve last-good data, and distinguish failed source
reads from an actual missing baker. Design a small stable freshness area so
failure wording cannot move the embed. Verify focus, selection, scroll, node
identity and a user scroll immediately after refresh. Simply retaining values
without showing their source age would introduce misleading freshness.

### 6. Validate source payloads without normalizing away uncertainty

Several older adapters rely on upstream shapes and broad catch/fallback logic.
The price formatter, for example, assumes numeric USD after the two-endpoint
merge. A malformed or partially populated response needs explicit validation
before entering a cache or renderer.

Add source-specific schemas and complete/partial/unavailable states per feature,
then preserve the source clock of every retained observation. A global
`null`/missing-to-zero cleanup would distort prices, participation, missing
commodity observations and partial coverage. This requires per-source semantic
and malformed-payload tests, not a mechanical replacement of fallback syntax.

### 7. Refresh expired Release Radar evidence through editorial review

The read-only freshness check failed two contracts: the Release Radar review
exceeded its 36-hour limit and its receipt was expired. Other checked freshness
contracts passed at that inspection time.

Review the actual release evidence and regenerate the receipt through its
normal reviewed process. Advancing timestamps or weakening expiry checks would
misrepresent readiness. No Release Radar claim or review timestamp was changed
in this audit. This is a time-sensitive operational finding, not a blanket claim
that the site's data is stale.

### 8. Reduce maintenance duplication in the test/build catalogs

Large static suites and repeated source/asset catalogs are susceptible to drift;
the missing Market Room entry and old startup assumption are concrete examples.
Introduce shared declarative catalogs where they have the same semantics, and
split static checks by feature ownership while preserving failure aggregation.
Give Knip explicit runtime, generated-page and script entries before making it
a blocking gate. Its raw unused-export output includes dynamically loaded and
versioned compatibility surfaces; deleting those automatically is unsafe.
Superseded browser runners also continued after SIGTERM during this audit and
required process-tree termination. Add explicit cancellation and descendant
cleanup tests before changing the aggregate runner's signal/exit semantics.

## Existing safeguards to preserve

- Quiet refresh already provides shared reconciliation, source failure retention,
  focus/selection preservation and visibility gates across major Chambers.
- Standalone room entry, lazy launcher projections and validated snapshot caches
  already avoid many expensive full-dashboard/full-data boots.
- Scheduled generators isolate failing source families and preserve exact
  last-good files. The separate freshness alarm is useful precisely because it
  can detect a stale reviewed receipt.
- TezosCRP's compact transport, immutable Maxis evaluators and source-native
  commodity units/qualifiers are deliberate integrity boundaries.
- Hermetic browser fixtures, isolated suites, classified retries and flaky-as-red
  results should remain strict during further optimization.

## Verification and delivery

The complete static gate passed, including request lifecycle, generated-data
integrity, quiet refresh, service-worker behavior and all 47 generated route
checks. A clean dependency installation uses the same CSS compiler version;
`npm audit` reports zero vulnerabilities. CSS regeneration changed only the
intended `shell-extras.min.css` output.

The broad hermetic browser run executed all 98 suites in isolated browsers:
94 passed on their first attempt and four passed only on a diagnostic retry.
Both aggregate ledgers correctly remain **red**, with no permanently failing
suite in that run. Retry-only success is not reported as a clean full-suite pass.

| Retry-only suite | Investigation and follow-up |
| --- | --- |
| Uranium Chamber | Corrected the font/animation and scrolling-tab assumptions (S15); two subsequent runs passed with retries disabled. |
| My Tezos delegator rewards | Corrected the early click before dashboard readiness (S14); two subsequent runs passed with retries disabled. |
| Capital Chamber | A five-second wait timed out during concurrent browser work. The test and timeout were unchanged; two subsequent runs passed with retries disabled. This does not prove the broader timeout can never recur. |
| Tall screen | Reproduced the loading-screen race twice, inspected its screenshot and corrected readiness (S16). Two subsequent runs passed with retries disabled, including standard/narrow/wide rooms at 1× and 2× density. |

Ten focused suites each passed twice with assertion and infrastructure retries
disabled: Home layout, Chamber reading, Uranium, Capital, My Tezos delegator and
staker rewards, desktop and mobile Hero Command Bar, route/search state, and tall
screen. The main static contracts passed again after the final test correction
(409 passed, zero warnings or failures).
This includes the new search-catalog failure/recovery check at 1280px and 390px.
Rendered Chamber status checks cover all nine labels at 1440px, 390px and 320px;
screenshots were inspected. The broad theme suite passed all 15 themes.

The final startup measurement used one warm-up and five measured runs at
1440×900, with service workers and external requests blocked. Median decoded
same-origin content was 4,027,481 bytes across 126 requests: 2,746,139 bytes of
JavaScript, 953,519 bytes of CSS and 65,333 bytes of JSON. All runs had no
duplicate module URLs, premature launcher requests or forbidden full-artifact
loads. The visible Ecosystem launcher's module, CSS and small projection loaded
only after its recorded intersection. Byte counts were identical across the
five runs; the harness recorded no long tasks in those runs and passed its
adjacent-run stability thresholds. These are local uncompressed measurements,
not production transfer sizes or a public-site speed claim. No before/after
timing improvement is claimed, and the historical performance baseline remains
unchanged.

The separate freshness alarm still reported the two pre-existing Release Radar
expiry/review failures described above. Its timestamps and checks were not
modified. Larger architecture, data-format and editorial changes remain
recommendations rather than part of the safe audit changes.

Normal commit hooks also refreshed governance receipts, their bound baker
projection, the RSS build date, share images and build metadata. The reviewed
governance changes were a source-reported closing-time adjustment and matching
timestamps/hashes. They did not change protocol identity or vote counts. The
share-image follow-up (S17) was found while comparing those generated images
with the original committed images. Its regression check covers missing and
numeric-zero metrics, closing dates, canonical aliases, archive metadata and
future-route fallback. All four corrected images were visually inspected;
Anthology and its story pages were regenerated against the archive image.
The complete static gate passed again after that correction. A further browser
run passed all 45 route-formatting checks on both desktop and mobile, with
assertion and infrastructure retries disabled.

Detailed local result ledgers, logs and screenshots are retained in
`/var/folders/lk/krgvf4v95cq96wsb7lh3xl3r0000gn/T/tezos-code-audit-23b4rjwn/`.
They are evidence from this checkout and run, not hosted CI or deployment proof.
