/**
 * Share/Screenshot functionality for tezos.systems
 */

let html2canvasLoaded = false;

// Each stat maps to an array of { label, text(value, change) }
// change: 'up' | 'down' | 'neutral' | ''
const TWEET_OPTIONS = {
    'total-bakers': [
        { label: '📊 Standard', text: (v) => `🧑‍🍳 Tezos has ${v} active bakers securing the network\n\nReal-time stats →` },
        { label: '🔥 Dunk', text: (v) => `${v} independent bakers vs Solana's 1 off-switch. Decentralization isn't a buzzword on Tezos 🧑‍🍳` },
        { label: '💪 Flex', text: (v) => `${v} validators, no foundation permission needed, no $1M hardware. That's what permissionless looks like 🫡` },
        { label: '📢 Recruit', text: (v, c) => c === 'down'
            ? `Baker count is trending down — barrier to entry just got lower. Start baking 🍞\nhttps://docs.tez.capital`
            : `${v} bakers and growing. Join them → https://docs.tez.capital` },
    ],
    'tz4-adoption': [
        { label: '📊 Standard', text: (v) => `🔑 ${v} of Tezos bakers now use tz4/BLS — 63x bandwidth savings\n\nTrack the migration →` },
        { label: '🔥 Dunk', text: (v) => `${v} of Tezos bakers already on BLS signatures. ETH still arguing about account abstraction 💅` },
        { label: '💪 Flex', text: (v) => `${v} tz4/BLS adoption on Tezos. 63× bandwidth savings. The chain upgrades itself AND its bakers upgrade with it 🔑` },
    ],
    'staking-apy': [
        { label: '📊 Standard', text: (v) => `📈 Tezos staking APY: ${v}\n\nStake your XTZ →` },
        { label: '🔥 Dunk', text: (v) => `Tezos staking APY: ${v}. No lockups, no slashing surprises, no "restaking" Ponzi needed 😌` },
        { label: '💪 Flex', text: (v) => `${v} APY just for securing the network. Tezos staking: simple, liquid, no minimum 💰` },
    ],
    'issuance-rate': [
        { label: '📊 Standard', text: (v) => `💰 Tezos issuance rate: ${v}\n\nMonitor in real-time →` },
        { label: '🔥 Dunk', text: (v) => `Tezos issuance: ${v}. Adaptive, voted on by the network. Not decided by a foundation in a group chat 🫠` },
    ],
    'staking-ratio': [
        { label: '📊 Standard', text: (v) => `🔒 ${v} of all XTZ is now staked\n\nNetwork health →` },
        { label: '💪 Flex', text: (v) => `${v} staking ratio. XTZ holders put their money where their mouth is 💪` },
        { label: '🔥 Dunk', text: (v) => `${v} of XTZ staked. No liquid staking derivatives needed — it's native and liquid by default 🧊` },
    ],
    'total-burned': [
        { label: '📊 Standard', text: (v) => `🔥 ${v} XTZ burned forever\n\nDeflationary pressure →` },
        { label: '💪 Flex', text: (v) => `${v} XTZ gone forever. Every smart contract call burns a little. Deflation built into the protocol 🔥` },
    ],
    'total-supply': [
        { label: '📊 Standard', text: (v) => `💎 Total XTZ supply: ${v}\n\nTrack the economy →` },
    ],
    'delegated': [
        { label: '📊 Standard', text: (v) => `🤝 ${v} XTZ delegated to bakers\n\nLiquid staking →` },
        { label: '💪 Flex', text: (v) => `${v} XTZ delegated — fully liquid, no lockup, no wrapper token. Just delegate and earn 🤝` },
    ],
    'cycle-progress': [
        { label: '📊 Standard', text: (v) => `⏱️ Tezos cycle ${v} in progress\n\nWatch it live →` },
    ],
    'proposal': [
        { label: '📊 Standard', text: (v) => `🗳️ Tezos governance: ${v}\n\nSelf-amending blockchain →` },
        { label: '🔥 Dunk', text: (v) => `Tezos governance: ${v}. No hard forks, no dictators, no "rough consensus." Just votes 🗳️` },
    ],
    'voting-period': [
        { label: '📊 Standard', text: (v) => `🗳️ Tezos voting: ${v}\n\nOn-chain governance →` },
    ],
    'participation': [
        { label: '📊 Standard', text: (v) => `✅ ${v} voter participation in Tezos governance\n\nDemocracy on-chain →` },
        { label: '🔥 Dunk', text: (v) => `${v} voter turnout on Tezos. Higher than most national elections and definitely higher than ETH signaling polls 🏛️` },
    ],
    'tx-volume': [
        { label: '📊 Standard', text: (v) => `⚡ ${v} transactions on Tezos in 24h\n\nNetwork activity →` },
        { label: '💪 Flex', text: (v) => `${v} txs in 24h on Tezos. 6-second blocks, sub-cent fees, real finality. Not a testnet 😤` },
    ],
    'contract-calls': [
        { label: '📊 Standard', text: (v) => `📜 ${v} smart contract calls on Tezos in 24h\n\nDApp ecosystem →` },
        { label: '💪 Flex', text: (v) => `${v} contract calls in 24h. Tezos smart contracts: formally verified, battle-tested, and cheap to call 📜` },
    ],
    'funded-accounts': [
        { label: '📊 Standard', text: (v) => `👥 ${v} funded accounts on Tezos\n\nGrowing network →` },
    ],
    'smart-contracts': [
        { label: '📊 Standard', text: (v) => `🔧 ${v} smart contracts deployed on Tezos\n\nBuild on Tezos →` },
    ],
    'tokens': [
        { label: '📊 Standard', text: (v) => `🪙 ${v} tokens on Tezos\n\nExplore the ecosystem →` },
    ],
    'rollups': [
        { label: '📊 Standard', text: (v) => `🚀 ${v} smart rollups on Tezos\n\nL2 scaling →` },
        { label: '🔥 Dunk', text: (v) => `${v} smart rollups on Tezos. Enshrined in the protocol, not bolted on as an afterthought 🚀` },
    ],
};

