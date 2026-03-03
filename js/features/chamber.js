/**
 * The Chamber — Tezos Governance War Room
 * Full-screen governance modal with live voting data, baker heatmap,
 * vote momentum sparklines, and 5-stage pipeline visualization.
 * 
 * Uses TzKT API for all governance data.
 * Falls back to last complete epoch when no active proposal exists.
 */

const TZKT = 'https://api.tzkt.io/v1';

const STAGES = [
    { key: 'proposal', label: 'Proposal', icon: '📜' },
    { key: 'exploration', label: 'Exploration', icon: '🔍' },
    { key: 'testing', label: 'Cooldown', icon: '⏳' },
    { key: 'promotion', label: 'Promotion', icon: '🗳️' },
    { key: 'adoption', label: 'Adoption', icon: '🚀' }
];

let _chamberData = null;
let _chamberDataTime = 0;
const CACHE_TTL = 60000;

async function fetchEpochData(epochIndex) {
    const epoch = await (await fetch(`${TZKT}/voting/epochs/${epochIndex}`)).json();
    let proposal = epoch.proposals?.[0] || null;
    
    let votePeriod = epoch.periods.find(p => p.kind === 'promotion')
        || epoch.periods.find(p => p.kind === 'exploration');
    
    let voters = [];
    if (votePeriod) {
        voters = await (await fetch(`${TZKT}/voting/periods/${votePeriod.index}/voters?sort.desc=votingPower&limit=250`)).json();
    }
    
    return { epoch, proposal, votePeriod, voters };
}

async function fetchChamberData() {
    if (_chamberData && (Date.now() - _chamberDataTime) < CACHE_TTL) return _chamberData;
    
    try {
        const currentPeriod = await (await fetch(`${TZKT}/voting/periods/current`)).json();
        let activeEpoch = null;
        let isLive = false;
        
        if (currentPeriod.status === 'active' && currentPeriod.kind !== 'proposal') {
            activeEpoch = currentPeriod.epoch;
            isLive = true;
        } else if (currentPeriod.kind === 'proposal' && currentPeriod.proposalsCount > 0) {
            activeEpoch = currentPeriod.epoch;
            isLive = true;
        }
        
        if (!activeEpoch) {
            const epochs = await (await fetch(`${TZKT}/voting/epochs?sort.desc=id&limit=10`)).json();
            const lastComplete = epochs.find(e => e.status === 'completed');
            activeEpoch = lastComplete ? lastComplete.index : 83;
        }
        
        const data = await fetchEpochData(activeEpoch);
        data.isLive = isLive;
        data.currentPeriod = currentPeriod;
        
        _chamberData = data;
        _chamberDataTime = Date.now();
        return data;
    } catch (err) {
        console.error('Chamber: fetch failed', err);
        return null;
    }
}

function fmtPower(mutez) {
    const xtz = mutez / 1e6;
    if (xtz >= 1e6) return `${(xtz / 1e6).toFixed(1)}M`;
    if (xtz >= 1e3) return `${(xtz / 1e3).toFixed(0)}K`;
    return xtz.toFixed(0);
}

