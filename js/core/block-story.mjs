export const ETHERLINK_ROLLUP_ADDRESS = 'sr1Ghq66tYK9y3r8CC1Tf8i8m5nxh8nTvZEf';

const STORY_ORDER = Object.freeze([
    'evidence',
    'milestone',
    'baker',
    'l1-vote',
    'l2-vote',
    'etherlink',
    'dal',
    'art',
    'defi',
    'gaming',
    'bridge',
    'domains',
    'stake',
    'unstake',
    'delegate',
    'tokens',
    'contract',
    'transfers',
    'calls'
]);

export const BLOCK_STORY_FILTER_TYPES = Object.freeze(STORY_ORDER.filter((key) => (
    key !== 'evidence' && key !== 'milestone' && key !== 'baker'
)));

const STORY_LABELS = Object.freeze({
    evidence: 'Evidence',
    milestone: 'Milestone',
    baker: 'Baker',
    'l1-vote': 'L1: Vote',
    'l2-vote': 'L2: Vote',
    etherlink: 'TEZOS X',
    dal: 'DAL',
    art: 'Art',
    defi: 'DeFi',
    gaming: 'Gaming',
    bridge: 'Bridge',
    domains: 'Domains',
    stake: 'Stake',
    unstake: 'Unstake',
    delegate: 'Delegate',
    tokens: 'Tokens',
    contract: 'Contract',
    transfers: 'Transfers',
    calls: 'Calls'
});

const CATALOG_CATEGORY_TO_STORY = Object.freeze({
    nft: 'art',
    defi: 'defi',
    gaming: 'gaming',
    bridge: 'bridge',
    identity: 'domains'
});

const ETHERLINK_OPERATION_LABELS = Object.freeze({
    smart_rollup_publish: 'publish',
    smart_rollup_cement: 'cement',
    smart_rollup_execute_outbox_message: 'outbox'
});

const EVIDENCE_LABELS = Object.freeze({
    double_baking_evidence: 'Double bake',
    double_attestation_evidence: 'Double attestation',
    double_preattestation_evidence: 'Double preattestation',
    dal_entrapment_evidence: 'DAL entrapment',
    drain_delegate: 'Delegate drain'
});

