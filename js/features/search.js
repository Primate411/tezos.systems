/**
 * Hero Search / Command Bar
 * Turns the protocol header into a front door for native Tezos.Systems rooms.
 */

import { debounce, escapeHtml } from '../core/utils.js';
import { versionedAsset } from '../core/asset-version.js';
import { loadDataAsset } from '../core/data-assets.js';
import { API_URLS } from '../core/config.js';
import { quietlySyncHtml } from '../core/quiet-refresh.js';
import {
    explorerUrlForEntity,
    parseSearchEntity,
    validateBase58Check
} from '../core/search-entities.js';
import {
    isSearchCatalogLoaded,
    loadSearchCatalog,
    searchFirstPartyCatalog
} from '../core/search-catalog.js';
import { resolveTezDomainAddress } from '../core/tezos-domains.js';
import {
    findCurrentSiteMapEntry,
    findSiteMapEntry,
    navigateSiteMapEntry,
    searchSiteMap,
    searchSiteMapIntents,
    siteMapBrowseEntries,
    siteMapBrowseIntents,
    siteMapRoute,
    siteMapSearchScore,
    siteMapSearchChips,
    siteMapStarters,
    suggestSiteMapQuery
} from '../core/site-map.js';
import { getAvailableThemes, openThemePicker, setTheme } from '../ui/theme.js';
import { setHomeBlockVisible } from '../ui/home-layout.js';

const HERO_SEARCH_CSS_URL = versionedAsset('/css/hero-search.css');

const RUNTIME_QUICK_CHIPS = [
    { label: 'KT1', value: 'KT1' },
    { label: '/theme', value: '/theme' }
];

const RUNTIME_COMMANDS = [
    { id: 'theme', title: '/theme', detail: 'Switch visual theme', action: 'theme-picker', aliases: ['theme', 'themes', 'switch theme'] },
    { id: 'explore', title: '/explore', detail: 'Open the Tezos Systems feature launcher', action: 'button', value: 'features-gear', aliases: ['explore', 'features', 'feature launcher', 'command center'] },
    { id: 'settings', title: '/settings', detail: 'Open theme, sharing, export, and help settings', action: 'button', value: 'settings-gear', aliases: ['settings', 'preferences'] },
    { id: 'ultra', title: '/ultra', detail: 'Toggle the high-intensity visual mode', action: 'button', value: 'ultra-toggle', aliases: ['ultra', 'ultra mode'] },
    { id: 'share', title: '/share', detail: 'Create a branded Tezos Systems snapshot', action: 'button', value: 'share-btn', aliases: ['share', 'share dashboard', 'snapshot image'] },
    { id: 'export', title: '/export', detail: 'Export the current dashboard data', action: 'button', value: 'export-btn', aliases: ['export', 'download data', 'export data'] },
    { id: 'about', title: '/about', detail: 'Open the quick Tezos explainer', action: 'button', value: 'about-tezos-btn', aliases: ['about', 'what is tezos', 'tezos explainer'] },
    { id: 'streak', title: '/streak', detail: 'Explain this browser\'s local visit streak', action: 'button', value: 'visit-streak-info-btn', aliases: ['streak', 'visit streak', 'daily streak'] },
    { id: 'shortcuts', title: '/shortcuts', detail: 'Open keyboard shortcuts and search help', action: 'button', value: 'shortcuts-btn', aliases: ['shortcuts', 'keyboard shortcuts', 'help'] },
    { id: 'changelog', title: '/changelog', detail: 'Read the latest Tezos Systems changes', action: 'button', value: 'changelog-btn', aliases: ['changelog', 'updates', 'what is new', "what's new"] },
    { id: 'site-map', title: '/site-map', detail: 'Jump to the complete canonical destination map', action: 'hash', value: '#site-map', aliases: ['site map', 'all pages', 'directory'] },
    { id: 'tzsafe', title: 'TzSafe Multisig Recovery', detail: 'Open the external legacy KT1 multisig migration tool', action: 'external', value: 'https://tzsafe.tez.page/', group: 'Recovery tools', badge: 'external', aliases: ['tzsafe', 'multisig recovery', 'kt1 safe', 'legacy multisig'] }
];

const SITE_MAP_BUTTON_TARGETS = new Map([
    ['my-tezos', 'my-tezos-btn'],
    ['snapshot', 'state-of-tezos-btn']
]);

const RUNTIME_STARTER_ROWS = [
    {
        kind: 'contract',
        group: 'Contracts & Operations',
        title: 'KT1 Contracts',
        detail: 'Paste a full KT1 address for a native contract lens',
        badge: 'contract',
        action: 'hash',
        value: '#section=ecosystem'
    },
    {
        kind: 'block',
        group: 'Contracts & Operations',
        title: 'Blocks & Operations',
        detail: 'Paste a level, block hash, or operation hash for a native receipt',
        badge: 'block',
        action: 'hash',
        value: '#health'
    }
];

const MISSION_STARTERS = Object.freeze([
    Object.freeze({ id: 'starter:wallet', kind: 'account', group: 'Start', title: 'Wallet or .tez', detail: 'Open the private My Tezos workspace', action: 'page', value: '/my/' }),
    Object.freeze({ id: 'starter:rooms', kind: 'chamber', group: 'Start', title: 'Rooms', detail: 'Find a focused Tezos Systems room', action: 'query', value: 'rooms' }),
    Object.freeze({ id: 'starter:bakers', kind: 'baker', group: 'Start', title: 'Bakers', detail: 'Open the factual active-baker directory', action: 'page', value: '/leaderboard/?view=directory' }),
    Object.freeze({ id: 'starter:network', kind: 'chamber', group: 'Start', title: 'Network', detail: 'Open live consensus and chain health', action: 'page', value: '/health/' }),
    Object.freeze({ id: 'starter:paste', kind: 'operation', group: 'Start', title: 'Paste a hash', detail: 'Read a block or operation hash from your clipboard', action: 'paste' }),
    Object.freeze({ id: 'starter:browse', kind: 'page', group: 'Start', title: 'Browse all', detail: 'Open the complete destination list', action: 'browse-all' })
]);

let protocols = [];
let protocolsPromise = null;
const bakerSearchCache = new Map();
const bakerSearchInFlight = new Map();
const accountSuggestionCache = new Map();
const accountSuggestionInFlight = new Map();
const entityResolutionCache = new Map();
const entityResolutionInFlight = new Map();
let bakerNameSearchModulePromise = null;

function findBakersByNameOnDemand(query, options) {
    if (!bakerNameSearchModulePromise) {
        bakerNameSearchModulePromise = import('./leaderboard.js').catch((error) => {
            bakerNameSearchModulePromise = null;
            throw error;
        });
    }
    return bakerNameSearchModulePromise.then(({ findBakersByName }) => findBakersByName(query, options));
}

