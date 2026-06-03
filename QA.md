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

- `npm run test:static`: dependency-free checks for JSON validity, local asset references, cache-bust alignment, CSP domains, core DOM selector contracts, and served CSS freshness.
- `npm run test:smoke`: starts a local static server, opens Chromium, checks the app shell/PWA/cache contract, desktop and mobile dashboard flows, governance/LB, feature workflows, themes, widgets, HEN, and standalone routes.

## Useful variants

```sh
npm run test:static
npm run check:readme
npm run test:smoke:list
npm run test:smoke:headed
npm run test:smoke:strict
npm run test:smoke:live
node tests/smoke.mjs --only app-shell,route-crawl
node tests/smoke.mjs --base-url http://127.0.0.1:9000 --only governance-lb
```

- `--list` shows the available smoke suites.
- `--only` runs one or more suites by name, comma-separated.
- `--base-url` points the browser smoke suite at an already-running local server or the live site.
- `--headed` opens the browser visibly for debugging.
- `--strict-external` fails on upstream data warnings that are normally tolerated, such as CoinGecko or TzKT rate limits.
- `--browser-executable` pins the browser executable used for the smoke crawl.

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
