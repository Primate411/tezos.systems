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
│   └── styles.css              # All styles (~8000 lines) — includes 8 theme variants
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
│   │   ├── history.js          # Historical data charts (theme-aware sparklines)
│   │   ├── my-baker.js         # Per-baker performance lookup
│   │   ├── objkt.js / objkt-ui.js  # NFT profile integration (objkt.com)
│   │   ├── price.js            # XTZ price ticker (CoinGecko)
│   │   ├── sleeping-giants.js  # Large dormant account tracker
│   │   ├── moments.js          # Network Moments — milestone detection + toasts + timeline
│   │   ├── streak.js           # Baker streak tracking
│   │   └── whales.js           # Whale transaction feed
│   ├── ui/
│   │   ├── theme.js            # Theme system — 8 themes, picker, first-visit modal
│   │   ├── share.js            # Screenshot/share captures (html2canvas)
│   │   ├── animations.js       # Card flip animations on data update
│   │   ├── gauge.js            # SVG gauge component (theme-aware staking ratio)
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
4. Sparkline charts rendered inline via canvas (colors adapt per theme)
5. **price.js** fetches XTZ price independently (CoinGecko, 60s refresh)

## Theme System

Eight visual themes, selectable via the theme picker dropdown with color dot previews:

| Theme | Vibe | Background |
|-------|------|-----------|
| **Matrix** | Green terminal hacker | Digital rain canvas, monospace accents |
| **Void** | Deep space purple | Particle field canvas |
| **Ember** | Volcanic fire | Warm particle canvas |
| **Signal** | Cool tech blue | Radar-style canvas |
| **Clean** | Etherscan-inspired light | Pure white, no effects, compact layout |
| **Dark** | Achromatic minimal | #1A1A1A bg, #222222 cards, #E8E8E8 text, no effects |
| **Bubblegum** | Hot pink playful | Dark rose bg, floating bubble canvas |
| **Default** | Refined dark blue | Subtle gradient, no canvas |

### How Themes Work

- CSS: `[data-theme="X"]` attribute on `<body>` drives all styling via CSS variable overrides
- Variables defined in `:root` (default) and `[data-theme="X"]` blocks in `styles.css`
- Canvas effects (matrix rain, particles) start/stop based on `themechange` events
- **Clean & Dark themes** are data-focused — the `#ultra-canvas` element is hidden via CSS so canvas effects never render
- **Clean theme** is the only light theme — has extensive `!important` overrides to force dark text, system fonts, and compact spacing
- **Dark theme** is fully achromatic with no color accents, no glow/shadow effects, system fonts, and compact layout matching clean
- Protocol history modals use **inline styles** in `app.js` (~line 860-1010) with theme ternaries for theme-aware colors
- Share captures in `share.js` also have per-theme color maps for `html2canvas` backgrounds
- Persistence: `localStorage.setItem('tezos-systems-theme', themeName)`

### Theme Picker

- Dropdown palette with **color dots** showing each theme's palette at a glance
- **Hover preview** — hovering a theme option temporarily applies it
- **First-visit modal** — "Choose Your Vibe" prompt when no localStorage theme key exists, encouraging new visitors to pick a theme

### Theme-Aware Components

Several components dynamically adapt their colors based on the active theme via runtime detection:

- **Stake-O-Meter Gauge** (`js/ui/gauge.js`): Uses `getThemeColors()` to select arc and text colors per theme. Clean uses blue arc + dark text, dark uses gray arc + light text, matrix uses green, etc.
- **Sparkline Charts** (`js/features/history.js`): Line colors adapt — gray strokes for dark theme, blue/red for clean, green for matrix. Each theme gets appropriate contrast and feel.
- **Network Moments** (`js/features/moments.js`): Toast notifications and timeline section both use per-theme styling — green glow on matrix, pink on bubblegum, achromatic on dark, etc.
- **Streak Badge & Deltas Panel**: Per-theme CSS overrides for colors, borders, and milestone glow animations.

