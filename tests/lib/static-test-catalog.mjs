/** The static gate used by local npm commands and every hosted workflow. */
export const STATIC_CHECKS = Object.freeze([
  { "script": "tests/css-build-check.mjs", "args": [] },
  { "script": "tests/optional-tools-lazy-check.mjs", "args": [] },
  {
    "script": "tests/static-checks.mjs",
    "args": []
  },
  {
    "script": "tests/smoke-harness-check.mjs",
    "args": []
  },
  {
    "script": "tests/scheduled-refresh-check.mjs",
    "args": []
  },
  {
    "script": "tests/generated-freshness-check.mjs",
    "args": []
  },
  {
    "script": "tests/supabase-write-check.mjs",
    "args": []
  },
  {
    "script": "tests/anniversary-check.mjs",
    "args": []
  },
  {
    "script": "tests/ledger-flow-check.mjs",
    "args": []
  },
  {
    "script": "tests/pulse-history-check.mjs",
    "args": []
  },
  {
    "script": "tests/personal-signal-relevance-check.mjs",
    "args": []
  },
  {
    "script": "tests/live-pulse-curio-check.mjs",
    "args": []
  },
  {
    "script": "tests/release-radar-check.mjs",
    "args": []
  },
  {
    "script": "tests/baker-governance-signals-check.mjs",
    "args": []
  },
  {
    "script": "tests/tezoscrp-check.mjs",
    "args": []
  },
  {
    "script": "tests/ecosystem-stats-check.mjs",
    "args": []
  },
  {
    "script": "tests/uranium-check.mjs",
    "args": []
  },
  {
    "script": "tests/metals-check.mjs",
    "args": []
  },
  {
    "script": "tests/minerals-check.mjs",
    "args": []
  },
  {
    "script": "tests/request-lifecycle-check.mjs",
    "args": []
  },
  {
    "script": "tests/chamber-og-check.mjs",
    "args": []
  },
  {
    "script": "tests/chamber-polling-check.mjs",
    "args": []
  },
  {
    "script": "tests/chamber-snapshot-cache-check.mjs",
    "args": []
  },
  {
    "script": "tests/service-worker-cache-check.mjs",
    "args": []
  },
  {
    "script": "tests/source-payload-check.mjs",
    "args": []
  },
  {
    "script": "tests/widget-refresh-check.mjs",
    "args": []
  },
  {
    "script": "tests/generated-transport-check.mjs",
    "args": []
  },
  {
    "script": "tests/test-catalog-check.mjs",
    "args": []
  },
  {
    "script": "scripts/generate-chamber-routes.mjs",
    "args": [
      "--check"
    ]
  },
  {
    "script": "scripts/generate-anthology-routes.mjs",
    "args": [
      "--check"
    ]
  }
].map(entry => Object.freeze({ ...entry, args: Object.freeze(entry.args) })));
