/* ═══════════════════════════════════════════════════
   HEN MODE — hic et nunc art discovery
   v2: OG improvements (all 10)
   ═══════════════════════════════════════════════════ */

const HenMode = (() => {
    const API = 'https://data.objkt.com/v3/graphql';
    const IPFS_GW = 'https://ipfs.io/ipfs/';
    const HEN_CONTRACT = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
    const PAGE_SIZE = 40;
    const POLL_INTERVAL = 15000;
    const TEZ_DOMAINS_API = 'https://api.tezos.domains/graphql';

    let tokens = [];
    let loading = false;
    let offset = 0;
    let pollTimer = null;
    let newestTimestamp = null;
    let isActive = false;
    let searchMode = null;
    let artistMode = null;
    let xtzUsd = null;
    const tezNameCache = {};

    const el = (id) => document.getElementById(id);
    const overlay = () => el('hen-overlay');
    const grid = () => el('hen-grid');
    const boot = () => el('hen-boot');
    const expanded = () => el('hen-expanded');
    const cliInput = () => el('hen-cli-input');
    const mintCount = () => el('hen-mint-count');
    const loadingEl = () => el('hen-loading');

    function resolveUri(uri) {
        if (!uri) return '';
        if (uri.startsWith('ipfs://')) return IPFS_GW + uri.slice(7);
        return uri;
    }

    function timeAgo(ts) {
        const diff = Date.now() - new Date(ts).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        return Math.floor(hrs / 24) + 'd ago';
    }

    function shortAddr(addr) {
        if (!addr) return '???';
        return addr.slice(0, 5) + '...' + addr.slice(-4);
    }

    function formatPrice(mutez) {
        if (!mutez) return null;
        const xtz = mutez / 1000000;
        return xtz < 1 ? xtz.toFixed(2) : xtz.toFixed(1);
    }

    function formatUsd(mutez) {
        if (!mutez || !xtzUsd) return '';
        const usd = (mutez / 1000000) * xtzUsd;
        return usd < 0.01 ? '<$0.01' : '$' + usd.toFixed(2);
    }

    function collectUrl(token) {
        if (token.fa_contract === HEN_CONTRACT) {
            return 'https://objkt.com/tokens/hicetnunc/' + token.token_id;
        }
        return 'https://objkt.com/tokens/' + token.fa_contract + '/' + token.token_id;
    }

    function pieceUrl(token) {
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

    async function fetchXtzPrice() {
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tezos&vs_currencies=usd');
            const json = await res.json();
            xtzUsd = (json.tezos && json.tezos.usd) ? json.tezos.usd : null;
        } catch (e) { xtzUsd = null; }
    }

    async function fetchTokens(limit, offsetVal, after) {
        limit = limit || PAGE_SIZE;
        offsetVal = offsetVal || 0;
        const where = [
            'display_uri: {_like: "ipfs://%"}',
            'supply: {_gt: "0"}',
            'fa: {collection_type: {_eq: "artist"}}'
        ];
        if (after) where.push('timestamp: {_gt: "' + after + '"}');
        if (searchMode) where.push('name: {_ilike: "%' + searchMode + '%"}');
        if (artistMode) where.push('creators: {creator_address: {_eq: "' + artistMode + '"}}');

        const query = '{ token(order_by: {timestamp: desc}, limit: ' + limit + ', offset: ' + offsetVal + ', where: {' + where.join(', ') + '}) { token_id fa_contract name timestamp mime supply lowest_ask display_uri thumbnail_uri creators { creator_address } fa { name } } }';

        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        if (!res.ok) throw new Error('Objkt API ' + res.status);
        const json = await res.json();
        return (json.data && json.data.token) ? json.data.token : [];
    }

    async function fetchArtistWork(creatorAddr, excludeTokenId, excludeContract) {
        const query = '{ token(order_by: {timestamp: desc}, limit: 6, where: {creators: {creator_address: {_eq: "' + creatorAddr + '"}}, display_uri: {_like: "ipfs://%"}, supply: {_gt: "0"}, fa: {collection_type: {_eq: "artist"}}}) { token_id fa_contract name thumbnail_uri display_uri mime lowest_ask supply timestamp creators { creator_address } fa { name } } }';
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        const json = await res.json();
        var all = (json.data && json.data.token) ? json.data.token : [];
        return all.filter(function(t) { return !(t.token_id === excludeTokenId && t.fa_contract === excludeContract); }).slice(0, 5);
    }

    function createCard(token, staggerIdx, isNew) {
        staggerIdx = staggerIdx || 0;
        var card = document.createElement('div');
        card.className = 'hen-card';
        card.dataset.contract = token.fa_contract;
        card.dataset.tokenId = token.token_id;
        var creator = (token.creators && token.creators[0]) ? token.creators[0].creator_address : '';
        card.dataset.creator = creator;

        var isVideo = token.mime && token.mime.startsWith('video/');
        var thumbUrl = resolveUri(token.thumbnail_uri || token.display_uri);
        var price = formatPrice(token.lowest_ask);
        var usd = formatUsd(token.lowest_ask);
        var collName = (token.fa && token.fa.name) ? token.fa.name : '';
        var showColl = collName && collName.toLowerCase().indexOf('untitled') === -1;

        var priceHtml = price
            ? '<span class="hen-card-price">' + price + ' ꜩ' + (usd ? ' <span class="hen-card-usd">(' + usd + ')</span>' : '') + '</span>'
            : '<span class="hen-card-editions">—</span>';

        card.innerHTML =
            '<div class="hen-card-thumb">' +
                '<img src="' + thumbUrl + '" alt="' + (token.name || '') + '" loading="lazy" onerror="this.style.display=\'none\'">' +
                (isVideo ? '<div class="hen-card-badge">▶ VIDEO</div>' : '') +
            '</div>' +
            '<div class="hen-card-info">' +
                '<div class="hen-card-creator">' + shortAddr(creator) + '</div>' +
                '<div class="hen-card-title">' + (token.name || 'untitled') + '</div>' +
                (showColl ? '<div class="hen-card-collection">' + collName + '</div>' : '') +
                '<div class="hen-card-meta">' + priceHtml + '<span class="hen-card-editions">×' + token.supply + '</span></div>' +
                '<div class="hen-card-bottom"><span class="hen-card-time">' + timeAgo(token.timestamp) + '</span><span class="hen-card-objkt">#' + token.token_id + '</span></div>' +
            '</div>';

        if (isNew) {
            card.classList.add('hen-card-new');
            setTimeout(function() { card.classList.remove('hen-card-new'); }, 2000);
        }

        setTimeout(function() { card.classList.add('visible'); }, staggerIdx * 50);
        card.addEventListener('click', function() { expandToken(token); });
        card.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var url = pieceUrl(token);
            navigator.clipboard.writeText(url).then(function() {
                showCopyToast();
            });
        });
        return card;
    }

    async function expandToken(token) {
        var exp = expanded();
        var mediaUrl = resolveUri(token.display_uri);
        var isVideo = token.mime && token.mime.startsWith('video/');
        var creator = (token.creators && token.creators[0]) ? token.creators[0].creator_address : '';
        var price = formatPrice(token.lowest_ask);
        var usd = formatUsd(token.lowest_ask);
        var shareUrl = pieceUrl(token);
        var collName = (token.fa && token.fa.name) ? token.fa.name : '';

        history.replaceState(null, '', '/?hen=1&objkt=' + token.fa_contract + '/' + token.token_id);

        var tezName = await resolveTezName(creator);
        var displayName = tezName || shortAddr(creator);

        var mediaHtml = isVideo
            ? '<video class="hen-expanded-media" src="' + mediaUrl + '" autoplay loop muted playsinline></video>'
            : '<img class="hen-expanded-media" src="' + mediaUrl + '" alt="' + (token.name || '') + '">';

        exp.querySelector('.hen-expanded-inner').innerHTML =
            mediaHtml +
            '<div class="hen-expanded-info">' +
                '<div class="hen-expanded-title">' + (token.name || 'untitled') + '</div>' +
                '<div class="hen-expanded-creator hen-clickable-artist" data-addr="' + creator + '">' + displayName + '</div>' +
                '<div class="hen-expanded-details">' +
                    (price ? '<span class="hen-card-price">' + price + ' ꜩ' + (usd ? ' (' + usd + ')' : '') + '</span>' : '') +
                    '<span>×' + token.supply + '</span>' +
                    '<span>' + timeAgo(token.timestamp) + '</span>' +
                    '<span>#' + token.token_id + '</span>' +
                    (collName ? '<span>' + collName + '</span>' : '') +
                '</div>' +
                '<div class="hen-expanded-actions">' +
                    '<a class="hen-expanded-collect" href="' + collectUrl(token) + '" target="_blank" rel="noopener">collect →</a>' +
                    '<button class="hen-expanded-share" title="Copy share link">⎘ share</button>' +
                '</div>' +
                '<div class="hen-artist-work" id="hen-artist-work">' +
                    '<div class="hen-artist-work-label">more by this artist...</div>' +
                    '<div class="hen-artist-work-grid" id="hen-artist-work-grid"></div>' +
                '</div>' +
            '</div>';

        exp.querySelector('.hen-expanded-share').addEventListener('click', function() {
            navigator.clipboard.writeText(shareUrl).then(function() {
                var btn = exp.querySelector('.hen-expanded-share');
                btn.textContent = '✓ copied';
                setTimeout(function() { btn.textContent = '⎘ share'; }, 2000);
            });
        });

        exp.querySelector('.hen-clickable-artist').addEventListener('click', function() {
            exp.classList.remove('active');
            artistMode = creator;
            tokens = [];
            offset = 0;
            grid().innerHTML = '';
            clearCliOutput();
            showCliOutput(['> showing work by ' + displayName]);
            loadPage();
        });

        exp.classList.add('active');

        if (creator) {
            var otherWork = await fetchArtistWork(creator, token.token_id, token.fa_contract);
            var workGrid = document.getElementById('hen-artist-work-grid');
            if (workGrid && otherWork.length > 0) {
                workGrid.innerHTML = otherWork.map(function(t) {
                    var thumb = resolveUri(t.thumbnail_uri || t.display_uri);
                    return '<div class="hen-artist-thumb" data-contract="' + t.fa_contract + '" data-token="' + t.token_id + '"><img src="' + thumb + '" alt="' + (t.name || '') + '" loading="lazy"></div>';
                }).join('');
                workGrid.querySelectorAll('.hen-artist-thumb').forEach(function(thumbEl, i) {
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
        var loader = loadingEl();
        if (loader) { loader.textContent = 'indexing...'; loader.classList.add('active'); }

        try {
            var newTokens = await fetchTokens(PAGE_SIZE, offset);
            if (newTokens.length === 0) {
                if (loader) loader.textContent = 'end of feed';
                return;
            }
            var g = grid();
            newTokens.forEach(function(t, i) {
                tokens.push(t);
                g.appendChild(createCard(t, i));
            });
            offset += newTokens.length;
            if (!newestTimestamp && tokens.length > 0) {
                newestTimestamp = tokens[0].timestamp;
            }
            updateCount();
            resolveNamesForCards();
        } catch (err) {
            console.error('[HEN] fetch error:', err);
        } finally {
            loading = false;
            if (loader) loader.classList.remove('active');
        }
    }

    async function pollNew() {
        if (!newestTimestamp || !isActive) return;
        try {
            var fresh = await fetchTokens(20, 0, newestTimestamp);
            if (fresh.length > 0) {
                var g = grid();
                // Reverse so newest ends up at top
                var sorted = fresh.slice().reverse();
                sorted.forEach(function(t) {
                    tokens.unshift(t);
                    var card = createCard(t, 0, true);
                    card.classList.add('visible');
                    g.prepend(card);
                });
                offset += fresh.length;
                newestTimestamp = fresh[0].timestamp;
                updateCount();
                resolveNamesForCards();
                showMintPulse(fresh);
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
        var text = freshTokens.length === 1
            ? name + ' just minted "' + (t.name || 'untitled') + '"'
            : freshTokens.length + ' new mints — ' + name + ' and others';
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
            '> initializing hen protocol...',
            '> connecting to objkt marketplace',
            '> indexing tezos NFT contracts',
            '> resolving IPFS gateways',
            '> loading art feed...',
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
            await sleep(250);
            div.classList.add('show');
        }

        await sleep(600);
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
            if (l.indexOf('>') === 0) return '<div style="color:#00d4ff">' + l + '</div>';
            if (l.indexOf('  ') === 0) return '<div style="color:#555;padding-left:12px">' + l + '</div>';
            return '<div>' + l + '</div>';
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

    function handleCommand(cmd) {
        var parts = cmd.trim().toLowerCase().split(/\s+/);
        var action = parts[0];

        switch (action) {
            case 'exit': case 'quit': case 'q':
                deactivate();
                break;
            case 'clear':
                clearCliOutput();
                fadeGrid(function() {
                    searchMode = null;
                    artistMode = null;
                    tokens = [];
                    offset = 0;
                    newestTimestamp = null;
                    grid().innerHTML = '';
                    loadPage();
                });
                break;
            case 'search':
                var term = parts.slice(1).join(' ');
                if (!term) {
                    showCliOutput(['> usage: search <term>', '  searches token names']);
                } else {
                    clearCliOutput();
                    artistMode = null;
                    tokens = [];
                    offset = 0;
                    grid().innerHTML = '';
                    searchMode = term;
                    showCliOutput(['> searching: "' + term + '"']);
                    loadPage();
                }
                break;
            case 'artist':
                var addr = parts[1];
                if (!addr) {
                    showCliOutput(['> usage: artist <tz1...>', '  shows all work by an artist']);
                } else {
                    clearCliOutput();
                    searchMode = null;
                    tokens = [];
                    offset = 0;
                    grid().innerHTML = '';
                    artistMode = addr;
                    showCliOutput(['> artist: ' + addr]);
                    loadPage();
                }
                break;
            case 'random':
                clearCliOutput();
                searchMode = null;
                artistMode = null;
                tokens = [];
                var randOffset = Math.floor(Math.random() * 2000);
                offset = randOffset;
                grid().innerHTML = '';
                showCliOutput(['> random jump to offset ' + randOffset]);
                loadPage();
                break;
            case 'reset':
                clearCliOutput();
                searchMode = null;
                artistMode = null;
                tokens = [];
                offset = 0;
                newestTimestamp = null;
                grid().innerHTML = '';
                history.replaceState(null, '', '/?hen=1');
                loadPage();
                break;
            case 'help':
                showCliOutput([
                    '> commands',
                    '  exit        \u2014 return to dashboard',
                    '  clear       \u2014 reload the feed',
                    '  search <term> \u2014 filter by name',
                    '  artist <tz1...> \u2014 show artist\'s work',
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
        var objkt = params.get('objkt');
        if (!objkt) return false;
        var parts = objkt.split('/');
        if (parts.length < 2) return false;
        var contract = parts[0];
        var tokenId = parts[1];
        try {
            var query = '{ token(where: {fa_contract: {_eq: "' + contract + '"}, token_id: {_eq: "' + tokenId + '"}}) { token_id fa_contract name timestamp mime supply lowest_ask display_uri thumbnail_uri creators { creator_address } fa { name } } }';
            var res = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query })
            });
            var json = await res.json();
            var token = (json.data && json.data.token && json.data.token[0]) ? json.data.token[0] : null;
            if (token) { expandToken(token); return true; }
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

        fetchXtzPrice();
        await playBoot();
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
        var exp = expanded();
        if (exp) exp.classList.remove('active');
        var ov = overlay();
        if (ov) {
            document.body.classList.add('hen-glitching');
            await sleep(300);
            document.body.classList.remove('hen-glitching');
            ov.classList.remove('active');
        }
        document.body.classList.remove('hen-active');
        history.replaceState(null, '', '/');
        tokens = [];
        offset = 0;
        newestTimestamp = null;
        searchMode = null;
        artistMode = null;
        if (grid()) grid().innerHTML = '';
    }

    function updateCount() {
        var mc = mintCount();
        if (!mc) return;
        var maxId = 0;
        tokens.forEach(function(t) {
            var id = parseInt(t.token_id);
            if (id > maxId) maxId = id;
        });
        var countText = tokens.length + ' tokens';
        if (maxId > 0) countText += ' · OBJKT #' + maxId.toLocaleString();
        mc.textContent = countText;
    }

    function init() {
        var closeBtn = document.querySelector('.hen-close');
        if (closeBtn) closeBtn.addEventListener('click', deactivate);

        var expClose = document.querySelector('.hen-expanded-close');
        if (expClose) expClose.addEventListener('click', function() {
            var exp = expanded();
            if (exp) exp.classList.remove('active');
            history.replaceState(null, '', '/?hen=1');
        });

        var exp = expanded();
        if (exp) exp.addEventListener('click', function(e) {
            if (e.target === exp) {
                exp.classList.remove('active');
                history.replaceState(null, '', '/?hen=1');
            }
        });

        var cli = cliInput();
        if (cli) cli.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') handleCommand(e.target.value);
        });

        setupScroll();

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
            if (e.target === cliInput()) return; // don't nav while typing

            var cards = document.querySelectorAll('.hen-card');
            var cols = window.innerWidth > 900 ? 4 : (window.innerWidth > 600 ? 3 : 2);

            if (e.key === 'ArrowRight') { e.preventDefault(); updateFocus(Math.min(focusIdx + 1, cards.length - 1)); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); updateFocus(Math.max(focusIdx - 1, 0)); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); updateFocus(Math.min(focusIdx + cols, cards.length - 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); updateFocus(Math.max(focusIdx - cols, 0)); return; }
            if (e.key === 'Enter' && focusIdx >= 0 && focusIdx < tokens.length) {
                var exp = expanded();
                if (!exp || !exp.classList.contains('active')) {
                    expandToken(tokens[focusIdx]);
                    return;
                }
            }

            if (e.key === 'Escape') {
                var exp = expanded();
                if (exp && exp.classList.contains('active')) {
                    exp.classList.remove('active');
                    history.replaceState(null, '', '/?hen=1');
                } else {
                    deactivate();
                }
            }
        });

        console.log('[HEN] mode v2 initialized');

        // Live-updating timestamps every 30s
        setInterval(function() {
            document.querySelectorAll('.hen-card-time').forEach(function(el) {
                var card = el.closest('.hen-card');
                if (!card) return;
                var idx = Array.from(grid().children).indexOf(card);
                if (idx >= 0 && idx < tokens.length) {
                    el.textContent = timeAgo(tokens[idx].timestamp);
                }
            });
        }, 30000);
    }

    return { init: init, activate: activate, deactivate: deactivate, isActive: function() { return isActive; } };
})();

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