// Protocol-specific tweet options
const PROTOCOL_TWEET_OPTIONS = [
    { label: '📊 Standard', text: (name, num, headline, total) => `🗳️ #${num} ${name}: "${headline}"\n\nTezos has self-amended ${total} times with zero hard forks.` },
    { label: '🔥 Dunk', text: (name, num, headline, total) => `${total} upgrades. Zero forks. Meanwhile ETH had to literally split the chain to fix a hack 💅\n\nLatest: ${name}` },
    { label: '💪 Flex', text: (name, num, headline, total) => `Upgrade #${num}: ${name}. ${headline}.\n\n${total} self-amendments. No contentious forks. This is what governance looks like 🏛️` },
    { label: '🫡 Governance', text: (name, num, headline, total) => `While other chains debate who gets to push the button, Tezos bakers just voted in upgrade #${num}: ${name} 🗳️` },
];

const TIMELINE_TWEET_OPTIONS = [
    { label: '📊 Standard', text: (total) => `🏛️ ${total} protocol upgrades. Zero hard forks. Tezos governance in action.` },
    { label: '🔥 Dunk', text: (total) => `${total} upgrades. Zero hard forks. Zero foundation vetoes. Meanwhile BTC can't even agree on block size 💀` },
    { label: '💪 Flex', text: (total) => `${total} self-amendments since 2018. Every single one voted on-chain by bakers. No king, no committee, just code and consensus 👑` },
    { label: '🗳️ Democracy', text: (total) => `Imagine a blockchain that upgrades itself ${total} times without splitting in half. You don't have to imagine — it's Tezos 🧬` },
];

const TWEET_SUFFIX = '\n\nhttps://tezos.systems\n\n#Tezos #XTZ';
const DASHBOARD_TWEET = '📊 Real-time Tezos network stats\n\nhttps://tezos.systems\n\n#Tezos #XTZ';

/**
 * Load html2canvas dynamically
 */
async function loadHtml2Canvas() {
    if (html2canvasLoaded) return;
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => {
            html2canvasLoaded = true;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Get change direction from a card's trend arrow
 */
function getCardChange(card) {
    if (!card) return '';
    const trend = card.querySelector('.trend-arrow');
    if (!trend) return '';
    if (trend.classList.contains('up')) return 'up';
    if (trend.classList.contains('down')) return 'down';
    return 'neutral';
}

/**
 * Get all tweet options for a card
 */
function getTweetOptions(card) {
    if (!card) return [{ label: '📊 Standard', text: DASHBOARD_TWEET }];
    const stat = card.getAttribute('data-stat');
    const valueFront = card.querySelector('.stat-value');
    const value = valueFront ? valueFront.textContent.trim() : '';
    const change = getCardChange(card);
    const options = TWEET_OPTIONS[stat];
    if (options && value) {
        return options.map(o => ({ label: o.label, text: o.text(value, change) + TWEET_SUFFIX }));
    }
    const label = card.querySelector('.stat-label');
    const labelText = label ? label.textContent.trim() : 'Tezos stats';
    return [{ label: '📊 Standard', text: `📊 ${labelText}: ${value}\n\nhttps://tezos.systems\n\n#Tezos #XTZ` }];
}

/**
 * Get smart tweet text for a card (first option, backward compat)
 */
function getTweetText(card) {
    return getTweetOptions(card)[0].text;
}

/**
 * Get human-readable card title
 */
function getCardTitle(card) {
    if (!card) return 'Dashboard';
    const label = card.querySelector('.stat-label');
    return label ? label.textContent.trim() : 'Stat';
}

/**
 * Initialize share functionality
 */
export function initShare() {
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', captureAndShare);
    }
    
    // Add per-card share buttons
    addCardShareButtons();
}

/**
 * Add share buttons to all stat cards
 */
function addCardShareButtons() {
    const cards = document.querySelectorAll('.stat-card');
    cards.forEach(card => {
        const btn = document.createElement('button');
        btn.className = 'card-share-btn';
        btn.innerHTML = '📸';
        btn.title = 'Share this stat';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            captureCard(card);
        });
        card.appendChild(btn);
    });
}

/**
 * Capture a single card and show share modal
 */
