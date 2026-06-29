/**
 * Tezos Domains Chamber
 * Live identity, auction, market, and expiration pulse for .tez names.
 */

import { debounce, escapeHtml, formatLiveDuration, startLiveTimeTicker } from '../core/utils.js';

const TEZOS_DOMAINS_ENDPOINT = 'https://api.tezos.domains/graphql';
const TEZOS_DOMAINS_CSS_URL = '/css/tezos-domains.css?v=306';
const CHAMBER_REFRESH_MS = 10 * 60 * 1000;
const ENTRY_REFRESH_MS = 15 * 60 * 1000;
const MIN_HIGH_VALUE_MUTEZ = '25000000';
const ASPIRATIONAL_ASK_MUTEZ = 100000 * 1e6;
const STALE_MS = 45 * 60 * 1000;
const TEZ_DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+tez$/i;
const BLOCKED_NAME_PARTS = Object.freeze([
    'porn',
    'xxx',
    'nude',
    'fuck',
    'shit',
    'cunt',
    'nigg',
    'rape',
    'slut',
    'whore',
    'hitler',
    'nazi',
    'scam',
    'phish',
    'drain',
    'rugpull'
]);

let entryTimer = null;
let chamberTimer = null;
let chamberRefreshInFlight = false;
let entryRefreshInFlight = false;
let lastData = null;
let lookupState = { status: 'idle', name: '' };
let lookupToken = 0;
let savedBodyOverflow = null;
let savedHtmlOverflow = null;

function ensureTezosDomainsStyles() {
    if (document.getElementById('tezos-domains-css')) return;
    const link = document.createElement('link');
    link.id = 'tezos-domains-css';
    link.rel = 'stylesheet';
    link.href = TEZOS_DOMAINS_CSS_URL;
    document.head.appendChild(link);
}

function isLikelySafeName(name) {
    const normalized = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
    return Boolean(normalized) && !BLOCKED_NAME_PARTS.some((part) => normalized.includes(part));
}

function domainUrl(name) {
    return `https://app.tezos.domains/domain/${encodeURIComponent(name)}`;
}

function ledgerFlowUrl(name) {
    return `#ledger-flow=${encodeURIComponent(name)}`;
}

function tzktOperationUrl(hash) {
    return `https://tzkt.io/${encodeURIComponent(hash)}`;
}

function shortHash(value) {
    const text = String(value || '');
    if (text.length <= 13) return text || 'operation';
    return `${text.slice(0, 7)}...${text.slice(-5)}`;
}

function formatCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function formatTez(mutez, options = {}) {
    const value = Number(mutez || 0) / 1e6;
    if (!Number.isFinite(value)) return '0 XTZ';
    const suffix = options.unit === false ? '' : ' XTZ';
    if (Math.abs(value) >= 1000000000) return `${(value / 1000000000).toFixed(2)}B${suffix}`;
    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(2)}M${suffix}`;
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K${suffix}`;
    if (Math.abs(value) >= 100) return `${value.toFixed(0)}${suffix}`;
    if (Math.abs(value) >= 10) return `${value.toFixed(1)}${suffix}`;
    if (Math.abs(value) >= 1) return `${value.toFixed(2)}${suffix}`;
    if (value > 0) return `<0.01${suffix}`;
    return `0${suffix}`;
}

function formatAge(value) {
    if (!value) return 'time unknown';
    const diff = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(diff) || diff < 0) return 'just now';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 365) return `${days}d ago`;
    return `${Math.floor(days / 365)}y ago`;
}

function formatDate(value) {
    if (!value) return 'open ended';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'unknown';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : 'numeric',
        timeZone: 'UTC'
    });
}

function normalizeDomainInput(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return { name: '', error: '' };
    const cleaned = raw.replace(/^@+/, '').replace(/\s+/g, '');
    const name = cleaned.endsWith('.tez') ? cleaned : `${cleaned}.tez`;
    if (name.length > 253 || !TEZ_DOMAIN_RE.test(name)) {
        return { name, error: 'Use a valid .tez name, such as builder.tez.' };
    }
    if (!isLikelySafeName(name)) {
        return { name, error: 'Try a different .tez name.' };
    }
    return { name, error: '' };
}

