#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { CHAMBER_ROUTES } from './lib/chamber-routes.mjs';
import playwrightBrowser from './lib/playwright-browser.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'og');
const { launchChromium } = playwrightBrowser;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatUtc(iso) {
  if (!iso) return 'Closing date unavailable';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Closing date unavailable';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  }) + ' UTC';
}

async function readGovernanceReport() {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'governance-refresh-report.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function routeDetails(route, report) {
  const gov = report?.currentGovernance || {};
  const kind = gov.kind ? `${gov.kind[0].toUpperCase()}${gov.kind.slice(1)}` : 'Governance';
  const end = formatUtc(gov.endTime);
  const participation = Number.isFinite(gov.tally?.participationPct)
    ? `${gov.tally.participationPct.toFixed(1)}% participation`
    : 'participation unavailable';
  const yay = Number.isFinite(gov.tally?.yayPct)
    ? `${gov.tally.yayPct.toFixed(1)}% yay`
    : 'yay unavailable';

  const bySlug = {
    chambers: {
      badge: 'Topic Directory',
      kicker: 'Tezos rooms by topic',
      value: 'Find your next room',
      chips: ['network + ecosystem', 'people + governance', 'accounts + history'],
      body: route.description
    },
    anthology: {
      badge: 'Protocol Archive',
      kicker: 'Protocol lore + upgrade debates',
      value: 'Self-amendment, recorded',
      chips: ['protocol history', 'upgrade debates', 'impact views'],
      body: route.description
    },
    my: {
      kicker: 'Personal Tezos',
      value: 'Your wallet at the center',
      chips: ['rewards + roles', 'baker health', 'account journeys'],
      body: 'Open one personal Tezos room for wallet identity, current rewards, baker and operator signals, activity, and related account paths.'
    },
    pulse: {
      kicker: 'Network Pulse',
      value: 'Live stats field',
      chips: ['consensus', 'economy', 'activity'],
      body: 'Scan Tezos bakers, staking, governance, transactions, contracts, supply, and adjacent chambers in one live operations room.'
    },
    capital: {
      kicker: 'Public-Source Capital',
      value: 'One system. Four lenses.',
      chips: ['Tezos + Etherlink', 'markets + RWA', 'art economy'],
      body: 'Read cross-layer capital, XTZ market structure, ecosystem assets, real-world proofbooks, and Tezos art activity with visible source and coverage boundaries.'
    },
    minerals: {
      kicker: 'Critical Minerals Intelligence',
      value: '60 materials. Native clocks.',
      chips: ['2025 federal list', '10 Pink Sheet products', 'xCo + xNi + RARE'],
      body: 'Explore form-specific supply and market receipts beside bounded Etherlink token state, with raw qualifiers, grouped context, issuer claims, and unavailable evidence kept distinct.'
    },
    uranium: {
      kicker: 'xU3O8 Market Intelligence',
      value: 'Token tape. Physical receipts.',
      chips: ['Kraken USD tape', 'Etherlink token state', 'dated reserve evidence'],
      body: 'Follow xU3O8 prices, depth, and token state beside separately dated Cameco reserve evidence, custody terms, and derived physical-uranium ratios without mistaking one layer for the other.'
    },
    metals: {
      kicker: 'Precious Metals Intelligence',
      value: 'Eight metals. Honest clocks.',
      chips: ['gold + silver', 'six platinum-group metals', 'VNXAU chain receipts'],
      body: 'Compare the canonical eight-metal assay, source-separated public market observations where available, and a receipt-bounded VNXAU lane across Tezos and Etherlink without treating chain activity as proof of backing.'
    },
    ecosystem: {
      kicker: 'Dapp Intelligence',
      value: 'Weekly activity, through history',
      chips: ['Tezos L1 + Etherlink', 'active wallets + YoY', 'contract receipts'],
      body: 'Rank reviewed apps by last-completed-week active wallet addresses, separate the partial current week, and trace every published weekly aggregate to its disclosed contract universe.'
    },
    history: {
      kicker: 'Measured History',
      value: '15 captured signals',
      chips: ['24H to all retained', 'five source ledgers', 'no invented gaps'],
      body: 'Rewind consensus, staking, issuance, market, Network Health, Tezos X, and governance signals with honest range and freshness context.'
    },
    whales: {
      kicker: 'Large Value Movement',
      value: 'Receipts beneath the surface',
      chips: ['complete 24H transfers', 'grouped flow stories', 'deep sleep + awakenings'],
      body: 'Read large tez operations, related operation-group hops, large dormant accounts, and verified post-dormancy movement without inferred ownership claims.'
    },
    stake: {
      kicker: 'Staking Flow',
      value: 'Stake + unstake tape',
      chips: ['>10K XTZ moves', 'staking ratio', 'complete history'],
      body: 'Track the latest large Tezos stake and unstake operations, current network staking share, and every historical move above the same threshold.'
    },
    leaderboard: {
      kicker: 'Baker Discovery',
      value: 'Every funded active baker',
      chips: ['capacity + tenure', 'governance receipts', 'no synthetic grades'],
      body: 'Search and compare the complete active baker set through transparent on-chain facts, then inspect the source-backed signals behind each match.'
    },
    maxis: {
      kicker: 'On-Chain Crowns',
      value: 'Spot. Race. Become.',
      chips: ['Lane-native clocks', 'Protocol seasons', 'Career Passports'],
      body: 'Spot the enduring Tezos Maxis on honest all-time, live, and rolling clocks, then race across activation-bounded seasons without letting the game erase the record.'
    },
    tezoscrp: {
      kicker: 'Tezos Commons · Community Rewards',
      value: 'Recognition Hall',
      chips: ['Monthly awards', 'Human identities', 'Official receipts'],
      body: 'Browse every officially published TezosCRP category recognition since October 2020, with human identities, category history, and source receipts kept separate from wallet-based Maxis.'
    },
    chamber: {
      kicker: gov.proposalName ? `${gov.proposalName} ${kind}` : `${kind} period`,
      value: end,
      chips: [participation, yay, 'quorum + ballots'],
      body: 'Live Tezos governance intelligence for vote closing, quorum risk, supermajority, and baker behavior.'
    },
    health: {
      kicker: 'Consensus Health',
      value: 'Blocks + attestations',
      chips: ['recent rounds', 'missed rights', 'operator signals'],
      body: 'A live room for chain cadence, attestation power, missed baking rights, and network load.'
    },
    tezosx: {
      kicker: 'Etherlink Activity',
      value: 'L2 direction',
      chips: ['TVL trend', 'L1 anchors', 'gas + token rows'],
      body: 'Track Etherlink activity through rollup anchors, gas oracle state, TVL direction, and token concentration.'
    },
    l2chamber: {
      kicker: 'Etherlink Governance',
      value: 'Track memory',
      chips: ['proposal tracks', 'contract discovery', 'rules + timeline'],
      body: 'Follow Etherlink governance contract discovery, track rules, proposal windows, and quiet-state context.'
    },
    tz4: {
      kicker: 'BLS Consensus Keys',
      value: 'tz4 adoption',
      chips: ['active bakers', 'pending queue', 'power milestones'],
      body: 'Watch the Tezos baker migration to tz4/BLS consensus keys with momentum and holdout context.'
    },
    lb: {
      kicker: 'Liquidity Baking',
      value: 'OFF-vote EMA',
      chips: ['50% threshold', 'baker votes', 'subsidy state'],
      body: 'Monitor Tezos Liquidity Baking vote flow, EMA drift, history strip, and subsidy re-enable or disable risk.'
    },
    'ledger-flow': {
      kicker: 'Account Flows',
      value: 'Sent + received paths',
      chips: ['first funding', 'amount-weighted edges', 'counterparty map'],
      body: 'Map Tezos account transfers with separate sent and received colors, first-funding highlights, and bolder paths for larger movements.'
    },
    domains: {
      kicker: '.tez Identity',
      value: 'Names moving now',
      chips: ['registrations', 'expiring names', 'auctions + offers'],
      body: 'Follow fresh Tezos Domains registrations, renewals, identity records, expiring names, auctions, and marketplace offers in one live chamber.'
    },
    ctez: {
      kicker: 'ctez Oven Guide',
      value: 'Better Call Dev',
      chips: ['oven id', 'burn ctez', 'withdraw mutez'],
      body: 'A unit-safe guide for finding old ctez ovens, burning outstanding ctez, and withdrawing tez through verified contract pages.'
    }
  };

  return bySlug[route.canonicalSlug || route.slug] || {
    kicker: route.eyebrow,
    value: 'Explore this room',
    chips: [],
    body: route.description
  };
}

