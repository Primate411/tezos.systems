import {
    SITE_MAP,
    findCurrentSiteMapContext,
    findCurrentSiteMapEntry,
    findSiteMapEntry,
    siteMapRoute,
    searchSiteMap,
    searchSiteMapIntents,
    suggestSiteMapQuery
} from '../core/site-map.js';
import { loadSearchCatalog, searchFirstPartyCatalog } from '../core/search-catalog.js';
import { parseSearchEntity } from '../core/search-entities.js';
import { renderSiteHandoff } from '../core/site-handoff.js';
import { initSiteJourneyCapture, siteMapJourneyLinks } from '../core/site-journey.js';
import { initFooterDelegation } from '../core/wallet.js';

const FALLBACK_RELATED_IDS = ['pulse', 'staking-chamber', 'maxis', 'health'];
const renderedFooters = new WeakSet();
let headingSequence = 0;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function normalizePath(pathname) {
    const path = String(pathname || '/').replace(/\/index\.html$/, '/');
    return path === '/' || path.endsWith('/') ? path : `${path}/`;
}

function entryRoute(entry) {
    return siteMapRoute(entry) || entry?.href || entry?.hash || '/';
}

function contextEntry(root = document.documentElement) {
    const contextId = root?.closest?.('[data-site-context]')?.getAttribute('data-site-context')
        || root?.getAttribute?.('data-site-context')
        || document.body?.getAttribute('data-site-context');
    if (contextId) {
        const explicit = findSiteMapEntry(contextId);
        if (explicit) return explicit;
    }
    return findCurrentSiteMapEntry() || findSiteMapEntry('home') || SITE_MAP[0] || null;
}

function isActive(entry, current = contextEntry()) {
    if (!entry) return false;
    if (current?.id === entry.id) return true;
    try {
        const href = new URL(entryRoute(entry), window.location.origin);
        return normalizePath(window.location.pathname) === normalizePath(href.pathname);
    } catch {
        return false;
    }
}

function navEntryHtml(entry, current) {
    const active = isActive(entry, current);
    return `<li><a href="${escapeHtml(entryRoute(entry))}"${active ? ' class="active" aria-current="page"' : ''}>${escapeHtml(entry.title.replace(/ Guide$/, ''))}</a></li>`;
}

