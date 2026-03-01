/* ═══════════════════════════════════════════════════
   HEN MODE — hic et nunc art discovery
   ═══════════════════════════════════════════════════ */

const HenMode = (() => {
    const API = 'https://data.objkt.com/v3/graphql';
    const IPFS_GW = 'https://ipfs.io/ipfs/';
    const PAGE_SIZE = 40;
    const POLL_INTERVAL = 30000; // 30s

    let tokens = [];
    let loading = false;
    let offset = 0;
    let pollTimer = null;
    let newestTimestamp = null;
    let pendingNew = [];
    let isActive = false;

    // ── DOM refs ──
    const el = (id) => document.getElementById(id);
    const overlay = () => el('hen-overlay');
    const grid = () => el('hen-grid');
    const boot = () => el('hen-boot');
    const expanded = () => el('hen-expanded');
    const newPill = () => el('hen-new-pill');
    const cliInput = () => el('hen-cli-input');
    const mintCount = () => el('hen-mint-count');
    const loadingEl = () => el('hen-loading');

    // ── IPFS URL resolver ──
    function resolveUri(uri) {
        if (!uri) return '';
        if (uri.startsWith('ipfs://')) return IPFS_GW + uri.slice(7);
        return uri;
    }

    // ── Time ago ──
    function timeAgo(ts) {
        const diff = Date.now() - new Date(ts).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    }

    // ── Truncate tz address ──
    function shortAddr(addr) {
        if (!addr) return '???';
        return addr.slice(0, 5) + '...' + addr.slice(-4);
    }

    // ── Format price (mutez → XTZ) ──
    function formatPrice(mutez) {
        if (!mutez) return null;
        const xtz = mutez / 1000000;
        return xtz < 1 ? xtz.toFixed(2) : xtz.toFixed(1);
    }

    // ── GraphQL fetch ──
    async function fetchTokens(limit = PAGE_SIZE, offsetVal = 0, after = null) {
        const where = [
            'display_uri: {_like: "ipfs://%"}',
            'supply: {_gt: "0"}',
            'fa: {collection_type: {_eq: "artist"}}'
        ];
        if (after) where.push(`timestamp: {_gt: "${after}"}`);

        const query = `{
            token(
                order_by: {timestamp: desc},
                limit: ${limit},
                offset: ${offsetVal},
                where: {${where.join(', ')}}
            ) {
                token_id fa_contract name timestamp mime supply
                lowest_ask display_uri thumbnail_uri
                creators { creator_address }
                fa { name }
            }
        }`;

        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        if (!res.ok) throw new Error(`Objkt API ${res.status}`);
        const json = await res.json();
        return json?.data?.token || [];
    }

    // ── Render a card ──
    function createCard(token, staggerIdx = 0) {
        const card = document.createElement('div');
        card.className = 'hen-card';
        card.dataset.contract = token.fa_contract;
        card.dataset.tokenId = token.token_id;

        const isVideo = token.mime?.startsWith('video/');
        const thumbUrl = resolveUri(token.thumbnail_uri || token.display_uri);
        const creator = token.creators?.[0]?.creator_address || '';
        const price = formatPrice(token.lowest_ask);

        card.innerHTML = `
            <div class="hen-card-thumb">
                <img src="${thumbUrl}" alt="${token.name || ''}" loading="lazy" onerror="this.style.display='none'">
                ${isVideo ? '<div class="hen-card-badge">▶ VIDEO</div>' : ''}
            </div>
            <div class="hen-card-info">
                <div class="hen-card-creator">${shortAddr(creator)}</div>
                <div class="hen-card-title">${token.name || 'untitled'}</div>
                <div class="hen-card-meta">
                    ${price ? `<span class="hen-card-price">${price} ꜩ</span>` : '<span class="hen-card-editions">—</span>'}
                    <span class="hen-card-editions">×${token.supply}</span>
                </div>
                <div class="hen-card-time">${timeAgo(token.timestamp)}</div>
            </div>
        `;

        // Stagger animation
        setTimeout(() => card.classList.add('visible'), staggerIdx * 50);

        // Click → expand
        card.addEventListener('click', () => expandToken(token));

        return card;
    }

    // ── Expand view ──
    function expandToken(token) {
        const exp = expanded();
        const mediaUrl = resolveUri(token.display_uri);
        const isVideo = token.mime?.startsWith('video/');
        const creator = token.creators?.[0]?.creator_address || '';
        const price = formatPrice(token.lowest_ask);
        const collectUrl = `https://objkt.com/tokens/${token.fa_contract}/${token.token_id}`;

        exp.querySelector('.hen-expanded-inner').innerHTML = `
            ${isVideo
                ? `<video class="hen-expanded-media" src="${mediaUrl}" autoplay loop muted playsinline></video>`
                : `<img class="hen-expanded-media" src="${mediaUrl}" alt="${token.name || ''}">`
            }
            <div class="hen-expanded-info">
                <div class="hen-expanded-title">${token.name || 'untitled'}</div>
                <div class="hen-expanded-creator">${shortAddr(creator)}</div>
                <div class="hen-expanded-details">
                    ${price ? `<span class="hen-card-price">${price} ꜩ</span>` : ''}
                    <span>×${token.supply}</span>
                    <span>${timeAgo(token.timestamp)}</span>
                    ${token.fa?.name ? `<span>${token.fa.name}</span>` : ''}
                </div>
                <a class="hen-expanded-collect" href="${collectUrl}" target="_blank" rel="noopener">collect →</a>
            </div>
        `;
        exp.classList.add('active');
    }

    // ── Load page ──
    async function loadPage() {
        if (loading) return;
        loading = true;
        const loader = loadingEl();
        if (loader) { loader.textContent = 'indexing...'; loader.classList.add('active'); }

        try {
            const newTokens = await fetchTokens(PAGE_SIZE, offset);
            if (newTokens.length === 0) {
                if (loader) loader.textContent = 'end of feed';
                return;
            }

            const g = grid();
            const startIdx = tokens.length;
            newTokens.forEach((t, i) => {
                tokens.push(t);
                g.appendChild(createCard(t, i));
            });

            offset += newTokens.length;
            if (!newestTimestamp && tokens.length > 0) {
                newestTimestamp = tokens[0].timestamp;
            }
        } catch (err) {
            console.error('[HEN] fetch error:', err);
            if (loadingEl()) loadingEl().textContent = 'fetch failed — retry in 30s';
        } finally {
            loading = false;
            if (loader) loader.classList.remove('active');
        }
    }

    // ── Poll for new mints ──
    async function pollNew() {
        if (!newestTimestamp || !isActive) return;
        try {
            const fresh = await fetchTokens(20, 0, newestTimestamp);
            if (fresh.length > 0) {
                pendingNew = fresh.concat(pendingNew).slice(0, 100);
                const pill = newPill();
                if (pill) {
                    pill.textContent = `↑ ${pendingNew.length} new mint${pendingNew.length > 1 ? 's' : ''}`;
                    pill.classList.add('visible');
                }
            }
        } catch (e) {
            console.error('[HEN] poll error:', e);
        }
    }

    function prependNew() {
        if (pendingNew.length === 0) return;
        const g = grid();
        const frag = document.createDocumentFragment();
        pendingNew.forEach((t, i) => {
            tokens.unshift(t);
            frag.appendChild(createCard(t, i));
        });
        g.prepend(frag);
        offset += pendingNew.length;
        newestTimestamp = pendingNew[0].timestamp;
        pendingNew = [];
        newPill()?.classList.remove('visible');

        // Scroll to top
        const feed = document.querySelector('.hen-feed');
        if (feed) feed.scrollTop = 0;
    }

    // ── Boot sequence ──
    async function playBoot() {
        const b = boot();
        if (!b) return;
        b.innerHTML = '';
        b.style.display = 'flex';
        b.classList.add('visible');

        const lines = [
            '> initializing hen protocol...',
            '> connecting to objkt marketplace',
            '> indexing tezos NFT contracts',
            '> resolving IPFS gateways',
            '> loading art feed...',
            ''
        ];

        for (let i = 0; i < lines.length; i++) {
            const div = document.createElement('div');
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

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ── Infinite scroll ──
    function setupScroll() {
        const feed = document.querySelector('.hen-feed');
        if (!feed) return;
        feed.addEventListener('scroll', () => {
            if (feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 400) {
                loadPage();
            }
        });
    }

    // ── CLI commands ──
    function handleCommand(cmd) {
        const parts = cmd.trim().toLowerCase().split(/\s+/);
        const action = parts[0];

        switch (action) {
            case 'exit':
            case 'quit':
            case 'q':
                deactivate();
                break;
            case 'clear':
                tokens = [];
                offset = 0;
                pendingNew = [];
                newestTimestamp = null;
                grid().innerHTML = '';
                loadPage();
                break;
            case 'search':
                // TODO: filter by name
                break;
            case 'artist':
                // TODO: filter by creator address
                break;
            case 'help':
                console.log('[HEN] commands: exit, clear, search <term>, artist <tz1...>, help');
                break;
            default:
                console.log('[HEN] unknown command:', cmd);
        }

        if (cliInput()) cliInput().value = '';
    }

    // ── Activate ──
    async function activate() {
        if (isActive) return;
        isActive = true;

        const ov = overlay();
        if (!ov) return;

        // Glitch the dashboard
        document.body.classList.add('hen-glitching');
        await sleep(300);
        document.body.classList.remove('hen-glitching');

        // Show overlay
        ov.classList.add('active');
        document.body.classList.add('hen-active');

        // Boot sequence
        await playBoot();

        // Load first page
        await loadPage();

        // Update count
        updateCount();

        // Start polling
        pollTimer = setInterval(pollNew, POLL_INTERVAL);

        // Focus CLI
        if (cliInput()) cliInput().focus();
    }

    // ── Deactivate ──
    async function deactivate() {
        if (!isActive) return;
        isActive = false;

        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

        // Close expanded if open
        expanded()?.classList.remove('active');

        const ov = overlay();
        if (ov) {
            document.body.classList.add('hen-glitching');
            await sleep(300);
            document.body.classList.remove('hen-glitching');
            ov.classList.remove('active');
        }

        document.body.classList.remove('hen-active');

        // Reset state
        tokens = [];
        offset = 0;
        pendingNew = [];
        newestTimestamp = null;
        if (grid()) grid().innerHTML = '';
        newPill()?.classList.remove('visible');
    }

    function updateCount() {
        const mc = mintCount();
        if (mc) mc.textContent = `${tokens.length} tokens loaded`;
    }

    // ── Init (called once on page load) ──
    function init() {
        // Close button
        document.querySelector('.hen-close')?.addEventListener('click', deactivate);

        // Expanded close
        document.querySelector('.hen-expanded-close')?.addEventListener('click', () => {
            expanded()?.classList.remove('active');
        });

        // Expanded backdrop click
        expanded()?.addEventListener('click', (e) => {
            if (e.target === expanded()) expanded().classList.remove('active');
        });

        // New pill click
        newPill()?.addEventListener('click', prependNew);

        // CLI
        cliInput()?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleCommand(e.target.value);
            }
        });

        // Infinite scroll
        setupScroll();

        // ESC to close expanded or exit
        document.addEventListener('keydown', (e) => {
            if (!isActive) return;
            if (e.key === 'Escape') {
                if (expanded()?.classList.contains('active')) {
                    expanded().classList.remove('active');
                } else {
                    deactivate();
                }
            }
        });

        console.log('[HEN] mode initialized');
    }

    return { init, activate, deactivate, isActive: () => isActive };
})();

// Auto-init when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', HenMode.init);
} else {
    HenMode.init();
}

// Auto-activate from ?hen=1 URL param
(function() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('hen')) {
        // Remove param from URL without reload
        const url = new URL(window.location);
        url.searchParams.delete('hen');
        history.replaceState(null, '', url.pathname + url.search);
        // Activate as soon as DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => HenMode.activate());
        } else {
            HenMode.activate();
        }
    }
})();