export function renderCard(route, report) {
  const details = routeDetails(route, report);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    width: 1200px;
    height: 630px;
    overflow: hidden;
    background:
      radial-gradient(circle at 20% 15%, ${route.accent}33 0, transparent 32%),
      radial-gradient(circle at 88% 22%, ${route.secondaryAccent || '#7c3aed'}2e 0, transparent 28%),
      linear-gradient(135deg, #06111f 0%, #070b1a 48%, #12091d 100%);
    color: #eaf0ff;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 54px 62px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .frame::before {
    content: "";
    position: absolute;
    inset: 24px;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 28px;
    box-shadow: inset 0 0 70px rgba(255,255,255,.04);
  }
  .top, .body, .foot { position: relative; z-index: 1; }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand {
    font-size: 24px;
    letter-spacing: .18em;
    text-transform: uppercase;
    color: rgba(234,240,255,.72);
    font-weight: 800;
  }
  .live {
    border: 1px solid ${route.accent}88;
    color: ${route.accent};
    border-radius: 999px;
    padding: 10px 18px;
    text-transform: uppercase;
    letter-spacing: .12em;
    font-weight: 800;
    font-size: 17px;
    background: rgba(0,0,0,.18);
  }
  .eyebrow {
    color: ${route.accent};
    text-transform: uppercase;
    letter-spacing: .18em;
    font-weight: 900;
    font-size: 22px;
    margin-bottom: 16px;
  }
  h1 {
    margin: 0;
    max-width: 940px;
    font-size: 75px;
    line-height: .95;
    letter-spacing: 0;
    font-weight: 900;
  }
  .value {
    margin-top: 22px;
    color: #ffffff;
    font-size: 34px;
    font-weight: 800;
  }
  .body p {
    margin: 22px 0 0;
    max-width: 890px;
    color: rgba(234,240,255,.74);
    font-size: 25px;
    line-height: 1.32;
  }
  .chips {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    margin-top: 28px;
  }
  .chip {
    padding: 11px 16px;
    border-radius: 12px;
    background: rgba(255,255,255,.08);
    border: 1px solid rgba(255,255,255,.13);
    color: rgba(234,240,255,.9);
    font-size: 21px;
    font-weight: 700;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: end;
    color: rgba(234,240,255,.55);
    font-size: 22px;
  }
  .url {
    color: ${route.accent};
    font-weight: 900;
  }
</style>
</head>
<body>
  <div class="frame">
    <div class="top">
      <div class="brand">Tezos Systems</div>
      <div class="live">${escapeHtml(details.badge || 'Live Room')}</div>
    </div>
    <div class="body">
      <div class="eyebrow">${escapeHtml(route.eyebrow)}</div>
      <h1>${escapeHtml(route.shortTitle)}</h1>
      <div class="value">${escapeHtml(details.value)}</div>
      <p>${escapeHtml(details.body)}</p>
      <div class="chips">${details.chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join('')}</div>
    </div>
    <div class="foot">
      <div>${escapeHtml(details.kicker)}</div>
      <div class="url">tezos.systems/${route.slug}/</div>
    </div>
  </div>
</body>
</html>`;
}

async function optimizePng(file) {
  const before = (await fs.stat(file)).size;
  const optimized = await sharp(file)
    .png({
      adaptiveFiltering: true,
      compressionLevel: 9,
      effort: 10,
      palette: true,
      quality: 92
    })
    .toBuffer();
  if (optimized.length < before) {
    await fs.writeFile(file, optimized);
  }
  return { before, after: Math.min(before, optimized.length) };
}

function selectedRoutes() {
  const inline = process.argv.find((arg) => arg.startsWith('--only='));
  const flagIndex = process.argv.indexOf('--only');
  if (!inline && flagIndex < 0) return CHAMBER_ROUTES;

  const raw = inline?.slice('--only='.length)
    || (flagIndex >= 0 ? process.argv[flagIndex + 1] : '');
  if (!raw || raw.startsWith('--')) throw new Error('--only requires at least one chamber route slug');

  const requested = new Set(raw.split(',').map((slug) => slug.trim()).filter(Boolean));
  const routes = CHAMBER_ROUTES.filter((route) => requested.has(route.slug));
  const found = new Set(routes.map((route) => route.slug));
  const missing = [...requested].filter((slug) => !found.has(slug));
  if (missing.length) throw new Error(`Unknown chamber route slug(s): ${missing.join(', ')}`);
  return routes;
}

async function main() {
  const report = await readGovernanceReport();
  const routes = selectedRoutes();
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await launchChromium(chromium, { headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    for (const route of routes) {
      await page.setContent(renderCard(route, report), { waitUntil: 'load' });
      const out = path.join(OUT_DIR, `${route.slug}.png`);
      await page.screenshot({ path: out, type: 'png' });
      const { before, after } = await optimizePng(out);
      console.log(`Wrote ${path.relative(ROOT, out)} (${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB)`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
