# Lossless Chamber transport — 5 September 2026

The browser now reads independent versioned object-shape transports for Capital,
Critical Minerals, Ecosystem Activity and all Maxis Passport shards. Expanded
public artifacts remain unchanged. Transaction reconstruction state remains
generator-only and was not counted as a browser optimization.

| Real consumer | Original UTF-8 bytes | Transport bytes | Original gzip | Transport gzip |
| --- | ---: | ---: | ---: | ---: |
| Capital | 1,497,480 | 416,648 | 131,851 | 112,390 |
| Critical Minerals | 1,858,493 | 720,947 | 123,671 | 85,458 |
| Ecosystem Activity | 2,577,134 | 1,156,445 | 183,095 | 155,896 |
| Largest Passport shard | 1,028,864 | 671,678 | 63,610 | 59,159 |
| All 67 transports | 60,579,400 | 37,766,259 | 3,863,515 | 3,574,052 |

This saves 37.7% of decoded response bytes and 7.5% of gzip transfer across all
67 files; a reader downloads only the opened room or requested address shard.
The three complete Chamber snapshots alone save 14.8–30.9% gzip each. This is
not a claim that 59 MB loads at startup. Initial launcher projections remain
small and separate.

Keeping the expanded public receipts also adds another
37.8 MB of derived files to the repository. This increases repository
and deployment-artifact size in exchange for smaller individual browser reads;
it does not reduce storage on the publisher's side.

The byte measurements above were refreshed on 8 September after integrating the
latest scheduled source updates. The guarded decoder trades some CPU for transfer
savings. After browser regression suites finished on 8 September, Chromium warm
medians (30 samples after 10 warmups) for parse plus raw byte hashing versus
transport parse, guarded decode, exact source reconstruction and byte hashing were
3.7/9.8 ms for Capital, 4.6/12.1 ms for Minerals, 4.9/12.1 ms for Ecosystem,
and 2.9/7.7 ms for the largest Passport. Existing downstream semantic/projection
checks still run. Measurements are device-specific, not a universal speed claim.

The `chamber-json-shapes-v1` envelope records original path, serialization,
UTF-8 byte length and SHA-256. Ordered object keys become shared shapes; every
value and array entry survives. Decoding reconstructs the exact original bytes
before the existing schema, semantic hash, launcher file digest, Passport shard
hash, content root and optional last-good cache checks. No clock, source URL,
unit, qualifier, null, rank, count, wallet or historical receipt is truncated.
Frozen Maxis source modules, rules, manifests and original shards are untouched.

Missing transports (404/410) may fall back to their expanded source during
rollout. Malformed, oversized, overdeep, corrupt or temporarily unavailable
transports fail closed; room-level last-good behavior and explicit retry remain
in charge. Mutable transports inherit the source's service-worker network-only
policy. Immutable Passport transports retain normal HTTP caching.

Scheduled source-family lanes own, rebuild and validate their transport outputs
atomically with rollback. Manual/precommit orchestration rebuilds relevant
transports or checks current derivations. The public API remains the expanded
schema; transport files are an explicitly internal browser representation.

Validation: all 67 artifacts round-trip by deep equality and exact byte equality;
negative tests cover identity, digests, reference/shape errors, expansion/depth
budgets, hostile property names, mixed values, fallback and retry. Desktop/mobile
browser comparisons preserve complete text, figures and source links for all four
Capital, five Minerals and three Ecosystem views. The largest real Passport shard
opens through its transport at both widths with unchanged original hash validation.

Reproduce without changing generated observations:

```sh
node scripts/generate-chamber-transports.mjs --check
node tests/generated-transport-check.mjs
node tests/service-worker-cache-check.mjs
node tests/generated-transport-browser.mjs --base-url http://127.0.0.1:9999
node scripts/measure-chamber-transports.mjs --base-url http://127.0.0.1:9999
```