async function captureCard(card) {
    const btn = card.querySelector('.card-share-btn');
    if (btn) {
        btn.innerHTML = '⏳';
        btn.style.opacity = '1';
    }
    
    try {
        await loadHtml2Canvas();
        
        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const brandColor = isMatrix ? '#00ff00' : '#00d4ff';
        const bgColor = isMatrix ? '#0a0a0a' : '#0a0a0f';
        
        // Read data from the card
        const statLabel = card.querySelector('.stat-label')?.textContent.trim() || '';
        const statValue = card.querySelector('.stat-value')?.textContent.trim() || '';
        const trendEl = card.querySelector('.trend-arrow');
        const trendText = trendEl ? trendEl.textContent.trim() : '';
        const trendClass = trendEl ? (trendEl.classList.contains('up') ? 'up' : trendEl.classList.contains('down') ? 'down' : 'neutral') : '';
        
        // Get section name
        const section = card.closest('.stats-section');
        const sectionName = section?.querySelector('.section-title')?.textContent.trim() || '';
        
        // Try to extract sparkline data from Chart.js
        let sparklineData = null;
        const sparkCanvas = card.querySelector('.sparkline-chart');
        if (sparkCanvas && typeof Chart !== 'undefined') {
            try {
                const chart = Chart.getChart(sparkCanvas);
                if (chart && chart.data.datasets[0]) {
                    sparklineData = chart.data.datasets[0].data.slice();
                }
            } catch (e) { /* Chart.js not available, skip */ }
        }
        
        // Create branded 1200x630 wrapper
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 1200px; height: 630px;
            background: ${bgColor};
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
            color: white;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 0;
        `;
        
        // Background gradients for depth
        const gradient = document.createElement('div');
        gradient.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none;
            background: 
                radial-gradient(ellipse at 30% 20%, ${isMatrix ? 'rgba(0,255,0,0.08)' : 'rgba(0,212,255,0.08)'} 0%, transparent 50%),
                radial-gradient(ellipse at 70% 80%, ${isMatrix ? 'rgba(0,200,0,0.05)' : 'rgba(183,148,246,0.05)'} 0%, transparent 50%),
                radial-gradient(circle at 50% 50%, ${isMatrix ? 'rgba(0,255,0,0.03)' : 'rgba(0,212,255,0.03)'} 0%, transparent 70%);
        `;
        wrapper.appendChild(gradient);
        
        // Inner border glow
        const borderGlow = document.createElement('div');
        borderGlow.style.cssText = `
            position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px;
            border: 1px solid ${isMatrix ? 'rgba(0,255,0,0.15)' : 'rgba(0,212,255,0.15)'};
            border-radius: 12px;
            box-shadow: inset 0 0 30px ${isMatrix ? 'rgba(0,255,0,0.03)' : 'rgba(0,212,255,0.03)'},
                        0 0 15px ${isMatrix ? 'rgba(0,255,0,0.05)' : 'rgba(0,212,255,0.05)'};
            pointer-events: none;
        `;
        wrapper.appendChild(borderGlow);
        
        // Content container
        const content = document.createElement('div');
        content.style.cssText = `
            position: relative; z-index: 1;
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 40px 60px;
            box-sizing: border-box;
        `;
        
        // Title: TEZOS SYSTEMS
        const title = document.createElement('div');
        title.style.cssText = `
            font-family: 'Orbitron', sans-serif;
            font-size: 36px; font-weight: 900;
            color: ${brandColor};
            letter-spacing: 4px;
            text-transform: uppercase;
            text-shadow: 0 0 30px ${isMatrix ? 'rgba(0,255,0,0.5)' : 'rgba(0,212,255,0.5)'},
                         0 0 60px ${isMatrix ? 'rgba(0,255,0,0.3)' : 'rgba(0,212,255,0.3)'},
                         0 0 90px ${isMatrix ? 'rgba(0,255,0,0.1)' : 'rgba(0,212,255,0.1)'};
            margin-bottom: 6px;
        `;
        title.textContent = 'TEZOS SYSTEMS';
        content.appendChild(title);
        
        // Divider line
        const divider = document.createElement('div');
        divider.style.cssText = `
            width: 200px; height: 1px;
            background: linear-gradient(90deg, transparent, ${isMatrix ? 'rgba(0,255,0,0.4)' : 'rgba(0,212,255,0.4)'}, transparent);
            margin: 10px 0 16px 0;
        `;
        content.appendChild(divider);
        
        // Section label
        if (sectionName) {
            const sectionEl = document.createElement('div');
            sectionEl.style.cssText = `
                font-size: 14px; font-weight: 600;
                color: ${isMatrix ? 'rgba(0,255,0,0.4)' : 'rgba(0,212,255,0.4)'};
                text-transform: uppercase;
                letter-spacing: 3px;
                margin-bottom: 20px;
            `;
            sectionEl.textContent = sectionName;
            content.appendChild(sectionEl);
        }
        
        // Stat label
        const labelEl = document.createElement('div');
        labelEl.style.cssText = `
            font-size: 18px; font-weight: 600;
            color: rgba(255,255,255,0.5);
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 12px;
        `;
        labelEl.textContent = statLabel;
        content.appendChild(labelEl);
        
        // HERO stat value
        const valueEl = document.createElement('div');
        valueEl.style.cssText = `
            font-size: 120px; font-weight: 800;
            color: ${brandColor};
            line-height: 1;
            letter-spacing: -2px;
            text-shadow: 0 0 40px ${isMatrix ? 'rgba(0,255,0,0.4)' : 'rgba(0,212,255,0.4)'},
                         0 0 80px ${isMatrix ? 'rgba(0,255,0,0.2)' : 'rgba(0,212,255,0.2)'};
            margin-bottom: 12px;
            text-align: center;
            max-width: 1000px;
            overflow: hidden;
        `;
        // Scale down font for long values
        const valLen = statValue.length;
        if (valLen > 12) {
            valueEl.style.fontSize = '64px';
        } else if (valLen > 8) {
            valueEl.style.fontSize = '80px';
        } else if (valLen > 5) {
            valueEl.style.fontSize = '100px';
        }
        valueEl.textContent = statValue;
        content.appendChild(valueEl);
        
        // Trend indicator
        if (trendText) {
            const trendColors = { up: '#00ff88', down: '#ff4466', neutral: '#666666' };
            const trendBgColors = { up: 'rgba(0,255,136,0.1)', down: 'rgba(255,68,102,0.1)', neutral: 'rgba(255,255,255,0.05)' };
            const trendColor = trendColors[trendClass] || '#666';
            const trendBg = trendBgColors[trendClass] || 'rgba(255,255,255,0.05)';
            const trendElNew = document.createElement('div');
            trendElNew.style.cssText = `
                font-size: 24px; font-weight: 700;
                color: ${trendColor};
                padding: 6px 18px;
                background: ${trendBg};
                border: 1px solid ${trendColor}33;
                border-radius: 8px;
                margin-bottom: 16px;
                letter-spacing: 0.5px;
            `;
            trendElNew.textContent = trendText;
            content.appendChild(trendElNew);
        }
        
        // Sparkline as SVG (or decorative bars)
        const sparkContainer = document.createElement('div');
        sparkContainer.style.cssText = 'width: 400px; height: 50px; margin-bottom: 8px;';
        
        if (sparklineData && sparklineData.length > 1) {
            // Render as inline SVG polyline
            const w = 400, h = 50;
            const nums = sparklineData.map(Number).filter(n => !isNaN(n));
            const min = Math.min(...nums);
            const max = Math.max(...nums);
            const range = max - min || 1;
            const points = nums.map((v, i) => {
                const x = (i / (nums.length - 1)) * w;
                const y = h - ((v - min) / range) * (h - 4) - 2;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            
            const sparkColor = isMatrix ? '#00ff00' : '#00d4ff';
            sparkContainer.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="${sparkColor}" stop-opacity="0.2"/>
                            <stop offset="100%" stop-color="${sparkColor}" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    <polygon points="${(nums.map((v, i) => {
                        const x = (i / (nums.length - 1)) * w;
                        const y = h - ((v - min) / range) * (h - 4) - 2;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(' '))} ${w},${h} 0,${h}" fill="url(#sparkFill)"/>
                    <polyline points="${points}" fill="none" stroke="${sparkColor}" stroke-width="2" stroke-opacity="0.7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
        } else {
            // Decorative bar chart as fallback
            const barCount = 20;
            const sparkColor = isMatrix ? '#00ff00' : '#00d4ff';
            let barsHtml = '';
            for (let i = 0; i < barCount; i++) {
                // Create a wave pattern
                const height = 10 + Math.sin((i / barCount) * Math.PI * 2 + (trendClass === 'up' ? 0.5 : trendClass === 'down' ? 2.5 : 1.5)) * 15 + Math.random() * 8;
                const opacity = 0.15 + (i / barCount) * 0.25;
                barsHtml += `<div style="width: 12px; height: ${height}px; background: ${sparkColor}; opacity: ${opacity}; border-radius: 2px;"></div>`;
            }
            sparkContainer.innerHTML = `<div style="display: flex; align-items: flex-end; justify-content: center; gap: 4px; height: 100%;">${barsHtml}</div>`;
        }
        content.appendChild(sparkContainer);
        
        wrapper.appendChild(content);
        
        // Footer (absolute positioned at bottom)
        const footer = document.createElement('div');
        footer.style.cssText = `
            position: absolute; bottom: 24px; left: 40px; right: 40px;
            display: flex; justify-content: space-between; align-items: center;
            z-index: 1;
        `;
        footer.innerHTML = `
            <span style="font-size: 13px; color: rgba(255,255,255,0.3);">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span style="font-size: 13px; color: rgba(255,255,255,0.35); letter-spacing: 0.5px;">Powered by <span style="color: ${brandColor}; font-weight: 600;">Tez Capital</span></span>
        `;
        wrapper.appendChild(footer);
        
        document.body.appendChild(wrapper);
        
        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor,
            scale: 2,
            useCORS: true,
            logging: false,
            width: 1200,
            height: 630,
            windowWidth: 1200
        });
        
        wrapper.remove();
        
        const options = getTweetOptions(card);
        const cardTitle = getCardTitle(card);
        showShareModal(canvas, options, cardTitle);
        
    } catch (error) {
        console.error('Card screenshot failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '📸';
            btn.style.opacity = '';
        }
    }
}

