# Tezos Systems QA

Run these checks before deploying changes to `main`.

## One-time setup

```sh
npm install
npx playwright install chromium
npm run install-hooks
```

If Playwright's bundled Chromium is not installed, the smoke runner will fall back to a local Chrome/Chromium-family browser when available. You can force a specific browser with `BROWSER_EXECUTABLE_PATH=/path/to/chrome`.

## Standard pre-deploy pass

```sh
npm test
```

This runs:

- `npm run test:static`: dependency-free checks for JSON validity, local asset references, cache-bust alignment, CSP domains, core DOM selector contracts, and served CSS freshness.
- `npm run test:smoke`: starts a local static server, opens Chromium, checks desktop and mobile dashboard flows, and crawls standalone pages plus widgets.

## Useful variants

```sh
npm run test:static
BASE_URL=https://tezos.systems npm run test:smoke
SMOKE_HEADED=1 npm run test:smoke
STRICT_EXTERNAL=1 npm run test:smoke
BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:smoke
```

- `BASE_URL` points the browser smoke suite at an already-running local server or the live site.
- `SMOKE_HEADED=1` opens the browser visibly for debugging.
- `STRICT_EXTERNAL=1` fails on upstream data warnings that are normally tolerated, such as CoinGecko or TzKT rate limits.
- `BROWSER_EXECUTABLE_PATH` pins the browser executable used for the smoke crawl.

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

Known noisy upstream conditions: TzKT `429`, CoinGecko `429/503`, and GoatCounter localhost warnings. Treat syntax errors, page errors, missing selectors, 404s, or blank widgets as blockers.
