/**
 * Baker Report Card — Monthly shareable performance summary
 * Generates a visual "report card" for any baker with letter grades,
 * stats, and PNG export for sharing on social media.
 */

import { API_URLS } from '../core/config.js';
import { formatNumber } from '../core/utils.js';
import { loadHtml2Canvas, showShareModal } from '../ui/share.js';

const TZKT = API_URLS.tzkt;

/**
 * Calculate letter grade from a 0-100 score
 */
function letterGrade(score) {
    if (score >= 97) return { grade: 'A+', color: '#00ff88' };
    if (score >= 93) return { grade: 'A',  color: '#00ff88' };
    if (score >= 90) return { grade: 'A-', color: '#00ff88' };
    if (score >= 87) return { grade: 'B+', color: '#66ff99' };
    if (score >= 83) return { grade: 'B',  color: '#66ff99' };
    if (score >= 80) return { grade: 'B-', color: '#66ff99' };
    if (score >= 77) return { grade: 'C+', color: '#ffcc00' };
    if (score >= 73) return { grade: 'C',  color: '#ffcc00' };
    if (score >= 70) return { grade: 'C-', color: '#ffcc00' };
    if (score >= 60) return { grade: 'D',  color: '#ff8800' };
    return { grade: 'F', color: '#ff3333' };
}

/**
 * Format mutez to XTZ with compact notation
 */
function fmtXTZ(mutez) {
    const xtz = mutez / 1_000_000;
    if (xtz >= 1_000_000) return (xtz / 1_000_000).toFixed(2) + 'M';
    if (xtz >= 1_000) return (xtz / 1_000).toFixed(1) + 'K';
    return xtz.toFixed(0);
}

/**
 * Fetch all data needed for a baker report card
 */
async function fetchBakerReport(bakerAddress) {
    // Fetch baker data
    const bakerResp = await fetch(`${TZKT}/delegates/${encodeURIComponent(bakerAddress)}`);
    if (!bakerResp.ok) throw new Error('Baker not found');
    const baker = await bakerResp.json();

    // Fetch participation (latest cycle)
    let participation = null;
    try {
        const pResp = await fetch(`${TZKT}/delegates/${encodeURIComponent(bakerAddress)}`);
        if (pResp.ok) {
            // Participation data is embedded in the delegate response — use separate endpoint
            const partResp = await fetch(`${TZKT}/delegates/${encodeURIComponent(bakerAddress)}/participation`);
            if (partResp.ok) {
                const partData = await partResp.json();
                if (Array.isArray(partData) && partData.length > 0) {
                    participation = partData[partData.length - 1]; // latest cycle
                }
            }
        }
    } catch {}

    // Fetch all active bakers for ranking (minimal fields)
    let allBakers = [];
    try {
        const abResp = await fetch(`${TZKT}/delegates?active=true&limit=10000&select=address,stakingBalance&sort.desc=id`);
        if (abResp.ok) allBakers = await abResp.json();
    } catch {}

    // Sort by staking balance descending, then find rank
    allBakers.sort((a, b) => (b.stakingBalance || 0) - (a.stakingBalance || 0));
    const rank = allBakers.findIndex(b => b.address === bakerAddress) + 1;
    const totalBakers = allBakers.length;

    // Calculate scores
    // 1. Uptime score (attestation rate) — 40% weight
    let uptimeScore = 95; // default if no data
    if (participation) {
        const expected = participation.expectedEndorsements || participation.expected_cycle_activity || 0;
        const missed = participation.missedEndorsements || participation.missed_slots || 0;
        const attested = expected - missed;
        const rate = expected > 0 ? (attested / expected) * 100 : 100;
        uptimeScore = Math.min(100, rate);
    }

    // 2. Fee competitiveness — 20% weight (lower fee = higher score, but 0% isn't necessarily best)
    // Most bakers charge 5-15%. Score: 0% = 90, 5% = 100, 10% = 85, 15% = 70, 20%+ = 50
    // Tallinn: fee is edgeOfBakingOverStaking in billionths (1B = 100%)
    // Fallback to legacy stakingFee if present
    const fee = baker.edgeOfBakingOverStaking != null
        ? baker.edgeOfBakingOverStaking / 10_000_000  // billionths → percentage
        : (baker.stakingFee || 0) * 100;
    let feeScore;
    if (fee <= 5) feeScore = 90 + (fee / 5) * 10; // 0% = 90, 5% = 100
    else if (fee <= 10) feeScore = 100 - (fee - 5) * 3; // 5% = 100, 10% = 85
    else if (fee <= 15) feeScore = 85 - (fee - 10) * 3; // 10% = 85, 15% = 70
    else feeScore = Math.max(30, 70 - (fee - 15) * 4);

    // 3. Delegator growth — 20% weight (based on staker + delegator count)
    const totalDelegators = (baker.numDelegators || 0) + (baker.stakersCount || 0);
    // Score: 1-5 = 60, 5-20 = 75, 20-50 = 85, 50+ = 95
    let growthScore;
    if (totalDelegators >= 50) growthScore = 95;
    else if (totalDelegators >= 20) growthScore = 85 + (totalDelegators - 20) / 30 * 10;
    else if (totalDelegators >= 5) growthScore = 75 + (totalDelegators - 5) / 15 * 10;
    else growthScore = 50 + totalDelegators * 6;

    // 4. Capacity remaining — 20% weight (bakers near capacity are less attractive)
    // Tallinn: max external staked = baker's own staked × limitOfStakingOverBaking (in millionths)
    const ownStaked = baker.stakedBalance || baker.balance || 0;
    const limitMultiplier = baker.limitOfStakingOverBaking != null
        ? baker.limitOfStakingOverBaking / 1_000_000  // millionths → multiplier (e.g. 9000000 = 9x)
        : 0; // null = not accepting external stakers
    const maxExternalStaked = ownStaked * limitMultiplier;
    const externalStaked = baker.externalStakedBalance || 0;
    const usedPct = maxExternalStaked > 0 ? (externalStaked / maxExternalStaked) * 100 : (limitMultiplier === 0 ? 100 : 0);
    let capacityScore;
    if (usedPct <= 50) capacityScore = 100;
    else if (usedPct <= 80) capacityScore = 100 - (usedPct - 50) * 0.5;
    else if (usedPct <= 95) capacityScore = 85 - (usedPct - 80) * 2;
    else capacityScore = Math.max(20, 55 - (usedPct - 95) * 5);

    // Weighted overall score
    const overallScore = Math.round(
        uptimeScore * 0.40 +
        feeScore * 0.20 +
        growthScore * 0.20 +
        capacityScore * 0.20
    );

    return {
        baker,
        participation,
        rank,
        totalBakers,
        scores: {
            overall: overallScore,
            uptime: Math.round(uptimeScore),
            fee: Math.round(feeScore),
            growth: Math.round(growthScore),
            capacity: Math.round(capacityScore),
        },
        stats: {
            stakingBalance: baker.stakingBalance,
            delegators: baker.numDelegators || 0,
            stakers: baker.stakersCount || 0,
            fee: fee,
            uptimePct: uptimeScore,
            usedCapacityPct: usedPct,
        }
    };
}

