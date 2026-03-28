/**
 * State of Tezos — Weekly Snapshot
 * Generates a Bloomberg-terminal-style shareable image summarizing
 * the current state of the Tezos network.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml, formatNumber } from '../core/utils.js';
import { loadHtml2Canvas, showShareModal } from '../ui/share.js';
import { fetchVotingStatus } from '../features/governance.js';
import { fetchSharedStats } from '../core/api.js';

const TZKT = API_URLS.tzkt;
const MAINNET_LAUNCH = new Date('2018-09-17T00:00:00Z');
const SELF_AMENDMENTS = 21;

// Protocol hash prefix → human name (first 8 chars of hash → name)
const PROTO_NAMES = {
    PtTALLiN: 'Tallinn',
    PsSEouLn: 'Seoul',
    PtRioGEA: 'Rio',
    PsQuebec: 'Quebec',
    PsParisc: 'Paris C',
    PsParisC: 'Paris C',
    PtParisB: 'Paris',
    Proxford: 'Oxford',
    PtNairob: 'Nairobi',
    PtMumbai: 'Mumbai',
    PtLimaPt: 'Lima',
    PtKathma: 'Kathmandu',
    PtJakart: 'Jakarta',
    Psithaca: 'Ithaca',
    PtHangz2: 'Hangzhou',
    PtGRANAD: 'Granada',
    PsFLoris: 'Florence',
    PtEdoTez: 'Edo',
    PsDELPH1: 'Delphi',
    PsCARTHA: 'Carthage',
    PsBabyM1: 'Babylon',
    PsddFKi3: 'Athens',
};

// ─── Data Fetching ────────────────────────────────────────────────────────────

/**
 * Gather all data for the snapshot.
 * Reuses localStorage cache where available; falls back gracefully on errors.
 */
async function fetchSnapshotData() {
    const data = {
        blockHeight: '—',
        cycle: '—',
        protocol: '—',
        activeBakers: '—',
        stakingRatio: '—',
        price: '—',
        change7d: 'N/A',
        governanceStatus: '—',
        uptimeDays: Math.floor((Date.now() - MAINNET_LAUNCH.getTime()) / 86400000),
        selfAmendments: SELF_AMENDMENTS,
        timestamp: new Date(),
    };

    // 1. TzKT head — block height, cycle, protocol
    try {
        const headResp = await fetch(`${TZKT}/head`);
        if (headResp.ok) {
            const head = await headResp.json();
            data.blockHeight = head.level?.toLocaleString() ?? '—';
            data.cycle = head.cycle?.toLocaleString() ?? '—';
            // Protocol: extract name and version from hash/protocol string
            // head.protocol is like "PsQubecaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            // head.chain is "main" or "ghostnet". Use alias from chain_id if present.
            if (head.knownLevel !== undefined) {
                // Newer TzKT shape — prefer metadata fields
            }
            // Resolve protocol name from hash prefix map + code from /protocols/current
            const proto = head.protocol || '';
            const prefix = proto.slice(0, 8);
            const knownName = PROTO_NAMES[prefix] || '';
            try {
                const protoResp = await fetch(`${TZKT}/protocols/current`);
                if (protoResp.ok) {
                    const protoData = await protoResp.json();
                    const code = protoData.code != null ? String(protoData.code).padStart(3, '0') : '';
                    const name = knownName || protoData.metadata?.alias || protoData.alias || prefix;
                    data.protocol = code ? `${name} (${code})` : name;
                } else {
                    data.protocol = knownName || prefix;
                }
            } catch {
                data.protocol = knownName || (proto ? proto.slice(2, 10) : '—');
            }
        }
    } catch { /* graceful fallback */ }

    // 2. Active bakers count
    try {
        const bakersResp = await fetch(`${TZKT}/delegates/count?active=true`);
        if (bakersResp.ok) {
            const count = await bakersResp.json();
            data.activeBakers = Number(count).toLocaleString();
        }
    } catch { /* graceful fallback */ }

    // 3. Staking ratio from /statistics/current
    try {
        const stats = await fetchSharedStats();
        if (stats) {
            const total = stats.totalSupply ?? stats.totalBootstrapped ?? 0;
            const staked = stats.totalFrozen ?? stats.frozenDeposits ?? stats.totalStaked ?? 0;
            if (total > 0 && staked > 0) {
                // Values are in mutez — convert to XTZ ratio
                const ratio = (staked / total) * 100;
                data.stakingRatio = `${ratio.toFixed(1)}%`;
            }
        }
    } catch { /* graceful fallback */ }

    // 4. XTZ price from localStorage cache
    try {
        const cached = localStorage.getItem('tezos-systems-price-cache');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.price) {
                data.price = `$${Number(parsed.price).toFixed(4)}`;
            }
        }
    } catch { /* graceful fallback */ }

    // 5. 7-day price change from CoinGecko
    try {
        const cgResp = await fetch(
            'https://api.coingecko.com/api/v3/coins/tezos?localization=false&tickers=false&community_data=false&developer_data=false',
            { signal: AbortSignal.timeout(8000) }
        );
        if (cgResp.ok) {
            const cgData = await cgResp.json();
            const change = cgData?.market_data?.price_change_percentage_7d;
            if (change != null) {
                const sign = change >= 0 ? '+' : '';
                data.change7d = `${sign}${change.toFixed(2)}%`;
                data.change7dRaw = change;
            }
        }
    } catch { /* graceful fallback — keep 'N/A' */ }

    // 6. Governance status
    try {
        const voting = await fetchVotingStatus();
        if (voting && voting.kind) {
            const kindMap = {
                proposal: 'Proposal Period',
                exploration: 'Exploration Vote',
                cooldown: 'Cooldown Period',
                promotion: 'Promotion Vote',
                adoption: 'Adoption Period',
            };
            const label = kindMap[voting.kind] || voting.kind;
            const proposal = voting.epoch?.proposal?.alias || voting.proposal || '';
            data.governanceStatus = proposal ? `${label}: ${proposal}` : label;
        } else {
            data.governanceStatus = 'No active proposal';
        }
    } catch {
        data.governanceStatus = 'No active proposal';
    }

    return data;
}

