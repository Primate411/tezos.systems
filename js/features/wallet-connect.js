/**
 * Wallet Connect — Beacon SDK integration for tezos.systems
 * Lazy-loads Beacon SDK only when user clicks Connect.
 * Auto-hydrates My Tezos with the connected address.
 */

const BEACON_CDN = 'https://unpkg.com/@airgap/beacon-sdk@4.3.0/dist/walletbeacon.min.js';
const LS_WALLET = 'tezos-systems-beacon-address';
let dAppClient = null;

/**
 * Lazy-load Beacon SDK
 */
function loadBeaconSDK() {
    return new Promise((resolve, reject) => {
        if (window.beacon) return resolve(window.beacon);
        const s = document.createElement('script');
        s.src = BEACON_CDN;
        s.onload = () => {
            // beacon-sdk exposes window.beacon
            resolve(window.beacon);
        };
        s.onerror = () => reject(new Error('Failed to load Beacon SDK'));
        document.head.appendChild(s);
    });
}

/**
 * Initialize DAppClient
 */
async function getClient() {
    if (dAppClient) return dAppClient;
    const sdk = await loadBeaconSDK();
    dAppClient = new sdk.DAppClient({
        name: 'tezos.systems',
        preferredNetwork: sdk.NetworkType.MAINNET,
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
    // Request permissions
    const permissions = await client.requestPermissions({
        network: { type: 'mainnet' }
    });
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

    // Open My Tezos section if collapsed
    const toggle = document.getElementById('my-baker-toggle');
    const section = document.getElementById('my-baker-section');
    if (toggle && section && !section.classList.contains('visible')) {
        toggle.click();
    }

    // Scroll to it
    if (section) {
        setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
}

/**
 * Add wallet connect button to My Tezos section
 */
export function initWalletConnect() {
    const controls = document.querySelector('#my-baker-section .my-baker-controls');
    if (!controls) return;

    // Create connect button
    const btn = document.createElement('button');
    btn.id = 'beacon-connect-btn';
    btn.className = 'glass-button my-baker-btn beacon-btn';
    btn.title = 'Connect wallet via Beacon';
    btn.innerHTML = '<span class="beacon-icon">\u{1F4F1}</span> Connect';
    btn.style.cssText = 'gap:4px;display:inline-flex;align-items:center;white-space:nowrap;';

    let connected = false;

    btn.addEventListener('click', async () => {
        if (connected) {
            // Disconnect flow
            btn.innerHTML = '\u23f3';
            try {
                await disconnectWallet();
                connected = false;
                btn.innerHTML = '<span class="beacon-icon">\u{1F4F1}</span> Connect';
                btn.title = 'Connect wallet via Beacon';
                btn.classList.remove('beacon-connected');
                // Clear the address
                const clearBtn = document.getElementById('my-baker-clear');
                if (clearBtn) clearBtn.click();
            } catch (e) {
                console.error('[beacon] disconnect error:', e);
                btn.innerHTML = '<span class="beacon-icon">\u{1F4F1}</span> Connect';
            }
            return;
        }

        btn.innerHTML = '\u23f3 Loading...';
        btn.disabled = true;
        try {
            const address = await connectWallet();
            if (address) {
                connected = true;
                btn.innerHTML = '\u2705 ' + address.slice(0, 6) + '...' + address.slice(-4);
                btn.title = 'Connected: ' + address + '. Click to disconnect.';
                btn.classList.add('beacon-connected');
                hydrateMyTezos(address);
            }
        } catch (e) {
            console.error('[beacon] connect error:', e);
            btn.innerHTML = '<span class="beacon-icon">\u{1F4F1}</span> Connect';
            // Show brief error
            const err = document.getElementById('my-baker-error-msg');
            if (err) {
                err.textContent = 'Wallet connection cancelled or failed';
                err.style.display = 'block';
                setTimeout(() => { err.style.display = 'none'; }, 3000);
            }
        } finally {
            btn.disabled = false;
        }
    });

    // Insert before the Save button
    const saveBtn = controls.querySelector('#my-baker-save');
    if (saveBtn) {
        controls.insertBefore(btn, saveBtn);
    } else {
        controls.appendChild(btn);
    }

    // On page load, check for saved Beacon address and auto-reconnect
    const savedAddr = localStorage.getItem(LS_WALLET);
    if (savedAddr) {
        connected = true;
        btn.innerHTML = '\u2705 ' + savedAddr.slice(0, 6) + '...' + savedAddr.slice(-4);
        btn.title = 'Connected: ' + savedAddr + '. Click to disconnect.';
        btn.classList.add('beacon-connected');
    }
}
