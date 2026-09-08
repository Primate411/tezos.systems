# Codebase audit follow-through — 5 September 2026

This work addresses all nine deferred items from the full-codebase audit. The
starting revision was `2e29e1b2b4464d61e9edad5c6039d38e15a249d6`, already published
with 98 passing browser suites. Work began with another read-only review of the
affected architecture, a fresh startup measurement, and independent investigations.
The original source audit remains in `docs/codebase-audit-2026-09-04.md`.

| Item | Implementation | Evidence and remaining verification |
| --- | --- | --- |
| 1. Network Health CI failures | Trusted keyboard receipt navigation respects the overlay focus contract; the all-theme test retains its imported theme module and makes synchronous theme calls. Product assertions remain strict. | Both original failures reproduced deterministically: delayed focus restoration and CDP `Promise was collected` under forced GC. Fixed stress test and two integrated Network Health runs passed with retries disabled. |
| 2. Widgets | All eight validate atomic readings, reconcile quietly, retain last-good data/source time, distinguish HTTP 404 from outage, offer stable retry, and queue hidden completions. | Three full browser passes cover desktop/mobile, themes, all metric combinations, zero vs missing, selection, focus, nested/page scrolling and immediate reader scroll. |
| 3. Payload contracts | TzKT/RPC/price contracts run before caching; stored aggregates and prices are revalidated. Malformed cached values are evicted and retried. Explicit zero stake cannot fall through to older/fallback balances. Header metadata is pinned to the captured level. | Positive/negative source tests, invalid-200 recovery, cache/schema/clock tests, source-quality retention, and browser failure/recovery coverage. |
| 4. Release Radar | Reviewed the three lanes against current primary receipts. Confirmed Octez 25.2 and EVM 0.65, corrected the empty-FAST-window inference, separated kernel 7.1 deployment from the full Tezos X rollout. | Exact publication timestamps and complete governance histories; 36-hour freshness and 14-day expiry retained. See the separate review. |
| 5. Eager JavaScript | Small share facade and shared state preserve public APIs; heavy image rendering loads on capture. Calculator, comparison, State of Tezos and native explorer initialize on intent. | Failed-import retry, concurrent/early actions, deep links, mobile captures, and cold-load resource measurement. |
| 6. CSS lifecycle | Preserved synchronous Index geometry and Cycle History controls, moved Anthology-only styling behind its own lifecycle, and minified home/search CSS. | All 90 settled computed-style comparisons passed: home, Anthology library and story, 15 themes, desktop/mobile; base stylesheet loading was asserted and screenshots inspected. |
| 7. Data transport | 67 versioned independent encodings reconstruct original bytes before existing semantic/hash checks. Expanded public and frozen season data stay unchanged; scheduled rollback owns each source/transport pair. | Exact round trips and adversarial input tests; all Capital/Minerals/Ecosystem views and the largest real Passport at desktop/mobile. See the transport report. |
| 8. Request ownership | Read caches distinguish headers/formats and exclude writes/no-store. Broker identity includes provider/body/credentials/policy; deadlines cover bodies and retries, with finite provider budgets and isolated caller cancellation. | Stalled header/body tests free queued slots; total-budget cancellation stops retry waits; cross-provider/header/body and stricter-cache recovery tests. |
| 9. Build/test maintenance | Shared static test catalog powers local/hosted entry points. Smoke cancellation stops suites/retries and closes only owned browser/server descendants, with a bounded fallback and cancellation ledger. CSS generation and commit ownership also share one catalog. | SIGINT/SIGTERM exit 130/143; graceful/hung cleanup and unrelated-process survival tests; actual aggregate CLI proof removed all six owned descendants. |

The final full static gate passed. All 101 browser suites have current passing
coverage: 98 passed in the broad two-shard sweep, and the three fixture corrections
described below each passed twice with assertion and infrastructure retries
disabled. The original shard ledgers remain red for those original failures;
they are preserved alongside the clean focused receipts, not relabeled green.
There are no unresolved browser failures and no deployment claim.

## Measurements and tradeoffs

The final comparison ran the clean starting revision and updated checkout
sequentially after all browser suites finished. Each used one warmup plus five
cold runs, a 1440×900 viewport, blocked external I/O, reduced motion, no service
worker, and a 2.5-second settle. Both passed the existing byte and blocking-time
stability gates with zero variation in those metrics.

| Startup measurement | Clean starting revision | Updated checkout |
| --- | ---: | ---: |
| Decoded bytes | 4,030,315 | 3,711,777 |
| JavaScript bytes | 2,746,724 | 2,515,451 |
| CSS bytes | 955,735 | 863,820 |
| JSON bytes | 65,334 | 70,112 |
| Requests | 126 | 127 |
| DOM elements | 4,437 | 4,107 |
| Median DOMContentLoaded | 106.2 ms | 101.8 ms |
| Median blocking time | 0 ms | 0 ms |
| Layout shift | 0 | 0 |

