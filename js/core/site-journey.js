import {
    SITE_MAP,
    findCurrentSiteMapContext,
    findSiteMapDestination,
    findSiteMapEntry,
    siteMapRelated,
    siteMapRoute
} from './site-map.js';
import { normalizeLinkedL2Accounts } from './my-tezos-models.mjs';

export const MY_TEZOS_JOURNEY_ORIGIN_KEY = 'tezos-systems-my-tezos-origin-v1';

const ACTIVE_ADDRESS_KEY = 'tezos-systems-my-baker-address';
const LINKED_ETHERLINK_ACCOUNTS_KEY = 'tezos-systems-linked-etherlink-accounts-v1';
const SIMPLE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const IMPLICIT_ADDRESS_RE = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;
const CONTRACT_ADDRESS_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

const JOURNEY_SURFACES = new Set([
    'generic-wayfinder',
    'native-wayfinder',
    'site-handoff',
    'my-tezos'
]);

const JOURNEY_REASONS = new Set([
    'related-destination',
    'account-overview',
    'account-portfolio',
    'account-transactions',
    'account-collection',
    'account-story',
    'account-tezos-x',
    'phase-continuation',
    'supporting-destination',
    'return-to-origin',
    'role-baker',
    'role-staker',
    'role-delegator',
    'role-creator',
    'role-collector',
    'role-domain',
    'tab-portfolio',
    'tab-transactions',
    'tab-collection',
    'tab-story',
    'explicit-l2',
    'neutral-account'
]);

const PERSONAL_VIEW_BY_CONTEXT = Object.freeze({
    chamber: 'overview',
    'governance-guide': 'overview',
    health: 'overview',
    tz4: 'overview',
    leaderboard: 'overview',
    'leaderboard-discover': 'overview',
    'leaderboard-directory': 'overview',
    'leaderboard-signals': 'overview',
    'bakers-guide': 'overview',
    'staking-chamber': 'portfolio',
    staking: 'portfolio',
    calculator: 'portfolio',
    capital: 'portfolio',
    price: 'portfolio',
    whales: 'transactions',
    'whales-live': 'transactions',
    'whales-flows': 'transactions',
    'whales-dormant': 'transactions',
    'whales-awakenings': 'transactions',
    'ledger-flow': 'transactions',
    hen: 'collection',
    'capital-art': 'collection',
    'maxis-artist': 'collection',
    'maxis-collector': 'collection',
    'maxis-minter': 'collection',
    maxis: 'story',
    'maxis-passport': 'story',
    domains: 'story',
    tezosx: 'tezos-x',
    'l2-governance': 'tezos-x',
    'ecosystem-l2': 'tezos-x',
    'maxis-l2-governance': 'tezos-x'
});

const VIEW_REASON = Object.freeze({
    overview: 'account-overview',
    portfolio: 'account-portfolio',
    transactions: 'account-transactions',
    collection: 'account-collection',
    story: 'account-story',
    'tezos-x': 'account-tezos-x'
});

const DESTINATION_PRESENTATION = Object.freeze({
    health: { kicker: 'Operator context', icon: '◎' },
    chamber: { kicker: 'Governance', icon: '◈' },
    tz4: { kicker: 'Consensus keys', icon: '◇' },
    'staking-chamber': { kicker: 'Stake activity', icon: '↟' },
    calculator: { kicker: 'Reward planning', icon: '%' },
    'leaderboard-discover': { kicker: 'Delegation lane', icon: '♙' },
    'capital-art': { kicker: 'Creator economy', icon: '✦' },
    'maxis-artist': { kicker: 'On-chain career', icon: '✺', tone: 'passport' },
    'maxis-collector': { kicker: 'On-chain career', icon: '✺', tone: 'passport' },
    hen: { kicker: 'Live collecting', icon: '◌' },
    domains: { kicker: 'Account identity', icon: '@' },
    'ledger-flow': { kicker: 'Transfer paths', icon: '⇄' },
    'maxis-passport': { kicker: 'Career and seasons', icon: '✺', tone: 'passport' },
    price: { kicker: 'Market context', icon: '$' },
    whales: { kicker: 'Large movements', icon: '≈' },
    ecosystem: { kicker: 'App activity', icon: '⌁' },
    funding: { kicker: 'Support the community', icon: '✳' },
    anthology: { kicker: 'Protocol memory', icon: '◫' },
    tezosx: { kicker: 'Explicitly linked L2', icon: 'X' },
    'ecosystem-l2': { kicker: 'Etherlink activity', icon: '⌁' },
    'l2-governance': { kicker: 'Etherlink governance', icon: '◈' },
    pulse: { kicker: 'Network now', icon: '●' }
});

