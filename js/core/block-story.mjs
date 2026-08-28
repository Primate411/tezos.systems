const STORY_ORDER = Object.freeze([
    'l1-vote',
    'l2-vote',
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
    'l1-vote': 'L1 vote',
    'l2-vote': 'L2 vote',
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

function compactParty(account) {
    const alias = String(account?.alias || '').trim();
    if (alias) return alias;
    const address = typeof account === 'string'
        ? account.trim()
        : String(account?.address || '').trim();
    if (!address) return '';
    return address.length > 16 ? `${address.slice(0, 7)}…${address.slice(-5)}` : address;
}

function cleanArtworkName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 96);
}

function progressiveArtworkDetails(compact, titles) {
    const visibleTitles = titles.slice(0, 8);
    return visibleTitles.map((_, index) => {
        const shown = visibleTitles.slice(0, index + 1);
        const remaining = titles.length - shown.length;
        return `${compact} · ${shown.join(' · ')}${remaining > 0 ? ` · +${remaining}` : ''}`;
    });
}

function fragmentFor(key, receipt, clipped) {
    const label = STORY_LABELS[key];
    const suffix = clipped ? '+' : '';
    const compact = `${label} · ${receipt.count.toLocaleString('en-US')}${suffix}`;
    const details = [];

    if (key === 'art' && receipt.artTitles.length) {
        details.push(...progressiveArtworkDetails(compact, receipt.artTitles));
    } else if ((key === 'stake' || key === 'unstake') && receipt.amountMutez > 0) {
        const amount = formatTez(receipt.amountMutez / 1e6);
        details.push(`${compact} · ${clipped ? '≥' : ''}${amount} ꜩ${receipt.count > 1 && !clipped ? ' total' : ''}`);
    } else if (key === 'transfers' && receipt.amountMutez > 0) {
        const amount = formatTez(receipt.amountMutez / 1e6);
        const amountDetail = `${compact} · ${clipped ? '≥' : ''}${amount} ꜩ${receipt.count > 1 && !clipped ? ' total' : ''}`;
        details.push(amountDetail);
        const largest = receipt.rows.reduce((current, row) => (
            Number(row?.amount) > Number(current?.amount || 0) ? row : current
        ), null);
        const sender = compactParty(largest?.sender);
        const target = compactParty(largest?.target);
        if (sender && target) details.push(`${amountDetail} · ${receipt.count > 1 ? 'top ' : ''}${sender} → ${target}`);
    }

    return { key, label, value: receipt.count, text: compact, details: Object.freeze(details), clipped };
}

export function classifyBlockStory({
    transactions = null,
    stakingRows = null,
    l1VotingRows = [],
    l2VotingRows = [],
    tokenTransfers = null,
    catalog = [],
    transactionsClipped = false,
    stakingClipped = false,
    l1VotingClipped = false,
    l2VotingClipped = false,
    tokenTransfersClipped = false,
    maxFragments = 3
} = {}) {
    const transactionsKnown = Array.isArray(transactions);
    const stakingKnown = Array.isArray(stakingRows);
    const l1VotingKnown = Array.isArray(l1VotingRows);
    if (!transactionsKnown && !stakingKnown && !l1VotingKnown) return null;

    const receipts = new Map(STORY_ORDER.map((key) => [key, {
        count: 0,
        amountMutez: 0,
        rows: [],
        artTitles: []
    }]));
    const artTransactionIds = new Set();
    const l2VotingTransactions = new Set(Array.isArray(l2VotingRows) ? l2VotingRows : []);

    for (const row of Array.isArray(l1VotingRows) ? l1VotingRows : []) {
        const receipt = receipts.get('l1-vote');
        receipt.count += 1;
        receipt.rows.push(row);
    }

    for (const row of Array.isArray(l2VotingRows) ? l2VotingRows : []) {
        const receipt = receipts.get('l2-vote');
        receipt.count += 1;
        receipt.rows.push(row);
    }

    for (const transaction of Array.isArray(transactions) ? transactions : []) {
        if (l2VotingTransactions.has(transaction)) continue;
        const catalogStory = catalogStoryFor(transaction, catalog);
        if (catalogStory === 'art' && Number.isFinite(Number(transaction?.id))) {
            artTransactionIds.add(Number(transaction.id));
        }
        if (transaction?.internal === true) continue;
        if (catalogStory) {
            const receipt = receipts.get(catalogStory);
            receipt.count += 1;
            receipt.rows.push(transaction);
            continue;
        }
        if (Number(transaction?.amount) > 0) {
            const receipt = receipts.get('transfers');
            receipt.count += 1;
            receipt.amountMutez += Number(transaction.amount);
            receipt.rows.push(transaction);
        }
    }

    const artTitles = [];
    const seenArtTitles = new Set();
    for (const transfer of Array.isArray(tokenTransfers) ? tokenTransfers : []) {
        const transactionId = Number(transfer?.transactionId);
        if (!artTransactionIds.has(transactionId)) continue;
        const name = cleanArtworkName(transfer?.name || transfer?.token?.metadata?.name);
        const identity = name.toLocaleLowerCase('en-US');
        if (!name || seenArtTitles.has(identity)) continue;
        seenArtTitles.add(identity);
        artTitles.push(name);
    }
    if (artTitles.length) {
        const receipt = receipts.get('art');
        receipt.artTitles = artTitles;
        receipt.count = Math.max(receipt.count, artTitles.length);
    }

    for (const row of Array.isArray(stakingRows) ? stakingRows : []) {
        const key = String(row?.action || '').toLowerCase();
        if (key !== 'stake' && key !== 'unstake') continue;
        const receipt = receipts.get(key);
        receipt.count += 1;
        const amount = Number(row?.amount);
        if (Number.isFinite(amount) && amount > 0) receipt.amountMutez += amount;
        receipt.rows.push(row);
    }

    const fragments = STORY_ORDER
        .filter((key) => receipts.get(key).count > 0)
        .slice(0, Math.max(1, Number(maxFragments) || 3))
        .map((key) => fragmentFor(
            key,
            receipts.get(key),
            key === 'l1-vote'
                ? l1VotingClipped
                : key === 'l2-vote'
                    ? l2VotingClipped
                    : key === 'stake' || key === 'unstake'
                ? stakingClipped
                : key === 'art'
                    ? Boolean(transactionsClipped || tokenTransfersClipped)
                    : transactionsClipped
        ));

    if (!fragments.length && (!transactionsKnown || !stakingKnown || !l1VotingKnown)) return null;

    if (!fragments.length) {
        return Object.freeze({
            quiet: true,
            fragments: Object.freeze([{ key: 'quiet', label: 'Quiet', value: 0, text: 'Quiet', clipped: false }]),
            text: 'Quiet',
            signature: 'quiet',
            clipped: Boolean(transactionsClipped || stakingClipped || l1VotingClipped || l2VotingClipped)
        });
    }

    return Object.freeze({
        quiet: false,
        fragments: Object.freeze(fragments.map(Object.freeze)),
        text: fragments.map((fragment) => fragment.text).join(' · '),
        signature: fragments.map((fragment) => `${fragment.key}:${fragment.value}:${fragment.clipped ? 1 : 0}:${fragment.details.join('~')}`).join('|'),
        clipped: fragments.some((fragment) => fragment.clipped)
    });
}

export const BLOCK_STORY_ORDER = STORY_ORDER;
