/**
 * ctez Oven Recovery Chamber
 * Wallet-first recovery flow for users withdrawing tez from old ctez ovens.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';
import {
    connectOctezWallet,
    getStoredWalletAddress,
    preloadOctezConnect,
    requestWalletOperation,
    shortAddress
} from '../core/wallet.js';

const CTEZ_CONTRACT = 'KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2';
const CTEZ_OVENS_LIMIT = 50;
const TZKT = API_URLS.tzkt;

let _savedBodyOverflow = null;
let _savedHtmlOverflow = null;
let _ctezState = {
    address: '',
    ovens: [],
    selectedIndex: 0,
    loading: false,
    error: ''
};
let _ctezWalletBusy = false;

function lockPageScroll() {
    _savedBodyOverflow = document.body.style.overflow || '';
    _savedHtmlOverflow = document.documentElement.style.overflow || '';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
}

function unlockPageScroll() {
    document.body.style.overflow = _savedBodyOverflow || '';
    document.documentElement.style.overflow = _savedHtmlOverflow || '';
    _savedBodyOverflow = null;
    _savedHtmlOverflow = null;
}

function normalizeMicroInput(value) {
    return String(value || '').replace(/[,_\s]/g, '').trim();
}

function isNatString(value) {
    return /^\d+$/.test(normalizeMicroInput(value));
}

function isPositiveNatString(value) {
    const raw = normalizeMicroInput(value);
    return /^\d+$/.test(raw) && BigInt(raw) > 0n;
}

function isTezosAccountAddress(address) {
    return /^(tz[1-4])[a-zA-Z0-9]{33}$/.test(String(address || '').trim());
}

function formatGroupedNumber(value) {
    const raw = normalizeMicroInput(value);
    if (!/^\d+$/.test(raw)) return '';
    return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatMicroAmount(value, symbol) {
    const raw = normalizeMicroInput(value);
    if (!/^\d+$/.test(raw)) return `0 ${symbol}`;
    const amount = BigInt(raw);
    const whole = amount / 1000000n;
    const fraction = (amount % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
    const wholeText = formatGroupedNumber(whole.toString()) || '0';
    return `${wholeText}${fraction ? `.${fraction}` : ''} ${symbol}`;
}

function hasRecoverableBalance(oven) {
    return BigInt(normalizeMicroInput(oven?.tezBalance || '0')) > 0n;
}

function hasOutstandingDebt(oven) {
    return BigInt(normalizeMicroInput(oven?.ctezOutstanding || '0')) > 0n;
}

function microBigInt(value) {
    const raw = normalizeMicroInput(value);
    return /^\d+$/.test(raw) ? BigInt(raw) : 0n;
}

function sumMicroValues(items, key) {
    return items.reduce((total, item) => total + microBigInt(item?.[key] || '0'), 0n).toString();
}

function formatOvenUtilization(oven) {
    const balance = microBigInt(oven?.tezBalance || '0');
    const debt = microBigInt(oven?.ctezOutstanding || '0');
    if (debt === 0n) return { label: '0%', bar: '0' };
    if (balance === 0n) return { label: '100%', bar: '100' };
    const basisPoints = debt * 10000n / balance;
    const percent = Math.min(Number(basisPoints) / 100, 999);
    return {
        label: `${percent >= 10 ? percent.toFixed(1) : percent.toFixed(2)}%`,
        bar: String(Math.min(Math.max(percent, 2), 100))
    };
}

function renderMetric(label, value) {
    return `
        <div class="ctez-console-metric">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `;
}

async function fetchJson(url) {
    // Wallet-triggered recovery reads should not wait behind dashboard background TzKT fan-out.
    const browserFetch = (typeof window !== 'undefined' && window.__tezosSystemsOriginalFetch) || fetch;
    const response = await browserFetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`TzKT returned HTTP ${response.status}`);
    }
    return response.json();
}

async function fetchCtezOvens(address) {
    const storage = await fetchJson(`${TZKT}/contracts/${CTEZ_CONTRACT}/storage`);
    const ovensPtr = normalizeMicroInput(storage?.ovens);
    if (!isPositiveNatString(ovensPtr)) {
        throw new Error('Could not locate the ctez ovens map');
    }

    const params = new URLSearchParams({
        active: 'true',
        'key.owner': address,
        select: 'key,value,lastLevel',
        limit: String(CTEZ_OVENS_LIMIT)
    });
    const rows = await fetchJson(`${TZKT}/bigmaps/${ovensPtr}/keys?${params.toString()}`);
    if (!Array.isArray(rows)) return [];

    return rows.map((row) => {
        const key = row?.key || {};
        const value = row?.value || {};
        return {
            id: normalizeMicroInput(key.id),
            owner: key.owner || address,
            ovenAddress: value.address || '',
            tezBalance: normalizeMicroInput(value.tez_balance || '0'),
            ctezOutstanding: normalizeMicroInput(value.ctez_outstanding || '0'),
            lastLevel: row?.lastLevel || 0
        };
    }).filter((oven) => isNatString(oven.id)).sort((left, right) => {
        const leftAction = hasOutstandingDebt(left) || hasRecoverableBalance(left);
        const rightAction = hasOutstandingDebt(right) || hasRecoverableBalance(right);
        if (leftAction !== rightAction) return rightAction ? 1 : -1;
        return Number(left.id) - Number(right.id);
    });
}

export function buildCtezMintOrBurnOperation(id, quantity) {
    return {
        destination: CTEZ_CONTRACT,
        amount: '0',
        parameters: {
            entrypoint: 'mint_or_burn',
            value: {
                prim: 'Pair',
                args: [
                    { int: String(id) },
                    { int: String(quantity) }
                ]
            }
        }
    };
}

export function buildCtezWithdrawOperation(id, amount, to) {
    return {
        destination: CTEZ_CONTRACT,
        amount: '0',
        parameters: {
            entrypoint: 'withdraw',
            value: {
                prim: 'Pair',
                args: [
                    { int: String(id) },
                    {
                        prim: 'Pair',
                        args: [
                            { int: String(amount) },
                            { string: String(to) }
                        ]
                    }
                ]
            }
        }
    };
}

function renderCtezChamber() {
    return `
        <div class="chamber-header ctez-header chamber-anim-fade">
            <div class="lb-system-strip ctez-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>ctez recovery</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title">ctez Recovery</h2>
                <span class="chamber-badge ctez-badge">Wallet flow</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">My Ovens recovery console for old ctez balances</div>
                <div class="proposal-hash">Contract ${escapeHtml(CTEZ_CONTRACT)}</div>
            </div>
        </div>

        <section class="ctez-console-shell chamber-anim-fade" style="animation-delay:80ms">
            <div class="ctez-sunset-banner">
                <span>Ctez is sunsetting, please close your ovens.</span>
                <strong>My Ovens</strong>
            </div>

            <div class="ctez-console-toolbar">
                <div class="ctez-toolbar-title">
                    <span class="ctez-toolbar-mark">ctez</span>
                    <div>
                        <div class="ctez-panel-kicker">Recovery console</div>
                        <h3>My Ovens</h3>
                    </div>
                </div>
                <div class="ctez-wallet-actions">
                    <button id="ctez-wallet-connect" class="glass-button ctez-wallet-button" type="button">Connect wallet</button>
                    <button id="ctez-wallet-refresh" class="glass-button ctez-wallet-refresh" type="button" disabled>Refresh</button>
                    <span id="ctez-wallet-status" class="ctez-wallet-status">No wallet connected</span>
                </div>
            </div>

            <div class="ctez-summary-strip" id="ctez-summary-strip">
                ${renderMetric('Total balance', '0 tez')}
                ${renderMetric('Outstanding', '0 ctez')}
                ${renderMetric('Withdrawable', '0 tez')}
                ${renderMetric('Ovens found', '0')}
            </div>

            <div class="ctez-oven-panel" id="ctez-oven-panel" data-state="idle">
                <div id="ctez-oven-status" class="ctez-oven-status">Connect a wallet to check for ctez ovens.</div>
                <div id="ctez-oven-list" class="ctez-oven-list"></div>
                <div id="ctez-action-panel" class="ctez-action-panel" hidden>
                    <div class="ctez-detail-head">
                        <div>
                            <div class="ctez-panel-kicker">My Oven Details</div>
                            <h3 id="ctez-selected-title">Selected oven</h3>
                        </div>
                        <span id="ctez-selected-badge" class="ctez-contract-pill">Verified contract</span>
                    </div>
                    <div id="ctez-selected-summary" class="ctez-selected-summary"></div>
                    <div class="ctez-action-buttons">
                        <button id="ctez-wallet-burn" class="glass-button ctez-wallet-submit" type="button">Burn ctez debt</button>
                        <button id="ctez-wallet-withdraw" class="glass-button ctez-wallet-submit" type="button">Withdraw tez</button>
                    </div>
                    <div id="ctez-wallet-review" class="ctez-wallet-review">Wallet requests stay inactive until recoverable oven data is found.</div>
                    <div id="ctez-wallet-feedback" class="ctez-wallet-feedback" role="status" aria-live="polite"></div>
                </div>
            </div>
        </section>

        <section class="ctez-safety-panel chamber-anim-fade" style="animation-delay:180ms">
            <div class="lb-panel-title">Before you sign</div>
            <ul class="ctez-step-list">
                <li>Verify your wallet shows the ctez contract address: <code>${escapeHtml(CTEZ_CONTRACT)}</code>.</li>
                <li>Burn outstanding ctez debt before withdrawing tez from the same oven.</li>
                <li>Never share your seed phrase, private key, wallet file, or wallet password.</li>
            </ul>
        </section>

        <div class="chamber-footer chamber-anim-fade" style="animation-delay:220ms">
            <span>ctez contract ${escapeHtml(CTEZ_CONTRACT)}</span>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/ctez/" aria-label="Direct link to ctez Recovery">Direct: /ctez/</a>
        </div>
    `;
}

function selectedOven() {
    return _ctezState.ovens[_ctezState.selectedIndex] || null;
}

function setWalletFeedback(root, message, state = 'neutral') {
    const feedback = root.querySelector('#ctez-wallet-feedback');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.dataset.state = state;
}

function setWalletReview(root, message) {
    const review = root.querySelector('#ctez-wallet-review');
    if (review) review.textContent = message;
}

function setWalletButtonsBusy(root, busy) {
    _ctezWalletBusy = busy;
    updateCtezActionButtons(root);
}

function updateCtezWalletStatus(root, address = getStoredWalletAddress()) {
    const status = root.querySelector('#ctez-wallet-status');
    const connect = root.querySelector('#ctez-wallet-connect');
    const refresh = root.querySelector('#ctez-wallet-refresh');
    if (status) {
        status.textContent = address ? `Wallet ${shortAddress(address)}` : 'No wallet connected';
        status.dataset.connected = address ? 'true' : 'false';
    }
    if (connect) connect.textContent = address ? 'Switch wallet' : 'Connect wallet';
    if (refresh) refresh.disabled = !address || _ctezState.loading;
}

function renderOvenCard(oven, index) {
    const debt = hasOutstandingDebt(oven);
    const balance = hasRecoverableBalance(oven);
    const state = debt ? 'Burn first' : balance ? 'Withdraw' : 'Clear';
    const utilization = formatOvenUtilization(oven);
    const withdrawable = !debt && balance ? formatMicroAmount(oven.tezBalance, 'tez') : '0 tez';
    return `
        <button class="ctez-oven-card ${index === _ctezState.selectedIndex ? 'is-selected' : ''} ${debt || balance ? 'has-action' : 'is-clear'}" type="button" data-oven-index="${index}">
            <span class="ctez-oven-cell ctez-oven-id">
                <strong>#${escapeHtml(oven.id || String(index + 1))}</strong>
                <small>ID</small>
            </span>
            <span class="ctez-oven-cell">
                <strong>${escapeHtml(shortAddress(oven.ovenAddress || CTEZ_CONTRACT))}</strong>
                <small>Oven address</small>
            </span>
            <span class="ctez-oven-cell">
                <strong>${escapeHtml(formatMicroAmount(oven.tezBalance, 'tez'))}</strong>
                <small>Oven balance</small>
            </span>
            <span class="ctez-oven-cell">
                <strong>${escapeHtml(formatMicroAmount(oven.ctezOutstanding, 'ctez'))}</strong>
                <small>Outstanding</small>
            </span>
            <span class="ctez-oven-cell">
                <strong>${escapeHtml(withdrawable)}</strong>
                <small>Withdrawable</small>
            </span>
            <span class="ctez-oven-cell ctez-utilization-cell">
                <span class="ctez-utilization-bar"><i style="width:${escapeHtml(utilization.bar)}%"></i></span>
                <strong>${escapeHtml(utilization.label)}</strong>
                <small>${escapeHtml(state)}</small>
            </span>
        </button>
    `;
}

function updateCtezActionButtons(root) {
    const burnButton = root.querySelector('#ctez-wallet-burn');
    const withdrawButton = root.querySelector('#ctez-wallet-withdraw');
    const refreshButton = root.querySelector('#ctez-wallet-refresh');
    const oven = selectedOven();
    const busy = _ctezState.loading || _ctezWalletBusy;
    const debt = hasOutstandingDebt(oven);
    const balance = hasRecoverableBalance(oven);

    if (refreshButton) refreshButton.disabled = busy || !_ctezState.address;
    const connectButton = root.querySelector('#ctez-wallet-connect');
    if (connectButton) connectButton.disabled = busy;
    if (burnButton) {
        burnButton.disabled = busy || !oven || !debt;
        burnButton.textContent = debt ? 'Burn ctez debt' : 'No debt to burn';
    }
    if (withdrawButton) {
        withdrawButton.disabled = busy || !oven || debt || !balance;
        withdrawButton.textContent = balance ? 'Withdraw tez' : 'No tez to withdraw';
    }
}

function renderCtezOvenState(root) {
    const panel = root.querySelector('#ctez-oven-panel');
    const status = root.querySelector('#ctez-oven-status');
    const list = root.querySelector('#ctez-oven-list');
    const actionPanel = root.querySelector('#ctez-action-panel');
    const summary = root.querySelector('#ctez-selected-summary');
    const summaryStrip = root.querySelector('#ctez-summary-strip');
    const selectedTitle = root.querySelector('#ctez-selected-title');
    const selectedBadge = root.querySelector('#ctez-selected-badge');
    const oven = selectedOven();

    updateCtezWalletStatus(root, _ctezState.address || getStoredWalletAddress());
    if (panel) panel.dataset.state = _ctezState.loading ? 'loading' : _ctezState.error ? 'error' : _ctezState.ovens.length ? 'ready' : _ctezState.address ? 'empty' : 'idle';
    if (summaryStrip) {
        const totalBalance = sumMicroValues(_ctezState.ovens, 'tezBalance');
        const totalDebt = sumMicroValues(_ctezState.ovens, 'ctezOutstanding');
        const withdrawable = _ctezState.ovens
            .filter((item) => !hasOutstandingDebt(item))
            .reduce((total, item) => total + microBigInt(item.tezBalance), 0n)
            .toString();
        summaryStrip.innerHTML = `
            <div class="ctez-summary-title">Oven Summary</div>
            ${renderMetric('Total balance', formatMicroAmount(totalBalance, 'tez'))}
            ${renderMetric('Outstanding', formatMicroAmount(totalDebt, 'ctez'))}
            ${renderMetric('Withdrawable', formatMicroAmount(withdrawable, 'tez'))}
            ${renderMetric('Ovens found', String(_ctezState.ovens.length))}
        `;
    }

    if (_ctezState.loading) {
        if (status) status.textContent = `Checking ctez ovens for ${shortAddress(_ctezState.address)}...`;
        if (list) list.innerHTML = '<div class="ctez-oven-loading">Reading ctez contract state...</div>';
        if (actionPanel) actionPanel.hidden = true;
        updateCtezActionButtons(root);
        return;
    }

    if (_ctezState.error) {
        if (status) status.textContent = _ctezState.error;
        if (list) list.innerHTML = '';
        if (actionPanel) actionPanel.hidden = true;
        updateCtezActionButtons(root);
        return;
    }

    if (!_ctezState.address) {
        if (status) status.textContent = 'Connect a wallet to check for ctez ovens.';
        if (list) list.innerHTML = '';
        if (actionPanel) actionPanel.hidden = true;
        updateCtezActionButtons(root);
        return;
    }

    if (!_ctezState.ovens.length) {
        if (status) status.textContent = `No active ctez ovens found for ${shortAddress(_ctezState.address)}.`;
        if (list) list.innerHTML = '<div class="ctez-empty-state">No recoverable ctez oven was found for this wallet.</div>';
        if (actionPanel) actionPanel.hidden = true;
        updateCtezActionButtons(root);
        return;
    }

    if (status) {
        const count = _ctezState.ovens.length;
        status.textContent = `${count} ctez oven${count === 1 ? '' : 's'} found for ${shortAddress(_ctezState.address)}.`;
    }
    if (list) {
        list.innerHTML = _ctezState.ovens.map((item, index) => renderOvenCard(item, index)).join('');
        list.querySelectorAll('.ctez-oven-card').forEach((button) => {
            button.addEventListener('click', () => {
                _ctezState.selectedIndex = Number(button.dataset.ovenIndex || 0);
                renderCtezOvenState(root);
            });
        });
    }
    if (actionPanel) actionPanel.hidden = false;
    if (summary && oven) {
        const debt = hasOutstandingDebt(oven);
        const balance = hasRecoverableBalance(oven);
        const utilization = formatOvenUtilization(oven);
        const withdrawable = !debt && balance ? formatMicroAmount(oven.tezBalance, 'tez') : '0 tez';
        if (selectedTitle) selectedTitle.textContent = `Oven #${oven.id || _ctezState.selectedIndex + 1}`;
        if (selectedBadge) selectedBadge.textContent = debt ? 'Burn required' : balance ? 'Ready to withdraw' : 'Clear';
        summary.innerHTML = `
            <section class="ctez-detail-card ctez-detail-card-wide">
                <h4>Oven Stats</h4>
                <div class="ctez-detail-address">
                    <span>Oven address</span>
                    <strong>${escapeHtml(oven.ovenAddress || CTEZ_CONTRACT)}</strong>
                </div>
                <div class="ctez-detail-meter">
                    <div>
                        <strong>${escapeHtml(debt ? 'Debt open' : 'Clear')}</strong>
                        <span>Recovery state</span>
                    </div>
                    <div>
                        <span class="ctez-utilization-bar"><i style="width:${escapeHtml(utilization.bar)}%"></i></span>
                        <strong>${escapeHtml(utilization.label)}</strong>
                        <span>Debt utilization</span>
                    </div>
                </div>
            </section>
            <section class="ctez-detail-card">
                <h4>Collateral Overview</h4>
                ${renderMetric('Oven balance', formatMicroAmount(oven.tezBalance, 'tez'))}
                ${renderMetric('Withdrawable', withdrawable)}
            </section>
            <section class="ctez-detail-card">
                <h4>Mintable Overview</h4>
                ${renderMetric('Outstanding', formatMicroAmount(oven.ctezOutstanding, 'ctez'))}
                ${renderMetric('Required action', debt ? 'Burn first' : 'None')}
            </section>
            <section class="ctez-detail-card">
                <h4>Owner</h4>
                ${renderMetric('Wallet', shortAddress(oven.owner || _ctezState.address))}
                ${renderMetric('Last seen level', oven.lastLevel ? formatGroupedNumber(String(oven.lastLevel)) : 'unknown')}
            </section>
            <p>${debt ? 'Burn the outstanding ctez first. After it confirms, refresh this panel and withdraw the tez.' : balance ? 'This oven is ready to withdraw.' : 'This oven is already clear.'}</p>
        `;
        setWalletReview(root, debt
            ? 'Ready to request a ctez debt burn from your wallet.'
            : balance
                ? 'Ready to request a tez withdrawal from your wallet.'
                : 'No wallet request is needed for the selected oven.');
    }
    updateCtezActionButtons(root);
}

async function loadCtezOvens(root, address, { force = false } = {}) {
    const owner = String(address || '').trim();
    if (!isTezosAccountAddress(owner)) {
        _ctezState = { address: '', ovens: [], selectedIndex: 0, loading: false, error: '' };
        renderCtezOvenState(root);
        return;
    }
    if (_ctezState.loading && _ctezState.address === owner && !force) return;

    _ctezState = { address: owner, ovens: [], selectedIndex: 0, loading: true, error: '' };
    setWalletFeedback(root, '', 'neutral');
    renderCtezOvenState(root);
    try {
        const ovens = await fetchCtezOvens(owner);
        _ctezState = { address: owner, ovens, selectedIndex: 0, loading: false, error: '' };
    } catch (error) {
        _ctezState = {
            address: owner,
            ovens: [],
            selectedIndex: 0,
            loading: false,
            error: `Could not check ctez ovens: ${error?.message || error}`
        };
    }
    renderCtezOvenState(root);
}

function wireCtezWalletActions(root) {
    const connectButton = root.querySelector('#ctez-wallet-connect');
    const refreshButton = root.querySelector('#ctez-wallet-refresh');
    const burnButton = root.querySelector('#ctez-wallet-burn');
    const withdrawButton = root.querySelector('#ctez-wallet-withdraw');

    updateCtezWalletStatus(root);
    renderCtezOvenState(root);
    preloadOctezConnect();

    const prewarmWallet = () => {
        preloadOctezConnect();
    };
    connectButton?.addEventListener('pointerenter', prewarmWallet);
    connectButton?.addEventListener('focus', prewarmWallet);

    connectButton?.addEventListener('click', async () => {
        setWalletButtonsBusy(root, true);
        setWalletFeedback(root, 'Opening Octez.Connect wallet pairing...', 'pending');
        try {
            const account = await connectOctezWallet({ syncMyTezos: true });
            updateCtezWalletStatus(root, account?.address);
            setWalletFeedback(root, account?.address
                ? `Connected ${shortAddress(account.address)}. Checking ctez ovens...`
                : 'Wallet connected, but no account address was returned.',
                account?.address ? 'pending' : 'warning');
            if (account?.address) await loadCtezOvens(root, account.address, { force: true });
        } catch (error) {
            setWalletFeedback(root, `Wallet connection failed: ${error?.message || error}`, 'error');
        } finally {
            setWalletButtonsBusy(root, false);
        }
    });

    refreshButton?.addEventListener('click', async () => {
        const address = _ctezState.address || getStoredWalletAddress();
        if (!address) return;
        await loadCtezOvens(root, address, { force: true });
    });

    burnButton?.addEventListener('click', async () => {
        const oven = selectedOven();
        if (!oven || !isNatString(oven.id) || !isPositiveNatString(oven.ctezOutstanding)) {
            setWalletFeedback(root, 'No ctez debt is available to burn for the selected oven.', 'warning');
            return;
        }
        const quantity = `-${oven.ctezOutstanding}`;
        const operation = buildCtezMintOrBurnOperation(oven.id, quantity);
        setWalletReview(root, `Wallet request: burn ${formatMicroAmount(oven.ctezOutstanding, 'ctez')} from the selected ctez oven.`);
        setWalletButtonsBusy(root, true);
        setWalletFeedback(root, 'Sending burn request to your wallet for review...', 'pending');
        try {
            await requestWalletOperation([operation]);
            setWalletFeedback(root, 'Wallet accepted the burn request. Refresh after it confirms.', 'success');
        } catch (error) {
            setWalletFeedback(root, `Burn request failed: ${error?.message || error}`, 'error');
        } finally {
            setWalletButtonsBusy(root, false);
        }
    });

    withdrawButton?.addEventListener('click', async () => {
        const oven = selectedOven();
        const to = _ctezState.address || getStoredWalletAddress();
        if (!oven || !isNatString(oven.id) || !isPositiveNatString(oven.tezBalance)) {
            setWalletFeedback(root, 'No tez is available to withdraw for the selected oven.', 'warning');
            return;
        }
        if (hasOutstandingDebt(oven)) {
            setWalletFeedback(root, 'Burn the outstanding ctez before withdrawing tez.', 'warning');
            return;
        }
        if (!isTezosAccountAddress(to)) {
            setWalletFeedback(root, 'Reconnect your wallet before withdrawing tez.', 'error');
            return;
        }

        const operation = buildCtezWithdrawOperation(oven.id, oven.tezBalance, to);
        setWalletReview(root, `Wallet request: withdraw ${formatMicroAmount(oven.tezBalance, 'tez')} to ${shortAddress(to)}.`);
        setWalletButtonsBusy(root, true);
        setWalletFeedback(root, 'Sending withdraw request to your wallet for review...', 'pending');
        try {
            await requestWalletOperation([operation]);
            setWalletFeedback(root, 'Wallet accepted the withdraw request.', 'success');
        } catch (error) {
            setWalletFeedback(root, `Withdraw request failed: ${error?.message || error}`, 'error');
        } finally {
            setWalletButtonsBusy(root, false);
        }
    });

    window.addEventListener('tezos-wallet-updated', (event) => {
        const address = event.detail?.address || '';
        updateCtezWalletStatus(root, address);
        if (address && address !== _ctezState.address) {
            loadCtezOvens(root, address).catch((error) => {
                console.warn('ctez oven refresh failed', error);
            });
        }
    });

    const stored = getStoredWalletAddress();
    if (stored) {
        loadCtezOvens(root, stored).catch((error) => {
            console.warn('ctez stored wallet refresh failed', error);
        });
    }
}

function handleEscape(event) {
    if (event.key === 'Escape') closeCtezChamber();
}

function isAbortableCardTarget(target) {
    return Boolean(target?.closest?.('button, a, input, textarea, select, label, .card-info-btn, .card-tooltip'));
}

export function openCtezChamber() {
    document.getElementById('tooltip-ctez')?.classList.remove('is-open');
    let overlay = document.getElementById('ctez-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ctez-modal';
        overlay.className = 'modal-overlay chamber-overlay ctez-overlay';
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content ctez-content">
                <button class="modal-close chamber-close" aria-label="Close" style="z-index:3">&times;</button>
                <div class="chamber-body ctez-body">${renderCtezChamber()}</div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.chamber-close')?.addEventListener('click', closeCtezChamber);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeCtezChamber();
        });
        wireCtezWalletActions(overlay);
    }

    document.addEventListener('keydown', handleEscape);
    overlay.classList.add('active');
    lockPageScroll();
    const content = overlay.querySelector('.ctez-content');
    if (content) content.scrollTop = 0;
}

export function closeCtezChamber() {
    document.removeEventListener('keydown', handleEscape);
    const overlay = document.getElementById('ctez-modal');
    if (overlay) overlay.classList.remove('active');
    document.getElementById('tooltip-ctez')?.classList.remove('is-open');
    unlockPageScroll();
}

export function initCtezChamber() {
    if (document.getElementById('ctez-entry-card')) return;

    const grid = document.getElementById('chambers-grid') || document.getElementById('governance-section')?.querySelector('.stats-grid');
    if (!grid) return;

    const card = document.createElement('div');
    card.id = 'ctez-entry-card';
    card.className = 'stat-card chamber-entry-card chamber-entry-wide ctez-entry-card';
    card.innerHTML = `
        <button class="card-copy-link ctez-card-copy-link" type="button" data-copy-hash="#ctez" aria-label="Copy ctez Recovery link" title="Copy ctez recovery link">🔗</button>
        <div class="card-info-btn" data-tooltip="ctez" aria-label="Explain ctez Recovery" title="What is this?">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
            </svg>
        </div>
        <div class="card-tooltip" id="tooltip-ctez">
            <div class="tooltip-content">
                <h4>ctez Recovery</h4>
                <p>Connect the wallet that owned old ctez ovens. Tezos Systems checks the contract state and prepares the burn or withdraw wallet request.</p>
                <p>No manual contract pages or raw oven fields are required.</p>
            </div>
        </div>
        <div class="card-inner">
            <div class="card-front chamber-entry-front ctez-entry-front" role="button" tabindex="0" aria-label="Open ctez Recovery">
                <div class="ctez-entry-main">
                    <h2 class="stat-label">ctez Recovery</h2>
                    <div class="stat-value ctez-entry-value">Wallet flow</div>
                    <p class="stat-description">Find ovens, recover tez</p>
                    <div class="chamber-entry-status live">Connect to check old ovens</div>
                </div>
                <div class="chamber-entry-metrics ctez-entry-metrics" aria-label="ctez recovery checkpoints">
                    <div class="chamber-entry-metric">
                        <span>Connect</span>
                        <strong>Wallet</strong>
                    </div>
                    <div class="chamber-entry-metric">
                        <span>Detect</span>
                        <strong>Ovens</strong>
                    </div>
                    <div class="chamber-entry-metric">
                        <span>Recover</span>
                        <strong>Tez</strong>
                    </div>
                    <div class="chamber-entry-metric is-risk">
                        <span>Review</span>
                        <strong>Sign</strong>
                    </div>
                </div>
            </div>
        </div>
    `;
    card.style.cursor = 'pointer';
    card.title = 'Open ctez Recovery';

    const infoBtn = card.querySelector('.card-info-btn');
    const tooltip = card.querySelector('.card-tooltip');
    infoBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        tooltip?.classList.toggle('is-open');
    });
    tooltip?.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', (event) => {
        if (!tooltip?.classList.contains('is-open')) return;
        if (infoBtn?.contains(event.target) || tooltip.contains(event.target)) return;
        tooltip.classList.remove('is-open');
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') tooltip?.classList.remove('is-open');
    });
    card.addEventListener('click', (event) => {
        if (isAbortableCardTarget(event.target)) return;
        openCtezChamber();
    });
    card.querySelector('.ctez-entry-front')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        openCtezChamber();
    });

    grid.appendChild(card);
}