let journeyCaptureCleanup = null;

function contextFrom(value) {
    if (value?.entry) {
        return {
            id: value.intent?.id || value.id || value.entry.id,
            entry: value.entry,
            intent: value.intent || null,
            entryId: value.entryId || value.entry.id,
            intentId: value.intentId || value.intent?.id || null,
            route: value.route || value.intent?.href || value.entry.href
        };
    }
    const destination = typeof value === 'string'
        ? findSiteMapDestination(value)
        : value?.id
            ? findSiteMapDestination(value.id) || value
            : null;
    if (!destination) return findCurrentSiteMapContext();
    const entry = destination.parentId
        ? findSiteMapEntry(destination.parentId)
        : findSiteMapEntry(destination.id) || destination;
    const intent = destination.parentId ? destination : null;
    return {
        id: intent?.id || entry.id,
        entry,
        intent,
        entryId: entry.id,
        intentId: intent?.id || null,
        route: intent?.href || entry.href
    };
}

function destinationFamily(destination) {
    return destination?.parentId || destination?.id || '';
}

function personalDestination(view) {
    const entry = findSiteMapEntry('my-tezos');
    if (!entry) return null;
    const href = view === 'overview' ? '/my/' : `/my/?view=${encodeURIComponent(view)}`;
    return {
        ...entry,
        href,
        journeyReason: VIEW_REASON[view] || 'account-overview',
        journeyView: view
    };
}

export function countExplicitLinkedEtherlinkAccounts(activeAddress = '') {
    if (typeof localStorage === 'undefined') return 0;
    try {
        const address = String(activeAddress || localStorage.getItem(ACTIVE_ADDRESS_KEY) || '').trim();
        if (!address) return 0;
        return normalizeLinkedL2Accounts(
            JSON.parse(localStorage.getItem(LINKED_ETHERLINK_ACCOUNTS_KEY) || '[]')
        ).filter((entry) => (
            entry.included !== false
            && entry.linkedL1Addresses.includes(address)
        )).length;
    } catch {
        return 0;
    }
}

export function hasExplicitLinkedEtherlinkAccount(activeAddress = '') {
    return countExplicitLinkedEtherlinkAccounts(activeAddress) > 0;
}

/**
 * Contextual continuation list shared by the generic and native wayfinders.
 * Existing relation order remains the fallback; a My Tezos continuation is
 * promoted only where an account view naturally continues the current task.
 */
export function siteMapJourneyLinks(source, {
    preferredIds = [],
    limit = 4,
    hasLinkedL2 = hasExplicitLinkedEtherlinkAccount()
} = {}) {
    const context = contextFrom(source);
    const contextualView = PERSONAL_VIEW_BY_CONTEXT[context.id]
        || PERSONAL_VIEW_BY_CONTEXT[context.entryId]
        || null;
    const allowPersonal = contextualView !== 'tezos-x' || hasLinkedL2;
    const preferred = preferredIds
        .map(findSiteMapDestination)
        .filter(Boolean);
    if (contextualView && allowPersonal) preferred.unshift(personalDestination(contextualView));

    const candidates = [
        ...preferred,
        ...siteMapRelated(context.entryId, Math.max(limit * 2, 8)),
        ...SITE_MAP
    ];
    const seenIds = new Set();
    const seenRoutes = new Set();
    const seenFamilies = new Set();
    const output = [];
    for (const destination of candidates) {
        if (!destination) continue;
        const family = destinationFamily(destination);
        const route = siteMapRoute(destination);
        if (
            !destination.id
            || family === context.entryId
            || seenIds.has(destination.id)
            || seenRoutes.has(route)
            || seenFamilies.has(family)
        ) continue;
        seenIds.add(destination.id);
        seenRoutes.add(route);
        seenFamilies.add(family);
        output.push({
            ...destination,
            journeyReason: destination.journeyReason || 'related-destination'
        });
        if (output.length >= Math.max(0, limit)) break;
    }
    return output;
}

