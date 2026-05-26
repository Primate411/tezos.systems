#!/usr/bin/env node
/**
 * Generate OG image for tezos.systems with live stats and matrix theme.
 * Run: node scripts/generate-og-image.js
 * Uses Playwright (npx playwright) — no install needed.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function fetchStats() {
    const [statsResp, protocolResp, frozenStakeResp, supplyResp] = await Promise.all([
        fetch('https://api.tzkt.io/v1/statistics/current'),
        fetch('https://api.tzkt.io/v1/protocols/current'),
        fetch('https://eu.rpc.tez.capital/chains/main/blocks/head/context/total_frozen_stake'),
        fetch('https://eu.rpc.tez.capital/chains/main/blocks/head/context/total_supply')
    ]);
    const stats = await statsResp.json();
    const protocolData = await protocolResp.json();
    const [frozenStakeText, supplyText] = await Promise.all([
        frozenStakeResp.text(),
        supplyResp.text()
    ]);
    const protocolName = protocolData?.extras?.alias || 'Current';

    const supplyMutez = parseInt(String(supplyText).replace(/"/g, ''), 10) || stats.totalSupply || 0;
    const frozenStakeMutez = parseInt(String(frozenStakeText).replace(/"/g, ''), 10)
        || stats.totalFrozen
        || ((stats.totalOwnStaked || 0) + (stats.totalExternalStaked || 0));
    const supply = supplyMutez / 1e6;
    const stakingRatio = ((frozenStakeMutez / supplyMutez) * 100).toFixed(1);
    let bakers = stats.totalBakers || 0;
    let tz4Bakers = 0;
    try {
        const bakersResp = await fetch('https://api.tzkt.io/v1/delegates?active=true&limit=10000&select=address,consensusAddress,bakingPower');
        const allBakersList = await bakersResp.json();
        const fundedBakers = allBakersList.filter(b => Number(b.bakingPower || 0) > 0);
        bakers = fundedBakers.length || bakers;
        tz4Bakers = fundedBakers.filter(b => String(b.consensusAddress || b.address || '').startsWith('tz4')).length;
    } catch(e) { console.error('tz4 fetch error:', e); }

    const tz4Pct = bakers > 0 ? ((tz4Bakers / bakers) * 100).toFixed(1) : '0';
    const supplyB = (supply / 1e9).toFixed(2) + 'B';

    return { bakers, tz4Bakers, tz4Pct, stakingRatio, supply: supplyB, protocolName };
}

function generateMatrixChars() {
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
    let result = '';
    for (let i = 0; i < 3000; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

function buildHTML(stats) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    background: #000; color: #00ff41;
    font-family: 'Share Tech Mono', monospace;
    overflow: hidden; position: relative;
  }
  .bg-chars {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    font-size: 14px; line-height: 1.1;
    color: rgba(0, 255, 65, 0.06);
    overflow: hidden; word-break: break-all;
    padding: 10px; z-index: 0;
  }
  .content {
    position: relative; z-index: 1;
    padding: 50px 60px; height: 100%;
    display: flex; flex-direction: column;
    justify-content: space-between;
  }
  .header {
    display: flex; justify-content: space-between;
    align-items: flex-start;
  }
  .title {
    font-family: 'Orbitron', sans-serif;
    font-size: 48px; font-weight: 900; color: #00ff41;
    text-shadow: 0 0 20px rgba(0, 255, 65, 0.5), 0 0 40px rgba(0, 255, 65, 0.2);
    letter-spacing: 4px;
  }
  .subtitle {
    font-size: 18px; color: rgba(0, 255, 65, 0.5);
    margin-top: 8px; letter-spacing: 1px;
  }
  .live-badge {
    background: rgba(0, 255, 65, 0.1);
    border: 1px solid rgba(0, 255, 65, 0.3);
    border-radius: 20px; padding: 8px 20px;
    font-size: 14px; color: #00ff41;
    display: flex; align-items: center; gap: 8px;
  }
  .live-dot {
    width: 8px; height: 8px; background: #00ff41;
    border-radius: 50%; box-shadow: 0 0 8px #00ff41;
  }
  .stats-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  .stat-card {
    background: rgba(0, 255, 65, 0.04);
    border: 1px solid rgba(0, 255, 65, 0.15);
    border-radius: 12px; padding: 24px 28px;
  }
  .stat-label {
    font-size: 12px; color: rgba(0, 255, 65, 0.4);
    letter-spacing: 2px; text-transform: uppercase;
    margin-bottom: 8px;
  }
  .stat-value {
    font-family: 'Orbitron', sans-serif;
    font-size: 42px; font-weight: 700; color: #00ff41;
    text-shadow: 0 0 15px rgba(0, 255, 65, 0.4);
  }
  .stat-value.accent {
    color: #ff0080;
    text-shadow: 0 0 15px rgba(255, 0, 128, 0.4);
  }
  .footer {
    display: flex; justify-content: space-between;
    align-items: center;
  }
  .footer-left {
    font-family: 'Orbitron', sans-serif;
    font-size: 16px; font-weight: 700;
    color: rgba(0, 255, 65, 0.3); letter-spacing: 2px;
    border: 1px solid rgba(0, 255, 65, 0.15);
    border-radius: 6px; padding: 6px 14px;
  }
  .footer-right {
    font-size: 16px; color: rgba(0, 255, 65, 0.3);
    letter-spacing: 1px;
  }
</style>
</head>
<body>
  <div class="bg-chars">${generateMatrixChars()}</div>
  <div class="content">
    <div class="header">
      <div>
        <div class="title">TEZOS SYSTEMS</div>
        <div class="subtitle">Real-time Tezos network intelligence · ${stats.protocolName} protocol</div>
      </div>
      <div class="live-badge"><div class="live-dot"></div>LIVE DATA</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Active Bakers</div>
        <div class="stat-value">${stats.bakers}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">TZ4 Consensus Keys</div>
        <div class="stat-value">${stats.tz4Bakers}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">TZ4 Adoption</div>
        <div class="stat-value accent">${stats.tz4Pct}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Staking Ratio</div>
        <div class="stat-value">${stats.stakingRatio}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Supply</div>
        <div class="stat-value">${stats.supply}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Protocol</div>
        <div class="stat-value" style="font-size: 32px;">${stats.protocolName}</div>
      </div>
    </div>
    <div class="footer">
      <div class="footer-left">Tezos Systems</div>
      <div class="footer-right">tezos.systems</div>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
    console.log('Fetching live stats from TzKT...');
    const stats = await fetchStats();
    console.log('Stats:', JSON.stringify(stats));

    const html = buildHTML(stats);
    const tmpHtml = path.join(__dirname, '_og-tmp.html');
    fs.writeFileSync(tmpHtml, html);

    const outputPath = path.join(__dirname, '..', 'og-image.png');

    console.log('Capturing with Playwright...');
    // Use Playwright's screenshot API via a small inline script
    const playwrightScript = `
    const { chromium } = require('playwright');
    (async () => {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1200, height: 630 });
      await page.goto('file://${tmpHtml.replace(/'/g, "\\'")}', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000); // fonts
      await page.screenshot({ path: '${outputPath.replace(/'/g, "\\'")}', type: 'png' });
      await browser.close();
    })();
    `;
    const tmpScript = path.join(__dirname, '_pw-capture.js');
    fs.writeFileSync(tmpScript, playwrightScript);

    try {
        execSync(`npx playwright install chromium --with-deps 2>/dev/null; node "${tmpScript}"`, {
            stdio: 'inherit',
            timeout: 60000,
        });
    } finally {
        try { fs.unlinkSync(tmpHtml); } catch(e) {}
        try { fs.unlinkSync(tmpScript); } catch(e) {}
    }

    console.log(`✅ OG image saved to ${outputPath}`);
    console.log(`   Stats: ${stats.bakers} bakers, ${stats.tz4Bakers} tz4 (${stats.tz4Pct}%), ${stats.stakingRatio}% staked, ${stats.supply} supply`);
}

main().catch(err => {
    console.error('Failed:', err);
    process.exit(1);
});