### Adding a New Theme

1. Add name to `THEMES` array in `js/ui/theme.js`
2. Add `THEME_COLORS` entry with `bg`, `accent`, `text` hex values
3. Add `[data-theme="yourtheme"]` CSS variable block in `styles.css` (~line 136)
4. Add override rules at end of `styles.css` for any base styles that leak
5. Add `isYourTheme` branches in `app.js` modal builder and `share.js` capture colors
6. Add theme palette to `getThemeColors()` in `gauge.js` and sparkline color logic in `history.js`
7. Add moment toast/timeline theme overrides in the "Network Moments" CSS section
8. If it has canvas effects, add a class in `bg-effects.js` and register in `BG_THEMES`; if data-focused, add to the CSS rule that hides `#ultra-canvas`
9. Add icon to `updateThemeIcon()` in `theme.js`

## Key Sections

### Protocol Timeline
The horizontal A→T letter grid shows all 21 Tezos self-amendments. Clicking a letter opens a detailed modal with upgrade info. Contentious upgrades (⚔) have debate narratives from `protocol-debates.json`. "View Timeline" button opens the full historical view. Share buttons generate themed screenshot cards.

### Stat Cards
Each metric card has: label, big number (with sparkline trend chart), 7-day change badge, info (ℹ️) tooltip, and per-card share (📸) button.

### Network Moments
Live milestone detection system. When the network crosses a threshold (e.g. staking hits 28%, baker count passes 250, new cycle starts), a themed toast notification slides in with a pre-written share tweet. Dismissed moments are tracked in localStorage. A "Network Moments" timeline section shows the last 30 days of milestones, giving repeat visitors a "what did I miss" reason to return. 88 milestone rules covering staking %, baker count, BLS adoption, funded accounts, cycle changes, and XTZ burned.

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

### Footer
Includes GitHub contribution links (issues and PRs) for community engagement.

## Local Development

```bash
git clone https://github.com/Primate411/tezos.systems.git
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

## SEO & Discoverability

- **robots.txt** — Explicitly allows AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.)
- **sitemap.xml** — Includes theme deep links (`/?theme=matrix`, etc.)
- **JSON-LD** — WebApplication + Dataset structured data in `<head>`
- **Meta tags** — Specific live stats in description, canonical URL, `twitter:site`, `robots` directives (`max-image-preview:large`)
- **Theme-color meta** — Dynamic based on active theme

## Analytics

GoatCounter (privacy-friendly, no cookies): `tezsys.goatcounter.com`

## Known Patterns & Gotchas

- **Inline styles in modals:** Protocol history modals (`app.js` ~line 860-1010) use extensive inline styles with theme-conditional colors. Any new theme MUST add branches here or text will be invisible.
- **Share captures:** `share.js` has `html2canvas()` calls with hardcoded theme color maps. New themes need entries in these maps.
- **Theme-aware components:** Gauge (`gauge.js`) and sparklines (`history.js`) read the active theme at render time. New themes need palette entries in `getThemeColors()` and sparkline color logic or they'll fall back to defaults.
- **CSS specificity wars:** The clean theme uses `!important` heavily because base styles are very specific. This is intentional — the alternative was restructuring 6000 lines of CSS.
- **Canvas effects:** Matrix/void/ember/signal/bubblegum have canvas backgrounds. Clean, dark, and default have none. The `#ultra-canvas` is explicitly hidden via CSS for clean and dark themes.
- **Word-spacing fix:** Mobile WebKit + small rem fonts + `text-rendering: optimizeLegibility` = words joining together. Fixed with `geometricPrecision` + absolute px word-spacing in share captures.

## Credits

- **Data:** [TzKT](https://tzkt.io) and [Tez.Capital](https://tez.capital)
- **Built by:** [Tez Capital](https://tez.capital)

---

Built for the Tezos ecosystem 🫶
