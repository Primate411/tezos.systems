const STORY_ORDER = Object.freeze([
    'art',
    'defi',
    'gaming',
    'bridge',
    'etherlink',
    'stake',
    'unstake',
    'transfers'
]);

const STORY_LABELS = Object.freeze({
    art: 'Art',
    defi: 'DeFi',
    gaming: 'Gaming',
    bridge: 'Bridge',
    etherlink: 'Etherlink',
    stake: 'Stake',
    unstake: 'Unstake',
    transfers: 'Transfers'
});

const CATALOG_CATEGORY_TO_STORY = Object.freeze({
    nft: 'art',
    defi: 'defi',
    gaming: 'gaming',
    bridge: 'bridge'
});

const TEZOS_ADDRESS_RE = /\b(KT1[1-9A-HJ-NP-Za-km-z]{33}|sr1[1-9A-HJ-NP-Za-km-z]{33})\b/g;

function compilePattern(pattern) {
    try {
        return new RegExp(pattern, 'i');
    } catch {
        return null;
    }
}

function addressesFromValues(values) {
    const addresses = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        for (const match of String(value || '').matchAll(TEZOS_ADDRESS_RE)) addresses.add(match[1]);
    }
    return addresses;
}

function addRule(target, { category, aliases = [], addresses = [] }) {
    const story = CATALOG_CATEGORY_TO_STORY[String(category || '').toLowerCase()];
    if (!story) return;
    const patterns = aliases.map(compilePattern).filter(Boolean);
    const addressSet = new Set(addresses);
    if (!patterns.length && !addressSet.size) return;
    target.push(Object.freeze({ story, patterns: Object.freeze(patterns), addresses: addressSet }));
}

export function compileBlockStoryCatalog(ecosystemArtifact = {}, maxisArtifact = {}) {
    const rules = [];
    for (const app of Array.isArray(ecosystemArtifact?.apps) ? ecosystemArtifact.apps : []) {
        for (const layer of Array.isArray(app?.layers) ? app.layers : []) {
            if (layer?.id !== 'tezos') continue;
            const source = layer?.contractSource || {};
            const explicitValues = [
                ...(Array.isArray(layer?.proofUrls) ? layer.proofUrls : []),
                ...(Array.isArray(source?.addresses) ? source.addresses : []),
                ...(Array.isArray(source?.contracts) ? source.contracts : [])
            ];
            addRule(rules, {
                category: app.category,
                aliases: Array.isArray(source.aliasPatterns) ? source.aliasPatterns : [],
                addresses: addressesFromValues(explicitValues)
            });
        }
    }
    for (const app of Array.isArray(maxisArtifact?.apps) ? maxisArtifact.apps : []) {
        addRule(rules, {
            category: app.category,
            aliases: Array.isArray(app.aliasPatterns) ? app.aliasPatterns : [],
            addresses: addressesFromValues(app.addresses)
        });
    }
    return Object.freeze(rules);
}

function targetIdentity(transaction) {
    const target = transaction?.target;
    if (typeof target === 'string') return { address: target, alias: '' };
    return {
        address: String(target?.address || ''),
        alias: String(target?.alias || '')
    };
}

function catalogStoryFor(transaction, catalog) {
    const { address, alias } = targetIdentity(transaction);
    if (address.startsWith('sr1')) return 'etherlink';
    for (const rule of Array.isArray(catalog) ? catalog : []) {
        if (rule.addresses?.has(address) || rule.patterns?.some((pattern) => pattern.test(alias))) return rule.story;
    }
    return '';
}

function formatTez(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return '';
    return amount.toLocaleString('en-US', {
        maximumFractionDigits: amount >= 100 ? 0 : amount >= 1 ? 2 : 3
    });
}

function fragmentFor(key, receipt, clipped) {
    const label = STORY_LABELS[key];
    const suffix = clipped ? '+' : '';
    if ((key === 'stake' || key === 'unstake') && receipt.amountMutez > 0) {
        const amount = formatTez(receipt.amountMutez / 1e6);
        return { key, label, value: receipt.amountMutez / 1e6, text: `${label} ${amount}${suffix} ꜩ`, clipped };
    }
    return { key, label, value: receipt.count, text: `${label} · ${receipt.count.toLocaleString('en-US')}${suffix}`, clipped };
}

export function classifyBlockStory({
    transactions = null,
    stakingRows = null,
    catalog = [],
    transactionsClipped = false,
    stakingClipped = false,
    maxFragments = 3
} = {}) {
    const receipts = new Map(STORY_ORDER.map((key) => [key, { count: 0, amountMutez: 0 }]));

    for (const transaction of Array.isArray(transactions) ? transactions : []) {
        if (transaction?.internal === true) continue;
        const catalogStory = catalogStoryFor(transaction, catalog);
        if (catalogStory) {
            receipts.get(catalogStory).count += 1;
            continue;
        }
        if (Number(transaction?.amount) > 0) receipts.get('transfers').count += 1;
    }

    for (const row of Array.isArray(stakingRows) ? stakingRows : []) {
        const key = String(row?.action || '').toLowerCase();
        if (key !== 'stake' && key !== 'unstake') continue;
        const receipt = receipts.get(key);
        receipt.count += 1;
        const amount = Number(row?.amount);
        if (Number.isFinite(amount) && amount > 0) receipt.amountMutez += amount;
    }

    const fragments = STORY_ORDER
        .filter((key) => receipts.get(key).count > 0)
        .slice(0, Math.max(1, Number(maxFragments) || 3))
        .map((key) => fragmentFor(
            key,
            receipts.get(key),
            key === 'stake' || key === 'unstake' ? stakingClipped : transactionsClipped
        ));

    if (!fragments.length) {
        return Object.freeze({
            quiet: true,
            fragments: Object.freeze([{ key: 'quiet', label: 'Quiet', value: 0, text: 'Quiet', clipped: false }]),
            text: 'Quiet',
            signature: 'quiet',
            clipped: Boolean(transactionsClipped || stakingClipped)
        });
    }

    return Object.freeze({
        quiet: false,
        fragments: Object.freeze(fragments.map(Object.freeze)),
        text: fragments.map((fragment) => fragment.text).join(' · '),
        signature: fragments.map((fragment) => `${fragment.key}:${fragment.value}:${fragment.clipped ? 1 : 0}`).join('|'),
        clipped: fragments.some((fragment) => fragment.clipped)
    });
}

export const BLOCK_STORY_ORDER = STORY_ORDER;