const STARTER_QUERY_RESULTS = new Map([
    ['kt1', 'KT1 Contracts'],
    ['contract', 'KT1 Contracts'],
    ['contracts', 'KT1 Contracts'],
    ['operation', 'Blocks & Operations'],
    ['operations', 'Blocks & Operations'],
    ['op', 'Blocks & Operations'],
    ['ops', 'Blocks & Operations'],
    ['op hash', 'Blocks & Operations'],
    ['operation hash', 'Blocks & Operations'],
    ['block', 'Blocks & Operations'],
    ['blocks', 'Blocks & Operations'],
    ['block hash', 'Blocks & Operations'],
    ['block level', 'Blocks & Operations']
]);

function ensureHeroSearchStyles() {
    if (document.getElementById('hero-search-css')) return;
    const link = document.createElement('link');
    link.id = 'hero-search-css';
    link.rel = 'stylesheet';
    link.href = HERO_SEARCH_CSS_URL;
    document.head.appendChild(link);
}

function normalizeQuery(value) {
    return String(value || '').trim();
}

function matchesQuery(result, query) {
    return siteMapSearchScore({
        id: result.id || result.kind,
        title: result.title,
        detail: result.detail,
        group: result.group,
        href: result.value,
        keywords: result.aliases || []
    }, query) > 0;
}

function bakerSearchKey(query) {
    return normalizeQuery(query).toLowerCase().replace(/\s+/g, ' ');
}

function normalizedAliasText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * TzKT's suggestion endpoint is intentionally broad. Keep it useful for
 * partial names, but do not turn an unrelated fuzzy response into the first
 * keyboard destination. Every meaningful query token must match the start of
 * an alias token (or vice versa for an already-complete alias).
 */
export function isRelevantOnChainSuggestion(query, account) {
    const normalizedQuery = normalizedAliasText(query);
    const normalizedAlias = normalizedAliasText(account?.alias);
    if (normalizedQuery.length < 3 || !normalizedAlias) return false;
    if (normalizedAlias === normalizedQuery || normalizedAlias.startsWith(`${normalizedQuery} `)) return true;

    const queryTokens = normalizedQuery.split(' ').filter((token) => token.length >= 2);
    const aliasTokens = normalizedAlias.split(' ').filter(Boolean);
    if (!queryTokens.length || !aliasTokens.length) return false;
    return queryTokens.every((queryToken) => aliasTokens.some((aliasToken) => (
        aliasToken === queryToken
        || (queryToken.length >= 3 && aliasToken.startsWith(queryToken))
    )));
}

function shouldSearchNames(query) {
    const q = normalizeQuery(query);
    if (q.length < 3 || q.length > 64 || q.startsWith('/') || q.split(/\s+/).length > 4) return false;
    return !parseSearchEntity(q);
}

function monthYear(date) {
    if (!date) return '';
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime())) return date;
    return parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

async function loadProtocols() {
    if (protocols.length) return protocols;
    if (!protocolsPromise) {
        protocolsPromise = loadDataAsset('protocolData')
            .then((data) => {
                protocols = Array.isArray(data?.protocols) ? data.protocols : [];
                return protocols;
            })
            .catch(() => {
                protocols = [];
                return protocols;
            });
    }
    return protocolsPromise;
}

function protocolResult(protocol) {
    const tags = [
        protocol.number ? `Protocol ${protocol.number}` : '',
        monthYear(protocol.date),
        protocol.blockTime ? `${protocol.blockTime}s blocks` : ''
    ].filter(Boolean).join(' · ');
    const change = Array.isArray(protocol.changes) ? protocol.changes[0] : '';
    return {
        id: `protocol:${protocol.name}`,
        kind: 'protocol',
        group: 'Protocol History',
        title: protocol.name,
        detail: [tags, protocol.headline || change].filter(Boolean).join(' — '),
        badge: protocol.history ? 'history' : 'protocol',
        action: 'protocol',
        value: protocol.name,
        aliases: [
            protocol.hash,
            protocol.headline,
            protocol.debate,
            ...(protocol.changes || []),
            protocol.history?.title,
            protocol.history?.subtitle
        ].filter(Boolean)
    };
}

function commandResult(command) {
    return {
        id: `command:${command.id}`,
        kind: 'command',
        group: command.group || 'Commands',
        title: command.title,
        detail: command.detail,
        badge: command.badge || 'command',
        action: command.action || (command.id === 'theme' ? 'theme-picker' : 'hash'),
        value: command.value || command.hash,
        aliases: command.aliases
    };
}

function siteMapIntentResult(intent, { browse = false } = {}) {
    return {
        id: `intent:${intent.parentId}:${intent.id}`,
        kind: 'page',
        group: browse ? intent.group : 'Feature views',
        title: intent.title,
        detail: intent.detail,
        badge: intent.parentTitle || intent.group || 'view',
        action: 'page',
        value: intent.href,
        parentId: intent.parentId,
        searchScore: intent.searchScore,
        aliases: intent.keywords
    };
}

function siteMapResult(entry, { starter = false, browse = false } = {}) {
    const rootHashEntry = entry.hash && (entry.href === '/' || entry.href.startsWith('/#'));
    const buttonTarget = SITE_MAP_BUTTON_TARGETS.get(entry.id);
    const route = siteMapRoute(entry);
    return {
        id: `site-map:${entry.id}`,
        kind: entry.group === 'Guides' ? 'guide' : entry.group === 'Story Rooms' ? 'story' : 'page',
        group: starter ? 'Start here' : browse ? entry.group : 'Pages on tezos.systems',
        title: entry.title,
        detail: entry.detail,
        badge: entry.fresh ? 'new' : entry.group,
        action: buttonTarget ? 'button' : entry.hash ? 'site-map' : rootHashEntry ? 'hash' : 'page',
        value: buttonTarget || (entry.hash ? entry.id : rootHashEntry ? entry.hash : route),
        aliases: entry.keywords
    };
}

function maxiPassportEntityResult(target, group = 'Maxis & Identity') {
    return {
        id: `passport:${target}`,
        kind: 'page',
        group,
        title: `Open ${target} in Maxi Passport`,
        detail: 'Resolve one address into career stamps, ongoing crowns, and current-season progress',
        badge: 'passport',
        action: 'page',
        value: `/maxis/?view=passport&address=${encodeURIComponent(target)}`
    };
}

