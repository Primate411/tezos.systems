# UI/UX Audit & Implementation Plan — tezos.systems

**Prepared:** 2026-07-12
**Scope:** `index.html`, all 13 standalone Chamber pages, the guide/SEO pages
(`staking/`, `governance/`, `bakers/`, `compare/`), and `widgets/`, `css/*`,
`js/core/*`, `js/features/*`.
**Method:** static code review plus a rendered walkthrough (desktop 1440px
and mobile 390px) of the dashboard, guide pages, several Chamber pages, and
the 404 page via a local server and headless Chromium.
**Status:** analysis only — no application code was changed to produce this
document.

Live TzKT/RPC data was unreachable from the environment this audit ran in,
so several captures show loading/error states rather than populated data.
That is noted inline wherever it affects a specific finding; no conclusion
below rests on how live numbers look, only on layout, copy, and structure.

The throughline across almost every finding: the site already has strong
underlying infrastructure — a canonical destination registry
(`js/core/site-map.js`), a related-links component built on top of it
(`js/ui/wayfinder.js`), real focus-trap logic, a working onboarding tour, and
a well-crafted (if orphaned) landing page. Most of what needs fixing is
*apply the pattern that already exists elsewhere in the codebase*, not
invent a new one.

---

## Phase 0 — Fast, high-leverage fixes

Each item below is scoped to one file or one component, doesn't touch data
flow, and removes a specific point of user confusion. Good candidates for a
single session each.

### 1. A well-built onboarding page exists and reaches nobody

**Priority: P0 · Effort: S**

`landing.html` is a genuinely good first-run page: a one-line pitch, a
"Start anywhere" feature grid grouped by intent (Network Intelligence, Your
Portfolio, Market & Discovery, …), and the theme picker up front. It is the
clearest explanation of what the site does anywhere in the codebase — and no
first-time visitor ever sees it.

**Evidence**
- `landing.html` — 668 lines, referenced once, in `js/core/site-map.js:5`,
  only as an alias path.
- No `<a href>` anywhere in the codebase points to `/landing.html`.
- `sitemap.xml` has no `landing.html` entry.
- `index.html` sends first-time visitors straight into the live dashboard.

**Recommendation**
Route true first-time visitors (no `tezos-welcomed` / `tezos-toured`
localStorage key — the same flags `js/features/tooltip-tour.js` already
checks) to `landing.html` before the dashboard, with a persistent "Skip to
dashboard" escape hatch. Add it to `sitemap.xml` and link it from the footer
regardless. This replaces an eight-step JS spotlight tour running on top of
a live, data-heavy page with a calm page whose only job is orientation.

### 2. House vocabulary has no glossary

**Priority: P0 · Effort: S–M**

"Chambers," "Maxis," "crowns," "lanes," "Passport," "cross-lane," "honest
clocks," and "cycle pulse" appear in the primary nav, the onboarding tour,
and modal titles with no first-encounter definition — only small hint text
after the fact. The `/maxis/` "Who is a Maxi?" panel alone introduces five
unexplained terms in its first two lines.

**Evidence**
- `index.html:347-421` — feature-launcher dropdown uses "Chambers,"
  "crowns," "lanes" with no definition.
- `js/features/tooltip-tour.js:32-49` — tour step text: "recipe console,"
  "lanes seed the command bar."
- `/maxis/` render — "9 stable identities · 6 clocks," "cross-lane," "honest
  clocks" in the opening panel.

**Recommendation**
One reusable glossary affordance — reuse the existing `.info-button` pattern
already in the CSS — attached to each house term on its first appearance per
page. A single `data/glossary.json` (10–15 terms) can back it everywhere
without duplicating copy.

### 3. Guide-page nav collapses into unreadable text at mobile width

**Priority: P0 · Effort: S**

On `staking/`, `governance/`, `bakers/`, the six-item `landing-nav` (Staking
/ Governance / Bakers Directory / Protocol Anthology / Network Health /
Dashboard) has no mobile treatment — it wraps into two lines of small,
tightly-packed links at 390px.

