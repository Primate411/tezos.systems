/**
 * Objkt NFT Profile - Standalone pane with toggle
 */

import { fetchObjktProfile, resolveIpfs } from './objkt.js';
import { escapeHtml } from './utils.js';

const STORAGE_KEY = 'tezos-systems-objkt-address';
const VISIBLE_KEY = 'tezos-systems-objkt-visible';

function isValidAddress(addr) {
    if (!addr || addr.length !== 36) return false;
    return /^(tz[1-4]|KT1)[a-zA-Z0-9]{33}$/.test(addr);
}

function isTezDomain(input) {
    return input && input.endsWith('.tez') && input.length > 4;
}

async function resolveForwardDomain(name) {
    try {
        const resp = await fetch('https://api.tezos.domains/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `query { domain(name: "${name}") { address } }`
            })
        });
        const data = await resp.json();
        return data?.data?.domain?.address || null;
    } catch {
        return null;
    }
}

function fmtXTZ(mutez) {
    const xtz = (mutez || 0) / 1e6;
    if (xtz >= 1000000) return (xtz / 1000000).toFixed(1) + 'M ꜩ';
    if (xtz >= 1000) return (xtz / 1000).toFixed(1) + 'K ꜩ';
    if (xtz >= 1) return xtz.toFixed(1) + ' ꜩ';
    if (xtz > 0) return xtz.toFixed(2) + ' ꜩ';
    return '0 ꜩ';
}

function createStatItem(label, value) {
    const div = document.createElement('div');
    div.className = 'my-baker-stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'my-baker-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'my-baker-stat-value';
    valueEl.textContent = value;
    div.appendChild(labelEl);
    div.appendChild(valueEl);
    return div;
}