/**
 * Show section picker modal, then capture selected sections
 */
async function captureAndShare() {
    const sections = [];
    document.querySelectorAll('.stats-section').forEach(sec => {
        const titleEl = sec.querySelector('.section-header .section-title');
        if (titleEl) {
            sections.push({ name: titleEl.textContent.trim(), element: sec });
        }
    });
    
    // Build picker modal
    const existing = document.getElementById('section-picker-modal');
    if (existing) existing.remove();
    
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const accentColor = isMatrix ? '#00ff00' : '#00d4ff';
    
    const modal = document.createElement('div');
    modal.id = 'section-picker-modal';
    modal.className = 'share-modal-overlay';
    modal.innerHTML = `
        <div class="share-modal-content" style="max-width: 420px;">
            <div class="share-modal-header">
                <h3>Select Sections to Capture</h3>
                <button class="share-modal-close">×</button>
            </div>
            <div style="padding: 20px;">
                <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
                    <button id="section-toggle-all" style="background: none; border: 1px solid rgba(255,255,255,0.15); color: ${accentColor}; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: all 0.2s;">Deselect All</button>
                </div>
                <div id="section-checkboxes" style="display: flex; flex-direction: column; gap: 10px;">
                    ${sections.map((s, i) => `
                        <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                            <input type="checkbox" checked data-section-idx="${i}" style="accent-color: ${accentColor}; width: 18px; height: 18px; cursor: pointer;">
                            <span style="color: var(--text-primary); font-size: 0.9rem; font-weight: 500;">${s.name}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div style="padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; gap: 12px;">
                <button id="section-capture-btn" class="share-action-btn" style="flex: 1; background: rgba(${isMatrix ? '0,255,0' : '0,212,255'},0.15); border-color: ${accentColor}; color: ${accentColor}; font-weight: 600;">
                    <span>📸</span> Capture
                </button>
                <button id="section-cancel-btn" class="share-action-btn" style="flex: 0 0 auto;">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('visible'));
    
    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.remove(), 200);
    };
    
    modal.querySelector('.share-modal-close').addEventListener('click', closeModal);
    modal.querySelector('#section-cancel-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    
    // Toggle all
    const toggleBtn = modal.querySelector('#section-toggle-all');
    toggleBtn.addEventListener('click', () => {
        const boxes = modal.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(boxes).every(b => b.checked);
        boxes.forEach(b => b.checked = !allChecked);
        toggleBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    });
    
    // Update toggle text on individual change
    modal.querySelector('#section-checkboxes').addEventListener('change', () => {
        const boxes = modal.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(boxes).every(b => b.checked);
        toggleBtn.textContent = allChecked ? 'Deselect All' : 'Select All';
    });
    
    // Capture button
    modal.querySelector('#section-capture-btn').addEventListener('click', () => {
        const boxes = modal.querySelectorAll('input[type="checkbox"]');
        const selectedIndices = Array.from(boxes).filter(b => b.checked).map(b => parseInt(b.dataset.sectionIdx));
        if (selectedIndices.length === 0) {
            showNotification('Select at least one section.', 'error');
            return;
        }
        const selectedSections = selectedIndices.map(i => sections[i]);
        closeModal();
        doCaptureAndShare(selectedSections);
    });
}

