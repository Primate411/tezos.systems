/**
 * Shared My Tezos domain records.
 *
 * These helpers are deliberately free of browser globals so storage migrations,
 * import validation, and adapter normalization can share one contract.
 */

export const MY_TEZOS_L1_NETWORK = 'tezos-l1';
export const MY_TEZOS_L2_NETWORK = 'etherlink-mainnet';
export const ETHERLINK_CHAIN_ID = 42793;
export const MAX_LINKED_ETHERLINK_ACCOUNTS = 10;
export const MY_TEZOS_CONFIDENCE = Object.freeze([
    'exact',
    'joined',
    'classified',
    'estimated',
    'unknown'
]);

const L1_ADDRESS_RE = /^(?:tz[1-4]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
const ETHERLINK_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function finite(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function isMyTezosL1Address(value) {
    return L1_ADDRESS_RE.test(String(value || '').trim());
}

export function isEtherlinkAddress(value) {
    return ETHERLINK_ADDRESS_RE.test(String(value || '').trim());
}

export function normalizeEtherlinkAddress(value) {
    const address = String(value || '').trim();
    return isEtherlinkAddress(address) ? address.toLowerCase() : '';
}

export function myTezosAccountKey(layer, address) {
    const normalizedLayer = layer === 'l2' || layer === MY_TEZOS_L2_NETWORK ? 'l2' : 'l1';
    const normalizedAddress = normalizedLayer === 'l2'
        ? normalizeEtherlinkAddress(address)
        : String(address || '').trim();
    return normalizedAddress ? `${normalizedLayer}:${normalizedAddress}` : '';
}

export function normalizeLinkedL2Accounts(values, { now = Date.now() } = {}) {
    if (!Array.isArray(values)) return [];
    const normalized = [];
    const seen = new Set();
    for (const raw of values) {
        const address = normalizeEtherlinkAddress(raw?.address);
        if (!address || seen.has(address)) continue;
        seen.add(address);
        const linkedL1Addresses = Array.from(new Set(
            (Array.isArray(raw?.linkedL1Addresses) ? raw.linkedL1Addresses : [])
                .map((item) => String(item || '').trim())
                .filter(isMyTezosL1Address)
        )).slice(0, 10);
        normalized.push({
            chainId: ETHERLINK_CHAIN_ID,
            network: MY_TEZOS_L2_NETWORK,
            address,
            label: typeof raw?.label === 'string' && raw.label.trim()
                ? raw.label.trim().slice(0, 80)
                : null,
            linkedL1Addresses,
            included: raw?.included !== false,
            addedAt: finite(raw?.addedAt, now),
            linkMethod: 'manual',
            verification: 'unverified-device-local'
        });
        if (normalized.length >= MAX_LINKED_ETHERLINK_ACCOUNTS) break;
    }
    return normalized;
}

export function createSourceReceipt(value = {}) {
    const confidence = MY_TEZOS_CONFIDENCE.includes(value.confidence)
        ? value.confidence
        : 'unknown';
    const state = ['complete', 'partial', 'last-good', 'unknown'].includes(value?.coverage?.state)
        ? value.coverage.state
        : 'unknown';
    return {
        provider: String(value.provider || 'unknown'),
        sourceUrl: String(value.sourceUrl || ''),
        fetchedAt: String(value.fetchedAt || new Date().toISOString()),
        blockLevel: finite(value.blockLevel),
        cursor: value.cursor == null ? null : String(value.cursor),
        coverage: {
            state,
            from: value?.coverage?.from || null,
            to: value?.coverage?.to || null,
            pages: Math.max(0, finite(value?.coverage?.pages, 0)),
            items: Math.max(0, finite(value?.coverage?.items, 0))
        },
        confidence,
        warnings: Array.isArray(value.warnings)
            ? value.warnings.map((warning) => String(warning)).filter(Boolean)
            : []
    };
}

export function createActivity(value = {}) {
    const layer = value.layer === 'l2' ? 'l2' : 'l1';
    const accountKey = String(value.accountKey || myTezosAccountKey(layer, value.address));
    const timestamp = Date.parse(value.timestamp || '') || finite(value.timestamp, Date.now());
    const operationHash = String(value.operationHash || value.hash || '');
    const kind = String(value.kind || 'unknown');
    const stablePart = String(value.sourceId ?? value.id ?? operationHash ?? timestamp);
    const id = String(value.id || `${accountKey}:${kind}:${stablePart}`);
    return {
        id,
        accountKey,
        layer,
        kind,
        direction: ['in', 'out', 'self', 'neutral'].includes(value.direction)
            ? value.direction
            : 'neutral',
        timestamp,
        levelOrBlock: finite(value.levelOrBlock ?? value.level ?? value.blockNumber),
        operationHash,
        groupKey: String(value.groupKey || operationHash || id),
        status: String(value.status || 'applied'),
        amount: finite(value.amount, 0),
        fee: finite(value.fee ?? value.feeWei, 0),
        asset: value.asset && typeof value.asset === 'object'
            ? {
                type: String(value.asset.type || 'xtz'),
                symbol: String(value.asset.symbol || 'XTZ'),
                contract: String(value.asset.contract || ''),
                tokenId: value.asset.tokenId == null ? null : String(value.asset.tokenId),
                decimals: finite(value.asset.decimals, value.asset.type === 'erc20' ? 18 : 6)
            }
            : { type: 'xtz', symbol: 'XTZ', contract: '', tokenId: null, decimals: layer === 'l2' ? 18 : 6 },
        counterparties: Array.isArray(value.counterparties)
            ? value.counterparties.map((party) => ({
                address: String(party?.address || ''),
                alias: party?.alias ? String(party.alias) : null,
                role: String(party?.role || '')
            })).filter((party) => party.address)
            : [],
        sourceReceipts: Array.isArray(value.sourceReceipts)
            ? value.sourceReceipts.map(createSourceReceipt)
            : [],
        confidence: MY_TEZOS_CONFIDENCE.includes(value.confidence) ? value.confidence : 'unknown',
        relatedIds: Array.isArray(value.relatedIds) ? value.relatedIds.map(String) : [],
        summary: value.summary ? String(value.summary) : ''
    };
}

export function dedupeMyTezosActivities(values, ownedAccountKeys = []) {
    const owned = new Set(ownedAccountKeys);
    const byId = new Map();
    const groups = new Map();
    for (const raw of Array.isArray(values) ? values : []) {
        const activity = createActivity(raw);
        if (!byId.has(activity.id)) byId.set(activity.id, activity);
        const group = groups.get(activity.groupKey) || [];
        group.push(activity);
        groups.set(activity.groupKey, group);
    }

    const merged = [];
    const consumed = new Set();
    for (const activity of byId.values()) {
        if (consumed.has(activity.id)) continue;
        const group = groups.get(activity.groupKey) || [activity];
        const accountKeys = new Set(group.map((item) => item.accountKey).filter((key) => owned.has(key)));
        const hasIn = group.some((item) => item.direction === 'in');
        const hasOut = group.some((item) => item.direction === 'out');
        if (accountKeys.size > 1 && hasIn && hasOut) {
            group.forEach((item) => consumed.add(item.id));
            merged.push({
                ...activity,
                id: `self:${activity.groupKey}`,
                accountKey: 'aggregate:l1',
                direction: 'self',
                kind: activity.kind === 'xtz-transfer' ? 'self-transfer' : activity.kind,
                summary: 'Moved between your included wallets',
                relatedIds: group.map((item) => item.id)
            });
        } else {
            consumed.add(activity.id);
            merged.push(activity);
        }
    }
    return merged.sort((left, right) => right.timestamp - left.timestamp || right.id.localeCompare(left.id));
}
