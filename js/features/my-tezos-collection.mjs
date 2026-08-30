/**
 * My Tezos Collection — summary-first Objkt holdings for included L1 accounts.
 */

import {
    getAllMyTezosRecords,
    getMyTezosMeta,
    initMyTezosDb,
    putMyTezosRecords,
    replaceMyTezosAccountRecords,
    setMyTezosMeta
} from '../core/my-tezos-db.mjs';
import { createActivity, myTezosAccountKey } from '../core/my-tezos-models.mjs';
import {
    MY_TEZOS_COLLECTION_PAGE_SIZE,
    fetchObjktCollectionPage
} from '../core/objkt-client.mjs';
import { quietlyMutate, quietlySyncHtml } from '../core/quiet-refresh.js';
import { escapeHtml, formatFreshnessStamp } from '../core/utils.js';
import { readSavedMyTezosEntries, shortAddress } from '../core/wallet.js';
import { collectionSummary } from './my-tezos-collection-model.mjs';
import { readScopedMyTezosEntries } from './my-tezos-scope.mjs';

let initialized = false;
let refreshInFlight = null;
let generation = 0;
let collectionMode = 'collected';
let showSpam = false;
let nextOffset = 0;
let complete = true;
let currentRecords = [];
let currentProfiles = [];
let refreshController = null;
let collectionSyncId = '';
let renderedAssetLimit = MY_TEZOS_COLLECTION_PAGE_SIZE;
let renderedAssetSignature = '';

function includedEntries() {
    return readSavedMyTezosEntries().filter((entry) => entry.included !== false);
}

function selectedEntries() {
    return readScopedMyTezosEntries();
}

function isVisible() {
    return document.visibilityState === 'visible'
        && document.getElementById('my-tezos-panel-collection')?.hidden === false
        && document.getElementById('my-tezos-drawer')?.classList.contains('open') === true;
}

function collectionMediaCandidates(asset) {
    const rawUri = String(asset?.thumbnail || '');
    const options = {
        contract: asset?.contract,
        tokenId: asset?.tokenId,
        variant: 'thumb400'
    };
    const sharedCandidates = globalThis.HenMode?.mediaCandidates?.(rawUri, options);
    if (Array.isArray(sharedCandidates) && sharedCandidates.length) return sharedCandidates;
    const candidates = [
        asset?.contract && asset?.tokenId
            ? `https://assets.objkt.media/file/assets-003/${encodeURIComponent(asset.contract)}/${encodeURIComponent(asset.tokenId)}/thumb400`
            : '',
        ...(rawUri.startsWith('ipfs://')
            ? [
                `https://dweb.link/ipfs/${rawUri.slice(7)}`,
                `https://nftstorage.link/ipfs/${rawUri.slice(7)}`,
                `https://gateway.pinata.cloud/ipfs/${rawUri.slice(7)}`,
                `https://ipfs.io/ipfs/${rawUri.slice(7)}`
            ]
            : [rawUri])
    ];
    return candidates.filter((candidate, index) => candidate && candidates.indexOf(candidate) === index);
}

function wireCollectionImages(grid) {
    grid.querySelectorAll('img[data-collection-media]').forEach((image) => {
        if (image.dataset.collectionMediaWired === 'true') return;
        image.dataset.collectionMediaWired = 'true';
        const candidates = collectionMediaCandidates({
            thumbnail: image.dataset.collectionMedia || '',
            contract: image.dataset.collectionContract || '',
            tokenId: image.dataset.collectionTokenId || ''
        });
        let candidateIndex = Math.max(0, candidates.indexOf(image.currentSrc || image.src));
        image.addEventListener('load', () => {
            image.closest('.collection-asset-media')?.classList.add('loaded');
        });
        image.addEventListener('error', () => {
            candidateIndex += 1;
            if (candidateIndex < candidates.length) {
                image.src = candidates[candidateIndex];
                return;
            }
            image.replaceWith(Object.assign(document.createElement('span'), {
                textContent: 'Image unavailable',
                className: 'collection-image-fallback'
            }));
        });
    });
}

function setStatus(message, state = '') {
    const status = document.getElementById('collection-status');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
}

