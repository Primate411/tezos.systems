import { escapeHtml } from '../core/utils.js';
import { versionedAsset } from '../core/asset-version.js';
import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { FUNDING_MAX_BYTES, FUNDING_PREVIEW_MAX_BYTES, FUNDING_SOURCES, campaignState, campaignProgress, fundingStale, formatFundingAmount, validateFundingSnapshot, validateFundingPreview, fundingPreviewPath } from '../core/community-funding.mjs';
import { activateChamberDialog, deactivateChamberDialog, wireChamberLauncher, requestChamberClose, bindChamberVisibility, getChamberScrollContainer } from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';
import { renderChamberStamp, renderChamberVerdict } from '../ui/chamber-reading.js';

const VIEWS = { support: 'Support builders', campaigns: 'Open campaigns', history: 'Ended campaigns' };
const REFRESH_MS = 5 * 60 * 1000;
const receipts = { teztree: null, hacktez: null };
const errors = { teztree: false, hacktez: false };
let view = 'support';
let query = '';
let refreshWork = null;
let pending = null;
let timer = null;
let initialized = false;
const previews = { teztree: null, hacktez: null };
const previewErrors = { teztree: false, hacktez: false };
let previewWork = null;
let pendingPreview = null;
let entryInView = false;

const e = escapeHtml;
const active = () => document.getElementById('funding-modal')?.classList.contains('active');
const mayRefresh = () => document.visibilityState === 'visible' && active();
const external = (url, label, className = '') => `<a class="${className}" href="${e(url)}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true"> ↗</span></a>`;
const shortAddress = value => /^tz[1-4]/.test(value) ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;
const dateLabel = value => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not provided';
const projectStatus = item => ({ live: 'Live project', wip: 'In development', idea: 'Idea', paused: 'Paused', archived: 'Archived' }[item.status] || 'Tips enabled');
const mayPreview = () => document.visibilityState === 'visible' && entryInView && !active()
    && !document.getElementById('funding-entry-card')?.closest('[inert]');

function platformCredits(treeLabel = 'Campaign data', projectLabel = 'Project listings') {
    return `<span class="funding-platform-credit">${external(FUNDING_SOURCES.teztree.home, '<strong>TezTree</strong>')}<small>${e(treeLabel)}</small></span><span class="funding-platform-credit">${external(FUNDING_SOURCES.hacktez.home, '<strong>HackTez</strong>')}<small>${e(projectLabel)}</small></span>`;
}

function wireArtworkFallback(surface) {
    surface.addEventListener('error', event => { if (event.target.tagName === 'IMG') event.target.dataset.quietImageFailed = 'true'; }, true);
    surface.addEventListener('load', event => { if (event.target.tagName === 'IMG') delete event.target.dataset.quietImageFailed; }, true);
}

function previewItem(item, source) {
    const campaign = source === 'teztree';
    const progress = campaign ? campaignProgress(item) : null;
    const state = campaign ? campaignState(item) : null;
    const stale = previewErrors[source] || fundingStale(previews[source]);
    const status = campaign ? state === 'open' ? (stale ? 'Open at check' : 'Open campaign') : state === 'ended' ? 'Ended campaign' : 'Check status' : projectStatus(item);
    return external(item.url, `${imageMarkup(item)}<span class="funding-preview-copy"><strong>${e(item.title)}</strong><span class="funding-preview-description">${e(item.summary)}</span><small>${FUNDING_SOURCES[source].name} · ${e(shortAddress(item.builder))}</small></span><span class="funding-preview-fact"><span>${status}</span>${campaign ? `<strong>${item.raisedMutez === null ? 'Amount unavailable' : `${formatFundingAmount(item.raisedMutez, 6)} ꜩ raised`}</strong>${progress !== null ? `<progress max="100" value="${Math.min(100, progress)}" aria-label="${e(item.title)}: ${progress}% of goal"></progress>` : ''}` : `<strong>${item.suggestedAmounts.length ? `${formatFundingAmount(item.suggestedAmounts[0])} ꜩ suggested` : 'Support project'}</strong>`}</span>`, `funding-preview-item ${campaign ? 'is-campaign' : 'is-project'}`)
        .replace('<a ', `<a data-quiet-key="preview-${source}-${e(item.id)}" `);
}