function normalizeOriginRecord(value) {
    const entryId = String(value?.entryId || '');
    const intentId = String(value?.intentId || '');
    const entry = findSiteMapEntry(entryId);
    if (!entry || entry.id === 'my-tezos') return null;
    if (intentId) {
        const intent = findSiteMapDestination(intentId);
        if (!intent || intent.parentId !== entry.id) return null;
    }
    return { entryId, intentId };
}

export function rememberMyTezosJourneyOrigin(value) {
    if (typeof sessionStorage === 'undefined') return null;
    const context = contextFrom(value);
    const record = normalizeOriginRecord({
        entryId: context.entryId,
        intentId: context.intentId || ''
    });
    if (!record) {
        clearMyTezosJourneyOrigin();
        return null;
    }
    try {
        sessionStorage.setItem(MY_TEZOS_JOURNEY_ORIGIN_KEY, JSON.stringify(record));
        return record;
    } catch {
        return null;
    }
}

export function readMyTezosJourneyOrigin() {
    if (typeof sessionStorage === 'undefined') return null;
    try {
        const parsed = JSON.parse(sessionStorage.getItem(MY_TEZOS_JOURNEY_ORIGIN_KEY) || 'null');
        const record = normalizeOriginRecord(parsed);
        if (!record || Object.keys(parsed || {}).sort().join(',') !== 'entryId,intentId') {
            clearMyTezosJourneyOrigin();
            return null;
        }
        return record;
    } catch {
        clearMyTezosJourneyOrigin();
        return null;
    }
}

export function clearMyTezosJourneyOrigin() {
    if (typeof sessionStorage !== 'undefined') {
        try {
            sessionStorage.removeItem(MY_TEZOS_JOURNEY_ORIGIN_KEY);
        } catch {}
    }
}

function canonicalJourneyId(value) {
    const id = String(value || '');
    return SIMPLE_ID_RE.test(id) && findSiteMapDestination(id) ? id : '';
}

export function journeyAnalyticsDetails({ from, to, surface, reason }) {
    const details = {
        from: canonicalJourneyId(from),
        to: canonicalJourneyId(to),
        surface: JOURNEY_SURFACES.has(surface) ? surface : '',
        reason: JOURNEY_REASONS.has(reason) ? reason : ''
    };
    return Object.values(details).every(Boolean) ? details : null;
}

function isUnmodifiedPrimaryClick(event, anchor) {
    return (
        event.button === 0
        && !event.defaultPrevented
        && !event.metaKey
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && (!anchor.target || anchor.target === '_self')
    );
}

function pointsToMyTezos(anchor) {
    try {
        const url = new URL(anchor.href, window.location.origin);
        return url.origin === window.location.origin && url.pathname.replace(/\/+$/, '') === '/my';
    } catch {
        return false;
    }
}

export function initSiteJourneyCapture() {
    if (typeof document === 'undefined') return () => {};
    if (journeyCaptureCleanup) return journeyCaptureCleanup;
    const onClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const directMyTezosButton = target?.closest('#my-tezos-btn');
        if (directMyTezosButton && event.isTrusted && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
            clearMyTezosJourneyOrigin();
            return;
        }
        const anchor = target?.closest('a[href]') || null;
        if (!anchor || !isUnmodifiedPrimaryClick(event, anchor)) return;

        const journey = anchor.matches('[data-site-journey]');
        if (pointsToMyTezos(anchor)) {
            if (journey && anchor.dataset.journeyFromEntry) {
                rememberMyTezosJourneyOrigin({
                    entry: findSiteMapEntry(anchor.dataset.journeyFromEntry),
                    entryId: anchor.dataset.journeyFromEntry,
                    intentId: anchor.dataset.journeyFromIntent || null,
                    intent: anchor.dataset.journeyFromIntent
                        ? findSiteMapDestination(anchor.dataset.journeyFromIntent)
                        : null
                });
            } else if (event.isTrusted) {
                clearMyTezosJourneyOrigin();
            }
        }

        if (!journey) return;
        if (anchor.dataset.journeyReturn === 'true') clearMyTezosJourneyOrigin();
        const details = journeyAnalyticsDetails({
            from: anchor.dataset.journeyFrom,
            to: anchor.dataset.journeyTo,
            surface: anchor.dataset.journeySurface,
            reason: anchor.dataset.journeyReason
        });
        if (details) window.trackTezosSystemsEvent?.('journey_follow', details);
    };
    document.addEventListener('click', onClick, true);
    journeyCaptureCleanup = () => {
        document.removeEventListener('click', onClick, true);
        journeyCaptureCleanup = null;
    };
    return journeyCaptureCleanup;
}