function bakerResult(baker) {
    const stake = Number(baker.stake || 0);
    const stakeText = Number.isFinite(stake) && stake > 0
        ? `${stake.toLocaleString('en-US', { maximumFractionDigits: stake >= 1000 ? 0 : 1 })} XTZ staking power`
        : 'Active baker';
    const delegators = Number(baker.delegators || 0);
    const detail = [
        baker.address,
        stakeText,
        delegators ? `${delegators.toLocaleString('en-US')} delegators` : ''
    ].filter(Boolean).join(' · ');
    return {
        id: `baker:${baker.address}`,
        kind: 'baker',
        group: 'Bakers & Accounts',
        title: baker.name || baker.alias || baker.address,
        detail,
        badge: 'baker',
        action: 'hash',
        value: `#baker=${encodeURIComponent(baker.address)}`,
        aliases: [baker.alias, baker.address, baker.consensusAddress].filter(Boolean)
    };
}

function bakerLoadingResult(query) {
    return {
        id: `status:bakers:${bakerSearchKey(query)}`,
        kind: 'baker',
        group: 'Bakers & Accounts',
        title: `Searching on-chain names for "${query}"`,
        detail: 'Checking active bakers and TzKT account aliases',
        badge: 'baker',
        action: null,
        selectable: false
    };
}

function statusResult(id, group, title, detail, badge = 'checking') {
    return {
        id: `status:${id}`,
        kind: 'status',
        group,
        title,
        detail,
        badge,
        action: null,
        selectable: false
    };
}

function accountSuggestionResult(account) {
    const address = account?.address || '';
    const isContract = address.startsWith('KT1');
    return {
        id: `tzkt-alias:${address}`,
        kind: isContract ? 'contract' : 'account',
        group: 'On-chain names',
        title: account?.alias || address,
        detail: `TzKT alias · ${address} · verify identity before acting`,
        badge: 'TzKT alias',
        action: 'hash',
        value: `#${isContract ? 'contract' : 'account'}=${encodeURIComponent(address)}`,
        aliases: [account?.alias, address].filter(Boolean)
    };
}

function cachedNameResults(query) {
    const key = bakerSearchKey(query);
    return [
        ...((bakerSearchCache.get(key) || []).map(bakerResult)),
        ...((accountSuggestionCache.get(key) || []).map(accountSuggestionResult))
    ];
}

function accountActions(address, account = null, { group = 'Account actions', domain = '' } = {}) {
    const label = domain || address;
    const results = [
        {
            id: `account:${address}`,
            kind: 'account',
            group,
            title: `Inspect ${domain ? label : 'account'}`,
            detail: `${address} · native balance, identity, and recent flow`,
            badge: 'account',
            action: 'hash',
            value: `#account=${encodeURIComponent(address)}`
        },
        {
            id: `my-tezos:${address}`,
            kind: 'account',
            group,
            title: `Track ${domain ? label : 'in My Tezos'}`,
            detail: 'Save this account in the browser-local My Tezos workspace',
            badge: 'account',
            action: 'hash',
            value: `#my-baker=${encodeURIComponent(domain || address)}`
        },
        maxiPassportEntityResult(address, group),
        {
            id: `ledger-flow:${address}`,
            kind: 'chamber',
            group,
            title: `Open ${domain ? label : 'account'} in Ledger Flow`,
            detail: 'Map bounded sent and received tez paths with receipt context',
            badge: 'flow',
            action: 'hash',
            value: `#ledger-flow=${encodeURIComponent(address)}`
        }
    ];
    if (account?.type === 'delegate' || account?.active === true) {
        results.push({
            id: `baker:${address}`,
            kind: 'baker',
            group,
            title: `Open ${domain ? label : 'active baker'} profile`,
            detail: 'TzKT identifies this address as a delegate',
            badge: 'baker',
            action: 'hash',
            value: `#baker=${encodeURIComponent(address)}`
        });
    }
    return results;
}

function contractActions(address, account = null) {
    return [
        {
            id: `contract:${address}`,
            kind: 'contract',
            group: 'Contract actions',
            title: account?.alias || 'Inspect KT1 contract',
            detail: `${address} · native code, entrypoints, activity, and related deployments`,
            badge: 'contract',
            action: 'hash',
            value: `#contract=${encodeURIComponent(address)}`
        },
        {
            id: `ledger-flow:${address}`,
            kind: 'chamber',
            group: 'Contract actions',
            title: 'Open in Ledger Flow',
            detail: 'Map bounded sent and received tez paths with receipt context',
            badge: 'flow',
            action: 'hash',
            value: `#ledger-flow=${encodeURIComponent(address)}`
        }
    ];
}

function entityResults(query) {
    const entity = parseSearchEntity(query);
    if (!entity) return [];
    const cached = entityResolutionCache.get(entity.value);

    if (entity.kind === 'partial-address') {
        return [statusResult(
            `partial:${entity.value}`,
            'Entity lookup',
            'Keep typing or paste the complete address',
            `${entity.value.length} of 36 characters · no destination opens until the identifier is complete`,
            'incomplete'
        )];
    }
    if (entity.kind === 'invalid-address') {
        return [statusResult(
            `invalid:${entity.value}`,
            'Entity lookup',
            'That address shape is not valid',
            'Tezos Base58 identifiers are case-sensitive. Check the original address instead of changing its capitalization.',
            'invalid'
        )];
    }
    if (entity.kind === 'etherlink-address' || entity.kind === 'etherlink-transaction') {
        return [{
            id: `${entity.kind}:${entity.value}`,
            kind: 'etherlink',
            group: 'Etherlink',
            title: entity.kind === 'etherlink-address' ? 'Open Etherlink address' : 'Open Etherlink transaction',
            detail: `${entity.value} · external Blockscout explorer`,
            badge: 'external',
            action: 'external',
            value: explorerUrlForEntity(entity)
        }];
    }
    if (entity.kind === 'block' && !entity.requiresChecksum) {
        return [{
            id: `block:${entity.value}`,
            kind: 'block',
            group: 'Operations & Blocks',
            title: `Block #${Number(entity.value).toLocaleString('en-US')}`,
            detail: 'Open native block receipt and producer view',
            badge: 'block',
            action: 'hash',
            value: `#block=${encodeURIComponent(entity.value)}`
        }];
    }
    if (entity.kind === 'domain') {
        const domain = entity.value;
        const results = [
            {
                id: `domain:${domain}`,
                kind: 'chamber',
                group: 'Domain actions',
                title: `Check ${domain} in Tezos Domains`,
                detail: 'Lookup availability, owner, offers, auctions, and recent name activity',
                badge: '.tez',
                action: 'hash',
                value: `#domains=${encodeURIComponent(domain)}`
            },
            maxiPassportEntityResult(domain, 'Domain actions')
        ];
        if (!cached) {
            results.push(statusResult(`domain:${domain}`, 'Domain actions', `Resolving ${domain}`, 'Checking the Tezos Domains address and account type'));
        } else if (cached.address) {
            results.push(...accountActions(cached.address, cached.account, { group: 'Domain actions', domain }));
        } else {
            results.push(statusResult(`domain-error:${domain}`, 'Domain actions', `${domain} did not resolve`, cached.error || 'No address is published for this name', 'unresolved'));
        }
        return results;
    }
    if (!cached) {
        return [statusResult(
            `validate:${entity.value}`,
            'Entity lookup',
            `Validating ${entity.kind}`,
            'Checking the Base58 checksum before enabling a destination'
        )];
    }
    if (!cached.valid) {
        return [statusResult(
            `checksum:${entity.value}`,
            'Entity lookup',
            'Checksum failed',
            'Tezos identifiers are case-sensitive. Copy the exact original value and try again.',
            'invalid'
        )];
    }
    if (entity.kind === 'contract') return contractActions(entity.value, cached.account);
    if (entity.kind === 'account') return accountActions(entity.value, cached.account);
    if (entity.kind === 'operation') {
        return [{
            id: `operation:${entity.value}`,
            kind: entity.kind,
            group: 'Operations & Blocks',
            title: entity.value,
            detail: 'Open native operation contents and status',
            badge: 'operation',
            action: 'hash',
            value: `#operation=${encodeURIComponent(entity.value)}`
        }];
    }
    if (entity.kind === 'block') {
        return [{
            id: `block:${entity.value}`,
            kind: 'block',
            group: 'Operations & Blocks',
            title: entity.value,
            detail: 'Open native block receipt and producer view',
            badge: 'block',
            action: 'hash',
            value: `#block=${encodeURIComponent(entity.value)}`
        }];
    }
    return [];
}