// ─── DOM Card Builder ─────────────────────────────────────────────────────────

/**
 * Build the Bloomberg-terminal-style card DOM element.
 * All styles are inline for html2canvas compatibility.
 */
function buildSnapshotDOM(data) {
    // Colors
    const BG = '#0a0e1a';
    const GREEN = '#00ff88';
    const CYAN = '#00d4ff';
    const WHITE = '#e0e0e0';
    const DIM = 'rgba(224,224,224,0.45)';
    const BORDER = 'rgba(0,255,136,0.18)';
    const PANEL_BG = 'rgba(0,255,136,0.04)';

    const card = document.createElement('div');
    card.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 1200px;
        height: 630px;
        background: ${BG};
        font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
        color: ${WHITE};
        overflow: hidden;
        box-sizing: border-box;
    `;

    // ── Scanline / grid overlay ──────────────────────────────────────────────
    const scanlines = document.createElement('div');
    scanlines.style.cssText = `
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        pointer-events: none;
        background-image:
            linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px);
        background-size: 40px 40px;
        z-index: 0;
    `;
    card.appendChild(scanlines);

    // ── Glow gradients ───────────────────────────────────────────────────────
    const glow = document.createElement('div');
    glow.style.cssText = `
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        pointer-events: none;
        background:
            radial-gradient(ellipse at 10% 15%, rgba(0,255,136,0.07) 0%, transparent 45%),
            radial-gradient(ellipse at 90% 85%, rgba(0,212,255,0.05) 0%, transparent 45%);
        z-index: 0;
    `;
    card.appendChild(glow);

    // ── Inner border ─────────────────────────────────────────────────────────
    const border = document.createElement('div');
    border.style.cssText = `
        position: absolute;
        top: 10px; left: 10px; right: 10px; bottom: 10px;
        border: 1px solid ${BORDER};
        border-radius: 6px;
        pointer-events: none;
        z-index: 0;
    `;
    card.appendChild(border);

    // ── Content wrapper ──────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.style.cssText = `
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 28px 36px 20px 36px;
        box-sizing: border-box;
    `;

    // ── Header row ───────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 18px;
        padding-bottom: 14px;
        border-bottom: 1px solid ${BORDER};
    `;

    const titleBlock = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.style.cssText = `
        font-size: 32px;
        font-weight: 700;
        color: ${GREEN};
        letter-spacing: 6px;
        text-transform: uppercase;
        line-height: 1;
        margin-bottom: 4px;
    `;
    titleEl.textContent = 'STATE OF TEZOS';

    const subtitleEl = document.createElement('div');
    subtitleEl.style.cssText = `
        font-size: 11px;
        color: ${DIM};
        letter-spacing: 5px;
        text-transform: uppercase;
    `;
    subtitleEl.textContent = 'WEEKLY SNAPSHOT';
    titleBlock.appendChild(titleEl);
    titleBlock.appendChild(subtitleEl);

    // LIVE indicator
    const liveBlock = document.createElement('div');
    liveBlock.style.cssText = `
        display: flex;
        align-items: center;
        gap: 7px;
        margin-top: 4px;
    `;
    const liveDot = document.createElement('div');
    liveDot.style.cssText = `
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: ${GREEN};
        box-shadow: 0 0 8px ${GREEN}, 0 0 16px rgba(0,255,136,0.5);
    `;
    const liveLabel = document.createElement('div');
    liveLabel.style.cssText = `
        font-size: 11px;
        color: ${GREEN};
        letter-spacing: 3px;
        font-weight: 700;
    `;
    liveLabel.textContent = 'LIVE';
    liveBlock.appendChild(liveDot);
    liveBlock.appendChild(liveLabel);

    header.appendChild(titleBlock);
    header.appendChild(liveBlock);
    wrap.appendChild(header);

    // ── Stats grid ───────────────────────────────────────────────────────────
    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 12px;
        flex: 1;
        margin-bottom: 14px;
    `;

    // Helper: create a stat panel
    function statPanel(label, value, accent) {
        const panel = document.createElement('div');
        panel.style.cssText = `
            background: ${PANEL_BG};
            border: 1px solid ${BORDER};
            border-radius: 4px;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;
        const lbl = document.createElement('div');
        lbl.style.cssText = `
            font-size: 9px;
            color: ${accent || GREEN};
            letter-spacing: 3px;
            text-transform: uppercase;
            font-weight: 700;
        `;
        lbl.textContent = label;

        const val = document.createElement('div');
        val.style.cssText = `
            font-size: 20px;
            font-weight: 700;
            color: ${WHITE};
            letter-spacing: 1px;
            line-height: 1.2;
            word-break: break-all;
        `;
        val.textContent = value;

        panel.appendChild(lbl);
        panel.appendChild(val);
        return panel;
    }

    // Determine color for 7d change
    const changeColor = data.change7dRaw == null
        ? DIM
        : data.change7dRaw >= 0 ? GREEN : '#ff4466';

    // ── Column 1: Network ────────────────────────────────────────────────────
    const col1 = document.createElement('div');
    col1.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

    const blockPanel = statPanel('BLOCK HEIGHT', escapeHtml(String(data.blockHeight)));
    const cyclePanel = statPanel('CURRENT CYCLE', escapeHtml(String(data.cycle)));
    const protoPanel = statPanel('PROTOCOL', escapeHtml(String(data.protocol)));

    // Protocol value smaller font if long
    const protoVal = protoPanel.querySelector('div:last-child');
    if (String(data.protocol).length > 14) protoVal.style.fontSize = '15px';

    col1.appendChild(blockPanel);
    col1.appendChild(cyclePanel);
    col1.appendChild(protoPanel);

    // ── Column 2: Staking & Market ───────────────────────────────────────────
    const col2 = document.createElement('div');
    col2.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

    const bakersPanel = statPanel('ACTIVE BAKERS', escapeHtml(String(data.activeBakers)));
    const stakingPanel = statPanel('STAKING RATIO', escapeHtml(String(data.stakingRatio)));
    const pricePanel = statPanel('XTZ PRICE', escapeHtml(String(data.price)));

    // 7d change — attach below price
    const changeRow = document.createElement('div');
    changeRow.style.cssText = `
        font-size: 12px;
        color: ${changeColor};
        font-weight: 600;
        letter-spacing: 1px;
        margin-top: 2px;
    `;
    changeRow.textContent = `7D ${escapeHtml(String(data.change7d))}`;
    pricePanel.appendChild(changeRow);

    col2.appendChild(bakersPanel);
    col2.appendChild(stakingPanel);
    col2.appendChild(pricePanel);

    // ── Column 3: Governance & Milestones ────────────────────────────────────
    const col3 = document.createElement('div');
    col3.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

    const govPanel = statPanel('GOVERNANCE', escapeHtml(String(data.governanceStatus)));
    // Governance value smaller if long
    const govVal = govPanel.querySelector('div:last-child');
    const govStr = String(data.governanceStatus);
    if (govStr.length > 20) govVal.style.fontSize = '13px';
    else if (govStr.length > 14) govVal.style.fontSize = '16px';

    const uptimePanel = statPanel('NETWORK UPTIME', `${escapeHtml(String(data.uptimeDays.toLocaleString()))} DAYS`);
    const amendPanel = statPanel('SELF-AMENDMENTS', escapeHtml(String(data.selfAmendments)));

    // Milestone note
    const milestoneNote = document.createElement('div');
    milestoneNote.style.cssText = `
        font-size: 9px;
        color: ${DIM};
        letter-spacing: 2px;
        margin-top: 3px;
    `;
    milestoneNote.textContent = 'ZERO HARD FORKS';
    amendPanel.appendChild(milestoneNote);

    col3.appendChild(govPanel);
    col3.appendChild(uptimePanel);
    col3.appendChild(amendPanel);

    grid.appendChild(col1);
    grid.appendChild(col2);
    grid.appendChild(col3);
    wrap.appendChild(grid);

    // ── Footer ───────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 10px;
        border-top: 1px solid ${BORDER};
    `;

    const footerLeft = document.createElement('div');
    footerLeft.style.cssText = `
        font-size: 11px;
        color: ${DIM};
        letter-spacing: 2px;
    `;
    footerLeft.textContent = `GENERATED ${data.timestamp.toUTCString().toUpperCase()}`;

    const footerRight = document.createElement('div');
    footerRight.style.cssText = `
        font-size: 13px;
        color: ${GREEN};
        font-weight: 700;
        letter-spacing: 3px;
    `;
    footerRight.textContent = 'TEZOS.SYSTEMS';

    const footerCenter = document.createElement('div');
    footerCenter.style.cssText = `
        font-size: 10px;
        color: ${DIM};
        letter-spacing: 2px;
        text-align: center;
    `;
    footerCenter.textContent = 'POWERED BY TEZ CAPITAL';

    footer.appendChild(footerLeft);
    footer.appendChild(footerCenter);
    footer.appendChild(footerRight);
    wrap.appendChild(footer);

    card.appendChild(wrap);
    return card;
}

// ─── Main Orchestration ───────────────────────────────────────────────────────

/**
 * Fetch data, render the card to PNG, open the share modal.
 */
export async function showStateOfTezos() {
    // Show a loading toast
    const toast = _showToast('Generating snapshot…');

    try {
        const [data] = await Promise.all([
            fetchSnapshotData(),
            loadHtml2Canvas(),
        ]);

        const card = buildSnapshotDOM(data);
        document.body.appendChild(card);

        // Fix word-spacing for html2canvas (imported inline)
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
        const els = card.querySelectorAll('*');
        const origSpacing = [];
        els.forEach(el => {
            origSpacing.push(el.style.wordSpacing);
            if (!el.style.wordSpacing || el.style.wordSpacing === 'normal') {
                el.style.wordSpacing = '3.5px';
            }
        });

        const canvas = await window.html2canvas(card, {
            backgroundColor: '#0a0e1a',
            scale: 2,
            useCORS: true,
            logging: false,
            width: 1200,
            height: 630,
            windowWidth: 1200,
        });

        // Restore spacing & clean up
        els.forEach((el, i) => { el.style.wordSpacing = origSpacing[i]; });
        card.remove();

        toast.remove();

        // Build tweet options
        const cycle = data.cycle;
        const bakers = data.activeBakers;
        const staking = data.stakingRatio;
        const price = data.price;
        const change = data.change7d;
        const proto = data.protocol;
        const amendments = data.selfAmendments;

        const tweetOptions = [
            {
                label: '📊 Stats',
                text: `State of Tezos 📊\n\nCycle ${escapeHtml(String(cycle))} | ${escapeHtml(String(bakers))} bakers | ${escapeHtml(String(staking))} staked\nXTZ: ${escapeHtml(String(price))} (${escapeHtml(String(change))} 7d)\n${amendments} self-amendments. Zero hard forks.\n\ntezos.systems`,
            },
            {
                label: '🔢 Bullets',
                text: `Weekly Tezos snapshot:\n• ${escapeHtml(String(bakers))} active bakers\n• ${escapeHtml(String(staking))} staking ratio\n• Protocol: ${escapeHtml(String(proto))}\n• ${escapeHtml(String(price))} XTZ\n\nThe blockchain that upgrades itself.\ntezos.systems`,
            },
            {
                label: '🏷️ Brief',
                text: `Tezos by the numbers this week 🔢\n\ntezos.systems`,
            },
        ];

        showShareModal(canvas, tweetOptions, 'State of Tezos');

    } catch (err) {
        console.error('[state-of-tezos] Failed:', err);
        toast.remove();
        _showToast('Snapshot failed — check console', 3000, '#ff4466');
    }
}

/**
 * Wire up the button click handler.
 */
export function initStateOfTezos() {
    const btn = document.getElementById('state-of-tezos-btn');
    if (!btn) return;
    btn.addEventListener('click', () => showStateOfTezos());
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _showToast(msg, durationMs = 0, color = '#00ff88') {
    const el = document.createElement('div');
    el.style.cssText = `
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(10,14,26,0.95);
        border: 1px solid ${color};
        color: ${color};
        padding: 10px 22px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 1px;
        z-index: 99999;
        font-family: 'JetBrains Mono', monospace;
    `;
    el.textContent = msg;
    document.body.appendChild(el);
    if (durationMs > 0) setTimeout(() => el.remove(), durationMs);
    return el;
}
