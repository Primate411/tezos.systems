/**
 * The Chamber — Tezos Governance War Room
 * Full-screen governance modal with live voting data, baker heatmap,
 * vote momentum sparklines, and 5-stage pipeline visualization.
 * 
 * v2: Staggered animations, epoch navigation, treemap heatmap,
 *     vote projection, ambient war room effects, historical comparison,
 *     upgraded entry card with live mini-status.
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

const PROTO_MAP = {
    PtTALLiN: { name: 'Tallinn', num: 24 },
    PtSeoul: { name: 'Seoul', num: 23 },
    PtRiyadh: { name: 'Riyadh', num: 22 },
    PtQuebeC: { name: 'Quebec', num: 21 },
    PtParisCQ: { name: 'Paris C', num: 20 },
    PtParisBx: { name: 'Paris B', num: 19 },
    Proxford: { name: 'Oxford', num: 18 },
    PtNairobi: { name: 'Nairobi', num: 17 },
    PtMumbai2: { name: 'Mumbai', num: 16 },
    PtLimaPt: { name: 'Lima', num: 15 },
    PtKathma: { name: 'Kathmandu', num: 14 },
    PtJakart: { name: 'Jakarta', num: 13 },
    Psithaca: { name: 'Ithaca', num: 12 },
    PtHangz2: { name: 'Hangzhou', num: 11 },
    PtGRANAD: { name: 'Granada', num: 10 },
    PsFLoren: { name: 'Florence', num: 9 },
    PtEdoTez: { name: 'Edo', num: 8 },
    PsDELPH1: { name: 'Delphi', num: 7 },
    PsCARTHA: { name: 'Carthage', num: 6 },
    PsBabyM1: { name: 'Babylon', num: 5 },
    PsBABY11: { name: 'Babylon', num: 5 },
    Pt24m4xi: { name: 'Athens', num: 4 },
};

let _chamberCache = {};
let _chamberCacheTime = {};
const CACHE_TTL = 60000;
let _currentEpochIndex = null;
let _latestEpochIndex = null;
let _earliestEpochIndex = 1;
let _chamberAnimFrame = null;

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

async function fetchChamberData(epochIndex) {
    if (epochIndex && _chamberCache[epochIndex] && (Date.now() - _chamberCacheTime[epochIndex]) < CACHE_TTL) {
        return _chamberCache[epochIndex];
    }
    
    try {
        if (!epochIndex) {
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
                _latestEpochIndex = epochs[0]?.index || 83;
                const lastComplete = epochs.find(e => e.status === 'completed');
                activeEpoch = lastComplete ? lastComplete.index : 83;
            } else {
                _latestEpochIndex = activeEpoch;
            }
            
            epochIndex = activeEpoch;
            const data = await fetchEpochData(epochIndex);
            data.isLive = isLive;
            data.currentPeriod = currentPeriod;
            
            _chamberCache[epochIndex] = data;
            _chamberCacheTime[epochIndex] = Date.now();
            _currentEpochIndex = epochIndex;
            return data;
        }
        
        const data = await fetchEpochData(epochIndex);
        data.isLive = false;
        data.currentPeriod = null;
        
        _chamberCache[epochIndex] = data;
        _chamberCacheTime[epochIndex] = Date.now();
        _currentEpochIndex = epochIndex;
        return data;
    } catch (err) {
        console.error('Chamber: fetch failed', err);
        return null;
    }
}

async function fetchRecentEpochs(count = 5) {
    try {
        const epochs = await (await fetch(`${TZKT}/voting/epochs?sort.desc=id&limit=${count}`)).json();
        return epochs;
    } catch { return []; }
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

function extractProtoName(hash) {
    for (const [k, v] of Object.entries(PROTO_MAP)) {
        if (hash.startsWith(k)) return v.name;
    }
    return hash.slice(0, 12) + '…';
}

// ─── Pipeline with staggered animation ───

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
        
        const delay = i * 120;
        
        return `
            <div class="chamber-stage ${stateClass} chamber-anim-fade" data-stage="${stage.key}" style="animation-delay:${delay}ms">
                <div class="stage-icon">${stage.icon}</div>
                <div class="stage-label">${stage.label}</div>
                <div class="stage-status">${statusText}</div>
                ${stateClass === 'active' && isLive ? '<div class="stage-pulse"></div>' : ''}
            </div>
            ${i < STAGES.length - 1 ? `<div class="stage-connector ${stateClass === 'completed' ? 'completed' : ''} chamber-anim-fade" style="animation-delay:${delay + 60}ms"><div class="connector-fill"></div></div>` : ''}
        `;
    }).join('');
}

// ─── Supermajority gauge with sweep animation ───

function renderSupermajorityGauge(period) {
    const pct = calcSupermajority(period);
    if (pct === null) return '<div class="chamber-gauge-empty">No vote data</div>';
    
    const yay = period.yayVotingPower || 0;
    const nay = period.nayVotingPower || 0;
    const pass = period.passVotingPower || 0;
    const threshold = 80;
    const passed = pct >= threshold;
    
    const radius = 80, cx = 100, cy = 100;
    const startAngle = -180;
    
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
    const arcLength = (Math.abs(valAngle - startAngle) / 180) * Math.PI * radius;
    
    return `
        <div class="chamber-gauge chamber-anim-fade" style="animation-delay:200ms">
            <svg viewBox="0 0 200 115" class="gauge-svg">
                <path d="${arc(startAngle, 0)}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14" stroke-linecap="round"/>
                <path d="${arc(startAngle, valAngle)}" fill="none" stroke="${passed ? 'var(--accent-cyan)' : 'var(--accent-pink)'}" stroke-width="14" stroke-linecap="round" class="gauge-arc ${passed ? 'passed' : 'failing'} gauge-sweep" style="stroke-dasharray:${arcLength};stroke-dashoffset:${arcLength}"/>
                <line x1="${thrPos.x}" y1="${thrPos.y - 10}" x2="${thrPos.x}" y2="${thrPos.y + 10}" stroke="var(--accent-purple)" stroke-width="2.5" opacity="0.9"/>
                <text x="${thrPos.x}" y="${thrPos.y - 14}" fill="var(--accent-purple)" font-size="8" text-anchor="middle" font-family="Orbitron, sans-serif" opacity="0.8">80%</text>
            </svg>
            <div class="gauge-center">
                <div class="gauge-value ${passed ? 'passed' : 'failing'}" data-target="${pct.toFixed(1)}">0.0%</div>
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

// ─── Quorum bar ───

function renderQuorumBar(period, voters) {
    const quorum = calcQuorum(period, voters);
    if (quorum === null) return '';
    const required = period.ballotsQuorum || 50;
    const passed = quorum >= required;
    const votedCount = voters.filter(v => v.status !== 'none').length;
    
    return `
        <div class="chamber-quorum chamber-anim-fade" style="animation-delay:400ms">
            <div class="quorum-header">
                <span class="quorum-title">Quorum</span>
                <span class="quorum-value ${passed ? 'passed' : 'failing'}">${quorum.toFixed(1)}% / ${required.toFixed(1)}% required</span>
            </div>
            <div class="quorum-bar-track">
                <div class="quorum-bar-fill ${passed ? 'passed' : 'failing'} quorum-animate" style="width: 0%" data-target-width="${Math.min(quorum, 100)}%"></div>
                <div class="quorum-threshold" style="left: ${required}%"></div>
            </div>
            <div class="quorum-meta">${votedCount} of ${voters.length} bakers voted</div>
            <div class="chamber-tooltip-hint">Minimum participation threshold — enough bakers must vote for the result to count</div>
        </div>
    `;
}

// ─── Treemap heatmap with cascade animation ───

function renderBakerHeatmap(voters) {
    if (!voters?.length) return '';
    const sorted = [...voters].sort((a, b) => b.votingPower - a.votingPower);
    const top = sorted.slice(0, 50);
    const maxPower = top[0]?.votingPower || 1;
    
    const cells = top.map((v, idx) => {
        const ratio = v.votingPower / maxPower;
        const sqrtRatio = Math.sqrt(ratio);
        const size = Math.max(18, Math.round(sqrtRatio * 64));
        let colorClass = 'not-voted';
        if (v.status === 'voted_yay') colorClass = 'voted-yay';
        else if (v.status === 'voted_nay') colorClass = 'voted-nay';
        else if (v.status === 'voted_pass') colorClass = 'voted-pass';
        const name = v.delegate.alias || v.delegate.address.slice(0, 8) + '…';
        const delay = 300 + idx * 30;
        
        return `<div class="heatmap-cell ${colorClass} heatmap-cascade" style="width:${size}px;height:${size}px;animation-delay:${delay}ms" title="${name}: ${fmtPower(v.votingPower)} ꜩ — ${v.status === 'none' ? 'NOT VOTED' : v.status.replace('voted_', '').toUpperCase()}">
            ${size >= 32 ? `<span class="heatmap-label">${name.length > 6 ? name.slice(0, 5) + '…' : name}</span>` : ''}
        </div>`;
    }).join('');
    
    const yayCt = top.filter(v => v.status === 'voted_yay').length;
    const nayCt = top.filter(v => v.status === 'voted_nay').length;
    const passCt = top.filter(v => v.status === 'voted_pass').length;
    const noneCt = top.filter(v => v.status === 'none').length;
    
    return `
        <div class="chamber-heatmap chamber-anim-fade" style="animation-delay:300ms">
            <div class="heatmap-title">Baker Consensus Heatmap</div>
            <div class="heatmap-subtitle">Top 50 bakers · Box area = stake power · Color = vote</div>
            <div class="heatmap-scale">Largest: ${fmtPower(sorted[0]?.votingPower || 0)} ꜩ · Smallest shown: ${fmtPower(top[top.length - 1]?.votingPower || 0)} ꜩ</div>
            <div class="heatmap-grid">${cells}</div>
            <div class="heatmap-mobile-summary">
                <span>🟢 ${yayCt}</span>
                <span>🔴 ${nayCt}</span>
                <span>🟡 ${passCt}</span>
                <span>⬜ ${noneCt}</span>
            </div>
            <div class="heatmap-legend">
                <span class="legend-item"><span class="dot voted-yay"></span>Yay</span>
                <span class="legend-item"><span class="dot voted-nay"></span>Nay</span>
                <span class="legend-item"><span class="dot voted-pass"></span>Pass</span>
                <span class="legend-item"><span class="dot not-voted"></span>Not voted</span>
            </div>
        </div>
    `;
}

// ─── Momentum sparkline with projection ───

function renderMomentumSparkline(voters, isLive, votePeriod) {
    if (!voters?.length) return '';
    const voted = voters.filter(v => v.status !== 'none');
    const total = voters.length;
    const totalPower = voters.reduce((s, v) => s + v.votingPower, 0);
    
    const sorted = [...voted].sort((a, b) => b.votingPower - a.votingPower);
    const points = [];
    let cumPower = 0;
    
    for (const v of sorted) {
        cumPower += v.votingPower;
        points.push(cumPower / totalPower * 100);
    }
    
    if (points.length < 2) return '';
    
    const w = 300, h = 60;
    const stepX = w / (points.length - 1);
    const pathD = points.map((y, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(1)} ${(h - y / 100 * h).toFixed(1)}`).join(' ');
    const areaD = pathD + ` L ${((points.length - 1) * stepX).toFixed(1)} ${h} L 0 ${h} Z`;
    
    let pathLen = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = stepX;
        const dy = (points[i] - points[i-1]) / 100 * h;
        pathLen += Math.sqrt(dx * dx + dy * dy);
    }
    
    let projectionHtml = '';
    if (isLive && votePeriod?.endTime) {
        const now = new Date();
        const start = new Date(votePeriod.startTime);
        const end = new Date(votePeriod.endTime);
        const elapsed = now - start;
        const duration = end - start;
        const pctElapsed = Math.min(elapsed / duration, 1);
        
        if (pctElapsed > 0.05 && pctElapsed < 1) {
            const currentParticipation = cumPower / totalPower;
            const projectedParticipation = Math.min(currentParticipation / pctElapsed, 1);
            const projPct = (projectedParticipation * 100).toFixed(1);
            
            const supermajority = calcSupermajority(votePeriod);
            const projStatus = supermajority >= 80 ? 'PASSING' : 'AT RISK';
            const projClass = supermajority >= 80 ? 'proj-passing' : 'proj-risk';
            
            projectionHtml = `
                <div class="chamber-projection ${projClass}">
                    <span class="proj-label">⚡ Projected</span>
                    <span class="proj-value">${projStatus}</span>
                    <span class="proj-detail">${projPct}% participation by period end · ${Math.round((1 - pctElapsed) * 100)}% time remaining</span>
                </div>
            `;
        }
    }
    
    return `
        <div class="chamber-momentum chamber-anim-fade" style="animation-delay:500ms">
            <div class="momentum-title">Vote Momentum</div>
            <div class="momentum-subtitle">${voted.length} of ${total} bakers · ${(cumPower / totalPower * 100).toFixed(1)}% of stake</div>
            <svg viewBox="-30 -8 ${w + 35} ${h + 20}" class="momentum-svg" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="momentumGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent-cyan)"/><stop offset="100%" stop-color="transparent"/></linearGradient>
                </defs>
                <text x="-4" y="4" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">100%</text>
                <text x="-4" y="${h/2 + 2}" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">50%</text>
                <text x="-4" y="${h + 2}" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">0%</text>
                <text x="0" y="${h + 12}" fill="var(--text-tertiary, #555)" font-size="7" font-family="JetBrains Mono, monospace">Largest baker</text>
                <text x="${w}" y="${h + 12}" fill="var(--text-tertiary, #555)" font-size="7" text-anchor="end" font-family="JetBrains Mono, monospace">Smallest</text>
                <line x1="0" y1="${h/2}" x2="${w}" y2="${h/2}" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>
                <path d="${areaD}" fill="url(#momentumGrad)" opacity="0.3" class="momentum-area-anim"/>
                <path d="${pathD}" fill="none" stroke="var(--accent-cyan)" stroke-width="2" class="momentum-line-anim" style="stroke-dasharray:${pathLen.toFixed(0)};stroke-dashoffset:${pathLen.toFixed(0)}"/>
            </svg>
            ${projectionHtml}
        </div>
    `;
}

// ─── My Baker ───

function renderMyBakerVote(voters) {
    const myBaker = localStorage.getItem('myBakerAddress');
    if (!myBaker || !voters?.length) {
        return `<div class="chamber-my-baker chamber-anim-fade" style="animation-delay:500ms"><div class="my-baker-prompt"><a href="/#my-baker" class="set-baker-link">Set your baker</a> to track their vote</div></div>`;
    }
    const baker = voters.find(v => v.delegate.address === myBaker);
    if (!baker) return `<div class="chamber-my-baker chamber-anim-fade" style="animation-delay:500ms"><div class="my-baker-status">Baker not in voter list</div></div>`;
    
    const voted = baker.status !== 'none';
    const voteType = baker.status.replace('voted_', '').toUpperCase();
    return `
        <div class="chamber-my-baker ${voted ? 'voted' : 'not-voted'} chamber-anim-fade" style="animation-delay:500ms">
            <div class="my-baker-name">${baker.delegate.alias || baker.delegate.address.slice(0, 12) + '…'}</div>
            <div class="my-baker-badge ${voted ? 'voted' : 'alert'}">${voted ? `✅ Voted ${voteType}` : '⚠️ NOT YET VOTED'}</div>
            <div class="my-baker-power">${fmtPower(baker.votingPower)} ꜩ</div>
            ${!voted ? '<div class="my-baker-cta">Your baker votes on your behalf — your delegated stake carries their decision</div>' : ''}
        </div>
    `;
}

// ─── Top voters table ───

function renderTopVoters(voters) {
    if (!voters?.length) return '';
    const top20 = [...voters].sort((a, b) => b.votingPower - a.votingPower).slice(0, 20);
    
    function buildRows(list) {
        return list.map((v, i) => {
            let icon = '⬜', cls = 'none';
            if (v.status === 'voted_yay') { icon = '🟢'; cls = 'yay'; }
            else if (v.status === 'voted_nay') { icon = '🔴'; cls = 'nay'; }
            else if (v.status === 'voted_pass') { icon = '🟡'; cls = 'pass'; }
            const name = v.delegate.alias || v.delegate.address.slice(0, 12) + '…';
            return `<div class="voter-row"><span class="voter-rank">${i + 1}</span><span class="voter-name" title="${v.delegate.address}">${name}</span><span class="voter-power">${fmtPower(v.votingPower)}</span><span class="voter-vote ${cls}">${icon}</span></div>`;
        }).join('');
    }
    
    const filters = `
        <div class="voters-filters">
            <button class="voter-filter-btn active" data-filter="all">All</button>
            <button class="voter-filter-btn" data-filter="voted_yay">🟢 Yay</button>
            <button class="voter-filter-btn" data-filter="voted_nay">🔴 Nay</button>
            <button class="voter-filter-btn" data-filter="voted_pass">🟡 Pass</button>
            <button class="voter-filter-btn" data-filter="none">⬜ Abstain</button>
        </div>
    `;
    
    const html = `<div class="chamber-voters chamber-anim-fade" style="animation-delay:600ms">
        <div class="voters-title">Top 20 Bakers by Stake</div>
        <div class="chamber-tooltip-hint" style="margin-bottom:8px">All voting data is public on-chain. Baker identities are pseudonymous blockchain addresses.</div>
        ${filters}
        <div class="voters-list" id="chamber-voters-list">${buildRows(top20)}</div>
    </div>`;
    
    window._chamberVoters = voters;
    return html;
}

function initVoterFilters() {
    const container = document.querySelector('.chamber-voters');
    if (!container || !window._chamberVoters) return;
    
    container.querySelectorAll('.voter-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.voter-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filter = btn.dataset.filter;
            const voters = window._chamberVoters;
            let filtered = [...voters].sort((a, b) => b.votingPower - a.votingPower);
            
            if (filter !== 'all') {
                filtered = filtered.filter(v => v.status === filter);
            }
            
            const top = filtered.slice(0, 20);
            const list = document.getElementById('chamber-voters-list');
            if (list) {
                list.innerHTML = top.map((v, i) => {
                    let icon = '⬜', cls = 'none';
                    if (v.status === 'voted_yay') { icon = '🟢'; cls = 'yay'; }
                    else if (v.status === 'voted_nay') { icon = '🔴'; cls = 'nay'; }
                    else if (v.status === 'voted_pass') { icon = '🟡'; cls = 'pass'; }
                    const name = v.delegate.alias || v.delegate.address.slice(0, 12) + '…';
                    return `<div class="voter-row"><span class="voter-rank">${i + 1}</span><span class="voter-name" title="${v.delegate.address}">${name}</span><span class="voter-power">${fmtPower(v.votingPower)}</span><span class="voter-vote ${cls}">${icon}</span></div>`;
                }).join('');
            }
        });
    });
}

// ─── Historical comparison ───

function renderHistoricalComparison(data) {
    if (!data.votePeriod) return '';
    
    const currentPct = calcSupermajority(data.votePeriod);
    if (currentPct === null) return '';
    
    const currentName = data.proposal?.hash ? extractProtoName(data.proposal.hash) : `Epoch ${data.epoch.index}`;
    
    // Known historical supermajority results (promotion period yay/(yay+nay))
    const HISTORICAL = [
        { name: 'Tallinn', epoch: 83, pct: 100.0 },
        { name: 'Seoul', epoch: 80, pct: 100.0 },
        { name: 'Riyadh', epoch: 77, pct: 100.0 },
        { name: 'Quebec', epoch: 74, pct: 100.0 },
        { name: 'Paris B', epoch: 68, pct: 100.0 },
        { name: 'Oxford', epoch: 65, pct: 100.0 },
        { name: 'Nairobi', epoch: 62, pct: 99.9 },
        { name: 'Mumbai', epoch: 56, pct: 99.8 },
        { name: 'Lima', epoch: 50, pct: 97.2 },
        { name: 'Kathmandu', epoch: 47, pct: 92.4 },
        { name: 'Jakarta', epoch: 44, pct: 88.8 },
        { name: 'Ithaca', epoch: 41, pct: 93.5 },
        { name: 'Granada', epoch: 32, pct: 87.1 },
    ];
    
    // Exclude current epoch from comparisons
    // Pick diverse comparisons: skip 100% duplicates, include varied results
    const comparisons = [];
    const seen = new Set();
    for (const h of HISTORICAL) {
        if (h.epoch === data.epoch.index) continue;
        if (comparisons.length >= 4) break;
        // Skip if we already have a 100% and this is also 100%
        if (h.pct >= 99.9 && seen.has(100)) continue;
        if (h.pct >= 99.9) seen.add(100);
        comparisons.push(h);
    }
    if (!comparisons.length) return '';
    
    const allPcts = [{ name: currentName, pct: currentPct }, ...comparisons];
    const highest = allPcts.reduce((a, b) => a.pct > b.pct ? a : b);
    const lowest = comparisons.reduce((a, b) => a.pct < b.pct ? a : b);
    
    let contextLine = '';
    if (currentPct >= 99.9) {
        contextLine = `${currentName}: ${currentPct.toFixed(1)}% — unanimous consensus. Recent upgrades show strong alignment across the baker set.`;
    } else if (currentPct >= 95) {
        contextLine = `${currentName}: ${currentPct.toFixed(1)}% — near-unanimous. For comparison, ${lowest.name} had the tightest recent vote at ${lowest.pct.toFixed(1)}%.`;
    } else if (currentPct >= 80) {
        contextLine = `${currentName}: ${currentPct.toFixed(1)}% — passing but contested. ${highest.name} holds the recent high at ${highest.pct.toFixed(1)}%.`;
    } else {
        contextLine = `${currentName}: ${currentPct.toFixed(1)}% — below supermajority threshold. Most recent upgrades passed with >${lowest.pct.toFixed(0)}%.`;
    }
    
    const bars = comparisons.map(c => `
        <div class="comparison-row">
            <span class="comparison-name">${c.name}</span>
            <div class="comparison-bar-track"><div class="comparison-bar-fill" style="width:${c.pct}%"></div></div>
            <span class="comparison-pct">${c.pct.toFixed(0)}%</span>
        </div>
    `).join('');
    
    return `
        <div class="chamber-comparison chamber-anim-fade" style="animation-delay:700ms">
            <div class="comparison-title">Historical Context</div>
            <div class="comparison-context">${contextLine}</div>
            <div class="comparison-current">
                <span class="comparison-name current">${currentName}</span>
                <div class="comparison-bar-track"><div class="comparison-bar-fill current" style="width:${currentPct}%"></div></div>
                <span class="comparison-pct current">${currentPct.toFixed(0)}%</span>
            </div>
            ${bars}
        </div>
    `;
}

// ─── Epoch navigation ───

function renderEpochNav(epochIndex, isLive) {
    const canPrev = epochIndex > _earliestEpochIndex;
    const canNext = _latestEpochIndex && epochIndex < _latestEpochIndex;
    
    return `
        <div class="chamber-epoch-nav">
            <button class="epoch-nav-btn ${canPrev ? '' : 'disabled'}" id="chamber-prev-epoch" ${canPrev ? '' : 'disabled'}>◀</button>
            <span class="epoch-nav-label">Epoch ${epochIndex}${isLive ? ' · ⚡ LIVE' : ''}</span>
            <button class="epoch-nav-btn ${canNext ? '' : 'disabled'}" id="chamber-next-epoch" ${canNext ? '' : 'disabled'}>▶</button>
        </div>
    `;
}

// ─── Proposal header ───

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
        <div class="chamber-header chamber-anim-fade">
            <div class="chamber-title-row"><h2 class="chamber-title">🏛️ The Chamber</h2>${badge}</div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">${proposalName}</div>
                ${proposalHash ? `<div class="proposal-hash" title="${proposalHash}">${proposalHash.slice(0, 24)}…</div>` : ''}
                ${submitter ? `<div class="proposal-submitter">by <strong>${submitter}</strong>${submitterPower ? ` · ${submitterPower}` : ''}</div>` : ''}
            </div>
            ${renderEpochNav(epoch.index, isLive)}
        </div>
    `;
}

// ─── Ambient war room effects ───

function initAmbientEffects(container) { return; // CSS-only via ::before/::after
    // Scanlines overlay (CSS-only, no canvas needed)
    let scanlines = container.querySelector('.chamber-scanlines');
    if (!scanlines) {
        scanlines = document.createElement('div');
        scanlines.className = 'chamber-scanlines';
        container.appendChild(scanlines);
    }
    
    // CSS particle dots via pseudo-elements + keyframes (no canvas)
    let particleLayer = container.querySelector('.chamber-particle-layer');
    if (!particleLayer) {
        particleLayer = document.createElement('div');
        particleLayer.className = 'chamber-particle-layer';
        container.appendChild(particleLayer);
    }
}

function stopAmbientEffects() {
    // CSS-only effects, nothing to stop
}

// ─── Post-render animation triggers ───

function triggerAnimations() {
    const gaugeArc = document.querySelector('.gauge-sweep');
    if (gaugeArc) {
        requestAnimationFrame(() => {
            gaugeArc.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
            gaugeArc.style.strokeDashoffset = '0';
        });
    }
    
    const gaugeVal = document.querySelector('.gauge-value[data-target]');
    if (gaugeVal) {
        const target = parseFloat(gaugeVal.dataset.target);
        const duration = 1200;
        const start = performance.now();
        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            gaugeVal.textContent = (target * eased).toFixed(1) + '%';
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }
    
    const quorumFill = document.querySelector('.quorum-animate');
    if (quorumFill) {
        const targetWidth = quorumFill.dataset.targetWidth;
        requestAnimationFrame(() => {
            quorumFill.style.transition = 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.5s';
            quorumFill.style.width = targetWidth;
        });
    }
    
    const momentumLine = document.querySelector('.momentum-line-anim');
    if (momentumLine) {
        requestAnimationFrame(() => {
            momentumLine.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.16, 1, 0.3, 1) 0.6s';
            momentumLine.style.strokeDashoffset = '0';
        });
    }
}

// ─── Main render ───

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
                ${renderMomentumSparkline(voters, isLive, votePeriod)}
            </div>
        </div>
        ${renderHistoricalComparison(data)}
        ${renderTopVoters(voters)}
        ` : `
        <div class="chamber-no-votes">
            <div class="no-votes-icon">🏛️</div>
            <div class="no-votes-text">No active vote in this epoch</div>
            <div class="no-votes-sub">The Chamber comes alive during Exploration and Promotion periods</div>
        </div>
        `}
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:800ms">
            <a href="https://tzkt.io/governance" target="_blank" rel="noopener">TzKT Governance →</a>
            <span class="chamber-footer-sep">·</span>
            <a href="https://www.tezosagora.org" target="_blank" rel="noopener">Agora →</a>
            <span class="chamber-footer-sep">·</span>
            <span class="chamber-epoch">Epoch ${epoch.index}</span>
            ${!isLive ? '<span class="chamber-footer-sep">·</span><span class="chamber-historical-note">Showing last completed cycle</span>' : ''}
        </div>
    `;
    
    const content = container.closest('.chamber-content');
    if (content) initAmbientEffects(content);
    
    requestAnimationFrame(() => requestAnimationFrame(triggerAnimations));
}

// ─── Epoch navigation handlers ───

async function navigateEpoch(direction) {
    const newIndex = _currentEpochIndex + direction;
    if (newIndex < _earliestEpochIndex || (_latestEpochIndex && newIndex > _latestEpochIndex)) return;
    
    const body = document.querySelector('.chamber-body');
    if (!body) return;
    
    body.innerHTML = `<div class="chamber-loading"><div class="chamber-loading-text">Loading Epoch ${newIndex}…</div><div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div></div>`;
    
    const data = await fetchChamberData(newIndex);
    if (!data) {
        body.innerHTML = `<div class="chamber-error"><div class="error-icon">⚠️</div><div class="error-title">Epoch ${newIndex} not found</div><button class="chamber-retry-btn" onclick="window._chamberNav(${-direction})">Go back</button></div>`;
        return;
    }
    
    renderChamber(data, body);
    initVoterFilters();
    initEpochNavListeners();
}

function initEpochNavListeners() {
    const prev = document.getElementById('chamber-prev-epoch');
    const next = document.getElementById('chamber-next-epoch');
    if (prev) prev.addEventListener('click', () => navigateEpoch(-1));
    if (next) next.addEventListener('click', () => navigateEpoch(1));
    window._chamberNav = navigateEpoch;
}

// ─── Open / Close ───

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
    
    let data;
    try {
        data = await fetchChamberData();
    } catch (err) {
        console.error('Chamber fetch error:', err);
    }
    if (!data) {
        overlay.querySelector('.chamber-body').innerHTML = `
            <div class="chamber-error">
                <div class="error-icon">⚠️</div>
                <div class="error-title">Couldn't reach governance data</div>
                <div class="error-detail">TzKT API may be temporarily unavailable. Try again in a moment.</div>
                <button class="chamber-retry-btn" onclick="document.getElementById('chamber-modal').classList.remove('active'); document.body.style.overflow=''; setTimeout(() => document.querySelector('.chamber-entry-card')?.click(), 300);">Retry</button>
            </div>
        `;
        return;
    }
    
    renderChamber(data, overlay.querySelector('.chamber-body'));
    initVoterFilters();
    initEpochNavListeners();
    
    window._chamberShareVote = (bakerName, vote) => {
        const text = `My baker ${bakerName} voted ${vote} on the latest Tezos governance proposal 🗳️\n\nTrack live governance at tezos.systems`;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'width=550,height=420');
    };
}

export function closeChamber() {
    stopAmbientEffects();
    const overlay = document.getElementById('chamber-modal');
    if (overlay) { overlay.classList.remove('active'); document.body.style.overflow = ''; }
}

// ─── Entry card with live mini-status ───

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
        card.innerHTML = `
            <div class="card-inner">
                <div class="card-front chamber-entry-front">
                    <h2 class="stat-label">The Chamber</h2>
                    <div class="stat-value chamber-entry-icon">🏛️</div>
                    <p class="stat-description">Enter governance war room</p>
                    <div class="chamber-entry-status" id="chamber-entry-mini"></div>
                </div>
            </div>
        `;
        card.style.cursor = 'pointer';
        card.addEventListener('click', openChamber);
        grid.appendChild(card);
        
        loadEntryCardStatus();
    }
}

async function loadEntryCardStatus() {
    try {
        const mini = document.getElementById('chamber-entry-mini');
        if (!mini) return;
        
        const currentPeriod = await (await fetch(`${TZKT}/voting/periods/current`)).json();
        const isActive = currentPeriod.status === 'active' && currentPeriod.kind !== 'proposal';
        
        if (isActive) {
            const pct = calcSupermajority(currentPeriod);
            const stageName = currentPeriod.kind.charAt(0).toUpperCase() + currentPeriod.kind.slice(1);
            mini.innerHTML = `<span class="entry-live-dot"></span> ${stageName} · ${pct !== null ? pct.toFixed(0) + '% Yay' : 'Active'}`;
            mini.classList.add('live');
        } else {
            mini.innerHTML = 'No active vote';
        }
    } catch {
        // Silent fail
    }
}
