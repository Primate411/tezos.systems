/**
 * Liquidity Baking Monitor
 * Chamber-style monitor for per-block LB toggle votes and EMA status.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';

const TZKT = API_URLS.tzkt;
const LB_THRESHOLD = 1000000000;
const LB_EMA_DENOMINATOR = 2000000000;
const LB_MODAL_BLOCK_LIMIT = 2500;
const LB_ENTRY_BLOCK_LIMIT = 1;
const LB_LIVE_REFRESH_MS = 8000;
const LB_ENTRY_REFRESH_MS = 60000;
const CACHE_TTL = 60000;
const STORAGE_KEY = 'tezos-systems-my-baker-address';
const LB_OPEN_TEZOS_URL = 'https://opentezos.com/defi/dexs/#liquidity-baking';
const LB_OCTEZ_DOCS_URL = 'https://octez.tezos.com/docs/alpha/liquidity_baking.html';
const LB_PURPLEMATTER_URL = 'https://purplematter.com/lb/';
const LB_PROTOCOL_DATA_URL = '/data/protocol-data.json?v=2';
const LB_LORE_PROTOCOLS = ['Granada', 'Ithaca', 'Jakarta'];

let _lbCache = null;
let _lbCacheTime = 0;
const _bakerVoteCache = new Map();
let _savedBodyOverflow = null;
let _savedHtmlOverflow = null;
let _lbLiveTimer = null;
let _lbRefreshInFlight = false;
let _lbActiveFilter = 'all';
let _lbEntryTimer = null;
let _lbEntryRefreshInFlight = false;
let _lbEntryVisibilityWired = false;
let _lbLoreCache = null;

function formatCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function formatLevel(value) {
    return formatCount(value || 0);
}

function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength = 220) {
    const text = compactText(value);
    if (text.length <= maxLength) return text;
    const boundary = text.lastIndexOf(' ', maxLength - 1);
    return `${text.slice(0, boundary > 80 ? boundary : maxLength - 1).trim()}...`;
}

function renderHelpTooltip({ label, title, body, href = LB_OPEN_TEZOS_URL, linkText = 'Read more' }) {
    const isExternal = !String(href || '').startsWith('#');
    const linkAttrs = isExternal ? ' target="_blank" rel="noopener"' : '';
    return `
        <details class="lb-help">
            <summary class="lb-help-trigger" aria-label="${escapeHtml(label)}">?</summary>
            <div class="lb-help-popover" role="tooltip">
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(body)}</span>
                <a href="${escapeHtml(href)}"${linkAttrs}>${escapeHtml(linkText)} →</a>
            </div>
        </details>
    `;
}

function firstMatchingSection(sections, pattern) {
    return sections.find((section) => pattern.test(`${section.heading || ''} ${section.content || ''}`) && section.content);
}

function formatAge(timestamp) {
    const diff = Date.now() - new Date(timestamp).getTime();
    if (!Number.isFinite(diff) || diff < 0) return 'just now';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ago`;
}

function formatSpan(startTime, endTime) {
    const diff = new Date(endTime).getTime() - new Date(startTime).getTime();
    if (!Number.isFinite(diff) || diff <= 0) return 'n/a';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        return `~${days}d ${hours % 24}h`;
    }
    return `~${hours}h ${minutes}m`;
}

function bakerName(producer) {
    return producer?.alias || `${producer?.address?.slice(0, 6) || 'tz'}...${producer?.address?.slice(-5) || ''}`;
}

function bakerLinks(address, name) {
    const label = name || (address ? `${address.slice(0, 6)}...${address.slice(-5)}` : 'Unknown baker');
    if (!address) {
        return `<span class="lb-baker-name">${escapeHtml(label)}</span>`;
    }
    const encoded = encodeURIComponent(address);
    return `
        <span class="lb-baker-link-wrap" title="${escapeHtml(address)}">
            <a class="lb-baker-name-link" href="#baker=${encoded}" title="Open Tezos.Systems baker profile">${escapeHtml(label)}</a>
            <a class="lb-baker-source-link" href="https://tzkt.io/${encoded}" target="_blank" rel="noopener" title="Open baker on TzKT">TzKT</a>
        </span>
    `;
}

function voteFromToggle(toggle) {
    if (toggle === true) return { key: 'on', label: 'ON', className: 'on', icon: '🟢' };
    if (toggle === false) return { key: 'off', label: 'OFF', className: 'off', icon: '🔴' };
    return { key: 'pass', label: 'PASS', className: 'pass', icon: '⚪' };
}

function emaPct(ema) {
    return Math.max(0, Math.min(100, ((Number(ema) || 0) / LB_EMA_DENOMINATOR) * 100));
}

function subsidyDisabled(ema) {
    return (Number(ema) || 0) >= LB_THRESHOLD;
}

function countVotes(blocks) {
    const counts = { off: 0, on: 0, pass: 0 };
    for (const block of blocks) counts[voteFromToggle(block.lbToggle).key] += 1;
    return counts;
}

function summarizeBakers(blocks) {
    const latestByBaker = new Map();
    for (const block of blocks) {
        const address = block.producer?.address;
        if (!address || latestByBaker.has(address)) continue;
        const vote = voteFromToggle(block.lbToggle);
        latestByBaker.set(address, {
            address,
            name: bakerName(block.producer),
            vote,
            level: block.level,
            timestamp: block.timestamp,
            ema: block.lbToggleEma
        });
    }

    const bakers = [...latestByBaker.values()].sort((a, b) => b.level - a.level);
    const counts = { off: 0, on: 0, pass: 0 };
    for (const baker of bakers) counts[baker.vote.key] += 1;
    return { bakers, counts };
}

function summarizeBlocks(blocks) {
    const latest = blocks[0] || null;
    const oldest = blocks[blocks.length - 1] || null;
    return {
        blocks,
        latest,
        oldest,
        blockCounts: countVotes(blocks),
        bakerSummary: summarizeBakers(blocks),
        timeSpan: latest && oldest ? formatSpan(oldest.timestamp, latest.timestamp) : 'n/a',
        blockRange: latest && oldest ? `${formatLevel(oldest.level)} → ${formatLevel(latest.level)}` : 'n/a',
        emaPct: latest ? emaPct(latest.lbToggleEma) : 0,
        disabled: latest ? subsidyDisabled(latest.lbToggleEma) : false
    };
}

async function fetchBlocks(limit) {
    const url = `${TZKT}/blocks?sort.desc=level&limit=${limit}&select=level,timestamp,producer,lbToggle,lbToggleEma`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        if ((response.status === 429 || response.status === 503 || response.status === 504) && limit > 500) {
            await new Promise((resolve) => setTimeout(resolve, 900));
            return fetchBlocks(Math.max(500, Math.floor(limit / 2)));
        }
        throw new Error(`TzKT blocks HTTP ${response.status}`);
    }
    const blocks = await response.json();
    if (!Array.isArray(blocks)) return [];
    return blocks;
}

async function fetchLiquidityBakingData(limit = LB_MODAL_BLOCK_LIMIT, { force = false } = {}) {
    if (!force && limit === LB_MODAL_BLOCK_LIMIT && _lbCache && Date.now() - _lbCacheTime < CACHE_TTL) {
        return _lbCache;
    }

    const blocks = await fetchBlocks(limit);
    const summary = summarizeBlocks(blocks);
    if (limit === LB_MODAL_BLOCK_LIMIT) {
        _lbCache = summary;
        _lbCacheTime = Date.now();
    }
    return summary;
}

function extractLiquidityBakingLore(protocol) {
    const sections = Array.isArray(protocol?.history?.sections) ? protocol.history.sections : [];
    const lbSection = firstMatchingSection(sections, /Liquidity Baking|LB|escape hatch|toggle vote/i) || sections.find((section) => section.content);
    const whySection = firstMatchingSection(sections, /Why It Matters/i);
    const changes = Array.isArray(protocol?.changes)
        ? protocol.changes.filter((change) => /Liquidity Baking|LB|escape|toggle/i.test(change))
        : [];

    return {
        name: protocol.name,
        date: protocol.date,
        title: protocol.history?.title || protocol.headline || protocol.name,
        subtitle: protocol.history?.subtitle || protocol.debate || '',
        summary: truncateText(lbSection?.content || protocol.debate || protocol.headline, 260),
        why: truncateText(whySection?.content || protocol.debate || '', 240),
        changes
    };
}

async function fetchLiquidityBakingLore() {
    if (_lbLoreCache) return _lbLoreCache;
    const response = await fetch(LB_PROTOCOL_DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Protocol history HTTP ${response.status}`);
    const data = await response.json();
    const protocols = Array.isArray(data?.protocols) ? data.protocols : [];
    _lbLoreCache = LB_LORE_PROTOCOLS
        .map((name) => protocols.find((protocol) => protocol.name === name))
        .filter(Boolean)
        .map(extractLiquidityBakingLore);
    return _lbLoreCache;
}

export async function fetchBakerLiquidityBakingVote(bakerAddress) {
    if (!bakerAddress) return null;
    const cached = _bakerVoteCache.get(bakerAddress);
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.value;

    try {
        const url = `${TZKT}/blocks?sort.desc=level&limit=1&producer=${encodeURIComponent(bakerAddress)}&select=level,timestamp,producer,lbToggle,lbToggleEma`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`TzKT baker blocks HTTP ${response.status}`);
        const blocks = await response.json();
        const block = Array.isArray(blocks) ? blocks[0] : null;
        if (!block) {
            const value = { found: false, label: 'No blocks found', className: 'unknown' };
            _bakerVoteCache.set(bakerAddress, { time: Date.now(), value });
            return value;
        }

        const vote = voteFromToggle(block.lbToggle);
        const value = {
            found: true,
            address: block.producer?.address || bakerAddress,
            name: bakerName(block.producer),
            label: vote.label,
            key: vote.key,
            className: vote.className,
            icon: vote.icon,
            level: block.level,
            timestamp: block.timestamp,
            age: formatAge(block.timestamp),
            ema: block.lbToggleEma,
            emaPct: emaPct(block.lbToggleEma),
            subsidyDisabled: subsidyDisabled(block.lbToggleEma)
        };
        _bakerVoteCache.set(bakerAddress, { time: Date.now(), value });
        return value;
    } catch (err) {
        console.warn('Liquidity Baking baker vote fetch failed', err);
        const value = { found: false, label: 'Unavailable', className: 'unknown', error: true };
        _bakerVoteCache.set(bakerAddress, { time: Date.now(), value });
        return value;
    }
}

function lockPageScroll() {
    if (_savedBodyOverflow !== null) return;
    _savedBodyOverflow = document.body.style.overflow;
    _savedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
}

function unlockPageScroll() {
    if (_savedBodyOverflow === null) return;
    document.body.style.overflow = _savedBodyOverflow || '';
    document.documentElement.style.overflow = _savedHtmlOverflow || '';
    _savedBodyOverflow = null;
    _savedHtmlOverflow = null;
}

function renderVoteBar(label, key, count, total) {
    const pct = total ? (count / total) * 100 : 0;
    return `
        <div class="lb-vote-bar-row lb-${key}" data-lb-vote-bar="${key}">
            <span class="lb-vote-bar-label">${escapeHtml(label)}</span>
            <div class="lb-vote-bar-track"><div class="lb-vote-bar-fill" style="width:${pct.toFixed(2)}%"></div></div>
            <span class="lb-vote-bar-value">${formatCount(count)} <span>${pct.toFixed(1)}%</span></span>
        </div>
    `;
}

function renderLiquidityBakingIntro(data) {
    const stateCopy = data.disabled
        ? 'Current state: the OFF-vote EMA is at or above the 50% disable threshold, so the subsidy is disabled.'
        : 'Current state: the OFF-vote EMA is below the 50% disable threshold, so the subsidy can remain active.';
    return `
        <section class="lb-explainer chamber-anim-fade">
            <div class="lb-explainer-main">
                <div class="lb-explainer-kicker">What is LB?</div>
                <p><strong>Liquidity Baking</strong> is Tezos' protocol-level XTZ/tzBTC liquidity program. Bakers can include a small toggle vote in each block: ON, OFF, or PASS.</p>
                <p>${escapeHtml(stateCopy)}</p>
            </div>
            <div class="lb-explainer-facts" aria-label="Liquidity Baking quick facts">
                <span><strong>Votes</strong> ON / OFF / PASS</span>
                <span><strong>Meter</strong> OFF-vote EMA</span>
                <span><strong>Threshold</strong> 50% disables</span>
            </div>
            <div class="lb-explainer-actions">
                <a href="${LB_OPEN_TEZOS_URL}" target="_blank" rel="noopener">Read OpenTezos →</a>
                <a href="${LB_OCTEZ_DOCS_URL}" target="_blank" rel="noopener">Read Octez docs →</a>
            </div>
        </section>
    `;
}

function renderLoreItem(item) {
    const year = item.date ? new Date(item.date).getUTCFullYear() : '';
    const tags = item.changes.length
        ? `<div class="lb-lore-tags">${item.changes.map((change) => `<span>${escapeHtml(change)}</span>`).join('')}</div>`
        : '';
    const why = item.why
        ? `
            <details class="lb-lore-details">
                <summary>Read protocol-history lore</summary>
                <p>${escapeHtml(item.why)}</p>
            </details>
        `
        : '';
    return `
        <article class="lb-lore-item">
            <div class="lb-lore-marker">
                <span>${escapeHtml(item.name)}</span>
                <small>${escapeHtml(year || item.date || '')}</small>
            </div>
            <div class="lb-lore-content">
                <h3>${escapeHtml(item.title)}</h3>
                <p class="lb-lore-subtitle">${escapeHtml(item.subtitle)}</p>
                <p>${escapeHtml(item.summary)}</p>
                ${tags}
                ${why}
            </div>
        </article>
    `;
}

function renderLiquidityBakingLoreShell() {
    return `
        <section class="lb-panel lb-lore-panel lb-panel-has-help chamber-anim-fade" data-lb-lore-collapsed="true" style="animation-delay:60ms">
            <div class="lb-lore-header">
                <button class="lb-lore-toggle" id="lb-lore-toggle" type="button" aria-expanded="false" aria-controls="lb-lore-body-wrap" aria-label="Expand Protocol History Lore">
                    <span class="lb-lore-arrow" aria-hidden="true"></span>
                    <span class="lb-lore-copy">
                        <span class="lb-lore-heading">Protocol History Lore</span>
                        <span class="lb-lore-compact">Granada -> Ithaca -> Jakarta</span>
                    </span>
                </button>
                ${renderHelpTooltip({
                    label: 'Explain Liquidity Baking protocol history lore',
                    title: 'Where does this lore come from?',
                    body: 'This section reuses the protocol history data for Granada, Ithaca, and Jakarta: the three upgrades that created, extended, and redesigned Liquidity Baking.',
                    href: '#history',
                    linkText: 'Open history'
                })}
            </div>
            <div class="lb-lore-collapsible" id="lb-lore-body-wrap" role="region" aria-labelledby="lb-lore-toggle" hidden>
                <div class="lb-lore-source">Sourced from the curated protocol timeline: Granada -> Ithaca -> Jakarta.</div>
                <div class="lb-lore-timeline" id="lb-lore-body">
                    <div class="lb-lore-loading">Loading protocol-history lore...</div>
                </div>
            </div>
        </section>
    `;
}

function initLiquidityBakingLoreToggle(container) {
    const panel = container.querySelector('.lb-lore-panel');
    const toggle = panel?.querySelector('#lb-lore-toggle');
    const body = panel?.querySelector('#lb-lore-body-wrap');
    if (!panel || !toggle || !body) return;

    const setExpanded = (expanded) => {
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} Protocol History Lore`);
        body.hidden = !expanded;
        panel.classList.toggle('is-open', expanded);
        panel.dataset.lbLoreCollapsed = expanded ? 'false' : 'true';
    };

    setExpanded(false);
    toggle.addEventListener('click', () => {
        setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
    });
}

async function hydrateLiquidityBakingLore(container) {
    const target = container.querySelector('#lb-lore-body');
    if (!target || target.dataset.lbLoreLoaded) return;
    target.dataset.lbLoreLoaded = 'loading';
    try {
        const lore = await fetchLiquidityBakingLore();
        target.dataset.lbLoreLoaded = 'true';
        target.innerHTML = lore.length
            ? lore.map(renderLoreItem).join('')
            : '<div class="lb-lore-loading">No Liquidity Baking protocol-history entries found.</div>';
    } catch (err) {
        console.warn('Liquidity Baking lore load failed', err);
        target.dataset.lbLoreLoaded = 'error';
        target.innerHTML = '<div class="lb-lore-loading">Protocol-history lore is temporarily unavailable.</div>';
    }
}

function renderGlobalMetrics(data) {
    const total = data.blocks.length;
    const counts = data.blockCounts;
    return `
        <section class="lb-panel lb-global-panel lb-panel-has-help chamber-anim-fade">
            <div class="lb-panel-title">
                Global Metrics
                ${renderHelpTooltip({
                    label: 'Explain Liquidity Baking vote sample',
                    title: 'What is being counted?',
                    body: 'This sample counts recent block-level LB toggle votes. It is a live window, not a full historical vote registry.',
                    href: 'https://tzkt.io/blocks',
                    linkText: 'View blocks'
                })}
            </div>
            <div class="lb-metric-grid">
                <div><span>Blocks analyzed</span><strong id="lb-global-blocks">${formatCount(total)}</strong></div>
                <div><span>Time span</span><strong id="lb-global-timespan">${escapeHtml(data.timeSpan)}</strong></div>
                <div><span>Block range</span><strong id="lb-global-range">${escapeHtml(data.blockRange)}</strong></div>
            </div>
            <div class="lb-vote-bars">
                ${renderVoteBar('OFF', 'off', counts.off, total)}
                ${renderVoteBar('ON', 'on', counts.on, total)}
                ${renderVoteBar('PASS', 'pass', counts.pass, total)}
            </div>
        </section>
    `;
}

function renderEmaStatus(data) {
    const pct = data.emaPct;
    const capped = Math.min(100, pct);
    const status = data.disabled ? 'SUBSIDY DISABLED' : 'SUBSIDY ACTIVE';
    const context = data.disabled
        ? 'OFF-vote EMA has reached the 50% disable threshold'
        : 'OFF-vote EMA is below the 50% disable threshold';
    return `
        <section class="lb-panel lb-ema-panel lb-panel-has-help chamber-anim-fade" style="animation-delay:100ms">
            <div class="lb-panel-title">
                EMA Status
                ${renderHelpTooltip({
                    label: 'Explain Liquidity Baking EMA',
                    title: 'What is the EMA?',
                    body: 'OFF votes are smoothed over time into an exponential moving average. At 50% or higher, the protocol disables the subsidy.',
                    href: LB_OCTEZ_DOCS_URL,
                    linkText: 'Read Octez docs'
                })}
            </div>
            <div class="lb-ema-value" id="lb-ema-value">${pct.toFixed(1)}%</div>
            <div class="lb-ema-meta" id="lb-ema-meta">${escapeHtml(context)}</div>
            <div class="lb-ema-meter">
                <span class="lb-ema-threshold" style="left:50%"><span>50% disables</span></span>
                <div class="lb-ema-fill ${data.disabled ? 'disabled' : 'active'}" id="lb-ema-fill" style="width:${capped.toFixed(2)}%"></div>
            </div>
            <div class="lb-status-banner ${data.disabled ? 'disabled' : 'active'}" id="lb-status-banner">${status}</div>
        </section>
    `;
}

function savedBakerSignature(data) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return 'none';
    const match = data.bakerSummary.bakers.find((baker) => baker.address === saved);
    if (!match) return `missing-${saved}-${data.latest?.level || 0}`;
    return `${match.address}-${match.vote.key}-${match.level}`;
}

function renderSavedBaker(data) {
    const saved = localStorage.getItem(STORAGE_KEY);
    const signature = savedBakerSignature(data);
    if (!saved) {
        return `
            <section class="lb-panel lb-saved-baker lb-panel-has-help chamber-anim-fade" data-lb-saved-signature="${escapeHtml(signature)}" style="animation-delay:160ms">
                <div class="lb-panel-title">
                    Your Baker
                    ${renderHelpTooltip({
                        label: 'Explain baker Liquidity Baking vote tracking',
                        title: 'Why set a baker?',
                        body: 'If you save a baker address, this panel highlights that baker latest LB toggle vote from the current block sample.',
                        linkText: 'Read more'
                    })}
                </div>
                <div class="lb-empty-inline"><a href="/#my-baker">Set your baker</a> to track their latest LB vote.</div>
            </section>
        `;
    }

    const match = data.bakerSummary.bakers.find((baker) => baker.address === saved);
    if (!match) {
        return `
            <section class="lb-panel lb-saved-baker lb-panel-has-help chamber-anim-fade" data-lb-saved-signature="${escapeHtml(signature)}" style="animation-delay:160ms">
                <div class="lb-panel-title">
                    Your Baker
                    ${renderHelpTooltip({
                        label: 'Explain baker Liquidity Baking vote tracking',
                        title: 'Why is it missing?',
                        body: 'The monitor only samples recent blocks. A saved baker may not appear if they did not bake inside this live window.',
                        linkText: 'Read more'
                    })}
                </div>
                <div class="lb-empty-inline">Saved address not found in the current ${formatCount(data.blocks.length)}-block sample.</div>
            </section>
        `;
    }

    return `
        <section class="lb-panel lb-saved-baker lb-panel-has-help chamber-anim-fade lb-vote-${match.vote.className}" data-lb-saved-signature="${escapeHtml(signature)}" style="animation-delay:160ms">
            <div class="lb-panel-title">
                Your Baker
                ${renderHelpTooltip({
                    label: 'Explain your baker Liquidity Baking vote',
                    title: 'What does this show?',
                    body: 'This is your saved baker latest LB toggle vote inside the current sample, pulled from the baker most recent block in that window.',
                    linkText: 'Read more'
                })}
            </div>
            <div class="lb-saved-baker-row">
                <div class="lb-baker-cell">${bakerLinks(match.address, match.name)}</div>
                <span class="lb-vote-badge ${match.vote.className}">${match.vote.label}</span>
                <span class="lb-baker-meta">block ${formatLevel(match.level)} · ${escapeHtml(formatAge(match.timestamp))}</span>
            </div>
        </section>
    `;
}

function renderRecentBlockRow(block, { isNew = false } = {}) {
    const vote = voteFromToggle(block.lbToggle);
    return `
        <div class="lb-table-row ${isNew ? 'lb-row-new' : ''}" data-lb-level="${Number(block.level) || 0}">
            <span>${formatLevel(block.level)}</span>
            <span><span class="lb-vote-badge ${vote.className}">${vote.label}</span></span>
            <div class="lb-baker-cell">${bakerLinks(block.producer?.address, bakerName(block.producer))}</div>
        </div>
    `;
}

function renderRecentBlocks(blocks) {
    const rows = blocks.slice(0, 12).map((block) => renderRecentBlockRow(block)).join('');

    return `
        <section class="lb-panel lb-recent-panel lb-panel-has-help chamber-anim-fade" style="animation-delay:220ms">
            <div class="lb-panel-title">
                Recent Blocks <span class="lb-live-pill">live</span>
                ${renderHelpTooltip({
                    label: 'Explain recent Liquidity Baking blocks',
                    title: 'Why block rows?',
                    body: 'Each Tezos block may carry the baker LB toggle vote. The monitor streams recent blocks so you can see the live vote flow.',
                    href: 'https://tzkt.io/blocks',
                    linkText: 'View blocks'
                })}
            </div>
            <div class="lb-table lb-recent-table">
                <div class="lb-table-head"><span>Level</span><span>Vote</span><span>Baker</span></div>
                <div id="lb-recent-block-list">${rows}</div>
            </div>
        </section>
    `;
}

function filterBakers(bakers, filter) {
    return filter === 'all' ? bakers : bakers.filter((baker) => baker.vote.key === filter);
}

function renderBakerRows(bakers) {
    if (!bakers.length) return '<div class="lb-empty-inline">No bakers in this block sample.</div>';
    return bakers.slice(0, 60).map((baker) => `
        <div class="lb-table-row" data-lb-baker="${escapeHtml(baker.address)}" data-lb-level="${Number(baker.level) || 0}">
            <div class="lb-baker-cell">${bakerLinks(baker.address, baker.name)}</div>
            <span><span class="lb-vote-badge ${baker.vote.className}">${baker.vote.label}</span></span>
            <span>${formatLevel(baker.level)} · ${escapeHtml(formatAge(baker.timestamp))}</span>
        </div>
    `).join('');
}

function renderBakerVotes(data, activeFilter = _lbActiveFilter) {
    const { bakers, counts } = data.bakerSummary;
    window._lbBakers = bakers;
    const filter = ['all', 'off', 'on', 'pass'].includes(activeFilter) ? activeFilter : 'all';
    return `
        <section class="lb-panel lb-bakers-panel lb-panel-has-help chamber-anim-fade" style="animation-delay:300ms">
            <div class="lb-panel-title">
                Baker Latest Votes
                ${renderHelpTooltip({
                    label: 'Explain baker latest Liquidity Baking votes',
                    title: 'Why one row per baker?',
                    body: 'This deduplicates the sample by baker and keeps only each baker latest block, so you can scan their current LB stance quickly.',
                    href: LB_PURPLEMATTER_URL,
                    linkText: 'Open tracker'
                })}
            </div>
            <div class="lb-panel-subtitle">One row per baker, using each baker's latest block inside this sample.</div>
            <div class="lb-filter-row">
                <button class="lb-filter-btn ${filter === 'all' ? 'active' : ''}" data-lb-filter="all">All ${formatCount(bakers.length)}</button>
                <button class="lb-filter-btn ${filter === 'off' ? 'active' : ''}" data-lb-filter="off">OFF ${formatCount(counts.off)}</button>
                <button class="lb-filter-btn ${filter === 'on' ? 'active' : ''}" data-lb-filter="on">ON ${formatCount(counts.on)}</button>
                <button class="lb-filter-btn ${filter === 'pass' ? 'active' : ''}" data-lb-filter="pass">PASS ${formatCount(counts.pass)}</button>
            </div>
            <div class="lb-table lb-baker-table">
                <div class="lb-table-head"><span>Baker</span><span>Vote</span><span>Latest block</span></div>
                <div id="lb-baker-vote-list">${renderBakerRows(filterBakers(bakers, filter))}</div>
            </div>
        </section>
    `;
}

function initBakerFilters(activeFilter = _lbActiveFilter) {
    const container = document.querySelector('.lb-bakers-panel');
    const list = document.getElementById('lb-baker-vote-list');
    if (!container || !list || !window._lbBakers) return;
    _lbActiveFilter = ['all', 'off', 'on', 'pass'].includes(activeFilter) ? activeFilter : 'all';

    container.querySelectorAll('.lb-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.lb-filter-btn').forEach((other) => other.classList.remove('active'));
            btn.classList.add('active');
            _lbActiveFilter = btn.dataset.lbFilter || 'all';
            list.innerHTML = renderBakerRows(filterBakers(window._lbBakers, _lbActiveFilter));
            initBakerProfileLinks(list);
        });
    });
}

function initBakerProfileLinks(root = document) {
    root.querySelectorAll('.lb-baker-name-link').forEach((link) => {
        if (link.dataset.lbProfileWired) return;
        link.dataset.lbProfileWired = '1';
        link.addEventListener('click', () => closeLiquidityBakingMonitor());
    });
}

function setTextIfChanged(selector, value) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el || el.textContent === value) return;
    el.textContent = value;
    el.classList.remove('lb-value-updated');
    void el.offsetWidth;
    el.classList.add('lb-value-updated');
}

function updateVoteBar(key, count, total) {
    const pct = total ? (count / total) * 100 : 0;
    const row = document.querySelector(`[data-lb-vote-bar="${key}"]`);
    if (!row) return;
    const fill = row.querySelector('.lb-vote-bar-fill');
    const value = row.querySelector('.lb-vote-bar-value');
    if (fill) fill.style.width = `${pct.toFixed(2)}%`;
    setTextIfChanged(value, `${formatCount(count)} ${pct.toFixed(1)}%`);
    if (value) value.innerHTML = `${formatCount(count)} <span>${pct.toFixed(1)}%</span>`;
}

function updateGlobalMetrics(data) {
    const total = data.blocks.length;
    setTextIfChanged('#lb-global-blocks', formatCount(total));
    setTextIfChanged('#lb-global-timespan', data.timeSpan);
    setTextIfChanged('#lb-global-range', data.blockRange);
    updateVoteBar('off', data.blockCounts.off, total);
    updateVoteBar('on', data.blockCounts.on, total);
    updateVoteBar('pass', data.blockCounts.pass, total);
}

function updateEmaStatus(data) {
    const pct = data.emaPct;
    const capped = Math.min(100, pct);
    const context = data.disabled
        ? 'OFF-vote EMA has reached the 50% disable threshold'
        : 'OFF-vote EMA is below the 50% disable threshold';
    const status = data.disabled ? 'SUBSIDY DISABLED' : 'SUBSIDY ACTIVE';
    const badge = document.getElementById('lb-header-badge');
    if (badge) {
        badge.textContent = `EMA ${pct.toFixed(1)}%`;
        badge.classList.toggle('current', data.disabled);
        badge.classList.toggle('live', !data.disabled);
    }
    setTextIfChanged('#lb-ema-value', `${pct.toFixed(1)}%`);
    setTextIfChanged('#lb-ema-meta', context);
    const fill = document.getElementById('lb-ema-fill');
    if (fill) {
        fill.style.width = `${capped.toFixed(2)}%`;
        fill.classList.toggle('disabled', data.disabled);
        fill.classList.toggle('active', !data.disabled);
    }
    const banner = document.getElementById('lb-status-banner');
    if (banner) {
        setTextIfChanged(banner, status);
        banner.classList.toggle('disabled', data.disabled);
        banner.classList.toggle('active', !data.disabled);
    }
}

function updateSavedBakerPanel(data) {
    const panel = document.querySelector('.lb-saved-baker');
    const signature = savedBakerSignature(data);
    if (!panel || panel.dataset.lbSavedSignature === signature) return;
    panel.outerHTML = renderSavedBaker(data);
    initBakerProfileLinks(document.querySelector('.lb-saved-baker') || document);
}

function updateRecentBlocks(blocks) {
    const list = document.getElementById('lb-recent-block-list');
    if (!list) return;
    const nextBlocks = blocks.slice(0, 12);
    if (!list.children.length) {
        list.innerHTML = nextBlocks.map((block) => renderRecentBlockRow(block)).join('');
        initBakerProfileLinks(list);
        return;
    }

    const existingLevels = new Set([...list.querySelectorAll('.lb-table-row')].map((row) => row.dataset.lbLevel));
    const freshBlocks = nextBlocks.filter((block) => !existingLevels.has(String(Number(block.level) || 0)));
    for (const block of [...freshBlocks].reverse()) {
        list.insertAdjacentHTML('afterbegin', renderRecentBlockRow(block, { isNew: true }));
    }
    while (list.querySelectorAll('.lb-table-row').length > 12) {
        list.querySelector('.lb-table-row:last-child')?.remove();
    }
    initBakerProfileLinks(list);
}

function updateBakerVoteList(data, activeFilter = _lbActiveFilter) {
    const { bakers, counts } = data.bakerSummary;
    window._lbBakers = bakers;
    const filter = ['all', 'off', 'on', 'pass'].includes(activeFilter) ? activeFilter : 'all';
    const labels = {
        all: `All ${formatCount(bakers.length)}`,
        off: `OFF ${formatCount(counts.off)}`,
        on: `ON ${formatCount(counts.on)}`,
        pass: `PASS ${formatCount(counts.pass)}`
    };
    document.querySelectorAll('.lb-filter-btn').forEach((btn) => {
        const key = btn.dataset.lbFilter || 'all';
        setTextIfChanged(btn, labels[key] || labels.all);
        btn.classList.toggle('active', key === filter);
    });

    const list = document.getElementById('lb-baker-vote-list');
    if (!list) return;
    const filtered = filterBakers(bakers, filter);
    const signature = filtered.slice(0, 60).map((baker) => `${baker.address}:${baker.vote.key}:${baker.level}`).join('|');
    if (list.dataset.lbRowsSignature === signature) return;
    list.dataset.lbRowsSignature = signature;
    list.innerHTML = renderBakerRows(filtered);
    list.classList.remove('lb-soft-updated');
    void list.offsetWidth;
    list.classList.add('lb-soft-updated');
    initBakerProfileLinks(list);
}

function updateLiquidityBakingInPlace(data, container, activeFilter = _lbActiveFilter) {
    if (!container.dataset.lbRendered || !document.getElementById('lb-ema-value')) {
        renderLiquidityBaking(data, container, activeFilter);
        return;
    }
    const latest = data.latest;
    setTextIfChanged('#lb-head-meta', latest ? `Head block ${formatLevel(latest.level)} · ${formatAge(latest.timestamp)}` : 'Live TzKT block feed');
    updateGlobalMetrics(data);
    updateEmaStatus(data);
    updateSavedBakerPanel(data);
    updateRecentBlocks(data.blocks);
    updateBakerVoteList(data, activeFilter);
}

function renderLiquidityBaking(data, container, activeFilter = _lbActiveFilter) {
    const latest = data.latest;
    container.innerHTML = `
        <div class="chamber-header lb-header chamber-anim-fade">
            <div class="lb-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>Liquidity Baking</span>
                <span>Live block feed</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title">⚡ Liquidity Baking Monitor</h2>
                <span class="chamber-badge ${data.disabled ? 'current' : 'live'}" id="lb-header-badge">EMA ${data.emaPct.toFixed(1)}%</span>
                <span class="lb-live-pill lb-refresh-pill" id="lb-refresh-state">auto-refresh ${Math.round(LB_LIVE_REFRESH_MS / 1000)}s</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">Per-block baker toggle votes</div>
                <div class="proposal-hash" id="lb-head-meta">${latest ? `Head block ${formatLevel(latest.level)} · ${escapeHtml(formatAge(latest.timestamp))}` : 'Live TzKT block feed'}</div>
            </div>
        </div>
        ${renderLiquidityBakingIntro(data)}
        ${renderLiquidityBakingLoreShell()}
        <div class="lb-dashboard-grid">
            ${renderGlobalMetrics(data)}
            ${renderEmaStatus(data)}
            ${renderSavedBaker(data)}
            ${renderRecentBlocks(data.blocks)}
        </div>
        ${renderBakerVotes(data, activeFilter)}
        <div class="chamber-footer chamber-anim-fade" style="animation-delay:380ms">
            <a href="https://tzkt.io/blocks" target="_blank" rel="noopener">TzKT Blocks →</a>
            <span class="chamber-footer-sep">·</span>
            <a href="${LB_OCTEZ_DOCS_URL}" target="_blank" rel="noopener">Octez LB Docs →</a>
            <span class="chamber-footer-sep">·</span>
            <a href="${LB_PURPLEMATTER_URL}" target="_blank" rel="noopener">Purplematter Tracker →</a>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/#lb" aria-label="Direct link to Liquidity Baking monitor">Direct: /#lb</a>
        </div>
    `;
    container.dataset.lbRendered = 'true';
    initBakerFilters(activeFilter);
    initBakerProfileLinks(container);
    initLiquidityBakingLoreToggle(container);
    hydrateLiquidityBakingLore(container);
}

function handleEscape(e) {
    if (e.key === 'Escape') closeLiquidityBakingMonitor();
}

async function refreshLiquidityBakingMonitor({ resetScroll = false, initial = false } = {}) {
    const overlay = document.getElementById('liquidity-baking-modal');
    const body = overlay?.querySelector('.lb-body');
    if (!overlay?.classList.contains('active') || !body || _lbRefreshInFlight) return;

    const content = overlay.querySelector('.lb-content');
    const scrollTop = content?.scrollTop || 0;
    const activeFilter = document.querySelector('.lb-filter-btn.active')?.dataset.lbFilter || _lbActiveFilter;
    _lbRefreshInFlight = true;
    overlay.classList.add('lb-refreshing');

    try {
        const data = await fetchLiquidityBakingData(LB_MODAL_BLOCK_LIMIT, { force: true });
        if (!overlay.classList.contains('active')) return;
        if (initial || resetScroll) {
            renderLiquidityBaking(data, body, activeFilter);
        } else {
            updateLiquidityBakingInPlace(data, body, activeFilter);
        }
        if (!resetScroll && content) content.scrollTop = scrollTop;
    } catch (err) {
        if (initial) throw err;
        console.warn('Liquidity Baking live refresh failed', err);
        const state = document.getElementById('lb-refresh-state');
        if (state) state.textContent = 'refresh delayed';
    } finally {
        overlay.classList.remove('lb-refreshing');
        _lbRefreshInFlight = false;
    }
}

function startLiquidityBakingLiveRefresh() {
    stopLiquidityBakingLiveRefresh();
    const overlay = document.getElementById('liquidity-baking-modal');
    if (overlay) overlay.dataset.lbLive = 'true';
    _lbLiveTimer = window.setInterval(() => {
        if (document.hidden) return;
        refreshLiquidityBakingMonitor();
    }, LB_LIVE_REFRESH_MS);
}

function stopLiquidityBakingLiveRefresh() {
    if (_lbLiveTimer) {
        window.clearInterval(_lbLiveTimer);
        _lbLiveTimer = null;
    }
    const overlay = document.getElementById('liquidity-baking-modal');
    if (overlay) overlay.dataset.lbLive = 'false';
}

export async function openLiquidityBakingMonitor() {
    // Dismiss the entry card's info tooltip so it doesn't linger behind the modal
    document.getElementById('tooltip-liquidity-baking')?.classList.remove('is-open');
    let overlay = document.getElementById('liquidity-baking-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'liquidity-baking-modal';
        overlay.className = 'modal-overlay chamber-overlay lb-overlay';
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content lb-content">
                <button class="modal-close chamber-close" aria-label="Close" style="z-index:3">&times;</button>
                <div class="chamber-body lb-body">
                    <div class="chamber-loading">
                        <div class="chamber-loading-text">Syncing Liquidity Baking votes…</div>
                        <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.chamber-close').addEventListener('click', closeLiquidityBakingMonitor);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLiquidityBakingMonitor(); });
    }

    document.addEventListener('keydown', handleEscape);
    overlay.classList.add('active');
    lockPageScroll();
    const content = overlay.querySelector('.lb-content');
    if (content) content.scrollTop = 0;

    try {
        await refreshLiquidityBakingMonitor({ resetScroll: true, initial: true });
        startLiquidityBakingLiveRefresh();
    } catch (err) {
        console.error('Liquidity Baking monitor fetch error:', err);
        overlay.querySelector('.lb-body').innerHTML = `
            <div class="chamber-error">
                <div class="error-icon">⚠️</div>
                <div class="error-title">Couldn't reach Liquidity Baking data</div>
                <div class="error-detail">TzKT block data may be temporarily unavailable. Try again in a moment.</div>
                <button class="chamber-retry-btn" id="lb-retry-open">Retry</button>
            </div>
        `;
        overlay.querySelector('#lb-retry-open')?.addEventListener('click', openLiquidityBakingMonitor);
    }
}

export function closeLiquidityBakingMonitor() {
    document.removeEventListener('keydown', handleEscape);
    stopLiquidityBakingLiveRefresh();
    const overlay = document.getElementById('liquidity-baking-modal');
    if (overlay) overlay.classList.remove('active');
    // Clear the entry card's info tooltip too, so it isn't left stuck on screen
    document.getElementById('tooltip-liquidity-baking')?.classList.remove('is-open');
    unlockPageScroll();
}

export function initLiquidityBaking() {
    const govSection = document.getElementById('governance-section');
    const launcherBtn = document.getElementById('liquidity-baking-toggle');
    if (launcherBtn && !launcherBtn.dataset.lbWired) {
        launcherBtn.dataset.lbWired = '1';
        launcherBtn.addEventListener('click', openLiquidityBakingMonitor);
    }

    if (document.getElementById('lb-entry-card')) {
        startEntryCardRefresh();
        return;
    }

    const grid = document.getElementById('chambers-grid') || govSection?.querySelector('.stats-grid');
    if (!grid) return;

    const card = document.createElement('div');
    card.id = 'lb-entry-card';
    card.className = 'stat-card chamber-entry-card lb-entry-card';
    card.innerHTML = `
        <button class="card-copy-link lb-card-copy-link" type="button" data-copy-hash="#lb-tile" aria-label="Copy Liquidity Baking tile link" title="Copy LB tile link">🔗</button>
        <div class="card-info-btn" data-tooltip="liquidity-baking" aria-label="Explain Liquidity Baking monitor" title="What is this?">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
            </svg>
        </div>
        <div class="card-tooltip" id="tooltip-liquidity-baking">
            <div class="tooltip-content">
                <h4>Liquidity Baking Monitor</h4>
                <p>Liquidity Baking is Tezos' protocol-level XTZ/tzBTC liquidity subsidy. Bakers can vote ON, OFF, or PASS in each block.</p>
                <p>The EMA tracks OFF votes. At 50% or higher, the subsidy is disabled; below 50%, it can resume.</p>
                <a href="https://opentezos.com/defi/dexs/#liquidity-baking" target="_blank" rel="noopener">Learn more →</a>
            </div>
        </div>
        <div class="card-inner">
            <div class="card-front chamber-entry-front lb-entry-open-target" role="button" tabindex="0" aria-label="Open Liquidity Baking Monitor">
                <h2 class="stat-label">LB Monitor</h2>
                <div class="stat-value lb-entry-ema" id="lb-entry-ema"><span class="loading">...</span></div>
                <p class="stat-description" id="lb-entry-description">EMA + baker toggle votes</p>
                <div class="chamber-entry-status" id="lb-entry-mini"></div>
            </div>
        </div>
        <span class="chamber-expand-cue" title="Opens a full window" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h5v5"/><path d="M9 20H4v-5"/><path d="M20 4l-7 7"/><path d="M4 20l7-7"/></svg></span>
    `;
    card.style.cursor = 'pointer';
    card.title = 'Open Liquidity Baking Monitor';
    const infoBtn = card.querySelector('.card-info-btn');
    const tooltip = card.querySelector('.card-tooltip');
    infoBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        tooltip?.classList.toggle('is-open');
    });
    tooltip?.addEventListener('click', (event) => event.stopPropagation());
    // Dismiss on outside click or Escape — previously it could only be closed
    // by re-clicking the info button, so it got stuck (e.g. behind the modal).
    document.addEventListener('click', (event) => {
        if (!tooltip?.classList.contains('is-open')) return;
        if (infoBtn?.contains(event.target) || tooltip.contains(event.target)) return;
        tooltip.classList.remove('is-open');
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') tooltip?.classList.remove('is-open');
    });
    const openTarget = card.querySelector('.lb-entry-open-target');
    openTarget?.addEventListener('click', (event) => {
        event.stopPropagation();
        openLiquidityBakingMonitor();
    });
    openTarget?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        openLiquidityBakingMonitor();
    });
    card.addEventListener('click', openLiquidityBakingMonitor);
    const chamberCard = document.getElementById('chamber-entry-card');
    if (chamberCard?.parentElement === grid) {
        chamberCard.after(card);
    } else {
        grid.prepend(card);
    }
    loadEntryCardStatus({ force: true });
    startEntryCardRefresh();
}

function startEntryCardRefresh() {
    const card = document.getElementById('lb-entry-card');
    if (!card || _lbEntryTimer) return;

    card.dataset.lbLive = 'true';
    card.dataset.lbRefreshInterval = String(LB_ENTRY_REFRESH_MS);
    _lbEntryTimer = window.setInterval(() => {
        if (document.hidden) return;
        loadEntryCardStatus({ force: true });
    }, LB_ENTRY_REFRESH_MS);

    if (!_lbEntryVisibilityWired) {
        _lbEntryVisibilityWired = true;
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) loadEntryCardStatus({ force: true });
        });
    }
}

async function loadEntryCardStatus({ force = false } = {}) {
    const mini = document.getElementById('lb-entry-mini');
    const ema = document.getElementById('lb-entry-ema');
    const description = document.getElementById('lb-entry-description');
    if (!mini || _lbEntryRefreshInFlight) return;

    _lbEntryRefreshInFlight = true;
    try {
        const data = await fetchLiquidityBakingData(LB_ENTRY_BLOCK_LIMIT, { force });
        const status = data.disabled ? 'disabled' : 'active';
        if (ema) ema.textContent = `${data.emaPct.toFixed(1)}%`;
        if (description) description.textContent = `Subsidy ${status}`;
        mini.textContent = 'OFF-vote EMA + baker votes';
        mini.classList.toggle('live', !data.disabled);
        const card = mini.closest('.lb-entry-card');
        card?.classList.toggle('lb-subsidy-disabled', data.disabled);
        card?.classList.toggle('lb-subsidy-active', !data.disabled);
        if (card) {
            card.dataset.lbRefreshedAt = String(Date.now());
            card.dataset.lbLive = 'true';
            card.dataset.lbRefreshInterval = String(LB_ENTRY_REFRESH_MS);
        }
    } catch {
        if (ema) ema.textContent = '--';
        if (description) description.textContent = 'EMA unavailable';
        mini.textContent = 'LB status unavailable';
    } finally {
        _lbEntryRefreshInFlight = false;
    }
}
