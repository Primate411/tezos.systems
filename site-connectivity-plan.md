# Site Connectivity & Circular-Navigation Plan

Goal: every site property reachable from every other in ≤2 hops, no dead ends,
and a search field that is aware of the **entire** map. This document is both the
evaluation of the current state and a step-by-step runbook for an implementing
agent.

---

## Part 1 — Current map (evaluation)

### 1.1 Property inventory (27 public URLs in `sitemap.xml`)

| Group | Properties | Nature |
|---|---|---|
| **Hub** | `/` | Full SPA dashboard (`index.html`) |
| **Chamber routes** | `/chamber/` `/health/` `/tezosx/` `/l2chamber/` `/tz4/` `/lb/` `/ledger-flow/` `/domains/` `/ctez/` + `/tezlink/` (noindex alias of tezosx) | Full SPA clones generated from `index.html` by `scripts/generate-chamber-routes.mjs`; each carries a `data-chamber-route` attribute and auto-opens its section. Inherit hub nav + search. |
| **SEO landing** | `/staking/` `/governance/` `/bakers/` | Hand-written SEO pages. No hero search, no Explore menu. |
| **Compare** | `/compare/` + `/compare/tezos-vs-{ethereum,solana,cardano,algorand}.html` | Hand-written SEO pages. |
| **HEN** | `/hen/` | Hand-written SEO splash. |
| **First-visit** | `landing.html` | First-visit splash (theme.js redirect target). |
| **Error** | `404.html` | |
| **Widgets** | `/widgets/builder.html` + 9 embeds | Standalone embeds. |

### 1.2 Connectivity graph

```
        ┌───────────────────────────────────────────────┐
        │  CLUSTER A — SPA (hub + 10 chamber clones)      │
        │  • hero search (chambers, commands, protocols,  │
        │    bakers, entities, themes)                    │
        │  • Explore launcher (index.html:302–430)        │
        │  • footer chamber rail, 9 links (index:1918–32) │
        │  FULLY circular, no dead ends ✔                 │
        └───────────────┬───────────────────────────────┘
                        │  (only OUTBOUND edges:)
                        │  → /widgets/builder.html, → /?hen=1
                        │
        NO edges from the hub to ↓ the SEO pages
        ───────────────────────────────────────────────
   one-way (SEO → hub) edges only:
        /staking/  ─┐
        /bakers/   ─┼─ interlink each other + → / , /#calculator, /#leaderboard
        /governance/┘  + /governance/ → /chamber/  (the ONE bridge into Cluster A)

        /compare/ ──── interlinks 4 vs-pages + → / , /#calculator   (island)
        /hen/ ──────── → /?hen=1 ONLY                               (near dead-end)
        landing.html ─ → / , /?hen=1 , 4 compare vs-pages           (shallow fan-out)
        404.html ───── → / ONLY
        widgets/* ──── → / (UTM attribution)                        (acceptable, embeds)
```

### 1.3 Findings (prioritized)

1. **The hub never links out to the SEO pages.** `/`, and therefore all 10
   chamber clones, contain **zero** links to `/staking/`, `/governance/`,
   `/bakers/`, `/compare/`, or `/hen/`. They are reachable only from Google and
   the sitemap. Every SEO→hub edge is one-way: visitors arrive from search,
   click into the hub, and can never get back to the page they landed on.
   *(Verified: `grep 'href="/(staking|governance|bakers|compare|hen)"' index.html` → empty.)*

2. **Search is unaware of the standalone pages.** `js/features/search.js`
   indexes SPA hash sections (`#health`, `#chamber`, …), commands, protocols,
   bakers, and entities — but not `/staking/`, `/governance/`, `/bakers/`,
   `/compare/` (the SEO breakdowns), `/hen/`, or `/widgets/builder.html` as
   destinations. The user's explicit requirement ("search aware of the entire
   map") is unmet.

3. **`/hen/` is a near dead-end** — it only links to `/?hen=1`. (The in-SPA HEN
   mode *does* have an exit: `js/features/hen-mode.js` `deactivate()` /
   `exit` command. The defect is the `/hen/` landing page itself.)

4. **`/compare/` is an island disconnected from the SEO triad,** and the in-SPA
   "Compare Chains" feature (`#compare`) never points users to the richer
   `/compare/tezos-vs-*.html` breakdowns (and vice versa).

5. **`landing.html` and `404.html` fan out too shallowly** — landing skips the
   SEO triad, `/compare/` index, and chambers; 404 offers only `/`.

