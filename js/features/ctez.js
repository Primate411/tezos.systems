/**
 * ctez Oven Guide Chamber
 * Manual Better Call Dev walkthrough for users withdrawing tez from old ctez ovens.
 */

import { escapeHtml } from '../core/utils.js';
import {
    connectOctezWallet,
    getStoredWalletAddress,
    requestWalletOperation,
    shortAddress
} from '../core/wallet.js';

const CTEZ_CONTRACT = 'KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2';
const CTEZ_STORAGE_URL = `https://better-call.dev/mainnet/${CTEZ_CONTRACT}/storage`;
const CTEZ_MINT_BURN_URL = `https://better-call.dev/mainnet/${CTEZ_CONTRACT}/interact/mint_or_burn`;
const CTEZ_SOURCE_URL = 'https://x.com/TezosCommons/article/2066606430384529532';
const CTEZ_REPO_URL = 'https://github.com/Tezsure/ctez';

let _savedBodyOverflow = null;
let _savedHtmlOverflow = null;

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

function decimalToMicroString(value) {
    const raw = normalizeMicroInput(value);
    if (!raw) return '';
    if (!/^\d*(?:\.\d*)?$/.test(raw) || raw === '.') return '';
    const [wholeRaw = '0', fractionalRaw = ''] = raw.split('.');
    const whole = wholeRaw || '0';
    const fractional = fractionalRaw.slice(0, 6).padEnd(6, '0');
    try {
        return (BigInt(whole) * 1000000n + BigInt(fractional || '0')).toString();
    } catch {
        return '';
    }
}

