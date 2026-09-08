# Release Radar review — 5 September 2026

This substantive review supersedes the expired August 14 receipt. The three
lanes keep their independent claims and clocks. Freshness remains 36 hours,
expiry remains 14 days, and another review is required before extending either.

## Operator releases

Octez 25.2 is published. The [canonical release page](https://octez.tezos.com/releases/)
lists it as latest and provides binaries and checksums. The
[canonical release API](https://gitlab.com/api/v4/projects/tezos%2Ftezos/releases/octez-v25.2)
sets `released_at` to `2026-09-02T14:22:03.407Z`. The August 24 date on the tag
page belongs to the source commit; using it as the release date would be wrong.

EVM node 0.65 is published. Its
[release API](https://gitlab.com/api/v4/projects/tezos%2Ftezos/releases/octez-evm-node-v0.65)
sets `released_at` to `2026-08-24T17:07:09.170Z`, `upcoming_release` to false,
and links static binaries. Both lanes now show confirmed releases, with empty
forecast horizons. Old forecast entries remain dated history.

## Tezos X scope

The previous claim that no public proposal or governance had begun was wrong.
The [July 31 Ganesha proposal](https://spotlight.tezos.com/announcing-ganesha-etherlink-7th-upgrade-proposal/)
explicitly names the SLOW track and describes Michelson/NAC infrastructure as
preparation for the later full Tezos X rollout. The complete official
[SLOW history](https://governance.etherlink.com/api/slow/pastPeriods) contains
proposal 40 and promotion 41. Promotion 41 has Nay-dominant voting power; it
must not be conflated with later FAST outcomes. The complete official
[FAST history](https://governance.etherlink.com/api/fast/pastPeriods) contains
the later 636/637 proposal/promotion receipt for
`00db5a8b279b9915f7ffef420347b5d9667ac4e73a9c766b7ef71513f748f52c67`.
A null winning candidate in one current FAST window proves neither historical
absence nor the outcome of another track.

Etherlink's [operator maintenance receipt](https://status.etherlink.com/incident/1040145)
names kernel 7.1 mainnet activation. Its window began on August 29 at
19:45:14 UTC and ended at 20:45:14 UTC. This confirms deployed kernel
infrastructure. The [current Tezos X roadmap](https://tezos.com/tezos-x) still
labels Q3 mainnet activation planned, while the
[documentation](https://x.tezos.com/docs/) still describes an experimental
testnet. The review exposes that discrepancy and keeps the wider launch
forecast at low confidence. It does not turn deployment of a kernel or release
of an operator binary into proof that every platform promise is complete.

The ledger now explicitly retracts the earlier FAST-null inference, preserves
the six dependency gates, distinguishes public proposal/recorded governance
from rollout scope, and identifies a full-rollout declaration tied to the
deployed kernel and compatible operator infrastructure as the next signal.

Validation: `node tests/release-radar-check.mjs` proves the reviewed claims,
exact publication clocks, correction history, three separate lanes, six ordered
gates, unchanged freshness budget, no ETA for released artifacts, expiry
removal, safe links and existing quiet-render integration contracts.

## September 8 revalidation

At `2026-09-08T13:29:03.471Z`, all 12 primary URLs above returned HTTP 200. Canonical releases
remain Octez 25.2 and EVM 0.65 with unchanged publication timestamps. Complete
FAST/SLOW histories still end at recorded periods 637/41; the deployment receipt,
Q3 planned roadmap, and experimental-testnet documentation retain the same
source boundaries. The receipt records this re-review in every lane history and
starts a fresh 36-hour review clock with a 14-day expiry.