function creatorEvidence(story) {
    const stats = story?.creatorStats || {};
    return [
        stats.totalCreated,
        stats.collectionCount,
        stats.totalSalesCount,
        stats.totalSalesVolume
    ].some((value) => Number(value) > 0);
}

function validDomainAlias(value) {
    const alias = String(value || '').trim();
    return alias && alias.toLowerCase().endsWith('.tez') ? alias : '';
}

function destinationCard(id, {
    address = '',
    domainAlias = '',
    reason = 'neutral-account'
} = {}) {
    const destination = findSiteMapDestination(id);
    if (!destination) return null;
    let href = destination.href;
    if (id === 'ledger-flow' && address) href = `/#ledger-flow=${encodeURIComponent(address)}`;
    if (id === 'maxis-passport' && IMPLICIT_ADDRESS_RE.test(address)) {
        href = `/maxis/?view=passport&address=${encodeURIComponent(address)}`;
    }
    if (id === 'domains' && domainAlias) href = `/#domains=${encodeURIComponent(domainAlias)}`;
    const presentation = DESTINATION_PRESENTATION[id] || {};
    return {
        ...destination,
        href,
        kicker: presentation.kicker || destination.group || 'Keep exploring',
        icon: presentation.icon || '↗',
        tone: presentation.tone || 'default',
        reason
    };
}

function neutralCandidates(address, options = {}) {
    if (CONTRACT_ADDRESS_RE.test(address)) {
        return [
            destinationCard('ledger-flow', { ...options, address }),
            destinationCard('pulse', options),
            destinationCard('whales', options)
        ];
    }
    return [
        destinationCard('ledger-flow', { ...options, address }),
        destinationCard('maxis-passport', { ...options, address }),
        destinationCard('pulse', options)
    ];
}