**Evidence**
- Rendered `governance/` at 390px — six nav links wrap to two lines under
  the "TEZOS SYSTEMS" wordmark.
- Searching `index.html` and `styles.css` for
  `hamburger|mobile-menu|mobile-nav|nav-toggle` returns zero matches.

**Recommendation**
Below the existing 768px breakpoint, collapse `landing-nav` into a single
menu button, or keep only "Dashboard" plus a "More" disclosure. Self-contained
CSS plus a few lines of JS, shared by all guide pages.

### 4. Fallback copy can say something meaningless

**Priority: P1 · Effort: S**

When live data can't be reached, some labels and values fall back
independently, producing pairs that don't make sense together — e.g. the
governance guide's **"TIME REMAINING"** label paired with the value **"RSS
ready."** Separately, Chamber pages surface a full-page error modal
("Couldn't reach governance data") the instant a fetch is slow, rather than
scoping the failure to the one widget that failed.

**Evidence**
- Rendered `governance/` — "TIME REMAINING" / "RSS ready" pairing.
- Rendered `chamber/` — modal "Couldn't reach governance data — TzKT API may
  be temporarily unavailable" covers the entire page on load.

**Recommendation**
Pair label and value as one fallback unit, not two independently-chosen
strings. Keep the existing retry/related-links pattern in the error modal
(it's good), but scope it to the failed card instead of gating the whole
page.

---

## Phase 1 — Structural & cross-cutting

These touch more than one file or reshape a pattern used sitewide. Plan them
as their own tickets; each pays down risk that compounds as more pages and
themes are added.

### 5. Three different navigation systems, no shared header

**Priority: P1 · Effort: M**

Every page type invented its own wayfinding: Chamber pages (`chamber/`,
`maxis/`, `pulse/`, `health/`, `tz4/`, `domains/`, `ctez/`, `lb/`,
`tezlink/`, `tezosx/`, `l2chamber/`, `ledger-flow/`, `anthology/`) ship the
full dashboard header, corner tray, and price ticker; guide pages
(`staking/`, `governance/`, `bakers/`) use a light 6-link `landing-nav`;
`compare/` uses a third, bespoke logo-only `.brand` nav with no cross-links
to the guides at all. Only the Chamber template includes a breadcrumb.

**Evidence**
- `chamber/index.html:549` — `<nav aria-label="Breadcrumb"><a
  href="/">Tezos Systems</a> / L1 Governance</nav>`
- `staking/index.html:90-98` — `landing-nav`, 4-6 links, no breadcrumb.
- `compare/index.html:268-274` — `<nav class="brand">`, logo only.

**Recommendation**
`js/core/site-map.js` already models every destination with
id/href/group — it's the right source of truth for one shared header
partial with a consistent breadcrumb, built once and included (even via a
small include-at-build-time script, matching how
`scripts/refresh-generated-surfaces.mjs` already stamps generated shells)
across all three templates.

### 6. A "governance page" is the entire homepage plus a popup

**Priority: P1 · Effort: L**

Visiting `/chamber/` and `/maxis/` confirms it directly: both render the
identical Network Pulse, Staking Chamber, Network Health, Tezos X, TZ4, LB
Monitor, Ledger Flow, Protocol Anthology, Maxis, Domains, "Start from
anything," and full sitemap footer sections beneath their own topic modal. A
dedicated governance URL doesn't read as a focused governance page — it
reads as the dashboard with a dialog open on top of it. Thirteen pages carry
this same ~170KB body, roughly 2MB of duplicated markup across the site.

**Evidence**
- Rendered `chamber/` and `maxis/` — identical card sequence below each
  page's own modal.
- `chamber/index.html` = 170,230 bytes; 11 other Chamber pages land within
  170,132–170,527 bytes of each other.

**Recommendation**
Scope each Chamber page's own content to its topic; replace the duplicated
dashboard body with the existing `js/ui/wayfinder.js` related-links
component, which already generates contextual "next steps" from the site
map — it's built for exactly this and is currently underused relative to
how much markup it could replace.

### 7. Fifteen-plus near-duplicate breakpoints, no shared scale

**Priority: P1 · Effort: M, ongoing**

`css/styles.css` alone carries 103 `@media` rules across values like 420,
480, 520, 560, 600, 640, 680, 720, 760, *and* 768, 900 *and* 980, 1024,
1180, 1299, 1400. Feature stylesheets (`maxis.css`, `hen-mode.css`,
`network-health.css`, `tezos-domains.css`) each define their own independent
breakpoints again, unaligned with that scale — a sign these were authored in
isolation from each other. There's a real token system for color already
(651 custom properties) but nothing equivalent for breakpoints or spacing.

**Evidence**
- `css/styles.css` — 103 `@media` rules; 768px used 20×, 760px used 3×,
  640px used 10×, 600px used 11×.
- `maxis.css` (10 queries), `tezos-domains.css` (6), `network-pulse.css`
  (5), `hen-mode.css` (5) — none aligned to `styles.css`'s set.

**Recommendation**
Adopt 3–4 named breakpoints (e.g. `--bp-sm: 480px; --bp-md: 768px; --bp-lg:
1024px;`) and migrate feature CSS to them opportunistically whenever those
files are next touched, rather than as one large rewrite.

### 8. Modal accessibility wiring is JS-dependent and inconsistent

**Priority: P1 · Effort: M**

Most `.modal-overlay` elements ship only `aria-hidden="true"` in the static
HTML, gaining `role="dialog"`/`aria-modal` only once JS runs — a
flash-of-unlabeled-dialog risk if a script is slow or blocked. There's no
skip-to-content link anywhere. Real focus-trap logic exists
(`js/ui/chamber-accessibility.js`) and `#my-tezos-drawer` already ships
correct static ARIA — the gap is that this correct pattern isn't applied
everywhere.

**Evidence**
- `index.html:1767-1973` — `#comparison-modal`, `#chambers-modal`,
  `#consensus-modal`, `#governance-modal`: `aria-hidden` only in static
  markup.
- `index.html:2205` — `#my-tezos-drawer` ships `role="dialog"
  aria-modal="true"` statically (the correct reference pattern).
- `:focus-visible` covers ~20 selectors in `styles.css` against hundreds of
  interactive elements; zero "skip-link"/"skip to" matches sitewide.

**Recommendation**
Bake `role="dialog" aria-modal="true"` into every modal's static markup
(copy the drawer's pattern), add one skip link before the header, and extend
the existing `:focus-visible` rules from a hand-picked list to a shared
selector covering all button/link/input classes.

---

## Phase 2 — Larger initiatives

Bigger bets: worth planning deliberately, likely multi-week, and best
scheduled once the Phase 0/1 groundwork (shared header, breakpoint tokens)
is in place to build on.

### 9. HEN mode reads as a power-user console, not a browsing surface

**Priority: P2 · Effort: M**

The HEN toolbar packs `ALL/TEIA/OBJKT`, `FOR SALE`, `≤1 ≤5 ≤25 ANY`, `1/1
≤10 ANY`, `NEWEST/CHEAP`, `CONNECT`, and a paste field into one dense row
with abbreviation-only labels — it's unclear what unit "≤1" refers to
without prior context — plus a terminal-style command hint bar ("> search,
price, sort, saved, random") at the bottom.

**Evidence**
- Rendered `/hen/` at 1440px — single-row toolbar, ~14 controls, no
  grouping or unit labels.

**Recommendation**
Group controls under labeled clusters (Source · Price · Edition · Sort),
spell out units on first load, and keep the terminal aesthetic for the feed
itself rather than the controls that operate it.

### 10. The command center exposes everything at once, flat

**Priority: P2 · Effort: M–L**

The header "Explore" dropdown surfaces 30+ tools in one scroll — the site's
own structured data lists 32 distinct features. `site-map.js` already
carries `starter` and `searchChip` fields marking a handful of destinations
as entry points, and `js/ui/wayfinder.js`'s doc comment already states the
intended principle ("keep exhaustive directories behind an explicit
disclosure") — but the dropdown itself doesn't apply it; every section is
expanded by default.

**Evidence**
- `index.html:339-421` — feature-launcher dropdown, 5+ fully-expanded groups
  visible on open.
- `index.html:~95-125` — JSON-LD `featureList`, 32 entries.
- `js/core/site-map.js` — `starter` field exists on only 3 of dozens of
  entries.

**Recommendation**
Use the existing `starter`/`searchChip` data to visually promote 3–5 entry
points by default, and collapse the remaining groups behind disclosure —
applying a principle the codebase has already written down but not yet
built.

### 11. One 23,000-line stylesheet carries all 14 themes

**Priority: P2 · Effort: L, planning**

`css/styles.css` is 23,261 lines with 651 custom properties; three more
feature stylesheets each run 2,000+ lines. This is manageable today, but
every additional theme multiplies the surface a change has to be checked
against — `AGENTS.md` itself already flags that several modules
(`gauge.js`, `history.js`, `share.js`) fall back ungracefully for newer
themes like `nerv`, `abyss`, `moss`, `warzone`.

**Evidence**
- `css/styles.css`: 23,261 lines / 651 custom properties.
- `css/maxis.css`: 2,491 lines · `css/hero-search.css`: 2,589 lines ·
  `css/hen-mode.css`: 2,288 lines.
- `AGENTS.md`: "Some theme-aware modules do not fully cover newer themes."

**Recommendation**
Before adding a 15th theme, audit which of the 651 tokens are genuinely
shared structure versus theme-specific paint, and require any new theme to
prove coverage in the four flagged modules rather than shipping partial
support.

---

## What's already working

Worth protecting while the above lands — none of this should be disrupted
in the process.

- **The 404 page has real personality** — "This block was never baked,"
  with a clear way back and contextual next-step cards, not a dead end.
- **Skeleton loading states are used consistently** — 48 uses of
  shimmer-style loaders in `index.html` mean content rarely just goes blank
  while JS runs.
- **Real focus-trap and Escape-to-close logic exists**
  (`js/ui/chamber-accessibility.js`), and `prefers-reduced-motion` is
  respected in 29 places across the CSS.
- **The guide pages are genuinely good** — `staking/`, `governance/`,
  `bakers/`, and `compare/` are focused, well-written, and scannable;
  they're the model the Chamber pages should be pulled toward, not the
  other way around.
- **The site-map / wayfinder data layer is the right foundation** — a
  single canonical destination registry already exists; most of Phase 1 is
  "use it everywhere," not "build it."
- **Deep-link hash routing is thorough** — direct links to any Chamber,
  tool, or theme already work, which most dashboards this dense don't
  bother with.

---

## Suggested sequencing

Ordered so each step either ships independently or lays groundwork the next
step needs.

| When | Work | Why this order |
| --- | --- | --- |
| Week 1 | Fallback copy pass; mobile guide-nav collapse | Isolated, no dependencies, immediate visible improvement |
| Week 1–2 | Glossary component + first-visit landing route | Reuses existing localStorage flags and CSS; highest first-impression impact |
| Week 2–3 | Breakpoint tokens; static ARIA on all modals + skip link | Foundational — makes every later CSS/markup change safer |
| Week 3–5 | Shared header/nav partial with breadcrumb | Depends on breakpoint tokens; unifies the three nav systems |
| Week 5–8 | Scope Chamber pages to their own content via wayfinder | Depends on the shared header existing first |
| Ongoing | Command-center disclosure; HEN control grouping; theme-token audit | Independent, schedule as capacity allows |