/**
 * Build the report card DOM (for both display and screenshot)
 */
function buildReportCardDOM(report) {
    const { baker, rank, totalBakers, scores, stats } = report;
    const overall = letterGrade(scores.overall);
    const name = baker.alias || baker.address.slice(0, 12) + '…';
    const addr = baker.address.slice(0, 8) + '…' + baker.address.slice(-4);

    const card = document.createElement('div');
    card.style.cssText = `
        width: 680px; padding: 32px; background: #0a0e1a;
        border: 1px solid rgba(0,255,136,0.2); border-radius: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #e0e0e0; position: relative; overflow: hidden;
    `;

    // Subtle grid background
    card.innerHTML = `
        <div style="position:absolute;inset:0;background:linear-gradient(rgba(0,255,136,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,0.02) 1px,transparent 1px);background-size:20px 20px;pointer-events:none;"></div>
        
        <div style="position:relative;z-index:1;">
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
                <div>
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:rgba(0,255,136,0.5);margin-bottom:4px;">Baker Report Card</div>
                    <div style="font-size:24px;font-weight:700;color:#fff;">${name}</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.4);font-family:monospace;margin-top:2px;">${addr}</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:56px;font-weight:900;color:${overall.color};line-height:1;text-shadow:0 0 20px ${overall.color}40;">${overall.grade}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;">${scores.overall}/100</div>
                </div>
            </div>

            <!-- Rank banner -->
            <div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.12);border-radius:8px;padding:10px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:13px;color:rgba(255,255,255,0.6);">Rank</span>
                <span style="font-size:18px;font-weight:700;color:#00ff88;">#${rank} <span style="font-size:12px;color:rgba(255,255,255,0.3);">of ${totalBakers}</span></span>
            </div>

            <!-- Score bars -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
                ${buildScoreBar('Uptime', scores.uptime, '40%')}
                ${buildScoreBar('Fee Score', scores.fee, '20%')}
                ${buildScoreBar('Community', scores.growth, '20%')}
                ${buildScoreBar('Capacity', scores.capacity, '20%')}
            </div>

            <!-- Stats grid -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
                ${buildStatCell('Staking Power', fmtXTZ(stats.stakingBalance) + ' XTZ')}
                ${buildStatCell('Delegators', stats.delegators.toString())}
                ${buildStatCell('Stakers', stats.stakers.toString())}
                ${buildStatCell('Fee', stats.fee.toFixed(1) + '%')}
                ${buildStatCell('Attest Rate', stats.uptimePct.toFixed(1) + '%')}
                ${buildStatCell('Capacity Used', stats.usedCapacityPct.toFixed(0) + '%')}
            </div>

            <!-- Footer -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:11px;color:rgba(255,255,255,0.25);">tezos.systems</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.25);">${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
            </div>
        </div>
    `;

    return card;
}

