/**
 * Session-level loader for first-party JSON assets. Stable lore uses normal
 * HTTP caching; mutable generated receipts revalidate. Feature modules share
 * one promise so opening several Chambers does not duplicate a request.
 */

export const DATA_ASSET_URLS = Object.freeze({
    protocolData: '/data/protocol-data.json?v=2',
    governanceVotes: '/data/governance-votes.json',
    governanceReport: '/data/governance-refresh-report.json?v=1',
    releaseRadar: '/data/release-radar.json',
    searchCatalog: '/data/search-catalog.json?v=1',
    ecosystemApps: '/data/ecosystem-apps.json?v=1',
    maxisContracts: '/data/maxis-contracts.json?v=1'
});

const DATA_ASSET_CACHE_MODES = Object.freeze({
    protocolData: 'default',
    governanceVotes: 'no-cache',
    governanceReport: 'no-cache',
    releaseRadar: 'no-cache',
    searchCatalog: 'default',
    ecosystemApps: 'default',
    maxisContracts: 'default'
});

const assetPromises = new Map();

export function loadDataAsset(name, { force = false } = {}) {
    const url = DATA_ASSET_URLS[name];
    if (!url) return Promise.reject(new Error(`Unknown data asset: ${name}`));
    if (force) assetPromises.delete(name);
    if (assetPromises.has(name)) return assetPromises.get(name);

    const request = fetch(url, { cache: force ? 'reload' : DATA_ASSET_CACHE_MODES[name] })
        .then((response) => {
            if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
            return response.json();
        })
        .catch((error) => {
            if (assetPromises.get(name) === request) assetPromises.delete(name);
            throw error;
        });
    assetPromises.set(name, request);
    return request;
}
