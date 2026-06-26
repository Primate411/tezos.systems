/**
 * Octez.Connect wallet bridge for Tezos.Systems.
 *
 * The site is intentionally framework-free, so the SDK is loaded lazily from
 * its browser bundle only when a wallet action needs it.
 */

export const OCTEZ_CONNECT_VERSION = '4.8.5';
export const OCTEZ_CONNECT_SRC = `https://esm.sh/@tezos-x/octez.connect-sdk@${OCTEZ_CONNECT_VERSION}?bundle`;

export const MY_TEZOS_ADDRESS_KEY = 'tezos-systems-my-baker-address';
export const WALLET_ADDRESS_KEY = 'tezos-systems-octez-wallet-address';
export const SAVED_ADDRESSES_KEY = 'tezos-systems-saved-addresses';

let _sdkPromise = null;
let _clientPromise = null;
let _eventsBound = false;
let _activeAccount = null;

const WALLET_DISCONNECT_TIMEOUT_MS = 2500;
const WALLET_CLEAR_TIMEOUT_MS = 1000;
const WALLET_SDK_TIMEOUT_MS = 15000;
const WALLET_CONNECT_TIMEOUT_MS = 45000;
const WALLET_ACCOUNT_TIMEOUT_MS = 5000;

export function isTezosAccountAddress(address) {
    return /^(tz[1-4])[a-zA-Z0-9]{33}$/.test(String(address || '').trim());
}

export function isTezosAddress(address) {
    return /^(tz[1-4]|KT1)[a-zA-Z0-9]{33}$/.test(String(address || '').trim());
}