function formatGroupedNumber(value) {
    const raw = normalizeMicroInput(value);
    if (!/^\d+$/.test(raw)) return '';
    return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

function renderActionLink({ href, title, body, meta }) {
    return `
        <a class="ctez-action-card" href="${escapeHtml(href)}" target="_blank" rel="noopener">
            <span class="ctez-action-title">${escapeHtml(title)}</span>
            <span class="ctez-action-body">${escapeHtml(body)}</span>
            <span class="ctez-action-meta">${escapeHtml(meta)}</span>
        </a>
    `;
}

function renderStep({ number, title, body, items }) {
    return `
        <section class="ctez-step-card chamber-anim-fade" style="animation-delay:${120 + number * 50}ms">
            <div class="ctez-step-kicker">Step ${number}</div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(body)}</p>
            <ul class="ctez-step-list">
                ${items.map((item) => `<li>${item}</li>`).join('')}
            </ul>
        </section>
    `;
}

function renderCtezChamber() {
    return `
        <div class="chamber-header ctez-header chamber-anim-fade">
            <div class="lb-system-strip ctez-system-strip">
                <span class="lb-system-brand">Tezos.Systems</span>
                <span>ctez Oven Guide</span>
                <span>Manual exit path</span>
            </div>
            <div class="chamber-title-row">
                <h2 class="chamber-title">ctez Oven Guide</h2>
                <span class="chamber-badge ctez-badge">Better Call Dev</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">Withdraw tez from a ctez oven after the old frontend retirement</div>
                <div class="proposal-hash">Contract ${escapeHtml(CTEZ_CONTRACT)}</div>
            </div>
        </div>

        <section class="lb-explainer ctez-explainer chamber-anim-fade" style="animation-delay:80ms">
            <div>
                <span class="ctez-pill">Oven storage</span>
                <span class="ctez-pill">mint_or_burn</span>
                <span class="ctez-pill">withdraw</span>
                <span class="ctez-pill">Octez.Connect</span>
            </div>
            <h3>Find the oven, clear outstanding ctez, then withdraw the tez balance.</h3>
            <p>
                The original ctez frontend wrapped contract calls and converted human amounts to micro-units for you.
                Better Call Dev exposes the raw contract fields, so this guide keeps the unit conversions visible before you sign anything.
            </p>
        </section>

        <section class="ctez-wallet-panel chamber-anim-fade" style="animation-delay:110ms">
            <div class="ctez-wallet-header">
                <div>
                    <div class="lb-panel-title">Octez.Connect wallet actions</div>
                    <p class="ctez-tool-note">Connect a Tezos wallet, review the raw fields here, then let your wallet simulate and sign the ctez oven call.</p>
                </div>
                <div class="ctez-wallet-actions">
                    <button id="ctez-wallet-connect" class="glass-button ctez-wallet-button" type="button">Connect wallet</button>
                    <span id="ctez-wallet-status" class="ctez-wallet-status">No wallet connected</span>
                </div>
            </div>
            <div class="ctez-wallet-grid">
                <label class="ctez-converter ctez-wallet-field">
                    <span>oven id</span>
                    <input id="ctez-wallet-oven-id" inputmode="numeric" autocomplete="off" placeholder="0">
                </label>
                <label class="ctez-converter ctez-wallet-field">
                    <span>ctez_outstanding</span>
                    <input id="ctez-wallet-outstanding" inputmode="numeric" autocomplete="off" placeholder="10000000">
                </label>
                <button id="ctez-wallet-burn" class="glass-button ctez-wallet-submit" type="button">Burn outstanding ctez</button>
                <label class="ctez-converter ctez-wallet-field">
                    <span>withdraw amount, mutez</span>
                    <input id="ctez-wallet-withdraw-amount" inputmode="numeric" autocomplete="off" placeholder="10000000">
                </label>
                <label class="ctez-converter ctez-wallet-field ctez-wallet-field-wide">
                    <span>withdraw to</span>
                    <input id="ctez-wallet-withdraw-to" autocomplete="off" placeholder="tz1…">
                </label>
                <button id="ctez-wallet-withdraw" class="glass-button ctez-wallet-submit" type="button">Withdraw tez</button>
            </div>
            <div id="ctez-wallet-review" class="ctez-wallet-review">Wallet requests stay inactive until you connect and press a burn or withdraw button.</div>
            <div id="ctez-wallet-feedback" class="ctez-wallet-feedback" role="status" aria-live="polite"></div>
        </section>

        <div class="ctez-action-grid chamber-anim-fade" style="animation-delay:120ms">
            ${renderActionLink({
                href: CTEZ_STORAGE_URL,
                title: 'Open oven storage',
                body: 'Search the ovens big map with your wallet address.',
                meta: 'Better Call Dev storage'
            })}
            ${renderActionLink({
                href: CTEZ_MINT_BURN_URL,
                title: 'Open mint_or_burn',
                body: 'Burn outstanding ctez, then use withdraw.',
                meta: 'Better Call Dev interact'
            })}
            ${renderActionLink({
                href: CTEZ_SOURCE_URL,
                title: 'Read source walkthrough',
                body: 'Tezos Commons article with screenshots.',
                meta: 'X article'
            })}
            ${renderActionLink({
                href: CTEZ_REPO_URL,
                title: 'Original ctez frontend',
                body: 'Contract and old UI source for reference.',
                meta: 'GitHub'
            })}
        </div>

        <div class="ctez-guide-grid">
            ${renderStep({
                number: 1,
                title: 'Locate your oven',
                body: 'Open contract storage, expand the ovens big map, and search with the wallet address that owns the oven.',
                items: [
                    `Open <a href="${escapeHtml(CTEZ_STORAGE_URL)}" target="_blank" rel="noopener">storage</a> for <code>${escapeHtml(CTEZ_CONTRACT)}</code>.`,
                    'Record the oven id from the big-map key.',
                    'Record <code>ctez_outstanding</code> and <code>tez_balance</code> from the oven value.'
                ]
            })}
            ${renderStep({
                number: 2,
                title: 'Burn outstanding ctez',
                body: 'If ctez_outstanding is above zero, call mint_or_burn with a negative quantity.',
                items: [
                    `Open <a href="${escapeHtml(CTEZ_MINT_BURN_URL)}" target="_blank" rel="noopener">mint_or_burn</a>.`,
                    'Set <code>id</code> to the oven id.',
                    'Set <code>quantity</code> to <code>-ctez_outstanding</code>, for example <code>10000000</code> becomes <code>-10000000</code>.',
                    'Confirm your wallet holds at least that much ctez before signing.'
                ]
            })}
            ${renderStep({
                number: 3,
                title: 'Withdraw the tez',
                body: 'After outstanding ctez is cleared, use the withdraw entrypoint with the raw mutez amount.',
                items: [
                    'Select <code>withdraw</code> on the Better Call Dev interact page.',
                    'Set <code>id</code> to the oven id.',
                    'Set <code>to</code> to your wallet address.',
                    'Set <code>amount</code> to <code>tez_balance</code> in mutez. If it fails, retry with a slightly smaller amount.'
                ]
            })}
        </div>

        <section class="ctez-tool-panel chamber-anim-fade" style="animation-delay:300ms">
            <div class="lb-panel-title">Unit helpers</div>
            <div class="ctez-tool-grid">
                <label class="ctez-converter">
                    <span>tez balance</span>
                    <input id="ctez-tez-input" inputmode="decimal" autocomplete="off" placeholder="10">
                    <strong id="ctez-mutez-output">10 tez = 10,000,000 mutez</strong>
                </label>
                <label class="ctez-converter">
                    <span>ctez_outstanding</span>
                    <input id="ctez-outstanding-input" inputmode="numeric" autocomplete="off" placeholder="10000000">
                    <strong id="ctez-burn-output">Burn quantity: -10,000,000</strong>
                </label>
            </div>
            <p class="ctez-tool-note">
                Better Call Dev contract fields use raw micro-units. The retired frontend multiplied human tez/ctez amounts by 1,000,000 before sending the contract call.
            </p>
        </section>

        <section class="ctez-safety-panel chamber-anim-fade" style="animation-delay:360ms">
            <div class="lb-panel-title">Signing checklist</div>
            <ul class="ctez-step-list">
                <li>Verify the contract address before signing: <code>${escapeHtml(CTEZ_CONTRACT)}</code>.</li>
                <li>Only sign the expected <code>mint_or_burn</code> or <code>withdraw</code> call.</li>
                <li>Never share your seed phrase, private key, wallet file, or wallet password with anyone offering help.</li>
                <li>If you are unsure, ask in official Tezos community channels and ignore unsolicited direct messages.</li>
            </ul>
        </section>

        <div class="chamber-footer chamber-anim-fade" style="animation-delay:420ms">
            <a href="${escapeHtml(CTEZ_STORAGE_URL)}" target="_blank" rel="noopener">Oven storage</a>
            <span class="chamber-footer-sep">·</span>
            <a href="${escapeHtml(CTEZ_MINT_BURN_URL)}" target="_blank" rel="noopener">mint_or_burn / withdraw</a>
            <span class="chamber-footer-sep">·</span>
            <a href="${escapeHtml(CTEZ_SOURCE_URL)}" target="_blank" rel="noopener">Tezos Commons guide</a>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/ctez/" aria-label="Direct link to ctez Oven Guide">Direct: /ctez/</a>
        </div>
    `;
}

function updateUnitHelpers(root) {
    const tezInput = root.querySelector('#ctez-tez-input');
    const mutezOutput = root.querySelector('#ctez-mutez-output');
    const outstandingInput = root.querySelector('#ctez-outstanding-input');
    const burnOutput = root.querySelector('#ctez-burn-output');

    const syncTez = () => {
        const micro = decimalToMicroString(tezInput?.value || '10');
        if (!mutezOutput) return;
        mutezOutput.textContent = micro
            ? `${tezInput.value || '10'} tez = ${formatGroupedNumber(micro)} mutez`
            : 'Enter a valid tez amount';
    };

    const syncOutstanding = () => {
        const raw = normalizeMicroInput(outstandingInput?.value || '10000000');
        if (!burnOutput) return;
        burnOutput.textContent = /^\d+$/.test(raw)
            ? `Burn quantity: -${formatGroupedNumber(raw)}`
            : 'Enter the raw ctez_outstanding integer';
    };

    tezInput?.addEventListener('input', syncTez);
    outstandingInput?.addEventListener('input', syncOutstanding);
    syncTez();
    syncOutstanding();
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
    root.querySelectorAll('#ctez-wallet-connect, #ctez-wallet-burn, #ctez-wallet-withdraw').forEach((button) => {
        button.disabled = busy;
    });
}

function updateCtezWalletStatus(root, address = getStoredWalletAddress()) {
    const status = root.querySelector('#ctez-wallet-status');
    const withdrawTo = root.querySelector('#ctez-wallet-withdraw-to');
    if (status) {
        status.textContent = address ? `Wallet ${shortAddress(address)}` : 'No wallet connected';
        status.dataset.connected = address ? 'true' : 'false';
    }
    if (withdrawTo && address && !withdrawTo.value.trim()) withdrawTo.value = address;
}

function wireCtezWalletActions(root) {
    const connectButton = root.querySelector('#ctez-wallet-connect');
    const burnButton = root.querySelector('#ctez-wallet-burn');
    const withdrawButton = root.querySelector('#ctez-wallet-withdraw');
    const ovenIdInput = root.querySelector('#ctez-wallet-oven-id');
    const outstandingInput = root.querySelector('#ctez-wallet-outstanding');
    const withdrawAmountInput = root.querySelector('#ctez-wallet-withdraw-amount');
    const withdrawToInput = root.querySelector('#ctez-wallet-withdraw-to');

    updateCtezWalletStatus(root);

    connectButton?.addEventListener('click', async () => {
        setWalletButtonsBusy(root, true);
        setWalletFeedback(root, 'Opening Octez.Connect wallet pairing...', 'pending');
        try {
            const account = await connectOctezWallet({ syncMyTezos: true });
            updateCtezWalletStatus(root, account?.address);
            setWalletFeedback(root, account?.address
                ? `Connected ${shortAddress(account.address)} and synced it to My Tezos.`
                : 'Wallet connected, but no account address was returned.',
                account?.address ? 'success' : 'warning');
        } catch (error) {
            setWalletFeedback(root, `Wallet connection failed: ${error?.message || error}`, 'error');
        } finally {
            setWalletButtonsBusy(root, false);
        }
    });

    burnButton?.addEventListener('click', async () => {
        const id = normalizeMicroInput(ovenIdInput?.value);
        const outstanding = normalizeMicroInput(outstandingInput?.value);
        if (!isNatString(id)) {
            setWalletFeedback(root, 'Enter the oven id as a non-negative integer.', 'error');
            return;
        }
        if (!isPositiveNatString(outstanding)) {
            setWalletFeedback(root, 'Enter ctez_outstanding as a positive raw micro-ctez integer.', 'error');
            return;
        }

        const quantity = `-${outstanding}`;
        const operation = buildCtezMintOrBurnOperation(id, quantity);
        setWalletReview(root, `Review: mint_or_burn on ${CTEZ_CONTRACT}, id ${id}, quantity ${quantity}.`);
        setWalletButtonsBusy(root, true);
        setWalletFeedback(root, 'Sending burn request to your wallet for review...', 'pending');
        try {
            await requestWalletOperation([operation]);
            setWalletFeedback(root, 'Wallet accepted the burn operation request.', 'success');
        } catch (error) {
            setWalletFeedback(root, `Burn request failed: ${error?.message || error}`, 'error');
        } finally {
            setWalletButtonsBusy(root, false);
        }
    });

    withdrawButton?.addEventListener('click', async () => {
        const id = normalizeMicroInput(ovenIdInput?.value);
        const amount = normalizeMicroInput(withdrawAmountInput?.value);
        const to = String(withdrawToInput?.value || '').trim();
        if (!isNatString(id)) {
            setWalletFeedback(root, 'Enter the oven id as a non-negative integer.', 'error');
            return;
        }
        if (!isPositiveNatString(amount)) {
            setWalletFeedback(root, 'Enter the withdraw amount as a positive raw mutez integer.', 'error');
            return;
        }
        if (!isTezosAccountAddress(to)) {
            setWalletFeedback(root, 'Enter a tz1/tz2/tz3/tz4 recipient address for withdraw to.', 'error');
            return;
        }

        const operation = buildCtezWithdrawOperation(id, amount, to);
        setWalletReview(root, `Review: withdraw on ${CTEZ_CONTRACT}, id ${id}, amount ${amount} mutez, to ${shortAddress(to)}.`);
        setWalletButtonsBusy(root, true);
        setWalletFeedback(root, 'Sending withdraw request to your wallet for review...', 'pending');
        try {
            await requestWalletOperation([operation]);
            setWalletFeedback(root, 'Wallet accepted the withdraw operation request.', 'success');
        } catch (error) {
            setWalletFeedback(root, `Withdraw request failed: ${error?.message || error}`, 'error');
        } finally {
            setWalletButtonsBusy(root, false);
        }
    });

    window.addEventListener('tezos-wallet-updated', (event) => {
        updateCtezWalletStatus(root, event.detail?.address || '');
    });
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
        updateUnitHelpers(overlay);
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
        <button class="card-copy-link ctez-card-copy-link" type="button" data-copy-hash="#ctez" aria-label="Copy ctez Oven Guide link" title="Copy ctez guide link">🔗</button>
        <div class="card-info-btn" data-tooltip="ctez" aria-label="Explain ctez Oven Guide" title="What is this?">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
            </svg>
        </div>
        <div class="card-tooltip" id="tooltip-ctez">
            <div class="tooltip-content">
                <h4>ctez Oven Guide</h4>
                <p>A manual Better Call Dev walkthrough for finding a ctez oven, burning outstanding ctez, and withdrawing the tez balance.</p>
                <p>No wallet is connected here. The chamber links out to the verified contract pages and keeps the raw unit math visible.</p>
                <a href="${escapeHtml(CTEZ_SOURCE_URL)}" target="_blank" rel="noopener">Source guide</a>
            </div>
        </div>
        <div class="card-inner">
            <div class="card-front chamber-entry-front ctez-entry-front" role="button" tabindex="0" aria-label="Open ctez Oven Guide">
                <div class="ctez-entry-main">
                    <h2 class="stat-label">ctez Oven Guide</h2>
                    <div class="stat-value ctez-entry-value">Exit path</div>
                    <p class="stat-description">Burn debt, withdraw tez</p>
                    <div class="chamber-entry-status live">Manual Better Call Dev flow</div>
                </div>
                <div class="chamber-entry-metrics ctez-entry-metrics" aria-label="ctez guide checkpoints">
                    <div class="chamber-entry-metric">
                        <span>Find</span>
                        <strong>Oven ID</strong>
                    </div>
                    <div class="chamber-entry-metric">
                        <span>Burn</span>
                        <strong>-ctez</strong>
                    </div>
                    <div class="chamber-entry-metric">
                        <span>Withdraw</span>
                        <strong>mutez</strong>
                    </div>
                    <div class="chamber-entry-metric is-risk">
                        <span>Safety</span>
                        <strong>Verify</strong>
                    </div>
                </div>
            </div>
        </div>
    `;
    card.style.cursor = 'pointer';
    card.title = 'Open ctez Oven Guide';

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