function renderNav() {
    const nav = document.querySelector('[data-site-nav], .landing-nav');
    if (!nav) return;
    const current = contextEntry(nav);
    const ids = ['staking-chamber', 'governance-guide', 'bakers-guide', 'anthology', 'health', 'home'];
    nav.classList.add('landing-nav');
    nav.setAttribute('data-site-nav', 'true');
    nav.setAttribute('aria-label', 'Tezos Systems guides');
    nav.innerHTML = `
        <a href="/" class="landing-nav-logo">TEZOS SYSTEMS</a>
        <form class="landing-nav-search" role="search" autocomplete="off">
            <input type="search" name="q" placeholder="Find a room or guide" aria-label="Search Tezos Systems" aria-controls="landing-nav-search-results" aria-expanded="false">
            <div class="landing-nav-search-results" id="landing-nav-search-results" role="listbox" hidden></div>
        </form>
        <details class="landing-nav-menu" open>
            <summary class="landing-nav-toggle"><span>Explore</span><span aria-hidden="true">⌄</span></summary>
            <ul class="landing-nav-links">
                ${ids.map((id) => findSiteMapEntry(id)).filter(Boolean).map((entry) => navEntryHtml(entry, current)).join('')}
            </ul>
        </details>
    `;

    const searchForm = nav.querySelector('.landing-nav-search');
    const searchInput = searchForm?.querySelector('input');
    const searchResults = searchForm?.querySelector('.landing-nav-search-results');
    let searchVersion = 0;
    let selectedIndex = -1;
    let renderedLinks = [];
    const closeSearch = () => {
        if (!searchResults || !searchInput) return;
        searchResults.hidden = true;
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.removeAttribute('aria-activedescendant');
        selectedIndex = -1;
    };
    const setSelectedIndex = (next) => {
        if (!searchInput || !renderedLinks.length) return;
        selectedIndex = (next + renderedLinks.length) % renderedLinks.length;
        renderedLinks.forEach((link, index) => {
            link.classList.toggle('is-selected', index === selectedIndex);
            link.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
        });
        searchInput.setAttribute('aria-activedescendant', renderedLinks[selectedIndex].id);
        renderedLinks[selectedIndex].scrollIntoView({ block: 'nearest' });
    };
    const renderSearch = async () => {
        if (!searchResults || !searchInput) return;
        const query = searchInput.value.trim();
        if (!query) { closeSearch(); return; }
        const version = ++searchVersion;
        await loadSearchCatalog();
        if (version !== searchVersion || query !== searchInput.value.trim()) return;
        const entity = parseSearchEntity(query);
        const matches = [
            ...searchSiteMapIntents(query).map((intent) => ({
                id: `intent-${intent.parentId}-${intent.id}`,
                title: intent.title,
                detail: intent.detail || intent.group,
                href: intent.href
            })),
            ...searchSiteMap(query).map((entry) => ({
                id: `entry-${entry.id}`,
                title: entry.title,
                detail: entry.detail || entry.group,
                href: entryRoute(entry)
            })),
            ...searchFirstPartyCatalog(query, { limit: 8 }).map((row) => ({
                id: `catalog-${row.id}`,
                title: row.title,
                detail: row.detail || row.group,
                href: row.href
            })),
            ...(entity ? [{
                id: `entity-${entity.kind}`,
                title: 'Inspect this blockchain identifier',
                detail: 'Continue in the native Tezos Systems search lens',
                href: `/#search=${encodeURIComponent(query)}`
            }] : [])
        ].filter((match, index, rows) => rows.findIndex((row) => row.href === match.href) === index).slice(0, 8);
        const suggestion = matches.length ? null : suggestSiteMapQuery(query);
        if (suggestion) {
            matches.push({
                id: 'spelling-suggestion',
                title: `Did you mean “${suggestion.corrected}”?`,
                detail: 'Continue in the complete Tezos Systems search',
                href: `/#search=${encodeURIComponent(suggestion.corrected)}`
            });
        }
        searchResults.innerHTML = matches.length
            ? matches.map((match, index) => `<a id="landing-search-option-${index}" role="option" aria-selected="false" href="${escapeHtml(match.href)}"><strong>${escapeHtml(match.title)}</strong><span>${escapeHtml(match.detail || '')}</span></a>`).join('')
            : '<p role="status">No matching destination, first-party record, or recognizable blockchain identifier.</p>';
        searchResults.hidden = false;
        searchInput.setAttribute('aria-expanded', 'true');
        renderedLinks = [...searchResults.querySelectorAll('a[role="option"]')];
        selectedIndex = -1;
        searchInput.removeAttribute('aria-activedescendant');
    };
    searchInput?.addEventListener('input', renderSearch);
    searchInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { closeSearch(); searchInput.blur(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedIndex(selectedIndex + (event.key === 'ArrowDown' ? 1 : -1));
        }
        if (event.key === 'Enter' && selectedIndex >= 0) {
            event.preventDefault();
            window.location.assign(renderedLinks[selectedIndex].href);
        }
    });
    searchForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const first = selectedIndex >= 0 ? renderedLinks[selectedIndex] : searchResults?.querySelector('a');
        if (first) window.location.assign(first.href);
    });
    document.addEventListener('keydown', (event) => {
        const tag = document.activeElement?.tagName;
        if (event.key !== '/' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
        event.preventDefault();
        searchInput?.focus();
        searchInput?.select();
        renderSearch();
    });

    const menu = nav.querySelector('.landing-nav-menu');
    const toggle = nav.querySelector('.landing-nav-toggle');
    const mobileMenuMedia = window.matchMedia('(max-width: 640px)');
    const syncMenuMode = () => {
        if (mobileMenuMedia.matches) menu?.removeAttribute('open');
        else menu?.setAttribute('open', '');
    };
    syncMenuMode();
    mobileMenuMedia.addEventListener?.('change', syncMenuMode);
    menu?.addEventListener('click', (event) => {
        if (mobileMenuMedia.matches && event.target.closest('a')) menu.removeAttribute('open');
    });
    document.addEventListener('click', (event) => {
        if (mobileMenuMedia.matches && menu?.open && !nav.contains(event.target)) menu.removeAttribute('open');
        if (searchForm && !searchForm.contains(event.target)) closeSearch();
    });
    nav.addEventListener('keydown', (event) => {
        if (!mobileMenuMedia.matches || event.key !== 'Escape' || !menu?.open) return;
        event.preventDefault();
        menu.removeAttribute('open');
        toggle?.focus();
    });
}

