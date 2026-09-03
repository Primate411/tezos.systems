import { renderChamberVerdict } from '../ui/chamber-reading.js';
/**
 * Tezos Community Rewards Chamber
 * Human-identity recognition archive sourced from official Tezos Commons posts.
 */

import { escapeHtml } from '../core/utils.js';
import { versionedAsset } from '../core/asset-version.js';
import { decodeTezosCrpDataset } from '../core/tezoscrp-codec.mjs';
import { activateChamberDialog, deactivateChamberDialog, wireChamberLauncher, requestChamberClose } from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';

const SUMMARY_URL = versionedAsset('/data/tezoscrp-summary.json');
const DATA_URL = versionedAsset('/data/tezoscrp-awards.compact.json');
const CSS_URL = versionedAsset('/css/tezoscrp.min.css');
const VIEW_KEYS = ['hall', 'records', 'latest', 'categories', 'archive'];
const VIEW_LABELS = {
    hall: 'Recognition Hall',
    records: 'Records',
    latest: 'Latest Winners',
    categories: 'Categories',
    archive: 'Monthly Archive'
};
const PAGE_SIZE = 50;

let summaryPromise = null;
let dataPromise = null;
let summaryData = null;
let fullData = null;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;

const state = {
    view: 'hall',
    hallQuery: '',
    hallSort: 'awards',
    hallLimit: PAGE_SIZE,
    selectedPersonId: '',
    recordYear: '',
    archivePeriod: '',
    archiveCategory: '',
    archiveQuery: '',
    archiveLimit: PAGE_SIZE
};

function ensureStyles() {
    return ensureChamberStylesheet('tezoscrp-css', CSS_URL);
}

function safeUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function hasPublishedAmount(award) {
    return award?.amount_tez !== null
        && award?.amount_tez !== undefined
        && String(award.amount_tez).trim() !== ''
        && Number.isFinite(Number(award.amount_tez));
}

