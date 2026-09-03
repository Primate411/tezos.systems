/** Lossless browser projection; the public expanded archive remains schema 1.2.0. */
export const TEZOSCRP_EXPANDED_SCHEMA = '1.2.0';
export const TEZOSCRP_COMPACT_SCHEMA = '2.0.0';

function assert(condition, message) {
    if (!condition) throw new Error(`TezosCRP archive: ${message}`);
}

function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!object(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}

function validateSource(source) {
    assert(object(source) && typeof source.type === 'string' && typeof source.url === 'string', 'invalid source record');
    assert(/^https:\/\//.test(source.url), 'source URL must use HTTPS');
}

function expanded(dataset) {
    assert(object(dataset) && dataset.schema_version === TEZOSCRP_EXPANDED_SCHEMA, 'unsupported expanded schema');
    assert(!Object.hasOwn(dataset, 'award_dictionaries'), 'expanded schema cannot carry compact dictionaries');
    assert(Array.isArray(dataset.awards) && Array.isArray(dataset.people_summary), 'missing award or identity rows');
    for (const award of dataset.awards) {
        assert(object(award) && typeof award.category_raw === 'string' && Array.isArray(award.sources) && award.sources.length, 'invalid expanded award');
        assert(!Object.hasOwn(award, 'category_raw_id') && !Object.hasOwn(award, 'source_ids'), 'mixed award encodings');
        award.sources.forEach(validateSource);
    }
    return dataset;
}

export function encodeTezosCrpDataset(dataset) {
    expanded(dataset);
    const categories = [], sources = [], categoryIds = new Map(), sourceIds = new Map();
    const intern = (value, key, rows, ids) => {
        if (!ids.has(key)) { ids.set(key, rows.length); rows.push(value); }
        return ids.get(key);
    };
    const awards = dataset.awards.map(award => {
        const { category_raw, sources: awardSources, ...rest } = award;
        return {
            ...rest,
            category_raw_id: intern(category_raw, category_raw, categories, categoryIds),
            source_ids: awardSources.map(source => intern(source, JSON.stringify(stable(source)), sources, sourceIds))
        };
    });
    return { ...dataset, schema_version: TEZOSCRP_COMPACT_SCHEMA, award_dictionaries: { category_raw: categories, sources }, awards };
}

export function decodeTezosCrpDataset(dataset) {
    if (dataset?.schema_version === TEZOSCRP_EXPANDED_SCHEMA) return expanded(dataset);
    assert(object(dataset) && dataset.schema_version === TEZOSCRP_COMPACT_SCHEMA, 'unsupported compact schema');
    assert(Array.isArray(dataset.awards) && Array.isArray(dataset.people_summary), 'missing award or identity rows');
    const { award_dictionaries: dictionaries, ...rest } = dataset;
    assert(object(dictionaries) && Array.isArray(dictionaries.category_raw) && Array.isArray(dictionaries.sources), 'missing dictionaries');
    assert(dictionaries.category_raw.every(value => typeof value === 'string'), 'invalid category dictionary');
    dictionaries.sources.forEach(validateSource);
    // Share immutable source objects and source lists across awards. Never merge
    // by URL alone: type, publication clock, and every other receipt field matter.
    const sources = dictionaries.sources.map(source => freeze(structuredClone(source)));
    const lists = new Map();
    const resolve = (table, id) => {
        assert(Number.isSafeInteger(id) && id >= 0 && id < table.length, 'invalid dictionary reference');
        return table[id];
    };
    const awards = dataset.awards.map(award => {
        assert(object(award) && !Object.hasOwn(award, 'sources') && !Object.hasOwn(award, 'category_raw'), 'mixed award encodings');
        const { category_raw_id, source_ids, ...row } = award;
        const category_raw = resolve(dictionaries.category_raw, category_raw_id);
        assert(Array.isArray(source_ids) && source_ids.length, 'missing source references');
        // Resolve before looking up the list so coercible or sparse IDs cannot
        // borrow a previously validated list (e.g. null versus zero).
        const resolved = source_ids.map(id => resolve(sources, id));
        const key = JSON.stringify(source_ids);
        if (!lists.has(key)) lists.set(key, Object.freeze(resolved));
        return { ...row, category_raw, sources: lists.get(key) };
    });
    return { ...rest, schema_version: TEZOSCRP_EXPANDED_SCHEMA, awards };
}