function normalizeEntries(entries) {
    return (Array.isArray(entries) ? entries : [])
        .map((entry) => typeof entry === 'string' ? findSiteMapEntry(entry) : entry)
        .filter(Boolean);
}

function currentContext(current) {
    const routeContext = findCurrentSiteMapContext();
    if (routeContext.entryId === current?.id) return routeContext;
    return {
        id: current?.id || 'home',
        entry: current || findSiteMapEntry('home'),
        intent: null,
        entryId: current?.id || 'home',
        intentId: null,
        route: current?.href || '/'
    };
}

function relatedEntries(context, limit) {
    const related = context ? normalizeEntries(siteMapJourneyLinks(context, { limit })) : [];
    if (related.length) return related.slice(0, limit);
    return FALLBACK_RELATED_IDS
        .map((id) => findSiteMapEntry(id))
        .filter((entry) => entry && entry.id !== context?.entryId)
        .slice(0, limit);
}

function relatedCardHtml(entry, context) {
    return `
        <a class="site-map-link site-wayfinder-card" href="${escapeHtml(entryRoute(entry))}" data-site-journey data-journey-from="${escapeHtml(context.intentId || context.entryId)}" data-journey-from-entry="${escapeHtml(context.entryId)}"${context.intentId ? ` data-journey-from-intent="${escapeHtml(context.intentId)}"` : ''} data-journey-to="${escapeHtml(entry.id)}" data-journey-surface="generic-wayfinder" data-journey-reason="${escapeHtml(entry.journeyReason || 'related-destination')}">
            <span>${escapeHtml(entry.group || 'Tezos Systems')}</span>
            <strong>${escapeHtml(entry.title)}</strong>
            <small>${escapeHtml(entry.detail || '')}</small>
            <em>Open <span aria-hidden="true">→</span></em>
        </a>
    `;
}

function hasFollowingFooter(container) {
    return Array.from(document.querySelectorAll('[data-site-footer], .landing-footer'))
        .some((footer) => Boolean(container.compareDocumentPosition(footer) & 4));
}

function renderCirculation() {
    document.querySelectorAll('[data-site-circulation]').forEach((container) => {
        const current = contextEntry(container);
        const context = currentContext(current);
        const requestedLimit = Number.parseInt(container.getAttribute('data-site-related-limit') || '4', 10);
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 2), 6) : 4;
        const entries = relatedEntries(context, limit);
        const headingId = `site-circulation-title-${++headingSequence}`;
        const discoveryActions = hasFollowingFooter(container) ? '' : `
            <nav class="site-map-cta site-wayfinder-actions" aria-label="Tezos Systems discovery tools">
                <a href="/#search">Search everything</a>
                <a href="/#site-map">Full map</a>
            </nav>
        `;
        container.classList.add('site-map-related', 'site-wayfinder');
        container.setAttribute('aria-labelledby', headingId);
        container.innerHTML = `
            <div class="site-map-head site-wayfinder-head">
                <div>
                    <span class="site-map-kicker">Keep exploring</span>
                    <h2 id="${headingId}">${escapeHtml(current ? `Next from ${current.title}` : 'Choose your next Tezos path')}</h2>
                </div>
                ${discoveryActions}
            </div>
            <div class="site-map-related-grid site-wayfinder-grid">
                ${entries.map((entry) => relatedCardHtml(entry, context)).join('')}
            </div>
        `;
    });
}