function fmtCountdown(endTime) {
    const diff = new Date(endTime) - new Date();
    if (diff <= 0) return 'Ended';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function calcSupermajority(period) {
    if (!period?.yayVotingPower) return null;
    const yay = period.yayVotingPower;
    const nay = period.nayVotingPower || 0;
    const total = yay + nay;
    return total === 0 ? 0 : (yay / total) * 100;
}

function calcQuorum(period, voters) {
    if (!period || !voters) return null;
    const votedPower = voters.filter(v => v.status !== 'none').reduce((s, v) => s + v.votingPower, 0);
    return period.totalVotingPower > 0 ? (votedPower / period.totalVotingPower) * 100 : 0;
}

function renderPipeline(epoch, isLive) {
    const periodMap = {};
    (epoch.periods || []).forEach(p => { periodMap[p.kind] = p; });
    
    return STAGES.map((stage, i) => {
        const period = periodMap[stage.key];
        let stateClass = 'future';
        let statusText = 'Upcoming';
        
        if (period) {
            if (period.status === 'active') {
                stateClass = 'active';
                statusText = isLive ? fmtCountdown(period.endTime) : 'Completed';
                if (period.endTime && isLive) {
                    const end = new Date(period.endTime);
                    const dateStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    statusText += ' · ' + dateStr;
                }
            } else if (period.status === 'success' || period.status === 'no_proposals') {
                stateClass = 'completed';
                statusText = '✓';
            } else if (period.status === 'no_quorum' || period.status === 'no_supermajority') {
                stateClass = 'failed';
                statusText = '✗';
            }
        }
        
        return `
            <div class="chamber-stage ${stateClass}" data-stage="${stage.key}">
                <div class="stage-icon">${stage.icon}</div>
                <div class="stage-label">${stage.label}</div>
                <div class="stage-status">${statusText}</div>
                ${stateClass === 'active' && isLive ? '<div class="stage-pulse"></div>' : ''}
            </div>
            ${i < STAGES.length - 1 ? '<div class="stage-connector ' + (stateClass === 'completed' ? 'completed' : '') + '"><div class="connector-fill"></div></div>' : ''}
        `;
    }).join('');
}

function renderSupermajorityGauge(period) {
    const pct = calcSupermajority(period);
    if (pct === null) return '<div class="chamber-gauge-empty">No vote data</div>';
    
    const yay = period.yayVotingPower || 0;
    const nay = period.nayVotingPower || 0;
    const pass = period.passVotingPower || 0;
    const threshold = 80;
    const passed = pct >= threshold;
    
    const radius = 80, cx = 100, cy = 100;
    const startAngle = -180, endAngle = 0;
    
    function polar(angle) {
        const rad = (angle * Math.PI) / 180;
        return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
    }
    function arc(s, e) {
        const sp = polar(s), ep = polar(e);
        return `M ${sp.x} ${sp.y} A ${radius} ${radius} 0 ${(e - s) > 180 ? 1 : 0} 1 ${ep.x} ${ep.y}`;
    }
    
    const valAngle = startAngle + (pct / 100) * 180;
    const thrAngle = startAngle + (threshold / 100) * 180;
    const thrPos = polar(thrAngle);
    
    return `
        <div class="chamber-gauge">
            <svg viewBox="0 0 200 115" class="gauge-svg">
                <path d="${arc(startAngle, endAngle)}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14" stroke-linecap="round"/>
                <path d="${arc(startAngle, valAngle)}" fill="none" stroke="${passed ? 'var(--accent-cyan)' : 'var(--accent-pink)'}" stroke-width="14" stroke-linecap="round" class="gauge-arc ${passed ? 'passed' : 'failing'}"/>
                <line x1="${thrPos.x}" y1="${thrPos.y - 10}" x2="${thrPos.x}" y2="${thrPos.y + 10}" stroke="var(--accent-purple)" stroke-width="2.5" opacity="0.9"/>
                <text x="${thrPos.x}" y="${thrPos.y - 14}" fill="var(--accent-purple)" font-size="8" text-anchor="middle" font-family="Orbitron, sans-serif" opacity="0.8">80%</text>
            </svg>
            <div class="gauge-center">
                <div class="gauge-value ${passed ? 'passed' : 'failing'}">${pct.toFixed(1)}%</div>
                <div class="gauge-sublabel">Supermajority</div>
            </div>
            <div class="gauge-legend">
                <span class="legend-yay">🟢 YAY ${fmtPower(yay)}</span>
                <span class="legend-nay">🔴 NAY ${fmtPower(nay)}</span>
                <span class="legend-pass">🟡 PASS ${fmtPower(pass)}</span>
            </div>
            <div class="chamber-tooltip-hint">80% of voting stake must vote Yay (excluding Pass) for the proposal to advance</div>
        </div>
    `;
}

function renderQuorumBar(period, voters) {
    const quorum = calcQuorum(period, voters);
    if (quorum === null) return '';
    const required = period.ballotsQuorum || 50;
    const passed = quorum >= required;
    const votedCount = voters.filter(v => v.status !== 'none').length;
    
    return `
        <div class="chamber-quorum">
            <div class="quorum-header">
                <span class="quorum-title">Quorum</span>
                <span class="quorum-value ${passed ? 'passed' : 'failing'}">${quorum.toFixed(1)}% / ${required.toFixed(1)}% required</span>
            </div>
            <div class="quorum-bar-track">
                <div class="quorum-bar-fill ${passed ? 'passed' : 'failing'}" style="width: ${Math.min(quorum, 100)}%"></div>
                <div class="quorum-threshold" style="left: ${required}%"></div>
            </div>
            <div class="quorum-meta">${votedCount} of ${voters.length} bakers voted</div>
            <div class="chamber-tooltip-hint">Minimum participation threshold — enough bakers must vote for the result to count</div>
        </div>
    `;
}

function renderBakerHeatmap(voters) {
    if (!voters?.length) return '';
    const sorted = [...voters].sort((a, b) => b.votingPower - a.votingPower);
    const top = sorted.slice(0, 50);
    const maxPower = top[0]?.votingPower || 1;
    
    const cells = top.map(v => {
        const ratio = v.votingPower / maxPower;
        const size = Math.max(24, Math.min(56, ratio * 56));
        let colorClass = 'not-voted';
        if (v.status === 'voted_yay') colorClass = 'voted-yay';
        else if (v.status === 'voted_nay') colorClass = 'voted-nay';
        else if (v.status === 'voted_pass') colorClass = 'voted-pass';
        const name = v.delegate.alias || v.delegate.address.slice(0, 8) + '…';
        
        return `<div class="heatmap-cell ${colorClass}" style="width:${size}px;height:${size}px" title="${name}: ${fmtPower(v.votingPower)} ꜩ — ${v.status === 'none' ? 'NOT VOTED' : v.status.replace('voted_', '').toUpperCase()}">
            <span class="heatmap-label">${name.length > 6 ? name.slice(0, 5) + '…' : name}</span>
        </div>`;
    }).join('');
    
    return `
        <div class="chamber-heatmap">
            <div class="heatmap-title">Baker Consensus Heatmap</div>
            <div class="heatmap-subtitle">Each box = 1 baker · Size = stake weight · Color = how they voted</div>
            <div class="heatmap-scale">Largest: ${fmtPower(sorted[0]?.votingPower || 0)} ꜩ · Smallest shown: ${fmtPower(top[top.length - 1]?.votingPower || 0)} ꜩ</div>
            <div class="heatmap-grid">${cells}</div>
            <div class="heatmap-legend">
                <span class="legend-item"><span class="dot voted-yay"></span>Yay</span>
                <span class="legend-item"><span class="dot voted-nay"></span>Nay</span>
                <span class="legend-item"><span class="dot voted-pass"></span>Pass</span>
                <span class="legend-item"><span class="dot not-voted"></span>Not voted</span>
            </div>
        </div>
    `;
}

function renderMomentumSparkline(voters) {
    if (!voters?.length) return '';
    const voted = voters.filter(v => v.status !== 'none');
    const total = voters.length;
    const sorted = [...voted].sort((a, b) => b.votingPower - a.votingPower);
    const points = [];
    let cumPower = 0;
    const totalPower = voters.reduce((s, v) => s + v.votingPower, 0);
    
    for (const v of sorted) {
        cumPower += v.votingPower;
        points.push(cumPower / totalPower * 100);
    }
    
    if (points.length < 2) return '';
    
    const w = 300, h = 60;
    const stepX = w / (points.length - 1);
    const pathD = points.map((y, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(1)} ${(h - y / 100 * h).toFixed(1)}`).join(' ');
    const areaD = pathD + ` L ${((points.length - 1) * stepX).toFixed(1)} ${h} L 0 ${h} Z`;
    
    return `
        <div class="chamber-momentum">
            <div class="momentum-title">Vote Momentum</div>
            <div class="momentum-subtitle">${voted.length} of ${total} bakers · ${(cumPower / totalPower * 100).toFixed(1)}% of stake</div>
            <svg viewBox="-30 -8 ${w + 35} ${h + 20}" class="momentum-svg" preserveAspectRatio="none">
                <defs><linearGradient id="momentumGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent-cyan)"/><stop offset="100%" stop-color="transparent"/></linearGradient></defs>
                <!-- Y axis labels -->
                <text x="-4" y="4" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">100%</text>
                <text x="-4" y="${h/2 + 2}" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">50%</text>
                <text x="-4" y="${h + 2}" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">0%</text>
                <!-- X axis labels -->
                <text x="0" y="${h + 12}" fill="var(--text-tertiary, #555)" font-size="7" font-family="JetBrains Mono, monospace">First vote</text>
                <text x="${w}" y="${h + 12}" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">Latest</text>
                <!-- Grid lines -->
                <line x1="0" y1="${h/2}" x2="${w}" y2="${h/2}" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>
                <path d="${areaD}" fill="url(#momentumGrad)" opacity="0.3"/>
                <path d="${pathD}" fill="none" stroke="var(--accent-cyan)" stroke-width="2"/>
            </svg>
        </div>
    `;
}

function renderMyBakerVote(voters) {
    const myBaker = localStorage.getItem('myBakerAddress');
    if (!myBaker || !voters?.length) {
        return `<div class="chamber-my-baker"><div class="my-baker-prompt"><a href="/#my-baker" class="set-baker-link">Set your baker</a> to track their vote</div></div>`;
    }
    const baker = voters.find(v => v.delegate.address === myBaker);
    if (!baker) return `<div class="chamber-my-baker"><div class="my-baker-status">Baker not in voter list</div></div>`;
    
    const voted = baker.status !== 'none';
    const voteType = baker.status.replace('voted_', '').toUpperCase();
    return `
        <div class="chamber-my-baker ${voted ? 'voted' : 'not-voted'}">
            <div class="my-baker-name">${baker.delegate.alias || baker.delegate.address.slice(0, 12) + '…'}</div>
            <div class="my-baker-badge ${voted ? 'voted' : 'alert'}">${voted ? `✅ Voted ${voteType}` : '⚠️ NOT YET VOTED'}</div>
            <div class="my-baker-power">${fmtPower(baker.votingPower)} ꜩ</div>
        </div>
    `;
}

function renderTopVoters(voters) {
    if (!voters?.length) return '';
    const top20 = [...voters].sort((a, b) => b.votingPower - a.votingPower).slice(0, 20);
    
    const rows = top20.map((v, i) => {
        let icon = '⬜', cls = 'none';
        if (v.status === 'voted_yay') { icon = '🟢'; cls = 'yay'; }
        else if (v.status === 'voted_nay') { icon = '🔴'; cls = 'nay'; }
        else if (v.status === 'voted_pass') { icon = '🟡'; cls = 'pass'; }
        const name = v.delegate.alias || v.delegate.address.slice(0, 12) + '…';
        return `<div class="voter-row"><span class="voter-rank">${i + 1}</span><span class="voter-name" title="${v.delegate.address}">${name}</span><span class="voter-power">${fmtPower(v.votingPower)}</span><span class="voter-vote ${cls}">${icon}</span></div>`;
    }).join('');
    
    return `<div class="chamber-voters"><div class="voters-title">Top 20 Bakers by Stake</div><div class="chamber-tooltip-hint" style="margin-bottom:8px">All voting data is public on-chain. Baker identities are pseudonymous blockchain addresses.</div><div class="voters-list">${rows}</div></div>`;
}

function extractProtoName(hash) {
    const map = { PtTALLiN: 'Tallinn', PtSeoul: 'Seoul', PtRiyadh: 'Riyadh', PtQuebeC: 'Quebec', PtParisBx: 'Paris', Proxford: 'Oxford', PtNairobi: 'Nairobi', PtMumbai2: 'Mumbai', PtLimaPt: 'Lima', PtKathma: 'Kathmandu' };
    for (const [k, v] of Object.entries(map)) { if (hash.startsWith(k)) return v; }
    return hash.slice(0, 12) + '…';
}

function renderProposalHeader(data) {
    const { epoch, proposal, isLive } = data;
    let proposalName = 'No Active Proposal', proposalHash = '', submitter = '', submitterPower = '';
    
    if (proposal) {
        proposalName = proposal.hash?.startsWith('Pt') ? extractProtoName(proposal.hash) : (proposal.hash?.slice(0, 12) + '…');
        proposalHash = proposal.hash || '';
        submitter = proposal.initiator?.alias || (proposal.initiator?.address?.slice(0, 10) + '…') || '';
        if (proposal.upvotes) submitterPower = `${proposal.upvotes} upvotes`;
    }
    
    const badge = isLive
        ? '<span class="chamber-badge live">⚡ LIVE</span>'
        : '<span class="chamber-badge historical">📁 HISTORICAL</span>';
    
    return `
        <div class="chamber-header">
            <div class="chamber-title-row"><h2 class="chamber-title">🏛️ The Chamber</h2>${badge}</div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">${proposalName}</div>
                ${proposalHash ? `<div class="proposal-hash" title="${proposalHash}">${proposalHash.slice(0, 24)}…</div>` : ''}
                ${submitter ? `<div class="proposal-submitter">by <strong>${submitter}</strong>${submitterPower ? ` · ${submitterPower}` : ''}</div>` : ''}
            </div>
        </div>
    `;
}

export async function openChamber() {
    let overlay = document.getElementById('chamber-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'chamber-modal';
        overlay.className = 'modal-overlay chamber-overlay';
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content">
                <button class="modal-close chamber-close" aria-label="Close">&times;</button>
                <div class="chamber-body">
                    <div class="chamber-loading">
                        <div class="chamber-loading-text">Entering The Chamber…</div>
                        <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        overlay.querySelector('.chamber-close').addEventListener('click', closeChamber);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeChamber(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('active')) closeChamber(); });
    }
    
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    const data = await fetchChamberData();
    if (!data) {
        overlay.querySelector('.chamber-body').innerHTML = '<div class="chamber-error">Failed to load governance data.</div>';
        return;
    }
    
    renderChamber(data, overlay.querySelector('.chamber-body'));
}

export function closeChamber() {
    const overlay = document.getElementById('chamber-modal');
    if (overlay) { overlay.classList.remove('active'); document.body.style.overflow = ''; }
}

function renderChamber(data, container) {
    const { epoch, votePeriod, voters, isLive } = data;
    
    container.innerHTML = `
        ${renderProposalHeader(data)}
        <div class="chamber-pipeline">${renderPipeline(epoch, isLive)}</div>
        ${votePeriod ? `
        <div class="chamber-grid">
            <div class="chamber-col-left">
                ${renderSupermajorityGauge(votePeriod)}
                ${renderQuorumBar(votePeriod, voters)}
                ${renderMyBakerVote(voters)}
            </div>
            <div class="chamber-col-right">
                ${renderBakerHeatmap(voters)}
                ${renderMomentumSparkline(voters)}
            </div>
        </div>
        ${renderTopVoters(voters)}
        ` : `
        <div class="chamber-no-votes">
            <div class="no-votes-icon">🏛️</div>
            <div class="no-votes-text">No active vote in this epoch</div>
            <div class="no-votes-sub">The Chamber comes alive during Exploration and Promotion periods</div>
        </div>
        `}
        <div class="chamber-footer">
            <a href="https://tzkt.io/governance" target="_blank" rel="noopener">TzKT Governance →</a>
            <span class="chamber-footer-sep">·</span>
            <span class="chamber-epoch">Epoch ${epoch.index}</span>
            ${!isLive ? '<span class="chamber-footer-sep">·</span><span class="chamber-historical-note">Showing last completed cycle</span>' : ''}
        </div>
    `;
}

export function initChamber() {
    const govSection = document.getElementById('governance-section');
    if (!govSection) return;
    
    const header = govSection.querySelector('.section-title');
    if (header) {
        header.style.cursor = 'pointer';
        header.title = 'Open The Chamber — Governance War Room';
        header.addEventListener('click', openChamber);
    }
    
    const grid = govSection.querySelector('.stats-grid');
    if (grid) {
        const card = document.createElement('div');
        card.className = 'stat-card chamber-entry-card';
        card.innerHTML = `<div class="card-inner"><div class="card-front chamber-entry-front"><h2 class="stat-label">The Chamber</h2><div class="stat-value chamber-entry-icon">🏛️</div><p class="stat-description">Enter governance war room</p></div></div>`;
        card.style.cursor = 'pointer';
        card.addEventListener('click', openChamber);
        grid.appendChild(card);
    }
}
