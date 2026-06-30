/**
 * Hero Search / Command Bar
 * Turns the protocol header into a front door for native Tezos.Systems rooms.
 */

import { debounce, escapeHtml } from '../core/utils.js';
import { getAvailableThemes, openThemePicker, setTheme } from '../ui/theme.js';
import { findBakersByName } from './leaderboard.js';

const PROTOCOL_DATA_URL = '/data/protocol-data.json?v=2';
const HERO_SEARCH_CSS_URL = '/css/hero-search.css?v=316';

const ADDRESS_RE = /^(tz[1-4]|KT1)[0-9A-Za-z]{33}$/;
const TEZ_DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+tez$/i;
const OPERATION_RE = /^o[0-9A-Za-z]{50}$/;
const BLOCK_HASH_RE = /^B[0-9A-Za-z]{50}$/;
const BLOCK_LEVEL_RE = /^\d{4,}$/;

const QUICK_CHIPS = [
    { label: 'Wallet or .tez', value: 'my tezos' },
    { label: '/domains', value: '/domains' },
    { label: '/health', value: '/health' },
    { label: '/chamber', value: '/chamber' },
    { label: '/flow', value: '/ledger-flow' },
    { label: 'Protocol', value: 'Ushuaia' },
    { label: 'KT1', value: 'KT1' },
    { label: '/theme', value: '/theme' }
];

const COMMANDS = [
    { id: 'my-tezos', title: 'My Tezos', detail: 'Set or switch your primary wallet or .tez name', hash: null, action: 'button', value: 'my-tezos-btn', aliases: ['my tezos', 'wallet', 'primary address', 'domain'] },
    { id: 'theme', title: '/theme', detail: 'Switch visual theme', hash: null, aliases: ['theme', 'themes', 'switch theme'] },
    { id: 'calculator', title: '/calculator', detail: 'Open staking rewards calculator', hash: '#calculator', aliases: ['calc', 'rewards'] },
    { id: 'compare', title: '/compare', detail: 'Open chain comparison', hash: '#compare', aliases: ['chains', 'comparison'] },
    { id: 'history', title: '/history', detail: 'Open historical Tezos network charts', hash: '#history', aliases: ['charts', 'data history'] },
    { id: 'protocol-history', title: '/protocol-history', detail: 'Open Protocol Anthology', hash: '#protocol-history', aliases: ['protocol archive', 'upgrade history', 'proposal history', 'impact views', 'lore', 'anthology'] },
    { id: 'price', title: '/price', detail: 'Open XTZ price intelligence', hash: '#price', aliases: ['price', 'xtz price', 'market cap', 'price watcher'] },
    { id: 'leaderboard', title: '/leaderboard', detail: 'Open baker leaderboard', hash: '#leaderboard', aliases: ['bakers', 'baker ranking'] },
    { id: 'whales', title: '/whales', detail: 'Open live large-transfer feed', hash: '#whales', aliases: ['mini whale', 'transfers'] },
    { id: 'giants', title: '/giants', detail: 'Open dormant-wallet awakenings', hash: '#giants', aliases: ['sleeping giants'] },
    { id: 'nfts', title: '/nfts', detail: 'Open HEN mode with live NFTs and collector profile stats', hash: null, action: 'hen', aliases: ['objkt', 'nft'] }
];

const CHAMBERS = [
    { id: 'health', title: 'Network Health', detail: 'Blocks, Octez versions, missed rights, consensus lens', hash: '#health', aliases: ['/health', 'network', 'blocks'] },
    { id: 'chamber', title: 'Tezos L1 Governance', detail: 'Current vote room and protocol governance history', hash: '#chamber', aliases: ['/chamber', 'governance', 'vote'] },
    { id: 'tezosx', title: 'Tezos X Chamber', detail: 'Etherlink TVL, L2 transaction tape, gas oracle, tokens', hash: '#tezosx', aliases: ['/tezosx', 'tezlink', 'l2'] },
    { id: 'l2chamber', title: 'Tezos X Governance', detail: 'FAST, SLOW, sequencer governance tracks', hash: '#l2chamber', aliases: ['/l2chamber', 'etherlink governance'] },
    { id: 'tz4', title: 'tz4 Adoption', detail: 'BLS adoption, pending switches, holdouts, milestones', hash: '#tz4', aliases: ['/tz4', 'bls'] },
    { id: 'lb', title: 'Liquidity Baking', detail: 'LB votes, EMA threshold, and live liquidity signals', hash: '#lb', aliases: ['/lb', 'liquidity baking'] },
    { id: 'ledger-flow', title: 'Ledger Flow', detail: 'Account transfer diagram for sent, received, and first-funding paths', hash: '#ledger-flow', aliases: ['/ledger-flow', '/flow', 'flow', 'ledger', 'transfer graph', 'account flow'] },
    { id: 'domains', title: 'Tezos Domains', detail: '.tez name lookup, live registrations, auctions, offers, and expiry pressure', hash: '#domains', aliases: ['/domains', '.tez', 'names', 'identity', 'tezos domains', 'domains'] },
    { id: 'protocol-history', title: 'Protocol Anthology', detail: 'Self-amendment lore, impact views, and amendment memory', hash: '#protocol-history', aliases: ['/protocol-history', 'protocol history', 'protocol archive', 'upgrades', 'impact', 'lore', 'anthology'] },
    { id: 'ctez', title: 'ctez End of Life', detail: 'Oven discovery and wallet-reviewed close flow', hash: '#ctez', aliases: ['/ctez', 'oven'] }
];