function buildScoreBar(label, score, weight) {
    const { color } = letterGrade(score);
    return `
        <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px 12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:11px;color:rgba(255,255,255,0.5);">${label} <span style="color:rgba(255,255,255,0.2);">(${weight})</span></span>
                <span style="font-size:13px;font-weight:700;color:${color};">${score}</span>
            </div>
            <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${score}%;background:${color};border-radius:2px;"></div>
            </div>
        </div>
    `;
}

function buildStatCell(label, value) {
    return `
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:10px 12px;text-align:center;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.35);margin-bottom:4px;">${label}</div>
            <div style="font-size:16px;font-weight:600;color:#fff;">${value}</div>
        </div>
    `;
}

/**
 * Generate and show baker report card
 */
export async function showBakerReportCard(bakerAddress) {
    // Show loading state
    const overlay = document.createElement('div');
    overlay.id = 'report-card-overlay';
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;
        display:flex;align-items:center;justify-content:center;
        backdrop-filter:blur(4px);
    `;
    overlay.innerHTML = '<div style="color:#00ff88;font-size:16px;">Generating report card…</div>';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    try {
        const report = await fetchBakerReport(bakerAddress);
        const card = buildReportCardDOM(report);

        // Render offscreen for html2canvas
        card.style.position = 'fixed';
        card.style.left = '-9999px';
        document.body.appendChild(card);

        await loadHtml2Canvas();
        const canvas = await window.html2canvas(card, {
            backgroundColor: '#0a0e1a',
            scale: 2,
            useCORS: true,
        });

        card.remove();
        overlay.remove();

        // Prepare tweet options
        const name = report.baker.alias || report.baker.address.slice(0, 12) + '…';
        const grade = letterGrade(report.scores.overall).grade;
        const tweetOptions = [
            { label: '📋 Report Card', text: `${name} scores ${grade} on their Baker Report Card — #${report.rank} of ${report.totalBakers} bakers on Tezos\n\nCheck any baker at tezos.systems` },
            { label: '📊 Stats', text: `Baker Report Card: ${name}\nGrade: ${grade} | Rank: #${report.rank}/${report.totalBakers}\nUptime: ${report.stats.uptimePct.toFixed(1)}% | Fee: ${report.stats.fee.toFixed(1)}%\n\ntezos.systems` },
            { label: '🏆 Challenge', text: `How does your Tezos baker stack up? ${name} earned a ${grade}\n\ntezos.systems` },
        ];

        showShareModal(canvas, tweetOptions, `Baker Report Card: ${name}`);

    } catch (err) {
        overlay.innerHTML = `<div style="color:#ff4444;font-size:14px;text-align:center;padding:20px;">
            Failed to generate report card<br><span style="font-size:12px;color:rgba(255,255,255,0.4);">${err.message}</span>
        </div>`;
        setTimeout(() => overlay.remove(), 3000);
    }
}

/**
 * Add report card button to My Baker section
 */
export function initBakerReportCard() {
    // Listen for baker data being rendered — add report card button
    const observer = new MutationObserver(() => {
        const section = document.getElementById('my-baker-section');
        if (!section) return;

        // Check if baker data is loaded and button doesn't exist yet
        const grid = section.querySelector('.my-baker-grid');
        const existingBtn = section.querySelector('.report-card-btn');
        if (grid && !existingBtn) {
            const address = localStorage.getItem('tezos-systems-my-baker-address');
            if (!address) return;

            // Check if this is a baker (look for "Staking Power" stat which only bakers have)
            const stats = grid.querySelectorAll('.my-baker-stat-label');
            let isBaker = false;
            stats.forEach(s => { if (s.textContent === 'Staking Power') isBaker = true; });

            // Also check delegate address for non-baker users
            let bakerAddr = address;
            const delegateEl = grid.querySelector('.my-baker-stat-value[title]');
            if (!isBaker && delegateEl?.title) {
                bakerAddr = delegateEl.title;
                isBaker = true; // the delegate IS a baker
            }

            if (isBaker || bakerAddr) {
                const btn = document.createElement('button');
                btn.className = 'report-card-btn glass-button';
                btn.innerHTML = '📋 <span class="dropdown-label">Baker Report Card</span>';
                btn.title = 'Generate shareable baker report card';
                btn.style.cssText = 'margin-top:8px;width:auto;padding:10px 20px;gap:8px;display:inline-flex;align-items:center;font-size:0.85rem;';
                btn.addEventListener('click', () => showBakerReportCard(bakerAddr));

                // Insert prominently — after controls, before the stats grid
                const controls = section.querySelector('.my-baker-controls');
                if (controls) {
                    controls.after(btn);
                } else {
                    grid.after(btn);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}
