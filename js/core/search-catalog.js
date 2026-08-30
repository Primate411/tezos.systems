import { loadDataAsset } from './data-assets.js';
import { siteMapQueryShape, siteMapScoreIndexed, siteMapSearchIndex } from './site-map.js';

let catalogRows = [];
let catalogPromise = null;
let catalogLoaded = false;

export function isSearchCatalogLoaded() {
    return catalogLoaded;
}

function warmSearchIndex(rows) {
    const build = () => {
        for (const row of rows) siteMapSearchIndex(row);
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(build, { timeout: 2000 });
    else setTimeout(build, 0);
}

export function loadSearchCatalog() {
    if (catalogLoaded) return Promise.resolve(catalogRows);
    if (!catalogPromise) {
        catalogPromise = loadDataAsset('searchCatalog')
            .then((data) => {
                catalogRows = Array.isArray(data?.rows) ? data.rows : [];
                catalogLoaded = true;
                warmSearchIndex(catalogRows);
                return catalogRows;
            })
            .catch(() => {
                catalogRows = [];
                catalogLoaded = true;
                return catalogRows;
            });
    }
    return catalogPromise;
}

export function searchFirstPartyCatalog(query, { limit = 12 } = {}) {
    const raw = String(query || '').trim();
    if (!raw || !catalogLoaded) return [];
    const shape = siteMapQueryShape(raw);
    return catalogRows
        .map((row, index) => ({ row, index, score: siteMapScoreIndexed(siteMapSearchIndex(row), shape) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, limit)
        .map(({ row, score }) => ({ ...row, searchScore: score }));
}
