#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { CHAMBER_ROUTES } from './lib/chamber-routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'og');

const SYSTEM_BROWSER_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium'
];

function fileExists(file) {
  try {
    fsSync.accessSync(file);
    return true;
  } catch {
    return false;
  }
}

function findSystemBrowser() {
  const explicit = process.env.BROWSER_EXECUTABLE_PATH || '';
  if (explicit) {
    if (!fileExists(explicit)) throw new Error(`BROWSER_EXECUTABLE_PATH does not exist: ${explicit}`);
    return explicit;
  }
  return SYSTEM_BROWSER_CANDIDATES.find(fileExists) || '';
}

async function launchChromium() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!/Executable doesn't exist|playwright install/i.test(error.message)) throw error;
    const executablePath = findSystemBrowser();
    if (!executablePath) {
      throw new Error('Playwright browser binary is missing. Run npx playwright install chromium, or set BROWSER_EXECUTABLE_PATH.');
    }
    console.log(`Using system browser: ${executablePath}`);
    return chromium.launch({ headless: true, executablePath });
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatUtc(iso) {
  if (!iso) return 'live now';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'live now';
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

function routeDetails(route, report) {
  const gov = report?.currentGovernance || {};
  const proposal = gov.proposalName || 'Current proposal';
  const kind = gov.kind ? `${gov.kind[0].toUpperCase()}${gov.kind.slice(1)}` : 'Governance';
  const end = formatUtc(gov.endTime);
  const participation = Number.isFinite(Number(gov.tally?.participationPct))
    ? `${Number(gov.tally.participationPct).toFixed(1)}% participation`
    : 'live participation';
  const yay = Number.isFinite(Number(gov.tally?.yayPct))
    ? `${Number(gov.tally.yayPct).toFixed(1)}% yay`
    : 'live supermajority';

  const bySlug = {
    chamber: {
      kicker: `${proposal} ${kind}`,
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
    ctez: {
      kicker: 'ctez Oven Guide',
      value: 'Better Call Dev',
      chips: ['oven id', 'burn ctez', 'withdraw mutez'],
      body: 'A unit-safe guide for finding old ctez ovens, burning outstanding ctez, and withdrawing tez through verified contract pages.'
    }
  };

  return bySlug[route.slug] || bySlug.chamber;
}

function renderCard(route, report) {
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
      radial-gradient(circle at 88% 22%, #7c3aed2e 0, transparent 28%),
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
      <div class="live">Live Room</div>
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

async function main() {
  const report = await readGovernanceReport();
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    for (const route of CHAMBER_ROUTES) {
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