6. **The map is duplicated in 5+ places that drift:**
   `scripts/lib/chamber-routes.mjs` (build), `js/features/search.js`
   (`CHAMBERS`/`COMMANDS`), `index.html` (footer rail **and** Explore launcher),
   `sitemap.xml`, and each hand-written SEO page's nav. There is **no runtime
   single source of truth.** This is the root cause that makes findings 1–5
   recur whenever a property is added.

### 1.4 What already works (do not regress)

- Cluster A is exemplary: search → hashes, Explore launcher, footer rail, copy-link
  buttons on every feature, HEN launcher/exit. Keep this circular model.
- Chamber clones correctly share the hub shell, so fixing the hub fixes all 10.
- Widget embeds linking home with UTM is correct for embeds.

---

## Part 2 — Target model

**Principle: one manifest, consumed everywhere.** Introduce a single runtime
site-map module that every navigation surface reads from. Then connectivity is a
property of the data, not of N hand-maintained lists.

- **≤2-hop reachability:** every property links to a shared "Explore the rest of
  tezos.systems" rail (or the search knows it), so any property → hub → any other.
- **Bidirectional edges:** if A links to B for a reason, B links back to A.
- **Search = the map:** search results include every standalone property.

---

## Part 3 — Step-by-step agent tutorial

> Conventions for this repo (from `AGENTS.md`): edit `css/styles.css` then
> rebuild `css/styles.min.css`; bump the `sw.js` cache name + asset `?v=` query
> params after JS/CSS changes; run `npm run refresh:governance` is **not** needed
> here; update `js/features/changelog.js`; keep `README.md` in sync (guarded).
> Local dev: `python3 -m http.server 9000`. Verify in a real browser.

### Step 0 — Branch & baseline
1. `git checkout -b site-connectivity` (do not work on `main`).
2. `python3 -m http.server 9000` and confirm the dashboard, one chamber
   (`/health/`), and one SEO page (`/staking/`) all load clean.

### Step 1 — Create the single source of truth
Create `js/core/site-map.js` exporting one ordered array describing **every**
navigable property. This becomes the map that search, footer, launcher, and SEO
rails all read.

```js
// js/core/site-map.js
// The canonical list of navigable tezos.systems properties.
// `nav: 'hash'` resolves inside the SPA; `nav: 'url'` is a standalone page.
export const SITE_MAP = [
  // --- In-SPA rooms (hash) ---
  { id: 'health',       group: 'Chambers',  title: 'Network Health',       nav: 'hash', target: '#health',          page: '/health/',     blurb: 'Blocks, Octez versions, missed rights, consensus lens', aliases: ['network','blocks'] },
  { id: 'chamber',      group: 'Chambers',  title: 'Tezos L1 Governance',  nav: 'hash', target: '#chamber',         page: '/chamber/',    blurb: 'Live vote room and protocol governance history', aliases: ['governance','vote'] },
  { id: 'tezosx',       group: 'Chambers',  title: 'Tezos X',              nav: 'hash', target: '#tezosx',          page: '/tezosx/',     blurb: 'Etherlink TVL, L2 tape, gas oracle, tokens', aliases: ['etherlink','l2'] },
  { id: 'l2chamber',    group: 'Chambers',  title: 'Tezos X Governance',   nav: 'hash', target: '#l2chamber',       page: '/l2chamber/',  blurb: 'FAST/SLOW sequencer governance tracks', aliases: ['etherlink governance'] },
  { id: 'tz4',          group: 'Chambers',  title: 'tz4 Adoption',         nav: 'hash', target: '#tz4',             page: '/tz4/',        blurb: 'BLS adoption, pending switches, milestones', aliases: ['bls'] },
  { id: 'lb',           group: 'Chambers',  title: 'Liquidity Baking',     nav: 'hash', target: '#lb',              page: '/lb/',         blurb: 'LB votes, EMA threshold, liquidity signals' },
  { id: 'ledger-flow',  group: 'Chambers',  title: 'Ledger Flow',          nav: 'hash', target: '#ledger-flow',     page: '/ledger-flow/',blurb: 'Sent, received, first-funding account graph', aliases: ['flow','transfer graph'] },
  { id: 'domains',      group: 'Chambers',  title: 'Tezos Domains',        nav: 'hash', target: '#domains',         page: '/domains/',    blurb: '.tez lookup, registrations, auctions, expiry', aliases: ['.tez','names'] },
  { id: 'ctez',         group: 'Chambers',  title: 'ctez End of Life',     nav: 'hash', target: '#ctez',            page: '/ctez/',       blurb: 'Oven discovery and wallet-reviewed close flow', aliases: ['oven'] },
  { id: 'protocol-history', group: 'Story', title: 'Protocol Anthology',   nav: 'hash', target: '#protocol-history',                      blurb: 'Self-amendment lore and impact views', aliases: ['lore','upgrades'] },
  // --- Guides / SEO landing pages (url) — the previously-orphaned set ---
  { id: 'staking',      group: 'Guides',    title: 'Staking Guide',        nav: 'url',  target: '/staking/',        blurb: 'How XTZ staking, delegation, and rewards work', aliases: ['stake','delegate','rewards'] },
  { id: 'bakers',       group: 'Guides',    title: 'Bakers Guide',         nav: 'url',  target: '/bakers/',         blurb: 'What bakers are and how to choose one', aliases: ['validators','baking'] },
  { id: 'governance-guide', group: 'Guides',title: 'Governance Guide',     nav: 'url',  target: '/governance/',     blurb: 'How on-chain self-amendment works', aliases: ['voting','amendment'] },
  { id: 'compare',      group: 'Guides',    title: 'Compare Chains',       nav: 'url',  target: '/compare/',        blurb: 'Tezos vs Ethereum, Solana, Cardano, Algorand', aliases: ['versus','vs'] },
  { id: 'hen',          group: 'Culture',   title: 'HEN / NFTs',           nav: 'url',  target: '/?hen=1',          blurb: 'Live NFTs and collector profile mode', aliases: ['objkt','nft','teia'] },
  { id: 'widget-builder', group: 'Utility', title: 'Embed Builder',        nav: 'url',  target: '/widgets/builder.html', blurb: 'Configured live-stat iframes for your site', aliases: ['widgets','embed'] },
];
```
> Keep `scripts/lib/chamber-routes.mjs` as the build-time generator, but have it
> import the chamber subset from a shared list if you want full de-duplication
> (optional; minimum viable change is just adding `site-map.js`).