function renderFundingPreview() {
    if (!mayPreview()) return;
    const card = document.getElementById('funding-entry-card');
    const projects = previews.hacktez?.highlights || [];
    const campaigns = previews.teztree?.highlights || [];
    const open = campaigns.find(item => campaignState(item) === 'open');
    const picks = [...(open ? [{ item: open, source: 'teztree' }] : []), ...projects.map(item => ({ item, source: 'hacktez' }))].slice(0, 3);
    if (!picks.length && campaigns.length) picks.push({ item: campaigns[0], source: 'teztree' });
    const rows = picks.length ? picks.map(({ item, source }) => previewItem(item, source)).join('')
        : `<div class="funding-preview-empty">${Object.values(previewErrors).some(Boolean) ? 'Project previews are unavailable. Open the chamber to check the platforms.' : Object.values(previews).some(Boolean) ? 'No support opportunities in the latest snapshots.' : 'Checking community projects…'}</div>`;
    const clocks = Object.keys(FUNDING_SOURCES).map(source => {
        const receipt = previews[source];
        const label = previewErrors[source] ? receipt ? 'Saved snapshot · refresh failed' : 'Unavailable'
            : receipt && fundingStale(receipt) ? 'Stale snapshot' : '';
        return `<span data-quiet-key="preview-clock-${source}">${FUNDING_SOURCES[source].name}: ${receipt ? renderChamberStamp(receipt.generatedAt, 'checked') : 'checking'}${label ? ` · ${label}` : ''}</span>`;
    }).join('');
    quietlySyncHtml(card.querySelector('.funding-entry-preview'), `<div class="funding-preview-heading"><h3>Worth a look</h3><span>Support on the original platform ↗</span></div><div class="funding-preview-list">${rows}</div><div class="funding-preview-clocks">${clocks}</div>`);
    const tree = previews.teztree;
    const countCurrent = tree && (!tree.nextDeadline || Date.parse(tree.nextDeadline) > Date.now());
    quietlySyncHtml(card.querySelector('.funding-entry-platforms'), platformCredits(tree ? countCurrent ? `${tree.openCount} open · ${tree.availableCount - tree.openCount} in history` : `${tree.availableCount} campaigns · check status` : 'Campaign data', previews.hacktez ? `${previews.hacktez.availableCount} projects accepting tips` : 'Project listings'));
}

async function refreshFundingPreview() {
    if (!mayPreview()) return;
    if (previewWork) return previewWork;
    previewWork = (async () => {
        const sources = Object.keys(FUNDING_SOURCES);
        const results = pendingPreview || await Promise.allSettled(sources.map(source => readSnapshot(source, true)));
        if (!mayPreview()) { pendingPreview = results; return; }
        pendingPreview = null;
        results.forEach((result, index) => {
            const source = sources[index];
            previewErrors[source] = result.status === 'rejected' || Boolean(previews[source] && Date.parse(result.value.generatedAt) < Date.parse(previews[source].generatedAt));
            if (!previewErrors[source]) previews[source] = result.value;
        });
        renderFundingPreview();
    })().finally(() => { previewWork = null; });
    return previewWork;
}