function originalAttributionHtml(footer) {
    const explicit = footer.querySelector('[data-site-footer-attribution]');
    if (explicit) return explicit.innerHTML.trim();
    const raw = footer.innerHTML.trim();
    return raw && !footer.querySelector('.site-map-footer-map') ? raw : '';
}

function defaultAttributionHtml() {
    return `
        <span class="powered-by">Built by <a href="mailto:primate@tez.capital">Primate</a> — baker behind <a href="https://x.com/BakingBenjamins" target="_blank" rel="noopener"><strong>Baking Benjamins</strong></a> and co-founding member of <a href="https://tez.capital" target="_blank" rel="noopener">Tez Capital</a></span>
        <span class="footer-baker-support">Support this work: delegate or stake to <a href="/#my-baker=bakingbenjamins.tez">BakingBenjamins.tez</a> or <a href="/#my-baker=baking.tez">baking.tez</a></span>
        <span class="footer-source-line">Data from TzKT, Teztale, OBJKT, and Supabase · RPC by <a href="https://tez.capital" target="_blank" rel="noopener">Tez Capital</a></span>
        <span class="footer-contribute"><a href="/landing.html">Start here</a></span>
    `;
}

function withLegalAttribution(attributionHtml) {
    const attribution = attributionHtml || defaultAttributionHtml();
    if (/MPL-2\.0/.test(attribution)) return attribution;
    return `${attribution}<span class="footer-contribute"><a href="https://github.com/Primate411/tezos.systems" target="_blank" rel="noopener">Source</a> · <a href="/LICENSE" rel="license">MPL-2.0</a></span>`;
}

function renderFooter() {
    document.querySelectorAll('[data-site-footer], .landing-footer').forEach((footer) => {
        if (renderedFooters.has(footer)) return;
        renderedFooters.add(footer);
        const current = contextEntry(footer);
        const attributionHtml = originalAttributionHtml(footer);
        const handoff = footer.previousElementSibling?.matches('[data-site-handoff]')
            ? footer.previousElementSibling
            : document.createElement('section');
        if (!handoff.isConnected) footer.before(handoff);
        handoff.setAttribute('data-site-handoff', 'true');
        if (current?.id) handoff.setAttribute('data-site-context', current.id);
        const context = currentContext(current);
        renderSiteHandoff(handoff, {
            currentEntry: current,
            currentContext: context
        });
        footer.classList.add('site-footer-separate');
        footer.setAttribute('data-site-footer', 'true');
        footer.setAttribute('role', 'contentinfo');
        footer.innerHTML = `<div class="site-footer-inner" data-site-footer-attribution>${withLegalAttribution(attributionHtml)}</div>`;
        const sourceLine = footer.querySelector('.site-footer-inner > .footer-source-line');
        if (sourceLine) sourceLine.parentElement.appendChild(sourceLine);
        initFooterDelegation(footer);
    });
}

function renderRelatedMap() {
    document.querySelectorAll('[data-site-map-group]').forEach((container) => {
        const group = container.getAttribute('data-site-map-group') || '';
        const entries = SITE_MAP.filter((entry) => !group || entry.group === group);
        container.innerHTML = entries.map((entry) => `
            <a class="landing-map-link" href="${escapeHtml(entryRoute(entry))}">
                <strong>${escapeHtml(entry.title)}</strong>
                <span>${escapeHtml(entry.detail)}</span>
            </a>
        `).join('');
    });
}

export function initSiteNav() {
    if (!SITE_MAP.length) return;
    initSiteJourneyCapture();
    renderNav();
    renderCirculation();
    renderFooter();
    renderRelatedMap();
}

initSiteNav();
