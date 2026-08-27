#!/usr/bin/env node
/**
 * Generate the root OG image for tezos.systems with live stats and the
 * deterministic static frame from the Valley theme.
 * Run: node scripts/generate-og-image.js
 * Uses Playwright and falls back to local Chrome/Chromium if the bundled
 * browser is missing.
 */

const fs = require('fs');
const path = require('path');
const { launchChromium } = require('./lib/playwright-browser.cjs');

const PROJECT_ROOT = path.join(__dirname, '..');
const OG_ORIGIN = 'http://tezos-og.local';
const OG_PREVIEW_PATH = '/scripts/_og-preview.html';
const DAY_MS = 24 * 60 * 60 * 1000;
const LB_EMA_DISABLE_THRESHOLD = 1_000_000_000;

function readPublicSupabaseConfig() {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, 'js/core/config.js'), 'utf8');
    const url = process.env.SUPABASE_URL || source.match(/url:\s*'([^']+)'/)?.[1];
    const key = process.env.SUPABASE_ANON_KEY || source.match(/key:\s*'([^']+)'/)?.[1];
    if (!url || !key) throw new Error('Public Supabase history configuration is unavailable');
    return { url: url.replace(/\/$/, ''), key };
}

async function fetchChecked(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return response;
}

function numeric(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function fetchCurrentIssuance(supplyMutez) {
    const rpc = 'https://eu.rpc.tez.capital';
    const [rateResponse, constantsResponse, blockResponse] = await Promise.all([
        fetchChecked(`${rpc}/chains/main/blocks/head/context/issuance/current_yearly_rate`),
        fetchChecked(`${rpc}/chains/main/blocks/head/context/constants`),
        fetchChecked('https://api.tzkt.io/v1/blocks?sort.desc=level&limit=1&select=level,lbToggleEma')
    ]);
    const protocolRate = numeric(String(await rateResponse.text()).replace(/"/g, ''));
    const constants = await constantsResponse.json();
    const blocks = await blockResponse.json();
    const lbEma = numeric(Array.isArray(blocks) ? blocks[0]?.lbToggleEma : null);
    const lbDisabled = lbEma !== null && lbEma >= LB_EMA_DISABLE_THRESHOLD;
    const lbSubsidyMutezPerMinute = numeric(constants?.liquidity_baking_subsidy);
    const supplyXTZ = numeric(supplyMutez) / 1e6;
    const lbRate = lbDisabled
        ? 0
        : lbEma !== null && lbSubsidyMutezPerMinute !== null && supplyXTZ > 0
            ? ((lbSubsidyMutezPerMinute / 1e6) * 365.25 * 24 * 60 / supplyXTZ) * 100
            : null;
    if (protocolRate === null || protocolRate <= 0) throw new Error('Current protocol issuance rate is unavailable');
    return lbRate === null ? protocolRate : protocolRate + lbRate;
}

async function fetchThirtyDayHistory() {
    const { url, key } = readPublicSupabaseConfig();
    const target = Date.now() - 30 * DAY_MS;
    const endpoint = new URL(`${url}/rest/v1/tezos_history`);
    endpoint.searchParams.set('select', 'timestamp,total_bakers,current_issuance_rate,tz4_percentage,staking_ratio,total_supply');
    endpoint.searchParams.append('timestamp', `gte.${new Date(target - 5 * DAY_MS).toISOString()}`);
    endpoint.searchParams.append('timestamp', `lte.${new Date(target + 5 * DAY_MS).toISOString()}`);
    endpoint.searchParams.set('order', 'timestamp.asc');
    endpoint.searchParams.set('limit', '1000');
    const response = await fetchChecked(endpoint, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) throw new Error('No retained snapshots cover the 30-day comparison window');
    return { rows, target };
}

function closestHistoricalValue(history, field) {
    const candidates = history.rows
        .map((row) => ({ value: numeric(row[field]), timestamp: Date.parse(row.timestamp) }))
        .filter((row) => row.value !== null && row.value > 0 && Number.isFinite(row.timestamp));
    candidates.sort((left, right) => Math.abs(left.timestamp - history.target) - Math.abs(right.timestamp - history.target));
    return candidates[0]?.value ?? null;
}

function percentChange(current, previous) {
    const next = numeric(current);
    const baseline = numeric(previous);
    if (next === null || baseline === null || baseline === 0) return null;
    return ((next - baseline) / Math.abs(baseline)) * 100;
}

function formatDelta(value) {
    if (!Number.isFinite(value)) return null;
    const absolute = Math.abs(value);
    const decimals = absolute >= 10 ? 0 : absolute >= 1 ? 1 : 2;
    const normalized = Number(absolute.toFixed(decimals));
    if (normalized === 0) return '0.00%';
    return `${value > 0 ? '+' : '−'}${normalized.toFixed(decimals)}%`;
}

function deltaHtml(value) {
    const label = formatDelta(value);
    if (!label) return '<span class="stat-delta is-unavailable"><strong>—</strong><small>30D</small></span>';
    const tone = value > 0 ? 'is-up' : value < 0 ? 'is-down' : 'is-flat';
    return `<span class="stat-delta ${tone}"><strong>${label}</strong><small>30D</small></span>`;
}

async function fetchStats() {
    const [statsResp, protocolResp, history] = await Promise.all([
        fetchChecked('https://api.tzkt.io/v1/statistics/current'),
        fetchChecked('https://api.tzkt.io/v1/protocols/current'),
        fetchThirtyDayHistory()
    ]);
    const stats = await statsResp.json();
    const protocolData = await protocolResp.json();
    const protocolName = protocolData?.extras?.alias || 'Current';

    const supplyMutez = Number(stats.totalSupply || 0);
    const stakedMutez = (Number(stats.totalOwnStaked || 0) + Number(stats.totalExternalStaked || 0))
        || Number(stats.totalFrozen || 0);
    const supply = supplyMutez / 1e6;
    const stakingRatioValue = supplyMutez > 0 ? (stakedMutez / supplyMutez) * 100 : 0;
    const stakingRatio = stakingRatioValue.toFixed(1);
    let bakers = stats.totalBakers || 0;
    let tz4Bakers = 0;
    try {
        const bakersResp = await fetch('https://api.tzkt.io/v1/delegates?active=true&limit=10000&select=address,consensusAddress,bakingPower');
        const allBakersList = await bakersResp.json();
        const fundedBakers = allBakersList.filter(b => Number(b.bakingPower || 0) > 0);
        bakers = fundedBakers.length || bakers;
        tz4Bakers = fundedBakers.filter(b => String(b.consensusAddress || b.address || '').startsWith('tz4')).length;
    } catch(e) { console.error('tz4 fetch error:', e); }

    const tz4PctValue = bakers > 0 ? (tz4Bakers / bakers) * 100 : 0;
    const tz4Pct = tz4PctValue.toFixed(1);
    const supplyB = (supply / 1e9).toFixed(2) + 'B';
    const issuanceRate = await fetchCurrentIssuance(supplyMutez);
    const deltas = {
        bakers: percentChange(bakers, closestHistoricalValue(history, 'total_bakers')),
        issuance: percentChange(issuanceRate, closestHistoricalValue(history, 'current_issuance_rate')),
        tz4: percentChange(tz4PctValue, closestHistoricalValue(history, 'tz4_percentage')),
        staking: percentChange(stakingRatioValue, closestHistoricalValue(history, 'staking_ratio')),
        supply: percentChange(supply, closestHistoricalValue(history, 'total_supply'))
    };

    return {
        bakers,
        tz4Bakers,
        tz4Pct,
        issuance: issuanceRate.toFixed(2),
        stakingRatio,
        supply: supplyB,
        protocolName,
        deltas
    };
}

function buildHTML(stats) {
    const serializedStats = JSON.stringify(stats).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html data-og-ready="false">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: #182016; color: #fff4d6;
    font-family: 'Share Tech Mono', monospace;
    overflow: hidden; position: relative;
  }
  #valley-background-canvas {
    position: absolute !important;
    z-index: 0 !important;
    opacity: 1 !important;
  }
  .valley-wash {
    position: absolute;
    inset: 0;
    z-index: 1;
    background:
      radial-gradient(circle at 78% 14%, rgba(255, 231, 177, 0.05), transparent 32%),
      linear-gradient(90deg, rgba(8, 12, 8, 0.62) 0%, rgba(8, 12, 8, 0.28) 52%, rgba(8, 12, 8, 0.42) 100%),
      linear-gradient(180deg, rgba(7, 10, 7, 0.14) 0%, rgba(7, 10, 7, 0.42) 48%, rgba(7, 10, 7, 0.68) 100%);
  }
  .content {
    position: relative; z-index: 2;
    padding: 42px 50px 32px; height: 100%;
    display: flex; flex-direction: column;
    justify-content: space-between;
  }
  .header {
    display: flex; justify-content: space-between;
    align-items: flex-start;
  }
  .title {
    font-family: 'Orbitron', sans-serif;
    font-size: 64px; line-height: 1; font-weight: 900; color: #fff4d6;
    background: linear-gradient(110deg, #fff8e6 0%, #f3c47a 55%, #dfa06f 100%);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 5px 26px rgba(17, 18, 11, 0.38);
    letter-spacing: 2px;
  }
  .subtitle {
    font-size: 23px; line-height: 1.25; color: #f5e7c6;
    margin-top: 12px; letter-spacing: 0.25px;
    text-shadow: 0 2px 10px rgba(8, 10, 7, 0.85);
  }
  .live-badge {
    background: rgba(20, 29, 18, 0.88);
    border: 1px solid rgba(169, 209, 142, 0.58);
    border-radius: 999px; padding: 10px 18px;
    font-size: 16px; line-height: 1; color: #d5f0c2;
    letter-spacing: 0.8px;
    display: flex; align-items: center; gap: 8px;
    box-shadow: 0 8px 24px rgba(8, 10, 7, 0.22);
  }
  .live-dot {
    width: 9px; height: 9px; background: #a9d18e;
    border-radius: 50%; box-shadow: 0 0 10px rgba(169, 209, 142, 0.85);
  }
  .stats-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .stat-card {
    min-height: 121px;
    background: linear-gradient(145deg, rgba(35, 42, 27, 0.92), rgba(19, 24, 16, 0.88));
    border: 1px solid rgba(231, 182, 108, 0.38);
    border-radius: 14px; padding: 17px 22px 15px;
    box-shadow: 0 12px 30px rgba(8, 10, 7, 0.2);
  }
  .stat-label {
    font-size: 18px; line-height: 1.05; font-weight: 700; color: #ead9b6;
    letter-spacing: 0.7px; text-transform: uppercase;
    margin-bottom: 7px;
  }
  .stat-value {
    font-family: 'Orbitron', sans-serif;
    font-size: 50px; line-height: 1; font-weight: 700; color: #fff4d6;
    text-shadow: 0 3px 15px rgba(8, 10, 7, 0.5);
  }
  .stat-value.live {
    color: #c8e7b4;
  }
  .stat-value.accent {
    color: #f4a083;
  }
  .stat-value-row {
    display: flex; align-items: flex-end; justify-content: space-between;
    min-width: 0; gap: 14px;
  }
  .stat-delta {
    display: inline-flex; align-items: baseline; gap: 6px;
    flex: 0 0 auto; margin-bottom: 3px; padding: 6px 9px 5px;
    border: 1px solid rgba(231, 182, 108, 0.28); border-radius: 999px;
    background: rgba(8, 12, 8, 0.48); color: #ead9b6;
    font-size: 16px; line-height: 1; white-space: nowrap;
  }
  .stat-delta strong { font-weight: 700; }
  .stat-delta small { color: rgba(234, 217, 182, 0.68); font-size: 11px; letter-spacing: 0.7px; }
  .stat-delta.is-up strong { color: #c8e7b4; }
  .stat-delta.is-down strong { color: #f4a083; }
  .stat-delta.is-flat strong { color: #ead9b6; }
  .stat-delta.is-unavailable { opacity: 0.72; }
  .footer {
    display: flex; justify-content: space-between;
    align-items: center;
    color: #ead9b6;
    text-shadow: 0 2px 10px rgba(8, 10, 7, 0.9);
  }
  .footer-left {
    font-size: 17px; font-weight: 700;
    letter-spacing: 0.6px;
  }
  .footer-right {
    font-family: 'Orbitron', sans-serif;
    font-size: 18px; font-weight: 700; color: #fff4d6;
    letter-spacing: 0.4px;
  }
</style>
</head>
<body>
  <div class="valley-wash"></div>
  <div class="content">
    <div class="header">
      <div>
        <div class="title">TEZOS SYSTEMS</div>
        <div class="subtitle">Live Tezos + Tezos X intelligence · ${stats.protocolName} protocol</div>
      </div>
      <div class="live-badge"><div class="live-dot"></div>LIVE DATA</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Active Bakers</div>
        <div class="stat-value-row"><div class="stat-value live">${stats.bakers}</div>${deltaHtml(stats.deltas.bakers)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Issuance</div>
        <div class="stat-value-row"><div class="stat-value">${stats.issuance}%</div>${deltaHtml(stats.deltas.issuance)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">TZ4 Adoption</div>
        <div class="stat-value-row"><div class="stat-value accent">${stats.tz4Pct}%</div>${deltaHtml(stats.deltas.tz4)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Staked</div>
        <div class="stat-value-row"><div class="stat-value live">${stats.stakingRatio}%</div>${deltaHtml(stats.deltas.staking)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Supply</div>
        <div class="stat-value-row"><div class="stat-value">${stats.supply}</div>${deltaHtml(stats.deltas.supply)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Protocol</div>
        <div class="stat-value" style="font-size: 40px;">${stats.protocolName}</div>
      </div>
    </div>
    <div class="footer">
      <div class="footer-left">Real-time network facts, chambers, and personal tools</div>
      <div class="footer-right">tezos.systems</div>
    </div>
  </div>
  <script type="module">
    import { createValleyEffect } from '../js/effects/valley-effects.js';

    const stats = ${serializedStats};
    const valley = createValleyEffect().start().seedStats({
      stakingRatio: Number(stats.stakingRatio),
      cycleProgress: 58,
      transactions24h: 180000
    });
    valley.pause();
    valley.drawScene(0, true);
    document.documentElement.dataset.ogReady = 'true';
  </script>
</body>
</html>`;
}

function localContentType(filePath) {
    if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    return 'application/octet-stream';
}

async function main() {
    console.log('Fetching live stats from TzKT...');
    const stats = await fetchStats();
    console.log('Stats:', JSON.stringify(stats));

    const html = buildHTML(stats);
    const outputPath = path.join(PROJECT_ROOT, 'og-image.png');

    console.log('Capturing with Playwright...');
    const { chromium } = require('playwright');
    let browser;

    try {
        browser = await launchChromium(chromium, { headless: true });
        const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
        await page.route(`${OG_ORIGIN}/**`, async (route) => {
            const requestUrl = new URL(route.request().url());
            if (requestUrl.pathname === OG_PREVIEW_PATH) {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html; charset=utf-8',
                    body: html
                });
                return;
            }

            const assetPath = path.resolve(PROJECT_ROOT, `.${decodeURIComponent(requestUrl.pathname)}`);
            if (!assetPath.startsWith(`${PROJECT_ROOT}${path.sep}`)) {
                await route.fulfill({ status: 403, body: 'Forbidden' });
                return;
            }
            try {
                await route.fulfill({
                    status: 200,
                    contentType: localContentType(assetPath),
                    body: fs.readFileSync(assetPath)
                });
            } catch (_error) {
                await route.fulfill({ status: 404, body: 'Not found' });
            }
        });
        await page.goto(`${OG_ORIGIN}${OG_PREVIEW_PATH}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForSelector('html[data-og-ready="true"]', { timeout: 10000 });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: outputPath, type: 'png' });
    } finally {
        if (browser) await browser.close();
    }

    console.log(`✅ OG image saved to ${outputPath}`);
    console.log(`   Stats: ${stats.bakers} bakers, ${stats.issuance}% issuance, ${stats.tz4Pct}% tz4, ${stats.stakingRatio}% staked, ${stats.supply} supply`);
}

main().catch(err => {
    console.error('Failed:', err);
    process.exit(1);
});