function imageMarkup(item) {
    return `<div class="funding-art" aria-hidden="true"><span>${e(item.title.slice(0, 1))}</span>${item.image ? `<img src="${e(item.image)}" alt="" width="400" height="200" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</div>`;
}

function campaignCard(item) {
    const status = campaignState(item);
    const progress = campaignProgress(item);
    const stale = fundingStale(receipts.teztree) || errors.teztree;
    const label = status === 'open' ? (stale ? 'Open at last check' : 'Open') : status === 'ended' ? 'Ended' : status === 'suspended' ? 'Suspended' : 'Status unavailable';
    return `<article class="funding-card funding-campaign" data-quiet-key="campaign-${e(item.id)}">
        ${imageMarkup(item)}<div class="funding-card-main">
        <div class="funding-card-eyebrow"><span>TezTree · Campaign</span><span class="funding-tag" data-state="${status}">${label}</span></div>
        <h3>${e(item.title)}</h3><p class="funding-builder" title="${e(item.builder)}">Created by ${e(shortAddress(item.builder) || 'Unlisted creator')}</p>
        <p class="funding-description">${e(item.summary || 'Read the campaign details on TezTree.')}</p>
        <div class="funding-progress"><div><strong>${formatFundingAmount(item.raisedMutez, 6)}${item.raisedMutez !== null ? ' ꜩ' : ''}</strong><span>${item.goalMutez !== null ? `of ${formatFundingAmount(item.goalMutez, 6)} ꜩ` : 'Goal unavailable'}</span></div>
        ${progress === null ? '<p>Progress unavailable</p>' : `<progress max="100" value="${Math.min(100, progress)}" aria-label="${e(item.title)}: ${progress}% of goal">${progress}%</progress>`}
        <div class="funding-card-meta"><span>${item.backers === null ? 'Backers unavailable' : `${item.backers} backer${item.backers === 1 ? '' : 's'}`}</span><span>${progress === null ? '' : `${progress.toLocaleString('en-US')}% of goal`}</span></div></div>
        <p class="funding-deadline">${status === 'ended' && item.closed ? 'Closed by platform · ' : ''}Deadline: ${e(dateLabel(item.deadline))} UTC</p>
        ${external(item.url, status === 'open' && !stale ? 'Support on TezTree' : 'View on TezTree', 'funding-action')}
        </div></article>`;
}

function projectCard(item) {
    const status = { live: 'Live project', wip: 'In development', idea: 'Idea', paused: 'Paused', archived: 'Archived' }[item.status] || (item.status ? `Status: ${item.status}` : 'Project support');
    const totals = item.tipCounters?.totals || [];
    return `<article class="funding-card funding-project" data-quiet-key="project-${e(item.id)}">
        ${imageMarkup(item)}<div class="funding-card-main">
        <div class="funding-card-eyebrow"><span>HackTez · Project</span><span class="funding-tag">${e(status)}</span></div>
        <h3>${e(item.title)}</h3><p class="funding-builder">By ${external(item.builderUrl, e(item.builder))}</p>
        <p class="funding-description">${e(item.summary || 'Read about this project on HackTez.')}</p>
        ${item.supportNote ? `<p class="funding-support-note">${e(item.supportNote)}</p>` : ''}
        <div class="funding-project-receipt">${item.suggestedAmounts.length ? `<p><span>Suggested on HackTez</span><strong>${item.suggestedAmounts.map(value => formatFundingAmount(value)).join(' / ')} ꜩ</strong></p>` : '<p>Choose a tip on HackTez</p>'}
        ${item.tipCounters ? `<p>${item.tipCounters.count} project tip${item.tipCounters.count === 1 ? '' : 's'} recorded</p>${totals.map(total => `<p class="funding-asset-total" title="${e(total.asset)}"><span>${e(total.symbol || total.asset)}</span><strong>${formatFundingAmount(total.total)} ${e(total.symbol || total.asset)}</strong></p>`).join('')}` : '<p class="funding-counter-note">Project tip totals not provided</p>'}</div>
        ${external(item.url, 'Support this project', 'funding-action')}
        </div></article>`;
}

function sourceStatus(source) {
    const receipt = receipts[source];
    const platform = FUNDING_SOURCES[source];
    const state = !receipt ? (errors[source] ? 'Unavailable' : 'Loading') : errors[source] ? 'Refresh failed · saved snapshot' : fundingStale(receipt) ? 'Stale snapshot' : 'Platform snapshot';
    return `<div class="funding-source-status" data-quiet-key="status-${source}" data-stale="${Boolean(errors[source] || fundingStale(receipt))}">
        <div><strong>${platform.name}</strong><span>${state}</span></div>
        <div>${receipt ? renderChamberStamp(receipt.generatedAt, 'Checked') : '<span>Waiting for a successful check</span>'}${receipt?.sourceGeneratedAt ? renderChamberStamp(receipt.sourceGeneratedAt, 'Platform data') : ''}</div>
    </div>`;
}

function render() {
    if (!mayRefresh()) return;
    const overlay = document.getElementById('funding-modal');
    const source = view === 'support' ? 'hacktez' : 'teztree';
    const receipt = receipts[source];
    const rows = (receipt?.items || []).filter(item => source === 'hacktez' || (view === 'campaigns' ? campaignState(item) === 'open' : campaignState(item) !== 'open'));
    const shown = rows.filter(item => `${item.title} ${item.summary} ${item.builder}`.toLowerCase().includes(query.trim().toLowerCase()));
    quietlySyncHtml(overlay.querySelector('#funding-source-status'), sourceStatus('teztree') + sourceStatus('hacktez'));
    for (const [key] of Object.entries(VIEWS)) {
        const button = overlay.querySelector(`[data-funding-view="${key}"]`);
        button.setAttribute('aria-selected', String(view === key));
        button.tabIndex = view === key ? 0 : -1;
    }
    const panel = overlay.querySelector('#funding-panel');
    panel.setAttribute('aria-labelledby', `funding-tab-${view}`);
    let markup;
    if (!receipt) {
        markup = errors[source]
            ? `<div class="funding-empty"><span class="funding-empty-mark">↻</span><h3>${FUNDING_SOURCES[source].name} is unavailable</h3><p>We couldn’t load a funding snapshot. Try again, or browse the platform directly.</p>${external(FUNDING_SOURCES[source].home, `Open ${FUNDING_SOURCES[source].name}`, 'funding-action')}</div>`
            : '<div class="funding-grid" aria-busy="true" aria-label="Loading opportunities">' + [0, 1, 2].map(i => `<div class="funding-card funding-skeleton" data-quiet-key="skeleton-${i}"><div></div><span></span><span></span><span></span></div>`).join('') + '</div>';
    } else if (shown.length) {
        markup = `<div class="funding-panel-heading"><div><h2>${VIEWS[view]}</h2><p>${source === 'hacktez' ? 'Ongoing support, directly to the people building on Tezos.' : view === 'history' ? 'Past and unavailable campaigns, with the platform’s reported amounts.' : 'Time-bound campaigns with goals reported by TezTree.'}</p></div><span>${shown.length} ${source === 'hacktez' ? 'projects' : 'campaigns'}</span></div>
            <div class="funding-grid">${shown.map(source === 'hacktez' ? projectCard : campaignCard).join('')}</div>`;
    } else {
        const heading = query ? 'No matching opportunities' : view === 'campaigns' ? 'No open campaigns at the last check' : view === 'support' ? 'No projects with tips enabled at the last check' : 'No ended campaigns in this feed';
        markup = `<div class="funding-empty"><span class="funding-empty-mark">${query ? '⌕' : '✳'}</span><h3>${heading}</h3><p>${query ? 'Try another project name or builder.' : view === 'campaigns' ? 'Explore previous TezTree campaigns or support a builder on HackTez.' : 'New opportunities will appear after the next platform check.'}</p>
            ${!query && view === 'campaigns' ? '<div class="funding-empty-actions"><button type="button" data-funding-switch="history">View ended campaigns</button><button type="button" data-funding-switch="support">Support a builder</button></div>' : ''}</div>`;
    }
    // A changed card above the reading position must not displace the card
    // being read. Compensation is synchronous; the next user scroll owns itself.
    const scroller = getChamberScrollContainer(overlay.querySelector('.funding-content'));
    const top = scroller.getBoundingClientRect().top;
    const anchor = [...panel.querySelectorAll('.funding-card')].find(card => card.getBoundingClientRect().bottom > top + 12);
    const anchorTop = anchor?.getBoundingClientRect().top;
    const compensate = scroller.scrollTop > 0 && anchor && anchorTop < top + scroller.clientHeight;
    quietlySyncHtml(panel, markup);
    if (compensate && anchor.isConnected) scroller.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
}

async function readSnapshot(source, preview = false) {
    const response = await fetch(preview ? fundingPreviewPath(source) : FUNDING_SOURCES[source].path, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Funding snapshot HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > (preview ? FUNDING_PREVIEW_MAX_BYTES : FUNDING_MAX_BYTES)) throw new Error('Funding snapshot exceeds byte budget');
            chunks.push(value);
        }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return (preview ? validateFundingPreview : validateFundingSnapshot)(JSON.parse(new TextDecoder().decode(bytes)), source);
}

export async function refreshCommunityFunding() {
    if (!mayRefresh()) return;
    if (refreshWork) return refreshWork;
    refreshWork = (async () => {
        const sources = Object.keys(FUNDING_SOURCES);
        const results = pending || await Promise.allSettled(sources.map(source => readSnapshot(source)));
        if (!mayRefresh()) { pending = results; return; }
        pending = null;
        results.forEach((result, index) => {
            const source = sources[index];
            const older = result.status === 'fulfilled' && receipts[source] && Date.parse(result.value.generatedAt) < Date.parse(receipts[source].generatedAt);
            errors[source] = result.status === 'rejected' || Boolean(older);
            if (!errors[source]) receipts[source] = result.value;
        });
        render();
    })().finally(() => { refreshWork = null; });
    return refreshWork;
}

function selectView(next) {
    if (!VIEWS[next]) return;
    view = next;
    query = '';
    document.getElementById('funding-search').value = '';
    const url = new URL(window.location.href);
    if (url.pathname === '/funding/' || ['#funding', '#community-funding', '#support-builders'].includes(url.hash)) {
        url.searchParams.set('view', view);
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    render();
}

function ensureOverlay() {
    let overlay = document.getElementById('funding-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'funding-modal';
    overlay.className = 'modal-overlay chamber-overlay funding-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<div class="modal-content modal-large chamber-content funding-content" role="dialog" aria-modal="true" aria-labelledby="funding-title" tabindex="-1">
        <button class="modal-close chamber-close" type="button" aria-label="Close Community Funding">&times;</button>
        <div class="chamber-body funding-body">
            <header class="funding-hero"><div class="funding-kicker">Made by the community · Kept going by you</div><h1 id="funding-title">Community <span>Funding</span></h1><p>Back an idea. Keep a good project going.</p><div class="funding-powered-by">Powered by the community’s funding platforms</div><div class="funding-platforms" aria-label="Funding platform credits">${platformCredits('Campaigns & reported funding', 'Projects & builder support')}</div><p class="funding-attribution-note">Listings, artwork and reported figures supplied by TezTree and HackTez. Browse here; support on the original platform.</p><div class="funding-hero-symbol" aria-hidden="true">✳</div></header>
            ${renderChamberVerdict({ key: 'funding', state: 'guide', sentence: 'TezTree campaigns have funding goals and deadlines. HackTez projects accept ongoing tips. Support opens on the original platform.' })}
            <div class="funding-toolbar"><div class="funding-tabs" role="tablist" aria-label="Funding opportunities">${Object.entries(VIEWS).map(([key, label]) => `<button id="funding-tab-${key}" type="button" role="tab" aria-controls="funding-panel" aria-selected="${key === view}" tabindex="${key === view ? 0 : -1}" data-funding-view="${key}">${label}</button>`).join('')}</div>
            <label class="funding-search"><input id="funding-search" aria-label="Find a project or builder" type="search" placeholder="Find a project or builder…" autocomplete="off"></label></div>
            <div class="funding-source-row"><div id="funding-source-status"></div><button id="funding-refresh" type="button" aria-label="Check funding snapshots again">↻ Refresh</button></div>
            <div id="funding-panel" role="tabpanel" aria-labelledby="funding-tab-${view}"></div>
            <details class="funding-method" data-chamber-disclosure><summary>How this room works</summary><div><p>TezTree campaigns have funding goals and deadlines. HackTez projects appear only when project tips are explicitly enabled. Project descriptions and statuses are provided by their creators.</p><p>Support opens the original campaign or project page. You can browse here without connecting a wallet. Availability and amounts may change between checks; confirm the details on the platform.</p><p>Snapshots refresh on the site’s scheduled data job. “Checked” is the successful collection time; HackTez’s separate platform clock is preserved. A snapshot becomes stale after 18 hours. A failed refresh keeps the last successful snapshot with its original timestamp.</p><p>TezTree closed flags and deadlines take precedence over its generic status field. Goal progress is calculated from reported mutez. HackTez counters are shown only for an exact project receipt, with totals separate for each asset; missing totals stay unavailable.</p><p>Sources: ${external(FUNDING_SOURCES.teztree.url, 'TezTree campaigns')} · ${external(FUNDING_SOURCES.hacktez.url, 'HackTez projects')} · ${external('https://hacktez.com/api/v1/members?tips=1', 'HackTez project counters')}</p></div></details>
        </div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.chamber-close').addEventListener('click', closeCommunityFunding);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeCommunityFunding();
        const button = event.target.closest('[data-funding-view], [data-funding-switch]');
        if (button) selectView(button.dataset.fundingView || button.dataset.fundingSwitch);
    });
    overlay.querySelector('.funding-tabs').addEventListener('keydown', event => {
        const keys = Object.keys(VIEWS);
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (keys.indexOf(view) + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length;
        selectView(keys[next]);
        overlay.querySelector(`[data-funding-view="${view}"]`).focus({ preventScroll: true });
    });
    overlay.querySelector('#funding-search').addEventListener('input', event => { query = event.target.value; render(); });
    overlay.querySelector('#funding-refresh').addEventListener('click', refreshCommunityFunding);
    // Keep a failed external image inside its reserved artwork slot.
    wireArtworkFallback(overlay);
    bindChamberVisibility('funding-modal', refreshCommunityFunding);
    return overlay;
}

export async function openCommunityFunding({ isCurrent = () => true, view: requestedView } = {}) {
    await ensureChamberStylesheet('funding-css', versionedAsset('/css/community-funding.min.css'));
    if (!isCurrent()) return;
    const overlay = ensureOverlay();
    const ownsRoute = window.location.pathname === '/funding/' || ['#funding', '#community-funding', '#support-builders'].includes(window.location.hash);
    const requested = requestedView || (ownsRoute ? new URLSearchParams(window.location.search).get('view') : null);
    if (!active() || (requested && VIEWS[requested])) {
        view = VIEWS[requested] ? requested : 'support';
        query = '';
        overlay.querySelector('#funding-search').value = '';
    }
    overlay.classList.add('active');
    activateChamberDialog(overlay, { close: closeCommunityFunding, dialogSelector: '.funding-content', titleId: 'funding-title', restoreFocusSelector: '#funding-entry-card' });
    render();
    if (!timer) timer = setInterval(() => {
        if (document.visibilityState === 'visible' && active()) return refreshCommunityFunding();
    }, REFRESH_MS);
    await refreshCommunityFunding();
}

export function closeCommunityFunding() {
    const overlay = document.getElementById('funding-modal');
    if (!overlay?.classList.contains('active') || !requestChamberClose(overlay)) return;
    overlay.classList.remove('active');
    deactivateChamberDialog(overlay);
    clearInterval(timer);
    timer = null;
    void refreshFundingPreview();
}

export function initCommunityFunding() {
    if (initialized) return;
    const grid = document.getElementById('chambers-grid');
    if (!grid) return;
    let card = document.getElementById('funding-entry-card');
    if (!card) {
        card = document.createElement('article');
        card.id = 'funding-entry-card';
        card.className = 'stat-card chamber-entry-card chamber-entry-wide';
        card.innerHTML = '<button class="card-copy-link" type="button" data-copy-hash="#funding" aria-label="Copy Community Funding direct link">🔗</button><div class="card-inner"><div class="card-front chamber-entry-front"></div></div>';
        grid.appendChild(card);
    }
    initialized = true;
    ensureChamberStylesheet('funding-css', versionedAsset('/css/community-funding.min.css')).catch(() => {});
    const front = card.querySelector('.card-front');
    if (front) front.innerHTML = `<div class="funding-entry-copy"><span class="funding-kicker">The community, keeping things going</span><h2 id="funding-entry-title" class="stat-label chamber-entry-title">Community Funding</h2><p>Discover campaigns and support the builders behind Tezos projects.</p><div class="funding-powered-by">Powered by</div><div class="funding-entry-platforms" aria-label="Funding platform credits">${platformCredits()}</div><p class="funding-attribution-note">Listings, artwork & reported figures from the source platforms.</p></div><section class="funding-entry-preview" aria-label="Community project highlights"><div class="funding-preview-heading"><h3>Worth a look</h3><span>Support on the original platform ↗</span></div><div class="funding-preview-list"><div class="funding-preview-empty">Checking community projects…</div></div><div class="funding-preview-clocks"></div></section>`;
    card.classList.add('funding-entry-card');
    card.setAttribute('aria-busy', 'false');
    card.dataset.updatedLabel = 'Platform snapshots · support at the source';
    wireChamberLauncher(card, { open: openCommunityFunding, label: 'Open Community Funding', titleSelector: '#funding-entry-title' });
    wireArtworkFallback(card);
    const observer = new IntersectionObserver(entries => {
        entryInView = entries.some(entry => entry.isIntersecting);
        if (mayPreview()) void refreshFundingPreview();
    });
    observer.observe(card);
    document.addEventListener('visibilitychange', () => { if (mayPreview()) void refreshFundingPreview(); });
    setInterval(() => { if (mayPreview()) return refreshFundingPreview(); }, REFRESH_MS);
}