### Step 2 — Make search aware of the entire map (Finding 2)
In `js/features/search.js`:
1. `import { SITE_MAP } from '../core/site-map.js';`
2. Replace the hard-coded `CHAMBERS` array (lines ~44–55) with entries derived
   from `SITE_MAP` (filter to the chamber + guide + culture + utility groups).
3. Add a result builder for `nav: 'url'` rows that emits
   `action: 'external'` → handled by `runResult` (lines ~604–607, already opens
   `result.value`). For same-origin pages prefer a normal navigation:
   `window.location.assign(target)` instead of `window.open`, so guides open in
   place. Add a small `action: 'page'` branch to `runResult` for this.
4. Add the guides to `QUICK_CHIPS` (lines ~19–28): e.g. `/staking`, `/compare`.
5. Add aliases so "stake", "delegate", "vs ethereum", "nft", "embed" resolve.

Verify: type `staking`, `compare`, `nft`, `embed` in the hero search and confirm
each standalone page appears and navigates correctly.

### Step 3 — Hub → SEO outbound links (Finding 1)
In `index.html`, the footer (lines ~1900–1936) already has a chamber rail. Add a
sibling **"Guides"** rail immediately after the chamber rail, generated from the
`Guides`/`Culture` groups (hand-write for now; it's static HTML):

```html
<nav class="footer-link-rail footer-guides-rail" aria-label="Guides and explainers">
  <span class="footer-rail-label">Guides</span>
  <a class="footer-link" href="/staking/">Staking</a>
  <a class="footer-link" href="/bakers/">Bakers</a>
  <a class="footer-link" href="/governance/">Governance</a>
  <a class="footer-link" href="/compare/">Compare Chains</a>
  <a class="footer-link" href="/hen/">HEN / NFTs</a>
</nav>
```
Because the 10 chamber clones are generated from `index.html`, this single edit
gives **all 11 SPA pages** outbound links to the SEO set. Re-run
`node scripts/generate-chamber-routes.mjs` afterward (Step 7).

Optionally add a "Guides" group to the Explore launcher (`index.html:302–430`)
mirroring the existing groups, each row an `<a>` to the SEO page.

### Step 4 — Cross-link the SEO pages (Findings 3, 4)
Add one shared markup block — a "More on tezos.systems" rail — to the bottom of
each hand-written SEO page so the islands join the graph. Edit:
`staking/index.html`, `governance/index.html`, `bakers/index.html`,
`compare/index.html`, `compare/tezos-vs-*.html`, `hen/index.html`.

The rail should link to: the **hub** (`/`), the **other guides**, and the **2–3
most relevant chambers** (e.g. staking → `/health/` + `/chamber/`; compare →
`/health/`; governance → `/chamber/`, `/l2chamber/`). Specifically:
- **`hen/index.html`**: add links to `/`, the guides, and chambers — this removes
  the dead-end (Finding 3).
- **`compare/` ↔ guides**: add the guides rail to `/compare/` and add a "See full
  Tezos vs X breakdowns → /compare/" link inside the in-SPA `#compare` feature
  (find the comparison panel in `index.html` / `js/features/comparison.js`).

> Tip: write the rail once in a comment-delimited block and paste identically so a
> future agent can grep-replace all copies. Long-term, generate these pages from a
> template that injects the rail from `site-map.js` (see Step 8).

### Step 5 — Enrich landing.html & 404.html (Finding 5)
- `landing.html`: extend its link set (currently `/`, `/?hen=1`, 4 vs-pages) to
  include the guides triad, `/compare/`, and 2–3 chambers.
- `404.html`: below the existing `/` link, add a compact list of top destinations
  (Chambers, Staking, Governance, Compare) and, if cheap, mount the hero search.
  At minimum, link the guides + chambers so a 404 is never a dead-end.

### Step 6 — Keep the manifest authoritative
- Update `sitemap.xml` only via the manifest order (manual is fine now; consider a
  `scripts/generate-sitemap.mjs` reading `site-map.js` later).
- Add a static check in `tests/static-checks.mjs`: assert every `nav:'url'` target
  in `site-map.js` (a) exists as a file and (b) is linked from the footer rail in
  `index.html`. This prevents Finding 1 from recurring.

### Step 7 — Rebuild generated artifacts
1. `node scripts/generate-chamber-routes.mjs` (propagates the new footer rail to
   all 10 chamber clones).
2. Rebuild CSS if you added rail styles: edit `css/styles.css`, then
   `node scripts/build-css.mjs` (regenerates `css/styles.min.css`).
3. Bump cache: increment the `sw.js` cache name (`tezos-systems-v###`) and the
   `?v=` query params on changed assets (`styles.min.css`, `app.js`, `search.js`,
   `hero-search.css`). Add `js/core/site-map.js` to any modulepreload list.

### Step 8 — (Optional, recommended) collapse duplication
Generate the SEO-page "More on tezos.systems" rails and `sitemap.xml` from
`site-map.js` so the map lives in exactly one place. This is the durable fix for
Finding 6; everything above becomes data-driven.

### Step 9 — Verify (browser, real)
Run the path matrix — confirm **no dead ends**:
- From `/`: footer Guides rail → each SEO page → back to `/` and to a chamber. ✔
- From `/health/` (a clone): same footer rail present. ✔
- Hero search: `staking`, `compare`, `nft`, `embed`, `governance` each return and
  open the right destination. ✔
- `/hen/`: links onward to hub + chambers (no longer one-door). ✔
- `/compare/tezos-vs-ethereum.html` → `/compare/` → a guide → hub. ✔
- `404.html`: offers search + top destinations. ✔
- Regression: Cluster A still circular; CSP has no new violations; chamber clones
  unchanged except the new rail.

### Step 10 — Changelog, README, ship
- Add a `js/features/changelog.js` entry (`✨` for the new Guides rail + search
  coverage, `🔧` for the hen dead-end fix).
- Sync `README.md` if it documents nav/search contracts (guard will flag it).
- Commit on the branch; open a PR. Do not push to `main` without the user asking.

---

## Appendix — exact anchor points verified

- Footer rails: `index.html:1908–1936`
- Explore launcher: `index.html:302–430`
- Search index arrays: `js/features/search.js` — `QUICK_CHIPS:19`, `COMMANDS:30`,
  `CHAMBERS:44`, `EMPTY_STATE_ROWS:57`, `buildResults:506`, `runResult:602`
- Chamber generator: `scripts/generate-chamber-routes.mjs`,
  `scripts/lib/chamber-routes.mjs`
- HEN exit (already exists, in-SPA): `js/features/hen-mode.js` `deactivate()` ~1954
- SEO pages: `{staking,governance,bakers,compare,hen}/index.html`,
  `compare/tezos-vs-*.html`
- First-visit / error: `landing.html`, `404.html`
- Public URL set: `sitemap.xml` (27 `<loc>` entries)