function starterResults(query) {
    const key = normalizeQuery(query).toLowerCase().replace(/\s+/g, ' ');
    const title = STARTER_QUERY_RESULTS.get(key);
    if (!title) return [];
    const result = RUNTIME_STARTER_ROWS.find((row) => row.title === title);
    return result ? [result] : [];
}

function catalogResult(row) {
    return {
        id: `catalog:${row.id}`,
        kind: row.kind || 'page',
        group: row.group || 'On tezos.systems',
        title: row.title,
        detail: row.detail,
        badge: row.badge || row.kind || 'site',
        action: 'page',
        value: row.href,
        aliases: row.aliases || []
    };
}

function typoSuggestionResult(query) {
    const suggestion = suggestSiteMapQuery(query);
    if (!suggestion) return [];
    return [{
        id: `query:${suggestion.corrected}`,
        kind: 'suggestion',
        group: 'Try another spelling',
        title: `Did you mean “${suggestion.corrected}”?`,
        detail: `Search Tezos Systems for ${suggestion.corrected}`,
        badge: 'suggestion',
        action: 'query',
        value: suggestion.corrected
    }];
}

function themeResults(query) {
    const q = normalizeQuery(query).toLowerCase();
    if (!q.startsWith('/theme')) return [];
    const [, requested = ''] = q.split(/\s+/);
    if (!requested) {
        return [{
            kind: 'command',
            group: 'Commands',
            title: '/theme',
            detail: 'Open the theme selector',
            badge: 'command',
            action: 'theme-picker'
        }];
    }

    return getAvailableThemes()
        .filter((theme) => theme.startsWith(requested))
        .slice(0, 5)
        .map((theme) => ({
            kind: 'command',
            group: 'Commands',
            title: `/theme ${theme}`,
            detail: `Switch to ${theme}`,
            badge: 'command',
            action: 'theme',
            value: theme
        }));
}