/**
 * Actually capture the dashboard with selected sections
 */
async function doCaptureAndShare(selectedSections) {
    const shareBtn = document.getElementById('share-btn');
    const originalText = shareBtn.innerHTML;
    
    try {
        shareBtn.innerHTML = '<span class="share-icon">⏳</span>';
        shareBtn.disabled = true;
        
        await loadHtml2Canvas();
        
        const elementsToHide = [
            document.querySelector('.header'),
            document.querySelector('.corner-ribbon'),
            document.getElementById('ultra-canvas'),
            document.getElementById('ultra-selector'),
            document.querySelector('.matrix-rain'),
            ...document.querySelectorAll('.card-share-btn')
        ].filter(Boolean);
        
        elementsToHide.forEach(el => el.style.visibility = 'hidden');
        
        const wrapper = document.createElement('div');
        wrapper.id = 'screenshot-wrapper';
        wrapper.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 1200px;
            min-height: 800px;
            background: ${getComputedStyle(document.body).background};
            padding: 30px;
            z-index: -1;
            overflow: hidden;
        `;
        
        const mainContent = document.querySelector('.main-content');
        const clone = mainContent.cloneNode(true);
        clone.style.cssText = 'margin: 0; padding: 0;';
        
        // Remove card share buttons and info buttons from clone
        clone.querySelectorAll('.card-share-btn, .card-info-btn, .card-tooltip').forEach(el => el.remove());
        
        // Remove unselected sections from clone
        const selectedNames = new Set(selectedSections.map(s => s.name));
        clone.querySelectorAll('.stats-section').forEach(sec => {
            const titleEl = sec.querySelector('.section-header .section-title');
            if (titleEl && !selectedNames.has(titleEl.textContent.trim())) {
                sec.remove();
            }
        });
        
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;
        
        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const brandColor = isMatrix ? '#00ff00' : '#00d4ff';
        
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-family: 'Orbitron', sans-serif; font-size: 28px; font-weight: 900; color: ${brandColor}; letter-spacing: 2px; text-transform: uppercase; text-shadow: 0 0 20px ${brandColor}40, 0 0 40px ${brandColor}20;">TEZOS SYSTEMS</span>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <div style="font-size: 14px; color: rgba(255,255,255,0.6);">
                    ${new Date().toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </div>
                <span style="font-size: 13px; color: rgba(255,255,255,0.4); letter-spacing: 0.5px;">Powered by <span style="color: ${brandColor}; font-weight: 600;">Tez Capital</span></span>
            </div>
        `;
        
        wrapper.appendChild(header);
        wrapper.appendChild(clone);
        document.body.appendChild(wrapper);
        
        const canvas = await html2canvas(wrapper, {
            backgroundColor: isMatrix ? '#000000' : '#0a0a0f',
            scale: 2,
            useCORS: true,
            logging: false,
            width: 1200,
            windowWidth: 1200
        });
        
        wrapper.remove();
        elementsToHide.forEach(el => el.style.visibility = '');
        
        showShareModal(canvas, DASHBOARD_TWEET, 'Dashboard');
        
    } catch (error) {
        console.error('Screenshot failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        shareBtn.innerHTML = originalText;
        shareBtn.disabled = false;
    }
}

/**
 * Native share via Web Share API
 */
async function nativeShare(canvas, text) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'tezos-stats.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ text, url: 'https://tezos.systems', files: [file] });
    }
}

/**
 * Show modal with share options
 * tweetTextOrOptions: string (legacy) or array of {label, text}
 */