function createMatrixLoader() {
    const wrapper = document.createElement('div');
    wrapper.className = 'my-baker-loading-matrix';
    const chars = 'tz14KTꜩ0xABCDEF89';
    const count = 24;
    for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        span.className = 'matrix-char';
        span.textContent = chars[Math.floor(Math.random() * chars.length)];
        span.style.animationDelay = `${(Math.random() * 2).toFixed(2)}s`;
        span.style.animationDuration = `${(1.2 + Math.random() * 1.6).toFixed(2)}s`;
        wrapper.appendChild(span);
    }
    const interval = setInterval(() => {
        const spans = wrapper.querySelectorAll('.matrix-char');
        const idx = Math.floor(Math.random() * spans.length);
        spans[idx].textContent = chars[Math.floor(Math.random() * chars.length)];
    }, 150);
    const observer = new MutationObserver(() => {
        if (!wrapper.isConnected) { clearInterval(interval); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return wrapper;
}

async function renderProfile(address, container) {
    container.innerHTML = '';
    container.appendChild(createMatrixLoader());

    try {
        const profile = await fetchObjktProfile(address);
        container.innerHTML = '';

        if (!profile || (!profile.creator && !profile.collector)) {
            const empty = document.createElement('div');
            empty.className = 'my-baker-error';
            empty.textContent = 'No NFT activity found for this address.';
            container.appendChild(empty);
            return;
        }

        // Creator stats
        if (profile.creator) {
            const section = document.createElement('div');
            section.className = 'objkt-subsection';

            const title = document.createElement('h4');
            title.className = 'objkt-subtitle';
            title.textContent = 'Creator';
            section.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'my-baker-grid';
            grid.appendChild(createStatItem('Pieces Created', profile.creator.totalCreated.toLocaleString()));
            grid.appendChild(createStatItem('Total Sales', fmtXTZ(profile.creator.totalSalesVolume * 1e6)));
            grid.appendChild(createStatItem('Sales Count', profile.creator.totalSalesCount.toLocaleString()));

            if (profile.creator.collections.length > 0) {
                grid.appendChild(createStatItem('Collections', profile.creator.collections.length.toLocaleString()));
                grid.appendChild(createStatItem('Total Editions', profile.creator.totalEditions.toLocaleString()));
                grid.appendChild(createStatItem('Unique Owners', profile.creator.totalOwners.toLocaleString()));
            }
            section.appendChild(grid);

            // Top collections
            if (profile.creator.collections.length > 0) {
                const collList = document.createElement('div');
                collList.className = 'objkt-collections';
                const collLabel = document.createElement('span');
                collLabel.className = 'objkt-collections-label';
                collLabel.textContent = 'Top Collections';
                collList.appendChild(collLabel);

                for (const coll of profile.creator.collections.slice(0, 5)) {
                    const row = document.createElement('div');
                    row.className = 'objkt-collection-row';
                    row.innerHTML = `
                        <span class="objkt-coll-name">${escapeHtml(coll.name)}</span>
                        <span class="objkt-coll-stats">${coll.items} items · ${coll.owners} owners · Vol: ${fmtXTZ(coll.volume * 1e6)} · Floor: ${fmtXTZ(coll.floor * 1e6)}</span>
                    `;
                    collList.appendChild(row);
                }
                section.appendChild(collList);
            }

            container.appendChild(section);
        }

        // Collector stats
        if (profile.collector) {
            const section = document.createElement('div');
            section.className = 'objkt-subsection';

            const title = document.createElement('h4');
            title.className = 'objkt-subtitle';
            title.textContent = 'Collector';
            section.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'my-baker-grid';
            grid.appendChild(createStatItem('Pieces Held', profile.collector.totalHeld.toLocaleString()));
            grid.appendChild(createStatItem('Collections', profile.collector.uniqueCollections.toLocaleString()));
            grid.appendChild(createStatItem('Total Spent', fmtXTZ(profile.collector.totalSpent * 1e6)));
            if (profile.collector.portfolioValue > 0) {
                grid.appendChild(createStatItem('Portfolio Floor', fmtXTZ(profile.collector.portfolioValue * 1e6)));
            }
            section.appendChild(grid);

            // Top collections held
            if (profile.collector.topCollections.length > 0) {
                const collList = document.createElement('div');
                collList.className = 'objkt-collections';
                const collLabel = document.createElement('span');
                collLabel.className = 'objkt-collections-label';
                collLabel.textContent = 'Top Collections Held';
                collList.appendChild(collLabel);

                for (const coll of profile.collector.topCollections) {
                    const row = document.createElement('div');
                    row.className = 'objkt-collection-row';
                    row.innerHTML = `
                        <span class="objkt-coll-name">${escapeHtml(coll.name)}</span>
                        <span class="objkt-coll-stats">${coll.count} piece${coll.count !== 1 ? 's' : ''}</span>
                    `;
                    collList.appendChild(row);
                }
                section.appendChild(collList);
            }

            container.appendChild(section);
        }
    } catch (err) {
        container.innerHTML = '';
        const errorEl = document.createElement('div');
        errorEl.className = 'my-baker-error';
        errorEl.textContent = 'Failed to load NFT profile. Try again.';
        container.appendChild(errorEl);
        console.error('Objkt profile error:', err);
    }
}

function updateVisibility(isVisible) {
    const section = document.getElementById('objkt-section');
    const toggleBtn = document.getElementById('objkt-toggle');
    if (section) section.classList.toggle('visible', isVisible);
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', isVisible);
        toggleBtn.title = `NFT Profile: ${isVisible ? 'ON' : 'OFF'}`;
    }
}

function toggle() {
    const isVisible = localStorage.getItem(VISIBLE_KEY) === 'true';
    const newState = !isVisible;
    localStorage.setItem(VISIBLE_KEY, String(newState));
    updateVisibility(newState);
    if (newState) {
        const container = document.getElementById('optional-sections');
        const section = document.getElementById('objkt-section');
        if (container && section && section.parentElement === container) container.prepend(section);
    }
}

export function initObjkt() {
    const section = document.getElementById('objkt-section');
    if (!section) return;

    const toggleBtn = document.getElementById('objkt-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggle);

    // Default off
    const isVisible = localStorage.getItem(VISIBLE_KEY) === 'true';
    updateVisibility(isVisible);

    const input = document.getElementById('objkt-input');
    const fetchBtn = document.getElementById('objkt-fetch');
    const clearBtn = document.getElementById('objkt-clear');
    const results = document.getElementById('objkt-results');
    const errorMsg = document.getElementById('objkt-error-msg');

    if (!input || !fetchBtn || !clearBtn || !results) return;

    // Load saved address
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isValidAddress(saved)) {
        input.value = saved;
        renderProfile(saved, results);
    }

    fetchBtn.addEventListener('click', async () => {
        const raw = input.value.trim();
        errorMsg.textContent = '';

        let addr = raw;
        if (isTezDomain(raw)) {
            errorMsg.textContent = 'Resolving domain...';
            const resolved = await resolveForwardDomain(raw);
            if (!resolved) {
                errorMsg.textContent = `Could not resolve "${raw}". Domain not found.`;
                return;
            }
            addr = resolved;
            input.value = addr;
            errorMsg.textContent = '';
        }

        if (!isValidAddress(addr)) {
            errorMsg.textContent = 'Invalid address. Enter a tz1…/KT1… address or a .tez domain.';
            return;
        }
        localStorage.setItem(STORAGE_KEY, addr);
        renderProfile(addr, results);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fetchBtn.click();
    });

    clearBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        input.value = '';
        results.innerHTML = '';
        errorMsg.textContent = '';
    });

    // Listen for My Baker address changes
    window.addEventListener('storage', (e) => {
        if (e.key === 'tezos-systems-my-baker-address' && e.newValue && !input.value) {
            input.value = e.newValue;
        }
    });
}