function dedupeResults(results) {
    const seen = new Set();
    return results.filter(Boolean).map((result) => {
        const identity = result.id || `${result.action || result.kind}:${result.value || result.title}`;
        return { selectable: result.selectable !== false && Boolean(result.action), ...result, id: identity };
    }).filter((result) => {
        const key = `${result.action || result.kind}:${result.value || result.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function buildResults(query, { browseAll = false } = {}) {
    const q = normalizeQuery(query);
    const entity = parseSearchEntity(q);
    const nameMatches = cachedNameResults(q);
    const nameLoading = shouldSearchNames(q)
        && (!bakerSearchCache.has(bakerSearchKey(q)) || !accountSuggestionCache.has(bakerSearchKey(q)))
        && (bakerSearchInFlight.has(bakerSearchKey(q)) || accountSuggestionInFlight.has(bakerSearchKey(q)))
        ? [bakerLoadingResult(q)]
        : [];
    const protocolMatches = (q.startsWith('/') ? [] : protocols)
        .slice()
        .reverse()
        .map(protocolResult)
        .filter((result) => matchesQuery(result, q));
    const commandMatches = RUNTIME_COMMANDS
        .map(commandResult)
        .map((result, index) => ({ result, index, score: siteMapSearchScore({
            id: result.id,
            title: result.title,
            detail: result.detail,
            group: result.group,
            href: result.title,
            keywords: result.aliases
        }, q) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map(({ result }) => result);
    const siteMapIntents = searchSiteMapIntents(q);
    const siteMapEntries = searchSiteMap(q);
    const siteMapIntentMatches = siteMapIntents.map(siteMapIntentResult);
    const siteMapMatches = siteMapEntries.map(siteMapResult);
    const entityMatches = entityResults(q);
    const themeMatches = themeResults(q);
    const starterMatches = starterResults(q);
    const catalogMatches = q.startsWith('/') || entity
        ? []
        : searchFirstPartyCatalog(q, { limit: 10 }).map(catalogResult);
    const catalogLoading = q.length >= 2 && !q.startsWith('/') && !entity && !isSearchCatalogLoaded()
        ? [statusResult('catalog', 'On tezos.systems', 'Searching the first-party catalog', 'Checking apps, identities, debates, and network milestones')]
        : [];

    if (!q) {
        if (browseAll) {
            return dedupeResults([
                ...siteMapBrowseEntries().map((entry) => siteMapResult(entry, { browse: true })),
                ...siteMapBrowseIntents().map((intent) => siteMapIntentResult(intent, { browse: true }))
            ]);
        }
        return dedupeResults(MISSION_STARTERS);
    }

    const intentMatches = siteMapIntentMatches.slice(0, 6);
    const canonicalMatches = siteMapMatches.slice(0, 8);
    const topIntent = intentMatches[0];
    const topCanonicalEntry = siteMapEntries[0];
    const topCanonicalScore = topCanonicalEntry ? siteMapSearchScore(topCanonicalEntry, q) : 0;
    const preferIntent = !q.startsWith('/') && Boolean(topIntent)
        && Number(topIntent.searchScore || 0) > topCanonicalScore;
    const manifestMatches = !intentMatches.length
        ? canonicalMatches
        : preferIntent
            ? [...intentMatches, ...canonicalMatches]
            : [canonicalMatches[0], ...intentMatches, ...canonicalMatches.slice(1)].filter(Boolean);

    const directMatches = [
        ...entityMatches,
        ...themeMatches,
        ...starterMatches,
        ...(q.startsWith('/') ? commandMatches : manifestMatches),
        ...(q.startsWith('/') ? manifestMatches : catalogMatches),
        ...protocolMatches.slice(0, 5),
        ...(q.startsWith('/') ? [] : commandMatches.slice(0, 4)),
        ...nameMatches,
        ...nameLoading,
        ...catalogLoading
    ];

    const hasSelectableResult = directMatches.some((result) => result?.selectable !== false && result?.action);
    return dedupeResults([
        ...directMatches,
        ...(hasSelectableResult ? [] : typoSuggestionResult(q))
    ]);
}

function groupedResults(results) {
    const groups = [];
    for (const result of results) {
        let group = groups.find((item) => item.label === result.group);
        if (!group) {
            group = { label: result.group, results: [] };
            groups.push(group);
        }
        group.results.push(result);
    }
    return groups;
}

function groupOrderedResults(results) {
    return groupedResults(results).flatMap((group) => group.results);
}

function resultDomId(result) {
    let hash = 2166136261;
    for (const character of String(result.id || 'result')) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return `hero-search-option-${(hash >>> 0).toString(36)}`;
}

function searchPanelHeaderHtml(query, { browseAll = false, resultCount = 0 } = {}) {
    const q = normalizeQuery(query);
    const countLabel = `${resultCount} ${resultCount === 1 ? 'path' : 'paths'}`;
    const state = browseAll ? 'directory' : q ? 'results' : 'threshold';
    const kicker = browseAll ? 'Complete index' : q ? 'Search receipts' : 'The Index';
    const title = browseAll
        ? `${siteMapBrowseEntries().length + siteMapBrowseIntents().length} destinations. One deliberate map.`
        : q
            ? `${countLabel} for “${escapeHtml(q)}”`
            : 'Find a room. Resolve a receipt. Follow the chain.';
    const detail = browseAll
        ? 'Every first-party room, view, guide, and utility — grouped by purpose.'
        : q
            ? 'Exact identities and native Tezos Systems rooms lead; broader matches follow.'
            : 'Begin with an account, a name, a hash, or a question. Search reveals detail as you need it.';

    return `
        <header class="hero-search-panel-head" data-panel-state="${state}" data-quiet-key="search-panel-head">
            <span class="hero-search-panel-sigil" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="hero-search-panel-copy">
                <span class="hero-search-panel-kicker">${kicker}</span>
                <strong>${title}</strong>
                <span>${detail}</span>
            </span>
            <span class="hero-search-keys" aria-hidden="true">
                <span><kbd>↑↓</kbd> move</span>
                <span><kbd>↵</kbd> open</span>
                <span><kbd>esc</kbd> close</span>
            </span>
        </header>
    `;
}

function resultHtml(result, selectedId) {
    if (result.selectable === false) {
        return `
            <div class="hero-search-status-row" role="status" data-quiet-key="${escapeHtml(result.id)}">
                <span class="hero-result-mark" data-kind="${escapeHtml(result.kind)}" aria-hidden="true"></span>
                <span class="hero-result-copy">
                    <strong>${escapeHtml(result.title)}</strong>
                    <span>${escapeHtml(result.detail || '')}</span>
                </span>
                <span class="hero-result-badge" data-kind="${escapeHtml(result.badge || result.kind)}">${escapeHtml(result.badge || result.kind)}</span>
            </div>
        `;
    }
    const isExternal = result.action === 'external';
    const selected = result.id === selectedId;
    const domId = resultDomId(result);
    return `
        <button
            class="hero-search-result ${selected ? 'is-selected' : ''}"
            id="${domId}"
            type="button"
            role="option"
            tabindex="-1"
            aria-selected="${selected ? 'true' : 'false'}"
            data-result-id="${escapeHtml(result.id)}"
            data-quiet-key="${escapeHtml(result.id)}"
        >
            <span class="hero-result-mark" data-kind="${escapeHtml(result.kind)}" aria-hidden="true"></span>
            <span class="hero-result-copy">
                <strong>${escapeHtml(result.title)}</strong>
                <span>${escapeHtml(result.detail || '')}</span>
            </span>
            <span class="hero-result-badge" data-kind="${escapeHtml(result.badge || result.kind)}">${escapeHtml(result.badge || result.kind)}</span>
            <span class="hero-result-arrow ${isExternal ? 'hero-result-external' : ''}" aria-hidden="true">${isExternal ? '↗' : '→'}</span>
        </button>
    `;
}

function navigateHash(hash) {
    if (!hash) return;
    const next = hash.startsWith('#') ? hash : `#${hash}`;
    if (window.location.hash === next) {
        window.dispatchEvent(new Event('hashchange'));
    } else {
        window.location.hash = next;
    }
}

function openThemeSelector() {
    const button = document.getElementById('theme-toggle');
    if (button) {
        button.click();
        return;
    }
    openThemePicker();
}

function runResult(result) {
    if (!result) return false;
    if (result.action === 'external') {
        window.open(result.value, '_blank', 'noopener,noreferrer');
        return true;
    }
    if (result.action === 'hash') {
        navigateHash(result.value);
        return true;
    }
    if (result.action === 'site-map') {
        return navigateSiteMapEntry(result.value);
    }
    if (result.action === 'page') {
        window.location.href = result.value;
        return true;
    }
    if (result.action === 'button') {
        const button = document.getElementById(result.value);
        if (!button) return false;
        button.click();
        return true;
    }
    if (result.action === 'protocol') {
        const slug = String(result.value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        window.location.href = slug
            ? `/anthology/${encodeURIComponent(slug)}/`
            : '/anthology/';
        return true;
    }
    if (result.action === 'theme') {
        setTheme(result.value);
        localStorage.setItem('tezos-systems-theme', result.value);
        return true;
    }
    if (result.action === 'theme-picker') {
        openThemeSelector();
        return true;
    }
    return false;
}

function runRoute(route, entryId = '') {
    if (!route) return false;
    const entry = entryId ? findSiteMapEntry(entryId) : null;
    if (entry) return navigateSiteMapEntry(entry);
    if (route.startsWith('#')) {
        navigateHash(route);
        return true;
    }
    window.location.href = route;
    return true;
}

function isTextEntryTarget(target) {
    const tag = target?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
}

function isBlockingOverlayActive() {
    return [...document.querySelectorAll('.modal-overlay.active, .chamber-overlay.active, [aria-modal="true"]')]
        .some((element) => {
            const overlay = element.matches('.modal-overlay, .chamber-overlay')
                ? element
                : element.closest('.modal-overlay, .chamber-overlay');
            const active = overlay
                ? overlay.classList.contains('active') && overlay.getAttribute('aria-hidden') !== 'true'
                : element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0;
            return active && !element.closest('#hero-slot');
        });
}

export function initHeroSearch() {
    const root = document.getElementById('hero-slot');
    const form = document.getElementById('hero-search-form');
    const input = document.getElementById('hero-search-input');
    const panel = document.getElementById('hero-search-panel');
    const chips = document.getElementById('hero-search-chips');
    const closeButton = document.getElementById('hero-search-close');
    if (!root || !form || !input || !panel || !chips || !closeButton) return;
    ensureHeroSearchStyles();

    let isOpen = false;
    let isBrowsingAll = false;
    let selectedId = '';
    let results = [];
    let priorFocus = null;
    let searchRouteWasActive = (() => {
        const routeParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        return window.location.hash === '#search' || routeParams.has('search');
    })();
    let lastAnnouncement = '';
    let liveRegion = document.getElementById('hero-search-status');
    if (!liveRegion) {
        liveRegion = document.createElement('div');
        liveRegion.id = 'hero-search-status';
        liveRegion.className = 'sr-only';
        liveRegion.setAttribute('role', 'status');
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        root.appendChild(liveRegion);
    }

    const renderQuickChips = () => {
        const chipList = [
            { label: `All ${siteMapBrowseEntries().length + siteMapBrowseIntents().length}`, browseAll: true },
            ...siteMapSearchChips(),
            ...RUNTIME_QUICK_CHIPS
        ];
        const markup = chipList.map((chip) => {
            const attr = chip.browseAll
                ? 'data-hero-browse-all="true"'
                : chip.route
                ? `data-hero-route="${escapeHtml(chip.route)}"`
                : `data-hero-query="${escapeHtml(chip.value)}"`;
            const entryAttr = chip.id ? ` data-hero-entry="${escapeHtml(chip.id)}"` : '';
            return `<button class="hero-search-chip" type="button" ${attr}${entryAttr}>${escapeHtml(chip.label)}</button>`;
        }).join('');
        if (chips.innerHTML !== markup) chips.innerHTML = markup;
    };

    renderQuickChips();

    const syncAvailableHeight = () => {
        if (!isOpen) return;
        const top = panel.getBoundingClientRect().top;
        const viewport = window.visualViewport;
        const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        root.style.setProperty('--hero-search-available-height', `${Math.max(0, viewportBottom - top - 8)}px`);
    };

    const ensureSearchRoom = () => {
        if (!isOpen) return;
        const viewport = window.visualViewport;
        const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const available = viewportBottom - panel.getBoundingClientRect().top - 8;
        // Leave room for the index threshold plus one complete result receipt.
        // The former list-only surface needed much less height; the composed
        // header must never crowd the selected option below the viewport.
        const minimum = window.matchMedia('(max-width: 719px)').matches ? 184 : 210;
        if (available < minimum) {
            window.scrollBy({ top: minimum - available, behavior: 'instant' });
        }
        syncAvailableHeight();
    };

    const canRestoreFocus = (target) => {
        if (!(target instanceof HTMLElement)
            || target === document.body
            || target === document.documentElement
            || !target.isConnected
            || target.closest('[inert], [hidden]')) return false;
        const rect = target.getBoundingClientRect();
        return rect.width > 0
            && rect.height > 0
            && rect.bottom > 0
            && rect.top < window.innerHeight
            && rect.right > 0
            && rect.left < window.innerWidth;
    };

    const blurSearchFocus = () => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && root.contains(active)) active.blur();
    };

    const setOpen = (next, { restoreFocus = true } = {}) => {
        const wasOpen = isOpen;
        isOpen = Boolean(next);
        if (isOpen && !wasOpen && document.activeElement !== input && !root.contains(document.activeElement)) {
            priorFocus = document.activeElement;
        }
        root.classList.toggle('is-open', isOpen);
        document.body.classList.toggle('hero-search-mode', isOpen);
        panel.hidden = !isOpen;
        input.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen && !wasOpen) {
            window.dispatchEvent(new Event('hero-search-opened'));
            ensureSearchRoom();
            requestAnimationFrame(() => {
                ensureSearchRoom();
                window.setTimeout(ensureSearchRoom, 240);
            });
        }
        if (!isOpen) {
            isBrowsingAll = false;
            selectedId = '';
            root.classList.remove('has-query');
            root.classList.remove('is-browsing-all');
            input.setAttribute('aria-activedescendant', '');
            root.style.removeProperty('--hero-search-available-height');
            if (restoreFocus && canRestoreFocus(priorFocus)) priorFocus.focus({ preventScroll: true });
            else if (restoreFocus) blurSearchFocus();
            priorFocus = null;
        }
    };

    const dismissForRoute = () => {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const isSearchRoute = window.location.hash === '#search' || hashParams.has('search');
        const wasSearchRoute = searchRouteWasActive;
        searchRouteWasActive = isSearchRoute;
        if (isSearchRoute) return;
        const currentEntry = findCurrentSiteMapEntry();
        const ownsDestination = (
            Boolean(window.location.hash)
            || Boolean(currentEntry?.id && currentEntry.id !== 'home')
        );
        if (!ownsDestination && !wasSearchRoute) return;
        if (isOpen) setOpen(false, { restoreFocus: false });
        blurSearchFocus();
    };

    const syncActiveDescendant = () => {
        const result = results.find((candidate) => candidate.id === selectedId && candidate.selectable !== false);
        input.setAttribute('aria-activedescendant', result ? resultDomId(result) : '');
    };

    const keepOptionVisible = (option) => {
        if (!(option instanceof HTMLElement)) return;
        const panelRect = panel.getBoundingClientRect();
        const optionRect = option.getBoundingClientRect();
        if (optionRect.top < panelRect.top) {
            panel.scrollTop -= panelRect.top - optionRect.top + 1;
        } else if (optionRect.bottom > panelRect.bottom) {
            panel.scrollTop += optionRect.bottom - panelRect.bottom + 1;
        }
    };

    const rerenderCurrentQuery = (key) => {
        if (isOpen && bakerSearchKey(input.value) === key) render();
    };

    const queueNameLookups = (value) => {
        const q = normalizeQuery(value);
        if (!shouldSearchNames(q)) return;
        const key = bakerSearchKey(q);
        if (!bakerSearchCache.has(key) && !bakerSearchInFlight.has(key)) {
            const promise = findBakersByNameOnDemand(q, { limit: 5 })
                .then((matches) => {
                    bakerSearchCache.set(key, Array.isArray(matches) ? matches : []);
                })
                .catch(() => {
                    bakerSearchCache.set(key, []);
                })
                .finally(() => {
                    bakerSearchInFlight.delete(key);
                    rerenderCurrentQuery(key);
                });
            bakerSearchInFlight.set(key, promise);
        }
        if (!accountSuggestionCache.has(key) && !accountSuggestionInFlight.has(key)) {
            const url = `${API_URLS.tzkt}/suggest/accounts/${encodeURIComponent(q)}?limit=5`;
            const promise = fetch(url, { cache: 'no-store', __tezosSystemsPriority: 'interactive' })
                .then((response) => response.ok ? response.json() : [])
                .then((matches) => {
                    accountSuggestionCache.set(key, Array.isArray(matches)
                        ? matches.filter((match) => match?.address && isRelevantOnChainSuggestion(q, match))
                        : []);
                })
                .catch(() => {
                    accountSuggestionCache.set(key, []);
                })
                .finally(() => {
                    accountSuggestionInFlight.delete(key);
                    rerenderCurrentQuery(key);
                });
            accountSuggestionInFlight.set(key, promise);
        }
    };

    const fetchTzktAccount = async (address) => {
        const response = await fetch(`${API_URLS.tzkt}/accounts/${encodeURIComponent(address)}`, {
            cache: 'no-store',
            __tezosSystemsPriority: 'interactive'
        });
        if (!response.ok) return null;
        return response.json();
    };

    const queueEntityResolution = (value) => {
        const entity = parseSearchEntity(value);
        if (!entity || entityResolutionCache.has(entity.value) || entityResolutionInFlight.has(entity.value)) return;
        if (['partial-address', 'invalid-address', 'etherlink-address', 'etherlink-transaction'].includes(entity.kind)) return;
        if (entity.kind === 'block' && !entity.requiresChecksum) return;
        const promise = (async () => {
            if (entity.kind === 'domain') {
                try {
                    const address = await resolveTezDomainAddress(entity.value);
                    const account = address ? await fetchTzktAccount(address).catch(() => null) : null;
                    entityResolutionCache.set(entity.value, {
                        valid: Boolean(address),
                        address,
                        account,
                        error: address ? '' : 'No address is published for this name'
                    });
                } catch (error) {
                    entityResolutionCache.set(entity.value, {
                        valid: false,
                        address: '',
                        account: null,
                        error: error?.message || 'Domain lookup unavailable'
                    });
                }
                return;
            }
            const valid = entity.requiresChecksum ? await validateBase58Check(entity.value) : true;
            const account = valid && ['account', 'contract'].includes(entity.kind)
                ? await fetchTzktAccount(entity.value).catch(() => null)
                : null;
            entityResolutionCache.set(entity.value, { valid, account });
        })().finally(() => {
            entityResolutionInFlight.delete(entity.value);
            if (isOpen && parseSearchEntity(input.value)?.value === entity.value) render();
        });
        entityResolutionInFlight.set(entity.value, promise);
    };

    const queueCatalogLookup = (value) => {
        const q = normalizeQuery(value);
        if (q.length < 2 || q.startsWith('/') || parseSearchEntity(q) || isSearchCatalogLoaded()) return;
        loadSearchCatalog().finally(() => {
            if (isOpen && normalizeQuery(input.value) === q) render();
        });
    };

    const render = () => {
        if (!isOpen) return;
        queueNameLookups(input.value);
        queueEntityResolution(input.value);
        queueCatalogLookup(input.value);
        root.classList.toggle('has-query', Boolean(normalizeQuery(input.value)));
        root.classList.toggle('is-browsing-all', isBrowsingAll);
        results = groupOrderedResults(buildResults(input.value, { browseAll: isBrowsingAll }));
        const selectableResults = results.filter((result) => result.selectable !== false);
        if (!selectableResults.some((result) => result.id === selectedId)) selectedId = '';
        if (!selectedId && normalizeQuery(input.value) && selectableResults.length) selectedId = selectableResults[0].id;
        const isLoading = results.some((result) => result.selectable === false && result.badge === 'checking');
        panel.setAttribute('aria-busy', isLoading ? 'true' : 'false');

        if (!results.length) {
            const header = searchPanelHeaderHtml(input.value, { browseAll: isBrowsingAll, resultCount: 0 });
            quietlySyncHtml(panel, `${header}<div class="hero-search-empty" data-quiet-key="empty"><strong>No path surfaced.</strong><span>Check the original casing, or try a complete wallet, .tez name, contract, operation, block, protocol, room, or slash command.</span></div>`);
            syncActiveDescendant();
            if (lastAnnouncement !== 'No results') {
                liveRegion.textContent = 'No results';
                lastAnnouncement = 'No results';
            }
            return;
        }

        const groups = groupedResults(results);
        const showGroupLabels = Boolean(normalizeQuery(input.value)) && groups.length > 1;
        const header = searchPanelHeaderHtml(input.value, {
            browseAll: isBrowsingAll,
            resultCount: selectableResults.length
        });
        const groupMarkup = groups.map((group) => {
            const rows = group.results.map((result) => resultHtml(result, selectedId)).join('');
            return `
                <section class="hero-search-group ${group.label === 'Start' ? 'is-starter' : ''}" role="group" aria-label="${escapeHtml(group.label)}" data-quiet-key="group:${escapeHtml(group.label)}">
                    ${showGroupLabels ? `<div class="hero-search-group-label">${escapeHtml(group.label)}</div>` : ''}
                    ${rows}
                </section>
            `;
        }).join('');
        quietlySyncHtml(panel, `${header}<div class="hero-search-panel-body" data-quiet-key="search-panel-body">${groupMarkup}</div>`);
        syncActiveDescendant();
        syncAvailableHeight();
        const selectedOption = selectedId
            ? panel.querySelector(`[data-result-id="${CSS.escape(selectedId)}"]`)
            : null;
        if (selectedOption) {
            const optionTop = selectedOption.offsetTop;
            const optionBottom = optionTop + selectedOption.offsetHeight;
            if (optionTop < panel.scrollTop) panel.scrollTop = optionTop;
            else if (optionBottom > panel.scrollTop + panel.clientHeight) {
                panel.scrollTop = Math.max(0, optionBottom - panel.clientHeight);
            }
        }
        const announcement = isLoading
            ? `Searching. ${selectableResults.length} results available`
            : `${selectableResults.length} result${selectableResults.length === 1 ? '' : 's'} available`;
        if (announcement !== lastAnnouncement) {
            liveRegion.textContent = announcement;
            lastAnnouncement = announcement;
        }
    };

    const debouncedRender = debounce(render, 80);

    const ensureProtocols = () => {
        loadProtocols().then(() => {
            if (isOpen) render();
        });
    };

    const applyQuery = (value) => {
        isBrowsingAll = false;
        input.value = value || '';
        input.focus();
        setOpen(true);
        ensureProtocols();
        selectedId = '';
        render();
    };

    const executeResult = (result) => {
        if (!result || result.selectable === false) return false;
        if (result.action === 'query') {
            applyQuery(result.value);
            return false;
        }
        if (result.action === 'browse-all') {
            input.value = '';
            isBrowsingAll = true;
            selectedId = '';
            render();
            return false;
        }
        if (result.action === 'paste') {
            const usePasteHint = () => {
                input.placeholder = 'Paste a block or operation hash';
                input.focus({ preventScroll: true });
            };
            if (!navigator.clipboard?.readText) {
                usePasteHint();
                return false;
            }
            navigator.clipboard.readText().then((text) => {
                if (normalizeQuery(text)) applyQuery(text);
                else usePasteHint();
            }).catch(usePasteHint);
            return false;
        }
        return runResult(result);
    };

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!isOpen) setOpen(true);
        render();
        if (!normalizeQuery(input.value) && !isBrowsingAll) return;
        const result = results.find((candidate) => candidate.id === selectedId && candidate.selectable !== false);
        if (executeResult(result)) setOpen(false, { restoreFocus: false });
    });

    closeButton.addEventListener('click', () => {
        setOpen(false);
        input.blur();
    });

    form.addEventListener('click', (event) => {
        if (event.target.closest('.hero-search-submit, .hero-search-close')) return;
        if (document.activeElement !== input) input.focus();
        if (!isOpen) {
            setOpen(true);
            if (input.value) input.select();
            ensureProtocols();
            render();
        }
    });

    form.addEventListener('pointerdown', () => {
        if (!isOpen && !root.contains(document.activeElement)) priorFocus = document.activeElement;
    });

    input.addEventListener('focus', () => {
        setOpen(true);
        ensureProtocols();
        render();
    });

    input.addEventListener('input', () => {
        if (!isOpen) setOpen(true);
        isBrowsingAll = false;
        selectedId = '';
        debouncedRender();
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (!isOpen) setOpen(true);
            render();
            if (!normalizeQuery(input.value) && !isBrowsingAll) return;
            const result = results.find((candidate) => candidate.id === selectedId && candidate.selectable !== false);
            if (executeResult(result)) setOpen(false, { restoreFocus: false });
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        if (!isOpen) {
            setOpen(true);
            render();
        }
        const selectableResults = results.filter((result) => result.selectable !== false);
        if (!selectableResults.length) return;
        ensureSearchRoom();
        const dir = event.key === 'ArrowDown' ? 1 : -1;
        const currentIndex = selectableResults.findIndex((result) => result.id === selectedId);
        const nextIndex = currentIndex < 0
            ? (dir > 0 ? 0 : selectableResults.length - 1)
            : (currentIndex + dir + selectableResults.length) % selectableResults.length;
        const previousOption = selectedId ? panel.querySelector(`[data-result-id="${CSS.escape(selectedId)}"]`) : null;
        previousOption?.classList.remove('is-selected');
        previousOption?.setAttribute('aria-selected', 'false');
        selectedId = selectableResults[nextIndex].id;
        const option = panel.querySelector(`[data-result-id="${CSS.escape(selectedId)}"]`);
        option?.classList.add('is-selected');
        option?.setAttribute('aria-selected', 'true');
        syncActiveDescendant();
        keepOptionVisible(option);
    });

    root.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !isOpen) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
    });

    panel.addEventListener('click', (event) => {
        const option = event.target.closest('[data-result-id]');
        if (!option) return;
        const result = results.find((candidate) => candidate.id === option.dataset.resultId);
        if (executeResult(result)) setOpen(false, { restoreFocus: false });
    });

    chips.addEventListener('click', (event) => {
        const browseAllChip = event.target.closest('[data-hero-browse-all]');
        if (browseAllChip) {
            input.value = '';
            input.focus();
            setOpen(true);
            ensureProtocols();
            isBrowsingAll = true;
            selectedId = '';
            render();
            return;
        }
        const routeChip = event.target.closest('[data-hero-route]');
        if (routeChip) {
            const buttonTarget = SITE_MAP_BUTTON_TARGETS.get(routeChip.dataset.heroEntry || '');
            if (buttonTarget) document.getElementById(buttonTarget)?.click();
            else runRoute(routeChip.dataset.heroRoute || '', routeChip.dataset.heroEntry || '');
            setOpen(false);
            return;
        }
        const chip = event.target.closest('[data-hero-query]');
        if (!chip) return;
        applyQuery(chip.dataset.heroQuery || '');
    });

    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-hero-query]');
        if (trigger && !root.contains(trigger)) {
            event.preventDefault();
            applyQuery(trigger.dataset.heroQuery || '');
            return;
        }
        if (!isOpen || event.defaultPrevented || !event.target.isConnected) return;
        if (root.contains(event.target) || panel.contains(event.target) || event.target.closest('#hero-search-panel')) return;
        setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        if (isTextEntryTarget(event.target) || isBlockingOverlayActive()) return;
        event.preventDefault();
        setHomeBlockVisible('live-head', true, 'search-shortcut');
        priorFocus = document.activeElement;
        input.focus();
        input.select();
    });

    window.addEventListener('resize', ensureSearchRoom);
    window.addEventListener('scroll', syncAvailableHeight, { passive: true });
    window.visualViewport?.addEventListener('resize', ensureSearchRoom);
    window.visualViewport?.addEventListener('scroll', syncAvailableHeight);
    window.addEventListener('hashchange', dismissForRoute);
    window.addEventListener('popstate', dismissForRoute);
    window.addEventListener('tezos:routechange', dismissForRoute);

    // Warm the protocol index after first paint, but keep the hero input cheap.
    window.setTimeout(ensureProtocols, 1200);

    root.dataset.heroSearchWired = '1';

    const searchParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchHash = searchParams.get('search');
    if (window.location.hash === '#search' || searchParams.has('search')) {
        setHomeBlockVisible('live-head', true, 'deep-link');
        if (searchHash) applyQuery(searchHash);
        else requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }
}