function showShareModal(canvas, tweetTextOrOptions, title) {
    const existing = document.getElementById('share-modal');
    if (existing) existing.remove();
    
    // Normalize to options array
    const tweetOptions = Array.isArray(tweetTextOrOptions)
        ? tweetTextOrOptions
        : [{ label: '📊 Standard', text: tweetTextOrOptions }];
    
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const accent = isMatrix ? '#00ff00' : '#00d4ff';
    const accentRgb = isMatrix ? '0,255,0' : '0,212,255';
    
    // Check Web Share API support
    const canNativeShare = typeof navigator.canShare === 'function';
    const nativeShareBtn = canNativeShare 
        ? `<button class="share-action-btn" id="share-native"><span>📱</span> Share</button>` 
        : '';
    
    // Build tweet picker HTML
    const pickerHtml = tweetOptions.length > 1 ? `
        <div class="tweet-picker" style="
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            max-height: 200px;
            overflow-y: auto;
        ">
            <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px;
                color: rgba(${accentRgb},0.6); font-weight: 600; margin-bottom: 8px;">
                Choose tweet style
            </div>
            ${tweetOptions.map((opt, i) => `
                <label class="tweet-option" style="
                    display: flex; align-items: flex-start; gap: 10px;
                    padding: 8px 10px; margin-bottom: 4px;
                    background: ${i === 0 ? `rgba(${accentRgb},0.08)` : 'rgba(255,255,255,0.02)'};
                    border: 1px solid ${i === 0 ? `rgba(${accentRgb},0.25)` : 'rgba(255,255,255,0.06)'};
                    border-radius: 8px; cursor: pointer;
                    transition: all 0.2s ease;
                ">
                    <input type="radio" name="tweet-choice" value="${i}" ${i === 0 ? 'checked' : ''}
                        style="accent-color: ${accent}; margin-top: 2px; flex-shrink: 0;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.75rem; font-weight: 600; color: rgba(255,255,255,0.7); margin-bottom: 2px;">
                            ${opt.label}
                        </div>
                        <div style="font-size: 0.68rem; color: rgba(255,255,255,0.4); line-height: 1.4;
                            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${opt.text.split('\n')[0]}
                        </div>
                    </div>
                </label>
            `).join('')}
        </div>
    ` : '';
    
    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.className = 'share-modal-overlay';
    modal.innerHTML = `
        <div class="share-modal-content" style="max-height: 90vh; overflow-y: auto;">
            <div class="share-modal-header">
                <h3>Share: ${title}</h3>
                <button class="share-modal-close">×</button>
            </div>
            <div class="share-modal-preview">
                <img src="${canvas.toDataURL('image/png')}" alt="Snapshot" />
            </div>
            ${pickerHtml}
            <div class="share-modal-actions">
                <button class="share-action-btn" id="share-download">
                    <span>💾</span> Download
                </button>
                <button class="share-action-btn" id="share-copy">
                    <span>📋</span> Copy
                </button>
                <button class="share-action-btn" id="share-twitter">
                    <span>𝕏</span> Post
                </button>
                ${nativeShareBtn}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    requestAnimationFrame(() => {
        modal.classList.add('visible');
    });
    
    // Style tweet option hover/selection
    const styleOptions = () => {
        modal.querySelectorAll('.tweet-option').forEach(label => {
            const radio = label.querySelector('input[type="radio"]');
            if (radio.checked) {
                label.style.background = `rgba(${accentRgb},0.08)`;
                label.style.borderColor = `rgba(${accentRgb},0.25)`;
            } else {
                label.style.background = 'rgba(255,255,255,0.02)';
                label.style.borderColor = 'rgba(255,255,255,0.06)';
            }
        });
    };
    modal.querySelectorAll('.tweet-option').forEach(label => {
        label.addEventListener('change', styleOptions);
        label.addEventListener('mouseenter', () => {
            const radio = label.querySelector('input[type="radio"]');
            if (!radio.checked) label.style.background = `rgba(${accentRgb},0.04)`;
        });
        label.addEventListener('mouseleave', () => styleOptions());
    });
    
    // Helper to get selected tweet text
    const getSelectedTweet = () => {
        const checked = modal.querySelector('input[name="tweet-choice"]:checked');
        const idx = checked ? parseInt(checked.value) : 0;
        return tweetOptions[idx].text;
    };
    
    modal.querySelector('.share-modal-close').addEventListener('click', () => closeShareModal(modal));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeShareModal(modal);
    });
    
    // Download
    modal.querySelector('#share-download').addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `tezos-systems-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showNotification('Image downloaded!', 'success');
    });
    
    // Copy to clipboard
    modal.querySelector('#share-copy').addEventListener('click', async () => {
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            showNotification('Copied to clipboard!', 'success');
        } catch (err) {
            showNotification('Clipboard not supported. Use download instead.', 'error');
        }
    });
    
    // Share on X/Twitter — copy image to clipboard first, then open X
    modal.querySelector('#share-twitter').addEventListener('click', async () => {
        const selectedTweet = getSelectedTweet();
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            showNotification('Image copied! Paste it into your tweet (Ctrl+V / ⌘V)', 'success');
        } catch (err) {
            // Clipboard failed — still open X
        }
        const text = encodeURIComponent(selectedTweet);
        window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
    });
    
    // Native share
    const nativeBtn = modal.querySelector('#share-native');
    if (nativeBtn) {
        nativeBtn.addEventListener('click', async () => {
            try {
                await nativeShare(canvas, getSelectedTweet());
            } catch (err) {
                if (err.name !== 'AbortError') {
                    showNotification('Share failed.', 'error');
                }
            }
        });
    }
}

/**
 * Close share modal
 */
function closeShareModal(modal) {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 200);
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.share-notification');
    if (existing) existing.remove();
    
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const colors = {
        success: isMatrix ? '#00ff00' : '#10b981',
        error: isMatrix ? '#ff0000' : '#ef4444',
        info: isMatrix ? '#00ff00' : '#00d4ff'
    };
    
    const notification = document.createElement('div');
    notification.className = 'share-notification';
    notification.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid ${colors[type]};
        color: ${colors[type]};
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10010;
        opacity: 0;
        transition: all 0.2s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => notification.remove(), 200);
    }, 3000);
}

// ─── Protocol History Share ─────────────────────────────────────────

let protocolDataCache = null;

async function getProtocolData() {
    if (protocolDataCache) return protocolDataCache;
    try {
        const resp = await fetch('protocol-data.json');
        protocolDataCache = await resp.json();
        return protocolDataCache;
    } catch (e) {
        console.error('Failed to load protocol-data.json', e);
        return null;
    }
}

function getThemeColors() {
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const brand = isMatrix ? '#00ff00' : '#00d4ff';
    const bg = isMatrix ? '#0a0a0a' : '#0a0a0f';
    const brandRgb = isMatrix ? '0,255,0' : '0,212,255';
    return { isMatrix, brand, bg, brandRgb };
}

