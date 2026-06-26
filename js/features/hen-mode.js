/* ═══════════════════════════════════════════════════
   HEN MODE — live Tezos NFT discovery
   ═══════════════════════════════════════════════════ */

const HenMode = (() => {
    const API = 'https://data.objkt.com/v3/graphql';
    const IPFS_GW = 'https://dweb.link/ipfs/';
    const IPFS_GATEWAYS = [
        'https://dweb.link/ipfs/',
        'https://nftstorage.link/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
        'https://ipfs.io/ipfs/'
    ];
    const OBJKT_ASSETS_BASE = 'https://assets.objkt.media/file/assets-003/';
    const TEIA_BASE = 'https://teia.art';
    const HEN_CONTRACT = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
    const PAGE_SIZE = 40;
    const MAX_GRID_CARDS = 220;
    const HEN_EAGER_CARD_LIMIT = 8;
    const POLL_INTERVAL = 15000;
    const DEFAULT_IMAGE_RETRY_DELAYS = [3000, 10000, 30000, 120000, 300000];
    const TEZ_DOMAINS_API = 'https://api.tezos.domains/graphql';
    const HEN_SOURCE_KEY = 'tezos-systems-hen-source';
    const HEN_SORT_KEY = 'tezos-systems-hen-sort';
    const HEN_FAVORITES_KEY = 'tezos-systems-hen-favorites';
    const HEN_HINT_DISMISSED_KEY = 'tezos-systems-hen-loop-hint-dismissed';
    const HEN_VIEWER_KEY = 'tezos-systems-hen-viewer-address';
    const MY_TEZOS_ADDRESS_KEY = 'tezos-systems-my-baker-address';
    const OCTEZ_WALLET_ADDRESS_KEY = 'tezos-systems-octez-wallet-address';
    const SAVED_ADDRESS_KEYS = [
        MY_TEZOS_ADDRESS_KEY,
        OCTEZ_WALLET_ADDRESS_KEY,
        HEN_VIEWER_KEY,
        'tezos-systems-objkt-address'
    ];
    const DEFAULT_FEED_MODE = 'all';
    const DEFAULT_SORT_MODE = 'newest';
    const FEED_MODES = {
        all: {
            label: 'Teia + OBJKT',
            loading: 'indexing live Tezos NFT feed...',
            empty: 'no live Teia or OBJKT mints found.'
        },
        teia: {
            label: 'Teia',
            loading: 'indexing live Teia / HEN feed...',
            empty: 'no live Teia OBJKTs found.'
        },
        objkt: {
            label: 'OBJKT',
            loading: 'indexing live OBJKT feed...',
            empty: 'no live OBJKT mints found.'
        }
    };
    const SORT_MODES = {
        newest: {
            label: 'newest',
            orderBy: '{timestamp: desc}'
        },
        cheapest: {
            label: 'cheapest',
            orderBy: '{lowest_ask: asc, timestamp: desc}'
        },
        scarce: {
            label: 'scarce',
            orderBy: '{supply: asc, timestamp: desc}'
        }
    };

    let tokens = [];
    let tokenCache = new Map();
    let loading = false;
    let offset = 0;
    let pollTimer = null;
    let newestTimestamp = null;
    let isActive = false;
    let searchMode = null;
    let artistMode = null;
    let feedMode = DEFAULT_FEED_MODE;
    let sortMode = DEFAULT_SORT_MODE;
    let feedGeneration = 0;
    let listedOnly = false;
    let priceMaxMutez = null;
    let editionMax = null;
    let hideOwned = false;
    let savedOnly = false;
    let favoriteKeys = new Set();
    let mobileFiltersOpen = false;
    let viewerAddress = null;
    let viewerLabel = null;
    let viewerHoldings = new Map();
    let profileGeneration = 0;
    let profileCache = new Map();
    let xtzUsd = null;
    let walletModulePromise = null;
    let objktProfileModulePromise = null;
    let searchDebounceTimer = null;
    let expandedReturnFocus = null;
    let baseMetaSnapshot = null;
    const tezNameCache = {};

    const el = (id) => document.getElementById(id);
    const overlay = () => el('hen-overlay');
    const grid = () => el('hen-grid');
    const boot = () => el('hen-boot');
    const expanded = () => el('hen-expanded');
    const cliInput = () => el('hen-cli-input');
    const mintCount = () => el('hen-mint-count');
    const loadingEl = () => el('hen-loading');
    const profilePanel = () => el('hen-profile-panel');

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function imageRetryDelays() {
        return Array.isArray(window.__HEN_IMAGE_RETRY_DELAYS__) && window.__HEN_IMAGE_RETRY_DELAYS__.length
            ? window.__HEN_IMAGE_RETRY_DELAYS__
            : DEFAULT_IMAGE_RETRY_DELAYS;
    }

    function objktMediaUrl(contract, tokenId, variant) {
        if (!contract || !tokenId) return '';
        return OBJKT_ASSETS_BASE + encodeURIComponent(contract) + '/' + encodeURIComponent(tokenId) + '/' + (variant || 'thumb400');
    }

    function mediaCdnUrl(token, variant) {
        return token ? objktMediaUrl(token.fa_contract, token.token_id, variant) : '';
    }

    function resolveUri(uri, attempt) {
        if (!uri) return '';
        if (uri.startsWith('ipfs://')) {
            var gateway = IPFS_GATEWAYS[Math.max(0, attempt || 0) % IPFS_GATEWAYS.length] || IPFS_GW;
            return gateway + uri.slice(7);
        }
        return uri;
    }

    function resolveMediaUri(uri, attempt, options) {
        options = options || {};
        if ((attempt || 0) === 0 && options.cdnUrl) return options.cdnUrl;
        var gatewayAttempt = options.cdnUrl ? (Math.max(0, attempt || 0) - 1) : (attempt || 0);
        return resolveUri(uri, Math.max(0, gatewayAttempt));
    }

    function retryableImageUrl(uri, attempt, options) {
        var url = resolveUri(uri, attempt);
        if (options && options.cdnUrl) {
            url = resolveMediaUri(uri, attempt, options);
        }
        if (!url || url.startsWith('data:')) return url;
        var separator = url.indexOf('?') === -1 ? '?' : '&';
        return url + separator + 'hen_retry=' + encodeURIComponent(String(attempt || 0)) + '-' + Date.now();
    }

    function setupImageRetry(img, rawUri, options) {
        if (!img || !rawUri || rawUri.startsWith('data:')) return;
        options = options || {};
        img.dataset.henRawUri = rawUri;
        if (options.cdnUrl) img.dataset.henCdnUrl = options.cdnUrl;
        img.dataset.henRetryAttempt = '0';
        img.addEventListener('load', function() {
            img.classList.remove('hen-image-retrying');
            img.removeAttribute('data-hen-retry-waiting');
            var thumb = img.closest('.hen-card-thumb, .hen-artist-thumb');
            if (thumb) thumb.classList.add('hen-thumb-loaded');
        });
        img.addEventListener('error', function() {
            if (img.dataset.henRetryWaiting === '1') return;
            var attempts = Number(img.dataset.henRetryAttempt || '0') + 1;
            img.dataset.henRetryAttempt = String(attempts);
            img.dataset.henRetryWaiting = '1';
            img.classList.add('hen-image-retrying');
            var delays = imageRetryDelays();
            var delay = Number(delays[Math.min(attempts - 1, delays.length - 1)]) || 3000;
            setTimeout(function() {
                if (!isActive || !img.isConnected) return;
                img.dataset.henRetryWaiting = '0';
                img.style.display = '';
                img.src = retryableImageUrl(rawUri, attempts, { cdnUrl: img.dataset.henCdnUrl || '' });
            }, delay);
        });
    }

    function clearInitialBlackout() {
        var blackout = document.getElementById('hen-initial-blackout');
        if (blackout) blackout.remove();
        document.documentElement.style.background = '';
    }

    function escapeGraphqlString(str) {
        return String(str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function safeGetStorage(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }

    function safeSetStorage(key, value) {
        try { localStorage.setItem(key, value); } catch (_) {}
    }

    function safeRemoveStorage(key) {
        try { localStorage.removeItem(key); } catch (_) {}
    }

    function loadFavoriteKeys() {
        try {
            var raw = localStorage.getItem(HEN_FAVORITES_KEY);
            var parsed = raw ? JSON.parse(raw) : [];
            favoriteKeys = new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
        } catch (_) {
            favoriteKeys = new Set();
        }
    }

    function persistFavoriteKeys() {
        try {
            localStorage.setItem(HEN_FAVORITES_KEY, JSON.stringify(Array.from(favoriteKeys)));
        } catch (_) {}
    }

    function isFavoriteToken(token) {
        return favoriteKeys.has(tokenKey(token));
    }

    function setFavoriteToken(token, active) {
        var key = tokenKey(token);
        if (!key) return;
        if (active) favoriteKeys.add(key);
        else favoriteKeys.delete(key);
        persistFavoriteKeys();
        applyFavoriteBadges();
        updateStatusStrip();
    }

    function favoriteWhereClause() {
        if (!savedOnly) return '';
        var keys = Array.from(favoriteKeys);
        if (keys.length === 0) return '_and: [{token_id: {_eq: "__no_saved_tokens__"}}]';
        var parts = keys.map(function(key) {
            var split = key.split(':');
            return '{fa_contract: {_eq: "' + escapeGraphqlString(split[0] || '') + '"}, token_id: {_eq: "' + escapeGraphqlString(split.slice(1).join(':') || '') + '"}}';
        });
        return '_or: [' + parts.join(', ') + ']';
    }

    function timeAgo(ts) {
        const diff = Date.now() - new Date(ts).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'now';
        if (mins < 60) return '+' + mins + 'm';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return '+' + hrs + 'h';
        return '+' + Math.floor(hrs / 24) + 'd';
    }

    function shortAddr(addr) {
        if (!addr) return '???';
        return addr.slice(0, 5) + '...' + addr.slice(-4);
    }

    function isValidAddress(addr) {
        return /^(tz[1-4]|KT1)[a-zA-Z0-9]{33}$/.test(String(addr || ''));
    }

    function isTezDomain(input) {
        return /\.tez$/i.test(String(input || '').trim());
    }

    function tokenKey(token) {
        return token ? token.fa_contract + ':' + token.token_id : '';
    }

    function normalizeMutez(mutez) {
        var amount = Number(mutez);
        return Number.isFinite(amount) && amount > 0 ? amount : null;
    }

    function hasListing(token) {
        return Boolean(token && normalizeMutez(token.lowest_ask));
    }

    function formatPrice(mutez) {
        var amount = normalizeMutez(mutez);
        if (!amount) return null;
        const xtz = amount / 1000000;
        return xtz < 1 ? xtz.toFixed(2) : xtz.toFixed(1);
    }

    function formatUsd(mutez) {
        var amount = normalizeMutez(mutez);
        if (!amount || !xtzUsd) return '';
        const usd = (amount / 1000000) * xtzUsd;
        return usd < 0.01 ? '<$0.01' : '$' + usd.toFixed(2);
    }

    function formatFilterPrice(mutez) {
        if (!mutez) return '';
        var xtz = mutez / 1000000;
        return xtz < 1 ? xtz.toFixed(2) : xtz.toFixed(1);
    }

    function formatMarketPrice(mutezLike) {
        var amount = Number(mutezLike);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        var xtz = amount > 10000 ? amount / 1000000 : amount;
        if (xtz < 1) return xtz.toFixed(2);
        if (xtz < 100) return xtz.toFixed(1);
        return Math.round(xtz).toLocaleString();
    }

    function metaTag(selector, attr, value) {
        var node = document.querySelector(selector);
        if (node) node.setAttribute(attr, value);
    }

    function captureBaseMeta() {
        if (baseMetaSnapshot) return;
        baseMetaSnapshot = {
            title: document.title,
            ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
            ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
            ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content') || '',
            ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
            twitterTitle: document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '',
            twitterDescription: document.querySelector('meta[name="twitter:description"]')?.getAttribute('content') || '',
            twitterImage: document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || ''
        };
    }

    function updateShareMeta(token, displayName) {
        captureBaseMeta();
        if (!token) return;
        var title = (token.name || 'Tezos NFT') + ' by ' + (displayName || shortAddr((token.creators && token.creators[0] && token.creators[0].creator_address) || ''));
        var price = formatPrice(token.lowest_ask);
        var description = (price ? 'Listed for ' + price + ' ꜩ. ' : '') + 'Discover this Tezos NFT in HEN mode on Tezos Systems.';
        var image = mediaCdnUrl(token, 'thumb400') || resolveUri(token.display_uri || token.thumbnail_uri || '');
        document.title = title + ' - HEN Mode';
        metaTag('meta[property="og:title"]', 'content', title);
        metaTag('meta[property="og:description"]', 'content', description);
        metaTag('meta[property="og:url"]', 'content', pieceUrl(token));
        if (image) metaTag('meta[property="og:image"]', 'content', image);
        metaTag('meta[name="twitter:title"]', 'content', title);
        metaTag('meta[name="twitter:description"]', 'content', description);
        if (image) metaTag('meta[name="twitter:image"]', 'content', image);
    }

    function restoreShareMeta() {
        if (!baseMetaSnapshot) return;
        document.title = baseMetaSnapshot.title;
        metaTag('meta[property="og:title"]', 'content', baseMetaSnapshot.ogTitle);
        metaTag('meta[property="og:description"]', 'content', baseMetaSnapshot.ogDescription);
        metaTag('meta[property="og:url"]', 'content', baseMetaSnapshot.ogUrl);
        metaTag('meta[property="og:image"]', 'content', baseMetaSnapshot.ogImage);
        metaTag('meta[name="twitter:title"]', 'content', baseMetaSnapshot.twitterTitle);
        metaTag('meta[name="twitter:description"]', 'content', baseMetaSnapshot.twitterDescription);
        metaTag('meta[name="twitter:image"]', 'content', baseMetaSnapshot.twitterImage);
    }

    function parsePositiveNumber(value) {
        var num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : null;
    }

    function isHenToken(token) {
        return token && token.fa_contract === HEN_CONTRACT;
    }

    function platformKey(token) {
        return isHenToken(token) ? 'teia' : 'objkt';
    }

    function platformLabel(token) {
        return platformKey(token).toUpperCase();
    }

    function sourceWhereClauses(mode) {
        if (mode === 'teia') {
            return ['fa_contract: {_eq: "' + HEN_CONTRACT + '"}'];
        }
        if (mode === 'objkt') {
            return [
                'fa_contract: {_neq: "' + HEN_CONTRACT + '"}',
                'fa: {collection_type: {_eq: "artist"}}'
            ];
        }
        return [
            '_or: [{fa_contract: {_eq: "' + HEN_CONTRACT + '"}}, {fa_contract: {_neq: "' + HEN_CONTRACT + '"}, fa: {collection_type: {_eq: "artist"}}}]'
        ];
    }

    function effectiveListedOnly() {
        return Boolean(listedOnly || priceMaxMutez || sortMode === 'cheapest');
    }

    function listingWhereClause() {
        if (priceMaxMutez) return 'lowest_ask: {_gt: "0", _lte: "' + priceMaxMutez + '"}';
        if (effectiveListedOnly()) return 'lowest_ask: {_gt: "0"}';
        return '';
    }

    function orderByClause() {
        var sort = SORT_MODES[sortMode] ? sortMode : DEFAULT_SORT_MODE;
        return SORT_MODES[sort].orderBy;
    }

    function tokenFields(extra) {
        return 'token_id fa_contract name timestamp mime supply lowest_ask display_uri thumbnail_uri creators { creator_address } fa { name logo }' + (extra ? ' ' + extra : '');
    }

    function teiaUrl(token) {
        return TEIA_BASE + '/objkt/' + encodeURIComponent(token.token_id);
    }

    function objktUrl(token) {
        if (isHenToken(token)) {
            return 'https://objkt.com/tokens/hicetnunc/' + token.token_id;
        }
        return 'https://objkt.com/tokens/' + token.fa_contract + '/' + token.token_id;
    }

    function externalActionsHtml(token) {
        var price = formatPrice(token.lowest_ask);
        var primaryLabel = price
            ? 'collect on ' + (isHenToken(token) ? 'teia' : 'objkt') + ' · ' + price + ' ꜩ →'
            : 'view on ' + (isHenToken(token) ? 'teia' : 'objkt') + ' →';
        var primary = isHenToken(token)
            ? '<a class="hen-expanded-collect' + (price ? ' is-listed' : '') + '" href="' + teiaUrl(token) + '" target="_blank" rel="noopener">' + primaryLabel + '</a>'
            : '<a class="hen-expanded-collect' + (price ? ' is-listed' : '') + '" href="' + objktUrl(token) + '" target="_blank" rel="noopener">' + primaryLabel + '</a>';
        var secondary = isHenToken(token)
            ? '<a class="hen-expanded-secondary" href="' + objktUrl(token) + '" target="_blank" rel="noopener">open objkt</a>'
            : '';
        return primary + secondary;
    }

    function pieceUrl(token) {
        if (isHenToken(token)) {
            return window.location.origin + '/?hen=1&teia=' + encodeURIComponent(token.token_id);
        }
        return window.location.origin + '/?hen=1&objkt=' + token.fa_contract + '/' + token.token_id;
    }

    // .tez domain resolution
    async function resolveTezName(addr) {
        if (tezNameCache[addr] !== undefined) return tezNameCache[addr];
        try {
            const res = await fetch(TEZ_DOMAINS_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: '{ reverseRecord(address: "' + addr + '") { domain { name } } }'
                })
            });
            const json = await res.json();
            var name = (json.data && json.data.reverseRecord && json.data.reverseRecord.domain) ? json.data.reverseRecord.domain.name : null;
            tezNameCache[addr] = name;
            return name;
        } catch (e) {
            tezNameCache[addr] = null;
            return null;
        }
    }

    async function resolveForwardTezName(name) {
        try {
            const res = await fetch(TEZ_DOMAINS_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: '{ domain(name: "' + escapeGraphqlString(name.toLowerCase()) + '") { address } }'
                })
            });
            const json = await res.json();
            return json && json.data && json.data.domain ? json.data.domain.address : null;
        } catch (e) {
            return null;
        }
    }

    async function resolveNamesForCards() {
        const cards = document.querySelectorAll('.hen-card[data-creator]');
        for (const card of cards) {
            const addr = card.dataset.creator;
            if (!addr || card.dataset.resolved) continue;
            card.dataset.resolved = '1';
            const name = await resolveTezName(addr);
            if (name) {
                const creatorEl = card.querySelector('.hen-card-creator');
                if (creatorEl) creatorEl.textContent = name;
            }
        }
    }

    async function fetchViewerHoldingsForTokens(addr, tokenList) {
        if (!addr || !tokenList || tokenList.length === 0) return new Map();
        var unique = [];
        var seen = new Set();
        tokenList.forEach(function(token) {
            var key = tokenKey(token);
            if (key && !seen.has(key)) {
                seen.add(key);
                unique.push(token);
            }
        });
        if (unique.length === 0) return new Map();

        var clauses = unique.slice(0, 60).map(function(token) {
            return '{fa_contract: {_eq: "' + escapeGraphqlString(token.fa_contract) + '"}, token_id: {_eq: "' + escapeGraphqlString(token.token_id) + '"}}';
        });
        var query = 'query HenViewerHoldings { holder(where: {address: {_eq: "' + escapeGraphqlString(addr) + '"}}, limit: 1) { held_tokens(where: {quantity: {_gt: "0"}, token: {_or: [' + clauses.join(', ') + ']}}, limit: 60) { quantity token { token_id fa_contract } } } }';
        var res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        if (!res.ok) throw new Error('Objkt holdings API ' + res.status);
        var json = await res.json();
        var rows = json && json.data && json.data.holder && json.data.holder[0] ? (json.data.holder[0].held_tokens || []) : [];
        var map = new Map();
        rows.forEach(function(row) {
            if (!row || !row.token) return;
            map.set(row.token.fa_contract + ':' + row.token.token_id, Number(row.quantity) || 0);
        });
        return map;
    }

    async function fetchXtzPrice() {
        // Check price.js sessionStorage cache first (avoids duplicate CoinGecko requests)
        try {
            const raw = sessionStorage.getItem('tezos_price_cache');
            if (raw) {
                const cached = JSON.parse(raw);
                if (Date.now() - cached.timestamp < 60 * 1000 && cached.data && cached.data.usd) {
                    xtzUsd = cached.data.usd;
                    return;
                }
            }
        } catch (_) {}
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd,eur,btc&include_24hr_change=true&include_market_cap=true');
            const json = await res.json();
            xtzUsd = (json.tezos && json.tezos.usd) ? json.tezos.usd : null;
            // Populate the shared sessionStorage cache so other modules benefit
            if (json.tezos) {
                try { sessionStorage.setItem('tezos_price_cache', JSON.stringify({ timestamp: Date.now(), data: json.tezos })); } catch (_) {}
            }
        } catch (e) { xtzUsd = null; }
    }

    async function fetchTokens(limit, offsetVal, after) {
        limit = limit || PAGE_SIZE;
        offsetVal = offsetVal || 0;
        const where = [
            'display_uri: {_like: "ipfs://%"}',
            'supply: {_gt: "0"}'
        ];
        where.push(...sourceWhereClauses(feedMode));
        var listingClause = listingWhereClause();
        var savedClause = favoriteWhereClause();
        if (listingClause) where.push(listingClause);
        if (savedClause) where.push(savedClause);
        if (editionMax) where.push('supply: {_lte: "' + editionMax + '"}');
        if (after) where.push('timestamp: {_gt: "' + after + '"}');
        if (searchMode) where.push('name: {_ilike: "%' + escapeGraphqlString(searchMode) + '%"}');
        if (artistMode) where.push('creators: {creator_address: {_eq: "' + escapeGraphqlString(artistMode) + '"}}');

        const query = '{ token(order_by: ' + (after ? '{timestamp: desc}' : orderByClause()) + ', limit: ' + limit + ', offset: ' + offsetVal + ', where: {' + where.join(', ') + '}) { ' + tokenFields() + ' } }';

        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        if (!res.ok) throw new Error('Objkt API ' + res.status);
        const json = await res.json();
        return (json.data && json.data.token) ? json.data.token : [];
    }

    async function fetchTokenDetails(token) {
        if (!token) return null;
        var extra = 'holders(where: {quantity: {_gt: "0"}}, limit: 1000) { holder_address quantity } listings_active(where: {amount_left: {_gt: "0"}}, order_by: {price_xtz: asc}, limit: 30) { amount amount_left price price_xtz timestamp } listing_sales(order_by: {timestamp: desc}, limit: 1) { price price_xtz timestamp }';
        var query = '{ token(where: {fa_contract: {_eq: "' + escapeGraphqlString(token.fa_contract) + '"}, token_id: {_eq: "' + escapeGraphqlString(token.token_id) + '"}}, limit: 1) { ' + tokenFields(extra) + ' } }';
        var res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        if (!res.ok) throw new Error('Objkt token detail API ' + res.status);
        var json = await res.json();
        if (json.errors && json.errors.length) throw new Error(json.errors[0].message || 'Objkt token detail query failed');
        return json && json.data && json.data.token ? json.data.token[0] : null;
    }

    async function fetchArtistWork(creatorAddr, excludeTokenId, excludeContract) {
        const where = [
            'creators: {creator_address: {_eq: "' + escapeGraphqlString(creatorAddr) + '"}}',
            'display_uri: {_like: "ipfs://%"}',
            'supply: {_gt: "0"}'
        ];
        where.push(...sourceWhereClauses(feedMode));
        const query = '{ token(order_by: ' + orderByClause() + ', limit: 6, where: {' + where.join(', ') + '}) { ' + tokenFields() + ' } }';
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        const json = await res.json();
        var all = (json.data && json.data.token) ? json.data.token : [];
        return all.filter(function(t) { return !(t.token_id === excludeTokenId && t.fa_contract === excludeContract); }).slice(0, 5);
    }

    function walletModule() {
        if (!walletModulePromise) walletModulePromise = import('/js/core/wallet.js');
        return walletModulePromise;
    }

    function preloadWalletConnect() {
        return walletModule().then(function(wallet) {
            if (wallet && wallet.preloadOctezConnect) return wallet.preloadOctezConnect();
            return null;
        }).catch(function(err) {
            console.warn('[HEN] wallet preload failed:', err);
            return null;
        });
    }

    function objktProfileModule() {
        if (!objktProfileModulePromise) objktProfileModulePromise = import('/js/features/objkt.js');
        return objktProfileModulePromise;
    }

    function fmtCount(value) {
        return (Number(value) || 0).toLocaleString();
    }

    function fmtProfileXTZ(value) {
        var xtz = Number(value) || 0;
        if (xtz >= 1000000) return (xtz / 1000000).toFixed(1) + 'M ꜩ';
        if (xtz >= 1000) return (xtz / 1000).toFixed(1) + 'K ꜩ';
        if (xtz >= 1) return xtz.toFixed(1) + ' ꜩ';
        if (xtz > 0) return xtz.toFixed(2) + ' ꜩ';
        return '0 ꜩ';
    }

    function renderProfileMetric(label, value) {
        return '<div class="hen-profile-metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }

    function renderProfileCollectionRow(collection) {
        var stats = [];
        if (collection.items !== undefined) stats.push(fmtCount(collection.items) + ' items');
        if (collection.owners !== undefined) stats.push(fmtCount(collection.owners) + ' owners');
        if (collection.volume !== undefined) stats.push('vol ' + fmtProfileXTZ(collection.volume));
        if (collection.floor !== undefined) stats.push('floor ' + fmtProfileXTZ(collection.floor));
        if (collection.assetCount !== undefined) stats.push(fmtCount(collection.assetCount) + ' assets');
        if (collection.editionCount && collection.editionCount > collection.assetCount && collection.editionCount <= 1000000) {
            stats.push(fmtCount(collection.editionCount) + ' editions');
        }
        var logo = collection.logo ? '<img class="hen-profile-row-logo" src="' + escapeHtml(resolveUri(collection.logo)) + '" alt="" loading="lazy">' : '<span class="hen-profile-row-logo is-empty"></span>';
        return '<div class="hen-profile-row">' + logo + '<span>' + escapeHtml(collection.name || 'Unknown') + '</span><em>' + escapeHtml(stats.join(' · ')) + '</em></div>';
    }

    function renderProfileAvatar(profile, display) {
        if (profile && profile.logo) {
            return '<img class="hen-profile-avatar" src="' + escapeHtml(resolveUri(profile.logo)) + '" alt="' + escapeHtml(display) + '" loading="lazy">';
        }
        return '<div class="hen-profile-avatar is-empty">' + escapeHtml((display || '?').slice(0, 1).toUpperCase()) + '</div>';
    }

    function renderProfileLinks(profile, address) {
        var links = ['<a href="https://objkt.com/profile/' + encodeURIComponent(address) + '" target="_blank" rel="noopener">objkt</a>'];
        if (profile && profile.twitter) {
            var handle = String(profile.twitter).replace(/^@/, '');
            if (handle) links.push('<a href="https://x.com/' + encodeURIComponent(handle) + '" target="_blank" rel="noopener">x</a>');
        }
        return links.join('');
    }

    function renderRecentAcquisitions(collector) {
        var rows = collector && collector.recentAcquisitions ? collector.recentAcquisitions.slice(0, 6) : [];
        if (!rows.length) return '';
        return '<div class="hen-profile-recent"><span class="hen-profile-list-title">recent acquisitions</span><div class="hen-profile-recent-strip">' +
            rows.map(function(item) {
                var raw = item.thumbnail || '';
                var cdnThumb = objktMediaUrl(item.contract, item.tokenId, 'thumb288');
                var img = raw ? '<img src="' + escapeHtml(resolveMediaUri(raw, 0, { cdnUrl: cdnThumb })) + '" alt="' + escapeHtml(item.name || '') + '" loading="lazy" data-hen-cdn-url="' + escapeHtml(cdnThumb) + '" data-hen-raw-uri="' + escapeHtml(raw) + '">' : '';
                return '<div class="hen-profile-recent-item">' + img + '<span>' + escapeHtml(item.name || 'untitled') + '</span><em>' + escapeHtml(item.quantity && Number(item.quantity) > 1 ? 'x' + item.quantity : (item.collection || '')) + '</em></div>';
            }).join('') +
            '</div></div>';
    }

    function setupProfileImages() {
        document.querySelectorAll('.hen-profile-panel img[data-hen-raw-uri]').forEach(function(img) {
            if (!img.dataset.henRetryAttempt) setupImageRetry(img, img.dataset.henRawUri || '', { cdnUrl: img.dataset.henCdnUrl || '' });
        });
    }

    function profileDisplayName(profile, address) {
        return (profile && (profile.alias || profile.tzdomain)) || viewerLabel || shortAddr(address);
    }

    function renderCollectorProfile(address, profile) {
        var panel = profilePanel();
        if (!panel) return;
        if (!address) {
            panel.hidden = true;
            panel.innerHTML = '';
            return;
        }
        var display = profileDisplayName(profile, address);
        if (!profile || (!profile.creator && !profile.collector)) {
            panel.hidden = false;
            panel.innerHTML =
                '<div class="hen-profile-head">' +
                    renderProfileAvatar(profile, display) +
                    '<div><span class="hen-profile-kicker">collector profile</span><strong>' + escapeHtml(display) + '</strong></div>' +
                    '<div class="hen-profile-actions">' + renderProfileLinks(profile, address) + '</div>' +
                '</div>' +
                '<div class="hen-profile-empty">No OBJKT activity found yet.</div>';
            return;
        }

        var metrics = [];
        var collector = profile.collector || null;
        var creator = profile.creator || null;
        if (collector) {
            var assetsHeld = collector.uniqueAssetsHeld ?? collector.totalHeld;
            metrics.push(renderProfileMetric('Owned NFTs', fmtCount(assetsHeld)));
            if (collector.totalHeld > assetsHeld && collector.totalHeld <= 1000000) metrics.push(renderProfileMetric('Editions', fmtCount(collector.totalHeld)));
            metrics.push(renderProfileMetric('Collections', fmtCount(collector.uniqueCollections)));
            metrics.push(renderProfileMetric('Spent', fmtProfileXTZ(collector.totalSpent)));
            if (collector.portfolioValue > 0) metrics.push(renderProfileMetric('Floor Value', fmtProfileXTZ(collector.portfolioValue)));
        }
        if (creator) {
            metrics.push(renderProfileMetric('Created NFTs', fmtCount(creator.totalCreated)));
            metrics.push(renderProfileMetric('Sales', fmtProfileXTZ(creator.totalSalesVolume)));
            metrics.push(renderProfileMetric('Sales Count', fmtCount(creator.totalSalesCount)));
            if (creator.collections && creator.collections.length > 0) metrics.push(renderProfileMetric('Created Collections', fmtCount(creator.collections.length)));
        }

        var lists = '';
        if (collector && collector.topCollections && collector.topCollections.length > 0) {
            lists += '<div class="hen-profile-list"><span class="hen-profile-list-title">owned collections</span>' +
                collector.topCollections.slice(0, 5).map(renderProfileCollectionRow).join('') + '</div>';
        }
        if (creator && creator.collections && creator.collections.length > 0) {
            lists += '<div class="hen-profile-list"><span class="hen-profile-list-title">created collections</span>' +
                creator.collections.slice(0, 5).map(renderProfileCollectionRow).join('') + '</div>';
        }
        var recent = renderRecentAcquisitions(collector);
        var description = profile.description ? '<p class="hen-profile-description">' + escapeHtml(profile.description).slice(0, 260) + '</p>' : '';

        panel.hidden = false;
        panel.innerHTML =
            '<div class="hen-profile-head">' +
                renderProfileAvatar(profile, display) +
                '<button type="button" class="hen-profile-chip" id="hen-profile-toggle" aria-expanded="true"><span class="hen-profile-kicker">collector profile</span><strong>' + escapeHtml(display) + '</strong><small>' + escapeHtml((collector ? fmtCount(collector.uniqueAssetsHeld || collector.totalHeld) + ' owned' : 'collector') + (collector && collector.totalSpent ? ' · ' + fmtProfileXTZ(collector.totalSpent) + ' spent' : '') + ' · ' + shortAddr(address)) + '</small></button>' +
                '<div class="hen-profile-actions"><button type="button" id="hen-profile-refresh">refresh</button>' + renderProfileLinks(profile, address) + '</div>' +
            '</div>' +
            '<div class="hen-profile-body" id="hen-profile-body">' +
                description +
                '<div class="hen-profile-metrics">' + metrics.join('') + '</div>' +
                recent +
                '<div class="hen-profile-lists">' + lists + '</div>' +
            '</div>';
        var refresh = document.getElementById('hen-profile-refresh');
        if (refresh) refresh.addEventListener('click', function() { loadCollectorProfile(address, true); });
        var toggle = document.getElementById('hen-profile-toggle');
        if (toggle) toggle.addEventListener('click', function() {
            var body = document.getElementById('hen-profile-body');
            var collapsed = panel.classList.toggle('is-collapsed');
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            if (body) body.hidden = collapsed;
        });
        setupProfileImages();
    }

    function renderProfileLoading(address) {
        var panel = profilePanel();
        if (!panel || !address) return;
        panel.hidden = false;
        panel.innerHTML =
            '<div class="hen-profile-head">' +
                '<div class="hen-profile-avatar is-skeleton"></div>' +
                '<div class="hen-profile-loading-copy"><span class="hen-profile-skeleton"></span><span class="hen-profile-skeleton short"></span></div>' +
            '</div>' +
            '<div class="hen-profile-metrics hen-profile-loading-grid">' +
                '<div class="hen-profile-metric is-skeleton"></div><div class="hen-profile-metric is-skeleton"></div><div class="hen-profile-metric is-skeleton"></div><div class="hen-profile-metric is-skeleton"></div>' +
            '</div>';
    }

    async function loadCollectorProfile(address, force) {
        if (!address) {
            renderCollectorProfile(null, null);
            return;
        }
        var generation = ++profileGeneration;
        if (!force && profileCache.has(address)) {
            renderCollectorProfile(address, profileCache.get(address));
            return;
        }
        renderProfileLoading(address);
        try {
            var mod = await objktProfileModule();
            var profile = await mod.fetchObjktProfile(address);
            if (generation !== profileGeneration) return;
            profileCache.set(address, profile);
            if (profile?.tzdomain || profile?.alias) {
                viewerLabel = profile.tzdomain || profile.alias;
                updateStatusStrip();
                updateWalletInput();
            }
            renderCollectorProfile(address, profile);
        } catch (err) {
            if (generation !== profileGeneration) return;
            console.warn('[HEN] collector profile error:', err);
            var panel = profilePanel();
            if (panel) {
                panel.hidden = false;
                panel.innerHTML = '<div class="hen-profile-empty">Collector stats are unavailable right now.</div>';
            }
        }
    }

    function renderArtistProfile(address, profile) {
        var panel = profilePanel();
        if (!panel || !address) return;
        var display = profileDisplayName(profile, address);
        var creator = profile && profile.creator ? profile.creator : null;
        var metrics = [];
        if (creator) {
            metrics.push(renderProfileMetric('Created NFTs', fmtCount(creator.totalCreated)));
            metrics.push(renderProfileMetric('Sales Volume', fmtProfileXTZ(creator.totalSalesVolume)));
            metrics.push(renderProfileMetric('Sales Count', fmtCount(creator.totalSalesCount)));
            metrics.push(renderProfileMetric('Collections', fmtCount(creator.collections ? creator.collections.length : 0)));
        }
        var collections = creator && creator.collections && creator.collections.length
            ? '<div class="hen-profile-list"><span class="hen-profile-list-title">created collections</span>' + creator.collections.slice(0, 5).map(renderProfileCollectionRow).join('') + '</div>'
            : '';
        panel.hidden = false;
        panel.classList.remove('is-collapsed');
        panel.innerHTML =
            '<div class="hen-profile-head">' +
                renderProfileAvatar(profile, display) +
                '<div><span class="hen-profile-kicker">artist filter</span><strong>' + escapeHtml(display) + '</strong><small>' + escapeHtml(shortAddr(address)) + '</small></div>' +
                '<div class="hen-profile-actions"><button type="button" id="hen-artist-clear">clear artist</button>' + renderProfileLinks(profile, address) + '</div>' +
            '</div>' +
            (profile && profile.description ? '<p class="hen-profile-description">' + escapeHtml(profile.description).slice(0, 260) + '</p>' : '') +
            (metrics.length ? '<div class="hen-profile-metrics">' + metrics.join('') + '</div>' : '<div class="hen-profile-empty">Creator stats are still warming up for this wallet.</div>') +
            (collections ? '<div class="hen-profile-lists">' + collections + '</div>' : '');
        var clear = document.getElementById('hen-artist-clear');
        if (clear) clear.addEventListener('click', function() {
            artistMode = null;
            if (viewerAddress) loadCollectorProfile(viewerAddress);
            else renderCollectorProfile(null, null);
            reloadFeed('artist filter cleared');
        });
    }

    async function loadArtistProfile(address) {
        if (!address) return;
        var generation = ++profileGeneration;
        renderProfileLoading(address);
        try {
            var mod = await objktProfileModule();
            var profile = await mod.fetchObjktProfile(address);
            if (generation !== profileGeneration || artistMode !== address) return;
            renderArtistProfile(address, profile || { alias: null });
        } catch (err) {
            if (generation !== profileGeneration) return;
            console.warn('[HEN] artist profile error:', err);
            renderArtistProfile(address, { alias: null });
        }
    }

    function refreshProfileContext() {
        if (artistMode) {
            loadArtistProfile(artistMode);
        } else if (viewerAddress) {
            loadCollectorProfile(viewerAddress);
        } else {
            renderCollectorProfile(null, null);
        }
    }

    function getSavedFeedMode() {
        var saved = safeGetStorage(HEN_SOURCE_KEY);
        return FEED_MODES[saved] ? saved : DEFAULT_FEED_MODE;
    }

    function persistFeedMode(mode) {
        if (FEED_MODES[mode]) safeSetStorage(HEN_SOURCE_KEY, mode);
    }

    function getSavedSortMode() {
        var saved = safeGetStorage(HEN_SORT_KEY);
        return SORT_MODES[saved] ? saved : DEFAULT_SORT_MODE;
    }

    function persistSortMode(mode) {
        if (SORT_MODES[mode]) safeSetStorage(HEN_SORT_KEY, mode);
    }

    function findSavedViewerAddress(skipHenKey) {
        for (var i = 0; i < SAVED_ADDRESS_KEYS.length; i++) {
            var key = SAVED_ADDRESS_KEYS[i];
            if (skipHenKey && key === HEN_VIEWER_KEY) continue;
            var value = safeGetStorage(key);
            if (isValidAddress(value)) {
                return {
                    address: value,
                    label: key === MY_TEZOS_ADDRESS_KEY ? 'my tezos ' + shortAddr(value) : (key === HEN_VIEWER_KEY ? shortAddr(value) : 'saved ' + shortAddr(value))
                };
            }
        }
        return null;
    }

    function loadSavedViewer() {
        var saved = findSavedViewerAddress(false);
        viewerAddress = saved ? saved.address : null;
        viewerLabel = saved ? saved.label : null;
        viewerHoldings = new Map();
        updateStatusStrip();
        updateWalletInput();
        if (viewerAddress) {
            resolveViewerLabel(viewerAddress);
            loadCollectorProfile(viewerAddress);
        } else {
            renderCollectorProfile(null, null);
        }
    }

    function activeFilterLabel() {
        var parts = [];
        if (effectiveListedOnly()) parts.push(priceMaxMutez ? 'for sale' : 'for sale');
        if (priceMaxMutez) parts.push('price <= ' + formatFilterPrice(priceMaxMutez) + ' ꜩ');
        if (editionMax) parts.push('editions <= ' + editionMax);
        if (hideOwned) parts.push('hide owned');
        if (savedOnly) parts.push('saved');
        if (sortMode !== DEFAULT_SORT_MODE) parts.push('sort ' + SORT_MODES[sortMode].label);
        if (searchMode) parts.push('search "' + searchMode + '"');
        if (artistMode) parts.push('artist ' + shortAddr(artistMode));
        return parts.join(' · ');
    }

    function emptyStateMessage() {
        if (savedOnly && favoriteKeys.size === 0) return 'no saved pieces yet — tap ♥ on cards you want to revisit.';
        if (priceMaxMutez) return 'no for-sale pieces under ' + formatFilterPrice(priceMaxMutez) + ' ꜩ — widen the price filter.';
        if (listedOnly) return 'no listed pieces here right now — try any price or another source.';
        if (hideOwned) return 'everything in this slice is already owned — turn off hide owned or widen filters.';
        if (searchMode) return 'no pieces matching "' + searchMode + '" — try a shorter search.';
        if (editionMax) return 'no editions under ' + editionMax + ' here — widen the edition filter.';
        return (FEED_MODES[feedMode] || FEED_MODES.all).empty;
    }

    function setPressed(btn, active) {
        if (!btn) return;
        btn.classList.toggle('active', Boolean(active));
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    function updateMobileFilterToggle() {
        var strip = document.getElementById('hen-status-strip');
        var toggle = el('hen-mobile-filter-toggle');
        if (strip) strip.classList.toggle('mobile-filters-open', Boolean(mobileFiltersOpen));
        if (toggle) {
            toggle.setAttribute('aria-expanded', mobileFiltersOpen ? 'true' : 'false');
            var filters = activeFilterLabel();
            toggle.textContent = mobileFiltersOpen ? 'hide filters' : (filters ? 'filters active' : 'filters');
        }
    }

    function updateFilterBar() {
        var sale = el('hen-filter-listed');
        setPressed(sale, effectiveListedOnly());

        document.querySelectorAll('[data-hen-price]').forEach(function(btn) {
            var value = btn.getAttribute('data-hen-price');
            var active = (!priceMaxMutez && value === 'any') || (priceMaxMutez && String(priceMaxMutez) === value);
            setPressed(btn, active);
        });
        document.querySelectorAll('[data-hen-edition]').forEach(function(btn) {
            var value = btn.getAttribute('data-hen-edition');
            var active = (!editionMax && value === 'any') || (editionMax && String(editionMax) === value);
            setPressed(btn, active);
        });
        document.querySelectorAll('[data-hen-sort]').forEach(function(btn) {
            setPressed(btn, btn.getAttribute('data-hen-sort') === sortMode);
        });

        var search = el('hen-search-input');
        if (search && document.activeElement !== search) search.value = searchMode || '';
        setPressed(el('hen-filter-saved'), savedOnly);
        var hideBtn = el('hen-filter-hide-owned');
        setPressed(hideBtn, hideOwned);
        if (hideBtn) hideBtn.disabled = !viewerAddress;
    }

    function updateStatusStrip() {
        var status = document.getElementById('hen-status-line');
        var strip = document.getElementById('hen-status-strip');
        var source = (FEED_MODES[feedMode] || FEED_MODES.all).label;
        var viewer = viewerAddress ? 'wallet ' + (viewerLabel || shortAddr(viewerAddress)) : 'connect to flag pieces you own';
        var filters = activeFilterLabel();
        if (status) status.textContent = source + ' · ' + viewer + (filters ? ' · ' + filters : '');
        if (strip) strip.classList.toggle('has-filters', Boolean(filters || viewerAddress || feedMode !== DEFAULT_FEED_MODE));
        var walletStatus = el('hen-wallet-status');
        if (walletStatus) walletStatus.textContent = viewerAddress ? (viewerLabel || shortAddr(viewerAddress)) : 'connect to flag pieces you own';
        var connect = el('hen-wallet-connect');
        if (connect) connect.classList.toggle('is-connected', Boolean(viewerAddress));
        updateFilterBar();
        updateMobileFilterToggle();
    }

    function renderLoopHint() {
        if (safeGetStorage(HEN_HINT_DISMISSED_KEY) === '1') return;
        if (document.getElementById('hen-loop-hint')) return;
        var hint = document.createElement('div');
        hint.id = 'hen-loop-hint';
        hint.className = 'hen-loop-hint';
        hint.innerHTML =
            '<span><strong>start collecting faster</strong> filter to For Sale, then connect to flag pieces you own.</span>' +
            '<button type="button" id="hen-loop-hint-dismiss" aria-label="Dismiss HEN collecting hint">×</button>';
        var strip = document.getElementById('hen-status-strip');
        if (strip && strip.parentNode) strip.parentNode.insertBefore(hint, strip.nextSibling);
        var dismiss = document.getElementById('hen-loop-hint-dismiss');
        if (dismiss) dismiss.addEventListener('click', function() {
            safeSetStorage(HEN_HINT_DISMISSED_KEY, '1');
            hint.remove();
        });
    }

    function updateWalletInput() {
        var input = el('hen-wallet-input');
        if (input && viewerAddress && document.activeElement !== input) input.value = viewerLabel && /\.tez$/i.test(viewerLabel) ? viewerLabel : viewerAddress;
    }

    async function resolveViewerLabel(address) {
        if (!address) return null;
        var name = await resolveTezName(address);
        if (name && viewerAddress === address) {
            viewerLabel = name;
            updateStatusStrip();
            updateWalletInput();
            if (profileCache.has(address)) renderCollectorProfile(address, profileCache.get(address));
        }
        return name;
    }

    function resetPageState() {
        tokens = [];
        tokenCache = new Map();
        offset = 0;
        newestTimestamp = null;
        feedGeneration++;
        loading = false;
        viewerHoldings = new Map();
        if (grid()) grid().innerHTML = '';
        updateStatusStrip();
    }

    function applyFavoriteBadges() {
        document.querySelectorAll('.hen-card-shell[data-key]').forEach(function(shell) {
            var active = favoriteKeys.has(shell.dataset.key);
            shell.classList.toggle('hen-card-saved', active);
            var btn = shell.querySelector('.hen-card-favorite');
            if (btn) {
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
                btn.setAttribute('title', active ? 'Remove from saved' : 'Save for later');
            }
        });
    }

    function applyViewerBadges() {
        var cards = document.querySelectorAll('.hen-card[data-contract][data-token-id]');
        cards.forEach(function(card) {
            var key = card.dataset.contract + ':' + card.dataset.tokenId;
            var quantity = viewerHoldings.get(key) || 0;
            card.classList.toggle('hen-card-owned', quantity > 0);
            var badge = card.querySelector('.hen-card-owned-badge');
            if (quantity > 0) {
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'hen-card-owned-badge';
                    var thumb = card.querySelector('.hen-card-thumb');
                    if (thumb) thumb.appendChild(badge);
                }
                badge.textContent = 'OWNED ×' + quantity.toLocaleString();
            } else if (badge) {
                badge.remove();
            }
        });
    }

    async function mergeViewerHoldingsForTokens(tokenList) {
        if (!viewerAddress || !tokenList || tokenList.length === 0) {
            applyViewerBadges();
            return new Map();
        }
        var holdings = await fetchViewerHoldingsForTokens(viewerAddress, tokenList);
        holdings.forEach(function(quantity, key) {
            viewerHoldings.set(key, quantity);
        });
        applyViewerBadges();
        updateStatusStrip();
        return holdings;
    }

    async function syncViewerHoldingsForTokens(tokenList) {
        if (!viewerAddress || !tokenList || tokenList.length === 0) {
            applyViewerBadges();
            return;
        }
        try {
            await mergeViewerHoldingsForTokens(tokenList);
        } catch (err) {
            console.warn('[HEN] viewer holdings error:', err);
        }
    }

    function visibleTokensFromFetched(tokenList) {
        return tokenList.filter(function(token) {
            if (savedOnly && !isFavoriteToken(token)) return false;
            if (hideOwned && viewerAddress && (viewerHoldings.get(tokenKey(token)) || 0) > 0) return false;
            return true;
        });
    }

    function rememberTokens(tokenList) {
        tokenList.forEach(function(token) {
            tokenCache.set(tokenKey(token), token);
        });
    }

    function trimGridCards(edge) {
        var g = grid();
        if (!g) return;
        var cards = Array.from(g.querySelectorAll('.hen-card'));
        if (cards.length <= MAX_GRID_CARDS) return;
        var removeCount = cards.length - MAX_GRID_CARDS;
        var targets = edge === 'start' ? cards.slice(0, removeCount) : cards.slice(-removeCount);
        var removed = new Set();
        targets.forEach(function(card) {
            removed.add(card.dataset.key);
            var shell = card.closest('.hen-card-shell') || card;
            shell.remove();
        });
        tokens = tokens.filter(function(token) { return !removed.has(tokenKey(token)); });
    }

    async function setViewerAddress(addr, label, options) {
        options = options || {};
        viewerAddress = addr || null;
        viewerLabel = label || (addr ? shortAddr(addr) : null);
        viewerHoldings = new Map();
        if (viewerAddress) {
            safeSetStorage(HEN_VIEWER_KEY, viewerAddress);
            if (options.syncMyTezos) {
                try {
                    var wallet = await walletModule();
                    wallet.rememberMyTezosAddress(viewerAddress, { label: /\.tez$/i.test(viewerLabel || '') ? viewerLabel : null, source: options.source || 'hen-mode' });
                } catch (err) {
                    console.warn('[HEN] My Tezos sync failed:', err);
                }
            }
        } else {
            safeRemoveStorage(HEN_VIEWER_KEY);
            hideOwned = false;
        }
        updateStatusStrip();
        updateWalletInput();
        applyViewerBadges();
        if (viewerAddress) {
            resolveViewerLabel(viewerAddress);
            loadCollectorProfile(viewerAddress);
        } else {
            renderCollectorProfile(null, null);
        }
        if (viewerAddress && tokens.length > 0) {
            await syncViewerHoldingsForTokens(tokens);
        }
    }

    function createCard(token, staggerIdx, isNew) {
        staggerIdx = staggerIdx || 0;
        var shell = document.createElement('div');
        shell.className = 'hen-card-shell';
        shell.dataset.key = tokenKey(token);
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'hen-card';
        card.classList.toggle('hen-card-listed', hasListing(token));
        card.dataset.contract = token.fa_contract;
        card.dataset.tokenId = token.token_id;
        card.dataset.key = tokenKey(token);
        card.dataset.timestamp = token.timestamp || '';
        var creator = (token.creators && token.creators[0]) ? token.creators[0].creator_address : '';
        card.dataset.creator = creator;

        var isVideo = token.mime && token.mime.startsWith('video/');
        var rawThumbUri = token.thumbnail_uri || token.display_uri || '';
        var cdnThumbUrl = mediaCdnUrl(token, 'thumb400');
        var thumbUrl = escapeHtml(resolveMediaUri(rawThumbUri, 0, { cdnUrl: cdnThumbUrl }));
        var price = formatPrice(token.lowest_ask);
        var usd = formatUsd(token.lowest_ask);
        var collName = (token.fa && token.fa.name) ? token.fa.name : '';
        var showColl = collName && collName.toLowerCase().indexOf('untitled') === -1;
        var sourceLabel = platformLabel(token);
        var ariaPrice = price ? 'listed for ' + price + ' tez' : 'not listed';
        card.setAttribute('aria-label', (token.name || 'untitled') + ' by ' + shortAddr(creator) + ', ' + ariaPrice + ', ' + token.supply + ' editions, ' + sourceLabel);

        var priceHtml = price
            ? '<span class="hen-card-price">' + price + ' ꜩ' + (usd ? ' <span class="hen-card-usd">(' + usd + ')</span>' : '') + '</span>'
            : '<span class="hen-card-editions">not listed</span>';
        var overlayPrice = price
            ? '<div class="hen-card-price-pill">' + price + ' ꜩ' + (usd ? '<span>' + usd + '</span>' : '') + '</div>'
            : '';

        card.innerHTML =
            '<div class="hen-card-thumb">' +
                '<img src="' + thumbUrl + '" alt="' + escapeHtml(token.name || '') + '" ' + (staggerIdx < HEN_EAGER_CARD_LIMIT && offset === 0 ? '' : 'loading="lazy" ') + '>' +
                '<div class="hen-card-source hen-card-source-' + platformKey(token) + '">' + sourceLabel + '</div>' +
                (isVideo ? '<div class="hen-card-badge">▶ VIDEO</div>' : '') +
                overlayPrice +
            '</div>' +
            '<div class="hen-card-info">' +
                '<div class="hen-card-creator">' + shortAddr(creator) + '</div>' +
                '<div class="hen-card-title">' + escapeHtml(token.name || 'untitled') + '</div>' +
                (showColl ? '<div class="hen-card-collection">' + escapeHtml(collName) + '</div>' : '') +
                '<div class="hen-card-meta">' + priceHtml + '<span class="hen-card-editions">×' + token.supply + '</span></div>' +
                '<div class="hen-card-bottom"><span class="hen-card-time">' + timeAgo(token.timestamp) + '</span><span class="hen-card-listing">' + (hasListing(token) ? 'listed' : 'not listed') + '</span><span class="hen-card-objkt">#' + token.token_id + '</span></div>' +
            '</div>';

        var img = card.querySelector('img');
        if (img) setupImageRetry(img, rawThumbUri, { cdnUrl: cdnThumbUrl });

        if (isNew) {
            card.classList.add('hen-card-fresh');
        }
        // Fresh mint warm glow: mark cards < 5 minutes old
        var ageMs = Date.now() - new Date(token.timestamp).getTime();
        if (ageMs < 300000) { // < 5 min
            card.classList.add('hen-card-warm');
            card.style.setProperty('--warm-opacity', Math.max(0.05, 1 - (ageMs / 300000)).toFixed(2));
        }

        setTimeout(function() { card.classList.add('visible'); }, staggerIdx * 50);
        card.addEventListener('click', function() { expandToken(token); });
        card.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                expandToken(token);
            }
        });
        card.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var url = pieceUrl(token);
            navigator.clipboard.writeText(url).then(function() {
                showCopyToast();
            });
        });
        var favorite = document.createElement('button');
        favorite.type = 'button';
        favorite.className = 'hen-card-favorite';
        favorite.setAttribute('aria-label', 'Save ' + (token.name || 'this piece') + ' for later');
        favorite.setAttribute('aria-pressed', isFavoriteToken(token) ? 'true' : 'false');
        favorite.classList.toggle('active', isFavoriteToken(token));
        favorite.innerHTML = '♥';
        favorite.addEventListener('click', function(e) {
            e.stopPropagation();
            setFavoriteToken(token, !isFavoriteToken(token));
            if (savedOnly && !isFavoriteToken(token)) reloadFeed('saved piece removed');
        });
        shell.appendChild(card);
        shell.appendChild(favorite);
        if (isFavoriteToken(token)) shell.classList.add('hen-card-saved');
        return shell;
    }

    function marketStatsHtml(token) {
        var holders = token.holders || [];
        var ownerCount = new Set(holders.map(function(row) { return row.holder_address; }).filter(Boolean)).size;
        var activeListings = token.listings_active || [];
        var available = activeListings.reduce(function(sum, row) { return sum + (Number(row.amount_left) || 0); }, 0);
        var lastSale = token.listing_sales && token.listing_sales[0] ? token.listing_sales[0] : null;
        var floor = activeListings[0] ? (activeListings[0].price_xtz || activeListings[0].price) : token.lowest_ask;
        var parts = [];
        if (available > 0) parts.push(available.toLocaleString() + ' available of ' + fmtCount(token.supply));
        else parts.push(fmtCount(token.supply) + ' editions');
        if (ownerCount > 0) parts.push(ownerCount.toLocaleString() + ' owners');
        if (lastSale && (lastSale.price_xtz || lastSale.price)) {
            var last = formatMarketPrice(lastSale.price_xtz || lastSale.price);
            if (last) parts.push('last ' + last + ' ꜩ');
        } else if (floor) {
            var floorPrice = formatMarketPrice(floor);
            if (floorPrice) parts.push('floor ' + floorPrice + ' ꜩ');
        }
        return '<div class="hen-expanded-market">' + parts.map(function(part) { return '<span>' + escapeHtml(part) + '</span>'; }).join('') + '</div>';
    }

    function xShareUrl(token, displayName) {
        var price = formatPrice(token.lowest_ask);
        var text = (token.name || 'Tezos NFT') + ' by ' + (displayName || 'a Tezos artist') + (price ? ' is listed for ' + price + ' ꜩ' : '') + ' on HEN mode';
        return 'https://x.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(pieceUrl(token));
    }

    function closeExpanded() {
        var exp = expanded();
        if (exp) exp.classList.remove('active');
        restoreShareMeta();
        history.replaceState(null, '', '/?hen=1');
        if (expandedReturnFocus && typeof expandedReturnFocus.focus === 'function' && expandedReturnFocus.isConnected) {
            expandedReturnFocus.focus({ preventScroll: true });
        }
        expandedReturnFocus = null;
    }

    async function loadCreatorMiniProfile(address) {
        var target = document.getElementById('hen-expanded-creator-mini');
        if (!target || !address) return;
        try {
            var mod = await objktProfileModule();
            var profile = await mod.fetchObjktProfile(address);
            if (!target.isConnected || !profile) return;
            var display = profileDisplayName(profile, address);
            var creator = profile.creator || null;
            target.innerHTML =
                renderProfileAvatar(profile, display) +
                '<div><span>creator</span><strong>' + escapeHtml(display) + '</strong><small>' +
                escapeHtml(creator ? fmtCount(creator.totalCreated) + ' created · ' + fmtProfileXTZ(creator.totalSalesVolume) + ' sales' : shortAddr(address)) +
                '</small></div>';
            setupProfileImages();
        } catch (err) {
            console.warn('[HEN] creator mini profile error:', err);
        }
    }

    async function expandToken(token) {
        var exp = expanded();
        if (!exp || !token) return;
        expandedReturnFocus = document.activeElement;
        var detailToken = token;
        try {
            var details = await fetchTokenDetails(token);
            if (details) {
                detailToken = Object.assign({}, token, details);
                tokenCache.set(tokenKey(detailToken), detailToken);
            }
        } catch (err) {
            console.warn('[HEN] token detail error:', err);
        }
        token = detailToken;
        var mediaUrl = escapeHtml(resolveUri(token.display_uri));
        var isVideo = token.mime && token.mime.startsWith('video/');
        var creator = (token.creators && token.creators[0]) ? token.creators[0].creator_address : '';
        var price = formatPrice(token.lowest_ask);
        var usd = formatUsd(token.lowest_ask);
        var shareUrl = pieceUrl(token);
        var collName = (token.fa && token.fa.name) ? token.fa.name : '';
        var sourceLabel = isHenToken(token) ? 'Teia / HEN' : 'OBJKT';
        var ownedQty = viewerHoldings.get(tokenKey(token)) || 0;

        history.replaceState(null, '', isHenToken(token) ? '/?hen=1&teia=' + encodeURIComponent(token.token_id) : '/?hen=1&objkt=' + token.fa_contract + '/' + token.token_id);

        var tezName = await resolveTezName(creator);
        var displayName = tezName || shortAddr(creator);
        updateShareMeta(token, displayName);

        var mediaHtml = isVideo
            ? '<video class="hen-expanded-media" src="' + mediaUrl + '" autoplay loop muted playsinline></video>'
            : '<img class="hen-expanded-media" src="' + mediaUrl + '" alt="' + escapeHtml(token.name || '') + '"> ';

        exp.querySelector('.hen-expanded-inner').innerHTML =
            mediaHtml +
            '<div class="hen-expanded-actions hen-expanded-primary-actions">' +
                externalActionsHtml(token) +
            '</div>' +
            '<div class="hen-expanded-info">' +
                '<div class="hen-expanded-title">' + escapeHtml(token.name || 'untitled') + '</div>' +
                '<div class="hen-expanded-creator hen-clickable-artist" data-addr="' + escapeHtml(creator) + '">' + escapeHtml(displayName) + '</div>' +
                marketStatsHtml(token) +
                '<div class="hen-expanded-details">' +
                    (price ? '<span class="hen-card-price">' + price + ' ꜩ' + (usd ? ' (' + usd + ')' : '') + '</span>' : '') +
                    '<span>×' + token.supply + '</span>' +
                    '<span>' + timeAgo(token.timestamp) + '</span>' +
                    '<span>#' + token.token_id + '</span>' +
                    '<span>' + sourceLabel + '</span>' +
                    (ownedQty > 0 ? '<span class="hen-expanded-owned">owned ×' + ownedQty.toLocaleString() + '</span>' : '') +
                    (collName && collName.toLowerCase() !== 'hic et nunc' ? '<span>' + escapeHtml(collName) + '</span>' : '') +
                '</div>' +
                '<div class="hen-expanded-actions">' +
                    '<button class="hen-expanded-share" title="Copy share link">⎘ share</button>' +
                    '<a class="hen-expanded-secondary" href="' + xShareUrl(token, displayName) + '" target="_blank" rel="noopener">share on x</a>' +
                '</div>' +
                '<div class="hen-expanded-creator-mini" id="hen-expanded-creator-mini"><span class="hen-profile-avatar is-skeleton"></span><div><span>creator</span><strong>loading...</strong></div></div>' +
                '<div class="hen-artist-work" id="hen-artist-work">' +
                    '<div class="hen-artist-work-label">more by this artist...</div>' +
                    '<div class="hen-artist-work-grid" id="hen-artist-work-grid"></div>' +
                '</div>' +
            '</div>';
        var expandedImg = exp.querySelector('.hen-expanded-media');
        if (expandedImg && expandedImg.tagName === 'IMG') setupImageRetry(expandedImg, token.display_uri);

        exp.querySelector('.hen-expanded-share').addEventListener('click', function() {
            navigator.clipboard.writeText(shareUrl).then(function() {
                var btn = exp.querySelector('.hen-expanded-share');
                btn.textContent = '✓ copied';
                setTimeout(function() { btn.textContent = '⎘ share'; }, 2000);
            });
        });

        exp.querySelector('.hen-clickable-artist').addEventListener('click', function() {
            closeExpanded();
            artistMode = creator;
            loadArtistProfile(creator);
            tokens = [];
            offset = 0;
            newestTimestamp = null;
            feedGeneration++;
            loading = false;
            grid().innerHTML = '';
            clearCliOutput();
            showCliOutput(['> showing work by ' + escapeHtml(displayName)]);
            loadPage();
        });

        exp.classList.add('active');
        exp.setAttribute('role', 'dialog');
        exp.setAttribute('aria-modal', 'true');
        exp.setAttribute('aria-label', (token.name || 'Tezos NFT') + ' detail');
        var close = exp.querySelector('.hen-expanded-close');
        if (close) close.focus({ preventScroll: true });
        loadCreatorMiniProfile(creator);

        if (creator) {
            var otherWork = await fetchArtistWork(creator, token.token_id, token.fa_contract);
            var workGrid = document.getElementById('hen-artist-work-grid');
            if (workGrid && otherWork.length > 0) {
                workGrid.innerHTML = otherWork.map(function(t) {
                    var rawThumb = t.thumbnail_uri || t.display_uri || '';
                    var cdnThumb = mediaCdnUrl(t, 'thumb288');
                    var thumb = escapeHtml(resolveMediaUri(rawThumb, 0, { cdnUrl: cdnThumb }));
                    return '<div class="hen-artist-thumb" data-contract="' + escapeHtml(t.fa_contract) + '" data-token="' + escapeHtml(t.token_id) + '"><img data-hen-cdn-url="' + escapeHtml(cdnThumb) + '" data-hen-raw-uri="' + escapeHtml(rawThumb) + '" src="' + thumb + '" alt="' + escapeHtml(t.name || '') + '" loading="lazy"></div>';
                }).join('');
                workGrid.querySelectorAll('.hen-artist-thumb').forEach(function(thumbEl, i) {
                    var thumbImg = thumbEl.querySelector('img');
                    if (thumbImg) setupImageRetry(thumbImg, thumbImg.dataset.henRawUri || '', { cdnUrl: thumbImg.dataset.henCdnUrl || '' });
                    thumbEl.addEventListener('click', function(e) {
                        e.stopPropagation();
                        expandToken(otherWork[i]);
                    });
                    setTimeout(function() { thumbEl.classList.add('visible'); }, i * 80);
                });
            } else {
                var aw = document.getElementById('hen-artist-work');
                if (aw) aw.style.display = 'none';
            }
        }
    }

    async function loadPage() {
        if (loading) return;
        loading = true;
        var generation = feedGeneration;
        var keepLoaderVisible = false;
        var loader = loadingEl();
        if (loader) { loader.textContent = (FEED_MODES[feedMode] || FEED_MODES.all).loading; loader.classList.add('active'); }

        try {
            var newTokens = await fetchTokens(PAGE_SIZE, offset);
            if (generation !== feedGeneration) return;
            rememberTokens(newTokens);
            if (viewerAddress) {
                try {
                    await mergeViewerHoldingsForTokens(newTokens);
                } catch (err) {
                    console.warn('[HEN] viewer holdings error:', err);
                }
            }
            var displayTokens = visibleTokensFromFetched(newTokens);
            if (newTokens.length === 0 || displayTokens.length === 0) {
                offset += newTokens.length;
                if (loader) loader.textContent = emptyStateMessage();
                keepLoaderVisible = true;
                return;
            }
            var g = grid();
            displayTokens.forEach(function(t, i) {
                tokens.push(t);
                g.appendChild(createCard(t, i));
            });
            offset += newTokens.length;
            if (!newestTimestamp && tokens.length > 0) {
                newestTimestamp = tokens[0].timestamp;
            }
            updateCount();
            resolveNamesForCards();
            applyViewerBadges();
            applyFavoriteBadges();
            trimGridCards('start');
        } catch (err) {
            console.error('[HEN] fetch error:', err);
        } finally {
            if (generation === feedGeneration) {
                loading = false;
                if (loader && !keepLoaderVisible) loader.classList.remove('active');
            }
        }
    }

    async function pollNew() {
        if (!newestTimestamp || !isActive || sortMode !== DEFAULT_SORT_MODE) return;
        try {
            var fresh = await fetchTokens(20, 0, newestTimestamp);
            if (fresh.length > 0) {
                rememberTokens(fresh);
                if (viewerAddress) {
                    try {
                        await mergeViewerHoldingsForTokens(fresh);
                    } catch (err) {
                        console.warn('[HEN] viewer holdings error:', err);
                    }
                }
                var visibleFresh = visibleTokensFromFetched(fresh);
                if (visibleFresh.length === 0) {
                    offset += fresh.length;
                    newestTimestamp = fresh[0].timestamp;
                    return;
                }
                var g = grid();
                if (!g) return;
                // Reverse so newest ends up at top
                var sorted = visibleFresh.slice().reverse();
                var feed = document.querySelector('.hen-feed');
                var wasNearTop = feed ? feed.scrollTop < 64 : true;
                sorted.forEach(function(t) {
                    tokens.unshift(t);
                    var shell = createCard(t, 0, true);
                    var card = shell.querySelector('.hen-card');
                    if (card) card.classList.add('visible');
                    g.prepend(shell);
                });
                if (feed && wasNearTop) feed.scrollTo({ top: 0, behavior: 'smooth' });
                offset += fresh.length;
                newestTimestamp = fresh[0].timestamp;
                updateCount();
                resolveNamesForCards();
                applyViewerBadges();
                applyFavoriteBadges();
                trimGridCards('end');
                showMintPulse(visibleFresh);
            }
        } catch (e) {
            console.error('[HEN] poll error:', e);
        }
    }

    function showMintPulse(freshTokens) {
        var pulseEl = document.getElementById('hen-mint-pulse');
        if (!pulseEl) {
            pulseEl = document.createElement('div');
            pulseEl.id = 'hen-mint-pulse';
            pulseEl.className = 'hen-mint-pulse';
            var header = document.querySelector('.hen-header');
            if (header) header.parentNode.insertBefore(pulseEl, header.nextSibling);
        }
        var t = freshTokens[0];
        var creator = (t && t.creators && t.creators[0]) ? t.creators[0].creator_address : '???';
        var name = tezNameCache[creator] || shortAddr(creator);
        var source = platformLabel(t);
        var text = freshTokens.length === 1
            ? source + ': ' + name + ' just minted "' + (t.name || 'untitled') + '"'
            : freshTokens.length + ' new Tezos NFT mints — ' + source + ' led by ' + name;
        pulseEl.textContent = text;
        pulseEl.classList.add('visible');
        setTimeout(function() { pulseEl.classList.remove('visible'); }, 4000);
    }

    async function playBoot() {
        var b = boot();
        if (!b) return;
        b.innerHTML = '';
        b.style.display = 'flex';
        b.classList.add('visible');

        var lines = [
            '> connecting to teia + objkt...',
            '> streaming Tezos NFT mints...',
            ''
        ];

        for (var i = 0; i < lines.length; i++) {
            var div = document.createElement('div');
            div.className = 'hen-boot-line';
            if (i === lines.length - 1) {
                div.innerHTML = '<span class="hen-boot-cursor"></span>';
            } else {
                div.textContent = lines[i];
            }
            b.appendChild(div);
            await sleep(200);
            div.classList.add('show');
        }

        await sleep(200);
        b.classList.remove('visible');
        await sleep(300);
        b.style.display = 'none';
    }

    function showCopyToast() {
        var toast = document.getElementById('hen-copy-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'hen-copy-toast';
            toast.className = 'hen-copy-toast';
            toast.textContent = '✓ link copied';
            document.getElementById('hen-overlay').appendChild(toast);
        }
        toast.classList.add('visible');
        setTimeout(function() { toast.classList.remove('visible'); }, 1500);
    }

    function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    function setupScroll() {
        var feed = document.querySelector('.hen-feed');
        if (!feed) return;
        feed.addEventListener('scroll', function() {
            if (feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 400) {
                loadPage();
            }
        });
    }

    function setupFilterBar() {
        var mobileToggle = el('hen-mobile-filter-toggle');
        if (mobileToggle) mobileToggle.addEventListener('click', function() {
            mobileFiltersOpen = !mobileFiltersOpen;
            updateMobileFilterToggle();
        });

        var listed = el('hen-filter-listed');
        if (listed) listed.addEventListener('click', function() {
            listedOnly = !listedOnly;
            reloadFeed(listedOnly ? 'showing listed pieces' : 'showing listed and unlisted pieces');
        });

        document.querySelectorAll('[data-hen-price]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var value = btn.getAttribute('data-hen-price');
                setPriceFilterFromXtz(value === 'any' ? null : Number(value) / 1000000);
            });
        });

        document.querySelectorAll('[data-hen-edition]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var value = btn.getAttribute('data-hen-edition');
                setEditionFilter(value === 'any' ? null : Number(value));
            });
        });

        document.querySelectorAll('[data-hen-sort]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                setSortMode(btn.getAttribute('data-hen-sort'));
            });
        });

        var saved = el('hen-filter-saved');
        if (saved) saved.addEventListener('click', function() {
            savedOnly = !savedOnly;
            reloadFeed(savedOnly ? 'showing saved pieces' : 'saved filter cleared');
        });

        var hide = el('hen-filter-hide-owned');
        if (hide) hide.addEventListener('click', function() {
            if (!viewerAddress) {
                showCliOutput(['> connect or set a wallet before hiding owned pieces']);
                return;
            }
            hideOwned = !hideOwned;
            reloadFeed(hideOwned ? 'hiding owned pieces' : 'owned pieces visible');
        });

        var shuffle = el('hen-filter-shuffle');
        if (shuffle) shuffle.addEventListener('click', randomJump);

        var search = el('hen-search-input');
        if (search) {
            search.addEventListener('input', function() {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(function() {
                    applySearchValue(search.value);
                }, 350);
            });
            search.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    clearTimeout(searchDebounceTimer);
                    applySearchValue(search.value);
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    search.value = '';
                    clearTimeout(searchDebounceTimer);
                    applySearchValue('');
                }
            });
        }
    }

    function showCliOutput(lines) {
        var output = document.getElementById('hen-cli-output');
        if (!output) {
            output = document.createElement('div');
            output.id = 'hen-cli-output';
            output.style.cssText = 'padding:20px 24px;font-size:0.75rem;color:#666;line-height:1.8;letter-spacing:0.03em;';
            var feed = document.querySelector('.hen-feed');
            feed.insertBefore(output, grid());
        }
        output.innerHTML = lines.map(function(l) {
            var safeLine = escapeHtml(l);
            if (l.indexOf('>') === 0) return '<div style="color:#00d4ff">' + safeLine + '</div>';
            if (l.indexOf('  ') === 0) return '<div style="color:#555;padding-left:12px">' + safeLine + '</div>';
            return '<div>' + safeLine + '</div>';
        }).join('');
        setTimeout(function() { if (output) output.innerHTML = ''; }, 8000);
    }

    function clearCliOutput() {
        var output = document.getElementById('hen-cli-output');
        if (output) output.innerHTML = '';
    }

    function fadeGrid(callback) {
        var g = grid();
        g.classList.add('fading');
        setTimeout(function() {
            callback();
            setTimeout(function() { g.classList.remove('fading'); }, 50);
        }, 200);
    }

    var cmdHistory = [];
    var cmdHistoryIdx = -1;

    function updateModeControls() {
        document.querySelectorAll('[data-hen-mode]').forEach(function(btn) {
            var active = btn.getAttribute('data-hen-mode') === feedMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        var input = cliInput();
        if (input) input.placeholder = feedMode === 'all' ? 'search, price, sort, saved, random' : 'all, search, price, sort, random';
        updateStatusStrip();
    }

    function reloadFeed(message) {
        clearCliOutput();
        resetPageState();
        if (message) showCliOutput(['> ' + message]);
        loadPage();
    }

    function setFeedMode(mode, message, persist) {
        if (!FEED_MODES[mode]) return;
        feedMode = mode;
        searchMode = null;
        artistMode = null;
        refreshProfileContext();
        if (persist !== false) persistFeedMode(mode);
        updateModeControls();
        resetPageState();
        clearCliOutput();
        if (message) showCliOutput(['> ' + message]);
        history.replaceState(null, '', mode === DEFAULT_FEED_MODE ? '/?hen=1' : '/?hen=1&mode=' + encodeURIComponent(mode));
        loadPage();
    }

    function applyModeFromUrl() {
        var params = new URLSearchParams(window.location.search);
        var requestedMode = params.get('mode');
        feedMode = FEED_MODES[requestedMode] ? requestedMode : getSavedFeedMode();
        sortMode = getSavedSortMode();
        updateModeControls();
    }

    function clearFeedFilters() {
        searchMode = null;
        artistMode = null;
        listedOnly = false;
        priceMaxMutez = null;
        editionMax = null;
        hideOwned = false;
        savedOnly = false;
        sortMode = DEFAULT_SORT_MODE;
        persistSortMode(sortMode);
        if (viewerAddress) loadCollectorProfile(viewerAddress);
        else renderCollectorProfile(null, null);
    }

    function setPriceFilterFromXtz(value, message) {
        if (!value) {
            priceMaxMutez = null;
            reloadFeed(message || 'price filter cleared');
            return;
        }
        priceMaxMutez = Math.round(value * 1000000);
        reloadFeed(message || 'price <= ' + formatFilterPrice(priceMaxMutez) + ' ꜩ');
    }

    function setEditionFilter(value, message) {
        editionMax = value ? Math.max(1, Math.floor(value)) : null;
        reloadFeed(message || (editionMax ? 'editions <= ' + editionMax : 'edition filter cleared'));
    }

    function setSortMode(mode, message) {
        if (!SORT_MODES[mode]) return;
        sortMode = mode;
        persistSortMode(mode);
        reloadFeed(message || 'sort: ' + SORT_MODES[mode].label);
    }

    function applySearchValue(value, immediateMessage) {
        var next = String(value || '').trim();
        if (next === (searchMode || '')) {
            updateFilterBar();
            return;
        }
        artistMode = null;
        refreshProfileContext();
        searchMode = next || null;
        reloadFeed(immediateMessage || (searchMode ? 'searching: "' + searchMode + '"' : 'search cleared'));
    }

    function randomJump() {
        clearCliOutput();
        searchMode = null;
        artistMode = null;
        var randOffset = Math.floor(Math.random() * 2000);
        resetPageState();
        offset = randOffset;
        showCliOutput(['> random jump to offset ' + randOffset]);
        loadPage();
    }

    async function applyWalletCommand(parts) {
        var target = (parts[1] || '').trim();
        var lowered = target.toLowerCase();
        if (!target) {
            showCliOutput(['> usage: wallet <tz1...|name.tez|me|clear>', '  marks pieces already held by that wallet']);
            return;
        }
        if (lowered === 'clear' || lowered === 'off' || lowered === 'none') {
            await setViewerAddress(null);
            showCliOutput(['> wallet context cleared']);
            return;
        }
        if (lowered === 'me' || lowered === 'saved') {
            var saved = findSavedViewerAddress(true) || findSavedViewerAddress(false);
            if (!saved) {
                showCliOutput(['> no saved wallet found', '  try wallet <tz1...> or wallet <name.tez>']);
                return;
            }
            await setViewerAddress(saved.address, saved.label, { syncMyTezos: true, source: 'hen-mode' });
            showCliOutput(['> wallet ' + saved.label]);
            return;
        }
        if (isTezDomain(target)) {
            showCliOutput(['> resolving ' + target + '...']);
            var resolved = await resolveForwardTezName(target);
            if (!isValidAddress(resolved)) {
                showCliOutput(['> no wallet found for ' + target]);
                return;
            }
            await setViewerAddress(resolved, target.toLowerCase(), { syncMyTezos: true, source: 'hen-mode' });
            showCliOutput(['> wallet ' + target.toLowerCase()]);
            return;
        }
        if (!isValidAddress(target)) {
            showCliOutput(['> invalid wallet address', '  use wallet <tz1...|tz2...|tz3...|tz4...|name.tez>']);
            return;
        }
        await setViewerAddress(target, shortAddr(target), { syncMyTezos: true, source: 'hen-mode' });
        showCliOutput(['> wallet ' + shortAddr(target)]);
    }

    async function setWalletFromInput() {
        var input = el('hen-wallet-input');
        if (!input) return;
        var raw = input.value.trim();
        if (!raw) {
            showCliOutput(['> enter tz1... or name.tez']);
            return;
        }
        await applyWalletCommand(['wallet', raw]);
    }

    async function connectWalletFromHen() {
        var connect = el('hen-wallet-connect');
        var waitNotice = null;
        if (connect) {
            connect.disabled = true;
            connect.textContent = 'opening';
        }
        showCliOutput(['> opening wallet connect']);
        try {
            var wallet = await walletModule();
            waitNotice = setTimeout(function() {
                if (connect) connect.textContent = 'waiting';
                showCliOutput(['> wallet prompt waiting', '  check your wallet app, extension, or popup blocker']);
            }, 3500);
            var account = await wallet.connectOctezWallet({ syncMyTezos: true });
            var address = account && account.address;
            if (!isValidAddress(address)) throw new Error('No account address returned');
            await setViewerAddress(address, shortAddr(address), { syncMyTezos: true, source: 'hen-wallet-connect' });
            showCliOutput(['> connected ' + shortAddr(address)]);
        } catch (err) {
            console.warn('[HEN] wallet connect failed:', err);
            var timedOut = /timed out/i.test(String(err && err.message ? err.message : err));
            showCliOutput(timedOut
                ? ['> wallet prompt timed out', '  check your wallet app, extension, or popup blocker, then try connect again']
                : ['> wallet connect failed']
            );
        } finally {
            if (waitNotice) clearTimeout(waitNotice);
            if (connect) {
                connect.disabled = false;
                connect.textContent = 'connect';
            }
        }
    }

    async function handleCommand(cmd) {
        var rawCmd = cmd.trim();
        if (rawCmd) {
            cmdHistory.unshift(rawCmd);
            if (cmdHistory.length > 10) cmdHistory.pop();
        }
        cmdHistoryIdx = -1;
        var parts = rawCmd.split(/\s+/);
        var action = (parts[0] || '').toLowerCase();

        switch (action) {
            case 'exit': case 'quit': case 'q':
                deactivate();
                break;
            case 'clear':
                fadeGrid(function() {
                    clearFeedFilters();
                    reloadFeed('feed reloaded');
                });
                break;
            case 'all': case 'both': case 'live':
                setFeedMode('all', 'showing Teia + OBJKT live');
                break;
            case 'teia': case 'hen': case 'hic':
                setFeedMode('teia', 'showing Teia / HEN only');
                break;
            case 'objkt': case 'objkts':
                setFeedMode('objkt', 'showing OBJKT only');
                break;
            case 'search':
                var term = parts.slice(1).join(' ');
                if (!term) {
                    showCliOutput(['> usage: search <term>', '  searches token names']);
                } else {
                    applySearchValue(term, 'searching: "' + term + '"');
                }
                break;
            case 'artist':
                var addr = parts[1];
                if (!addr) {
                    showCliOutput(['> usage: artist <tz1...>', '  shows all work by an artist']);
                } else {
                    searchMode = null;
                    artistMode = addr;
                    loadArtistProfile(addr);
                    reloadFeed('artist: ' + addr);
                }
                break;
            case 'price': case 'under': case 'max':
                var priceArg = (parts[1] || '').toLowerCase();
                if (!priceArg) {
                    showCliOutput(['> usage: price <max xtz|clear>', '  example: price 5']);
                } else if (priceArg === 'clear' || priceArg === 'any' || priceArg === 'off') {
                    setPriceFilterFromXtz(null, 'price filter cleared');
                } else {
                    var maxPrice = parsePositiveNumber(priceArg);
                    if (!maxPrice) {
                        showCliOutput(['> usage: price <max xtz|clear>', '  example: price 2.5']);
                    } else {
                        setPriceFilterFromXtz(maxPrice);
                    }
                }
                break;
            case 'forsale': case 'listed':
                var saleArg = (parts[1] || 'on').toLowerCase();
                listedOnly = !(saleArg === 'off' || saleArg === 'false' || saleArg === '0' || saleArg === 'any' || saleArg === 'clear');
                reloadFeed(listedOnly ? 'showing listed pieces' : 'showing listed and unlisted pieces');
                break;
            case 'edition': case 'editions': case 'supply':
                var editionArg = (parts[1] || '').toLowerCase();
                if (!editionArg) {
                    showCliOutput(['> usage: editions <max|clear>', '  example: editions 10']);
                } else if (editionArg === 'clear' || editionArg === 'any' || editionArg === 'off') {
                    setEditionFilter(null, 'edition filter cleared');
                } else {
                    var maxEditions = parsePositiveNumber(editionArg);
                    if (!maxEditions) {
                        showCliOutput(['> usage: editions <max|clear>', '  example: editions 5']);
                    } else {
                        setEditionFilter(maxEditions);
                    }
                }
                break;
            case 'sort':
                var sortArg = (parts[1] || '').toLowerCase();
                if (!SORT_MODES[sortArg]) {
                    showCliOutput(['> usage: sort <newest|cheapest|scarce>']);
                } else {
                    setSortMode(sortArg);
                }
                break;
            case 'saved': case 'favorites': case 'watchlist':
                var savedArg = (parts[1] || 'on').toLowerCase();
                savedOnly = !(savedArg === 'off' || savedArg === 'false' || savedArg === '0' || savedArg === 'clear');
                reloadFeed(savedOnly ? 'showing saved pieces' : 'saved filter cleared');
                break;
            case 'hideowned': case 'hide-owned':
                var hideArg = (parts[1] || 'on').toLowerCase();
                if (!viewerAddress) {
                    showCliOutput(['> connect or set a wallet before hiding owned pieces']);
                } else {
                    hideOwned = !(hideArg === 'off' || hideArg === 'false' || hideArg === '0' || hideArg === 'clear');
                    reloadFeed(hideOwned ? 'hiding owned pieces' : 'owned pieces visible');
                }
                break;
            case 'wallet':
                await applyWalletCommand(parts);
                break;
            case 'filters':
                showCliOutput([
                    '> filters',
                    '  source: ' + (FEED_MODES[feedMode] || FEED_MODES.all).label,
                    '  wallet: ' + (viewerAddress ? (viewerLabel || shortAddr(viewerAddress)) : 'off'),
                    '  sort: ' + SORT_MODES[sortMode].label,
                    '  feed: ' + (activeFilterLabel() || 'none')
                ]);
                break;
            case 'random':
                randomJump();
                break;
            case 'reset':
                clearFeedFilters();
                setFeedMode(DEFAULT_FEED_MODE, 'reset to Teia + OBJKT live');
                break;
            case 'help':
                showCliOutput([
                    '> commands',
                    '  exit        \u2014 return to dashboard',
                    '  clear       \u2014 clear feed filters and reload',
                    '  all         \u2014 Teia + OBJKT live together',
                    '  teia        \u2014 only Teia / HEN contract mints',
                    '  objkt       \u2014 only OBJKT artist-collection mints',
                    '  forsale on|off \u2014 show only pieces with asks',
                    '  search <term> \u2014 filter by name',
                    '  artist <tz1...> \u2014 show artist\'s work',
                    '  price <max> \u2014 only listed pieces under max ꜩ',
                    '  editions <max> \u2014 only editions up to max supply',
                    '  sort <newest|cheapest|scarce> \u2014 reorder the feed',
                    '  saved on|off \u2014 filter to saved hearts',
                    '  hideowned on|off \u2014 hide pieces your wallet owns',
                    '  wallet <addr|name.tez|me|clear> \u2014 mark owned pieces',
                    '  filters     \u2014 show active setup',
                    '  random      \u2014 jump to random offset',
                    '  reset       \u2014 clear all filters',
                    '  help        \u2014 this message'
                ]);
                break;
            default:
                showCliOutput(['> unknown: ' + cmd, '  type help for commands']);
        }
        if (cliInput()) cliInput().value = '';
    }

    async function openDeepLink() {
        var params = new URLSearchParams(window.location.search);
        var teia = params.get('teia');
        var objkt = params.get('objkt');
        var contract = HEN_CONTRACT;
        var tokenId = teia;
        if (!tokenId && objkt) {
            var parts = objkt.split('/');
            if (parts.length < 2) return false;
            contract = parts[0];
            tokenId = parts[1];
        }
        if (!tokenId) return false;
        try {
            var query = '{ token(where: {fa_contract: {_eq: "' + escapeGraphqlString(contract) + '"}, token_id: {_eq: "' + escapeGraphqlString(tokenId) + '"}}) { ' + tokenFields() + ' } }';
            var res = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query })
            });
            var json = await res.json();
            var token = (json.data && json.data.token && json.data.token[0]) ? json.data.token[0] : null;
            if (token) {
                await syncViewerHoldingsForTokens([token]);
                expandToken(token);
                return true;
            }
        } catch (e) { console.error('[HEN] deep link error:', e); }
        return false;
    }

    async function activate() {
        if (isActive) return;
        isActive = true;
        var ov = overlay();
        if (!ov) return;

        document.body.classList.add('hen-glitching');
        await sleep(300);
        document.body.classList.remove('hen-glitching');

        ov.classList.add('active');
        document.body.classList.add('hen-active');
        clearInitialBlackout();

        applyModeFromUrl();
        mobileFiltersOpen = false;
        loadFavoriteKeys();
        updateFilterBar();
        updateMobileFilterToggle();
        renderLoopHint();
        loadSavedViewer();
        preloadWalletConnect();
        fetchXtzPrice();
        startBlockPolling();
        // Only play boot once per session
        if (!HenMode._booted) {
            HenMode._booted = true;
            await playBoot();
        }
        await loadPage();
        await openDeepLink();

        pollTimer = setInterval(pollNew, POLL_INTERVAL);

        // 9. Listening idle state
        var idleTimer = null;
        var listenEl = document.createElement('div');
        listenEl.className = 'hen-listening';
        listenEl.textContent = 'listening...';
        var header = document.querySelector('.hen-header');
        if (header) header.parentNode.insertBefore(listenEl, header.nextSibling);

        function resetIdle() {
            listenEl.classList.remove('visible');
            clearTimeout(idleTimer);
            idleTimer = setTimeout(function() {
                if (isActive) listenEl.classList.add('visible');
            }, 30000);
        }
        resetIdle();
        // Reset idle on new mints (patch pollNew indirectly)
        var origPoll = pollNew;
        if (cliInput()) cliInput().focus();
    }

    async function deactivate() {
        if (!isActive) return;
        isActive = false;
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        stopBlockPolling();
        var exp = expanded();
        if (exp) exp.classList.remove('active');
        restoreShareMeta();
        var ov = overlay();
        if (ov) {
            document.body.classList.add('hen-glitching');
            await sleep(300);
            document.body.classList.remove('hen-glitching');
            ov.classList.remove('active');
        }
        document.body.classList.remove('hen-active');
        clearInitialBlackout();
        history.replaceState(null, '', '/');
        tokens = [];
        offset = 0;
        newestTimestamp = null;
        searchMode = null;
        artistMode = null;
        listedOnly = false;
        feedMode = DEFAULT_FEED_MODE;
        sortMode = getSavedSortMode();
        priceMaxMutez = null;
        editionMax = null;
        hideOwned = false;
        savedOnly = false;
        feedGeneration++;
        loading = false;
        if (grid()) grid().innerHTML = '';
        var hint = document.getElementById('hen-loop-hint');
        if (hint) hint.remove();
        updateModeControls();
    }

    var blockTimer = null;

    function fetchBlock() {
        var mc = mintCount();
        if (!mc) return;
        fetch('https://eu.rpc.tez.capital/chains/main/blocks/head/header').then(function(r) { return r.json(); }).then(function(d) {
            if (d && d.level && mc) {
                mc.textContent = 'block ' + d.level.toLocaleString();
            }
        }).catch(function() {});
    }

    function startBlockPolling() {
        fetchBlock();
        blockTimer = setInterval(fetchBlock, 10000);
    }

    function stopBlockPolling() {
        if (blockTimer) { clearInterval(blockTimer); blockTimer = null; }
    }

    function updateCount() {
        // Block polling handles the header now
    }

    function init() {
        var launcher = document.getElementById('hen-launcher');
        if (launcher) launcher.addEventListener('click', function(e) {
            e.preventDefault();
            history.replaceState(null, '', '/?hen=1');
            activate();
        });

        var closeBtn = document.querySelector('.hen-close');
        if (closeBtn) closeBtn.addEventListener('click', deactivate);

        document.querySelectorAll('[data-hen-mode]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                setFeedMode(btn.getAttribute('data-hen-mode'), btn.textContent.trim() + ' mode');
            });
        });
        updateModeControls();

        var walletConnect = el('hen-wallet-connect');
        if (walletConnect) {
            ['pointerenter', 'focus'].forEach(function(eventName) {
                walletConnect.addEventListener(eventName, preloadWalletConnect, { once: true });
            });
            walletConnect.addEventListener('click', function() {
                connectWalletFromHen().catch(function(err) {
                    console.error('[HEN] wallet connect command error:', err);
                    showCliOutput(['> wallet connect failed']);
                });
            });
        }

        var walletSave = el('hen-wallet-save');
        if (walletSave) walletSave.addEventListener('click', function() {
            setWalletFromInput().catch(function(err) {
                console.error('[HEN] wallet set error:', err);
                showCliOutput(['> wallet setup failed']);
            });
        });

        var walletClear = el('hen-wallet-clear');
        if (walletClear) walletClear.addEventListener('click', function() {
            setViewerAddress(null).then(function() {
                var input = el('hen-wallet-input');
                if (input) input.value = '';
                showCliOutput(['> wallet context cleared']);
            });
        });

        var walletInput = el('hen-wallet-input');
        if (walletInput) walletInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                setWalletFromInput().catch(function(err) {
                    console.error('[HEN] wallet input error:', err);
                    showCliOutput(['> wallet setup failed']);
                });
            }
        });

        window.addEventListener('my-baker-updated', function(e) {
            if (!isActive) return;
            var address = e.detail && e.detail.address;
            if (isValidAddress(address) && address !== viewerAddress) {
                setViewerAddress(address, 'my tezos ' + shortAddr(address));
            }
        });

        window.addEventListener('storage', function(e) {
            if (!isActive || e.key !== MY_TEZOS_ADDRESS_KEY || !isValidAddress(e.newValue) || e.newValue === viewerAddress) return;
            setViewerAddress(e.newValue, 'my tezos ' + shortAddr(e.newValue));
        });

        var expClose = document.querySelector('.hen-expanded-close');
        if (expClose) expClose.addEventListener('click', function() {
            closeExpanded();
        });

        var exp = expanded();
        if (exp) exp.addEventListener('click', function(e) {
            if (e.target === exp) {
                closeExpanded();
            }
        });
        if (exp) exp.addEventListener('keydown', function(e) {
            if (!exp.classList.contains('active')) return;
            if (e.key !== 'Tab') return;
            var focusable = Array.from(exp.querySelectorAll('a[href], button:not([disabled]), video, [tabindex]:not([tabindex="-1"])'))
                .filter(function(node) { return node.offsetParent !== null; });
            if (focusable.length === 0) return;
            var first = focusable[0];
            var last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });

        var cli = cliInput();
        if (cli) cli.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (cmdHistory.length > 0 && cmdHistoryIdx < cmdHistory.length - 1) {
                    cmdHistoryIdx++;
                    cli.value = cmdHistory[cmdHistoryIdx];
                }
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (cmdHistoryIdx > 0) {
                    cmdHistoryIdx--;
                    cli.value = cmdHistory[cmdHistoryIdx];
                } else {
                    cmdHistoryIdx = -1;
                    cli.value = '';
                }
                return;
            }
            if (e.key === 'Enter') {
                handleCommand(e.target.value).catch(function(err) {
                    console.error('[HEN] command error:', err);
                    showCliOutput(['> command failed']);
                });
            }
        });

        setupScroll();
        setupFilterBar();

        var focusIdx = -1;
        function updateFocus(idx) {
            var cards = document.querySelectorAll('.hen-card');
            cards.forEach(function(c) { c.classList.remove('hen-focused'); });
            if (idx >= 0 && idx < cards.length) {
                focusIdx = idx;
                cards[idx].classList.add('hen-focused');
                cards[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        document.addEventListener('keydown', function(e) {
            if (!isActive) return;
            if (e.target === cliInput() || e.target === el('hen-wallet-input')) return; // don't nav while typing

            var cards = document.querySelectorAll('.hen-card');
            var cols = window.innerWidth > 900 ? 4 : (window.innerWidth > 600 ? 3 : 2);

            if (e.key === 'ArrowRight') { e.preventDefault(); updateFocus(Math.min(focusIdx + 1, cards.length - 1)); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); updateFocus(Math.max(focusIdx - 1, 0)); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); updateFocus(Math.min(focusIdx + cols, cards.length - 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); updateFocus(Math.max(focusIdx - cols, 0)); return; }
            if (e.key === 'Enter' && focusIdx >= 0 && focusIdx < tokens.length) {
                var exp = expanded();
                if (!exp || !exp.classList.contains('active')) {
                    var key = cards[focusIdx] ? cards[focusIdx].dataset.key : '';
                    expandToken(tokenCache.get(key) || tokens[focusIdx]);
                    return;
                }
            }

            if (e.key === 'Escape') {
                var exp = expanded();
                if (exp && exp.classList.contains('active')) {
                    closeExpanded();
                } else {
                    deactivate();
                }
            }
        });

        // Live-updating timestamps every 30s
        setInterval(function() {
            document.querySelectorAll('.hen-card-time').forEach(function(el) {
                var card = el.closest('.hen-card');
                if (!card) return;
                if (card.dataset.timestamp) el.textContent = timeAgo(card.dataset.timestamp);
            });
        }, 30000);
    }

    return { init: init, activate: activate, deactivate: deactivate, isActive: function() { return isActive; } };
})();

window.HenMode = HenMode;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', HenMode.init);
} else {
    HenMode.init();
}

(function() {
    var params = new URLSearchParams(window.location.search);
    if (params.has('hen')) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() { HenMode.activate(); });
        } else {
            HenMode.activate();
        }
    }
})();