function renderProfiles() {
    const target = document.getElementById('collection-profiles');
    if (!target) return;
    const scopeAddresses = new Set(selectedEntries().map((entry) => entry.address));
    const profiles = currentProfiles.filter((profile) => scopeAddresses.has(profile.address));
    const relevantRecords = currentRecords.filter((record) => scopeAddresses.has(record.ownerAddress));
    if (!profiles.length) {
        quietlySyncHtml(target, '<span>Objkt collector and creator profiles appear when the selected addresses have public profile data.</span>');
        return;
    }
    quietlySyncHtml(target, profiles.map((profile) => {
        const collectedLoaded = relevantRecords.filter((record) => (
            record.ownerAddress === profile.address && record.kind === 'collected'
        )).length;
        const createdLoaded = relevantRecords.filter((record) => (
            record.ownerAddress === profile.address && record.kind === 'created'
        )).length;
        return `
            <article>
                <strong>${escapeHtml(profile.alias || shortAddress(profile.address))}</strong>
                <span>${escapeHtml(profile.description || 'Collector / creator profile')}</span>
                <small>${collectedLoaded.toLocaleString()} collected loaded · ${createdLoaded.toLocaleString()} created loaded</small>
            </article>
        `;
    }).join(''));
}

function renderCollection() {
    const scopeAddresses = new Set(selectedEntries().map((entry) => entry.address));
    const relevant = currentRecords.filter((record) => (
        scopeAddresses.has(record.ownerAddress)
        && (showSpam || !record.spam)
    ));
    const summary = collectionSummary(relevant);
    const summaryTarget = document.getElementById('collection-summary');
    if (summaryTarget) {
        const values = {
            assets: summary.assets,
            editions: summary.editions,
            collections: summary.collections,
            artists: summary.artists,
            created: summary.createdAssets
        };
        Object.entries(values).forEach(([key, value]) => {
            const cell = summaryTarget.querySelector(`[data-collection-total="${key}"] strong`);
            if (cell) cell.textContent = String(value);
        });
    }
    const spamButton = document.getElementById('collection-spam-toggle');
    if (spamButton) {
        const hiddenSpam = currentRecords.filter((record) => record.spam).length;
        spamButton.textContent = showSpam ? 'Hide flagged' : `Flagged ${hiddenSpam}`;
        spamButton.setAttribute('aria-pressed', String(showSpam));
        spamButton.hidden = hiddenSpam === 0;
    }
    renderProfiles();

    const grid = document.getElementById('collection-grid');
    const empty = document.getElementById('collection-empty');
    if (!grid || !empty) return;
    const allAssets = summary.holdings.filter((record) => record.kind === collectionMode && (showSpam || !record.spam));
    const assets = allAssets.slice(0, renderedAssetLimit);
    empty.hidden = allAssets.length > 0;
    if (!allAssets.length) {
        quietlySyncHtml(grid, '');
        renderedAssetSignature = '';
        empty.textContent = includedEntries().length
            ? collectionMode === 'created'
                ? 'No created assets are available in the loaded Objkt coverage.'
                : 'No collected assets are available in the loaded Objkt coverage.'
            : 'Include an L1 address in Portfolio to load its collection.';
    } else {
        const signature = `${collectionMode}:${showSpam}:${assets.map((asset) => asset.id).join('|')}`;
        if (signature !== renderedAssetSignature) {
            quietlySyncHtml(grid, assets.map((asset) => {
            const mediaCandidates = collectionMediaCandidates(asset);
            const image = mediaCandidates[0] || '';
            const ownerCount = asset.ownerAddresses?.length || 1;
            const ownerCopy = ownerCount > 1 ? `${ownerCount} included wallets` : shortAddress(asset.ownerAddresses?.[0] || asset.ownerAddress);
            return `
                <article class="collection-asset-card${asset.spam ? ' flagged' : ''}" data-quiet-key="${escapeHtml(asset.id)}" data-collection-asset="${escapeHtml(`${asset.contract}:${asset.tokenId}`)}">
                    <div class="collection-asset-media">
                        ${image
                            ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(asset.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-collection-media="${escapeHtml(asset.thumbnail)}" data-collection-contract="${escapeHtml(asset.contract)}" data-collection-token-id="${escapeHtml(asset.tokenId)}">`
                            : '<span aria-hidden="true">◫</span>'}
                    </div>
                    <div>
                        <strong>${escapeHtml(asset.name)}</strong>
                        <span>${escapeHtml(asset.collection?.name || 'Unknown collection')}</span>
                        <small>${Number(asset.quantity).toLocaleString()} edition${Number(asset.quantity) === 1 ? '' : 's'} · ${escapeHtml(ownerCopy)}</small>
                        ${asset.activeAskMutez > 0 ? `<small>Active ask reference · ${(asset.activeAskMutez / 1e6).toLocaleString()} ꜩ · not a portfolio value</small>` : ''}
                        ${asset.spam ? '<small>Flagged metadata · hidden by default</small>' : ''}
                    </div>
                    <a href="https://objkt.com/tokens/${encodeURIComponent(asset.contract)}/${encodeURIComponent(asset.tokenId)}" target="_blank" rel="noopener" aria-label="Open asset on Objkt">↗</a>
                </article>
            `;
            }).join(''));
            renderedAssetSignature = signature;
            wireCollectionImages(grid);
        }
    }
    const loadMore = document.getElementById('collection-load-more');
    if (loadMore) {
        const remaining = Math.max(0, allAssets.length - assets.length);
        loadMore.hidden = !complete || remaining === 0;
        loadMore.disabled = false;
        loadMore.textContent = remaining
            ? `Show ${Math.min(MY_TEZOS_COLLECTION_PAGE_SIZE, remaining).toLocaleString()} more`
            : 'Show more';
    }
}

function reconcileCollectionRender({ background = false, message, state }) {
    const render = () => {
        renderCollection();
        setStatus(message, state);
    };
    const panel = background ? document.getElementById('my-tezos-panel-collection') : null;
    if (panel) quietlyMutate(panel, render);
    else render();
}

async function readCachedRecords(entries) {
    const records = [];
    for (const entry of entries) {
        records.push(...await getAllMyTezosRecords('holdings', {
            index: 'accountKey',
            query: IDBKeyRange.only(myTezosAccountKey('l1', entry.address)),
            limit: 20_000
        }));
    }
    return records.filter((record) => record.layer === 'l1');
}

async function persistCollectionPage(entries, result, offset) {
    const syncId = collectionSyncId || `objkt:${Date.now()}`;
    const holdings = result.holdings.map((holding) => ({
        ...holding,
        syncId,
        sourceReceipt: result.receipt
    }));
    if (offset === 0 && result.complete) {
        for (const entry of entries) {
            await replaceMyTezosAccountRecords(
                'holdings',
                myTezosAccountKey('l1', entry.address),
                holdings.filter((holding) => holding.ownerAddress === entry.address)
            );
        }
    } else {
        await putMyTezosRecords('holdings', holdings);
        if (result.complete) {
            for (const entry of entries) {
                const accountKey = myTezosAccountKey('l1', entry.address);
                const records = await getAllMyTezosRecords('holdings', {
                    index: 'accountKey',
                    query: IDBKeyRange.only(accountKey),
                    limit: 20_000
                });
                await replaceMyTezosAccountRecords(
                    'holdings',
                    accountKey,
                    records.filter((holding) => holding.syncId === syncId)
                );
            }
        }
    }
    const existingProfiles = (await getMyTezosMeta('collection-profiles')) || [];
    const profilesByAddress = new Map(existingProfiles.map((profile) => [profile.address, profile]));
    result.profiles.forEach((profile) => profilesByAddress.set(profile.address, profile));
    await setMyTezosMeta('collection-profiles', [...profilesByAddress.values()]);
    const holdingActivities = holdings
        .filter((holding) => holding.kind === 'collected' && holding.lastChangedAt)
        .map((holding) => createActivity({
            id: `objkt-holding:${holding.ownerAddress}:${holding.contract}:${holding.tokenId}:${holding.lastChangedAt}`,
            accountKey: myTezosAccountKey('l1', holding.ownerAddress),
            layer: 'l1',
            kind: 'nft-unknown',
            direction: 'neutral',
            timestamp: holding.lastChangedAt,
            groupKey: `objkt:${holding.contract}:${holding.tokenId}:${holding.lastChangedAt}`,
            status: 'indexed',
            asset: {
                type: 'nft',
                symbol: holding.name,
                contract: holding.contract,
                tokenId: holding.tokenId,
                decimals: 0
            },
            confidence: 'unknown',
            summary: `NFT holding changed · ${holding.name}`,
            sourceReceipts: result.receipt ? [result.receipt] : []
        }));
    await putMyTezosRecords('activityByAccount', holdingActivities);
    await putMyTezosRecords('syncState', {
        id: `objkt:collection:${entries.map((entry) => entry.address).sort().join(',')}`,
        adapter: 'objkt',
        accountKey: 'aggregate:l1',
        stream: 'collection',
        cursor: result.nextOffset,
        complete: result.complete,
        updatedAt: Date.now(),
        error: null,
        receipt: result.receipt,
        syncId
    });
}

export async function refreshMyTezosCollection({ force = false, background = false } = {}) {
    if (!isVisible()) return null;
    if (refreshInFlight && !force) return refreshInFlight;
    if (refreshInFlight && force) refreshController?.abort();
    const entries = selectedEntries();
    const requestGeneration = ++generation;
    if (!entries.length) {
        currentRecords = [];
        currentProfiles = [];
        renderCollection();
        setStatus('No included L1 addresses.', 'empty');
        return null;
    }
    const previous = {
        records: currentRecords,
        profiles: currentProfiles,
        complete,
        nextOffset
    };
    collectionSyncId = `objkt:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    if (!background) renderedAssetLimit = MY_TEZOS_COLLECTION_PAGE_SIZE;
    setStatus(
        background
            ? 'Checking Objkt quietly for collection changes…'
            : 'Reading Objkt holdings and completing collection coverage…',
        'loading'
    );
    const controller = new AbortController();
    refreshController = controller;
    const pending = (async () => {
        try {
            let offset = 0;
            let pageCount = 0;
            let loadedRows = 0;
            let saved = true;
            let latestResult = null;
            let scanComplete = false;
            let scanNextOffset = 0;
            const backgroundHoldings = [];
            const backgroundProfiles = new Map(currentProfiles.map((profile) => [profile.address, profile]));
            do {
                const result = await fetchObjktCollectionPage(entries.map((entry) => entry.address), {
                    offset,
                    limit: MY_TEZOS_COLLECTION_PAGE_SIZE,
                    signal: controller.signal
                });
                latestResult = result;
                pageCount += 1;
                loadedRows += result.holdings.length;
                if (requestGeneration !== generation || !isVisible()) return null;
                if (background) {
                    backgroundHoldings.push(...result.holdings);
                    result.profiles.forEach((profile) => backgroundProfiles.set(profile.address, profile));
                } else {
                    try {
                        await persistCollectionPage(entries, result, offset);
                        currentRecords = (await readCachedRecords(selectedEntries()))
                            .filter((holding) => holding.syncId === collectionSyncId);
                        currentProfiles = (await getMyTezosMeta('collection-profiles')) || [];
                    } catch {
                        saved = false;
                        const incomingIds = new Set(result.holdings.map((holding) => holding.id));
                        currentRecords = offset === 0
                            ? result.holdings
                            : [...currentRecords.filter((holding) => !incomingIds.has(holding.id)), ...result.holdings];
                        const profilesByAddress = new Map(currentProfiles.map((profile) => [profile.address, profile]));
                        result.profiles.forEach((profile) => profilesByAddress.set(profile.address, profile));
                        currentProfiles = [...profilesByAddress.values()];
                    }
                }
                scanNextOffset = result.nextOffset || 0;
                scanComplete = result.complete;
                if (background && scanComplete) {
                    const completeResult = {
                        ...result,
                        holdings: backgroundHoldings,
                        profiles: [...backgroundProfiles.values()],
                        nextOffset: null,
                        complete: true
                    };
                    try {
                        await persistCollectionPage(entries, completeResult, 0);
                        currentRecords = (await readCachedRecords(selectedEntries()))
                            .filter((holding) => holding.syncId === collectionSyncId);
                        currentProfiles = (await getMyTezosMeta('collection-profiles')) || [];
                    } catch {
                        saved = false;
                        currentRecords = backgroundHoldings.map((holding) => ({
                            ...holding,
                            syncId: collectionSyncId,
                            sourceReceipt: result.receipt
                        }));
                        currentProfiles = [...backgroundProfiles.values()];
                    }
                }
                if (!background || scanComplete) {
                    nextOffset = scanNextOffset;
                    complete = scanComplete;
                    const summary = collectionSummary(currentRecords.filter((record) => showSpam || !record.spam));
                    reconcileCollectionRender({
                        background,
                        message: scanComplete
                            ? `Complete Objkt coverage · ${summary.assets.toLocaleString()} collected assets · ${summary.createdAssets.toLocaleString()} created · ${saved ? 'saved on this device' : 'temporary view; storage unavailable'} · ${formatFreshnessStamp(new Date(), { source: 'Objkt' })}`
                            : `Syncing complete Objkt coverage · ${summary.assets.toLocaleString()} collected assets loaded across ${pageCount.toLocaleString()} page${pageCount === 1 ? '' : 's'}…`,
                        state: saved ? (scanComplete ? 'complete' : 'partial') : 'error'
                    });
                }
                offset = scanNextOffset;
            } while (!scanComplete && offset > 0 && requestGeneration === generation && isVisible());
            return latestResult ? { ...latestResult, loadedRows, pageCount, complete: scanComplete } : null;
        } catch (error) {
            if (previous.records.length) {
                currentRecords = previous.records;
                currentProfiles = previous.profiles;
                complete = previous.complete;
                nextOffset = previous.nextOffset;
            }
            reconcileCollectionRender({
                background,
                message: `${error.message || 'Objkt unavailable'} · showing last saved holdings`,
                state: 'error'
            });
            return null;
        } finally {
            if (refreshInFlight === pending) {
                refreshInFlight = null;
                refreshController = null;
            }
            const loadButton = document.getElementById('collection-load-more');
            if (loadButton) loadButton.disabled = false;
        }
    })();
    refreshInFlight = pending;
    return pending;
}

function wireCollectionControls() {
    document.querySelectorAll('[data-collection-mode]').forEach((button) => {
        button.addEventListener('click', () => {
            collectionMode = button.dataset.collectionMode === 'created' ? 'created' : 'collected';
            renderedAssetLimit = MY_TEZOS_COLLECTION_PAGE_SIZE;
            renderedAssetSignature = '';
            document.querySelectorAll('[data-collection-mode]').forEach((candidate) => {
                const active = candidate === button;
                candidate.classList.toggle('active', active);
                candidate.setAttribute('aria-pressed', String(active));
            });
            renderCollection();
        });
    });
    document.getElementById('collection-spam-toggle')?.addEventListener('click', () => {
        showSpam = !showSpam;
        renderedAssetLimit = MY_TEZOS_COLLECTION_PAGE_SIZE;
        renderedAssetSignature = '';
        renderCollection();
    });
    document.getElementById('collection-load-more')?.addEventListener('click', (event) => {
        renderedAssetLimit += MY_TEZOS_COLLECTION_PAGE_SIZE;
        renderedAssetSignature = '';
        renderCollection();
    });
}

export async function activateMyTezosCollection({ force = false } = {}) {
    if (!initialized) {
        initialized = true;
        wireCollectionControls();
        window.addEventListener('my-tezos-portfolio-changed', () => {
            generation += 1;
            if (isVisible()) activateMyTezosCollection({ force: true }).catch(() => {});
        });
        window.addEventListener('my-tezos-scope-changed', () => {
            generation += 1;
            nextOffset = 0;
            complete = true;
            renderedAssetLimit = MY_TEZOS_COLLECTION_PAGE_SIZE;
            renderedAssetSignature = '';
            if (isVisible()) activateMyTezosCollection({ force: true }).catch(() => {});
        });
    }
    try {
        await initMyTezosDb();
        currentRecords = await readCachedRecords(selectedEntries());
        currentProfiles = (await getMyTezosMeta('collection-profiles')) || [];
        renderCollection();
        if (force || !currentRecords.length) return refreshMyTezosCollection({ force });
        setStatus('Saved holdings shown · checking Objkt quietly…', 'cached');
        setTimeout(() => refreshMyTezosCollection().catch(() => {}), 150);
    } catch (error) {
        setStatus('Collection cannot be saved on this device; loading a temporary view.', 'error');
        return refreshMyTezosCollection();
    }
    return null;
}

export function destroyMyTezosCollectionForTests() {
    generation += 1;
    refreshController?.abort();
    refreshController = null;
    refreshInFlight = null;
    initialized = false;
    currentRecords = [];
    currentProfiles = [];
    renderedAssetLimit = MY_TEZOS_COLLECTION_PAGE_SIZE;
    renderedAssetSignature = '';
}