function recommendationCandidates({ view, data, address, hasLinkedL2 }) {
    const ready = Boolean(
        address
        && data
        && data.fullAddress === address
        && data.loading !== true
    );
    const story = ready ? data.story : null;
    const domainAlias = ready ? validDomainAlias(story?.domainAlias) : '';
    const options = { address, domainAlias };
    const neutral = () => neutralCandidates(address, { ...options, reason: 'neutral-account' });

    if (view === 'portfolio') {
        return [
            destinationCard('ledger-flow', { ...options, reason: 'tab-portfolio' }),
            destinationCard('price', { ...options, reason: 'tab-portfolio' }),
            destinationCard('whales', { ...options, reason: 'tab-portfolio' })
        ];
    }
    if (view === 'transactions') {
        return [
            destinationCard('ledger-flow', { ...options, reason: 'tab-transactions' }),
            destinationCard('whales', { ...options, reason: 'tab-transactions' }),
            destinationCard('ecosystem', { ...options, reason: 'tab-transactions' })
        ];
    }
    if (view === 'collection') {
        if (ready && creatorEvidence(story)) {
            return [
                destinationCard('capital-art', { ...options, reason: 'role-creator' }),
                destinationCard('maxis-artist', { ...options, reason: 'role-creator' }),
                destinationCard('hen', { ...options, reason: 'role-creator' })
            ];
        }
        if (ready && Number(story?.nftAssetsCollected) > 0) {
            return [
                destinationCard('hen', { ...options, reason: 'role-collector' }),
                destinationCard('maxis-collector', { ...options, reason: 'role-collector' }),
                destinationCard('capital-art', { ...options, reason: 'role-collector' })
            ];
        }
        return [
            destinationCard('hen', { ...options, reason: 'tab-collection' }),
            destinationCard('capital-art', { ...options, reason: 'tab-collection' }),
            ...neutral()
        ];
    }
    if (view === 'story') {
        if (IMPLICIT_ADDRESS_RE.test(address)) {
            return [
                destinationCard('maxis-passport', { ...options, reason: 'tab-story' }),
                destinationCard(domainAlias ? 'domains' : 'anthology', { ...options, reason: 'tab-story' }),
                destinationCard('ledger-flow', { ...options, reason: 'tab-story' })
            ];
        }
        return [
            destinationCard('ledger-flow', { ...options, reason: 'tab-story' }),
            destinationCard(domainAlias ? 'domains' : 'anthology', { ...options, reason: 'tab-story' }),
            destinationCard('pulse', { ...options, reason: 'tab-story' })
        ];
    }
    if (view === 'tezos-x') {
        if (hasLinkedL2) {
            return [
                destinationCard('tezosx', { ...options, reason: 'explicit-l2' }),
                destinationCard('ecosystem-l2', { ...options, reason: 'explicit-l2' }),
                destinationCard('l2-governance', { ...options, reason: 'explicit-l2' })
            ];
        }
        return neutral();
    }

    if (ready && data.isBaker === true) {
        return [
            destinationCard('health', { ...options, reason: 'role-baker' }),
            destinationCard('chamber', { ...options, reason: 'role-baker' }),
            destinationCard('tz4', { ...options, reason: 'role-baker' })
        ];
    }
    if (ready && (data.isStaker === true || Number(data.staked) > 0)) {
        return [
            destinationCard('staking-chamber', { ...options, reason: 'role-staker' }),
            destinationCard('calculator', { ...options, reason: 'role-staker' }),
            destinationCard('ledger-flow', { ...options, reason: 'role-staker' })
        ];
    }
    if (ready && data.bakerAddr) {
        return [
            destinationCard('leaderboard-discover', { ...options, reason: 'role-delegator' }),
            destinationCard('health', { ...options, reason: 'role-delegator' }),
            destinationCard('staking', { ...options, reason: 'role-delegator' })
        ];
    }
    if (ready && creatorEvidence(story)) {
        return [
            destinationCard('capital-art', { ...options, reason: 'role-creator' }),
            destinationCard('maxis-artist', { ...options, reason: 'role-creator' }),
            destinationCard('hen', { ...options, reason: 'role-creator' })
        ];
    }
    if (ready && Number(story?.nftAssetsCollected) > 0) {
        return [
            destinationCard('hen', { ...options, reason: 'role-collector' }),
            destinationCard('maxis-collector', { ...options, reason: 'role-collector' }),
            destinationCard('capital-art', { ...options, reason: 'role-collector' })
        ];
    }
    if (ready && domainAlias) {
        return [
            destinationCard('domains', { ...options, reason: 'role-domain' }),
            destinationCard('ledger-flow', { ...options, reason: 'role-domain' }),
            destinationCard('maxis-passport', { ...options, reason: 'role-domain' })
        ];
    }
    return neutral();
}

function originDestination(origin) {
    const record = normalizeOriginRecord(origin);
    if (!record) return null;
    return findSiteMapDestination(record.intentId || record.entryId);
}

function returnCard(origin) {
    const destination = originDestination(origin);
    if (!destination) return null;
    return {
        ...destination,
        title: `Return to ${destination.title}`,
        detail: `Continue the thread in ${destination.title}.`,
        kicker: 'Continue the thread',
        icon: '↩',
        tone: 'default',
        reason: 'return-to-origin',
        isReturn: true
    };
}

/**
 * Select the two existing My Tezos continuation cards. Role claims are made
 * only after data for the active account is ready; Tezos X destinations appear
 * only after an explicit device-local L1/L2 link.
 */
export function buildMyTezosJourneyLinks({
    view = 'overview',
    data = null,
    address = '',
    hasLinkedL2 = false,
    origin = null
} = {}) {
    const activeAddress = String(address || '').trim();
    if (!activeAddress) return [];
    const candidates = recommendationCandidates({
        view: String(view || 'overview'),
        data,
        address: activeAddress,
        hasLinkedL2: hasLinkedL2 === true
    }).filter(Boolean);
    const resolvedOrigin = origin || readMyTezosJourneyOrigin();
    const returning = returnCard(resolvedOrigin);
    if (!returning) return candidates.slice(0, 2);

    const originFamily = destinationFamily(originDestination(resolvedOrigin));
    const next = candidates.find((candidate) => (
        destinationFamily(candidate) !== originFamily
        && candidate.id !== returning.id
    ));
    return next ? [returning, next] : [returning, ...candidates].slice(0, 2);
}