The final profile saves 318,538 startup bytes (7.9%), including 231,273 fewer
JavaScript bytes and 91,915 fewer CSS bytes. Updated upstream launcher receipts
account for the small JSON increase. No duplicate module requests were observed.
The small timing difference is device-specific and is not a universal speed
claim. Earlier samples taken alongside browser tests remain diagnostic artifacts;
the isolated `initial-load-before-quiet.json` and `initial-load-after-quiet.json`
are the final comparison receipts.

The 67 transports reduce decoded response bytes from 60,579,400 to 37,766,259
(37.7%) and gzip from 3,863,515 to 3,574,052 (7.5%). Only a requested room or
address shard downloads. Guarded decode/reconstruction costs roughly 5–8 ms
more than parsing/hashing raw JSON on the measured machine. That tradeoff is
explicit; this is a transfer optimization, not a claim of lower parsing cost.

## Supporting reports

- [Lossless transport and measurements](chamber-data-transport-2026-09-05.md)
- [Release Radar primary-source review](release-radar-review-2026-09-05.md)

## Review priorities

The lower-risk work is the test-fixture repair, shared build/test catalogs,
owned-process cleanup, and dated primary-source corrections. Those changes have
direct regression receipts and do not redesign live dashboard behavior.

The more sensitive changes are strict API/cache contracts, broker deadlines,
widget reconciliation, optional-module initialization, CSS lifecycle boundaries,
and lossless transport. Their tests cover failure/recovery and retained reading
state, but their tradeoffs still deserve review: malformed sources now remain
unavailable, optional tools have an asynchronous first action, and transports
add guarded decoding time plus 37.8 MB of derived repository artifacts. No
original public or frozen Passport data is removed.

The user approved committing and publishing this reviewed change set on
8 September 2026. This report records local acceptance before publication;
hosted CI, deployment and served-asset verification are separate release checks.

## Integration on 8 September

The checkout includes upstream scheduled-data updates through `32ce2cf6`; all
67 transports were regenerated from those exact source files. Nine live TzKT,
Octez and CoinGecko response samples passed the stricter contracts with HTTP 200.
The static gate passed, including 497 root contracts, source/body-deadline tests,
transport integrity checks, generated route checks, and real process cancellation.

Broader browser verification caught and corrected an early Native Explorer
initialization race, a shared Cycle History style crossing the lazy CSS boundary,
and a late protocol-index render retrying an unrelated failed search catalog.
Existing refresh and failure fixtures now address transport requests and wait for
explicit lazy tool readiness while preserving their original assertions.

The final sweep identified three additional fixture corrections. Cycle metadata
now honors the exact block requested instead of whichever head another request
last returned. The desktop feature workflow now has an explicit account receipt
for the pending baker it opens. Passport tampering now changes the underlying
receipt and builds an internally valid transport; the independent original
season hash still rejects it. Each corrected suite passed two complete runs
without retries. All 15 themes also passed the full desktop/mobile theme suite.

The final compact-versus-expanded browser comparison passed again on 8 September
for every Capital, Minerals and Ecosystem view and the largest current Passport
shard at both widths. The 90 CSS comparisons also passed after freezing active
animations, resolving off-screen styles, and verifying the shared base stylesheet
loaded for each cloned route. Screenshots confirmed the rendered room identity.

Final evidence is in `/tmp/tezos-nine-followups-Axeg0r/`: `static-final-5.log`,
`final-verification.json`, the original `full-1c`/`full-2b` ledgers, and
`cycle-pinned-final`, `feature-workflows-final`, `maxis-integrity-final` for the
three corrections. Additional receipts include `css-parity.json` (90 cases),
`transport-final.log` (14 browser contexts), `live-source-validation.json`
(nine live source samples), and the focused repeated reader-state tests.

## Local review

The checkout is available at `http://127.0.0.1:9999/` while the local preview
process is running. These checks describe the locally verified behavior.

- Open Calculator, Comparison, State of Tezos and a native explorer result;
  try image sharing. Their first action loads the tool and preserves the action.
- Open Protocol Anthology and Cycle History in a preferred theme, then repeat
  at phone width. Check room styling, close controls and retained reading position.
- Open Capital, Critical Minerals, Ecosystem Activity and a Maxis Passport.
  Their figures, source links and original receipt validation remain intact.
- Open Release Radar's full evidence view; the released operator binaries and
  the still-qualified full Tezos X rollout should remain distinct.
- Read a widget during a refresh and source failure. Its last-good value and
  source clock stay visible, with a stable retry state.