export function shortAddress(address) {
    const value = String(address || '').trim();
    if (value.length < 12) return value;
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function getStoredWalletAddress() {
    try {
        const address = localStorage.getItem(WALLET_ADDRESS_KEY) || '';
        return isTezosAccountAddress(address) ? address : '';
    } catch {
        return '';
    }
}

function emitWalletUpdate(account, status = 'ready') {
    const address = account?.address || '';
    window.dispatchEvent(new CustomEvent('tezos-wallet-updated', {
        detail: {
            account: account || null,
            address,
            connected: Boolean(address),
            status
        }
    }));
}

function rememberAccount(account, status = 'ready') {
    _activeAccount = account || null;
    try {
        if (account?.address && isTezosAccountAddress(account.address)) {
            localStorage.setItem(WALLET_ADDRESS_KEY, account.address);
        } else {
            localStorage.removeItem(WALLET_ADDRESS_KEY);
        }
    } catch {}
    emitWalletUpdate(_activeAccount, status);
    return _activeAccount;
}

function readSavedAddresses() {
    try {
        const parsed = JSON.parse(localStorage.getItem(SAVED_ADDRESSES_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter((item) => isTezosAddress(item?.address)) : [];
    } catch {
        return [];
    }
}

function writeSavedAddresses(saved) {
    try {
        localStorage.setItem(SAVED_ADDRESSES_KEY, JSON.stringify(saved.slice(0, 10)));
    } catch {}
}

export function rememberMyTezosAddress(address, { label = null, source = 'wallet' } = {}) {
    const value = String(address || '').trim();
    if (!isTezosAddress(value)) {
        throw new Error('My Tezos address must be a tz1/tz2/tz3/tz4 or KT1 address');
    }
    try {
        localStorage.setItem(MY_TEZOS_ADDRESS_KEY, value);
    } catch {}

    const saved = readSavedAddresses().filter((item) => item.address !== value);
    saved.unshift({ address: value, label, addedAt: Date.now() });
    writeSavedAddresses(saved);

    const drawerInput = document.getElementById('drawer-address-input');
    const mainInput = document.getElementById('my-baker-input');
    if (drawerInput) drawerInput.value = value;
    if (mainInput) mainInput.value = value;

    const emptyState = document.getElementById('drawer-empty-state');
    const connectedState = document.getElementById('drawer-connected');
    if (emptyState) emptyState.style.display = 'none';
    if (connectedState) connectedState.style.display = '';

    window.dispatchEvent(new CustomEvent('my-baker-updated', { detail: { address: value, source } }));
    return value;
}

function withWalletTimeout(action, timeoutMs, label) {
    let timeoutId = null;
    return Promise.race([
        Promise.resolve().then(action),
        new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
        })
    ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
    });
}

function walletTimeoutOverride(name, fallback) {
    const value = Number(window[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isIgnorableDisconnectError(error) {
    return /No transport available|Not connected|Disconnect timed out/i.test(String(error?.message || error));
}

async function clearActiveAccountQuietly(client) {
    if (!client?.clearActiveAccount) return;
    try {
        await withWalletTimeout(
            () => client.clearActiveAccount(),
            WALLET_CLEAR_TIMEOUT_MS,
            'Clear active account'
        );
    } catch (error) {
        console.warn('[wallet] Octez.Connect account clear failed:', error?.message || error);
    }
}

function findLoadedSdk(candidate = null) {
    if (candidate?.getDAppClientInstance) return candidate;
    if (candidate?.default?.getDAppClientInstance) return candidate.default;
    if (window.beacon?.getDAppClientInstance) return window.beacon;
    return null;
}

export async function loadOctezConnect() {
    const globalSdk = findLoadedSdk();
    if (globalSdk) return globalSdk;
    if (!_sdkPromise) {
        _sdkPromise = import(OCTEZ_CONNECT_SRC).then((module) => {
            const sdk = findLoadedSdk(module);
            if (!sdk) {
                throw new Error('Octez.Connect SDK did not expose getDAppClientInstance');
            }
            return sdk;
        }).catch((error) => {
            _sdkPromise = null;
            throw new Error(`Octez.Connect SDK failed to load: ${error?.message || error}`);
        });
    }
    return _sdkPromise;
}

function buildClientOptions(beacon) {
    const regions = beacon.Regions || {};
    const matrixNodes = {};
    if (regions.EUROPE_WEST) {
        matrixNodes[regions.EUROPE_WEST] = [
            'beacon-node-3.octez.io',
            'beacon-node-1.octez.io',
            'beacon-node-2.octez.io',
            'beacon-node-1.hope.papers.tech',
            'beacon-node-1.hope-2.papers.tech',
            'beacon-node-1.hope-3.papers.tech',
            'beacon-node-1.hope-4.papers.tech',
            'beacon-node-1.hope-5.papers.tech'
        ];
    }
    if (regions.NORTH_AMERICA_EAST) matrixNodes[regions.NORTH_AMERICA_EAST] = [];

    return {
        name: 'Tezos.Systems',
        appUrl: window.location.origin,
        network: { type: beacon.NetworkType?.MAINNET || 'mainnet' },
        featuredWallets: ['kukai', 'airgap', 'umami', 'temple', 'metamask'],
        enableMetrics: false,
        ...(Object.keys(matrixNodes).length ? { matrixNodes } : {})
    };
}

async function bindWalletEvents(client, beacon) {
    if (_eventsBound || !client?.subscribeToEvent) return;
    _eventsBound = true;

    const activeEvent = beacon.BeaconEvent?.ACTIVE_ACCOUNT_SET || 'ACTIVE_ACCOUNT_SET';
    const abortEvent = beacon.BeaconEvent?.PAIR_ABORTED || 'PAIR_ABORTED';
    try {
        await client.subscribeToEvent(activeEvent, (account) => rememberAccount(account, 'ready'));
        await client.subscribeToEvent(abortEvent, () => emitWalletUpdate(_activeAccount, 'aborted'));
    } catch (error) {
        console.warn('[wallet] could not bind Octez.Connect events:', error?.message || error);
    }
}

export async function getDAppClient() {
    if (!_clientPromise) {
        _clientPromise = withWalletTimeout(
            () => loadOctezConnect().then(async (beacon) => {
                const client = beacon.getDAppClientInstance(buildClientOptions(beacon));
                await bindWalletEvents(client, beacon);
                return client;
            }),
            walletTimeoutOverride('__TEZOS_WALLET_SDK_TIMEOUT_MS__', WALLET_SDK_TIMEOUT_MS),
            'Octez.Connect SDK load'
        ).catch((error) => {
            _clientPromise = null;
            if (/timed out/i.test(String(error?.message || error))) _sdkPromise = null;
            throw error;
        });
    }
    return _clientPromise;
}

export function preloadOctezConnect() {
    return getDAppClient().catch((error) => {
        console.warn('[wallet] Octez.Connect preload failed:', error?.message || error);
        return null;
    });
}

export async function getWalletAccount({ quiet = false } = {}) {
    try {
        const client = await getDAppClient();
        const account = await client.getActiveAccount();
        return rememberAccount(account, account?.address ? 'ready' : 'empty');
    } catch (error) {
        if (!quiet) throw error;
        return null;
    }
}

export function syncWalletToMyTezos(address) {
    const value = String(address || '').trim();
    if (!isTezosAccountAddress(value)) {
        throw new Error('Connected wallet did not provide a tz1/tz2/tz3/tz4 account address');
    }
    return rememberMyTezosAddress(value, { source: 'octez-connect' });
}

export async function connectOctezWallet({ syncMyTezos = false } = {}) {
    const client = await getDAppClient();
    const permissions = await withWalletTimeout(
        () => client.requestPermissions(),
        walletTimeoutOverride('__TEZOS_WALLET_CONNECT_TIMEOUT_MS__', WALLET_CONNECT_TIMEOUT_MS),
        'Wallet connection'
    );
    let account = null;
    try {
        account = await withWalletTimeout(
            () => client.getActiveAccount(),
            WALLET_ACCOUNT_TIMEOUT_MS,
            'Wallet account lookup'
        );
    } catch (error) {
        console.warn('[wallet] Octez.Connect account lookup failed:', error?.message || error);
    }
    const active = rememberAccount(account || permissions, 'connected');
    if (syncMyTezos && active?.address) syncWalletToMyTezos(active.address);
    return active;
}

export async function disconnectOctezWallet() {
    const client = await getDAppClient();
    try {
        if (client.disconnect) {
            await withWalletTimeout(
                () => client.disconnect(),
                WALLET_DISCONNECT_TIMEOUT_MS,
                'Disconnect'
            );
        } else if (client.clearActiveAccount) {
            await withWalletTimeout(
                () => client.clearActiveAccount(),
                WALLET_CLEAR_TIMEOUT_MS,
                'Clear active account'
            );
        }
    } catch (error) {
        if (!isIgnorableDisconnectError(error)) {
            throw error;
        }
    }
    await clearActiveAccountQuietly(client);
    return rememberAccount(null, 'disconnected');
}

export async function requestWalletOperation(operationDetails) {
    const beacon = await loadOctezConnect();
    const client = await getDAppClient();
    let account = await client.getActiveAccount();
    if (!account?.address) {
        account = await connectOctezWallet({ syncMyTezos: true });
    } else {
        rememberAccount(account, 'ready');
    }

    const transactionKind = beacon.TezosOperationType?.TRANSACTION || 'transaction';
    const normalized = operationDetails.map((detail) => ({
        ...detail,
        kind: detail.kind || transactionKind
    }));
    return client.requestOperation({ operationDetails: normalized });
}