function formatPeriod(value) {
    const match = String(value || '').match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
    if (!match) return value || 'Unknown month';
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

function shortPeriod(value) {
    const match = String(value || '').match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
    if (!match) return value || '—';
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

function categoryDefinitions() {
    return summaryData?.current_categories || [];
}

function categoryDefinition(category) {
    return categoryDefinitions().find((definition) => definition.category === category) || null;
}

function categoryMark(category, className = '') {
    const definition = categoryDefinition(category);
    if (definition?.icon) {
        return `<img class="tezoscrp-category-icon ${escapeHtml(className)}" src="${escapeHtml(definition.icon)}" alt="" width="42" height="50" loading="lazy" decoding="async">`;
    }
    return `<span class="tezoscrp-archive-mark ${escapeHtml(className)}" aria-hidden="true">◇</span>`;
}

function latestAwardForPerson(personId) {
    if (!fullData) return null;
    for (let index = fullData.awards.length - 1; index >= 0; index -= 1) {
        if (fullData.awards[index].person_id === personId) return fullData.awards[index];
    }
    return null;
}

function displayPerson(person) {
    const latest = latestAwardForPerson(person?.person_id);
    return person?.display_name || latest?.recipient_name || latest?.handle || person?.person_id || 'Unknown recipient';
}

function profileLink(identity, label, className = '') {
    const platform = identity?.profile?.platform || identity?.platform;
    const handle = String(identity?.profile?.handle || identity?.handle || '').replace(/^@/, '');
    if (platform === 'x' && /^[A-Za-z0-9_]{1,15}$/.test(handle)) {
        return `<a class="${escapeHtml(className)}" href="https://x.com/${encodeURIComponent(handle)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    }
    if (platform === 'reddit' && /^[A-Za-z0-9_-]{1,30}$/.test(handle)) {
        return `<a class="${escapeHtml(className)}" href="https://www.reddit.com/user/${encodeURIComponent(handle)}/" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    }
    return `<span class="${escapeHtml(className)}">${escapeHtml(label)}</span>`;
}

function personForAward(award) {
    return fullData?.people_summary?.find(({ person_id }) => person_id === award?.person_id) || award;
}

function sourceLink(award, label = 'Official source') {
    const source = (award?.sources || []).find(({ url }) => safeUrl(url));
    const url = safeUrl(source?.url);
    if (!url) return '<span class="tezoscrp-source-missing">Source unavailable</span>';
    const kind = source?.type?.endsWith('_x_post') ? 'Tezos Commons X post' : label;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(kind)} ↗</a>`;
}

function articleForPeriod(period) {
    return fullData?.articles_and_threads?.find((article) => article.period === period)
        || (summaryData?.latest?.article?.period === period ? summaryData.latest.article : null)
        || null;
}

function loadSummary({ force = false } = {}) {
    if (force) summaryPromise = null;
    if (!summaryPromise) {
        summaryPromise = fetch(SUMMARY_URL, { cache: force ? 'reload' : 'default' }).then(async (response) => {
            if (!response.ok) throw new Error(`TezosCRP summary HTTP ${response.status}`);
            const data = await response.json();
            if (!data?.totals || !Array.isArray(data?.latest?.awards)) throw new Error('TezosCRP summary is malformed');
            summaryData = data;
            return data;
        }).catch((error) => {
            summaryPromise = null;
            throw error;
        });
    }
    return summaryPromise;
}

function loadDataset({ force = false } = {}) {
    if (force) dataPromise = null;
    if (!dataPromise) {
        dataPromise = fetch(DATA_URL, { cache: force ? 'reload' : 'default' }).then(async (response) => {
            if (!response.ok) throw new Error(`TezosCRP archive HTTP ${response.status}`);
            const data = decodeTezosCrpDataset(await response.json());
            fullData = data;
            return data;
        }).catch((error) => {
            dataPromise = null;
            throw error;
        });
    }
    return dataPromise;
}

function renderEntryCard(summary) {
    const card = document.getElementById('tezoscrp-entry-card');
    if (!card) return;
    const latest = summary.latest || {};
    const top = summary.top_people?.slice(0, 6) || [];
    const latestPeople = new Set((latest.awards || []).map(({ person_id: personId }) => personId).filter(Boolean)).size;
    const latestYearRecord = summary.records?.years?.[0] || null;
    const yearRecordLabel = latestYearRecord?.leaders?.length === 1
        ? `${latestYearRecord.leaders[0].display_name} · ${formatNumber(latestYearRecord.record)}`
        : latestYearRecord ? `${formatNumber(latestYearRecord.leaders?.length)}-way tie · ${formatNumber(latestYearRecord.record)} each` : 'October 2020';
    const icons = summary.current_categories?.map((category) => (
        `<img src="${escapeHtml(category.icon)}" alt="" width="30" height="35" title="${escapeHtml(category.category)}" loading="lazy" decoding="async">`
    )).join('') || '';
    const front = card.querySelector('.tezoscrp-entry-front');
    if (front) {
        front.innerHTML = `
            <div class="tezoscrp-entry-main">
                <span class="tezoscrp-entry-label">✦ Official community recognition</span>
                <h2 class="stat-label chamber-entry-title" id="tezoscrp-entry-title">TezosCRP Recognition Hall</h2>
                <p>Every official Tezos Commons category recognition, organized around community identities rather than wallets.</p>
                <div class="tezoscrp-entry-identity-strip" aria-label="Most recognized TezosCRP identities">
                    ${top.map((person, index) => `<span data-tezoscrp-place="${index + 1}"><b>${index + 1}</b><span><strong>${escapeHtml(person.display_name)}</strong><small>${formatNumber(person.total_awards)} awards · ${formatNumber(person.distinct_periods)} months</small></span></span>`).join('')}
                </div>
                <div class="tezoscrp-entry-meta">
                    <span><strong>${formatNumber(summary.totals?.awards)}</strong> awards</span>
                    <span><strong>${formatNumber(summary.totals?.people)}</strong> identities</span>
                    <span><strong>${formatNumber(summary.totals?.periods)}</strong> monthly rounds</span>
                </div>
            </div>
            <aside class="tezoscrp-entry-pulse" aria-label="Latest official TezosCRP round">
                <span class="tezoscrp-entry-label">◉ Latest official round</span>
                <strong>${escapeHtml(formatPeriod(latest.period))}</strong>
                <p>The newest source-receipted monthly chapter in the Recognition Hall.</p>
                <div class="tezoscrp-entry-pulse-line"><span>Recognitions</span><strong>${formatNumber(latest.awards?.length)}</strong></div>
                <div class="tezoscrp-entry-pulse-line"><span>Community identities</span><strong>${formatNumber(latestPeople)}</strong></div>
                <div class="tezoscrp-entry-pulse-line"><span>${latestYearRecord ? `${escapeHtml(String(latestYearRecord.year))} record` : 'Archive begins'}</span><strong>${escapeHtml(yearRecordLabel)}</strong></div>
                <div class="tezoscrp-entry-icons" aria-label="Nine current TezosCRP categories">${icons}</div>
            </aside>
        `;
    }
    card.dataset.updatedLabel = `${summary.totals?.periods || '—'} months · through ${shortPeriod(latest.period)} · Tezos Commons`;
    card.setAttribute('aria-busy', 'false');
    window.syncChamberEntryFooters?.(card);
    wireChamberLauncher(card, {
        open: openTezosCrpChamber,
        label: 'Open TezosCRP Recognition Hall',
        titleSelector: '#tezoscrp-entry-title, .stat-label'
    });
}

function renderEntryError() {
    const card = document.getElementById('tezoscrp-entry-card');
    if (!card) return;
    const front = card.querySelector('.tezoscrp-entry-front');
    if (front) front.innerHTML = '<h2 class="stat-label chamber-entry-title" id="tezoscrp-entry-title">TezosCRP Recognition Hall</h2><p>The official recognition archive is temporarily unavailable. Open the chamber to retry.</p>';
    card.dataset.updatedLabel = 'Archive unavailable · tap to retry';
    card.classList.add('chamber-data-stale');
    card.setAttribute('aria-busy', 'false');
    window.syncChamberEntryFooters?.(card);
}

function ensureEntryCard() {
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    let card = document.getElementById('tezoscrp-entry-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'tezoscrp-entry-card';
        card.className = 'stat-card chamber-entry-card chamber-entry-wide tezoscrp-entry-card chamber-entry-adoption';
        card.setAttribute('aria-busy', 'true');
        card.dataset.updatedLabel = 'Opening the official award archive';
        card.innerHTML = `
            <button class="card-copy-link" type="button" data-copy-hash="#tezoscrp" aria-label="Copy TezosCRP Chamber direct link" title="Copy TezosCRP Chamber link">🔗</button>
            <div class="card-inner">
                <div class="card-front tezoscrp-entry-front"><h2 class="stat-label" id="tezoscrp-entry-title">TezosCRP Recognition Hall</h2><div class="tezoscrp-entry-loading">Reading the official monthly archive…</div></div>
                <div class="card-back" aria-hidden="true"><h2 class="stat-label">TezosCRP</h2><div class="stat-value">Community recognition</div><p class="stat-description">Official category awards, months, and source receipts.</p></div>
            </div>
        `;
        grid.appendChild(card);
    }
    wireChamberLauncher(card, {
        open: openTezosCrpChamber,
        label: 'Open TezosCRP Recognition Hall',
        titleSelector: '#tezoscrp-entry-title, .stat-label'
    });
    return card;
}

function ensureOverlay() {
    let overlay = document.getElementById('tezoscrp-modal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'tezoscrp-modal';
    overlay.className = 'modal-overlay chamber-overlay tezoscrp-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content modal-large chamber-content tezoscrp-content" role="dialog" aria-modal="true" aria-labelledby="tezoscrp-title" tabindex="-1">
            <button class="modal-close chamber-close" type="button" aria-label="Close TezosCRP Chamber">&times;</button>
            <div class="chamber-body tezoscrp-body"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.chamber-close')?.addEventListener('click', closeTezosCrpChamber);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeTezosCrpChamber();
    });
    return overlay;
}

function readRouteState() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('view');
    state.view = VIEW_KEYS.includes(requested) ? requested : 'hall';
    const year = params.get('year');
    if (year && /^20\d{2}$/.test(year)) state.recordYear = year;
    const period = params.get('period');
    if (period && /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(period)) state.archivePeriod = period;
    const category = params.get('category');
    if (category) state.archiveCategory = category;
    const query = params.get('q');
    state.archiveQuery = state.view === 'archive' ? String(query || '').slice(0, 120) : '';
}

function syncRoute() {
    if (window.location.pathname.replace(/^\/+|\/+$/g, '') !== 'tezoscrp') return;
    const url = new URL(window.location.href);
    if (state.view === 'hall') url.searchParams.delete('view');
    else url.searchParams.set('view', state.view);
    if (state.view === 'records' && state.recordYear) url.searchParams.set('year', state.recordYear);
    else url.searchParams.delete('year');
    if (state.view === 'archive' && state.archivePeriod) url.searchParams.set('period', state.archivePeriod);
    else url.searchParams.delete('period');
    if (state.view === 'archive' && state.archiveCategory) url.searchParams.set('category', state.archiveCategory);
    else url.searchParams.delete('category');
    if (state.view === 'archive' && state.archiveQuery.trim()) url.searchParams.set('q', state.archiveQuery.trim());
    else url.searchParams.delete('q');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function roomHeader() {
    const categoryIcons = (summaryData?.current_categories || []).map((category) => (
        `<img src="${escapeHtml(category.icon)}" alt="" width="34" height="40" title="${escapeHtml(category.category)}" loading="lazy" decoding="async">`
    )).join('');
    return `
        <header class="tezoscrp-header">
            <div class="tezoscrp-system-strip" aria-label="Recognition Hall archive contract">
                <span>Human identity archive</span><span>Official sources</span><span>Monthly memory</span>
            </div>
            <div class="tezoscrp-hero-badges" aria-label="Nine current TezosCRP category badges">${categoryIcons}</div>
            <span class="tezoscrp-kicker">Tezos Commons · monthly since October 2020</span>
            <h1 class="chamber-title" id="tezoscrp-title">TezosCRP Recognition Hall</h1>
            <p class="tezoscrp-hero-lead">Who was recognized, how often, in which categories, and by which official monthly source.</p>
            <a class="tezoscrp-official-link" href="https://tezoscommons.org/rewards/" target="_blank" rel="noopener noreferrer">Official program ↗</a>
        </header>
        ${renderChamberVerdict({ key: 'tezoscrp', state: 'archive', sentence: `${formatNumber(summaryData?.totals?.periods)} official monthly rounds are recorded through ${shortPeriod(fullData?.program?.latest_award_period)}; category awards are not payout totals.`, receipts: [['Award listings', formatNumber(summaryData?.totals?.awards)], ['Identities', formatNumber(summaryData?.totals?.people)]], timestamp: summaryData?.generated_at })}
        ${overviewMetrics()}
        <div class="tezoscrp-truth-note"><strong>What is counted:</strong> one official category listing equals one award. Monthly recognitions and known published amounts remain separate; most posts do not state a per-person XTZ payout. <strong>Identity continuity:</strong> verified aliases share one record, every published name stays on its receipt, and uncertain lookalikes remain separate.</div>
        <nav class="tezoscrp-tabs" role="tablist" aria-label="TezosCRP Chamber views">
            ${VIEW_KEYS.map((view) => `<button type="button" id="tezoscrp-tab-${view}" role="tab" aria-selected="${state.view === view}" aria-controls="tezoscrp-view" tabindex="${state.view === view ? '0' : '-1'}" data-tezoscrp-view="${view}">${escapeHtml(VIEW_LABELS[view])}</button>`).join('')}
        </nav>
        <div class="tezoscrp-view" id="tezoscrp-view" role="tabpanel" aria-labelledby="tezoscrp-tab-${state.view}" tabindex="0"></div>
    `;
}

function overviewMetrics() {
    const totals = summaryData?.totals || {};
    return `
        <section class="tezoscrp-metrics" aria-label="TezosCRP archive totals">
            <div><span>Official awards</span><strong>${formatNumber(totals.awards)}</strong><small>category recognitions</small></div>
            <div><span>Community identities</span><strong>${formatNumber(totals.people)}</strong><small>after verified alias merges</small></div>
            <div><span>Monthly rounds</span><strong>${formatNumber(totals.periods)}</strong><small>${shortPeriod(fullData?.program?.first_award_period)} – ${shortPeriod(fullData?.program?.latest_award_period)}</small></div>
            <div><span>Category names</span><strong>${formatNumber(totals.categories)}</strong><small>current + historical</small></div>
        </section>
    `;
}

function personSearchText(person) {
    return [person.person_id, person.display_name, person.profile?.handle, ...(person.raw_names || []), ...(person.aliases || []), ...Object.keys(person.categories || {})].join(' ').toLowerCase();
}

function sortedPeople() {
    const query = state.hallQuery.trim().toLowerCase();
    const people = (fullData?.people_summary || []).filter((person) => !query || personSearchText(person).includes(query));
    const latest = (person) => person.periods?.at(-1) || '';
    people.sort((left, right) => {
        if (state.hallSort === 'months') return right.distinct_periods - left.distinct_periods || right.total_awards - left.total_awards || left.person_id.localeCompare(right.person_id);
        if (state.hallSort === 'recent') return latest(right).localeCompare(latest(left)) || right.total_awards - left.total_awards || left.person_id.localeCompare(right.person_id);
        return right.total_awards - left.total_awards || right.distinct_periods - left.distinct_periods || left.person_id.localeCompare(right.person_id);
    });
    return people;
}

function renderHallResults() {
    const slot = document.getElementById('tezoscrp-hall-results');
    if (!slot) return;
    const people = sortedPeople();
    const visible = people.slice(0, state.hallLimit);
    slot.innerHTML = people.length ? `
        <div class="tezoscrp-ranking-head"><span>Rank</span><span>Identity</span><span>Awards</span><span>Months</span><span>Latest</span></div>
        <ol class="tezoscrp-ranking">
            ${visible.map((person, index) => {
                const name = displayPerson(person);
                const topCategory = Object.entries(person.categories || {}).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
                return `<li data-tezoscrp-place="${index + 1}" class="${index < 3 ? 'is-podium ' : ''}${state.selectedPersonId === person.person_id ? 'is-selected' : ''}">
                    <button type="button" data-tezoscrp-person="${escapeHtml(person.person_id)}" aria-expanded="${state.selectedPersonId === person.person_id}">
                        <span class="tezoscrp-rank">${index + 1}</span>
                        <span class="tezoscrp-person"><span>${escapeHtml(name)}</span><small>${topCategory ? `${escapeHtml(topCategory[0])} · ${formatNumber(topCategory[1])}` : 'Recognition archive'}</small></span>
                        <strong>${formatNumber(person.total_awards)}</strong>
                        <span>${formatNumber(person.distinct_periods)}</span>
                        <time datetime="${escapeHtml(person.periods?.at(-1) || '')}">${escapeHtml(shortPeriod(person.periods?.at(-1)))}</time>
                    </button>
                </li>`;
            }).join('')}
        </ol>
        ${visible.length < people.length ? `<button class="tezoscrp-load-more" type="button" id="tezoscrp-hall-more">Show ${formatNumber(Math.min(PAGE_SIZE, people.length - visible.length))} more</button>` : ''}
    ` : '<div class="tezoscrp-empty"><strong>No recognition record matched.</strong><span>Try a handle, display name, alias, or category.</span></div>';
    slot.querySelectorAll('[data-tezoscrp-person]').forEach((button) => button.addEventListener('click', () => {
        state.selectedPersonId = state.selectedPersonId === button.dataset.tezoscrpPerson ? '' : button.dataset.tezoscrpPerson;
        renderHallResults();
        renderPersonDetail();
        if (state.selectedPersonId) document.getElementById('tezoscrp-person-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    slot.querySelector('#tezoscrp-hall-more')?.addEventListener('click', () => {
        state.hallLimit += PAGE_SIZE;
        renderHallResults();
    });
}

function renderPersonDetail() {
    const slot = document.getElementById('tezoscrp-person-detail');
    if (!slot) return;
    if (!state.selectedPersonId) {
        slot.innerHTML = '';
        slot.hidden = true;
        return;
    }
    const person = fullData.people_summary.find(({ person_id }) => person_id === state.selectedPersonId);
    if (!person) return;
    const rows = fullData.awards.filter(({ person_id }) => person_id === person.person_id).sort((left, right) => right.period.localeCompare(left.period));
    const latest = rows[0];
    slot.hidden = false;
    slot.innerHTML = `
        <div class="tezoscrp-person-detail-head">
            <div><span>Recognition record</span><h2>${profileLink(person, displayPerson(person))}</h2><p>${formatNumber(person.total_awards)} awards across ${formatNumber(person.distinct_periods)} ${person.distinct_periods === 1 ? 'month' : 'months'} and ${formatNumber(Object.keys(person.categories || {}).length)} ${Object.keys(person.categories || {}).length === 1 ? 'category' : 'categories'}.</p></div>
            <button type="button" id="tezoscrp-person-close" aria-label="Close recognition record">×</button>
        </div>
        <div class="tezoscrp-person-categories">${Object.entries(person.categories || {}).sort((left, right) => right[1] - left[1]).map(([category, count]) => `<span>${categoryMark(category)}<b>${escapeHtml(category)}</b><small>${formatNumber(count)}</small></span>`).join('')}</div>
        <div class="tezoscrp-receipts">
            ${rows.map((award) => `<article><div>${categoryMark(award.category)}<span><strong>${escapeHtml(award.category)}</strong><small>${escapeHtml(formatPeriod(award.period))}${hasPublishedAmount(award) ? ` · ${formatNumber(award.amount_tez)} ꜩ published` : ''}</small></span></div>${sourceLink(award)}</article>`).join('')}
        </div>
    `;
    slot.querySelector('#tezoscrp-person-close')?.addEventListener('click', () => {
        state.selectedPersonId = '';
        renderHallResults();
        renderPersonDetail();
    });
}

function renderHall() {
    const view = document.getElementById('tezoscrp-view');
    view.innerHTML = `
        <section class="tezoscrp-panel tezoscrp-hall-panel">
            <div class="tezoscrp-panel-head"><div><span>All-time official record</span><h2>Recognition Hall</h2><p>Ranked by category awards, with recognized months shown separately.</p></div></div>
            <div class="tezoscrp-controls">
                <label><span>Find a person or category</span><input id="tezoscrp-hall-search" type="search" value="${escapeHtml(state.hallQuery)}" placeholder="Handle, name, alias, category…" autocomplete="off"></label>
                <label><span>Order</span><select id="tezoscrp-hall-sort"><option value="awards" ${state.hallSort === 'awards' ? 'selected' : ''}>Most awards</option><option value="months" ${state.hallSort === 'months' ? 'selected' : ''}>Most months</option><option value="recent" ${state.hallSort === 'recent' ? 'selected' : ''}>Most recent</option></select></label>
            </div>
            <div id="tezoscrp-hall-results"></div>
        </section>
        <section class="tezoscrp-panel tezoscrp-person-detail" id="tezoscrp-person-detail" hidden></section>
    `;
    const search = view.querySelector('#tezoscrp-hall-search');
    search?.addEventListener('input', () => {
        state.hallQuery = search.value;
        state.hallLimit = PAGE_SIZE;
        renderHallResults();
    });
    view.querySelector('#tezoscrp-hall-sort')?.addEventListener('change', (event) => {
        state.hallSort = event.target.value;
        state.hallLimit = PAGE_SIZE;
        renderHallResults();
    });
    renderHallResults();
    renderPersonDetail();
}

function groupAwardsByCategory(awards) {
    const grouped = new Map();
    for (const award of awards) {
        if (!grouped.has(award.category)) grouped.set(award.category, []);
        grouped.get(award.category).push(award);
    }
    const order = new Map(categoryDefinitions().map(({ category }, index) => [category, index]));
    return [...grouped.entries()].sort((left, right) => (order.get(left[0]) ?? 99) - (order.get(right[0]) ?? 99) || left[0].localeCompare(right[0]));
}

function renderLatest() {
    const view = document.getElementById('tezoscrp-view');
    const period = fullData.program.latest_award_period;
    const awards = fullData.awards.filter((award) => award.period === period);
    const article = articleForPeriod(period);
    const articleUrl = safeUrl(article?.url);
    view.innerHTML = `
        <section class="tezoscrp-latest-hero">
            <div><span>Latest official round</span><h2>${escapeHtml(formatPeriod(period))}</h2><p>${formatNumber(awards.length)} category recognitions across ${formatNumber(new Set(awards.map(({ person_id }) => person_id)).size)} community identities.</p></div>
            ${articleUrl ? `<a href="${escapeHtml(articleUrl)}" target="_blank" rel="noopener noreferrer">Read the official announcement ↗</a>` : ''}
        </section>
        <div class="tezoscrp-latest-grid">
            ${groupAwardsByCategory(awards).map(([category, rows]) => `<section class="tezoscrp-category-winners">
                <header>${categoryMark(category)}<div><span>${categoryDefinition(category) ? 'Current category' : 'Special recognition'}</span><h3>${escapeHtml(category)}</h3></div><strong>${formatNumber(rows.length)}</strong></header>
                <div>${rows.map((award) => `<span>${profileLink(personForAward(award), award.recipient_name || award.handle || award.person_id)}<small>${sourceLink(award, 'Source')}</small></span>`).join('')}</div>
            </section>`).join('')}
        </div>
    `;
}

function annualStandings(year) {
    const byPerson = new Map();
    for (const award of fullData?.awards || []) {
        if (!String(award.period || '').startsWith(`${year}-`)) continue;
        if (!byPerson.has(award.person_id)) byPerson.set(award.person_id, { awards: 0, periods: new Set(), categories: new Set() });
        const record = byPerson.get(award.person_id);
        record.awards += 1;
        record.periods.add(award.period);
        record.categories.add(award.category);
    }
    const people = new Map((fullData?.people_summary || []).map((person) => [person.person_id, person]));
    return [...byPerson.entries()].map(([personId, record]) => ({
        person: people.get(personId) || { person_id: personId },
        awards: record.awards,
        months: record.periods.size,
        categories: record.categories.size
    })).sort((left, right) => right.awards - left.awards
        || right.months - left.months
        || right.categories - left.categories
        || left.person.person_id.localeCompare(right.person.person_id));
}

function openRecordIdentity(personId) {
    state.hallQuery = '';
    state.hallLimit = PAGE_SIZE;
    state.selectedPersonId = personId;
    selectView('hall');
    requestAnimationFrame(() => document.getElementById('tezoscrp-person-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function renderRecords() {
    const view = document.getElementById('tezoscrp-view');
    const years = summaryData?.records?.years || [];
    const availableYears = new Set(years.map(({ year }) => String(year)));
    if (!availableYears.has(state.recordYear)) state.recordYear = String(years[0]?.year || '');
    const annual = years.find(({ year }) => String(year) === state.recordYear) || years[0] || null;
    const standings = annualStandings(state.recordYear);
    const categoryRecords = summaryData?.records?.categories || [];
    const currentCategories = categoryRecords.filter(({ current }) => current);
    const historicalCategories = categoryRecords.filter(({ current }) => !current);
    const leaderNames = annual?.leaders?.map(({ display_name: name }) => name) || [];
    const leaderCopy = leaderNames.length === 1
        ? `${leaderNames[0]} leads ${annual.year} with ${formatNumber(annual.record)} official recognitions.`
        : `${formatNumber(leaderNames.length)} identities share the ${annual?.year || ''} record with ${formatNumber(annual?.record)} recognitions each.`;
    const compactNames = (leaders, limit = 3) => {
        const names = (leaders || []).slice(0, limit).map(({ display_name: name }) => name);
        const remaining = Math.max(0, (leaders?.length || 0) - names.length);
        return `${names.join(', ')}${remaining ? ` +${formatNumber(remaining)} more` : ''}`;
    };
    const holderCard = (row) => `<button type="button" class="tezoscrp-record-holder-card ${row.current ? 'is-current' : 'is-historical'}" data-tezoscrp-record-category="${escapeHtml(row.category)}">
        <span class="tezoscrp-record-holder-mark">${categoryMark(row.category)}</span>
        <span class="tezoscrp-record-holder-type">${row.current ? 'Current category record' : 'Historical category record'}</span>
        <strong>${escapeHtml(row.category)}</strong>
        <span class="tezoscrp-record-holder-names">${escapeHtml(compactNames(row.leaders))}</span>
        <span class="tezoscrp-record-holder-total"><b>${formatNumber(row.record)}</b> recognitions${row.leaders?.length > 1 ? ` · ${formatNumber(row.leaders.length)}-way tie` : ''}</span>
    </button>`;
    let previousAwards = null;
    let competitionRank = 0;

    view.innerHTML = `
        <section class="tezoscrp-record-hero">
            <div><span>Recognition record desk</span><h2>Category and yearly records</h2><p>Official category listings are compared within their natural category or calendar year. Ties stay ties; no wallet score, payout estimate, or subjective points are added.</p></div>
            <label><span>Year</span><select id="tezoscrp-record-year">${years.map(({ year }) => `<option value="${year}" ${String(year) === state.recordYear ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
        </section>
        ${annual ? `<section class="tezoscrp-record-year-summary">
            <div class="tezoscrp-record-year-lead"><span>${annual.year} official record</span><h3>${escapeHtml(leaderCopy)}</h3><p>${escapeHtml(compactNames(annual.leaders, 6))}</p></div>
            <div class="tezoscrp-record-year-metrics">
                <span><b>${formatNumber(annual.award_rows)}</b><small>recognitions</small></span>
                <span><b>${formatNumber(annual.identities)}</b><small>identities</small></span>
                <span><b>${formatNumber(annual.periods)}</b><small>monthly rounds</small></span>
                <span><b>${formatNumber(annual.categories)}</b><small>category names</small></span>
            </div>
        </section>` : ''}
        <section class="tezoscrp-record-section">
            <div class="tezoscrp-record-section-head"><div><span>Annual leaders</span><h3>Every calendar-year record</h3></div><p>A partial first or current year remains labeled by its actual monthly coverage.</p></div>
            <div class="tezoscrp-record-years">${years.map((record) => `<button type="button" class="${String(record.year) === state.recordYear ? 'is-selected' : ''}" data-tezoscrp-record-year="${record.year}"><span>${record.year}</span><strong>${escapeHtml(compactNames(record.leaders, 2))}</strong><small>${formatNumber(record.record)} awards · ${formatNumber(record.periods)} months${record.leaders.length > 1 ? ` · ${formatNumber(record.leaders.length)} tied` : ''}</small></button>`).join('')}</div>
        </section>
        <section class="tezoscrp-record-section">
            <div class="tezoscrp-record-section-head"><div><span>${escapeHtml(state.recordYear)} standings</span><h3>Most recognized identities</h3></div><p>Ranks compare award rows first; months and category breadth are shown separately.</p></div>
            <div class="tezoscrp-record-board-head"><span>Rank</span><span>Identity</span><span>Awards</span><span>Months</span><span>Categories</span></div>
            <ol class="tezoscrp-record-board">${standings.slice(0, 20).map((row, index) => {
                if (row.awards !== previousAwards) competitionRank = index + 1;
                previousAwards = row.awards;
                const leader = row.awards === annual?.record;
                return `<li class="${leader ? 'is-record-leader' : ''}" data-tezoscrp-record-rank="${competitionRank}"><button type="button" data-tezoscrp-record-person="${escapeHtml(row.person.person_id)}"><span>${competitionRank}</span><span><strong>${escapeHtml(displayPerson(row.person))}</strong><small>${leader && annual?.leaders?.length > 1 ? 'Joint annual leader' : leader ? 'Annual leader' : `${formatNumber(row.categories)} category names`}</small></span><b>${formatNumber(row.awards)}</b><span>${formatNumber(row.months)}</span><span>${formatNumber(row.categories)}</span></button></li>`;
            }).join('')}</ol>
        </section>
        <section class="tezoscrp-record-section">
            <div class="tezoscrp-record-section-head"><div><span>All-time category records</span><h3>Current category record holders</h3></div><p>Open a record to inspect every source-receipted recognition in that category.</p></div>
            <div class="tezoscrp-record-holder-grid">${currentCategories.map(holderCard).join('')}</div>
            <details class="tezoscrp-record-history"><summary>${formatNumber(historicalCategories.length)} historical and special category records</summary><div class="tezoscrp-record-holder-grid">${historicalCategories.map(holderCard).join('')}</div></details>
        </section>
    `;
    view.querySelector('#tezoscrp-record-year')?.addEventListener('change', (event) => {
        state.recordYear = event.target.value;
        syncRoute();
        renderRecords();
    });
    view.querySelectorAll('[data-tezoscrp-record-year]').forEach((button) => button.addEventListener('click', () => {
        state.recordYear = button.dataset.tezoscrpRecordYear;
        syncRoute();
        renderRecords();
    }));
    view.querySelectorAll('[data-tezoscrp-record-person]').forEach((button) => button.addEventListener('click', () => openRecordIdentity(button.dataset.tezoscrpRecordPerson)));
    view.querySelectorAll('[data-tezoscrp-record-category]').forEach((button) => button.addEventListener('click', () => {
        state.archiveCategory = button.dataset.tezoscrpRecordCategory;
        state.archivePeriod = '';
        state.archiveQuery = '';
        state.archiveLimit = PAGE_SIZE;
        selectView('archive');
    }));
}

function categoryLeader(category) {
    return (fullData.people_summary || [])
        .filter((person) => Number(person.categories?.[category]) > 0)
        .sort((left, right) => Number(right.categories[category]) - Number(left.categories[category]) || right.total_awards - left.total_awards || left.person_id.localeCompare(right.person_id))[0] || null;
}

function renderCategories() {
    const view = document.getElementById('tezoscrp-view');
    const current = categoryDefinitions();
    const currentNames = new Set(current.map(({ category }) => category));
    const historical = fullData.category_summary.filter(({ category }) => !currentNames.has(category));
    const card = (row, isCurrent) => {
        const leader = categoryLeader(row.category);
        const definition = categoryDefinition(row.category);
        return `<button type="button" class="tezoscrp-category-card ${isCurrent ? 'is-current' : 'is-historical'}" data-tezoscrp-category="${escapeHtml(row.category)}">
            ${categoryMark(row.category)}
            <span>${isCurrent ? 'Current TezosCRP category' : 'Historical category'}</span>
            <h3>${escapeHtml(row.category)}</h3>
            <p>${escapeHtml(definition?.description || 'Preserved under the original official category name used at the time.')}</p>
            <div><strong>${formatNumber(row.award_rows)}</strong><small>awards</small></div>
            ${leader ? `<em>Most recognized: ${escapeHtml(displayPerson(leader))} · ${formatNumber(leader.categories[row.category])}</em>` : ''}
        </button>`;
    };
    view.innerHTML = `
        <section class="tezoscrp-panel-head tezoscrp-categories-head"><div><span>Category map</span><h2>Nine current badges, full historical memory</h2><p>The official Tezos Commons icons belong to the current category set. Retired and one-off categories keep a neutral archive seal so history is not rewritten.</p></div></section>
        <div class="tezoscrp-category-grid">${current.map((row) => card(row, true)).join('')}</div>
        <details class="tezoscrp-historical-categories"><summary>${formatNumber(historical.length)} historical and special categories</summary><div class="tezoscrp-category-grid">${historical.map((row) => card(row, false)).join('')}</div></details>
    `;
    view.querySelectorAll('[data-tezoscrp-category]').forEach((button) => button.addEventListener('click', () => {
        state.archiveCategory = button.dataset.tezoscrpCategory;
        state.archivePeriod = '';
        state.archiveQuery = '';
        state.archiveLimit = PAGE_SIZE;
        selectView('archive');
    }));
}

function archiveRows() {
    const query = state.archiveQuery.trim().toLowerCase();
    return fullData.awards.filter((award) => {
        if (state.archivePeriod && award.period !== state.archivePeriod) return false;
        if (state.archiveCategory && award.category !== state.archiveCategory) return false;
        if (!query) return true;
        const person = fullData.people_summary.find(({ person_id }) => person_id === award.person_id);
        return [award.recipient_name, award.recipient_raw, award.handle, award.category, award.period, ...(person?.aliases || []), ...(person?.raw_names || [])]
            .join(' ').toLowerCase().includes(query);
    }).sort((left, right) => right.period.localeCompare(left.period) || left.category.localeCompare(right.category) || left.recipient_name.localeCompare(right.recipient_name));
}

function renderArchiveRows() {
    const slot = document.getElementById('tezoscrp-archive-results');
    if (!slot) return;
    const rows = archiveRows();
    const visible = rows.slice(0, state.archiveLimit);
    slot.innerHTML = rows.length ? `
        <div class="tezoscrp-archive-count">Showing ${formatNumber(visible.length)} of ${formatNumber(rows.length)} matching recognitions</div>
        <div class="tezoscrp-archive-list">${visible.map((award) => `<article>
            <time datetime="${escapeHtml(award.period)}">${escapeHtml(shortPeriod(award.period))}</time>
            ${categoryMark(award.category)}
            <div>${profileLink(personForAward(award), award.recipient_name || award.handle || award.person_id)}<small>${escapeHtml(award.category)}${hasPublishedAmount(award) ? ` · ${formatNumber(award.amount_tez)} ꜩ published` : ''}</small></div>
            ${sourceLink(award)}
        </article>`).join('')}</div>
        ${visible.length < rows.length ? `<button class="tezoscrp-load-more" id="tezoscrp-archive-more" type="button">Show ${formatNumber(Math.min(PAGE_SIZE, rows.length - visible.length))} more</button>` : ''}
    ` : '<div class="tezoscrp-empty"><strong>No award rows matched.</strong><span>Clear a filter or try a different identity.</span></div>';
    slot.querySelector('#tezoscrp-archive-more')?.addEventListener('click', () => {
        state.archiveLimit += PAGE_SIZE;
        renderArchiveRows();
    });
}

function renderArchive() {
    const view = document.getElementById('tezoscrp-view');
    const periods = [...new Set(fullData.awards.map(({ period }) => period))].sort().reverse();
    const categories = fullData.category_summary.map(({ category }) => category).sort((left, right) => left.localeCompare(right));
    view.innerHTML = `
        <section class="tezoscrp-panel tezoscrp-archive-panel">
            <div class="tezoscrp-panel-head"><div><span>Source-receipted record</span><h2>Monthly Archive</h2><p>Every attached award row retains its official Tezos Commons article or X-post source.</p></div></div>
            <div class="tezoscrp-controls tezoscrp-archive-controls">
                <label><span>Month</span><select id="tezoscrp-archive-period"><option value="">All months</option>${periods.map((period) => `<option value="${period}" ${state.archivePeriod === period ? 'selected' : ''}>${escapeHtml(formatPeriod(period))}</option>`).join('')}</select></label>
                <label><span>Category</span><select id="tezoscrp-archive-category"><option value="">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}" ${state.archiveCategory === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></label>
                <label class="tezoscrp-archive-search"><span>Identity</span><input id="tezoscrp-archive-search" type="search" value="${escapeHtml(state.archiveQuery)}" placeholder="Handle, name, or alias…" autocomplete="off"></label>
            </div>
            <div id="tezoscrp-archive-results"></div>
        </section>
    `;
    view.querySelector('#tezoscrp-archive-period')?.addEventListener('change', (event) => {
        state.archivePeriod = event.target.value;
        state.archiveLimit = PAGE_SIZE;
        syncRoute();
        renderArchiveRows();
    });
    view.querySelector('#tezoscrp-archive-category')?.addEventListener('change', (event) => {
        state.archiveCategory = event.target.value;
        state.archiveLimit = PAGE_SIZE;
        syncRoute();
        renderArchiveRows();
    });
    const search = view.querySelector('#tezoscrp-archive-search');
    search?.addEventListener('input', () => {
        state.archiveQuery = search.value;
        state.archiveLimit = PAGE_SIZE;
        syncRoute();
        renderArchiveRows();
    });
    renderArchiveRows();
}

function renderView() {
    if (state.view === 'records') renderRecords();
    else if (state.view === 'latest') renderLatest();
    else if (state.view === 'categories') renderCategories();
    else if (state.view === 'archive') renderArchive();
    else renderHall();
}

function selectView(view) {
    if (!VIEW_KEYS.includes(view)) return;
    state.view = view;
    syncRoute();
    document.querySelectorAll('#tezoscrp-modal [data-tezoscrp-view]').forEach((tab) => {
        const selected = tab.dataset.tezoscrpView === view;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    document.getElementById('tezoscrp-view')?.setAttribute('aria-labelledby', `tezoscrp-tab-${view}`);
    renderView();
}

function wireTabs() {
    const tabs = document.querySelector('.tezoscrp-tabs');
    tabs?.querySelectorAll('[data-tezoscrp-view]').forEach((tab) => tab.addEventListener('click', () => selectView(tab.dataset.tezoscrpView)));
    tabs?.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const controls = [...tabs.querySelectorAll('[data-tezoscrp-view]')];
        const index = controls.indexOf(event.target);
        if (index < 0) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = controls.length - 1;
        else if (event.key === 'ArrowRight') next = (index + 1) % controls.length;
        else next = (index - 1 + controls.length) % controls.length;
        selectView(controls[next].dataset.tezoscrpView);
        controls[next].focus({ preventScroll: true });
    });
}

function renderLoading() {
    const body = document.querySelector('#tezoscrp-modal .tezoscrp-body');
    if (!body) return;
    body.innerHTML = `
        <div class="chamber-loading" aria-live="polite">
            <h1 id="tezoscrp-title" class="tezoscrp-visually-hidden">TezosCRP Recognition Hall</h1>
            <div class="chamber-loading-text">Opening the recognition archive…</div>
            <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
            <div class="chamber-loading-subtext">2,000+ official award receipts · loaded only when requested</div>
        </div>
    `;
}

function renderError(error) {
    const body = document.querySelector('#tezoscrp-modal .tezoscrp-body');
    if (!body) return;
    body.innerHTML = `
        <div class="chamber-error tezoscrp-error">
            <div class="chamber-error-icon">◇</div>
            <h1 id="tezoscrp-title">Recognition archive unavailable</h1>
            <p>${escapeHtml(error?.message || 'The same-origin TezosCRP dataset did not answer.')}</p>
            <button class="chamber-retry-btn" id="tezoscrp-retry" type="button">Retry</button>
        </div>
    `;
    body.querySelector('#tezoscrp-retry')?.addEventListener('click', () => loadRoom({ force: true }));
}

async function loadRoom({ force = false } = {}) {
    renderLoading();
    try {
        await Promise.all([loadSummary({ force }), loadDataset({ force })]);
        const body = document.querySelector('#tezoscrp-modal .tezoscrp-body');
        if (!body || !document.getElementById('tezoscrp-modal')?.classList.contains('active')) return;
        body.innerHTML = roomHeader();
        wireTabs();
        renderView();
        renderEntryCard(summaryData);
    } catch (error) {
        console.warn('TezosCRP archive load failed', error);
        renderError(error);
    }
}

export async function openTezosCrpChamber({ isCurrent = () => true } = {}) {
    await ensureStyles();
    if (!isCurrent()) return;
    const overlay = ensureOverlay();
    if (!overlay.classList.contains('active')) {
        savedBodyOverflow = document.body.style.overflow;
        savedHtmlOverflow = document.documentElement.style.overflow;
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    readRouteState();
    overlay.classList.add('active');
    activateChamberDialog(overlay, {
        close: closeTezosCrpChamber,
        dialogSelector: '.tezoscrp-content',
        titleId: 'tezoscrp-title',
        restoreFocusSelector: '#tezoscrp-entry-card'
    });
    const content = overlay.querySelector('.tezoscrp-content');
    if (content) content.scrollTop = 0;
    await loadRoom();
}

export function closeTezosCrpChamber() {
    const overlay = document.getElementById('tezoscrp-modal');
    if (!overlay?.classList.contains('active')) return;
    // A standalone boot owner can prepare the dashboard before releasing the
    // reader's existing room. Normal dashboard launches have no interceptor.
    if (!requestChamberClose(overlay)) return;
    overlay.classList.remove('active');
    deactivateChamberDialog(overlay);
    document.body.style.overflow = savedBodyOverflow || '';
    document.documentElement.style.overflow = savedHtmlOverflow || '';
}

export function initTezosCrpChamber() {
    ensureStyles().catch((error) => console.warn('TezosCRP styles unavailable', error));
    if (!ensureEntryCard()) return;
    window.openTezosCrpChamber = openTezosCrpChamber;
    window.closeTezosCrpChamber = closeTezosCrpChamber;
    if (summaryData) { renderEntryCard(summaryData); return; }
    const queue = () => loadSummary().then(renderEntryCard).catch(renderEntryError);
    if ('requestIdleCallback' in window) window.requestIdleCallback(queue, { timeout: 5000 });
    else window.setTimeout(queue, 1800);
}