function createBaseWrapper(bg, brandRgb) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: fixed; top: -9999px; left: -9999px;
        width: 1200px; height: 630px;
        background: ${bg};
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
        color: white; overflow: hidden;
        display: flex; flex-direction: column;
        padding: 0;
    `;
    // Background gradients
    const gradient = document.createElement('div');
    gradient.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none;
        background:
            radial-gradient(ellipse at 30% 20%, rgba(${brandRgb},0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(${brandRgb},0.04) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(${brandRgb},0.03) 0%, transparent 70%);
    `;
    wrapper.appendChild(gradient);
    // Border glow
    const border = document.createElement('div');
    border.style.cssText = `
        position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px;
        border: 1px solid rgba(${brandRgb},0.15); border-radius: 12px;
        box-shadow: inset 0 0 30px rgba(${brandRgb},0.03), 0 0 15px rgba(${brandRgb},0.05);
        pointer-events: none;
    `;
    wrapper.appendChild(border);
    return wrapper;
}

function addFooter(wrapper, brand, leftText) {
    const footer = document.createElement('div');
    footer.style.cssText = `
        position: absolute; bottom: 24px; left: 40px; right: 40px;
        display: flex; justify-content: space-between; align-items: center; z-index: 1;
    `;
    footer.innerHTML = `
        <span style="font-size: 13px; color: rgba(255,255,255,0.35);">${leftText}</span>
        <span style="font-size: 13px; color: rgba(255,255,255,0.35); letter-spacing: 0.5px;">Powered by <span style="color: ${brand}; font-weight: 600;">Tez Capital</span></span>
    `;
    wrapper.appendChild(footer);
}

/**
 * Capture a single protocol card as a shareable 1200×630 image
 */
