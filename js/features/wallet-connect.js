/**
 * Wallet Connect — octez.connect SDK integration for tezos.systems
 * Lazy-loads octez.connect SDK only when user clicks Connect.
 * Auto-hydrates My Tezos with the connected address.
 *
 * Migrated from Beacon SDK → octez.connect (Beacon fork by Trilitech)
 * https://github.com/trilitech/octez.connect
 */

const OCTEZ_CONNECT_CDN = 'https://unpkg.com/@tezos-x/octez.connect-sdk@5.0.0-beta.5/dist/walletbeacon.min.js';
const LS_WALLET = 'tezos-systems-beacon-address'; // keep same key for backward compat
let dAppClient = null;

/**
 * Lazy-load octez.connect SDK
 */
function loadSDK() {
    return new Promise((resolve, reject) => {
        if (window.beacon) return resolve(window.beacon);
        const s = document.createElement('script');
        s.src = OCTEZ_CONNECT_CDN;
        s.onload = () => {
            // octez.connect-sdk exposes window.beacon (same as Beacon)
            resolve(window.beacon);
        };
        s.onerror = () => reject(new Error('Failed to load octez.connect SDK'));
        document.head.appendChild(s);
    });
}

/**
 * Initialize DAppClient
 */
async function getClient() {
    if (dAppClient) return dAppClient;
    const sdk = await loadSDK();
    dAppClient = new sdk.DAppClient({
        name: 'tezos.systems',
        preferredNetwork: sdk.NetworkType.MAINNET,
        enableMetrics: false,
    });
    return dAppClient;
}

/**
 * Connect wallet and return address
 */
async function connectWallet() {
    const client = await getClient();
    // Check if already has active account
    const active = await client.getActiveAccount();
    if (active) {
        return active.address;
    }
    // Request permissions (v5: network is set on DAppClient, not requestPermissions)
    const permissions = await client.requestPermissions();
    return permissions.address;
}

/**
 * Disconnect wallet
 */
async function disconnectWallet() {
    if (dAppClient) {
        await dAppClient.clearActiveAccount();
        await dAppClient.destroy();
        dAppClient = null;
    }
    localStorage.removeItem(LS_WALLET);
}

/**
 * Hydrate My Tezos with the given address
 */
function hydrateMyTezos(address) {
    // Save to localStorage for persistence
    localStorage.setItem(LS_WALLET, address);
    localStorage.setItem('tezos-systems-my-baker-address', address);

    // Fill the address input
    const input = document.getElementById('my-baker-input');
    if (input) {
        input.value = address;
        input.dispatchEvent(new Event('input'));
    }

    // Click Save to trigger the lookup
    const saveBtn = document.getElementById('my-baker-save');
    if (saveBtn) saveBtn.click();

    // Open My Tezos drawer in connected state
    const drawer = document.getElementById('my-tezos-drawer');
    const scrim = document.getElementById('my-tezos-drawer-scrim');
    const emptyState = document.getElementById('drawer-empty-state');
    const connectedState = document.getElementById('drawer-connected');
    if (drawer && scrim) {
        drawer.classList.add('open');
        scrim.classList.add('open');
        document.body.style.overflow = 'hidden';
        if (emptyState) emptyState.style.display = 'none';
        if (connectedState) connectedState.style.display = '';
    }
}

// Shared state across all wallet connect buttons
let connected = false;
const allButtons = [];

function updateAllButtons(html, title, isConnected) {
    connected = isConnected;
    allButtons.forEach(btn => {
        btn.innerHTML = html;
        btn.title = title;
        if (isConnected) btn.classList.add('beacon-connected');
        else btn.classList.remove('beacon-connected');
    });
}

const ICON_CONNECT = '<span class="beacon-icon">\u{1F4F1}</span> Connect';
const TITLE_CONNECT = 'Connect wallet via octez.connect';

function createWalletButton() {
    const btn = document.createElement('button');
    btn.className = 'glass-button my-baker-btn beacon-btn';
    btn.title = TITLE_CONNECT;
    btn.innerHTML = ICON_CONNECT;
    btn.style.cssText = 'gap:4px;display:inline-flex;align-items:center;white-space:nowrap;';

    btn.addEventListener('click', async () => {
        if (connected) {
            updateAllButtons('\u23f3', 'Disconnecting...', true);
            try {
                await disconnectWallet();
                updateAllButtons(ICON_CONNECT, TITLE_CONNECT, false);
                const clearBtn = document.getElementById('my-baker-clear');
                if (clearBtn) clearBtn.click();
            } catch (e) {
                console.error('[octez.connect] disconnect error:', e);
                updateAllButtons(ICON_CONNECT, TITLE_CONNECT, false);
            }
            return;
        }

        updateAllButtons('\u23f3 Loading...', 'Connecting...', false);
        allButtons.forEach(b => b.disabled = true);
        try {
            const address = await connectWallet();
            if (address) {
                const short = '\u2705 ' + address.slice(0, 6) + '...' + address.slice(-4);
                const tip = 'Connected: ' + address + '. Click to disconnect.';
                updateAllButtons(short, tip, true);
                hydrateMyTezos(address);
            } else {
                updateAllButtons(ICON_CONNECT, TITLE_CONNECT, false);
            }
        } catch (e) {
            console.error('[octez.connect] connect error:', e);
            updateAllButtons(ICON_CONNECT, TITLE_CONNECT, false);
            const err = document.getElementById('my-baker-error-msg');
            if (err) {
                err.textContent = 'Wallet connection cancelled or failed';
                err.style.display = 'block';
                setTimeout(() => { err.style.display = 'none'; }, 3000);
            }
        } finally {
            allButtons.forEach(b => b.disabled = false);
        }
    });

    allButtons.push(btn);
    return btn;
}

/**
 * Add wallet connect buttons to My Tezos section (both empty + connected states)
 */
export function initWalletConnect() {
    // Add to empty state (first screen)
    const emptyControls = document.querySelector('#drawer-empty-state .my-baker-controls');
    if (emptyControls) {
        const emptyBtn = createWalletButton();
        const connectBtn = emptyControls.querySelector('#drawer-connect-btn');
        if (connectBtn) connectBtn.after(emptyBtn);
        else emptyControls.appendChild(emptyBtn);
    }

    // Add to connected state
    const connectedControls = document.querySelector('#drawer-connected .my-baker-controls');
    if (connectedControls) {
        const connBtn = createWalletButton();
        const saveBtn = connectedControls.querySelector('#my-baker-save');
        if (saveBtn) connectedControls.insertBefore(connBtn, saveBtn);
        else connectedControls.appendChild(connBtn);
    }

    // On page load, check for saved address and auto-show connected state
    const savedAddr = localStorage.getItem(LS_WALLET);
    if (savedAddr) {
        const short = '\u2705 ' + savedAddr.slice(0, 6) + '...' + savedAddr.slice(-4);
        const tip = 'Connected: ' + savedAddr + '. Click to disconnect.';
        updateAllButtons(short, tip, true);
    }
}
