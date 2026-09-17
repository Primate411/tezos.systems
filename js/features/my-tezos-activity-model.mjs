import {
    createActivity,
    createSourceReceipt,
    dedupeMyTezosActivities,
    myTezosAccountKey
} from '../core/my-tezos-models.mjs';

function accountAddress(value) {
    return typeof value === 'string' ? value : String(value?.address || '');
}

function accountAlias(value) {
    return value && typeof value === 'object' && value.alias ? String(value.alias) : null;
}

function operationType(operation) {
    const explicit = String(operation?.type || operation?.kind || '').toLowerCase();
    if (explicit) return explicit;
    if (operation?.action) return 'staking';
    if (Object.hasOwn(operation || {}, 'newDelegate') || Object.hasOwn(operation || {}, 'prevDelegate')) return 'delegation';
    if (operation?.sender && operation?.target) return 'transaction';
    return 'unknown';
}

function directionFor(operation, address, ownedAddresses) {
    const sender = accountAddress(operation?.sender || operation?.from);
    const target = accountAddress(operation?.target || operation?.to);
    if (sender === address && target === address) return 'self';
    if (sender === address) return ownedAddresses.has(target) ? 'self' : 'out';
    if (target === address) return ownedAddresses.has(sender) ? 'self' : 'in';
    return 'neutral';
}

function counterpartyList(operation, address) {
    const candidates = [
        { value: operation?.sender || operation?.from, role: 'sender' },
        { value: operation?.target || operation?.to, role: 'target' },
        { value: operation?.newDelegate, role: 'new delegate' },
        { value: operation?.prevDelegate, role: 'previous delegate' },
        { value: operation?.baker, role: 'baker' }
    ];
    const seen = new Set();
    return candidates.map(({ value, role }) => ({
        address: accountAddress(value),
        alias: accountAlias(value),
        role
    })).filter((party) => party.address && party.address !== address && !seen.has(party.address) && seen.add(party.address));
}

function activityKind(operation, type, contractRule = null) {
    if (type.includes('token_transfer')) {
        const decimals = Number(operation?.token?.metadata?.decimals);
        const standard = String(operation?.token?.standard || '').toLowerCase();
        const isNft = (!Number.isFinite(decimals) || decimals === 0)
            && (standard === 'fa2' || standard === 'fa1.2')
            && operation?.token?.metadata?.is_boolean_amount === true;
        return isNft ? 'nft-transfer' : 'token-transfer';
    }
    if (type.includes('delegation')) return 'delegate-change';
    if (type.includes('staking')) {
        const action = String(operation?.action || '').toLowerCase();
        if (action === 'stake') return 'stake';
        if (action === 'unstake') return 'unstake';
        if (action.includes('final')) return 'finalize-unstake';
        return 'staking-change';
    }
    if (type.includes('transaction')) {
        const entrypoint = String(operation?.parameter?.entrypoint || operation?.entrypoint || '').toLowerCase();
        if (
            contractRule?.kind === 'dex'
            && contractRule.entrypoints.includes(entrypoint)
        ) return 'recognized-swap';
        if (entrypoint && entrypoint !== 'default') return 'contract-call';
        return 'xtz-transfer';
    }
    if (type.includes('origination')) return 'contract-origination';
    return 'unknown';
}

function activitySummary(kind, direction, operation) {
    if (kind === 'delegate-change') {
        const next = accountAlias(operation?.newDelegate) || accountAddress(operation?.newDelegate);
        return next ? `Delegate changed to ${next}` : 'Delegation removed';
    }
    if (kind === 'stake') return 'Staked XTZ';
    if (kind === 'unstake') return 'Started unstaking XTZ';
    if (kind === 'finalize-unstake') return 'Finalized unstaked XTZ';
    if (kind === 'contract-call') {
        const entrypoint = String(operation?.parameter?.entrypoint || operation?.entrypoint || 'contract call');
        return `Called ${entrypoint}`;
    }
    if (kind === 'recognized-swap') return 'Recognized swap';
    if (kind === 'contract-origination') return 'Originated a contract';
    if (kind === 'token-transfer' || kind === 'nft-transfer') {
        const name = operation?.token?.metadata?.name || operation?.token?.metadata?.symbol || 'token';
        const verb = direction === 'in' ? 'Received' : direction === 'out' ? 'Sent' : 'Moved';
        return `${verb} ${name}`;
    }
    if (kind === 'xtz-transfer') return direction === 'in' ? 'Received XTZ' : direction === 'out' ? 'Sent XTZ' : 'Moved XTZ';
    return 'On-chain activity';
}