export async function captureProtocol(protocol) {
    try {
        await loadHtml2Canvas();
        const { brand, bg, brandRgb } = getThemeColors();
        const data = await getProtocolData();
        const total = data?.meta?.totalUpgrades || 21;

        const wrapper = createBaseWrapper(bg, brandRgb);

        const content = document.createElement('div');
        content.style.cssText = `
            position: relative; z-index: 1;
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            padding: 48px 60px 70px 60px;
            box-sizing: border-box;
        `;

        // Title
        content.innerHTML += `
            <div style="font-family:'Orbitron',sans-serif; font-size:32px; font-weight:900; color:${brand};
                letter-spacing:4px; text-transform:uppercase; margin-bottom:2px;
                text-shadow: 0 0 30px rgba(${brandRgb},0.5), 0 0 60px rgba(${brandRgb},0.3), 0 0 90px rgba(${brandRgb},0.1);">
                TEZOS SYSTEMS
            </div>
            <div style="font-size:13px; font-weight:600; color:rgba(${brandRgb},0.4); text-transform:uppercase;
                letter-spacing:3px; margin-bottom:12px;">PROTOCOL HISTORY</div>
            <div style="width:200px; height:1px; background:linear-gradient(90deg, transparent, rgba(${brandRgb},0.4), transparent); margin-bottom:28px;"></div>
        `;

        // Protocol number + name
        const num = protocol.number - 3; // Athens is #1 (code 4)
        content.innerHTML += `
            <div style="display:flex; align-items:baseline; gap:16px; margin-bottom:8px;">
                <span style="font-family:'Orbitron',sans-serif; font-size:48px; font-weight:900; color:rgba(255,255,255,0.15);">#${num}</span>
                <span style="font-family:'Orbitron',sans-serif; font-size:48px; font-weight:900; color:${brand};
                    text-shadow: 0 0 30px rgba(${brandRgb},0.4);">${protocol.name.toUpperCase()}</span>
            </div>
        `;

        // Date
        const dateStr = new Date(protocol.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        content.innerHTML += `
            <div style="font-size:16px; color:rgba(255,255,255,0.4); margin-bottom:20px;">Activated: ${dateStr}</div>
        `;

        // Headline quote
        content.innerHTML += `
            <div style="font-size:20px; font-style:italic; color:rgba(255,255,255,0.7); margin-bottom:24px;
                padding-left:16px; border-left:3px solid rgba(${brandRgb},0.3);">
                "${protocol.headline}"
            </div>
        `;

        // Key changes
        const changes = (protocol.changes || []).slice(0, 5);
        if (changes.length) {
            let changesHtml = `<div style="font-size:14px; font-weight:700; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">Key Changes</div>`;
            changes.forEach(c => {
                changesHtml += `<div style="font-size:16px; color:rgba(255,255,255,0.65); margin-bottom:6px; padding-left:8px;">• ${c}</div>`;
            });
            content.innerHTML += `<div>${changesHtml}</div>`;
        }

        wrapper.appendChild(content);
        addFooter(wrapper, brand, `${total} upgrades • Zero forks`);
        document.body.appendChild(wrapper);

        const canvas = await html2canvas(wrapper, {
            backgroundColor: bg, scale: 2, useCORS: true, logging: false, width: 1200, height: 630, windowWidth: 1200
        });
        wrapper.remove();

        const suffix = '\n\nhttps://tezos.systems\n\n#Tezos #XTZ #Governance';
        const options = PROTOCOL_TWEET_OPTIONS.map(o => ({
            label: o.label,
            text: o.text(protocol.name, num, protocol.headline, total) + suffix
        }));
        showShareModal(canvas, options, `Protocol #${num}: ${protocol.name}`);
    } catch (error) {
        console.error('Protocol capture failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    }
}

/**
 * Capture the full protocol timeline as a 1200×630 image
 */
export async function captureTimeline(allProtocols) {
    try {
        await loadHtml2Canvas();
        const { brand, bg, brandRgb } = getThemeColors();
        const total = allProtocols.length;

        const wrapper = createBaseWrapper(bg, brandRgb);

        const content = document.createElement('div');
        content.style.cssText = `
            position: relative; z-index: 1;
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 48px 40px 70px 40px;
            box-sizing: border-box;
        `;

        // Title
        content.innerHTML += `
            <div style="font-family:'Orbitron',sans-serif; font-size:30px; font-weight:900; color:${brand};
                letter-spacing:4px; text-transform:uppercase; margin-bottom:8px;
                text-shadow: 0 0 30px rgba(${brandRgb},0.5), 0 0 60px rgba(${brandRgb},0.3), 0 0 90px rgba(${brandRgb},0.1);">
                TEZOS SYSTEMS — PROTOCOL HISTORY
            </div>
            <div style="width:300px; height:1px; background:linear-gradient(90deg, transparent, rgba(${brandRgb},0.4), transparent); margin-bottom:40px;"></div>
        `;

        // Timeline pills
        const pillSize = 40;
        const gap = 6;
        const totalWidth = allProtocols.length * (pillSize + gap) - gap;
        let pillsHtml = `<div style="display:flex; gap:${gap}px; justify-content:center; margin-bottom:12px;">`;
        allProtocols.forEach((p, i) => {
            const isCurrent = i === allProtocols.length - 1;
            pillsHtml += `<div style="
                width:${pillSize}px; height:${pillSize}px; border-radius:50%;
                display:flex; align-items:center; justify-content:center;
                font-family:'Orbitron',sans-serif; font-size:14px; font-weight:900;
                color:${isCurrent ? bg : 'rgba(255,255,255,0.7)'};
                background:${isCurrent ? brand : `rgba(${brandRgb},0.12)`};
                border:1px solid ${isCurrent ? brand : `rgba(${brandRgb},0.25)`};
                ${isCurrent ? `box-shadow: 0 0 15px rgba(${brandRgb},0.5);` : ''}
            ">${p.name[0]}</div>`;
        });
        pillsHtml += '</div>';
        content.innerHTML += pillsHtml;

        // Year markers
        const years = {};
        allProtocols.forEach((p, i) => {
            const yr = "'" + p.date.slice(2, 4);
            if (!years[yr]) years[yr] = i;
        });
        let yearHtml = `<div style="display:flex; position:relative; width:${totalWidth}px; height:20px; margin-bottom:36px;">`;
        for (const [yr, idx] of Object.entries(years)) {
            const left = idx * (pillSize + gap) + pillSize / 2;
            yearHtml += `<span style="position:absolute; left:${left}px; transform:translateX(-50%); font-size:12px; color:rgba(255,255,255,0.3); font-weight:600;">${yr}</span>`;
        }
        yearHtml += '</div>';
        content.innerHTML += yearHtml;

        // Tagline
        content.innerHTML += `
            <div style="font-size:22px; font-weight:700; color:rgba(255,255,255,0.6); letter-spacing:1px;">
                ${total} Self-Amendments • Zero Hard Forks • Since 2018
            </div>
        `;

        wrapper.appendChild(content);
        addFooter(wrapper, brand, new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
        document.body.appendChild(wrapper);

        const canvas = await html2canvas(wrapper, {
            backgroundColor: bg, scale: 2, useCORS: true, logging: false, width: 1200, height: 630, windowWidth: 1200
        });
        wrapper.remove();

        const suffix = '\n\nhttps://tezos.systems\n\n#Tezos #XTZ #Governance';
        const options = TIMELINE_TWEET_OPTIONS.map(o => ({
            label: o.label,
            text: o.text(total) + suffix
        }));
        showShareModal(canvas, options, 'Protocol Timeline');
    } catch (error) {
        console.error('Timeline capture failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    }
}

/**
 * Initialize protocol share buttons on timeline items + timeline share button
 */
export async function initProtocolShare() {
    const data = await getProtocolData();
    if (!data) return;

    const protocols = data.protocols;

    // Wire up per-protocol share on timeline items
    const timelineEl = document.getElementById('upgrade-timeline');
    if (timelineEl) {
        // Use event delegation since timeline items are dynamically rendered
        timelineEl.addEventListener('click', (e) => {
            const item = e.target.closest('.timeline-item');
            if (!item) return;
            const name = item.getAttribute('data-protocol');
            if (!name) return;
            const protocol = protocols.find(p => p.name === name);
            if (protocol) captureProtocol(protocol);
        });
    }

    // Add "Share Timeline" button — to the left of the Zero Forks badge
    const badgesContainer = document.querySelector('.upgrade-badges');
    if (badgesContainer) {
        const btn = document.createElement('button');
        btn.className = 'timeline-share-btn';
        btn.innerHTML = '📤';
        btn.title = 'Share the full protocol timeline';
        btn.style.cssText = `
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.5); width: 36px; height: 36px; border-radius: 8px;
            cursor: pointer; font-size: 16px;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
            opacity: 0; pointer-events: none;
        `;
        btn.addEventListener('mouseenter', () => {
            const c = getThemeColors();
            btn.style.borderColor = c.brand;
            btn.style.color = c.brand;
            btn.style.background = `rgba(${c.brand === '#00d4ff' ? '0,212,255' : '0,255,0'},0.1)`;
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.borderColor = 'rgba(255,255,255,0.1)';
            btn.style.color = 'rgba(255,255,255,0.5)';
            btn.style.background = 'rgba(255,255,255,0.05)';
        });
        btn.addEventListener('click', () => captureTimeline(protocols));
        // Insert before the first badge (Zero Forks)
        badgesContainer.insertBefore(btn, badgesContainer.firstChild);

        // Show/hide on hover over the upgrade clock section
        const clockSection = document.querySelector('.upgrade-clock-content');
        if (clockSection) {
            clockSection.addEventListener('mouseenter', () => {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            });
            clockSection.addEventListener('mouseleave', () => {
                btn.style.opacity = '0';
                btn.style.pointerEvents = 'none';
            });
        }
    }
}