const EMPTY_STATE_ROWS = [
    {
        kind: 'account',
        group: 'My Tezos',
        title: 'My Tezos',
        detail: 'Save or switch the wallet address or .tez name that makes this yours',
        badge: 'my tezos',
        action: 'button',
        value: 'my-tezos-btn'
    },
    {
        kind: 'chamber',
        group: 'Chambers',
        title: 'Network Health',
        detail: 'Blocks, Octez versions, missed rights, consensus lens',
        badge: 'chamber',
        action: 'hash',
        value: '#health'
    },
    {
        kind: 'chamber',
        group: 'Chambers',
        title: 'Ledger Flow',
        detail: 'Map sent, received, and first-funding paths around an account',
        badge: 'chamber',
        action: 'hash',
        value: '#ledger-flow'
    },
    {
        kind: 'chamber',
        group: 'Chambers',
        title: 'Liquidity Baking',
        detail: 'LB votes, EMA threshold, and protocol-level liquidity lore',
        badge: 'chamber',
        action: 'hash',
        value: '#lb'
    },
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

let protocols = [];
let protocolsPromise = null;
const bakerSearchCache = new Map();
const bakerSearchInFlight = new Map();

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

function searchText(result) {
    return [
        result.title,
        result.detail,
        result.group,
        result.kind,
        ...(result.aliases || [])
    ].join(' ').toLowerCase();
}

function matchesQuery(result, query) {
    const q = query.toLowerCase();
    if (!q) return true;
    const bare = q.replace(/^\//, '');
    return searchText(result).includes(q) || searchText(result).includes(bare);
}

function bakerSearchKey(query) {
    return normalizeQuery(query).toLowerCase().replace(/\s+/g, ' ');
}

function shouldSearchBakers(query) {
    const q = normalizeQuery(query);
    if (q.length < 2 || q.startsWith('/')) return false;
    if (ADDRESS_RE.test(q) || TEZ_DOMAIN_RE.test(q) || OPERATION_RE.test(q) || BLOCK_HASH_RE.test(q) || BLOCK_LEVEL_RE.test(q)) return false;
    return true;
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
        protocolsPromise = fetch(PROTOCOL_DATA_URL, { cache: 'no-store' })
            .then((resp) => resp.ok ? resp.json() : null)
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
        kind: 'command',
        group: 'Commands',
        title: command.title,
        detail: command.detail,
        badge: 'command',
        action: command.action || (command.id === 'theme' ? 'theme-picker' : 'hash'),
        value: command.value || command.hash,
        aliases: command.aliases
    };
}

function chamberResult(chamber) {
    return {
        kind: 'chamber',
        group: 'Governance & Chambers',
        title: chamber.title,
        detail: chamber.detail,
        badge: chamber.id === 'chamber' ? 'governance' : 'chamber',
        action: 'hash',
        value: chamber.hash,
        aliases: chamber.aliases
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

function cachedBakerResults(query) {
    const key = bakerSearchKey(query);
    const matches = bakerSearchCache.get(key);
    if (!Array.isArray(matches) || !matches.length) return [];
    return matches.map(bakerResult);
}

function bakerLoadingResult(query) {
    return {
        kind: 'baker',
        group: 'Bakers & Accounts',
        title: `Searching bakers for "${query}"`,
        detail: 'Checking the active leaderboard by baker alias and address',
        badge: 'baker',
        action: 'hash',
        value: '#leaderboard',
        aliases: ['baker search', 'leaderboard', query]
    };
}

function entityResults(query) {
    const q = normalizeQuery(query);
    if (!q) return [];

    if (ADDRESS_RE.test(q)) {
        if (q.startsWith('KT1')) {
            return [
                {
                    kind: 'contract',
                    group: 'Contracts',
                    title: 'Inspect KT1 contract',
                    detail: `${q} · native balance, activity, and account-flow view`,
                    badge: 'contract',
                    action: 'hash',
                    value: `#contract=${encodeURIComponent(q)}`
                },
                {
                    kind: 'chamber',
                    group: 'Governance & Chambers',
                    title: 'Open in Ledger Flow',
                    detail: 'Map sent, received, and first-funding transfer paths',
                    badge: 'flow',
                    action: 'hash',
                    value: `#ledger-flow=${encodeURIComponent(q)}`
                }
            ];
        }
        return [
            {
                kind: 'account',
                group: 'Bakers & Accounts',
                title: 'Inspect account',
                detail: `${q} · native balance, identity, and recent flow`,
                badge: 'account',
                action: 'hash',
                value: `#account=${encodeURIComponent(q)}`
            },
            {
                kind: 'account',
                group: 'Bakers & Accounts',
                title: 'Track as My Tezos',
                detail: `${q} · save this as your My Tezos account`,
                badge: 'account',
                action: 'hash',
                value: `#my-baker=${encodeURIComponent(q)}`
            },
            {
                kind: 'chamber',
                group: 'Governance & Chambers',
                title: 'Open in Ledger Flow',
                detail: 'Map sent, received, and first-funding transfer paths',
                badge: 'flow',
                action: 'hash',
                value: `#ledger-flow=${encodeURIComponent(q)}`
            },
            {
                kind: 'baker',
                group: 'Bakers & Accounts',
                title: 'Try as baker profile',
                detail: 'If this address bakes, open its operator drawer',
                badge: 'baker',
                action: 'hash',
                value: `#baker=${encodeURIComponent(q)}`
            }
        ];
    }

    if (TEZ_DOMAIN_RE.test(q)) {
        const domain = q.toLowerCase();
        return [
            {
                kind: 'chamber',
                group: 'Domains & Identity',
                title: `Check ${domain} in Tezos Domains`,
                detail: 'Lookup availability, owner, offers, auctions, and recent name activity',
                badge: '.tez',
                action: 'hash',
                value: `#domains=${encodeURIComponent(domain)}`
            },
            {
                kind: 'account',
                group: 'Bakers & Accounts',
                title: `Track ${domain} as My Tezos`,
                detail: 'Resolve Tezos Domains name and make it easy to change later',
                badge: '.tez',
                action: 'hash',
                value: `#my-baker=${encodeURIComponent(domain)}`
            },
            {
                kind: 'chamber',
                group: 'Governance & Chambers',
                title: `Open ${domain} in Ledger Flow`,
                detail: 'Resolve this Tezos Domains name and map account transfers',
                badge: 'flow',
                action: 'hash',
                value: `#ledger-flow=${encodeURIComponent(domain)}`
            },
            {
                kind: 'baker',
                group: 'Bakers & Accounts',
                title: `Try ${domain} as baker`,
                detail: 'Resolve domain and open baker profile if active',
                badge: 'baker',
                action: 'hash',
                value: `#baker=${encodeURIComponent(domain)}`
            }
        ];
    }

    if (OPERATION_RE.test(q)) {
        return [{
            kind: 'operation',
            group: 'Operations & Blocks',
            title: q,
            detail: 'Open native operation contents and status',
            badge: 'operation',
            action: 'hash',
            value: `#operation=${encodeURIComponent(q)}`
        }];
    }

    if (BLOCK_HASH_RE.test(q)) {
        return [{
            kind: 'block',
            group: 'Operations & Blocks',
            title: q,
            detail: 'Open native block receipt and producer view',
            badge: 'block',
            action: 'hash',
            value: `#block=${encodeURIComponent(q)}`
        }];
    }

    if (BLOCK_LEVEL_RE.test(q)) {
        return [{
            kind: 'block',
            group: 'Operations & Blocks',
            title: `Block #${Number(q).toLocaleString('en-US')}`,
            detail: 'Open native block receipt and producer view',
            badge: 'block',
            action: 'hash',
            value: `#block=${encodeURIComponent(q)}`
        }];
    }

    return [];
}

function starterResults(query) {
    const key = normalizeQuery(query).toLowerCase().replace(/\s+/g, ' ');
    const title = STARTER_QUERY_RESULTS.get(key);
    if (!title) return [];
    const result = EMPTY_STATE_ROWS.find((row) => row.title === title);
    return result ? [result] : [];
}

function textFallbackResults(query) {
    const q = normalizeQuery(query);
    if (!q || q.startsWith('/') || q.length < 2) return [];
    if (ADDRESS_RE.test(q) || TEZ_DOMAIN_RE.test(q) || OPERATION_RE.test(q) || BLOCK_HASH_RE.test(q) || BLOCK_LEVEL_RE.test(q)) return [];
    return [{
        kind: 'baker',
        group: 'Bakers & Accounts',
        title: `Search bakers for "${q}"`,
        detail: 'Open the leaderboard, then choose a baker profile or paste its address back here',
        badge: 'baker',
        action: 'hash',
        value: '#leaderboard',
        aliases: ['baker search', 'leaderboard', q]
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
    return results.filter((result) => {
        const key = `${result.kind}:${result.title}:${result.value || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function buildResults(query) {
    const q = normalizeQuery(query);
    const bakerMatches = cachedBakerResults(q);
    const bakerLoading = shouldSearchBakers(q) && !bakerSearchCache.has(bakerSearchKey(q)) && bakerSearchInFlight.has(bakerSearchKey(q))
        ? [bakerLoadingResult(q)]
        : [];
    const protocolMatches = protocols
        .slice()
        .reverse()
        .map(protocolResult)
        .filter((result) => matchesQuery(result, q));
    const commandMatches = COMMANDS.map(commandResult).filter((result) => matchesQuery(result, q));
    const chamberMatches = CHAMBERS.map(chamberResult).filter((result) => matchesQuery(result, q));
    const entityMatches = entityResults(q);
    const themeMatches = themeResults(q);
    const starterMatches = starterResults(q);

    if (!q) {
        return dedupeResults([
            ...EMPTY_STATE_ROWS,
            commandResult(COMMANDS.find((command) => command.id === 'theme'))
        ].filter(Boolean));
    }

    const directMatches = [
        ...entityMatches,
        ...themeMatches,
        ...starterMatches,
        ...protocolMatches.slice(0, 5),
        ...chamberMatches.slice(0, 4),
        ...commandMatches.slice(0, 4),
        ...bakerMatches,
        ...bakerLoading
    ];

    return dedupeResults([
        ...directMatches,
        ...(directMatches.length ? [] : textFallbackResults(q))
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

function resultHtml(result, index, selectedIndex) {
    const isExternal = result.action === 'external';
    const selected = index === selectedIndex;
    return `
        <button
            class="hero-search-result ${selected ? 'is-selected' : ''}"
            id="hero-search-option-${index}"
            type="button"
            role="option"
            aria-selected="${selected ? 'true' : 'false'}"
            data-result-index="${index}"
        >
            <span class="hero-result-mark" data-kind="${escapeHtml(result.kind)}" aria-hidden="true"></span>
            <span class="hero-result-copy">
                <strong>${escapeHtml(result.title)}</strong>
                <span>${escapeHtml(result.detail || '')}</span>
            </span>
            <span class="hero-result-badge" data-kind="${escapeHtml(result.badge || result.kind)}">${escapeHtml(result.badge || result.kind)}</span>
            ${isExternal ? '<span class="hero-result-external" aria-hidden="true">↗</span>' : ''}
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
    if (result.action === 'button') {
        document.getElementById(result.value)?.click();
        return true;
    }
    if (result.action === 'hen') {
        window.history.replaceState(null, '', '/?hen=1');
        if (window.HenMode?.activate) window.HenMode.activate();
        return true;
    }
    if (result.action === 'protocol') {
        navigateHash(`#protocol=${encodeURIComponent(result.value)}`);
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

function isTextEntryTarget(target) {
    const tag = target?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
}

export function initHeroSearch() {
    const root = document.getElementById('hero-slot');
    const form = document.getElementById('hero-search-form');
    const input = document.getElementById('hero-search-input');
    const panel = document.getElementById('hero-search-panel');
    const chips = document.getElementById('hero-search-chips');
    if (!root || !form || !input || !panel || !chips) return;
    ensureHeroSearchStyles();

    let isOpen = false;
    let selectedIndex = -1;
    let results = [];

    chips.innerHTML = QUICK_CHIPS.map((chip) => `
        <button class="hero-search-chip" type="button" data-hero-query="${escapeHtml(chip.value)}">${escapeHtml(chip.label)}</button>
    `).join('');

    const setOpen = (next) => {
        isOpen = Boolean(next);
        root.classList.toggle('is-open', isOpen);
        document.body.classList.toggle('hero-search-mode', isOpen);
        panel.hidden = !isOpen;
        input.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (!isOpen) {
            selectedIndex = -1;
            input.setAttribute('aria-activedescendant', '');
        }
    };

    const syncActiveDescendant = () => {
        if (selectedIndex >= 0) {
            input.setAttribute('aria-activedescendant', `hero-search-option-${selectedIndex}`);
        } else {
            input.setAttribute('aria-activedescendant', '');
        }
    };

    const queueBakerLookup = (value) => {
        const q = normalizeQuery(value);
        if (!shouldSearchBakers(q)) return;
        const key = bakerSearchKey(q);
        if (bakerSearchCache.has(key) || bakerSearchInFlight.has(key)) return;
        const promise = findBakersByName(q, { limit: 5 })
            .then((matches) => {
                bakerSearchCache.set(key, Array.isArray(matches) ? matches : []);
            })
            .catch(() => {
                bakerSearchCache.set(key, []);
            })
            .finally(() => {
                bakerSearchInFlight.delete(key);
                if (isOpen && bakerSearchKey(input.value) === key) render();
            });
        bakerSearchInFlight.set(key, promise);
    };

    const render = () => {
        queueBakerLookup(input.value);
        results = buildResults(input.value);
        if (selectedIndex >= results.length) selectedIndex = results.length ? 0 : -1;
        if (selectedIndex < 0 && normalizeQuery(input.value) && results.length) selectedIndex = 0;

        if (!results.length) {
            panel.innerHTML = '<div class="hero-search-empty">No Tezos Systems room matched that yet. Try a wallet address, .tez name, baker, KT1 contract, operation hash, block, protocol, or slash command.</div>';
            syncActiveDescendant();
            return;
        }

        let index = 0;
        const guide = normalizeQuery(input.value)
            ? ''
            : '<div class="hero-search-guide"><strong>Search accepts:</strong> wallet addresses, .tez names, bakers, KT1 contracts, operation hashes, block levels, protocols, Chambers, and slash commands. Press / from anywhere.</div>';
        panel.innerHTML = guide + groupedResults(results).map((group) => {
            const rows = group.results.map((result) => resultHtml(result, index++, selectedIndex)).join('');
            return `
                <section class="hero-search-group" aria-label="${escapeHtml(group.label)}">
                    <div class="hero-search-group-label">${escapeHtml(group.label)}</div>
                    ${rows}
                </section>
            `;
        }).join('');
        syncActiveDescendant();
    };

    const debouncedRender = debounce(render, 80);

    const ensureProtocols = () => {
        loadProtocols().then(() => {
            if (isOpen) render();
        });
    };

    const applyQuery = (value) => {
        input.value = value || '';
        input.focus();
        setOpen(true);
        ensureProtocols();
        selectedIndex = -1;
        render();
    };

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!isOpen) setOpen(true);
        if (!results.length) render();
        const result = results[selectedIndex >= 0 ? selectedIndex : 0];
        if (runResult(result)) setOpen(false);
    });

    form.addEventListener('click', (event) => {
        if (event.target.closest('.hero-search-submit')) return;
        if (document.activeElement !== input) input.focus();
        if (!isOpen) {
            setOpen(true);
            ensureProtocols();
            render();
        }
    });

    input.addEventListener('focus', () => {
        setOpen(true);
        ensureProtocols();
        render();
    });

    input.addEventListener('input', () => {
        if (!isOpen) setOpen(true);
        selectedIndex = -1;
        debouncedRender();
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (isOpen) {
                event.preventDefault();
                setOpen(false);
            }
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            if (!isOpen) setOpen(true);
            if (!results.length) render();
            const result = results[selectedIndex >= 0 ? selectedIndex : 0];
            if (runResult(result)) setOpen(false);
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        if (!isOpen) {
            setOpen(true);
            render();
        }
        if (!results.length) return;
        const dir = event.key === 'ArrowDown' ? 1 : -1;
        selectedIndex = selectedIndex < 0
            ? (dir > 0 ? 0 : results.length - 1)
            : (selectedIndex + dir + results.length) % results.length;
        render();
    });

    panel.addEventListener('mousemove', (event) => {
        const option = event.target.closest('[data-result-index]');
        if (!option) return;
        const next = Number(option.dataset.resultIndex);
        if (!Number.isFinite(next) || next === selectedIndex) return;
        selectedIndex = next;
        render();
    });

    panel.addEventListener('click', (event) => {
        const option = event.target.closest('[data-result-index]');
        if (!option) return;
        const result = results[Number(option.dataset.resultIndex)];
        if (runResult(result)) setOpen(false);
    });

    chips.addEventListener('click', (event) => {
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
        if (!isOpen || root.contains(event.target)) return;
        setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        if (isTextEntryTarget(event.target)) return;
        event.preventDefault();
        input.focus();
        input.select();
    });

    // Warm the protocol index after first paint, but keep the hero input cheap.
    window.setTimeout(ensureProtocols, 1200);
}
