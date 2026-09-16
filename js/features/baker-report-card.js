/**
 * Baker Report Card — shareable baker profile
 * Generates a visual report for any baker with a source-metric profile grade,
 * source metrics, and PNG export for sharing on social media.
 */

import { API_URLS } from '../core/config.js';
import { fetchWithDeadline } from '../core/api.js';
import { escapeHtml, formatMutez } from '../core/utils.js';
import { loadHtml2Canvas, showShareModal, appendCardSeal } from '../ui/share.js';

const TZKT = API_URLS.tzkt;

/**
 * Calculate letter grade from a 0-100 score
 */
export function letterGrade(score) {
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
 * Compute quality-based scores for a baker.
 * Works with raw TzKT baker objects.
 *
 * @param {object} baker       - TzKT delegate object
 * @param {object|null} participation - latest participation cycle data (or null)
 * @returns {{ overall, uptime, growth, capacity, tz4, externalStakerEdge, hasParticipation }} available scores; uptime is null when participation is unavailable
 */
const DEFAULT_DELEGATION_LIMIT = 9;

export function computeBakerScores(baker, participation) {
    // 1. Attestation score — 40% weight
    let uptimeScore = null;
    if (participation) {
        const expected = participation.expectedAttestations || participation.expectedEndorsements || participation.expected_cycle_activity || 0;
        const missed = participation.missedAttestations || participation.missedEndorsements || participation.missed_slots || 0;
        const reportedAttestations = Number(participation.attestations ?? participation.endorsements);
        const attested = Number.isFinite(reportedAttestations)
            ? reportedAttestations
            : expected - missed;
        if (expected > 0) {
            const rate = (attested / expected) * 100;
            uptimeScore = Math.max(0, Math.min(100, rate));
        }
    }

    // edgeOfBakingOverStaking is an on-chain reward split for direct external
    // staking, not a delegation fee or an operator-performance input. Surface
    // it as an unscored fact and leave off-chain delegation terms unmodeled.
    const rawExternalStakerEdge = Number(baker.edgeOfBakingOverStaking);
    const externalStakerEdge = baker.edgeOfBakingOverStaking != null
        && Number.isFinite(rawExternalStakerEdge)
        && rawExternalStakerEdge >= 0
        && rawExternalStakerEdge <= 1_000_000_000
        ? rawExternalStakerEdge / 10_000_000
        : null;

    // 2. Community (delegator + staker count) — 25% weight
    const totalDelegators = (baker.numDelegators || 0) + (baker.stakersCount || 0);
    // Score: 1-5 = 60, 5-20 = 75, 20-50 = 85, 50+ = 95
    let growthScore;
    if (totalDelegators >= 50) growthScore = 95;
    else if (totalDelegators >= 20) growthScore = 85 + (totalDelegators - 20) / 30 * 10;
    else if (totalDelegators >= 5) growthScore = 75 + (totalDelegators - 5) / 15 * 10;
    else growthScore = 50 + totalDelegators * 6;

    // 3. Capacity remaining — 25% weight (bakers near capacity are less attractive)
    const ownStaked = baker.stakedBalance || baker.balance || 0;
    const externalDelegated = baker.externalDelegatedBalance || 0;
    const externalStaked = baker.externalStakedBalance || 0;
    const delegationLimit = Number.isFinite(Number(baker.delegationLimit)) && Number(baker.delegationLimit) > 0
        ? Number(baker.delegationLimit)
        : DEFAULT_DELEGATION_LIMIT;
    const stakingLimit = baker.limitOfStakingOverBaking != null
        ? baker.limitOfStakingOverBaking / 1_000_000
        : 0;
    const maxDelegated = ownStaked * delegationLimit;
    const delegationPct = maxDelegated > 0 ? (externalDelegated / maxDelegated) * 100 : (externalDelegated > 0 ? 100 : 0);
    const maxExternalStaked = ownStaked * stakingLimit;
    const stakingPct = maxExternalStaked > 0 ? (externalStaked / maxExternalStaked) * 100 : (externalStaked > 0 ? 100 : 0);
    const usedPct = Math.max(delegationPct, stakingPct);
    let capacityScore;
    if (usedPct <= 50) capacityScore = 100;
    else if (usedPct <= 80) capacityScore = 100 - (usedPct - 50) * 0.5;
    else if (usedPct <= 95) capacityScore = 85 - (usedPct - 80) * 2;
    else capacityScore = Math.max(20, 55 - (usedPct - 95) * 5);

    // 4. BLS key (tz4) — 10% weight (rewards modern consensus key adoption)
    const hasTz4 = baker.address?.startsWith('tz4')
        || baker.consensusAddress?.startsWith('tz4');
    const tz4Score = hasTz4 ? 100 : 0;

    // Weighted score over inputs that actually exist. Missing participation
    // never receives an invented attestation score.
    const weightedInputs = [
        [uptimeScore, 0.40],
        [growthScore, 0.25],
        [capacityScore, 0.25],
        [tz4Score, 0.10]
    ].filter(([score]) => Number.isFinite(score));
    const availableWeight = weightedInputs.reduce((sum, [, weight]) => sum + weight, 0);
    const overallScore = availableWeight > 0
        ? Math.round(weightedInputs.reduce((sum, [score, weight]) => sum + score * weight, 0) / availableWeight)
        : null;

    return {
        overall: overallScore,
        uptime: Number.isFinite(uptimeScore) ? Math.round(uptimeScore) : null,
        growth: Math.round(growthScore),
        capacity: Math.round(capacityScore),
        tz4: tz4Score,
        externalStakerEdge,
        hasParticipation: Number.isFinite(uptimeScore),
    };
}

/**
 * Fetch all data needed for a baker report card
 */
async function fetchBakerReport(bakerAddress) {
    // A clicked report must not wait behind passive dashboard refreshes.
    const interactive = { __tezosSystemsPriority: 'interactive' };
    // Fetch baker data
    const bakerResp = await fetchWithDeadline(`${TZKT}/delegates/${encodeURIComponent(bakerAddress)}`, interactive);
    if (!bakerResp.ok) throw new Error('Baker not found');
    const baker = await bakerResp.json();

    // Fetch participation from a completed cycle only. Current/future rows can
    // contain rights that have not yet come due and must not score as successes.
    let participation = null;
    try {
        const [partResp, headResp] = await Promise.all([
            fetchWithDeadline(`${TZKT}/rewards/bakers/${encodeURIComponent(bakerAddress)}?limit=8&sort.desc=cycle&select=cycle,expectedBlocks,blocks,missedBlocks,expectedAttestations,attestations,missedAttestations`, interactive),
            fetchWithDeadline(`${TZKT}/head`, { ...interactive, cache: 'no-store' })
        ]);
        if (partResp.ok && headResp.ok) {
            const partData = await partResp.json();
            const head = await headResp.json();
            const currentCycle = Number(head?.cycle);
            if (Array.isArray(partData)) {
                participation = Number.isFinite(currentCycle)
                    ? partData.find((cycle) => Number(cycle?.cycle) < currentCycle && Number(cycle?.expectedAttestations) > 0) || null
                    : null;
            }
        }
    } catch {}

    // Rank against funded bakers with current baking power, matching the main
    // baker count and All Bakers Attest activation population.
    let allBakers = [];
    let allBakersFailed = false;
    try {
        const abResp = await fetchWithDeadline(`${TZKT}/delegates?active=true&limit=10000&select=address,stakingBalance,bakingPower&sort.desc=id`, interactive);
        if (abResp.ok) {
            const bakerRows = await abResp.json();
            if (!Array.isArray(bakerRows)) throw new Error('Unexpected baker ranking payload');
            allBakers = bakerRows.filter((row) => Number(row.bakingPower || 0) > 0);
            if (!allBakers.length) throw new Error('No funded bakers in ranking payload');
        } else {
            throw new Error(`Baker ranking HTTP ${abResp.status}`);
        }
    } catch {
        allBakers = [];
        allBakersFailed = true;
    }

    // Rank by current baking power, the field used by consensus.
    if (!allBakersFailed) {
        allBakers.sort((a, b) => Number(b.bakingPower || 0) - Number(a.bakingPower || 0));
    }
    const rankIndex = allBakersFailed ? -1 : allBakers.findIndex(b => b.address === bakerAddress);
    const rank = rankIndex >= 0 ? rankIndex + 1 : null;
    const totalBakers = allBakersFailed ? null : allBakers.length;

    // Calculate scores using shared scoring function
    const scores = computeBakerScores(baker, participation);

    // Derive capacity for display. The on-chain external-staker edge is carried
    // from computeBakerScores without treating it as a delegation fee.
    const ownStaked = baker.stakedBalance || baker.balance || 0;
    const limitMultiplier = baker.limitOfStakingOverBaking != null
        ? baker.limitOfStakingOverBaking / 1_000_000
        : 0;
    const maxExternalStaked = ownStaked * limitMultiplier;
    const externalStaked = baker.externalStakedBalance || 0;
    const usedPct = maxExternalStaked > 0 ? (externalStaked / maxExternalStaked) * 100 : (limitMultiplier === 0 ? 100 : 0);
    const hasTz4 = baker.address?.startsWith('tz4') || baker.consensusAddress?.startsWith('tz4');

    return {
        baker,
        participation,
        rank,
        totalBakers,
        scores,
        stats: {
            bakingPower: baker.bakingPower,
            delegators: baker.numDelegators || 0,
            stakers: baker.stakersCount || 0,
            externalStakerEdge: scores.externalStakerEdge,
            uptimePct: scores.uptime,
            usedCapacityPct: usedPct,
            hasTz4,
        }
    };
}

/**
 * Build the report card DOM (for both display and screenshot)
 */
function buildReportCardDOM(report) {
    const { baker, rank, totalBakers, scores, stats } = report;
    const overall = scores.hasParticipation
        ? letterGrade(scores.overall)
        : { grade: '—', color: '#94a3b8' };
    const name = escapeHtml(baker.alias || baker.address.slice(0, 12) + '…');
    const addr = escapeHtml(baker.address.slice(0, 8) + '…' + baker.address.slice(-4));

    const card = document.createElement('div');
    card.style.cssText = `
        width: 680px; padding: 32px 32px 70px; background: #0a0e1a;
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
                    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;">${scores.hasParticipation ? `${scores.overall}/100` : 'Performance unavailable'}</div>
                </div>
            </div>

            <!-- Rank banner -->
            <div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.12);border-radius:8px;padding:10px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:13px;color:rgba(255,255,255,0.6);">Current baking-power rank</span>
                <span style="font-size:18px;font-weight:700;color:#00ff88;">${rank != null ? '#' + rank + ' <span style="font-size:12px;color:rgba(255,255,255,0.3);">of ' + totalBakers + '</span>' : 'N/A'}</span>
            </div>

            <!-- Score bars -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
                ${buildScoreBar('Attestation', scores.uptime, '40%')}
                ${buildScoreBar('Community', scores.growth, '25%')}
                ${buildScoreBar('Capacity', scores.capacity, '25%')}
                ${buildScoreBar('BLS Key (tz4)', scores.tz4, '10%')}
            </div>

            <!-- Stats grid -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
                ${buildStatCell('Baking Power', Number.isFinite(Number(stats.bakingPower)) ? formatMutez(stats.bakingPower) + ' XTZ' : 'Unavailable')}
                ${buildStatCell('Delegators', stats.delegators.toString())}
                ${buildStatCell('Stakers', stats.stakers.toString())}
                ${buildStatCell('External-staker edge', Number.isFinite(stats.externalStakerEdge) ? stats.externalStakerEdge.toFixed(1) + '%' : 'Unavailable')}
                ${buildStatCell('Attest Rate', Number.isFinite(stats.uptimePct) ? stats.uptimePct.toFixed(1) + '%' : 'Unavailable')}
                ${buildStatCell('Capacity Used', stats.usedCapacityPct.toFixed(0) + '%')}
            </div>

            <div style="font-size:10px;line-height:1.5;color:rgba(255,255,255,0.38);">
                External-staker edge is the on-chain share of direct-staking rewards retained by the baker. Delegation payout policy is off-chain and is not scored here.
                This profile grade combines the displayed source metrics; it is not a delegation recommendation.
            </div>

        </div>
    `;

    return card;
}

function buildScoreBar(label, score, weight) {
    if (!Number.isFinite(score)) {
        return `
        <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px 12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:11px;color:rgba(255,255,255,0.5);">${label} <span style="color:rgba(255,255,255,0.2);">(${weight})</span></span>
                <span style="font-size:11px;font-weight:700;color:#94a3b8;">Unavailable</span>
            </div>
            <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;"></div>
        </div>`;
    }
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
    overlay.innerHTML = '<div role="status" style="color:#00ff88;font-size:16px;"><span data-text-pending="true">Generating report card…</span></div>';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    try {
        const report = await fetchBakerReport(bakerAddress);
        const card = buildReportCardDOM(report);
        appendCardSeal(card);

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
        const rankText = report.rank != null && report.totalBakers != null
            ? `current baking-power rank #${report.rank} of ${report.totalBakers}`
            : 'current baking-power rank unavailable';
        const externalStakerEdgeText = Number.isFinite(report.stats.externalStakerEdge)
            ? `${report.stats.externalStakerEdge.toFixed(1)}%`
            : 'unavailable';
        const tweetOptions = report.scores.hasParticipation
            ? (() => {
                const grade = letterGrade(report.scores.overall).grade;
                return [
                    { label: '📋 Report Card', text: `${name} scores ${grade} on their source-metric Baker Report Card — ${rankText} among active bakers on Tezos.\n\nThe grade uses attestation, community, capacity, and consensus-key inputs. tezos.systems` },
                    { label: '📊 Source metrics', text: `Baker Report Card: ${name}\nProfile grade: ${grade} | ${rankText}\nAttestation rate: ${report.stats.uptimePct.toFixed(1)}% | External-staker edge: ${externalStakerEdgeText}\n\nDelegation payout policy is off-chain and is not scored.\ntezos.systems` },
                    { label: '🏆 Compare', text: `How does your Tezos baker compare? ${name} earned a ${grade} from displayed attestation, community, capacity, and consensus-key inputs. The external-staker edge is shown separately.\n\ntezos.systems` },
                ];
            })()
            : [
                { label: '📋 Incomplete report', text: `Baker Report Card: ${name} · ${rankText}.\n\nRecent participation data was unavailable, so Tezos Systems did not invent an attestation score or grade.\ntezos.systems` },
                { label: '🔎 Inspect metrics', text: `${name}'s community, capacity, consensus-key, and external-staker edge metrics are available, but the profile grade is withheld until participation data loads. Delegation payout policy is off-chain.\n\ntezos.systems` },
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
        // My Tezos owns the button inside its quietly refreshed grade card.
        if (document.getElementById('drawer-baker')) return;
        const section = document.getElementById('my-baker-section');
        if (!section) return;

        // Keep the control synchronized when the saved account changes roles.
        const grid = section.querySelector('.my-baker-grid');
        const existingBtn = section.querySelector('.report-card-btn');
        if (!grid) {
            existingBtn?.remove();
            return;
        }

        const address = localStorage.getItem('tezos-systems-my-baker-address');
        if (!address) {
            existingBtn?.remove();
            return;
        }

        // Check if this is a baker (look for "Staking Power" stat which only bakers have)
        const stats = grid.querySelectorAll('.my-baker-stat-label');
        let isBaker = false;
        stats.forEach(s => { if (s.textContent === 'Staking Power') isBaker = true; });

        // Also check delegate address for non-baker users
        let bakerAddr = null;
        const delegateEl = grid.querySelector('.my-baker-stat-value[title]');
        if (isBaker) {
            bakerAddr = address;
        } else if (delegateEl?.title) {
            bakerAddr = delegateEl.title;
        }

        if (!bakerAddr) {
            existingBtn?.remove();
            return;
        }
        if (existingBtn) return;

        const btn = document.createElement('button');
        btn.className = 'report-card-btn glass-button';
        btn.innerHTML = '📋 <span class="dropdown-label">Baker Report Card</span>';
        btn.title = 'Generate shareable baker report card';
        btn.style.cssText = 'margin-top:8px;width:auto;padding:10px 20px;gap:8px;display:inline-flex;align-items:center;font-size:0.85rem;';
        btn.addEventListener('click', () => {
            // Derive baker address fresh from DOM to avoid stale closure
            const curGrid = section.querySelector('.my-baker-grid');
            const curLabels = curGrid ? curGrid.querySelectorAll('.my-baker-stat-label') : [];
            let curIsBaker = false;
            curLabels.forEach(s => { if (s.textContent === 'Staking Power') curIsBaker = true; });
            let addr = curIsBaker
                ? localStorage.getItem('tezos-systems-my-baker-address')
                : null;
            if (!addr && curGrid) {
                const del = curGrid.querySelector('.my-baker-stat-value[title]');
                if (del?.title) addr = del.title;
            }
            if (addr) showBakerReportCard(addr);
        });

        // Insert into drawer-baker before the results grid
        const results = section.querySelector('#my-baker-results');
        if (results) {
            results.parentNode.insertBefore(btn, results);
        } else {
            const controls = section.querySelector('.my-baker-controls');
            if (controls) {
                controls.after(btn);
            } else {
                grid.after(btn);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}