const BAKER_OPERATION_LABELS = Object.freeze({
    update_consensus_key: 'consensus key',
    update_active_consensus_key: 'consensus key',
    update_companion_key: 'companion key',
    update_secondary_key: 'secondary key',
    set_delegate_parameters: 'staking policy',
    set_deposits_limit: 'deposit limit'
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

function cleanName(value, maxLength = 96) {
    return String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function unique(values, max = 8) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const cleaned = cleanName(value);
        const identity = cleaned.toLocaleLowerCase('en-US');
        if (!cleaned || seen.has(identity)) continue;
        seen.add(identity);
        result.push(cleaned);
        if (result.length >= max) break;
    }
    return result;
}

function progressiveDetails(compact, values) {
    const details = [];
    const visible = unique(values);
    for (let index = 0; index < visible.length; index += 1) {
        const remaining = visible.length - index - 1;
        details.push(`${compact} · ${visible.slice(0, index + 1).join(' · ')}${remaining > 0 ? ` · +${remaining}` : ''}`);
    }
    return details;
}

function countedNames(values) {
    const counts = new Map();
    for (const value of values) {
        const name = cleanName(value);
        if (!name) continue;
        const identity = name.toLocaleLowerCase('en-US');
        const current = counts.get(identity) || { name, count: 0 };
        current.count += 1;
        counts.set(identity, current);
    }
    return [...counts.values()].slice(0, 8).map(({ name, count }) => count > 1 ? `${name} ${count}` : name);
}

function operationKind(row) {
    return String(row?.kind || row?.type || '').toLowerCase();
}

function operationApplied(row) {
    return row?.applied !== false && row?.status !== 'failed';
}

function milestoneText(row) {
    const kind = String(row?.kind || '').toLowerCase();
    if (kind === 'cycle') return `Cycle · ${Number.isFinite(Number(row?.cycle)) ? Number(row.cycle).toLocaleString('en-US') : cleanName(row?.label)}`;
    if (kind === 'protocol') return `Protocol · ${cleanName(row?.name || row?.label) || 'activation'}`;
    if (kind === 'voting') return `Voting · ${cleanName(row?.period || row?.label) || 'period'}`;
    return cleanName(row?.label) || 'Chain milestone';
}

function delegateAction(row) {
    const previous = String(row?.prevDelegate?.address || row?.prevDelegate || '');
    const next = String(row?.newDelegate?.address || row?.newDelegate || row?.delegate || '');
    const sender = String(row?.sender?.address || row?.sender || row?.source || '');
    if (!next) return previous ? 'undelegate' : 'delegation';
    if (!previous && sender && sender === next) return 'self register';
    if (previous && previous !== next) return 'switch';
    return 'new';
}

function receiptTemplate() {
    return { count: 0, amountMutez: 0, rows: [], names: [], artTitles: [] };
}

function fragmentFor(key, receipt, clipped) {
    const label = STORY_LABELS[key];
    const suffix = clipped ? '+' : '';
    let compact = `${label} · ${receipt.count.toLocaleString('en-US')}${suffix}`;
    const details = [];
    const mandatory = key === 'evidence' || key === 'milestone' || key === 'baker';

    if (key === 'evidence') {
        const names = countedNames(receipt.names);
        compact = names.length === 1 ? `Evidence · ${names[0]}` : compact;
        details.push(...progressiveDetails(compact, names.length === 1 ? [] : names));
    } else if (key === 'milestone') {
        const names = unique(receipt.names);
        compact = names.length === 1 ? names[0] : compact;
        details.push(...progressiveDetails(compact, names.length === 1 ? [] : names));
    } else if (key === 'baker') {
        const names = countedNames(receipt.names);
        compact = names.length === 1 ? `Baker · ${names[0]}` : compact;
        details.push(...progressiveDetails(compact, names.length === 1 ? [] : names));
    } else if (key === 'art' && receipt.artTitles.length) {
        details.push(...progressiveDetails(compact, receipt.artTitles));
    } else if (key === 'tokens') {
        details.push(...progressiveDetails(compact, receipt.names));
    } else if (key === 'etherlink' || key === 'delegate' || key === 'calls') {
        details.push(...progressiveDetails(compact, countedNames(receipt.names)));
    } else if (key === 'dal' || key === 'contract') {
        details.push(...progressiveDetails(compact, receipt.names));
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

    return {
        key,
        label,
        value: receipt.count,
        text: compact,
        details: Object.freeze(unique(details, 12)),
        clipped,
        mandatory
    };
}

export function classifyBlockStory({
    transactions = null,
    stakingRows = null,
    l1VotingRows = null,
    l2VotingRows = null,
    tokenTransfers = null,
    managerOperations = null,
    evidenceRows = null,
    milestoneRows = null,
    delegationRows = [],
    originationRows = [],
    catalog = [],
    transactionsClipped = false,
    stakingClipped = false,
    l1VotingClipped = false,
    l2VotingClipped = false,
    tokenTransfersClipped = false,
    maxFragments = 3
} = {}) {
    const requiredLanes = [
        transactions,
        stakingRows,
        l1VotingRows,
        l2VotingRows,
        tokenTransfers,
        managerOperations,
        evidenceRows,
        milestoneRows
    ];
    const allKnown = requiredLanes.every(Array.isArray);
    if (!requiredLanes.some(Array.isArray)) return null;

    const receipts = new Map(STORY_ORDER.map((key) => [key, receiptTemplate()]));
    const artTransactionIds = new Set();
    const l2VotingTransactions = new Set(Array.isArray(l2VotingRows) ? l2VotingRows : []);

    for (const row of Array.isArray(evidenceRows) ? evidenceRows : []) {
        if (!operationApplied(row)) continue;
        const name = EVIDENCE_LABELS[operationKind(row)];
        if (!name) continue;
        const receipt = receipts.get('evidence');
        receipt.count += 1;
        receipt.rows.push(row);
        receipt.names.push(name);
    }

    for (const row of Array.isArray(milestoneRows) ? milestoneRows : []) {
        const receipt = receipts.get('milestone');
        receipt.count += 1;
        receipt.rows.push(row);
        receipt.names.push(milestoneText(row));
    }

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
            continue;
        }
        const { address } = targetIdentity(transaction);
        if (address.startsWith('KT1') || address.startsWith('sr1')) {
            const receipt = receipts.get('calls');
            receipt.count += 1;
            receipt.rows.push(transaction);
            receipt.names.push(cleanName(transaction?.parameter?.entrypoint || 'default'));
        }
    }

    for (const transfer of Array.isArray(tokenTransfers) ? tokenTransfers : []) {
        const transactionId = Number(transfer?.transactionId);
        const name = cleanName(
            transfer?.symbol
            || transfer?.token?.metadata?.symbol
            || transfer?.name
            || transfer?.token?.metadata?.name
            || transfer?.standard
            || 'token'
        );
        if (artTransactionIds.has(transactionId)) {
            const artName = cleanName(transfer?.name || transfer?.token?.metadata?.name);
            if (artName) receipts.get('art').artTitles.push(artName);
            continue;
        }
        const receipt = receipts.get('tokens');
        receipt.count += 1;
        receipt.rows.push(transfer);
        receipt.names.push(name);
    }
    if (receipts.get('art').artTitles.length) {
        const receipt = receipts.get('art');
        receipt.artTitles = unique(receipt.artTitles);
        receipt.count = Math.max(receipt.count, receipt.artTitles.length);
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

    const rawDelegations = [];
    const rawOriginations = [];
    for (const row of Array.isArray(managerOperations) ? managerOperations : []) {
        if (!operationApplied(row)) continue;
        const kind = operationKind(row);
        if (ETHERLINK_OPERATION_LABELS[kind] && String(row?.rollup || '') === ETHERLINK_ROLLUP_ADDRESS) {
            const receipt = receipts.get('etherlink');
            receipt.count += 1;
            receipt.rows.push(row);
            receipt.names.push(ETHERLINK_OPERATION_LABELS[kind]);
        } else if (kind === 'dal_publish_commitment') {
            const receipt = receipts.get('dal');
            const slot = Number(row?.slotIndex ?? row?.slot_header?.index ?? row?.slotHeader?.index);
            receipt.count += 1;
            receipt.rows.push(row);
            receipt.names.push(Number.isFinite(slot) ? `slot ${slot}` : 'commitment');
        } else if (kind === 'delegation') {
            rawDelegations.push(row);
        } else if (kind === 'origination') {
            rawOriginations.push(row);
        } else if (BAKER_OPERATION_LABELS[kind]) {
            const receipt = receipts.get('baker');
            receipt.count += 1;
            receipt.rows.push(row);
            receipt.names.push(BAKER_OPERATION_LABELS[kind]);
        }
    }

    const delegates = Array.isArray(delegationRows) && delegationRows.length ? delegationRows : rawDelegations;
    for (const row of delegates) {
        const receipt = receipts.get('delegate');
        receipt.count += 1;
        receipt.rows.push(row);
        receipt.names.push(delegateAction(row));
    }

    const originations = Array.isArray(originationRows) && originationRows.length ? originationRows : rawOriginations;
    for (const row of originations) {
        const receipt = receipts.get('contract');
        const contract = row?.originatedContract || row?.originatedContracts?.[0] || row?.result?.originated_contracts?.[0];
        receipt.count += 1;
        receipt.rows.push(row);
        receipt.names.push(cleanName(contract?.alias || contract?.address || contract || 'originated'));
    }

    const clippedByKey = {
        'l1-vote': l1VotingClipped,
        'l2-vote': l2VotingClipped,
        art: Boolean(transactionsClipped || tokenTransfersClipped),
        stake: stakingClipped,
        unstake: stakingClipped,
        tokens: tokenTransfersClipped,
        transfers: transactionsClipped,
        calls: transactionsClipped
    };
    const limit = Math.max(1, Number(maxFragments) || 3);
    const fragments = STORY_ORDER
        .filter((key) => receipts.get(key).count > 0)
        .slice(0, limit)
        .map((key) => fragmentFor(key, receipts.get(key), Boolean(clippedByKey[key])));

    const sampleClipped = Boolean(
        transactionsClipped
        || stakingClipped
        || l1VotingClipped
        || l2VotingClipped
        || tokenTransfersClipped
    );
    if (!fragments.length && (!allKnown || sampleClipped)) return null;

    if (!fragments.length) {
        return Object.freeze({
            quiet: true,
            complete: true,
            fragments: Object.freeze([{ key: 'quiet', label: 'Quiet', value: 0, text: 'Quiet', details: Object.freeze([]), clipped: false, mandatory: true }]),
            text: 'Quiet',
            signature: 'quiet',
            clipped: false
        });
    }

    return Object.freeze({
        quiet: false,
        complete: allKnown && !sampleClipped,
        fragments: Object.freeze(fragments.map(Object.freeze)),
        text: fragments.map((fragment) => fragment.text).join(' · '),
        signature: `${allKnown ? 'complete' : 'partial'}|${fragments.map((fragment) => `${fragment.key}:${fragment.value}:${fragment.clipped ? 1 : 0}:${fragment.details.join('~')}`).join('|')}`,
        clipped: fragments.some((fragment) => fragment.clipped)
    });
}

export const BLOCK_STORY_ORDER = STORY_ORDER;
