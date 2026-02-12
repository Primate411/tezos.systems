# Tezos Systems

Real-time network statistics dashboard for the Tezos blockchain. Tracks consensus, economics, governance, network activity, and ecosystem metrics with live data.

🌐 **Live:** [tezos.systems](https://tezos.systems)

## What This Is

A single-page dashboard that pulls live data from TzKT and Tez.Capital APIs to display Tezos network health at a glance. Built for bakers, stakers, and anyone who wants to understand what's happening on-chain without digging through an explorer.

**Key stats tracked:** baker count, tz4/BLS adoption, staking ratio, issuance rate, APY, governance status, transaction volume, smart contract/token counts, smart rollups, and more.

## Architecture

**Zero dependencies.** Pure vanilla JS (ES6 modules), CSS3, and HTML. No framework, no build step, no bundler. Hosted on GitHub Pages.

### Project Structure

```
tezos.systems/
├── index.html                  # Single-page app entry
├── css/
│   └── styles.css              # All styles (~6000 lines) — includes 6 theme variants
├── js/
│   ├── core/
│   │   ├── app.js              # Main orchestrator — data fetching, rendering, modals
│   │   ├── api.js              # TzKT + RPC API integration
│   │   ├── config.js           # API endpoints, refresh intervals, constants
│   │   ├── storage.js          # localStorage wrapper
│   │   └── utils.js            # Number formatting, date helpers
│   ├── features/
│   │   ├── calculator.js       # Staking rewards calculator
│   │   ├── comparison.js       # "How Tezos Compares" cross-chain data
│   │   ├── governance.js       # Voting period tracking
│   │   ├── history.js          # Historical data charts (Chart.js)
│   │   ├── my-baker.js         # Per-baker performance lookup
│   │   ├── objkt.js / objkt-ui.js  # NFT profile integration (objkt.com)
│   │   ├── price.js            # XTZ price ticker (CoinGecko)
│   │   ├── sleeping-giants.js  # Large dormant account tracker
│   │   ├── streak.js           # Baker streak tracking
│   │   └── whales.js           # Whale transaction feed
│   ├── ui/
│   │   ├── theme.js            # Theme system — 6 themes, picker, first-visit modal
│   │   ├── share.js            # Screenshot/share captures (html2canvas)
│   │   ├── animations.js       # Card flip animations on data update
│   │   ├── gauge.js            # SVG gauge component (staking ratio)
│   │   ├── tabs.js             # Tab navigation
│   │   └── title.js            # Dynamic page title with live stats
│   └── effects/
│       ├── matrix-effects.js   # Matrix digital rain canvas (matrix theme)
│       ├── bg-effects.js       # Void/Ember/Signal canvas backgrounds
│       ├── arcade-effects.js   # Easter egg arcade mode
│       └── audio.js            # Sound effects
├── data/
│   ├── protocol-data.json      # All 21 Tezos protocol upgrades (A→T)
│   ├── protocol-debates.json   # Contentious upgrade narratives
│   └── tweets.json             # Curated tweets for share templates
├── scripts/
│   └── generate-og-image.js    # OG image generator
└── .github/
    └── scripts/
        └── collect-data.js     # GitHub Actions data collection
```

### Data Flow

1. **app.js** calls **api.js** on load + every 2 minutes
2. API responses update the DOM directly (no virtual DOM, no state management)
3. **animations.js** triggers flip animations when values change
4. Sparkline charts rendered inline via canvas
5. **price.js** fetches XTZ price independently (CoinGecko, 60s refresh)

## Theme System

Six visual themes, selectable via the settings gear → Theme picker dropdown:

| Theme | Vibe | Background |
|-------|------|-----------|
| **Matrix** | Green terminal hacker | Digital rain canvas, monospace accents |
| **Void** | Deep space purple | Particle field canvas |
| **Ember** | Volcanic fire | Warm particle canvas |
| **Signal** | Cool tech blue | Radar-style canvas |
| **Clean** | Etherscan-inspired light | Pure white, no effects, compact layout |
| **Default** | Refined dark blue | Subtle gradient, no canvas |

### How Themes Work

- CSS: `[data-theme="X"]` attribute on `<body>` drives all styling via CSS variable overrides
- Variables defined in `:root` (default) and `[data-theme="X"]` blocks in `styles.css`
- Canvas effects (matrix rain, particles) start/stop based on `themechange` events
- **Clean theme** is the only light theme — has extensive `!important` overrides to force dark text, system fonts, and compact spacing over the base dark-theme styles
- Protocol history modals use **inline styles** in `app.js` (~line 860-1010) with `isClean`/`isMatrix` ternaries for theme-aware colors
- Share captures in `share.js` also have per-theme color maps for `html2canvas` backgrounds
- Theme picker: dropdown with 3 color dots per theme + hover-to-preview
- First-visit: "Choose Your Vibe" modal when no localStorage key exists
- Persistence: `localStorage.setItem('tezos-systems-theme', themeName)`

### Adding a New Theme

1. Add name to `THEMES` array in `js/ui/theme.js`
2. Add `THEME_COLORS` entry with `bg`, `accent`, `text` hex values
3. Add `[data-theme="yourtheme"]` CSS variable block in `styles.css` (~line 136)
4. Add override rules at end of `styles.css` for any base styles that leak
5. Add `isYourTheme` branches in `app.js` modal builder and `share.js` capture colors
6. If it has canvas effects, add a class in `bg-effects.js` and register in `BG_THEMES`
7. Add icon to `updateThemeIcon()` in `theme.js`

## Key Sections

### Protocol Timeline
The horizontal A→T letter grid shows all 21 Tezos self-amendments. Clicking a letter opens a detailed modal with upgrade info. Contentious upgrades (⚔) have debate narratives from `protocol-debates.json`. Share buttons generate themed screenshot cards.

### Stat Cards
Each metric card has: label, big number (with sparkline trend chart), 7-day change badge, info (ℹ️) tooltip, and per-card share (📸) button.

### Toolbar Features (toggleable)
- **My Baker** 🥐 — Enter a baker address to see performance
- **Calculator** 🧮 — Staking/delegation rewards estimator
- **Compare** ⚔️ — Cross-chain comparison table
- **NFTs** 🖼️ — objkt.com profile integration
- **Whales** 🐬 — Large transaction feed
- **Giants** 😴 — Dormant large accounts
- **History** 📈 — Historical charts with time range selector
- **Ultra** ⚡ — Advanced display modes
- **Share** 📸 — Full-page or section screenshot capture

## Local Development

```bash
git clone https://github.com/ArtDeco/tezos.systems.git
cd tezos.systems
python3 -m http.server 8888
# Open http://localhost:8888
```

No build step. Edit files, refresh browser. Cache busting is done via `?v=` query params in `index.html` — bump these when deploying CSS/JS changes.

## APIs Used

| API | Purpose | Endpoint |
|-----|---------|----------|
| TzKT | Baker data, staking, governance, transactions | `api.tzkt.io/v1/` |
| Tez.Capital RPC | Issuance, supply data | `eu.rpc.tez.capital` |
| CoinGecko | XTZ price | `api.coingecko.com/api/v3/` |

## Deployment

Push to `main` → GitHub Pages auto-deploys. Custom domain via CNAME file.

**Cache busting:** Update `?v=` params in `index.html` script/link tags before deploying.

## Analytics

GoatCounter (privacy-friendly, no cookies): `tezsys.goatcounter.com`

## Known Patterns & Gotchas

- **Inline styles in modals:** Protocol history modals (`app.js` ~line 860-1010) use extensive inline styles with theme-conditional colors. Any new theme MUST add `isNewTheme` branches here or text will be invisible.
- **Share captures:** `share.js` has 6 `html2canvas()` calls with hardcoded theme color maps. New themes need entries in these maps.
- **CSS specificity wars:** The clean theme uses `!important` heavily because base styles are very specific. This is intentional — the alternative was restructuring 6000 lines of CSS.
- **Canvas effects:** Only matrix/void/ember/signal have canvas backgrounds. Clean and default have none. The canvas is a `<canvas>` element prepended to body, managed by `matrix-effects.js` and `bg-effects.js`.
- **Word-spacing fix:** Mobile WebKit + small rem fonts + `text-rendering: optimizeLegibility` = words joining together. Fixed with `geometricPrecision` + absolute px word-spacing in share captures.

## Credits

- **Data:** [TzKT](https://tzkt.io) and [Tez.Capital](https://tez.capital)
- **Built by:** [Tez Capital](https://tez.capital)

---

Built for the Tezos ecosystem 🫶