function formatTimeDistance(value) {
    if (!value) return 'unknown';
    const diff = new Date(value).getTime() - Date.now();
    if (!Number.isFinite(diff)) return 'unknown';
    if (diff <= 0) return 'now';
    const minutes = Math.ceil(diff / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    if (hours < 48) return `${hours}h`;
    const days = Math.ceil(hours / 24);
    return `${days}d`;
}

function formatElapsedDuration(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return 'unknown';
    return formatLiveDuration(Date.now() - time, { includeSeconds: false });
}

function liveAgeAttr(value, options = {}) {
    if (!value) return '';
    const attrs = [
        `data-live-age="${escapeHtml(value)}"`,
        options.prefix ? `data-live-prefix="${escapeHtml(options.prefix)}"` : '',
        options.suffix ? `data-live-suffix="${escapeHtml(options.suffix)}"` : ''
    ].filter(Boolean).join(' ');
    return ` ${attrs}`;
}

function liveCountdownAttr(value, options = {}) {
    if (!value) return '';
    const attrs = [
        `data-live-countdown="${escapeHtml(value)}"`,
        options.prefix ? `data-live-prefix="${escapeHtml(options.prefix)}"` : '',
        options.suffix ? `data-live-suffix="${escapeHtml(options.suffix)}"` : '',
        options.ended ? `data-live-ended="${escapeHtml(options.ended)}"` : '',
        options.seconds === false ? 'data-live-seconds="false"' : ''
    ].filter(Boolean).join(' ');
    return ` ${attrs}`;
}

function liveDurationSinceAttr(value, options = {}) {
    if (!value) return '';
    const attrs = [
        `data-live-duration-since="${escapeHtml(value)}"`,
        options.prefix ? `data-live-prefix="${escapeHtml(options.prefix)}"` : '',
        options.suffix ? `data-live-suffix="${escapeHtml(options.suffix)}"` : '',
        options.seconds === false ? 'data-live-seconds="false"' : ''
    ].filter(Boolean).join(' ');
    return ` ${attrs}`;
}

function reverseName(record) {
    return record?.domain?.name || '';
}

function actorLabel(address, record) {
    return reverseName(record) || shortHash(address);
}

function domainNameFromEvent(event) {
    return event?.domainName || reverseName(event?.sourceAddressReverseRecord) || event?.domain?.name || '';
}

function eventTone(event) {
    const type = event?.type || event?.__typename || '';
    if (type.includes('OFFER') || type.includes('AUCTION')) return 'market';
    if (type.includes('TRANSFER') || type.includes('REVERSE')) return 'identity';
    if (type.includes('RENEW')) return 'renewal';
    return 'register';
}

function eventLabel(event) {
    switch (event?.type) {
        case 'DOMAIN_BUY_EVENT':
            return `registered ${formatTez(event.price)}`;
        case 'AUCTION_SETTLE_EVENT':
            return `auction settled ${formatTez(event.winningBid)}`;
        case 'DOMAIN_RENEW_EVENT':
            return `renewed ${event.durationInDays ? `${Math.round(event.durationInDays / 365)}y` : ''}`.trim();
        case 'DOMAIN_TRANSFER_EVENT':
            return `transferred to ${actorLabel(event.newOwner, event.newOwnerReverseRecord)}`;
        case 'DOMAIN_SET_CHILD_RECORD_EVENT':
            return event.isNewRecord ? 'new subdomain' : 'subdomain updated';
        case 'OFFER_PLACED_EVENT':
            return `listed ${formatTez(event.price)}`;
        case 'OFFER_EXECUTED_EVENT':
            return `sold ${formatTez(event.price)}`;
        case 'BUY_OFFER_PLACED_EVENT':
            return `bid wanted ${formatTez(event.price)}`;
        case 'BUY_OFFER_EXECUTED_EVENT':
            return `buy offer hit ${formatTez(event.price)}`;
        case 'AUCTION_BID_EVENT':
            return `auction bid ${formatTez(event.bidAmount)}`;
        case 'REVERSE_RECORD_CLAIM_EVENT':
            return 'claimed reverse record';
        case 'REVERSE_RECORD_UPDATE_EVENT':
            return 'updated reverse record';
        default:
            return String(event?.type || 'domain event').replaceAll('_', ' ').toLowerCase();
    }
}

function eventTypeChip(event) {
    switch (event?.type) {
        case 'DOMAIN_BUY_EVENT':
            return 'register';
        case 'AUCTION_SETTLE_EVENT':
        case 'AUCTION_BID_EVENT':
            return 'auction';
        case 'DOMAIN_RENEW_EVENT':
            return 'renew';
        case 'DOMAIN_TRANSFER_EVENT':
            return 'transfer';
        case 'DOMAIN_SET_CHILD_RECORD_EVENT':
            return 'subdomain';
        case 'OFFER_PLACED_EVENT':
        case 'OFFER_EXECUTED_EVENT':
            return 'ask';
        case 'BUY_OFFER_PLACED_EVENT':
        case 'BUY_OFFER_EXECUTED_EVENT':
            return 'bid';
        case 'REVERSE_RECORD_CLAIM_EVENT':
        case 'REVERSE_RECORD_UPDATE_EVENT':
            return 'reverse';
        default:
            return 'event';
    }
}

function eventValue(event) {
    return event?.price || event?.winningBid || event?.bidAmount || event?.transactionAmount || '';
}

function eventValueNumber(event) {
    const value = Number(eventValue(event));
    return Number.isFinite(value) ? value : 0;
}

function eventKey(event) {
    return String(event?.id || event?.operationGroupHash || [
        event?.type || event?.__typename || 'event',
        domainNameFromEvent(event),
        event?.block?.timestamp || '',
        eventValue(event) || ''
    ].join(':'));
}

function gqlQuery(now = new Date()) {
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const next30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    return {
        variables: {
            d24: since24h,
            d7: since7d,
            d30: since30d,
            soon: next30d,
            now: now.toISOString(),
            minHighValue: MIN_HIGH_VALUE_MUTEZ
        },
        query: `query TezosDomainsChamber($d24: DateTime!, $d7: DateTime!, $d30: DateTime!, $now: DateTime!, $soon: DateTime!, $minHighValue: Mutez!) {
            block { level timestamp }
            registrations24h: events(first: 1, where: { block: { timestamp: { greaterThanOrEqualTo: $d24 } }, type: { in: [DOMAIN_BUY_EVENT, AUCTION_SETTLE_EVENT] } }) { totalCount }
            renewals24h: events(first: 1, where: { block: { timestamp: { greaterThanOrEqualTo: $d24 } }, type: { in: [DOMAIN_RENEW_EVENT] } }) { totalCount }
            transfers24h: events(first: 1, where: { block: { timestamp: { greaterThanOrEqualTo: $d24 } }, type: { in: [DOMAIN_TRANSFER_EVENT] } }) { totalCount }
            subdomains24h: events(first: 1, where: { block: { timestamp: { greaterThanOrEqualTo: $d24 } }, type: { in: [DOMAIN_SET_CHILD_RECORD_EVENT] } }) { totalCount }
            reverseRecords24h: events(first: 1, where: { block: { timestamp: { greaterThanOrEqualTo: $d24 } }, type: { in: [REVERSE_RECORD_CLAIM_EVENT, REVERSE_RECORD_UPDATE_EVENT] } }) { totalCount }
            marketplace7d: events(first: 1, where: { block: { timestamp: { greaterThanOrEqualTo: $d7 } }, type: { in: [OFFER_PLACED_EVENT, OFFER_EXECUTED_EVENT, BUY_OFFER_PLACED_EVENT, BUY_OFFER_EXECUTED_EVENT, AUCTION_BID_EVENT, AUCTION_SETTLE_EVENT] } }) { totalCount }
            registrations7d: events(first: 1, where: { block: { timestamp: { greaterThanOrEqualTo: $d7 } }, type: { in: [DOMAIN_BUY_EVENT, AUCTION_SETTLE_EVENT] } }) { totalCount }
            highValueRecent: events(first: 14, order: { field: TIMESTAMP, direction: DESC }, where: { block: { timestamp: { greaterThanOrEqualTo: $d30 } }, price: { greaterThanOrEqualTo: $minHighValue }, type: { in: [DOMAIN_BUY_EVENT, DOMAIN_RENEW_EVENT, OFFER_PLACED_EVENT, OFFER_EXECUTED_EVENT, BUY_OFFER_PLACED_EVENT, BUY_OFFER_EXECUTED_EVENT] } }) {
                totalCount
                items {
                    __typename
                    id
                    type
                    sourceAddress
                    sourceAddressReverseRecord { domain { name } }
                    block { level timestamp }
                    ... on DomainBuyEvent { domainName price durationInDays operationGroupHash }
                    ... on DomainRenewEvent { domainName price durationInDays operationGroupHash }
                    ... on OfferPlacedEvent { domainName price priceWithoutFee expiresAtUtc tokenId operationGroupHash }
                    ... on OfferExecutedEvent { domainName price priceWithoutFee sellerAddress sellerAddressReverseRecord { domain { name } } tokenId operationGroupHash }
                    ... on BuyOfferPlacedEvent { domainName price priceWithoutFee expiresAtUtc domainOwner tokenId operationGroupHash }
                    ... on BuyOfferExecutedEvent { domainName price priceWithoutFee buyerAddress buyerAddressReverseRecord { domain { name } } tokenId operationGroupHash }
                }
            }
            liveAuctions: auctions(first: 8, where: { state: { in: [IN_PROGRESS] } }, order: { field: HIGHEST_BID_AMOUNT, direction: DESC }) {
                totalCount
                items { domainName state bidCount countOfUniqueBidders bidAmountSum endsAtUtc highestBid { amount bidder bidderReverseRecord { domain { name } } timestamp } operationGroupHash }
            }
            settlementAuctions: auctions(first: 6, where: { state: { in: [CAN_BE_SETTLED] } }, order: { field: ENDS_AT, direction: DESC }) {
                totalCount
                items { domainName state bidCount countOfUniqueBidders bidAmountSum endsAtUtc highestBid { amount bidder bidderReverseRecord { domain { name } } timestamp } operationGroupHash }
            }
            sellOffers: offers(first: 8, where: { state: { in: [ACTIVE] } }, order: { field: PRICE, direction: DESC }) {
                totalCount
                items { domain { name owner } state price priceWithoutFee createdAtUtc expiresAtUtc sellerAddress sellerAddressReverseRecord { domain { name } } operationGroupHash }
            }
            buyOffers: buyOffers(first: 6, where: { state: { in: [ACTIVE] } }, order: { field: PRICE, direction: DESC }) {
                totalCount
                items { domain { name owner } state price priceWithoutFee createdAtUtc expiresAtUtc buyerAddress buyerAddressReverseRecord { domain { name } } operationGroupHash }
            }
            expiringSoon: domains(first: 10, where: { level: { equalTo: 2 }, validity: VALID, expiresAtUtc: { greaterThan: $now, lessThanOrEqualTo: $soon } }, order: { field: EXPIRES_AT, direction: ASC }) {
                totalCount
                items { name expiresAtUtc owner ownerReverseRecord { domain { name } } address tokenId }
            }
        }`
    };
}

function gqlRecentEventsQuery() {
    return {
        query: `query TezosDomainsRecentEvents {
            recentEvents: events(first: 22, order: { field: TIMESTAMP, direction: DESC }, where: { type: { notIn: [DOMAIN_COMMIT_EVENT] } }) {
                totalCount
                items {
                    __typename
                    id
                    type
                    sourceAddress
                    sourceAddressReverseRecord { domain { name } }
                    block { level timestamp }
                    ... on DomainBuyEvent { domainName price durationInDays domainOwnerAddress operationGroupHash }
                    ... on DomainRenewEvent { domainName price durationInDays operationGroupHash }
                    ... on DomainSetChildRecordEvent { domainName isNewRecord domainOwnerAddress operationGroupHash }
                    ... on DomainTransferEvent { domainName newOwner newOwnerReverseRecord { domain { name } } operationGroupHash }
                    ... on OfferPlacedEvent { domainName price priceWithoutFee expiresAtUtc tokenId operationGroupHash }
                    ... on OfferExecutedEvent { domainName price priceWithoutFee sellerAddress sellerAddressReverseRecord { domain { name } } tokenId operationGroupHash }
                    ... on BuyOfferPlacedEvent { domainName price priceWithoutFee expiresAtUtc domainOwner tokenId operationGroupHash }
                    ... on BuyOfferExecutedEvent { domainName price priceWithoutFee buyerAddress buyerAddressReverseRecord { domain { name } } tokenId operationGroupHash }
                    ... on AuctionBidEvent { domainName bidAmount previousBidAmount previousBidderAddress transactionAmount operationGroupHash }
                    ... on AuctionSettleEvent { domainName winningBid registrationDurationInDays operationGroupHash }
                }
            }
        }`
    };
}

function gqlNameLookupQuery(name) {
    return {
        variables: { name },
        query: `query TezosDomainsNameLookup($name: String!) {
            block { level timestamp }
            domain(name: $name) {
                name
                address
                owner
                expiresAtUtc
                level
                tokenId
                ownerReverseRecord { domain { name } }
                addressReverseRecord { domain { name } }
            }
            currentAuction(domainName: $name) {
                domainName
                state
                bidCount
                countOfUniqueBidders
                bidAmountSum
                endsAtUtc
                highestBid { amount bidder bidderReverseRecord { domain { name } } timestamp }
                operationGroupHash
            }
            currentOffer(domainName: $name) {
                domain { name owner }
                state
                price
                priceWithoutFee
                createdAtUtc
                expiresAtUtc
                sellerAddress
                sellerAddressReverseRecord { domain { name } }
                operationGroupHash
            }
            buyOffers(first: 3, where: { domainName: { equalTo: $name }, state: { in: [ACTIVE] } }, order: { field: PRICE, direction: DESC }) {
                totalCount
                items {
                    domain { name owner }
                    state
                    price
                    priceWithoutFee
                    expiresAtUtc
                    buyerAddress
                    buyerAddressReverseRecord { domain { name } }
                    operationGroupHash
                }
            }
            recentEvents: events(first: 4, order: { field: TIMESTAMP, direction: DESC }, where: { domainName: { equalTo: $name }, type: { notIn: [DOMAIN_COMMIT_EVENT] } }) {
                totalCount
                items {
                    __typename
                    id
                    type
                    sourceAddress
                    sourceAddressReverseRecord { domain { name } }
                    block { level timestamp }
                    ... on DomainBuyEvent { domainName price durationInDays domainOwnerAddress operationGroupHash }
                    ... on DomainRenewEvent { domainName price durationInDays operationGroupHash }
                    ... on DomainSetChildRecordEvent { domainName isNewRecord domainOwnerAddress operationGroupHash }
                    ... on DomainTransferEvent { domainName newOwner newOwnerReverseRecord { domain { name } } operationGroupHash }
                    ... on OfferPlacedEvent { domainName price priceWithoutFee expiresAtUtc tokenId operationGroupHash }
                    ... on OfferExecutedEvent { domainName price priceWithoutFee sellerAddress sellerAddressReverseRecord { domain { name } } tokenId operationGroupHash }
                    ... on BuyOfferPlacedEvent { domainName price priceWithoutFee expiresAtUtc domainOwner tokenId operationGroupHash }
                    ... on BuyOfferExecutedEvent { domainName price priceWithoutFee buyerAddress buyerAddressReverseRecord { domain { name } } tokenId operationGroupHash }
                    ... on AuctionBidEvent { domainName bidAmount previousBidAmount previousBidderAddress transactionAmount operationGroupHash }
                    ... on AuctionSettleEvent { domainName winningBid registrationDurationInDays operationGroupHash }
                }
            }
        }`
    };
}

async function fetchTezosDomainsGraphql(body) {
    const response = await fetch(TEZOS_DOMAINS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Tezos Domains GraphQL ${response.status}`);
    const payload = await response.json();
    if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join('; '));
    return payload.data || {};
}

async function fetchTezosDomainsData() {
    const [data, recentData] = await Promise.all([
        fetchTezosDomainsGraphql(gqlQuery()),
        fetchTezosDomainsGraphql(gqlRecentEventsQuery()).catch(() => ({ recentEvents: null }))
    ]);
    return normalizeData({ ...data, recentEvents: recentData.recentEvents || data.recentEvents });
}

function safeItems(connection, limit = Infinity) {
    return (connection?.items || [])
        .filter((item) => isLikelySafeName(item.domainName || item.domain?.name || item.name || reverseName(item.sourceAddressReverseRecord)))
        .slice(0, limit);
}

function normalizeData(data) {
    const recentEvents = safeItems(data.recentEvents, 14);
    const premiumCutoff = Number(MIN_HIGH_VALUE_MUTEZ);
    const highValueRecent = safeItems(data.highValueRecent, 14)
        .filter((event) => eventValueNumber(event) >= premiumCutoff)
        .sort((a, b) => eventValueNumber(b) - eventValueNumber(a))
        .slice(0, 10);
    const liveAuctions = safeItems(data.liveAuctions, 6);
    const settlementAuctions = safeItems(data.settlementAuctions, 4);
    const sellOffers = safeItems(data.sellOffers, 6);
    const buyOffers = safeItems(data.buyOffers, 5);
    const expiringSoon = safeItems(data.expiringSoon, 8);
    const latestEvent = recentEvents[0] || highValueRecent[0] || null;
    const freshTimestamp = latestEvent?.block?.timestamp || data.block?.timestamp || new Date().toISOString();

    return {
        block: data.block || {},
        counts: {
            registrations24h: data.registrations24h?.totalCount || 0,
            renewals24h: data.renewals24h?.totalCount || 0,
            transfers24h: data.transfers24h?.totalCount || 0,
            subdomains24h: data.subdomains24h?.totalCount || 0,
            reverseRecords24h: data.reverseRecords24h?.totalCount || 0,
            marketplace7d: data.marketplace7d?.totalCount || 0,
            registrations7d: data.registrations7d?.totalCount || 0,
            allEvents: data.recentEvents?.totalCount || 0,
            activeAuctions: data.liveAuctions?.totalCount || 0,
            settlementAuctions: data.settlementAuctions?.totalCount || 0,
            sellOffers: data.sellOffers?.totalCount || 0,
            buyOffers: data.buyOffers?.totalCount || 0,
            expiringSoon: data.expiringSoon?.totalCount || 0,
            highValue30d: data.highValueRecent?.totalCount || 0
        },
        recentEvents,
        highValueRecent,
        liveAuctions,
        settlementAuctions,
        sellOffers,
        buyOffers,
        expiringSoon,
        fetchedAt: new Date().toISOString(),
        freshTimestamp
    };
}

function chamberStatus(data) {
    const events24h = Number(data?.counts?.registrations24h || 0)
        + Number(data?.counts?.renewals24h || 0)
        + Number(data?.counts?.transfers24h || 0)
        + Number(data?.counts?.subdomains24h || 0)
        + Number(data?.counts?.reverseRecords24h || 0);
    if (events24h >= 10 || Number(data?.counts?.marketplace7d || 0) >= 6) {
        return { label: 'Name rush', className: 'hot', detail: `${events24h} identity moves in 24h` };
    }
    if (Number(data?.counts?.activeAuctions || 0) > 0 || Number(data?.counts?.buyOffers || 0) > 0) {
        return { label: 'Market live', className: 'live', detail: 'auctions and offers are open' };
    }
    return { label: 'Identity pulse', className: 'steady', detail: 'fresh names and renewals are flowing' };
}

function featuredName(data) {
    const high = data?.highValueRecent?.find((event) => eventValue(event));
    const recentBuy = data?.recentEvents?.find((event) => event?.type === 'DOMAIN_BUY_EVENT' || event?.type === 'AUCTION_SETTLE_EVENT');
    const liveAuction = data?.liveAuctions?.[0];
    const offer = data?.buyOffers?.[0] || data?.sellOffers?.[0];
    return high || recentBuy || liveAuction || offer || data?.expiringSoon?.[0] || null;
}

function featuredNameText(item) {
    if (!item) return 'Names moving';
    return item.domainName || item.domain?.name || item.name || reverseName(item.sourceAddressReverseRecord) || 'Names moving';
}

function featuredReason(item) {
    if (!item) return 'fresh identity activity';
    if (item.type) {
        const value = eventValue(item);
        const priced = value ? ` · ${formatTez(value)}` : '';
        return `${eventTypeChip(item)} move${priced}`;
    }
    if (item.state === 'IN_PROGRESS') {
        return `top live auction · ${formatTez(item.highestBid?.amount || item.bidAmountSum)}`;
    }
    if (item.price) {
        return `${item.buyerAddress ? 'top buy offer' : 'top ask'} · ${formatTez(item.price)}`;
    }
    if (item.expiresAtUtc) {
        return `renewal cliff · drops in ${formatTimeDistance(item.expiresAtUtc)}`;
    }
    return 'fresh identity activity';
}

function buildPulseMetrics(data) {
    const counts = data?.counts || {};
    return [
        ['24h names', String(Number(counts.registrations24h || 0) + Number(counts.renewals24h || 0)), 'registered + renewed'],
        ['Reverse', formatCount(counts.reverseRecords24h), '24h identity claims'],
        ['7d reg', formatCount(counts.registrations7d), 'new ownership'],
        ['Market', formatCount(counts.marketplace7d), '7d bids/offers'],
        ['Auctions', formatCount(counts.activeAuctions), 'live bidding'],
        ['30d drops', formatCount(counts.expiringSoon), 'renewal cliffs']
    ];
}

function buildChamberPulseMetrics(data) {
    const counts = data?.counts || {};
    return [
        ['24h names', String(Number(counts.registrations24h || 0) + Number(counts.renewals24h || 0)), 'registered + renewed'],
        ['24h reverse', formatCount(counts.reverseRecords24h), 'identity claims'],
        ['24h transfers', formatCount(counts.transfers24h), 'ownership moves'],
        ['7d registrations', formatCount(counts.registrations7d), 'fresh claims'],
        ['7d market', formatCount(counts.marketplace7d), 'bids/offers/settles'],
        ['Live auctions', formatCount(counts.activeAuctions), 'in progress'],
        ['Active asks', formatCount(counts.sellOffers), 'sell offers'],
        ['30d drops', formatCount(counts.expiringSoon), 'renewal cliffs']
    ];
}

function renderEntryMetric([label, value, note], index) {
    return `
        <div class="td-entry-metric" data-td-entry-metric="${index}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <em>${escapeHtml(note)}</em>
        </div>
    `;
}

function renderEntryTape(data) {
    const items = (data?.recentEvents || []).slice(0, 4);
    if (!items.length) {
        return '<div class="td-entry-tape-empty">Waiting for the next Tezos Domains event.</div>';
    }
    return items.map((event) => {
        const name = domainNameFromEvent(event);
        return `
            <div class="td-entry-tape-row" data-tone="${escapeHtml(eventTone(event))}">
                <strong>${escapeHtml(name)}</strong>
                <span>${escapeHtml(eventLabel(event))}</span>
            </div>
        `;
    }).join('');
}

function renderEntryCard(data) {
    const status = chamberStatus(data);
    const feature = featuredName(data);
    const featureName = featuredNameText(feature);
    const featureReason = featuredReason(feature);
    return `
        <button class="card-copy-link" type="button" data-copy-hash="#domains" aria-label="Copy Tezos Domains Chamber direct link" title="Copy Tezos Domains link">🔗</button>
        <div class="card-inner">
            <div class="card-front tezos-domains-entry-front">
                <div class="td-entry-main">
                    <h2 class="stat-label">Tezos Domains</h2>
                    <div class="td-entry-hero">
                        <span class="td-entry-mark" aria-hidden="true">.tez</span>
                        <strong id="tezos-domains-entry-feature">${escapeHtml(featureName)}</strong>
                    </div>
                    <div class="td-entry-feature-reason" id="tezos-domains-entry-feature-reason">${escapeHtml(featureReason)}</div>
                    <p class="stat-description">Live .tez market pulse for registrations, reverse-record claims, auctions, offers, and 30-day renewal cliffs.</p>
                    <div class="chamber-entry-status live" id="tezos-domains-entry-status"><span class="entry-live-dot"></span>${escapeHtml(status.label)} · ${escapeHtml(status.detail)}</div>
                </div>
                <div class="td-entry-metrics" aria-label="Tezos Domains chamber pulse">
                    ${buildPulseMetrics(data).map(renderEntryMetric).join('')}
                </div>
                <div class="td-entry-tape" id="tezos-domains-entry-tape" aria-label="Recent Tezos Domains events">
                    ${renderEntryTape(data)}
                </div>
            </div>
            <div class="card-back" aria-hidden="true">
                <h2 class="stat-label">Tezos Domains</h2>
                <div class="stat-value">.tez</div>
                <p class="stat-description">Open live name activity.</p>
            </div>
        </div>
    `;
}

function updateEntryCard(data) {
    const card = document.getElementById('tezos-domains-entry-card');
    if (!card || !data) return;
    const status = chamberStatus(data);
    card.classList.toggle('chamber-entry-risk', status.className === 'hot');
    card.classList.toggle('chamber-entry-live', status.className !== 'hot');
    const feature = card.querySelector('#tezos-domains-entry-feature');
    const featured = featuredName(data);
    if (feature) feature.textContent = featuredNameText(featured);
    const featureReasonEl = card.querySelector('#tezos-domains-entry-feature-reason');
    if (featureReasonEl) featureReasonEl.textContent = featuredReason(featured);
    const statusEl = card.querySelector('#tezos-domains-entry-status');
    if (statusEl) statusEl.innerHTML = `<span class="entry-live-dot"></span>${escapeHtml(status.label)} · ${escapeHtml(status.detail)}`;
    const metricEls = card.querySelectorAll('.td-entry-metric');
    buildPulseMetrics(data).forEach((metric, index) => {
        const el = metricEls[index];
        if (!el) return;
        const [label, value, note] = metric;
        const labelEl = el.querySelector('span');
        const valueEl = el.querySelector('strong');
        const noteEl = el.querySelector('em');
        if (labelEl) labelEl.textContent = label;
        if (valueEl) valueEl.textContent = value;
        if (noteEl) noteEl.textContent = note;
    });
    const tape = card.querySelector('#tezos-domains-entry-tape');
    if (tape) tape.innerHTML = renderEntryTape(data);
    card.dataset.updatedLabel = `Tezos Domains · ${formatAge(data.freshTimestamp)}`;
    card.classList.toggle('chamber-data-stale', Date.now() - new Date(data.freshTimestamp).getTime() > STALE_MS);
    window.syncChamberEntryFooters?.(card);
}

function renderMetric(label, value, note = '') {
    return `
        <div class="td-pulse-metric">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            ${note ? `<em>${escapeHtml(note)}</em>` : ''}
        </div>
    `;
}

function lookupStatus(result) {
    const registered = Boolean(result.domain?.owner || result.domain?.tokenId || result.domain?.expiresAtUtc);
    if (result.currentAuction) {
        return {
            tone: 'market',
            label: 'Auction live',
            detail: `${formatCount(result.currentAuction.bidCount || 0)} bid${Number(result.currentAuction.bidCount) === 1 ? '' : 's'} · ends ${formatDate(result.currentAuction.endsAtUtc)}`
        };
    }
    if (result.currentOffer) {
        return {
            tone: 'market',
            label: 'Listed',
            detail: `${formatTez(result.currentOffer.price)} ask · expires ${formatDate(result.currentOffer.expiresAtUtc)}`
        };
    }
    if (registered) {
        return {
            tone: 'registered',
            label: 'Registered',
            detail: result.domain?.expiresAtUtc ? `expires ${formatDate(result.domain.expiresAtUtc)}` : 'owned name'
        };
    }
    return {
        tone: 'available',
        label: 'Looks available',
        detail: 'No active record, auction, or sell offer returned'
    };
}

function renderLookupField(label, value, note = '') {
    if (!value) return '';
    return `
        <div class="td-lookup-field">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            ${note ? `<em>${escapeHtml(note)}</em>` : ''}
        </div>
    `;
}

function normalizeLookupData(name, data) {
    return {
        name,
        block: data.block || {},
        domain: data.domain || null,
        currentAuction: data.currentAuction || null,
        currentOffer: data.currentOffer || null,
        buyOffers: {
            totalCount: data.buyOffers?.totalCount || 0,
            items: safeItems(data.buyOffers, 3)
        },
        recentEvents: {
            totalCount: data.recentEvents?.totalCount || 0,
            items: safeItems(data.recentEvents, 4)
        }
    };
}

function renderLookupResult(state = lookupState) {
    const status = state.status || 'idle';
    if (status === 'loading') {
        return `
            <div class="td-lookup-result loading" id="tezos-domains-lookup-result">
                <span class="td-lookup-state">Checking ${escapeHtml(state.name)}...</span>
            </div>
        `;
    }
    if (status === 'error') {
        return `
            <div class="td-lookup-result error" id="tezos-domains-lookup-result">
                <span class="td-lookup-state">Lookup paused</span>
                <p>${escapeHtml(state.error || 'Tezos Domains did not return a usable answer.')}</p>
            </div>
        `;
    }
    if (status !== 'success' || !state.result) {
        return `
            <div class="td-lookup-result idle" id="tezos-domains-lookup-result">
                <span class="td-lookup-state">Type a name to check availability, owner, offers, auctions, and recent moves.</span>
            </div>
        `;
    }

    const result = state.result;
    const statusInfo = lookupStatus(result);
    const owner = actorLabel(result.domain?.owner, result.domain?.ownerReverseRecord);
    const resolved = result.domain?.address || reverseName(result.domain?.addressReverseRecord);
    const topBuyOffer = result.buyOffers.items[0];
    const auction = result.currentAuction;
    const recent = result.recentEvents.items.slice(0, 2);
    const actionLabel = statusInfo.tone === 'available' ? 'Register on Tezos Domains' : 'View on Tezos Domains';
    const fields = [
        renderLookupField('Status', statusInfo.label, statusInfo.detail),
        renderLookupField('Owner', result.domain?.owner ? owner : '', result.domain?.owner || ''),
        renderLookupField('Resolves to', resolved, result.domain?.address ? 'address record' : ''),
        renderLookupField('Expires', result.domain?.expiresAtUtc ? formatTimeDistance(result.domain.expiresAtUtc) : '', formatDate(result.domain?.expiresAtUtc)),
        renderLookupField('Live bid', auction ? formatTez(auction.highestBid?.amount || auction.bidAmountSum) : '', auction ? actorLabel(auction.highestBid?.bidder, auction.highestBid?.bidderReverseRecord) : ''),
        renderLookupField('Top buy offer', topBuyOffer ? formatTez(topBuyOffer.price) : '', topBuyOffer ? actorLabel(topBuyOffer.buyerAddress, topBuyOffer.buyerAddressReverseRecord) : '')
    ].filter(Boolean).join('');

    return `
        <div class="td-lookup-result success" id="tezos-domains-lookup-result" data-tone="${escapeHtml(statusInfo.tone)}">
            <div class="td-lookup-head">
                <div>
                    <span class="td-lookup-state">${escapeHtml(statusInfo.label)}</span>
                    <strong>${escapeHtml(result.name)}</strong>
                    <p>${escapeHtml(statusInfo.detail)}. Open the dApp for current registration pricing and wallet actions.</p>
                </div>
                <div class="td-lookup-actions">
                    <a class="glass-button td-primary-link" href="${escapeHtml(domainUrl(result.name))}" target="_blank" rel="noopener">${escapeHtml(actionLabel)}</a>
                    <a class="glass-button" href="${escapeHtml(ledgerFlowUrl(result.name))}">Ledger Flow</a>
                </div>
            </div>
            <div class="td-lookup-fields">${fields}</div>
            ${recent.length ? `<div class="td-lookup-recent">${renderEventRows(recent, '')}</div>` : ''}
        </div>
    `;
}

function renderLookupPanel() {
    const value = lookupState.name || '';
    return `
        <section class="td-command-panel td-lookup-panel chamber-anim-fade" style="animation-delay:60ms">
            <div class="td-command-copy">
                <span class="td-kicker">Name rush scanner</span>
                <h3>Check a .tez name, then jump straight to registration, owner, auction, offer, and recent activity context.</h3>
            </div>
            <form class="td-lookup-form" id="tezos-domains-lookup-form" autocomplete="off">
                <input id="tezos-domains-lookup-input" class="td-lookup-input" name="tezos-domain" type="search" inputmode="url" placeholder="builder or builder.tez" value="${escapeHtml(value)}" aria-label="Check a Tezos Domains name">
                <button class="glass-button td-primary-link" type="submit">Check</button>
            </form>
            ${renderLookupResult(lookupState)}
            <div class="td-command-actions">
                <a class="glass-button" href="https://app.tezos.domains/" target="_blank" rel="noopener">Open dApp</a>
                <a class="glass-button" href="https://developers.tezos.domains/integrating-tezos-domains/graphql" target="_blank" rel="noopener">Docs</a>
            </div>
        </section>
    `;
}

function updateLookupResult(root = document) {
    const result = root.querySelector?.('#tezos-domains-lookup-result');
    if (result) result.outerHTML = renderLookupResult(lookupState);
}

async function runDomainLookup(value, { silentEmpty = false } = {}) {
    const { name, error } = normalizeDomainInput(value);
    if (!name) {
        lookupState = { status: 'idle', name: '' };
        updateLookupResult(document);
        return;
    }
    if (error) {
        if (silentEmpty && String(value || '').trim().length < 3) return;
        lookupState = { status: 'error', name, error };
        updateLookupResult(document);
        return;
    }

    const token = ++lookupToken;
    lookupState = { status: 'loading', name };
    updateLookupResult(document);
    try {
        const data = await fetchTezosDomainsGraphql(gqlNameLookupQuery(name));
        if (token !== lookupToken) return;
        lookupState = { status: 'success', name, result: normalizeLookupData(name, data) };
        updateLookupResult(document);
    } catch (error) {
        if (token !== lookupToken) return;
        lookupState = { status: 'error', name, error: error?.message || 'Lookup failed.' };
        updateLookupResult(document);
    }
}

function renderEventRows(events, empty = 'No matching Tezos Domains events returned.', options = {}) {
    if (!events?.length) return `<div class="td-empty">${escapeHtml(empty)}</div>`;
    return events.map((event) => {
        const name = domainNameFromEvent(event);
        const op = event.operationGroupHash;
        const key = eventKey(event);
        const isNew = options.newEventKeys?.has(key);
        const tone = eventTone(event);
        return `
            <article class="td-event-row${isNew ? ' is-new' : ''}" data-tone="${escapeHtml(tone)}" data-event-key="${escapeHtml(key)}">
                <div class="td-event-main">
                    <a class="td-name-link" href="${escapeHtml(domainUrl(name))}" target="_blank" rel="noopener">${escapeHtml(name)}</a>
                    <span class="td-type-chip" data-tone="${escapeHtml(tone)}">${escapeHtml(eventTypeChip(event))}</span>
                </div>
                <span class="td-event-action">${escapeHtml(eventLabel(event))}</span>
                <small>${escapeHtml(actorLabel(event.sourceAddress, event.sourceAddressReverseRecord))} · <span${liveAgeAttr(event.block?.timestamp)}>${escapeHtml(formatAge(event.block?.timestamp))}</span></small>
                ${op ? `<a class="td-op-link" href="${escapeHtml(tzktOperationUrl(op))}" target="_blank" rel="noopener">${escapeHtml(shortHash(op))}</a>` : ''}
            </article>
        `;
    }).join('');
}

function renderAuctionRows(rows, empty = 'No live auctions are bidding right now.') {
    if (!rows?.length) return `<div class="td-empty">${escapeHtml(empty)}</div>`;
    return rows.map((auction) => {
        const live = auction.state === 'IN_PROGRESS';
        const overdue = !live && new Date(auction.endsAtUtc).getTime() < Date.now();
        const kind = live ? 'auction' : overdue ? 'settle-overdue' : 'settle';
        const timing = live
            ? `<span${liveCountdownAttr(auction.endsAtUtc, { prefix: 'ends in ', ended: 'ended' })}>${escapeHtml(`ends in ${formatTimeDistance(auction.endsAtUtc)}`)}</span>`
            : overdue
                ? `<span>settle window passed ${escapeHtml(formatDate(auction.endsAtUtc))} · <b${liveDurationSinceAttr(auction.endsAtUtc, { suffix: ' overdue', seconds: false })}>${escapeHtml(`${formatElapsedDuration(auction.endsAtUtc)} overdue`)}</b></span>`
                : `<span>settle window · ${escapeHtml(formatDate(auction.endsAtUtc))}</span>`;
        return `
        <article class="td-market-row" data-kind="${escapeHtml(kind)}">
            <a class="td-name-link" href="${escapeHtml(domainUrl(auction.domainName))}" target="_blank" rel="noopener">${escapeHtml(auction.domainName)}</a>
            <strong>${escapeHtml(formatTez(auction.highestBid?.amount || auction.bidAmountSum))}</strong>
            ${timing}
            <small>${escapeHtml(formatCount(auction.bidCount))} bid${Number(auction.bidCount) === 1 ? '' : 's'} · ${escapeHtml(actorLabel(auction.highestBid?.bidder, auction.highestBid?.bidderReverseRecord))}</small>
        </article>
    `;
    }).join('');
}

function isAspirationalAsk(offer) {
    return Number(offer?.price || 0) >= ASPIRATIONAL_ASK_MUTEZ;
}

function renderOfferRow(offer, kind, options = {}) {
    const actor = kind === 'buy'
        ? actorLabel(offer.buyerAddress, offer.buyerAddressReverseRecord)
        : actorLabel(offer.sellerAddress, offer.sellerAddressReverseRecord);
    const kindLabel = options.kindLabel || kind;
    const expires = offer.expiresAtUtc
        ? `<span${liveCountdownAttr(offer.expiresAtUtc, { prefix: 'expires in ', ended: 'expired', seconds: false })}>${escapeHtml(`expires in ${formatTimeDistance(offer.expiresAtUtc)}`)}</span>`
        : '<span>no expiry</span>';
    return `
        <article class="td-market-row" data-kind="${escapeHtml(kindLabel)}">
            <a class="td-name-link" href="${escapeHtml(domainUrl(offer.domain?.name))}" target="_blank" rel="noopener">${escapeHtml(offer.domain?.name || 'unknown.tez')}</a>
            <strong>${escapeHtml(formatTez(offer.price))}</strong>
            ${expires}
            <small>${escapeHtml(kind === 'buy' ? 'buyer' : 'seller')}: ${escapeHtml(actor)}</small>
        </article>
    `;
}

function renderSellOfferRows(rows) {
    if (!rows?.length) return '<div class="td-empty">No active sell offers returned.</div>';
    const realistic = rows.filter((offer) => !isAspirationalAsk(offer));
    const aspirational = rows.filter(isAspirationalAsk);
    const leadAsk = rows[0];
    const verdict = aspirational.length
        ? `${formatCount(aspirational.length)} aspirational ask${aspirational.length === 1 ? '' : 's'} above 100K XTZ are separated from the market signal.`
        : `Highest visible ask is ${formatTez(leadAsk?.price)}.`;
    return `
        <div class="td-market-verdict">${escapeHtml(verdict)}</div>
        ${(realistic.length ? realistic : []).map((offer) => renderOfferRow(offer, 'sell')).join('')}
        ${aspirational.length ? `
            <div class="td-aspirational-group">
                <span>Aspirational asks</span>
                ${aspirational.map((offer) => renderOfferRow(offer, 'sell', { kindLabel: 'aspirational' })).join('')}
            </div>
        ` : ''}
    `;
}

function renderOfferRows(rows, kind) {
    if (kind === 'sell') return renderSellOfferRows(rows);
    if (!rows?.length) return `<div class="td-empty">No active ${escapeHtml(kind)} offers returned.</div>`;
    return rows.map((offer) => renderOfferRow(offer, kind)).join('');
}

function renderExpiringRows(rows) {
    if (!rows?.length) return '<div class="td-empty">No soon-expiring .tez names returned.</div>';
    return rows.map((domain) => `
        <article class="td-expiry-row">
            <a class="td-name-link" href="${escapeHtml(domainUrl(domain.name))}" target="_blank" rel="noopener">${escapeHtml(domain.name)}</a>
            <strong${liveCountdownAttr(domain.expiresAtUtc, { prefix: 'drops in ', ended: 'renewal window passed' })}>${escapeHtml(`drops in ${formatTimeDistance(domain.expiresAtUtc)}`)}</strong>
            <span>${escapeHtml(formatDate(domain.expiresAtUtc))}</span>
            <small>${escapeHtml(actorLabel(domain.owner, domain.ownerReverseRecord))}</small>
        </article>
    `).join('');
}

function renderLegend() {
    const items = [
        ['register', 'register'],
        ['renewal', 'renew'],
        ['identity', 'reverse / transfer'],
        ['market', 'ask / bid / auction']
    ];
    return `
        <div class="td-event-legend chamber-anim-fade" style="animation-delay:105ms" aria-label="Tezos Domains event legend">
            ${items.map(([tone, label]) => `<span><i data-tone="${escapeHtml(tone)}"></i>${escapeHtml(label)}</span>`).join('')}
        </div>
    `;
}

function renderPanelVerdict(text) {
    return `<div class="td-panel-verdict">${escapeHtml(text)}</div>`;
}

function collectEventKeys(root) {
    return new Set([...root.querySelectorAll?.('.td-event-row[data-event-key]') || []].map((row) => row.dataset.eventKey).filter(Boolean));
}

function renderChamber(data, options = {}) {
    const status = chamberStatus(data);
    const featured = featuredName(data);
    const feature = featuredNameText(featured);
    const newEventKeys = options.newEventKeys || new Set();
    const recentCount = data.recentEvents?.length || 0;
    const premiumCount = data.highValueRecent?.length || 0;
    const liveAuctionCount = data.liveAuctions?.length || 0;
    const settlementCount = data.settlementAuctions?.length || 0;
    const dropCount = data.expiringSoon?.length || 0;
    return `
        <div class="chamber-header lb-header tezos-domains-header chamber-anim-fade">
            <div class="lb-system-strip tezos-domains-system-strip">
                <span class="lb-system-brand">Tezos Domains</span>
                <span>identity market</span>
                <span>live .tez market</span>
                <span class="td-block-chip">block ${escapeHtml(formatCount(data.block?.level || 0))}</span>
            </div>
            <div class="chamber-title-row">
                    <h2 id="tezos-domains-title" class="chamber-title">Tezos Domains Chamber</h2>
                <span class="chamber-badge tezos-domains-badge ${escapeHtml(status.className)}">${escapeHtml(status.label)}</span>
            </div>
            <div class="chamber-proposal-info">
                <div class="proposal-name">${escapeHtml(feature)}</div>
                <div class="proposal-hash">${escapeHtml(featuredReason(featured))} · ${escapeHtml(status.detail)} · latest <span${liveAgeAttr(data.freshTimestamp)}>${escapeHtml(formatAge(data.freshTimestamp))}</span></div>
            </div>
        </div>

        ${renderLookupPanel()}

        <section class="td-pulse-grid chamber-anim-fade" style="animation-delay:90ms" aria-label="Tezos Domains pulse metrics">
            ${buildChamberPulseMetrics(data).map(([label, value, note]) => renderMetric(label, value, note)).join('')}
        </section>
        ${renderLegend()}

        <div class="td-main-grid">
            <section class="td-panel td-panel-wide chamber-anim-fade" style="animation-delay:120ms">
                <div class="td-panel-title">Fresh Name Tape <span>registrations, renewals, records, transfers</span></div>
                ${renderPanelVerdict(`${recentCount} newest identity events; the newest label keeps ticking between indexer refreshes.`)}
                <div class="td-event-list">${renderEventRows(data.recentEvents, 'No matching Tezos Domains events returned.', { newEventKeys })}</div>
            </section>

            <section class="td-panel chamber-anim-fade" style="animation-delay:150ms">
                <div class="td-panel-title">Premium Moves <span>30d moves at 25 XTZ+</span></div>
                ${renderPanelVerdict(`${premiumCount} premium moves in the current sample; each row now names the event type.`)}
                <div class="td-event-list td-compact-list">${renderEventRows(data.highValueRecent, 'No premium moves above 25 XTZ in the current sample.')}</div>
            </section>

            <section class="td-panel chamber-anim-fade" style="animation-delay:180ms">
                <div class="td-panel-title">Auctions <span>live bids, then settlement backlog</span></div>
                ${renderPanelVerdict(`${liveAuctionCount} live auction${liveAuctionCount === 1 ? '' : 's'}; ${settlementCount} settlement window${settlementCount === 1 ? '' : 's'} ready or overdue.`)}
                <div class="td-market-list">
                    ${renderAuctionRows(data.liveAuctions)}
                    ${renderAuctionRows(data.settlementAuctions, 'No settlement backlog returned.')}
                </div>
            </section>

            <section class="td-panel chamber-anim-fade" style="animation-delay:210ms">
                <div class="td-panel-title">Sell Wall <span>highest active asks</span></div>
                <div class="td-market-list">${renderOfferRows(data.sellOffers, 'sell')}</div>
            </section>

            <section class="td-panel chamber-anim-fade" style="animation-delay:240ms">
                <div class="td-panel-title">Want List <span>active buy offers</span></div>
                <div class="td-market-list">${renderOfferRows(data.buyOffers, 'buy')}</div>
            </section>

            <section class="td-panel chamber-anim-fade" style="animation-delay:270ms">
                <div class="td-panel-title">30d Drops <span>names nearing renewal pressure</span></div>
                ${renderPanelVerdict(`${dropCount} name${dropCount === 1 ? '' : 's'} in the 30-day renewal cliff; countdowns name the action.`)}
                <div class="td-expiry-list">${renderExpiringRows(data.expiringSoon)}</div>
            </section>
        </div>

        <div class="chamber-footer tezos-domains-footer chamber-anim-fade" style="animation-delay:320ms">
            <span>Source: Tezos Domains GraphQL</span>
            <span class="chamber-footer-sep">·</span>
            <span>Latest indexer block ${escapeHtml(formatCount(data.block?.level || 0))}</span>
            <span class="chamber-footer-sep">·</span>
            <a class="panel-direct-link" href="/domains/" aria-label="Direct link to Tezos Domains Chamber">Direct: /domains/</a>
        </div>
    `;
}

function wireChamberControls(root) {
    root.querySelectorAll('.td-name-link, .td-op-link, .td-command-actions a, .panel-direct-link').forEach((link) => {
        if (link.dataset.tdLinkWired) return;
        link.dataset.tdLinkWired = '1';
        link.addEventListener('click', (event) => event.stopPropagation());
    });
    const form = root.querySelector('#tezos-domains-lookup-form');
    const input = root.querySelector('#tezos-domains-lookup-input');
    if (form && input && !form.dataset.tdLookupWired) {
        form.dataset.tdLookupWired = '1';
        const debouncedLookup = debounce(() => runDomainLookup(input.value, { silentEmpty: true }), 420);
        input.addEventListener('input', debouncedLookup);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            runDomainLookup(input.value);
        });
    }
}

async function refreshEntryCard({ force = false } = {}) {
    if (entryRefreshInFlight && !force) return;
    entryRefreshInFlight = true;
    try {
        const data = force || !lastData ? await fetchTezosDomainsData() : lastData;
        lastData = data;
        updateEntryCard(data);
    } catch (error) {
        console.debug('Tezos Domains entry refresh failed', error);
        const card = document.getElementById('tezos-domains-entry-card');
        if (card) {
            card.dataset.updatedLabel = 'Tezos Domains · refresh failed';
            card.classList.add('chamber-data-stale');
            window.syncChamberEntryFooters?.(card);
        }
    } finally {
        entryRefreshInFlight = false;
    }
}

async function refreshChamber({ initial = false, force = false } = {}) {
    const overlay = document.getElementById('tezos-domains-modal');
    const body = overlay?.querySelector('.tezos-domains-body');
    if (!overlay?.classList.contains('active') || !body || (chamberRefreshInFlight && !force)) return;
    chamberRefreshInFlight = true;
    try {
        const content = overlay.querySelector('.tezos-domains-content');
        const scrollTop = content?.scrollTop || 0;
        const lookupWasFocused = document.activeElement?.id === 'tezos-domains-lookup-input';
        const previousEventKeys = initial ? new Set() : collectEventKeys(body);
        const data = force || !lastData ? await fetchTezosDomainsData() : lastData;
        lastData = data;
        const newEventKeys = initial
            ? new Set()
            : new Set((data.recentEvents || []).map(eventKey).filter((key) => key && !previousEventKeys.has(key)));
        if (initial || !body.querySelector('.tezos-domains-header')) {
            body.innerHTML = renderChamber(data, { newEventKeys });
            wireChamberControls(body);
        } else {
            body.innerHTML = renderChamber(data, { newEventKeys });
            wireChamberControls(body);
        }
        startLiveTimeTicker(body);
        if (!initial && content) {
            requestAnimationFrame(() => {
                content.scrollTop = scrollTop;
                if (lookupWasFocused) body.querySelector('#tezos-domains-lookup-input')?.focus({ preventScroll: true });
            });
        }
        updateEntryCard(data);
    } catch (error) {
        console.warn('Tezos Domains chamber refresh failed', error);
        body.innerHTML = `
            <div class="chamber-error">
                <div class="chamber-error-icon">.tez</div>
                <h3>Tezos Domains data is unavailable</h3>
                <p>${escapeHtml(error?.message || 'The GraphQL endpoint did not answer.')}</p>
                <button class="chamber-retry-btn" id="tezos-domains-retry">Retry</button>
            </div>
        `;
        body.querySelector('#tezos-domains-retry')?.addEventListener('click', () => refreshChamber({ initial: true, force: true }));
    } finally {
        chamberRefreshInFlight = false;
    }
}

function startEntryRefresh() {
    stopEntryRefresh();
    entryTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshEntryCard({ force: true });
    }, ENTRY_REFRESH_MS);
}

function stopEntryRefresh() {
    if (entryTimer) {
        window.clearInterval(entryTimer);
        entryTimer = null;
    }
}

function startChamberRefresh() {
    stopChamberRefresh();
    chamberTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshChamber({ force: true });
    }, CHAMBER_REFRESH_MS);
}

function stopChamberRefresh() {
    if (chamberTimer) {
        window.clearInterval(chamberTimer);
        chamberTimer = null;
    }
}

function handleEscape(event) {
    if (event.key === 'Escape') closeTezosDomainsChamber();
}

export async function openTezosDomainsChamber(initialName = '') {
    ensureTezosDomainsStyles();
    const normalizedInitial = normalizeDomainInput(initialName);
    if (normalizedInitial.name && !normalizedInitial.error) {
        lookupState = { status: 'loading', name: normalizedInitial.name };
    } else if (!initialName) {
        lookupState = { status: 'idle', name: '' };
    }
    let overlay = document.getElementById('tezos-domains-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tezos-domains-modal';
        overlay.className = 'modal-overlay chamber-overlay lb-overlay tezos-domains-overlay';
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content lb-content tezos-domains-content" role="dialog" aria-modal="true" aria-labelledby="tezos-domains-title">
                <button class="modal-close chamber-close" type="button" aria-label="Close Tezos Domains Chamber">&times;</button>
                <div class="chamber-body lb-body tezos-domains-body">
                    <div class="chamber-loading">
                        <div class="chamber-loading-text">Opening Tezos Domains Chamber...</div>
                        <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.chamber-close')?.addEventListener('click', closeTezosDomainsChamber);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeTezosDomainsChamber();
        });
    }

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    savedBodyOverflow = document.body.style.overflow;
    savedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    await refreshChamber({ initial: true, force: true });
    if (normalizedInitial.name && !normalizedInitial.error) {
        runDomainLookup(normalizedInitial.name);
    } else if (normalizedInitial.error) {
        lookupState = { status: 'error', name: normalizedInitial.name, error: normalizedInitial.error };
        updateLookupResult(document);
    }
    startChamberRefresh();
}

export function closeTezosDomainsChamber() {
    document.removeEventListener('keydown', handleEscape);
    stopChamberRefresh();
    const overlay = document.getElementById('tezos-domains-modal');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = savedBodyOverflow || '';
    document.documentElement.style.overflow = savedHtmlOverflow || '';
}

function wireEntryCard(card) {
    if (!card || card.dataset.tezosDomainsWired) return;
    card.dataset.tezosDomainsWired = '1';
    const open = (event) => {
        if (event?.target?.closest?.('button, a, .card-tooltip')) return;
        openTezosDomainsChamber();
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        open(event);
    });
}

export function initTezosDomainsChamber() {
    ensureTezosDomainsStyles();
    const grid = document.getElementById('chambers-grid');
    if (!grid) return;
    let card = document.getElementById('tezos-domains-entry-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'tezos-domains-entry-card';
        card.className = 'stat-card chamber-entry-card chamber-entry-wide tezos-domains-entry-card chamber-entry-live';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', 'Open Tezos Domains Chamber');
        card.innerHTML = renderEntryCard({
            counts: {},
            recentEvents: [],
            highValueRecent: [],
            liveAuctions: [],
            sellOffers: [],
            buyOffers: [],
            expiringSoon: [],
            block: {},
            freshTimestamp: new Date().toISOString()
        });
        grid.appendChild(card);
    }
    wireEntryCard(card);
    window.openTezosDomainsChamber = openTezosDomainsChamber;
    window.closeTezosDomainsChamber = closeTezosDomainsChamber;
    refreshEntryCard({ force: true });
    startEntryRefresh();
}