export function normalizeTzktAccountOperation(operation, {
    address,
    ownedAddresses = [],
    fetchedAt = new Date().toISOString(),
    sourceUrl = '',
    contractRule = null
} = {}) {
    const account = String(address || '');
    if (!account || String(operation?.status || 'applied').toLowerCase() !== 'applied') return null;
    const owned = new Set(ownedAddresses);
    const type = operationType(operation);
    const kind = activityKind(operation, type, contractRule);
    const direction = directionFor(operation, account, owned);
    const hash = String(operation?.hash || operation?.operationHash || '');
    const sourceId = operation?.id ?? `${operation?.level || ''}:${operation?.timestamp || ''}`;
    const token = operation?.token || null;
    const tokenMetadata = token?.metadata || {};
    const asset = token
        ? {
            type: kind === 'nft-transfer' ? 'nft' : 'token',
            symbol: String(tokenMetadata.symbol || tokenMetadata.name || 'TOKEN'),
            contract: String(token?.contract?.address || ''),
            tokenId: token?.tokenId == null ? null : String(token.tokenId),
            decimals: Number.isFinite(Number(tokenMetadata.decimals)) ? Number(tokenMetadata.decimals) : 0
        }
        : { type: 'xtz', symbol: 'XTZ', decimals: 6 };
    return createActivity({
        id: `tzkt:${account}:${type}:${sourceId}`,
        sourceId,
        accountKey: myTezosAccountKey('l1', account),
        layer: 'l1',
        kind,
        direction,
        timestamp: operation?.timestamp,
        levelOrBlock: operation?.level,
        operationHash: hash,
        groupKey: (hash || operation?.transactionId)
            ? `tzkt-transaction:${operation?.transactionId || hash}`
            : `tzkt:${type}:${sourceId}`,
        status: operation?.status || 'applied',
        amount: Number(operation?.amount ?? operation?.requestedAmount) || 0,
        asset,
        counterparties: counterpartyList(operation, account),
        confidence: kind === 'recognized-swap' ? 'classified' : kind === 'unknown' ? 'unknown' : 'exact',
        summary: kind === 'recognized-swap' && contractRule?.label
            ? `Recognized swap · ${contractRule.label}`
            : activitySummary(kind, direction, operation),
        sourceReceipts: [createSourceReceipt({
            provider: 'TzKT',
            sourceUrl,
            fetchedAt,
            blockLevel: operation?.level,
            coverage: { state: 'partial', pages: 1, items: 1 },
            confidence: kind === 'recognized-swap' ? 'classified' : kind === 'unknown' ? 'unknown' : 'exact',
            warnings: contractRule?.sourceUrl ? [`Classification source: ${contractRule.sourceUrl}`] : []
        })]
    });
}

export function aggregateMyTezosActivities(values, ownedAddresses = []) {
    return dedupeMyTezosActivities(
        values,
        ownedAddresses.map((address) => myTezosAccountKey('l1', address))
    );
}

export function activityDisplay(activity) {
    const decimals = Number(activity?.asset?.decimals);
    const amount = Number(activity?.amount) / (10 ** (Number.isFinite(decimals) ? decimals : 6));
    const amountText = Number.isFinite(amount) && amount > 0
        ? `${amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${activity?.asset?.symbol || 'XTZ'}`
        : '';
    const confidence = activity?.confidence === 'estimated'
        ? 'estimated'
        : activity?.confidence === 'joined'
            ? 'joined evidence'
            : activity?.confidence === 'classified'
                ? 'recognized'
                : activity?.confidence === 'unknown'
                    ? 'unclassified'
                    : 'on-chain receipt';
    return {
        title: activity?.summary || 'On-chain activity',
        amountText,
        confidence,
        explorerUrl: activity?.operationHash
            ? activity.layer === 'l2'
                ? `https://explorer.etherlink.com/tx/${encodeURIComponent(activity.operationHash)}`
                : `https://tzkt.io/${encodeURIComponent(activity.operationHash)}`
            : activity?.sourceReceipts?.[0]?.sourceUrl || ''
    };
}
