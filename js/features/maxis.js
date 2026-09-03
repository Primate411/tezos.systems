import { requestChamberClose } from '../ui/chamber-accessibility.js';
/**
 * Tezos Maxis Chamber
 * Ongoing Maxis identities, protocol seasons, address passports, and immutable champions.
 */

import { GENERATED_PROOFBOOK_SCHEDULE_LABEL } from '../core/freshness-contracts.mjs';
import { versionedAsset } from '../core/asset-version.js';
import { sha256Text } from '../core/sha256.js';
import { escapeHtml, formatUtcDateTime } from '../core/utils.js';
import { isTezDomainName, normalizeTezDomainName, resolveTezDomainAddress } from '../core/tezos-domains.js';
import { activateChamberDialog, deactivateChamberDialog, wireChamberLauncher } from '../ui/chamber-accessibility.js';
import { ensureChamberStylesheet } from '../ui/chamber-styles.js';

const LEGACY_DATA_URL = '/data/maxis-leaders.json';
const CAREER_DATA_URL = '/data/maxis-careers.json';
const L2_GOVERNANCE_DATA_URL = '/data/maxis-l2-governance.json';
const MANIFEST_URL = '/data/maxis/manifest.json';
const ENTRY_SUMMARY_URL = '/data/maxis/entry-summary.json';
const MAXIS_CSS_URL = versionedAsset('/css/maxis.min.css');
const MAXIS_SHARE_URL = 'https://tezos.systems/maxis/';
const MY_TEZOS_ADDRESS_KEY = 'tezos-systems-my-baker-address';
const SHARE_STORAGE_KEY = 'tezos-systems-maxis-shares-v1';
const MAXIS_HOT_SNAPSHOT_KEY = 'tezos-systems-maxis-hot-snapshot-v1';
const MAXIS_HOT_SIGNAL_TTL_MS = 24 * 60 * 60 * 1000;
const VIEW_KEYS = ['maxis', 'season', 'passport', 'champions'];
const VIEW_ALIASES = {
    crown: 'maxis',
    'crown-hall': 'maxis',
    ongoing: 'maxis',
    open: 'maxis'
};
const CATEGORY_ORDER = [
    'unicorn',
    'staking',
    'delegation',
    'governance',
    'l2_governance',
    'collector',
    'artist',
    'minter',
    'defi',
    'liquidity',
    'bridge',
    'builder',
    'transaction',
    'gaming'
];
const CATEGORY_ALIASES = {
    art: 'artist',
    artists: 'artist',
    mint: 'minter',
    minting: 'minter',
    transactions: 'transaction',
    l1_governance: 'governance',
    l2: 'l2_governance',
    etherlink_governance: 'l2_governance',
    tezos_x_governance: 'l2_governance',
    governance_maxi: 'governance',
    l2_governance_maxi: 'l2_governance',
    collector_maxi: 'collector',
    unicorn_maxi: 'unicorn'
};
const CATEGORY_ICONS = {
    transaction: '↻',
    collector: '◈',
    artist: '✦',
    minter: '◆',
    defi: '⇄',
    gaming: '▲',
    governance: '✓',
    l2_governance: 'X',
    staking: '⬡',
    delegation: '⌁',
    liquidity: '≈',
    bridge: '↔',
    builder: '⌘',
    unicorn: '✺'
};
const CATEGORY_LABELS = {
    transaction: 'Transactions',
    collector: 'Collector',
    artist: 'Art',
    minter: 'Mint',
    defi: 'DeFi',
    gaming: 'Gaming',
    governance: 'L1 Governance',
    l2_governance: 'L2 Governance',
    staking: 'Staking',
    delegation: 'Delegation',
    liquidity: 'Liquidity',
    bridge: 'Bridge',
    builder: 'Builder',
    unicorn: 'Unicorn'
};
const VIEW_META = {
    maxis: { icon: '♛', label: 'Maxis' },
    season: { icon: '◉', label: 'Season' },
    passport: { icon: '✺', label: 'Passport' },
    champions: { icon: '◇', label: 'Champions' }
};

let legacyPromise = null;
let careerPromise = null;
let l2GovernancePromise = null;
let manifestPromise = null;
let entrySummaryPromise = null;
let entryHydrationSerial = 0;
let lastLegacyBase = null;
let lastLegacy = null;
let lastCareer = null;
let lastL2Governance = null;
let l2GovernanceLoaded = false;
let lastManifest = null;
const summaryCache = new Map();
const shardCache = new Map();
const shardRequestCache = new Map();
let savedBodyOverflow = null;
let savedHtmlOverflow = null;
let initComplete = false;
let requestSerial = 0;
let summaryRequestSerial = 0;
let archiveRequestSerial = 0;
let legacyRequestSerial = 0;
let manifestRequestSerial = 0;
let l2GovernanceRequestSerial = 0;
const seasonSummaryRequestSerials = new Map();

const chamberState = {
    view: 'maxis',
    seasonId: null,
    lane: null,
    laneByView: { maxis: null, season: null },
    legacy: null,
    careers: null,
    careerError: '',
    l2Governance: null,
    l2GovernanceError: '',
    manifest: null,
    manifestLoading: false,
    manifestError: '',
    summary: null,
    summaryLoading: false,
    summaryError: '',
    entrySummaryLoading: false,
    entrySummaryError: '',
    selectorOpen: false,
    selectorFocusReturn: false,
    selectorWasOpenAtPointerDown: false,
    lastSelectorPointerType: '',
    rowDetail: null,
    passportAddress: '',
    passportInput: '',
    passportUsesSaved: false,
    passportProfile: null,
    passportCareer: null,
    passportLoading: false,
    passportLoadingStage: '',
    passportError: '',
    passportNote: '',
    passportRetryable: false,
    archives: null,
    archivesLoading: false,
    archivesError: ''
};

function ensureMaxisStyles() {
    return ensureChamberStylesheet('maxis-css', MAXIS_CSS_URL);
}

function validDate(value) {
    const date = new Date(value || '');
    return Number.isFinite(date.getTime()) ? date : null;
}

function freshness(data) {
    const generatedAt = validDate(data?.generatedAt || data?.updatedAt || data?.asOf);
    const staleAfterMs = Number(data?.staleAfterHours || 48) * 60 * 60 * 1000;
    const stale = !generatedAt || Date.now() - generatedAt.getTime() > staleAfterMs;
    const label = generatedAt
        ? `${formatUtcDateTime(generatedAt)} UTC`
        : 'time unknown';
    return { stale, label, generatedAt };
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    return [value];
}

function textValue(...values) {
    const value = values.find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== '');
    return value === undefined ? '' : String(value);
}

function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map(stableJsonValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
}

function numberValue(...values) {
    const value = values.find((candidate) => candidate !== null && candidate !== undefined && String(candidate).trim() !== '' && Number.isFinite(Number(candidate)));
    return value === undefined ? null : Number(value);
}

function canonicalCategory(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return CATEGORY_ALIASES[normalized] || normalized.replace(/_maxi$/, '');
}

function canonicalView(value) {
    const normalized = String(value || '').trim().toLowerCase();
    const canonical = VIEW_ALIASES[normalized] || normalized;
    return VIEW_KEYS.includes(canonical) ? canonical : '';
}

function laneRoomForView(view = chamberState.view) {
    return canonicalView(view) === 'maxis' ? 'maxis' : 'season';
}

function viewUsesSeasonContext(view = chamberState.view) {
    return ['season', 'passport'].includes(canonicalView(view));
}

function viewUsesLane(view = chamberState.view) {
    return ['maxis', 'season'].includes(canonicalView(view));
}

function categoryLabel(category) {
    const key = canonicalCategory(category);
    return CATEGORY_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Maxi';
}

function ongoingLaneTitle(lane, category) {
    const key = canonicalCategory(category);
    if (key === 'governance') return 'L1 Governance Maxi';
    if (key === 'l2_governance') return 'L2 Governance Maxi';
    return textValue(lane?.title, `${categoryLabel(key)} Maxi`);
}

function governanceLayer(category) {
    const key = canonicalCategory(category);
    if (key === 'governance') return 'L1';
    if (key === 'l2_governance') return 'L2';
    return '';
}

function shortAddress(address) {
    const value = String(address || '');
    return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function leaderName(leader) {
    return textValue(leader?.alias, leader?.name, leader?.displayName, shortAddress(leader?.address), 'No qualifier');
}

function windowLabel(kind) {
    const labels = {
        'rolling-30d': '30d',
        'rolling-90d': '90d',
        'all-time': 'all time',
        'all-time-active': 'all time · active',
        'protocol-season': 'protocol season',
        protocol: 'protocol season',
        season: 'protocol season',
        live: 'live',
        mixed: 'cross-lane'
    };
    return labels[String(kind || '').toLowerCase()] || textValue(kind, 'season snapshot');
}

function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString() : textValue(value, '—');
}

function formatMetricAmount(value, unit) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return textValue(value, '—');
    if (String(unit).toLowerCase() === 'mutez') {
        return `${(amount / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ꜩ`;
    }
    const rawUnit = textValue(unit, 'activity');
    const displayUnit = amount === 1 && rawUnit.endsWith('s') ? rawUnit.slice(0, -1) : rawUnit;
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 12 })} ${displayUnit}`;
}

function scoreLabel(entry) {
    if (!entry) return 'No score recorded';
    if (typeof entry.score === 'object') {
        return textValue(entry.scoreLabel, entry.displayScore, entry.score.label, entry.score.display, entry.metricLabel, entry.valueLabel, entry.score.value);
    }
    return textValue(entry.scoreLabel, entry.displayScore, entry.metricLabel, entry.valueLabel, Number.isFinite(Number(entry.score)) ? formatNumber(entry.score) : entry.score, 'Qualified');
}

function safeLocalStorageGet(key) {
    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
}

function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch { /* storage unavailable */ }
}

function readShareLedger() {
    try {
        const parsed = JSON.parse(localStorage.getItem(SHARE_STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function recordRankShare(entry, category) {
    const address = String(entry?.address || '');
    if (!address) return;
    const ledger = readShareLedger();
    const addressKey = address.toLowerCase();
    const previous = ledger[addressKey] && typeof ledger[addressKey] === 'object' ? ledger[addressKey] : {};
    const count = Number(previous.count || 0) + 1;
    ledger[addressKey] = {
        count,
        lastSharedAt: new Date().toISOString(),
        lane: canonicalCategory(category),
        seasonId: chamberState.view === 'maxis' ? 'ongoing-maxis' : (chamberState.seasonId || 'protocol-season')
    };
    try {
        localStorage.setItem(SHARE_STORAGE_KEY, JSON.stringify(ledger));
    } catch {
        // A blocked storage write must never block the outbound share action.
    }
    window.dispatchEvent(new CustomEvent('maxis-rank-shared', {
        detail: { address, count, lane: canonicalCategory(category), seasonId: chamberState.seasonId }
    }));
}

async function fetchJson(url, { force = false, quiet = false } = {}) {
    try {
        const response = await fetch(url, {
            cache: force ? 'reload' : 'no-store',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        if (quiet) {
            console.debug('Optional Maxis data unavailable', url, error);
            return null;
        }
        throw error;
    }
}

async function verifyPassportShardText(raw, expectedHash, shard) {
    if (!expectedHash) return;
    const actualHash = await sha256Text(raw);
    if (actualHash.toLowerCase() !== String(expectedHash).toLowerCase()) {
        throw new Error(`Passport shard ${shard} failed its SHA-256 integrity receipt. Retry after the season artifacts finish publishing.`);
    }
}

async function assertL2GovernanceArtifact(artifact) {
    if (Number(artifact?.schema) !== 1 || artifact?.kind !== 'maxis-l2-governance-careers'
        || artifact?.coverage?.status !== 'complete' || artifact?.coverage?.absenceMeansZero !== true
        || !Array.isArray(artifact?.rankings) || artifact.rankings.length > 10
        || !artifact?.records || typeof artifact.records !== 'object' || Array.isArray(artifact.records)
        || !artifact?.sourceReceipts || typeof artifact.sourceReceipts !== 'object' || Array.isArray(artifact.sourceReceipts)
        || !artifact?.contracts || typeof artifact.contracts !== 'object') {
        throw new Error('The L2 Governance Maxi artifact has an unsupported or incomplete schema.');
    }
    const ranks = new Set();
    const addresses = new Set();
    artifact.rankings.forEach((entry, index) => {
        const rank = Number(entry?.rank);
        const address = String(entry?.address || '');
        if (entry?.status !== 'ready' || canonicalCategory(entry?.category) !== 'l2_governance'
            || !Number.isInteger(rank) || rank !== index + 1
            || !/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
            || ranks.has(rank) || addresses.has(address.toLowerCase())) {
            throw new Error('The L2 Governance Maxi top-ten ranking has an invalid identity or rank receipt.');
        }
        ranks.add(rank);
        addresses.add(address.toLowerCase());
    });
    const { integrity, ...unsigned } = artifact;
    if (integrity?.algorithm !== 'sha256-stable-json-v1' || !integrity?.contentHash) {
        throw new Error('The L2 Governance Maxi artifact has no integrity receipt.');
    }
    const contentHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (contentHash.toLowerCase() !== String(integrity.contentHash).toLowerCase()) {
        throw new Error('The L2 Governance Maxi artifact failed its SHA-256 integrity receipt.');
    }
    return artifact;
}

function l2GovernanceMethod(artifact, entry) {
    return textValue(
        entry?.method,
        artifact?.method,
        'Most distinct canonical Tezos X governance windows participated in among currently active Tezos delegates. Baker receipts own identity even when a delegated voting key submits the call; raw calls and vote weight do not change the score.'
    );
}

function l2GovernanceScoreVector(entry) {
    if (Array.isArray(entry?.scoreVector)) return entry.scoreVector;
    const vector = entry?.scoreVector;
    if (!vector || typeof vector !== 'object') return [];
    return [
        { label: 'Canonical windows', value: numberValue(vector.windows), unit: 'windows' },
        { label: 'Track breadth', value: numberValue(vector.tracks), unit: 'tracks' },
        { label: 'Promotion windows', value: numberValue(vector.promotionWindows), unit: 'windows' },
        { label: 'Applied receipts', value: numberValue(vector.receipts), unit: 'receipts' }
    ].filter((metric) => metric.value !== null);
}

function l2GovernanceContractCount(artifact) {
    if (Array.isArray(artifact?.contracts)) return artifact.contracts.length;
    if (Array.isArray(artifact?.contracts?.production)) return artifact.contracts.production.length;
    return Object.values(artifact?.contracts?.current || {}).filter(Boolean).length;
}

function l2GovernanceUnavailableLane() {
    const reason = textValue(
        chamberState.l2GovernanceError,
        'The independent integrity-checked L2 Governance Maxi artifact is still loading.'
    );
    return {
        category: 'l2_governance',
        title: 'L2 Governance Maxi',
        status: 'unavailable',
        windowKind: 'all-time-active',
        coverageState: chamberState.l2GovernanceError ? 'scoped unavailable' : 'loading',
        reason,
        method: reason,
        sourceUrl: '/l2chamber/'
    };
}

function mergeL2GovernanceIntoLegacy(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    const artifact = chamberState.l2Governance;
    const rows = artifact
        ? artifact.rankings.map((entry) => {
            const windows = numberValue(entry?.windows, entry?.actionableWindows, entry?.score);
            return {
                ...entry,
                category: 'l2_governance',
                title: 'L2 Governance Maxi',
                status: 'ready',
                windowKind: 'all-time-active',
                scoreVector: l2GovernanceScoreVector(entry),
                scoreLabel: textValue(entry?.scoreLabel, windows !== null ? `${formatNumber(windows)} L2 governance windows` : ''),
                method: l2GovernanceMethod(artifact, entry),
                sourceUrl: textValue(entry?.sourceUrl, entry?.address ? `https://tzkt.io/${entry.address}` : '/l2chamber/')
            };
        })
        : [];
    const lane = artifact
        ? {
            ...(rows[0] || {}),
            category: 'l2_governance',
            title: 'L2 Governance Maxi',
            status: rows.length ? 'ready' : 'empty',
            windowKind: 'all-time-active',
            coverageState: 'complete',
            coverage: artifact.coverage,
            sourceReceipts: artifact.sourceReceipts,
            contracts: artifact.contracts,
            generatedAt: artifact.generatedAt,
            method: l2GovernanceMethod(artifact, rows[0]),
            reason: rows.length ? '' : 'Complete coverage found no qualifying active-delegate L2 governance participant.'
        }
        : l2GovernanceUnavailableLane();
    const leaders = [
        ...asArray(snapshot.leaders).filter((entry) => canonicalCategory(entry?.category || entry?.lane) !== 'l2_governance'),
        lane
    ];
    let rankings;
    if (Array.isArray(snapshot.rankings)) {
        rankings = [
            ...snapshot.rankings.filter((entry) => canonicalCategory(entry?.category || entry?.lane || entry?.id) !== 'l2_governance'),
            { category: 'l2_governance', entries: rows }
        ];
    } else {
        rankings = { ...(snapshot.rankings || {}), l2_governance: rows };
    }
    return {
        ...snapshot,
        leaders,
        rankings,
        coverage: {
            ...(snapshot.coverage || {}),
            l2Governance: artifact?.coverage || {
                status: 'unavailable',
                absenceMeansZero: false,
                reason: lane.reason
            }
        },
        sourceReceipts: {
            ...(snapshot.sourceReceipts || {}),
            ...(artifact ? { l2Governance: artifact.sourceReceipts } : {})
        }
    };
}

function applyL2GovernanceToLegacy() {
    if (!lastLegacyBase) return null;
    lastLegacy = mergeL2GovernanceIntoLegacy(lastLegacyBase);
    chamberState.legacy = lastLegacy;
    updateEntryCard(lastLegacy, chamberState.manifest, chamberState.summary);
    return lastLegacy;
}

async function loadLegacy({ force = false } = {}) {
    if (lastLegacy && !force) return lastLegacy;
    if (legacyPromise && !force) return legacyPromise;
    const serial = ++legacyRequestSerial;
    const request = fetchJson(LEGACY_DATA_URL, { force })
        .then((snapshot) => {
            if (serial !== legacyRequestSerial) return lastLegacy;
            if (!Array.isArray(snapshot?.leaders)) throw new Error('The ongoing Maxis snapshot has an unsupported schema.');
            lastLegacyBase = snapshot;
            return applyL2GovernanceToLegacy();
        })
        .catch((error) => {
            if (serial !== legacyRequestSerial) return lastLegacy;
            throw error;
        })
        .finally(() => {
            if (serial === legacyRequestSerial) legacyPromise = null;
        });
    legacyPromise = request;
    return request;
}

async function loadL2GovernanceData({ force = false } = {}) {
    if (l2GovernanceLoaded && !force) return lastL2Governance;
    if (l2GovernancePromise && !force) return l2GovernancePromise;
    const serial = ++l2GovernanceRequestSerial;
    const request = fetchJson(L2_GOVERNANCE_DATA_URL, { force })
        .then(assertL2GovernanceArtifact)
        .then((artifact) => {
            if (serial !== l2GovernanceRequestSerial) return lastL2Governance;
            lastL2Governance = artifact;
            chamberState.l2Governance = artifact;
            chamberState.l2GovernanceError = '';
            applyL2GovernanceToLegacy();
            return artifact;
        })
        .catch((error) => {
            if (serial !== l2GovernanceRequestSerial) return lastL2Governance;
            lastL2Governance = null;
            chamberState.l2Governance = null;
            chamberState.l2GovernanceError = textValue(error?.message, 'L2 Governance Maxi history is temporarily unavailable.');
            applyL2GovernanceToLegacy();
            console.debug('Optional L2 Governance Maxi data unavailable', error);
            return null;
        })
        .finally(() => {
            if (serial !== l2GovernanceRequestSerial) return;
            l2GovernanceLoaded = true;
            l2GovernancePromise = null;
        });
    l2GovernancePromise = request;
    return request;
}

async function loadCareerData({ force = false } = {}) {
    if (lastCareer && !force) return lastCareer;
    if (careerPromise && !force) return careerPromise;
    careerPromise = fetchJson(CAREER_DATA_URL, { force })
        .then(async (artifact) => {
            if (Number(artifact?.schema) !== 1 || artifact?.kind !== 'maxis-governance-careers'
                || artifact?.coverage?.status !== 'complete' || artifact?.coverage?.absenceMeansZero !== true
                || !artifact?.records || typeof artifact.records !== 'object') {
                throw new Error('The Governance career artifact has an unsupported or incomplete schema.');
            }
            const { integrity, ...unsigned } = artifact;
            if (integrity?.algorithm !== 'sha256-stable-json-v1' || !integrity?.contentHash) {
                throw new Error('The Governance career artifact has no integrity receipt.');
            }
            const contentHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
            if (contentHash !== integrity.contentHash) {
                throw new Error('The Governance career artifact failed its SHA-256 integrity receipt.');
            }
            lastCareer = artifact;
            chamberState.careers = artifact;
            chamberState.careerError = '';
            return artifact;
        })
        .catch((error) => {
            chamberState.careers = null;
            chamberState.careerError = textValue(error?.message, 'Governance career history is temporarily unavailable.');
            console.debug('Optional Maxis Governance career data unavailable', error);
            return null;
        })
        .finally(() => { careerPromise = null; });
    return careerPromise;
}

async function loadManifest({ force = false } = {}) {
    if (lastManifest && !force) {
        chamberState.manifestError = '';
        return lastManifest;
    }
    if (manifestPromise && !force) return manifestPromise;
    const serial = ++manifestRequestSerial;
    chamberState.manifestLoading = true;
    const request = fetchJson(MANIFEST_URL, { force })
        .then((manifest) => {
            if (serial !== manifestRequestSerial) return lastManifest;
            if (!manifest || typeof manifest !== 'object') {
                throw new Error('The Maxis season manifest has an unsupported schema.');
            }
            if (lastManifest?.generatedAt && manifest.generatedAt && lastManifest.generatedAt !== manifest.generatedAt) {
                archiveRequestSerial += 1;
                summaryCache.clear();
                shardCache.clear();
                shardRequestCache.clear();
                chamberState.archives = null;
                chamberState.archivesLoading = false;
                chamberState.archivesError = '';
            }
            lastManifest = manifest;
            chamberState.manifest = manifest;
            chamberState.manifestError = '';
            return manifest;
        })
        .catch((error) => {
            if (serial !== manifestRequestSerial) return lastManifest;
            chamberState.manifestError = textValue(error?.message, 'The Maxis season manifest is temporarily unavailable.');
            console.warn('Maxis season manifest unavailable', error);
            return null;
        })
        .finally(() => {
            if (serial !== manifestRequestSerial) return;
            manifestPromise = null;
            chamberState.manifestLoading = false;
        });
    manifestPromise = request;
    return request;
}

function resolveDataUrl(value, base = MANIFEST_URL) {
    if (!value) return '';
    try {
        return new URL(String(value), new URL(base, window.location.origin)).href;
    } catch {
        return String(value);
    }
}

function seasonIdFrom(raw, fallback = '') {
    if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
    return textValue(raw?.id, raw?.seasonId, raw?.slug, raw?.key, raw?.protocolHash, raw?.protocol?.hash, fallback);
}

function currentSeasonId(manifest) {
    return textValue(
        manifest?.currentSeasonId,
        manifest?.activeSeasonId,
        seasonIdFrom(manifest?.currentSeason),
        seasonIdFrom(manifest?.current),
        manifest?.summary?.season?.id,
        manifest?.summary?.seasonId
    );
}

function normalizeSeason(raw, index, manifest) {
    const currentId = currentSeasonId(manifest);
    const id = seasonIdFrom(raw, `season-${index + 1}`);
    const protocolObject = raw?.protocol && typeof raw.protocol === 'object' ? raw.protocol : null;
    const protocol = textValue(protocolObject?.name, raw?.protocolName, typeof raw?.protocol === 'string' ? raw.protocol : '', raw?.name, raw?.title, 'Protocol season');
    const number = textValue(raw?.number, raw?.seasonNumber, raw?.seasonOrdinal, raw?.index, index + 1);
    const status = textValue(raw?.status, id === currentId ? 'active' : '', raw?.finalized ? 'final' : '', 'archive').toLowerCase();
    const summaryCandidate = raw?.summaryUrl || raw?.summaryPath || raw?.archiveUrl || raw?.url || raw?.path || (typeof raw?.summary === 'string' ? raw.summary : '');
    return {
        ...raw,
        id,
        protocol,
        displayLabel: textValue(raw?.displayLabel, raw?.seasonLabel, raw?.title, `${protocol} Season`),
        number,
        status,
        summaryUrl: resolveDataUrl(summaryCandidate),
        startsAt: textValue(raw?.startsAt, raw?.startAt, raw?.activatedAt, raw?.activationDate, protocolObject?.activatedAt),
        endsAt: textValue(raw?.endsAt, raw?.endAt, raw?.deactivatedAt, raw?.nextActivationAt),
        estimatedEnd: textValue(raw?.estimatedEnd, raw?.expectedEnd),
        isCurrent: currentId ? id === currentId : ['active', 'current', 'live'].includes(status)
    };
}

function normalizedSeasons(manifest, summary = null) {
    const source = Array.isArray(manifest?.seasons) ? [...manifest.seasons] : [];
    if (manifest?.current && typeof manifest.current === 'object') source.unshift(manifest.current);
    if (manifest?.currentSeason && typeof manifest.currentSeason === 'object') source.unshift(manifest.currentSeason);
    if (summary?.season && typeof summary.season === 'object') source.unshift(summary.season);
    const unique = new Map();
    source.forEach((raw, index) => {
        const season = normalizeSeason(raw, index, manifest);
        const previous = unique.get(season.id) || {};
        unique.set(season.id, { ...previous, ...season });
    });
    if (!unique.size) {
        unique.set('live', {
            id: 'live',
            protocol: 'Protocol seasons',
            number: '—',
            status: 'preparing',
            summaryUrl: '',
            startsAt: '',
            endsAt: '',
            estimatedEnd: '',
            isCurrent: true
        });
    }
    return [...unique.values()].sort((left, right) => {
        if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
        const leftDate = validDate(left.startsAt)?.getTime() || 0;
        const rightDate = validDate(right.startsAt)?.getTime() || 0;
        return rightDate - leftDate;
    });
}

function seasonById(id = chamberState.seasonId) {
    const seasons = normalizedSeasons(chamberState.manifest, chamberState.summary);
    return seasons.find((season) => season.id === id) || seasons[0];
}

function summaryUrlFor(manifest, season) {
    if (season?.summaryUrl) return season.summaryUrl;
    const currentId = currentSeasonId(manifest);
    if (season?.id === currentId) {
        const value = manifest?.currentSummaryUrl || manifest?.summaryUrl || manifest?.current?.summaryUrl || manifest?.current?.summaryPath || manifest?.currentSeason?.summaryUrl || manifest?.currentSeason?.summaryPath;
        if (value) return resolveDataUrl(value);
    }
    if (season?.id && season.id !== 'live') return resolveDataUrl(`/data/maxis/seasons/${encodeURIComponent(season.id)}/summary.json`);
    return '';
}

function inlineSummaryFor(manifest, season) {
    const currentSeason = season?.id === currentSeasonId(manifest);
    const candidates = [
        season?.summary,
        currentSeason ? manifest?.summary : null,
        currentSeason ? manifest?.current?.summary : null,
        currentSeason ? manifest?.currentSeason?.summary : null
    ];
    return candidates.find((candidate) => candidate && typeof candidate === 'object' && (
        candidate.season || candidate.rankings || candidate.leaders || candidate.honors || candidate.coverage
    )) || null;
}

function assertSeasonSummaryIdentity(summary, season) {
    if (!summary || typeof summary !== 'object') return summary;
    const receipts = [
        ['season id', season?.id, summary?.season?.id],
        ['protocol hash', season?.protocolHash, summary?.season?.protocolHash],
        ['evaluator version', season?.evaluatorVersion, summary?.rules?.evaluatorVersion],
        ['evaluator implementation hash', season?.evaluatorImplementationHash, summary?.rules?.evaluatorImplementationHash],
        ['rules hash', season?.rulesHash, summary?.rules?.rulesHash]
    ];
    const mismatch = receipts.find(([, expected, actual]) => expected !== undefined && expected !== null && String(expected) !== String(actual || ''));
    if (mismatch) {
        throw new Error(`The selected Maxis season failed its identity receipt: ${mismatch[0]} does not match the manifest. Retry after the season artifacts finish publishing.`);
    }
    return summary;
}

async function loadSeasonSummary(seasonId, { force = false } = {}) {
    if (!seasonId) return null;
    const season = seasonById(seasonId);
    if (!force && summaryCache.has(seasonId)) return assertSeasonSummaryIdentity(summaryCache.get(seasonId), season);
    const previousSerial = seasonSummaryRequestSerials.get(seasonId) || 0;
    const serial = force ? previousSerial + 1 : previousSerial;
    if (force) seasonSummaryRequestSerials.set(seasonId, serial);
    const inline = inlineSummaryFor(chamberState.manifest, season);
    if (inline) {
        const verified = assertSeasonSummaryIdentity(inline, season);
        if (serial === (seasonSummaryRequestSerials.get(seasonId) || 0)) {
            summaryCache.set(seasonId, verified);
        }
        return verified;
    }
    const url = summaryUrlFor(chamberState.manifest, season);
    if (!url) return null;
    const summary = await fetchJson(url, { force });
    if (!summary || typeof summary !== 'object') {
        throw new Error(`The declared ${season?.displayLabel || 'Maxis season'} summary did not contain a valid result sheet.`);
    }
    const verified = assertSeasonSummaryIdentity(summary, season);
    if (serial === (seasonSummaryRequestSerials.get(seasonId) || 0)) {
        summaryCache.set(seasonId, verified);
    }
    return verified;
}

function rankingArray(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    return asArray(value.entries || value.rows || value.ranking || value.rankings || value.accounts || value.leaders).filter(Boolean);
}

function rankingForCategory(data, category) {
    const key = canonicalCategory(category);
    const rankings = data?.rankings;
    if (Array.isArray(rankings)) {
        const lane = rankings.find((item) => canonicalCategory(item?.category || item?.lane || item?.id) === key);
        const rows = rankingArray(lane);
        if (rows.length) return rows;
    } else if (rankings && typeof rankings === 'object') {
        const directKey = Object.keys(rankings).find((candidate) => canonicalCategory(candidate) === key);
        const rows = rankingArray(directKey ? rankings[directKey] : null);
        if (rows.length) return rows;
    }
    const lane = asArray(data?.lanes).find((item) => canonicalCategory(item?.category || item?.lane || item?.id) === key);
    const laneRows = rankingArray(lane);
    if (laneRows.length) return laneRows;
    const fallback = asArray(data?.leaders).find((leader) => canonicalCategory(leader?.category || leader?.lane) === key);
    return fallback?.status === 'ready' || fallback?.address ? [{ ...fallback, rank: fallback.rank || 1 }] : [];
}

function leaderForCategory(data, category) {
    const key = canonicalCategory(category);
    const leader = asArray(data?.leaders).find((candidate) => canonicalCategory(candidate?.category || candidate?.lane) === key);
    const lane = asArray(data?.lanes).find((candidate) => canonicalCategory(candidate?.category || candidate?.lane || candidate?.id) === key);
    const laneStatus = data?.laneStatus && typeof data.laneStatus === 'object'
        ? data.laneStatus[Object.keys(data.laneStatus).find((candidate) => canonicalCategory(candidate) === key)]
        : null;
    const ranking = rankingForCategory(data, key);
    return { ...(laneStatus || {}), ...(lane || {}), ...(leader || {}), ...(ranking[0] || {}), category: key };
}

function categoriesFor(data) {
    const found = new Set();
    if (Array.isArray(data?.rankings)) {
        data.rankings.forEach((item) => found.add(canonicalCategory(item?.category || item?.lane || item?.id)));
    } else if (data?.rankings && typeof data.rankings === 'object') {
        Object.keys(data.rankings).forEach((key) => found.add(canonicalCategory(key)));
    }
    asArray(data?.leaders).forEach((leader) => found.add(canonicalCategory(leader?.category || leader?.lane)));
    asArray(data?.lanes).forEach((lane) => found.add(canonicalCategory(lane?.category || lane?.lane || lane?.id)));
    const order = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));
    return [...found].filter(Boolean).sort((left, right) => (order.get(left) ?? 99) - (order.get(right) ?? 99));
}

function normalizePassGap(gap) {
    if (!gap || typeof gap !== 'object') return gap || null;
    const rawConservativePath = Object.hasOwn(gap, 'conservativeVectorPath')
        ? gap.conservativeVectorPath
        : gap.minimalKnownPath;
    return {
        ...gap,
        conservativeVectorPath: asArray(rawConservativePath).filter((step) => step && typeof step === 'object')
    };
}

function normalizePassGapSet(passGap) {
    if (!passGap || typeof passGap !== 'object') return passGap || null;
    const directGap = ['targetRank', 'targetAddress', 'guaranteedPrimary', 'conservativeVectorPath', 'minimalKnownPath', 'caveat']
        .some((key) => Object.hasOwn(passGap, key));
    if (directGap) return normalizePassGap(passGap);
    const normalized = { ...passGap };
    ['next', 'topTen', 'leader'].forEach((target) => {
        if (Object.hasOwn(passGap, target)) normalized[target] = normalizePassGap(passGap[target]);
    });
    return normalized;
}

function normalizedEntry(entry, index, category, data) {
    const lane = leaderForCategory(data, category);
    const rawPassGap = Object.hasOwn(entry || {}, 'passGap') ? entry.passGap : lane?.passGap;
    return {
        ...lane,
        ...entry,
        category: canonicalCategory(category),
        rank: numberValue(entry?.rank, entry?.position, index + 1) || index + 1,
        address: textValue(entry?.address, entry?.account, entry?.wallet),
        title: textValue(entry?.title, lane?.title, `${categoryLabel(category)} Maxi`),
        method: textValue(entry?.method, lane?.method),
        windowKind: textValue(entry?.windowKind, entry?.window, lane?.windowKind, lane?.window, 'season'),
        sourceUrl: textValue(entry?.sourceUrl, entry?.source, lane?.sourceUrl),
        passGap: normalizePassGapSet(rawPassGap)
    };
}

function normalizedRanking(data, category) {
    return rankingForCategory(data, category).map((entry, index) => normalizedEntry(entry, index, category, data));
}

function uniqueRankedWallets(data) {
    const projectedCount = numberValue(data?.rankedWalletCount);
    if (Number.isInteger(projectedCount) && projectedCount >= 0) return projectedCount;
    const addresses = new Set();
    categoriesFor(data).forEach((category) => {
        normalizedRanking(data, category).forEach((entry) => {
            if (entry.address) addresses.add(entry.address.toLowerCase());
        });
    });
    return addresses.size;
}

function formatDate(value, { includeYear = true } = {}) {
    const date = validDate(value);
    if (!date) return '';
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
        ...(includeYear ? { year: 'numeric' } : {})
    });
}

function seasonEndCopy(season, { compact = false } = {}) {
    const end = validDate(season?.endsAt);
    if (end) {
        if (season?.status === 'settling') return `Closed ${formatDate(end, { includeYear: !compact })} · settling`;
        const prefix = ['final', 'finalized', 'complete', 'archived'].includes(season.status) ? 'Ended' : 'Scheduled activation';
        return `${prefix} ${formatDate(end, { includeYear: !compact })}`;
    }
    const estimate = validDate(season?.estimatedEnd);
    if (estimate) return `Estimate ${formatDate(estimate, { includeYear: !compact })} · not scheduled`;
    if (season?.status === 'settling') return compact ? 'Closed · settling' : 'Season closed · source settlement in progress';
    if (['final', 'finalized', 'complete', 'archived'].includes(season?.status)) return 'Season complete';
    return compact ? 'Ends at next protocol' : 'Ends at the next protocol activation · date not scheduled';
}

function seasonPhase(season = seasonById()) {
    const status = String(season?.status || '').toLowerCase();
    if (['final', 'finalized', 'complete', 'archived'].includes(status)) return 'finalized';
    if (['settling', 'finalizing'].includes(status)) return 'settling';
    return 'active';
}

function maxiLeaderIdentity(leader) {
    return textValue(leader?.address, leader?.wallet, leader?.account?.address, leaderName(leader)).toLowerCase();
}

function dispatchMaxisHotSignal(detail) {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('hot-signal', { detail }));
}

function dispatchMaxisHotSignals(legacy, manifest, summary) {
    if (!legacy || !manifest) return;
    let previous = null;
    try {
        const parsed = JSON.parse(safeLocalStorageGet(MAXIS_HOT_SNAPSHOT_KEY) || 'null');
        previous = parsed && typeof parsed === 'object' ? parsed : null;
    } catch { /* start a fresh snapshot */ }

    const ongoingLeader = normalizedRanking(legacy, 'unicorn')[0] || null;
    const season = summary ? normalizedSeasons(manifest, summary)[0] : null;
    const seasonLeader = summary ? normalizedRanking(summary, 'unicorn')[0] || null : null;
    const next = {
        ongoingLeaderId: maxiLeaderIdentity(ongoingLeader),
        ongoingLeaderName: leaderName(ongoingLeader),
        seasonId: season?.id || previous?.seasonId || '',
        seasonLeaderId: summary ? maxiLeaderIdentity(seasonLeader) : previous?.seasonLeaderId || '',
        seasonLeaderName: summary ? leaderName(seasonLeader) : previous?.seasonLeaderName || '',
        seasonPhase: season ? seasonPhase(season) : previous?.seasonPhase || '',
        recordedAt: Date.now()
    };
    safeLocalStorageSet(MAXIS_HOT_SNAPSHOT_KEY, JSON.stringify(next));
    if (!previous) return;

    if (previous.ongoingLeaderId && next.ongoingLeaderId && previous.ongoingLeaderId !== next.ongoingLeaderId) {
        dispatchMaxisHotSignal({
            id: `maxis-unicorn-${next.ongoingLeaderId}`,
            category: 'maxis',
            kind: 'event',
            visual: 'maxis',
            spectacle: 'peacock',
            score: 126,
            title: 'New Tezos Unicorn',
            icon: '♛',
            text: `${next.ongoingLeaderName} took the cross-lane Maxis crown.`,
            detail: 'Ongoing identities changed leader',
            route: '/maxis/?lane=unicorn',
            ttlMs: MAXIS_HOT_SIGNAL_TTL_MS
        });
    }

    if (summary && previous.seasonId && next.seasonId && previous.seasonId !== next.seasonId) {
        dispatchMaxisHotSignal({
            id: `maxis-season-open-${next.seasonId}`,
            category: 'maxis',
            kind: 'event',
            visual: 'maxis',
            spectacle: 'peacock',
            score: 124,
            title: 'New Maxis season',
            icon: '✺',
            text: `${season?.displayLabel || season?.protocol || 'A new protocol season'} opened a fresh set of crown races.`,
            detail: 'Protocol boundary',
            route: '/maxis/?view=season',
            ttlMs: MAXIS_HOT_SIGNAL_TTL_MS
        });
    } else if (summary && previous.seasonLeaderId && next.seasonLeaderId && previous.seasonLeaderId !== next.seasonLeaderId) {
        dispatchMaxisHotSignal({
            id: `maxis-season-unicorn-${next.seasonId}-${next.seasonLeaderId}`,
            category: 'maxis',
            kind: 'event',
            visual: 'maxis',
            spectacle: 'headliner',
            score: 118,
            title: 'Season crown changed hands',
            icon: '♛',
            text: `${next.seasonLeaderName} moved into the protocol-season Unicorn lead.`,
            detail: season?.displayLabel || season?.protocol || 'Current Maxis season',
            route: '/maxis/?view=season&lane=unicorn',
            ttlMs: MAXIS_HOT_SIGNAL_TTL_MS
        });
    }

    if (summary && previous.seasonId === next.seasonId && previous.seasonPhase && previous.seasonPhase !== 'finalized' && next.seasonPhase === 'finalized') {
        dispatchMaxisHotSignal({
            id: `maxis-season-final-${next.seasonId}`,
            category: 'maxis',
            kind: 'event',
            visual: 'maxis',
            spectacle: 'historic',
            score: 136,
            title: 'Maxis champions sealed',
            icon: '◇',
            text: `${season?.displayLabel || season?.protocol || 'The protocol season'} is now a permanent crown archive.`,
            detail: 'Finalized protocol season',
            route: '/maxis/?view=champions',
            ttlMs: MAXIS_HOT_SIGNAL_TTL_MS
        });
    }
}

function seasonContextError() {
    return textValue(chamberState.summaryError, chamberState.manifestError);
}

function seasonScopeLabels(season = seasonById()) {
    const phase = seasonPhase(season);
    if (phase === 'finalized') {
        return {
            phase,
            kicker: 'Finalized protocol archive',
            passportScope: 'Selected Archive',
            passportLaneHeading: 'Archived lanes',
            passportCutLines: 'frozen cut lines',
            passportCopy: 'The selected archive preserves its final ranks, cut lines, streaks, and Season Unicorn result under the frozen ruleset.'
        };
    }
    if (phase === 'settling') {
        return {
            phase,
            kicker: 'Closed season · provisional',
            passportScope: 'Settling Season',
            passportLaneHeading: 'Provisional lanes',
            passportCutLines: 'settling cut lines',
            passportCopy: 'This closed season remains provisional while its declared sources settle; final ranks and champion stamps are not permanent yet.'
        };
    }
    return {
        phase,
        kicker: 'Live protocol season',
        passportScope: 'This Season',
        passportLaneHeading: 'Current lanes',
        passportCutLines: 'moving cut lines',
        passportCopy: 'This Season tracks ranks, moving gaps, streaks, and Season Unicorn progress inside the active protocol arena.'
    };
}

function seasonNumberLabel(season) {
    const numeric = Number(season?.number);
    return Number.isFinite(numeric) ? String(numeric).padStart(2, '0') : textValue(season?.number, '—');
}

function activeDataForSeason() {
    return chamberState.summary || null;
}

function ensureValidLane(data) {
    const categories = categoriesFor(data);
    if (!categories.length) return '';
    const laneRoom = laneRoomForView();
    const remembered = chamberState.laneByView[laneRoom];
    if (categories.includes(remembered)) chamberState.lane = remembered;
    else if (!categories.includes(chamberState.lane)) chamberState.lane = categories[0];
    chamberState.laneByView[laneRoom] = chamberState.lane;
    return chamberState.lane;
}

function readRouteState() {
    const pretty = window.location.pathname.replace(/^\/+|\/+$/g, '') === 'maxis';
    const search = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash.includes('=') ? hash : '');
    const requestedView = pretty ? search.get('view') : (hashParams.get('maxis') || hashParams.get('maxis-view'));
    return {
        view: canonicalView(requestedView) || 'maxis',
        seasonId: textValue(pretty ? search.get('season') : hashParams.get('season')),
        lane: canonicalCategory(pretty ? search.get('lane') : hashParams.get('lane')),
        address: textValue(pretty ? search.get('address') : (hashParams.get('address') || hashParams.get('maxis-address')))
    };
}

function syncRouteState() {
    const pretty = window.location.pathname.replace(/^\/+|\/+$/g, '') === 'maxis';
    const url = new URL(window.location.href);
    if (pretty) {
        if (chamberState.view === 'maxis') url.searchParams.delete('view');
        else url.searchParams.set('view', chamberState.view);
        if (viewUsesSeasonContext() && chamberState.seasonId && chamberState.seasonId !== currentSeasonId(chamberState.manifest)) url.searchParams.set('season', chamberState.seasonId);
        else url.searchParams.delete('season');
        if (viewUsesLane() && chamberState.lane) url.searchParams.set('lane', chamberState.lane);
        else url.searchParams.delete('lane');
        if (chamberState.view === 'passport' && chamberState.passportAddress) url.searchParams.set('address', chamberState.passportAddress);
        else url.searchParams.delete('address');
    } else {
        const params = new URLSearchParams();
        params.set('maxis', chamberState.view);
        if (viewUsesSeasonContext() && chamberState.seasonId) params.set('season', chamberState.seasonId);
        if (viewUsesLane() && chamberState.lane) params.set('lane', chamberState.lane);
        if (chamberState.view === 'passport' && chamberState.passportAddress) params.set('address', chamberState.passportAddress);
        url.hash = params.toString();
    }
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function renderSeasonSelector() {
    const seasons = normalizedSeasons(chamberState.manifest, chamberState.summary);
    const selected = seasonById();
    return `
        <div class="maxis-corner-tray maxis-season-tray${chamberState.selectorOpen ? ' is-open' : ''}">
            <button class="maxis-season-orb" type="button" aria-haspopup="menu" aria-controls="maxis-season-menu" aria-expanded="${chamberState.selectorOpen ? 'true' : 'false'}" aria-label="Choose protocol season">
                <span class="maxis-season-orb-mark">S${escapeHtml(seasonNumberLabel(selected))}<small>${escapeHtml(String(selected?.protocol || 'TZ').slice(0, 3).toUpperCase())}</small></span>
            </button>
            <div class="maxis-season-menu" id="maxis-season-menu" role="menu" aria-label="Protocol seasons">
                <div class="maxis-season-menu-head"><span>Protocol seasons</span><strong>${seasons.length}</strong></div>
                ${seasons.map((season) => `
                    <button class="maxis-season-option" type="button" role="menuitemradio" tabindex="${season.id === selected?.id ? '0' : '-1'}" aria-checked="${season.id === selected?.id ? 'true' : 'false'}" data-maxis-season="${escapeHtml(season.id)}">
                        <span class="maxis-season-seal">${escapeHtml(seasonNumberLabel(season))}</span>
                        <span class="maxis-season-option-copy"><strong>${escapeHtml(season.protocol)}</strong><small>${escapeHtml(seasonEndCopy(season, { compact: true }))}</small></span>
                        <span class="maxis-season-option-state">${escapeHtml(season.isCurrent ? 'live' : season.status)}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

function renderMaxisHero() {
    const data = chamberState.legacy;
    const state = freshness(data);
    const categories = categoriesFor(data || {});
    const clocks = [...new Set(categories.map((category) => windowLabel(leaderForCategory(data || {}, category)?.windowKind)))];
    return `
        <header class="maxis-protocol-hero maxis-context-hero maxis-maxis-hero chamber-anim-fade">
            <div class="maxis-protocol-kicker"><span>Tezos Maxis</span> objective identities · honest clocks</div>
            <h2 id="maxis-title" class="maxis-protocol-title">Who is a Maxi?</h2>
            <p class="maxis-protocol-lead">The ongoing records for Tezos collectors, artists, builders, L1 and L2 governance voters, stakers, transactors, and cross-lane Unicorns. These boards do not reset at protocol activation; every identity keeps its own declared clock.</p>
            <div class="maxis-season-telemetry" aria-label="Ongoing Maxis snapshot status">
                <span><strong>${escapeHtml(String(categories.length || '—'))}</strong>Maxi identities</span>
                <span><strong>${escapeHtml(String(data ? uniqueRankedWallets(data) : '—'))}</strong>ranked wallets</span>
                <span><strong>${escapeHtml(String(clocks.length || '—'))} clocks</strong>live · rolling · all-time</span>
                <span><strong>${escapeHtml(state.label)}</strong>${state.stale ? 'previous valid snapshot' : 'generated snapshot'} · ${escapeHtml(GENERATED_PROOFBOOK_SCHEDULE_LABEL)}</span>
            </div>
        </header>
    `;
}

function renderSeasonHero() {
    const season = seasonById();
    const data = activeDataForSeason();
    const fresh = freshness(data);
    const phase = seasonPhase(season);
    const settling = phase === 'settling';
    const final = phase === 'finalized';
    const contextError = seasonContextError();
    const sheetState = settling
        ? 'closed · source settlement in progress · champions pending'
        : (final ? 'permanent champion sheet' : (data ? (fresh.stale ? 'previous valid sheet' : 'current sheet') : contextError ? 'season sheet unavailable' : 'season sheet preparing'));
    const categories = data ? categoriesFor(data) : [];
    const passportRecords = data ? numberValue(data?.passports?.indexedAddresses, data?.coverage?.indexedAddresses) : null;
    const wallets = data ? (passportRecords ?? uniqueRankedWallets(data)) : 0;
    const starts = formatDate(season?.startsAt);
    const boundaryCopy = contextError && !chamberState.manifest
        ? 'Season boundary unavailable'
        : seasonEndCopy(season, { compact: true });
    const boundarySentence = contextError && !chamberState.manifest
        ? 'Its activation boundary is unavailable'
        : seasonEndCopy(season);
    const lead = settling
        ? 'This season is closed. Its provisional standings remain inspectable while the declared sources settle; champions are not permanent yet.'
        : final
            ? 'This season is finalized. Its standings, lane names, rules, and cut lines are frozen as a permanent protocol record.'
            : contextError
                ? 'The selected protocol-season sheet is scoped unavailable. Ongoing Maxis identities remain usable on their own declared clocks.'
                : 'Every Maxis protocol season opens a new arena. Crowns stay objective; movement, breadth, and season honors give every wallet a path forward.';
    return `
        <header class="maxis-protocol-hero maxis-context-hero maxis-season-hero chamber-anim-fade">
            <div class="maxis-protocol-kicker"><span>Season ${escapeHtml(seasonNumberLabel(season))}</span> Tezos protocol arena · ${escapeHtml(sheetState)}</div>
            <h2 id="maxis-title" class="maxis-protocol-title">${escapeHtml(contextError && !chamberState.manifest ? 'Maxis season sheet unavailable' : (season?.displayLabel || `${season?.protocol || 'Tezos'} Season`))}</h2>
            <p class="maxis-protocol-lead">${escapeHtml(lead)} ${escapeHtml(boundarySentence)}. Maxis seasons begin with Ushuaia; earlier Tezos protocols are not retroactively scored.</p>
            <div class="maxis-season-telemetry" aria-label="Protocol season status">
                <span><strong>${escapeHtml(starts || (contextError ? 'Unavailable' : season?.isCurrent ? 'Live now' : 'Date unavailable'))}</strong>season activation</span>
                <span><strong>${escapeHtml(boundaryCopy)}</strong>season boundary</span>
                <span><strong>${escapeHtml(String(wallets || '—'))}</strong>${passportRecords !== null ? 'wallet Passports indexed' : 'wallets on loaded ranks'}</span>
                <span><strong>${escapeHtml(data ? fresh.label : contextError ? 'Unavailable' : 'Preparing')}</strong>${contextError ? 'selected season sheet' : 'sheet snapshot'}</span>
                <span><strong>${escapeHtml(categories.length ? String(categories.length) : '—')}</strong>${categories.length === 1 ? 'lane' : 'lanes'}</span>
            </div>
        </header>
    `;
}

function renderPassportHero() {
    const season = seasonById();
    const data = activeDataForSeason();
    const fresh = freshness(data);
    const scope = seasonScopeLabels(season);
    const contextError = seasonContextError();
    const passportRecords = data ? numberValue(data?.passports?.indexedAddresses, data?.coverage?.indexedAddresses) : null;
    const starts = formatDate(season?.startsAt);
    const boundaryCopy = contextError && !chamberState.manifest
        ? 'Season boundary unavailable'
        : seasonEndCopy(season, { compact: true });
    return `
        <header class="maxis-protocol-hero maxis-context-hero maxis-passport-hero chamber-anim-fade">
            <div class="maxis-protocol-kicker"><span>Season ${escapeHtml(seasonNumberLabel(season))}</span> ${escapeHtml(season?.protocol || 'Tezos')} Passport scope · ${escapeHtml(scope.passportScope)}</div>
            <h2 id="maxis-title" class="maxis-protocol-title">Maxi Passport</h2>
            <p class="maxis-protocol-lead">Career achievements stay stamped to this address. ${escapeHtml(contextError ? 'The selected season receipt is scoped unavailable; verified career and ongoing records remain separate and usable.' : scope.passportCopy)}</p>
            <div class="maxis-season-telemetry" aria-label="Selected Passport season scope">
                <span><strong>${escapeHtml(starts || (contextError ? 'Unavailable' : scope.phase === 'active' ? 'Live now' : 'Date unavailable'))}</strong>season activation</span>
                <span><strong>${escapeHtml(boundaryCopy)}</strong>season boundary</span>
                <span><strong>${escapeHtml(String(passportRecords ?? '—'))}</strong>Passports indexed</span>
                <span><strong>${escapeHtml(data ? fresh.label : contextError ? 'Unavailable' : 'Preparing')}</strong>${escapeHtml(scope.phase === 'finalized' ? 'finalized season sheet' : scope.phase === 'settling' ? 'provisional season sheet' : 'selected season sheet')}</span>
            </div>
        </header>
    `;
}

function renderChampionsHero() {
    const seasons = normalizedSeasons(chamberState.manifest, chamberState.summary);
    const finalized = seasons.filter((season) => ['final', 'finalized', 'complete', 'archived'].includes(season.status));
    const archivedCards = asArray(chamberState.archives).length;
    return `
        <header class="maxis-protocol-hero maxis-context-hero maxis-champions-hero chamber-anim-fade">
            <div class="maxis-protocol-kicker"><span>Permanent record</span> finalized protocol seasons</div>
            <h2 id="maxis-title" class="maxis-protocol-title">Champions</h2>
            <p class="maxis-protocol-lead">Every finalized Maxis season keeps the lane names, rules, honors, and winners it closed with. The live arena can add history; it can never rewrite it. Maxis seasons begin with Ushuaia.</p>
            <div class="maxis-season-telemetry" aria-label="Champions archive status">
                <span><strong>${escapeHtml(String(Math.max(finalized.length, archivedCards)))}</strong>finalized seasons</span>
                <span><strong>Frozen rules</strong>per-season evaluator identity</span>
                <span><strong>Original names</strong>frozen lane catalog</span>
                <span><strong>Permanent</strong>after source settlement</span>
            </div>
        </header>
    `;
}

function renderContextHero() {
    if (chamberState.view === 'maxis') return renderMaxisHero();
    if (chamberState.view === 'passport') return renderPassportHero();
    if (chamberState.view === 'champions') return renderChampionsHero();
    return renderSeasonHero();
}

function renderRoomTabs() {
    return `
        <nav class="maxis-room-tabs" role="tablist" aria-label="Maxis rooms">
            ${VIEW_KEYS.map((view) => `
                <button class="maxis-room-tab" id="maxis-tab-${view}" type="button" role="tab" aria-selected="${chamberState.view === view ? 'true' : 'false'}" aria-controls="maxis-panel-${view}" tabindex="${chamberState.view === view ? '0' : '-1'}" data-maxis-view="${view}">
                    <span aria-hidden="true">${VIEW_META[view].icon}</span>${VIEW_META[view].label}
                </button>
            `).join('')}
        </nav>
    `;
}

function renderRoomIntro(kicker, title, copy, side = '') {
    return `
        <div class="maxis-room-intro">
            <div class="maxis-room-intro-copy"><span class="maxis-room-kicker">${escapeHtml(kicker)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div>
            ${side}
        </div>
    `;
}

function renderLaneRail(data, selected, label) {
    return `
        <div class="maxis-lane-rail" role="toolbar" aria-label="${escapeHtml(label)}">
            ${categoriesFor(data).map((category) => `
                <button class="maxis-lane-chip" type="button" aria-pressed="${category === selected ? 'true' : 'false'}" data-maxis-lane="${escapeHtml(category)}">
                    <span aria-hidden="true">${CATEGORY_ICONS[category] || '•'}</span>${escapeHtml(categoryLabel(category))}
                </button>
            `).join('')}
        </div>
    `;
}

function rankDeltaValue(entry) {
    const direct = entry?.rankDelta ?? entry?.delta ?? entry?.movement;
    if (Number.isFinite(Number(direct))) return Number(direct);
    const previous = numberValue(entry?.previousRank, entry?.rankBefore, entry?.lastRank);
    const current = numberValue(entry?.rank, entry?.position);
    return previous !== null && current !== null ? previous - current : null;
}

function renderRankDelta(entry) {
    const delta = rankDeltaValue(entry);
    if (delta === null) return '<span class="maxis-rank-delta flat" title="No prior checkpoint">new</span>';
    if (delta > 0) return `<span class="maxis-rank-delta" title="Up ${formatNumber(delta)} since the prior checkpoint">↑${formatNumber(delta)}</span>`;
    if (delta < 0) return `<span class="maxis-rank-delta down" title="Down ${formatNumber(Math.abs(delta))} since the prior checkpoint">↓${formatNumber(Math.abs(delta))}</span>`;
    return '';
}

function renderScoreAndRankDelta(entry) {
    const delta = renderRankDelta(entry);
    return `${escapeHtml(scoreLabel(entry))}${delta ? ` · ${delta}` : ''}`;
}

function rowKey(entry, category) {
    return `${canonicalCategory(category)}:${String(entry?.address || entry?.rank || '').toLowerCase()}`;
}

function rowActionId(entry, category) {
    const identity = String(entry?.address || entry?.rank || 'row')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-');
    return `maxis-row-actions-${canonicalCategory(category)}-${identity}`;
}

function rankShareUrl(category) {
    const url = new URL(MAXIS_SHARE_URL);
    const lane = canonicalCategory(category);
    if (chamberState.view === 'maxis') {
        if (lane) url.searchParams.set('lane', lane);
        return url.toString();
    }
    url.searchParams.set('view', 'season');
    if (chamberState.seasonId) url.searchParams.set('season', chamberState.seasonId);
    if (lane) url.searchParams.set('lane', lane);
    return url.toString();
}

function rankTweetText(entry, category) {
    const season = seasonById();
    const place = entry?.rank || 1;
    const phase = seasonPhase(season);
    const room = chamberState.view === 'maxis'
        ? `${windowLabel(entry?.windowKind)} ongoing Maxis board`
        : `${season?.protocol || 'Tezos'} ${phase === 'finalized' ? 'finalized season' : phase === 'settling' ? 'settling season' : 'season'}`;
    return `🏆 ${leaderName(entry)} is #${place} in ${categoryLabel(category)} — ${scoreLabel(entry)} (${room}). Inspect this board: ${rankShareUrl(category)} #Tezos`;
}

function renderRowMenuToggle(entry, category) {
    const key = rowKey(entry, category);
    const open = chamberState.rowDetail === key;
    const actionsId = rowActionId(entry, category);
    const controls = open ? ` aria-controls="${escapeHtml(actionsId)}"` : '';
    return `
        <span class="maxis-row-menu-wrap">
            <button class="maxis-row-menu-toggle" type="button" aria-expanded="${open ? 'true' : 'false'}"${controls} aria-label="${open ? 'Close' : 'Open'} score receipt and trails for rank ${escapeHtml(String(entry.rank))} ${escapeHtml(leaderName(entry))}" data-maxis-row-menu="${escapeHtml(key)}">•••</button>
        </span>
    `;
}

function selectedRow(data, category) {
    return normalizedRanking(data, category).find((entry) => rowKey(entry, category) === chamberState.rowDetail) || null;
}

function renderScoreReceipt(entry) {
    const vector = asArray(entry?.scoreVector).filter((metric) => metric && typeof metric === 'object');
    const currentRank = numberValue(entry?.rank, entry?.position);
    const previousRank = numberValue(entry?.previousRank, entry?.rankBefore, entry?.lastRank);
    const delta = rankDeltaValue(entry);
    const movement = previousRank === null
        ? 'first comparable checkpoint'
        : `previous #${previousRank}${delta === 0 ? ' · held rank' : delta !== null ? ` · ${delta > 0 ? '↑' : '↓'}${Math.abs(delta)}` : ''}`;
    const gaps = [
        ['Next', entry?.passGap?.next],
        ['Top 10', entry?.passGap?.topTen],
        ['Leader', entry?.passGap?.leader]
    ].map(([label, gap]) => {
        const normalized = normalizePassGap(gap);
        return {
            label,
            guarantee: guaranteedPassGapLabel({ passGap: normalized }),
            conservative: conservativePassGapLabel({ passGap: normalized })
        };
    }).filter((gap) => gap.guarantee || gap.conservative);
    return `
        <div class="maxis-cutline-card" style="flex:1 0 100%;margin:0" aria-label="Frozen score receipt">
            <strong>Frozen score receipt · ${currentRank ? `rank #${escapeHtml(String(currentRank))}` : 'qualified'}</strong>
            ${vector.length ? vector.map((metric) => {
                const unit = textValue(metric?.unit, 'score');
                const human = formatMetricAmount(metric?.value, unit);
                const exact = unit === 'mutez' ? ` · ${formatNumber(metric?.value)} mutez` : '';
                return `<span><b>${escapeHtml(textValue(metric?.label, metric?.metric, 'metric'))}:</b> ${escapeHtml(human)}${escapeHtml(exact)}</span>`;
            }).join(' · ') : `<span>${escapeHtml(scoreLabel(entry))}</span>`}
            <span> · ${escapeHtml(movement)}</span>
            ${gaps.map((gap) => `
                ${gap.guarantee ? `<span> · <b>${escapeHtml(gap.label)} actionable guarantee:</b> ${escapeHtml(gap.guarantee)}</span>` : ''}
                ${gap.conservative ? `<span> · <b>${escapeHtml(gap.label)} conservative static-vector path:</b> ${escapeHtml(gap.conservative)} · frozen snapshot only, not a live minimum</span>` : ''}
            `).join('')}
        </div>
    `;
}

function renderRowActions(entry, category) {
    if (!entry?.address) return '';
    const address = encodeURIComponent(entry.address);
    const tweetText = encodeURIComponent(rankTweetText(entry, category));
    return `
        <div class="maxis-row-actions" id="${escapeHtml(rowActionId(entry, category))}" role="group" aria-label="Score receipt and on-chain trails for ${escapeHtml(leaderName(entry))}">
            ${renderScoreReceipt(entry)}
            <a class="maxis-rank-action maxis-ledger-action" href="/#ledger-flow=${address}">Ledger Flow</a>
            <a class="maxis-rank-action" href="/#my-baker=${address}">My Tezos</a>
            ${entry.sourceUrl ? `<a class="maxis-rank-action maxis-source-action" href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noopener">Source ↗</a>` : ''}
            <a class="maxis-rank-action maxis-tweet-action" data-maxis-share="${escapeHtml(entry.address)}" data-maxis-share-lane="${escapeHtml(category)}" href="https://twitter.com/intent/tweet?text=${tweetText}" target="_blank" rel="noopener">Share rank #${escapeHtml(String(entry.rank))}</a>
        </div>
    `;
}

function renderPodiumPlace(entry, place, category) {
    if (!entry) {
        const phase = seasonPhase();
        const scope = chamberState.view === 'maxis'
            ? 'Ongoing board'
            : phase === 'finalized'
                ? 'Finalized season'
                : phase === 'settling'
                    ? 'Closed · settling'
                    : 'Season in progress';
        return `<div class="maxis-podium-place" data-place="${place}"><span class="maxis-podium-number">#${place}</span><strong>Open place</strong><code>${scope}</code><small>No qualifier recorded</small></div>`;
    }
    return `
        <div class="maxis-podium-place" data-place="${place}">
            ${place === 1 ? '<span class="maxis-podium-crown" aria-hidden="true">♛</span>' : ''}
            <span class="maxis-podium-number">#${place}</span>
            <strong title="${escapeHtml(leaderName(entry))}">${escapeHtml(leaderName(entry))}</strong>
            <code title="${escapeHtml(entry.address)}">${escapeHtml(shortAddress(entry.address))}</code>
            <small>${renderScoreAndRankDelta(entry)}</small>
            ${renderRowMenuToggle(entry, category)}
        </div>
    `;
}

function renderSeasonToMaxisHandoff(category) {
    if (chamberState.view !== 'season' || !categoriesFor(chamberState.legacy || {}).includes(category)) return '';
    return `<button class="maxis-season-to-maxis" type="button" data-maxis-handoff-lane="${escapeHtml(category)}">Open the ongoing ${escapeHtml(categoryLabel(category))} Maxi record</button>`;
}

function emptyLaneReason(data, lane, category) {
    if (chamberState.view === 'season' && category === 'governance') {
        const careerContext = chamberState.careers?.currentProtocolContext;
        const matchesCareerContext = careerContext?.complete === true
            && careerContext?.seasonId === chamberState.seasonId;
        const periods = matchesCareerContext
            ? asArray(careerContext.actionablePeriods)
            : asArray(data?.sourceReceipts?.governance?.votingPeriods);
        if (!periods.length) return 'No actionable Governance window occurred in this protocol season, so no season crown is declared.';
        const noun = periods.length === 1 ? 'window occurred' : 'windows occurred';
        return `${periods.length} actionable Governance ${noun} in this protocol season, but no qualifying ballot or proposal activity was recorded, so no season crown is declared.`;
    }
    return textValue(lane?.reason, lane?.method, chamberState.view === 'maxis' ? 'No trustworthy ongoing ranking was published for this identity.' : 'No trustworthy season ranking was published for this lane.');
}

function renderLaneBoard(data, category) {
    const ranking = normalizedRanking(data, category).slice(0, 10);
    const lane = leaderForCategory(data, category);
    const laneTitle = chamberState.view === 'maxis'
        ? ongoingLaneTitle(lane, category)
        : textValue(lane?.title, `${categoryLabel(category)} Maxi`);
    const phase = chamberState.view === 'season' ? seasonPhase() : 'active';
    const finalized = phase === 'finalized';
    const settling = phase === 'settling';
    if (!ranking.length) {
        const emptyReason = emptyLaneReason(data, lane, category);
        return `
            <article class="maxis-lane-board">
                <div class="maxis-lane-board-head"><span class="maxis-lane-mark">${CATEGORY_ICONS[category] || '•'}</span><span class="maxis-lane-title"><small>${escapeHtml(categoryLabel(category))} lane</small><strong>${escapeHtml(lane?.status === 'unavailable' ? 'No winner published' : finalized ? 'No season winner' : settling ? 'No provisional winner' : 'No qualifying wallets yet')}</strong></span><span class="maxis-lane-window">${escapeHtml(windowLabel(lane?.windowKind))}</span></div>
                <div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">${CATEGORY_ICONS[category] || '•'}</span><strong>${escapeHtml(lane?.status === 'unavailable' ? 'Winner withheld' : finalized ? 'This crown closed unawarded' : settling ? 'This crown closed without a qualifier' : 'This crown is still open')}</strong><p>${escapeHtml(emptyReason)}</p>${renderSeasonToMaxisHandoff(category)}</div></div>
            </article>
        `;
    }
    const selected = selectedRow(data, category);
    return `
        <article class="maxis-lane-board" data-maxis-board="${escapeHtml(category)}">
            <div class="maxis-lane-board-head">
                <span class="maxis-lane-mark">${CATEGORY_ICONS[category] || '•'}</span>
                <span class="maxis-lane-title"><small>${escapeHtml(categoryLabel(category))} lane</small><strong>${escapeHtml(laneTitle)}</strong></span>
                <span class="maxis-lane-window">${escapeHtml(windowLabel(lane?.windowKind || lane?.window))}</span>
            </div>
            <p class="maxis-lane-method">${escapeHtml(textValue(lane?.method, 'Objective score over the declared season window. Ties follow the published lane rules.'))}</p>
            <div class="maxis-podium" aria-label="${escapeHtml(categoryLabel(category))} top three">
                ${[1, 2, 3].map((place) => renderPodiumPlace(ranking[place - 1], place, category)).join('')}
            </div>
            ${selected && Number(selected.rank) <= 3 ? renderRowActions(selected, category) : ''}
            <ol class="maxis-compact-ranking" start="4" aria-label="${escapeHtml(categoryLabel(category))} ranks four through ten">
                ${ranking.slice(3).map((entry) => {
                    const expanded = rowKey(entry, category) === chamberState.rowDetail;
                    return `
                        <li class="maxis-compact-row${expanded ? ' is-expanded' : ''}" data-maxis-compact-rank="${escapeHtml(String(entry.rank))}">
                            <span class="maxis-compact-rank">#${escapeHtml(String(entry.rank))}</span>
                            <span class="maxis-compact-identity"><strong title="${escapeHtml(leaderName(entry))}">${escapeHtml(leaderName(entry))}</strong><code title="${escapeHtml(entry.address)}">${escapeHtml(shortAddress(entry.address))}</code></span>
                            <span class="maxis-compact-score">${renderScoreAndRankDelta(entry)}</span>
                            ${renderRowMenuToggle(entry, category)}
                            ${expanded ? renderRowActions(entry, category) : ''}
                        </li>
                    `;
                }).join('')}
            </ol>
        </article>
    `;
}

function raceForCategory(data, category) {
    const races = data?.races || data?.raceTelemetry || data?.telemetry?.races;
    if (Array.isArray(races)) return races.find((race) => canonicalCategory(race?.category || race?.lane || race?.id) === category) || {};
    if (races && typeof races === 'object') {
        const key = Object.keys(races).find((candidate) => canonicalCategory(candidate) === category);
        return key ? races[key] : {};
    }
    const cutoffs = data?.cutoffs;
    if (cutoffs && typeof cutoffs === 'object') {
        const key = Object.keys(cutoffs).find((candidate) => canonicalCategory(candidate) === category);
        if (key) return cutoffs[key] || {};
    }
    return {};
}

function honorsForCategory(data, category) {
    const source = data?.honors || data?.seasonHonors || [];
    let values = [];
    if (Array.isArray(source)) {
        values = source.filter((honor) => !honor?.category && !honor?.lane || canonicalCategory(honor?.category || honor?.lane) === category);
    } else if (source && typeof source === 'object') {
        const key = Object.keys(source).find((candidate) => canonicalCategory(candidate) === category);
        values = [...asArray(key ? source[key] : null), ...asArray(source.global || source.season)];
        if (!values.length) {
            values = Object.entries(source).map(([title, honor]) => ({
                ...(honor && typeof honor === 'object' ? honor : { detail: honor }),
                title: textValue(honor?.title, title.replace(/([a-z])([A-Z])/g, '$1 $2'))
            }));
        }
    }
    return values;
}

function honorRecipient(honor) {
    return honor?.winner || asArray(honor?.winners)[0] || honor?.leader || honor;
}

function honorDetail(honor) {
    const recipient = honorRecipient(honor);
    const movement = numberValue(recipient?.delta);
    const rank = numberValue(recipient?.rank);
    const category = canonicalCategory(recipient?.category || recipient?.lane);
    return textValue(
        honor?.scoreLabel,
        honor?.detail,
        honor?.description,
        movement !== null && movement !== 0 ? `${movement > 0 ? '↑' : '↓'}${formatNumber(Math.abs(movement))} ranks${rank ? ` · now #${formatNumber(rank)}` : ''}` : '',
        rank ? `${category ? `${categoryLabel(category)} · ` : ''}#${formatNumber(rank)}` : '',
        honor?.reason,
        'Earned this season'
    );
}

function renderHonorsPanel(data, category, { ongoing = false, settling = false, finalized = false } = {}) {
    const ranking = normalizedRanking(data, category);
    const lane = leaderForCategory(data, category);
    const leader = ranking[0];
    const challenger = ranking[1];
    const cutoff = ranking[Math.min(9, ranking.length - 1)];
    const race = raceForCategory(data, category);
    const honors = honorsForCategory(data, category);
    const raceChallenger = race?.nearestChallenger || challenger;
    const raceCutoff = race?.topTen || cutoff;
    const fullLeaderGap = challenger?.passGap?.leader || challenger?.passGap?.next;
    const exactLeaderGap = passGapLabel(fullLeaderGap ? { passGap: fullLeaderGap } : challenger);
    const closestGap = textValue(race?.gapToLeaderLabel, race?.leaderGapLabel, race?.gap, exactLeaderGap, raceChallenger ? `${scoreLabel(raceChallenger)} at #2` : 'No challenger yet');
    const cutoffCopy = textValue(race?.cutoffLabel, race?.topTenCutoffLabel, raceCutoff ? scoreLabel(raceCutoff) : 'Cut line not established');
    const leaderLabel = finalized ? 'Final leader' : settling ? 'Provisional leader' : 'Current leader';
    const challengerLabel = finalized ? 'Final runner-up' : settling ? 'Provisional runner-up' : 'Nearest challenger';
    if (lane?.status === 'unavailable') {
        return `
            <aside class="maxis-honors-panel" aria-label="${escapeHtml(categoryLabel(category))} publication status">
                <div class="maxis-side-heading"><strong>Publication withheld</strong><span>no inferred winner</span></div>
                <div class="maxis-honor-list">
                    <div class="maxis-honor-card"><span class="maxis-honor-mark">!</span><span class="maxis-honor-copy"><span>Coverage receipt</span><strong>${escapeHtml(textValue(lane?.coverageState, 'incomplete source'))}</strong><small>${escapeHtml(textValue(lane?.reason, 'The exhaustive result could not be proven.'))}</small></span></div>
                </div>
                <div class="maxis-cutline-card"><strong>No crown or cut line</strong>${escapeHtml(textValue(lane?.coverage, 'Partial data is intentionally not ranked.'))}</div>
            </aside>
        `;
    }
    if (!ranking.length) {
        return `
            <aside class="maxis-honors-panel" aria-label="${escapeHtml(categoryLabel(category))} ${finalized ? 'final empty lane' : settling ? 'closed provisional empty lane' : 'empty lane status'}">
                <div class="maxis-side-heading"><strong>${finalized ? 'Final empty lane' : settling ? 'Closed · no qualifiers' : 'No qualifiers'}</strong><span>${finalized ? 'final result' : settling ? 'provisional result' : 'complete empty lane'}</span></div>
                <div class="maxis-honor-list"><div class="maxis-honor-card"><span class="maxis-honor-mark">◇</span><span class="maxis-honor-copy"><span>Season result</span><strong>${finalized ? 'Unawarded crown' : settling ? 'Closed provisional crown' : 'Open crown'}</strong><small>${escapeHtml(emptyLaneReason(data, lane, category))}</small></span></div></div>
                <div class="maxis-cutline-card"><strong>Coverage</strong>${escapeHtml(textValue(lane?.coverage, lane?.coverageState, 'No cut line exists until a wallet qualifies.'))}</div>
            </aside>
        `;
    }
    return `
        <aside class="maxis-honors-panel" aria-label="${ongoing ? 'Ongoing Maxis board facts' : finalized ? 'Finalized season record' : settling ? 'Closed provisional season record' : 'Season honors'}">
            <div class="maxis-side-heading"><strong>${ongoing ? 'Objective record' : finalized ? 'Final record' : settling ? 'Settlement telemetry' : 'Race telemetry'}</strong><span>${escapeHtml(categoryLabel(category))}</span></div>
            <div class="maxis-honor-list">
                <div class="maxis-honor-card"><span class="maxis-honor-mark">♛</span><span class="maxis-honor-copy"><span>${leaderLabel}</span><strong>${escapeHtml(leaderName(leader))}</strong><small>${escapeHtml(scoreLabel(leader))}</small></span></div>
                <div class="maxis-honor-card"><span class="maxis-honor-mark">↟</span><span class="maxis-honor-copy"><span>${challengerLabel}</span><strong>${escapeHtml(leaderName(raceChallenger))}</strong><small>${escapeHtml(closestGap)}</small></span></div>
                ${honors.map((honor) => {
                    const ready = honor?.status === 'ready';
                    const result = ready
                        ? leaderName(honorRecipient(honor))
                        : finalized
                            ? 'not awarded'
                            : settling
                                ? 'provisional'
                                : textValue(honor?.status, 'pending');
                    const detail = ready
                        ? honorDetail(honor)
                        : finalized
                            ? 'No final receipt established a winner for this honor.'
                            : settling
                                ? 'Awaiting source settlement before this honor can be finalized.'
                                : honorDetail(honor);
                    return `
                        <div class="maxis-honor-card"><span class="maxis-honor-mark">${escapeHtml(textValue(honor?.icon, ready ? '✦' : '◇'))}</span><span class="maxis-honor-copy"><span>${escapeHtml(textValue(honor?.title, honor?.type, honor?.label, 'Season honor').replace(/\b\w/g, (letter) => letter.toUpperCase()))}</span><strong>${escapeHtml(result)}</strong><small>${escapeHtml(detail)}</small></span></div>
                    `;
                }).join('')}
            </div>
            <div class="maxis-cutline-card"><strong>Top 10 cut line</strong>${escapeHtml(cutoffCopy)}${ongoing ? ` · ${escapeHtml(windowLabel(leader?.windowKind))}` : finalized ? ' · frozen at finalization.' : settling ? ' · closed provisional line; the source-settlement rebuild is pending.' : ' · the line moves with every snapshot.'}</div>
        </aside>
    `;
}

function renderSeasonPanel() {
    const data = activeDataForSeason();
    if (!data) {
        const loading = chamberState.summaryLoading;
        const contextError = seasonContextError();
        const failed = !loading && Boolean(contextError);
        return `
            ${renderRoomIntro('Protocol arena', loading ? 'Opening the season sheet…' : failed ? 'Selected season is scoped unavailable' : 'Season rankings are not published yet', 'The ongoing Maxis boards remain available on their own live, rolling, and all-time-active clocks; they are never relabeled as protocol-season results.')}
            <div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">${failed ? '!' : '◉'}</span><strong>${loading ? 'Loading protocol-bounded scores' : failed ? 'The selected season sheet did not pass its receipt' : 'The first Maxis season is forming'}</strong><p>${loading ? 'Fetching the selected season summary while the ongoing Maxis boards stay usable.' : failed ? `${escapeHtml(contextError)} The canonical Maxis room remains available.` : 'A Maxis season only appears here when its activation boundary, score window, and source coverage can be stated honestly.'}</p>${failed ? '<button class="maxis-passport-submit" type="button" data-maxis-season-retry>Retry season sheet</button>' : ''}</div></div>
        `;
    }
    const category = ensureValidLane(data);
    const scope = seasonScopeLabels();
    const settling = scope.phase === 'settling';
    const finalized = scope.phase === 'finalized';
    const intro = finalized
        ? renderRoomIntro('Finalized protocol archive', 'Frozen season standings', 'This board is permanent. Winners, nearest challengers, cut lines, Honors, and lane rules remain fixed at finalization.')
        : renderRoomIntro(settling ? 'Closed season · provisional' : 'Live protocol season', settling ? 'Source settlement in progress' : 'Movement makes the chamber', settling ? 'These standings are inspectable but not final. Champions publish only after the declared source-settlement rebuild completes.' : 'One lane at a time: current crown, closest chase, rank movement, cut line, and human-playable honors without diluting the objective metric.');
    return `
        ${intro}
        ${renderLaneRail(data, category, 'Choose a protocol-season lane')}
        <div class="maxis-season-stage">
            ${renderLaneBoard(data, category)}
            ${renderHonorsPanel(data, category, { settling, finalized })}
        </div>
    `;
}

function renderMaxisIdentityCard(data, category, selected) {
    const lane = leaderForCategory(data, category);
    const ranking = normalizedRanking(data, category);
    const leader = ranking[0];
    const title = ongoingLaneTitle(lane, category);
    const layer = governanceLayer(category);
    const cardTitle = layer ? title.replace(/^L[12]\s+/, '') : title;
    const clock = windowLabel(lane?.windowKind || lane?.window);
    const unavailable = lane?.status === 'unavailable';
    const leaderCopy = unavailable ? 'Winner withheld' : (leader ? leaderName(leader) : 'Open identity');
    const scoreCopy = unavailable ? textValue(lane?.coverageState, 'coverage incomplete') : (leader ? scoreLabel(leader) : 'No qualifier yet');
    return `
        <button class="maxis-crown-card maxis-identity-card${category === selected ? ' is-selected' : ''}" type="button" aria-pressed="${category === selected ? 'true' : 'false'}" aria-controls="maxis-maxis-detail" aria-label="Inspect ${escapeHtml(title)}, ${escapeHtml(clock)} board" data-maxis-lane="${escapeHtml(category)}" data-maxis-overview-lane="${escapeHtml(category)}">
            <span class="maxis-identity-card-top"><b class="maxis-identity-mark" aria-hidden="true">${CATEGORY_ICONS[category] || '•'}</b><span class="maxis-identity-clock"><b aria-hidden="true">◷</b>${escapeHtml(clock)}</span></span>
            <strong>${layer ? `<b class="maxis-identity-layer" aria-hidden="true">${escapeHtml(layer)}</b> ` : ''}${escapeHtml(cardTitle)}</strong>
            <span class="maxis-identity-leader">${escapeHtml(leaderCopy)}</span>
            <small>${escapeHtml(scoreCopy)}</small>
            <span class="maxis-identity-cta">Inspect top 10 <b aria-hidden="true">→</b></span>
        </button>
    `;
}

function renderGovernanceProtocolContext() {
    const context = chamberState.careers?.currentProtocolContext;
    if (!context) {
        const reason = chamberState.careerError
            ? `The protocol pulse is scoped unavailable: ${chamberState.careerError}`
            : 'The independent protocol pulse is still loading.';
        return `
            <aside class="maxis-governance-context is-unavailable" aria-label="Current protocol L1 Governance context">
                <div><span>L1 protocol pulse</span><strong>Seasonal L1 Governance is episodic</strong></div>
                <p>${escapeHtml(reason)} The all-time-active L1 Governance Maxi board remains the canonical crown.</p>
            </aside>
        `;
    }
    const periods = asArray(context.actionablePeriods);
    const actions = numberValue(context.actions) || 0;
    const ballots = numberValue(context.ballots) || 0;
    const proposals = numberValue(context.proposals) || 0;
    const protocol = textValue(context.protocolName, 'Current protocol');
    let headline = `${protocol} Governance activity is live`;
    let explanation = `${formatNumber(actions)} applied actions · ${formatNumber(ballots)} ballots · ${formatNumber(proposals)} proposals across ${formatNumber(periods.length)} actionable window${periods.length === 1 ? '' : 's'}.`;
    if (context.state === 'no-actionable-period-observed') {
        headline = `${protocol} has no actionable Governance window yet`;
        explanation = 'No proposal, exploration, or promotion period has been observed in this protocol episode.';
    } else if (context.state === 'no-actionable-governance-occurred') {
        headline = `${protocol} has no seasonal Governance winner`;
        explanation = periods.length
            ? `${formatNumber(periods.length)} actionable window${periods.length === 1 ? ' has' : 's have'} been observed, but no applied ballot or proposal activity has occurred.`
            : 'No applied ballot or proposal activity has occurred in an actionable Governance window.';
    } else if (context.state === 'unavailable') {
        headline = `${protocol} Governance context is unavailable`;
        explanation = textValue(context.reason, 'The protocol-season receipt is incomplete.');
    }
    return `
        <aside class="maxis-governance-context" aria-label="Current protocol L1 Governance context">
            <div><span>L1 protocol pulse · separate clock</span><strong>${escapeHtml(headline)}</strong></div>
            <p>${escapeHtml(explanation)} The all-time-active L1 Governance Maxi board remains the canonical crown; a protocol-season award appears only when that episode has qualifying activity.</p>
        </aside>
    `;
}

function renderL2GovernanceContext() {
    const artifact = chamberState.l2Governance;
    if (!artifact) {
        const reason = textValue(
            chamberState.l2GovernanceError,
            'The independent integrity-checked L2 governance artifact is still loading.'
        );
        return `
            <aside class="maxis-governance-context maxis-l2-governance-context has-action is-unavailable" aria-label="Tezos X L2 Governance context">
                <div><span>Tezos X · FAST / SLOW / SEQUENCER</span><strong>L2 Governance Maxi is scoped unavailable</strong></div>
                <p>${escapeHtml(reason)} L1 Governance, protocol Seasons, and archived Champions remain independent.</p>
                <a class="maxis-governance-context-action" href="/l2chamber/">Open L2 Chamber <b aria-hidden="true">→</b></a>
            </aside>
        `;
    }
    const coverage = artifact.coverage || {};
    const tracks = asArray(coverage.tracks).map((track) => String(track).toUpperCase()).filter(Boolean);
    const windows = numberValue(coverage.actionableWindows, coverage.windows, artifact?.periodLedger?.count);
    const participants = numberValue(coverage.participantCount, artifact?.totals?.participatingBakers, artifact.recordCount, Object.keys(artifact.records || {}).length) || 0;
    const contracts = l2GovernanceContractCount(artifact);
    const generated = formatDate(artifact.generatedAt);
    const scope = [
        windows !== null ? `${formatNumber(windows)} canonical windows` : '',
        `${formatNumber(participants)} participating bakers`,
        contracts ? `${formatNumber(contracts)} contracts` : ''
    ].filter(Boolean).join(' · ');
    return `
        <aside class="maxis-governance-context maxis-l2-governance-context has-action" aria-label="Tezos X L2 Governance context">
            <div><span>Tezos X · ${escapeHtml(tracks.join(' / ') || 'FAST / SLOW / SEQUENCER')}</span><strong>Baker participation across L2 governance</strong></div>
            <p>${escapeHtml(scope)}${generated ? ` · verified ${escapeHtml(generated)}` : ''}. Score counts distinct canonical track, contract, period, and phase windows attributed to represented baker accounts. Delegated voting-key calls belong to their baker; raw calls and vote weight never change the score.</p>
            <a class="maxis-governance-context-action" href="/l2chamber/">Open L2 Chamber <b aria-hidden="true">→</b></a>
        </aside>
    `;
}

function renderMaxisPanel() {
    const data = chamberState.legacy;
    if (!data) return `<div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">✺</span><strong>Ongoing Maxis records are unavailable</strong><p>The last valid live, rolling, and all-time snapshot did not load.</p></div></div>`;
    const category = ensureValidLane(data);
    const lane = leaderForCategory(data, category);
    return `
        ${renderRoomIntro('Stable identities · honest clocks', 'Every way to be a Tezos Maxi', 'Scan every ongoing identity at once. Each card declares its own live, rolling, all-time, or cross-lane clock; choose one to inspect the objective top 10 and its on-chain trails.')}
        <section class="maxis-crown-grid maxis-identity-grid" aria-label="Ongoing Tezos Maxis identities">
            ${categoriesFor(data).map((identity) => renderMaxisIdentityCard(data, identity, category)).join('')}
        </section>
        <div class="maxis-maxis-detail" id="maxis-maxis-detail" tabindex="-1" aria-label="${escapeHtml(categoryLabel(category))} detailed board">
            <div class="maxis-detail-heading"><span>Detailed board</span><strong>${escapeHtml(ongoingLaneTitle(lane, category))}</strong><small>◷ ${escapeHtml(windowLabel(lane?.windowKind || lane?.window))}</small></div>
            ${category === 'governance' ? renderGovernanceProtocolContext() : ''}
            ${category === 'l2_governance' ? renderL2GovernanceContext() : ''}
            <div class="maxis-season-stage">
                ${renderLaneBoard(data, category)}
                ${renderHonorsPanel(data, category, { ongoing: true })}
            </div>
        </div>
    `;
}

function implicitAddressStatus(raw) {
    const address = String(raw || '').trim();
    if (/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
        return { address, error: 'KT1 contract passports are not supported. A contract can have many operators, so assigning its activity to one person would be misleading.' };
    }
    if (!/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
        return { address, error: 'Enter one implicit Tezos address beginning tz1, tz2, tz3, or tz4, or a valid .tez name.' };
    }
    return { address, error: '' };
}

function findProfile(container, address) {
    if (!container || !address) return null;
    const target = address.toLowerCase();
    if (Array.isArray(container)) return container.find((profile) => String(profile?.address || profile?.wallet || '').toLowerCase() === target) || null;
    if (typeof container !== 'object') return null;
    const directKey = Object.keys(container).find((key) => key.toLowerCase() === target);
    if (directKey && container[directKey] && typeof container[directKey] === 'object') return { address, ...container[directKey] };
    for (const key of ['profiles', 'passports', 'records', 'wallets', 'entries']) {
        const result = findProfile(container[key], address);
        if (result) return result;
    }
    return null;
}

function inlinePassport(address, { seasonId = chamberState.seasonId, summary = chamberState.summary } = {}) {
    const season = seasonById(seasonId);
    const currentSeason = seasonId === currentSeasonId(chamberState.manifest);
    const sources = [
        summary?.passports,
        summary?.profiles,
        season?.passports,
        currentSeason ? chamberState.manifest?.inlinePassports : null,
        currentSeason ? chamberState.manifest?.passports?.profiles : null
    ];
    return sources.map((source) => findProfile(source, address)).find(Boolean) || null;
}

function passportConfig({ seasonId = chamberState.seasonId, summary = chamberState.summary } = {}) {
    const season = seasonById(seasonId);
    const manifest = chamberState.manifest || {};
    const config = manifest.passportShards || manifest.passportSharding || manifest.passports || manifest.shards || {};
    const summaryConfig = summary?.passportShards || summary?.passports || {};
    const seasonConfig = season?.passportShards || season?.passports || {};
    return {
        ...config,
        ...summaryConfig,
        ...seasonConfig,
        algorithm: textValue(seasonConfig.shardAlgorithm, summaryConfig.shardAlgorithm, config.shardAlgorithm, config.algorithm, manifest.passportShardAlgorithm, 'sha256-first-byte-mask-3f-v1'),
        integrityAlgorithm: textValue(seasonConfig.integrityAlgorithm, summaryConfig.integrityAlgorithm, summaryConfig.algorithm, config.integrityAlgorithm),
        count: numberValue(seasonConfig.count, seasonConfig.shardCount, summaryConfig.count, summaryConfig.shardCount, config.count, config.shardCount, manifest.passportShardCount, 64) || 64,
        template: textValue(
            seasonConfig.template,
            seasonConfig.urlTemplate,
            seasonConfig.shardUrlTemplate,
            seasonConfig.passportPathTemplate,
            summaryConfig.template,
            summaryConfig.pathTemplate,
            summaryConfig.urlTemplate,
            summaryConfig.shardUrlTemplate,
            config.template,
            config.pathTemplate,
            config.urlTemplate,
            config.shardUrlTemplate,
            manifest.passportShardUrlTemplate,
            season?.passportShardUrlTemplate,
            season?.passportPathTemplate,
            manifest?.current?.passportPathTemplate
        ),
        shardMap: seasonConfig.shardMap || summaryConfig.shardMap || config.shardMap || manifest.passportShardMap || {},
        shardHashes: seasonConfig.shardHashes || summaryConfig.shardHashes || config.shardHashes || manifest.passportShardHashes || {},
        contentRoot: textValue(seasonConfig.contentRoot, summaryConfig.contentRoot, config.contentRoot, manifest.passportContentRoot),
        availableShards: seasonConfig.availableShards
            || season?.availableShards
            || summaryConfig.availableShards
            || summaryConfig.nonemptyShards
            || config.availableShards
            || config.nonemptyShards
            || null
    };
}

function fnv1a32(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

async function addressShard(address, config) {
    const direct = config.shardMap?.[address] || config.shardMap?.[address.toLowerCase()];
    if (direct !== undefined && direct !== null) return String(direct).padStart(2, '0');
    const algorithm = String(config.algorithm || '').toLowerCase();
    const count = Math.max(1, Number(config.count || 64));
    let shardNumber;
    if (algorithm.includes('sha256')) {
        const digestHex = await sha256Text(address.trim());
        const firstByte = Number.parseInt(digestHex.slice(0, 2), 16);
        shardNumber = algorithm.includes('mask-3f') && count === 64 ? firstByte & 0x3f : firstByte % count;
    } else if (algorithm.includes('fnv1a32')) {
        shardNumber = fnv1a32(address.trim()) % count;
    } else {
        throw new Error(`Unsupported passport shard algorithm: ${config.algorithm || 'unknown'}.`);
    }
    const width = count <= 256 ? 2 : Math.max(2, Math.ceil(Math.log(count) / Math.log(16)));
    return shardNumber.toString(16).padStart(width, '0');
}

async function loadPassportShard(address, { seasonId = chamberState.seasonId || currentSeasonId(chamberState.manifest) || 'live', summary = chamberState.summary } = {}) {
    const config = passportConfig({ seasonId, summary });
    const shard = await addressShard(address, config);
    if (Array.isArray(config.availableShards) && !config.availableShards.map(String).includes(shard)) {
        return { passports: {}, shard, empty: true };
    }
    const direct = config.shardMap?.[address] || config.shardMap?.[address.toLowerCase()];
    let url = typeof direct === 'string' && direct.includes('/') ? direct : config.template;
    if (!url) url = `/data/maxis/seasons/${encodeURIComponent(seasonId)}/passports/{shard}.json`;
    url = String(url)
        .replaceAll('{shard}', shard)
        .replaceAll(':shard', shard)
        .replaceAll('{seasonId}', encodeURIComponent(seasonId))
        .replaceAll('{season}', encodeURIComponent(seasonId));
    url = resolveDataUrl(url);
    const key = `${seasonId}:${shard}:${url}`;
    if (shardCache.has(key)) return shardCache.get(key);
    if (shardRequestCache.has(key)) return shardRequestCache.get(key);
    const request = (async () => {
        // Passport shards are immutable season receipts and are verified below
        // against the manifest's shard hash (and content root when present).
        // Normal HTTP caching therefore saves repeat transfers while still
        // allowing validators such as ETag to revalidate the stable URL.
        const response = await fetch(url, { cache: 'default', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
        const raw = await response.text();
        const expectedHash = config.shardHashes?.[shard];
        await verifyPassportShardText(raw, expectedHash, shard);
        if (expectedHash && config.contentRoot) {
            const rootInput = Object.entries(config.shardHashes)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([keyName, hash]) => `${keyName}:${hash}`)
                .join('\n');
            const actualRoot = await sha256Text(rootInput);
            if (actualRoot.toLowerCase() !== String(config.contentRoot).toLowerCase()) {
                throw new Error('The Passport shard hash catalog does not match its season content root. Retry after the season artifacts finish publishing.');
            }
        }
        let payload;
        try {
            payload = JSON.parse(raw);
        } catch {
            throw new Error(`Passport shard ${shard} is not valid JSON. Retry after the season artifacts finish publishing.`);
        }
        const shardIdentityMatches = Number(payload?.schema) === 2
            && String(payload?.seasonId || '') === String(seasonId)
            && String(payload?.shard || '') === String(shard)
            && String(payload?.shardAlgorithm || '') === String(config.algorithm || '');
        if (!shardIdentityMatches) {
            throw new Error(`Passport shard ${shard} does not match the selected season identity or sharding contract. Retry after the season artifacts finish publishing.`);
        }
        if (payload) shardCache.set(key, payload);
        return payload;
    })();
    shardRequestCache.set(key, request);
    try {
        return await request;
    } finally {
        shardRequestCache.delete(key);
    }
}

function normalizeProfileLane(lane, category) {
    const record = lane && typeof lane === 'object' ? lane : { scoreLabel: lane };
    const rawPassGap = record?.passGap || (record?.topTenGap ? { next: null, topTen: record.topTenGap, leader: null } : null);
    return {
        ...record,
        category: canonicalCategory(record?.category || record?.lane || record?.id || category),
        passGap: normalizePassGapSet(rawPassGap)
    };
}

function profileLanes(profile) {
    if (profile?.format === 'transaction-only-v1' && profile?.transaction) {
        return [normalizeProfileLane(profile.transaction, 'transaction')];
    }
    const source = profile?.lanes || profile?.currentLanes || profile?.rankings || profile?.laneProgress || [];
    if (Array.isArray(source)) return source.map((lane) => normalizeProfileLane(lane));
    if (source && typeof source === 'object') {
        return Object.entries(source).map(([category, lane]) => normalizeProfileLane(lane, category));
    }
    return [];
}

function profilePersonalBests(profile) {
    if (profile?.personalBests || profile?.bests) return normalizeNamedRecords(profile.personalBests || profile.bests, 'Personal best');
    if (profile?.format === 'transaction-only-v1' && profile?.personalBest) {
        return [{ ...profile.personalBest, category: 'transaction', title: 'Transaction' }];
    }
    return [];
}

function normalizeNamedRecords(source, fallbackLabel) {
    if (Array.isArray(source)) return source;
    if (source && typeof source === 'object') {
        return Object.entries(source).map(([name, record]) => ({
            ...(record && typeof record === 'object' ? record : { detail: record }),
            title: textValue(record?.title, record?.label, name, fallbackLabel)
        }));
    }
    return [];
}

function passGapRecord(record) {
    return normalizePassGap(record?.passGap?.topTen || record?.passGap);
}

function guaranteedPassGapLabel(record) {
    const gap = passGapRecord(record);
    const guaranteed = gap?.guaranteedPrimary;
    if (!guaranteed) return '';
    return `+${formatMetricAmount(guaranteed.amount, textValue(guaranteed.unit, guaranteed.label, 'activity'))} to guarantee #${gap.targetRank || 10}`;
}

function conservativePassGapLabel(record) {
    const gap = passGapRecord(record);
    const path = asArray(gap?.conservativeVectorPath);
    if (!path.length) return '';
    const vector = path.map((step) => `+${formatMetricAmount(step.amount, textValue(step.unit, step.label, 'activity'))}`).join(' · ');
    return `${vector} against the frozen #${gap.targetRank || 10} score vector`;
}

function passGapLabel(record) {
    const guarantee = guaranteedPassGapLabel(record);
    if (guarantee) return guarantee;
    const conservative = conservativePassGapLabel(record);
    return conservative ? `conservative static-vector path: ${conservative} · not a live minimum` : '';
}

function derivePassport(address, data) {
    const lanes = [];
    let alias = '';
    categoriesFor(data).forEach((category) => {
        const ranking = normalizedRanking(data, category);
        const row = ranking.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
        if (!row) return;
        alias ||= leaderName(row) === shortAddress(address) ? '' : leaderName(row);
        lanes.push({
            category,
            rank: row.rank,
            score: row.score,
            scoreLabel: scoreLabel(row),
            qualifies: row.rank <= 10,
            nextStep: row.rank <= 10 ? `Holding #${row.rank}` : `${row.rank - 10} places from the top 10`,
            personalBest: row.personalBest || row.rank
        });
    });
    const qualifying = lanes.filter((lane) => lane.qualifies).length;
    return {
        address,
        alias,
        lanes,
        badges: [],
        nearMisses: lanes.filter((lane) => !lane.qualifies && lane.rank <= 20),
        streaks: [],
        personalBests: lanes.map((lane) => ({ category: lane.category, rank: lane.personalBest })),
        unicorn: { qualifyingLanes: qualifying, requiredLanes: 3 },
        derived: true
    };
}

async function loadPassportProfile(address) {
    if (!chamberState.manifest && chamberState.manifestError) {
        throw new Error(`The selected season Passport is unavailable: ${chamberState.manifestError}`);
    }
    if (chamberState.manifest && !chamberState.summary && chamberState.summaryError) {
        throw new Error(`The selected season Passport is unavailable: ${chamberState.summaryError}`);
    }
    const inline = inlinePassport(address);
    if (inline) return { profile: { address, ...inline }, note: '' };
    const shard = await loadPassportShard(address);
    const profile = findProfile(shard, address);
    if (profile) return { profile: { address, ...profile }, note: '' };
    const data = chamberState.summary || (!chamberState.manifest ? chamberState.legacy : null);
    const derived = derivePassport(address, data || {});
    const localMatch = profileLanes(derived).length > 0;
    const note = localMatch
        ? 'This address was not indexed into a Passport record, so the visible portion was reconstructed from the loaded rankings.'
        : 'No Passport record or loaded ranking was found for this address in the selected season.';
    return { profile: derived, note };
}

async function loadPassportCareer(address) {
    const seasons = normalizedSeasons(chamberState.manifest)
        .filter((season) => season?.id && season.id !== 'live');
    const receipts = await Promise.all(seasons.map(async (season) => {
        try {
            const summary = season.id === chamberState.seasonId && chamberState.summary
                ? chamberState.summary
                : await loadSeasonSummary(season.id);
            if (!summary) throw new Error('No verified season summary is available.');
            const inline = inlinePassport(address, { seasonId: season.id, summary });
            const shard = inline ? null : await loadPassportShard(address, { seasonId: season.id, summary });
            const profile = inline || findProfile(shard, address);
            return {
                seasonId: season.id,
                seasonLabel: season.displayLabel || `${season.protocol || 'Tezos'} Season`,
                status: profile ? 'recorded' : 'no-record',
                profile: profile ? { address, ...profile } : null,
                error: ''
            };
        } catch (error) {
            return {
                seasonId: season.id,
                seasonLabel: season.displayLabel || `${season.protocol || 'Tezos'} Season`,
                status: 'unavailable',
                profile: null,
                error: textValue(error?.message, 'Season Passport receipt unavailable.')
            };
        }
    }));
    return {
        address,
        complete: receipts.every((receipt) => receipt.status !== 'unavailable'),
        seasonsScanned: receipts.length,
        records: receipts.filter((receipt) => receipt.profile),
        receipts,
        errors: receipts.filter((receipt) => receipt.status === 'unavailable')
    };
}

function passportUnicornProgress(profile, lanes = profileLanes(profile)) {
    const frozenQualifying = profile?.unicorn?.qualifyingLanes;
    const compactQualifying = profile?.unicornProgress?.qualifyingLanes;
    const genericQualifying = profile?.qualifyingLanes;
    const inferred = lanes.filter((lane) => {
        const rank = numberValue(lane?.rank, lane?.currentRank);
        return lane?.qualifies || (rank !== null && rank <= 100);
    }).length;
    const qualifying = numberValue(
        profile?.unicorn?.breadth,
        Array.isArray(frozenQualifying) ? frozenQualifying.length : frozenQualifying,
        profile?.unicornProgress?.breadth,
        Array.isArray(compactQualifying) ? compactQualifying.length : compactQualifying,
        Array.isArray(genericQualifying) ? genericQualifying.length : genericQualifying,
        inferred
    ) || 0;
    const lanesNeeded = numberValue(profile?.unicorn?.lanesNeeded, profile?.unicornProgress?.lanesNeeded);
    const required = numberValue(
        profile?.unicorn?.requiredLanes,
        profile?.unicornProgress?.requiredLanes,
        profile?.unicornRequired,
        lanesNeeded !== null ? qualifying + lanesNeeded : null,
        3
    ) || 3;
    const explicitPercent = numberValue(
        profile?.unicorn?.badgeProgress?.percent,
        profile?.unicorn?.progressPercent,
        profile?.unicornProgress?.badgeProgress?.percent,
        profile?.unicornProgress?.progressPercent
    );
    return {
        qualifying,
        required,
        percent: Math.min(100, Math.round(explicitPercent ?? ((qualifying / Math.max(1, required)) * 100)))
    };
}

function profileNearMisses(profile) {
    if (profile?.nearMisses || profile?.near_misses) return normalizeNamedRecords(profile.nearMisses || profile.near_misses, 'Near miss');
    const transaction = profile?.format === 'transaction-only-v1' ? profile?.transaction : null;
    const rank = numberValue(transaction?.rank);
    if (!transaction?.topTenGap || rank === null || rank < 11 || rank > 25) return [];
    return [{
        category: 'transaction',
        title: 'Transaction Top 10',
        rank,
        passGap: normalizePassGap(transaction.topTenGap)
    }];
}

function badgeRecords(profile, { includeFallback = true } = {}) {
    const source = profile?.badges || profile?.achievements || [];
    let badges = [];
    if (Array.isArray(source)) {
        badges = source.map((badge) => typeof badge === 'string' ? { title: badge, earned: true } : badge);
    } else if (source && typeof source === 'object') {
        badges = Object.entries(source).map(([title, badge]) => typeof badge === 'boolean'
            ? { title, earned: badge }
            : { ...badge, title: textValue(badge?.title, title) });
    }
    const lanes = profileLanes(profile);
    const { qualifying, required } = passportUnicornProgress(profile, lanes);
    if (qualifying >= required && !badges.some((badge) => String(badge?.title || '').toLowerCase().includes('unicorn'))) {
        badges.push({ title: 'Season Unicorn', icon: '✺', earned: true });
    }
    if (!badges.length && includeFallback) badges.push({ id: 'local-passport-opened', title: 'Passport opened', icon: '◇', earned: true });
    return badges;
}

function careerSeasonRecords() {
    return asArray(chamberState.passportCareer?.records).filter((record) => record?.profile);
}

function careerBadgeRecords(address) {
    const badges = [];
    const seen = new Set();
    careerSeasonRecords().forEach((record) => {
        badgeRecords(record.profile, { includeFallback: false }).forEach((badge) => {
            const title = textValue(badge?.title, badge?.label, 'Season badge');
            const key = `${record.seasonId}:${textValue(badge?.id, title)}`;
            if (seen.has(key)) return;
            seen.add(key);
            badges.push({
                ...badge,
                title,
                seasonId: record.seasonId,
                seasonLabel: record.seasonLabel,
                detail: textValue(badge?.detail, badge?.description, `Earned in ${record.seasonLabel}`)
            });
        });
    });
    return badges;
}

function careerPersonalBestRecords() {
    const bestByCategory = new Map();
    let bestActiveWeekStreak = null;
    careerSeasonRecords().forEach((record) => {
        profilePersonalBests(record.profile).forEach((best) => {
            const category = canonicalCategory(best?.category || best?.lane || best?.title || best?.label);
            const rank = numberValue(best?.rank, best?.personalBestRank);
            if (!category || rank === null) return;
            const candidate = {
                category,
                title: categoryLabel(category),
                rank,
                value: `#${rank}`,
                detail: `${textValue(best?.scoreLabel, scoreLabel(best), `Best rank #${rank}`)} · ${record.seasonLabel}; frozen rules remain season-specific.`
            };
            const previous = bestByCategory.get(category);
            if (!previous || rank < previous.rank) bestByCategory.set(category, candidate);
        });
        const streak = numberValue(record.profile?.activeWeekStreak);
        if (streak !== null && (!bestActiveWeekStreak || streak > bestActiveWeekStreak.count)) {
            bestActiveWeekStreak = {
                title: 'Active-week streak',
                count: streak,
                detail: `${streak} consecutive completed week${streak === 1 ? '' : 's'} in ${record.seasonLabel}.`
            };
        }
    });
    const bests = [...bestByCategory.values()].sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title));
    if (bestActiveWeekStreak) bests.push(bestActiveWeekStreak);
    return bests;
}

function renderCareerBreadth() {
    const career = chamberState.passportCareer;
    const records = careerSeasonRecords();
    const distinctLanes = new Set();
    let bestSeasonBreadth = 0;
    let unicornSeasons = 0;
    records.forEach((record) => {
        const lanes = profileLanes(record.profile);
        lanes.forEach((lane) => distinctLanes.add(canonicalCategory(lane?.category || lane?.lane)));
        const progress = passportUnicornProgress(record.profile, lanes);
        bestSeasonBreadth = Math.max(bestSeasonBreadth, progress.qualifying);
        if (progress.qualifying >= progress.required) unicornSeasons += 1;
    });
    const scanned = numberValue(career?.seasonsScanned) || 0;
    const unavailable = asArray(career?.errors).length;
    const receiptCopy = unavailable
        ? `${scanned - unavailable}/${scanned} season receipts verified · ${unavailable} scoped unavailable`
        : `${scanned}/${scanned} season receipts verified`;
    return `
        <div class="maxis-passport-lane maxis-career-breadth${unavailable ? ' is-unavailable' : ''}">
            <div class="maxis-passport-lane-head"><strong>✺ Cross-season breadth</strong><span>${escapeHtml(receiptCopy)}</span></div>
            <p><strong>${escapeHtml(formatNumber(distinctLanes.size))} distinct lanes</strong> across ${escapeHtml(formatNumber(records.length))} recorded season${records.length === 1 ? '' : 's'} · best season breadth ${escapeHtml(formatNumber(bestSeasonBreadth))}${unicornSeasons ? ` · Unicorn in ${escapeHtml(formatNumber(unicornSeasons))} season${unicornSeasons === 1 ? '' : 's'}` : ''}.</p>
        </div>
    `;
}

function progressPercent(lane) {
    const badge = lane?.badgeProgress || lane?.passportMilestone || lane?.milestoneProgress || {};
    const raw = numberValue(badge?.percent, badge?.progressPercent, lane?.progressPercent, lane?.progressPct);
    if (raw !== null) return Math.max(0, Math.min(100, raw));
    const fraction = numberValue(badge?.fraction, badge?.progressFraction, lane?.progressFraction);
    if (fraction !== null) return Math.max(0, Math.min(100, fraction * 100));
    return lane?.qualifies ? 100 : 0;
}

function milestoneCopy(lane) {
    const badge = lane?.badgeProgress || lane?.passportMilestone || lane?.milestoneProgress;
    if (!badge || typeof badge !== 'object') return '';
    if (badge.earned || numberValue(badge.percent, badge.progressPercent) >= 100) return textValue(badge.earnedLabel, badge.label ? `${badge.label} milestone earned` : '', 'Frozen lane milestone earned');
    const remaining = numberValue(badge.remaining, badge.amountRemaining);
    const metric = textValue(badge.unit, badge.metricLabel, badge.metric, 'activity');
    return textValue(badge.remainingLabel, badge.nextStep, remaining !== null ? `+${formatMetricAmount(remaining, metric)} to ${textValue(badge.label, 'the frozen lane milestone')}` : '', badge.label);
}

function renderPassportLane(lane) {
    const category = canonicalCategory(lane?.category || lane?.lane || lane?.id);
    const phase = seasonPhase();
    const finalized = phase === 'finalized';
    const settling = phase === 'settling';
    const rank = numberValue(lane?.rank, lane?.currentRank);
    const progress = Math.round(progressPercent(lane));
    const stableBadge = lane?.badgeProgress || lane?.passportMilestone || lane?.milestoneProgress;
    const stablePercent = stableBadge && typeof stableBadge === 'object'
        ? numberValue(stableBadge.percent, stableBadge.progressPercent)
        : null;
    const statusLabel = rank
        ? `#${rank}${stablePercent !== null ? ` · ${progress}% badge` : ''}`
        : (stablePercent !== null ? `${progress}% badge` : 'unranked');
    const milestone = milestoneCopy(lane);
    const next = finalized
        ? milestone
            ? `${milestone} · frozen at finalization.`
            : rank
                ? `Final season rank #${rank}; no separate milestone receipt was published for this lane.`
                : 'No final ranked receipt was recorded for this lane.'
        : settling
            ? milestone
                ? `${milestone} · closed provisional result.`
                : rank
                    ? `Provisional season rank #${rank}; source settlement remains pending.`
                    : 'No provisional ranked receipt is currently recorded for this lane.'
            : textValue(milestone, lane?.nextStep, lane?.description, rank ? `Current season rank #${rank}; frozen milestone progress is not available for this lane.` : 'Progress is recorded at the next snapshot.');
    const topTenGap = rank && rank > 10 && lane?.passGap?.topTen
        ? passGapLabel({ passGap: lane.passGap.topTen })
        : '';
    const cutoffLabel = finalized ? 'Final Top 10 cutoff' : settling ? 'Provisional Top 10 cutoff' : 'Moving Top 10 cutoff';
    return `
        <div class="maxis-passport-lane">
            <div class="maxis-passport-lane-head"><strong>${CATEGORY_ICONS[category] || '•'} ${escapeHtml(categoryLabel(category))}</strong><span>${escapeHtml(statusLabel)}</span></div>
            ${stablePercent !== null ? `<div class="maxis-progress-track" aria-label="${escapeHtml(categoryLabel(category))} stable badge progress ${progress}%"><span class="maxis-progress-fill" style="--maxis-progress: ${progress}%"></span></div>` : ''}
            <p><strong>${escapeHtml(scoreLabel(lane))}</strong> · ${escapeHtml(next)}</p>
            ${topTenGap ? `<p><strong>${cutoffLabel}</strong> · ${escapeHtml(topTenGap)}</p>` : ''}
        </div>
    `;
}

function renderRecordCards(records, emptyCopy, icon, scopeLabel = 'season') {
    if (!records.length) return `<div class="maxis-passport-lane"><div class="maxis-passport-lane-head"><strong>${icon} None recorded yet</strong><span>${escapeHtml(scopeLabel)}</span></div><p>${escapeHtml(emptyCopy)}</p></div>`;
    return records.map((record) => {
        const category = canonicalCategory(record?.category || record?.lane);
        const title = textValue(record?.title, record?.label, category ? categoryLabel(category) : '', 'Season record');
        const detail = textValue(record?.detail, record?.description, record?.gapLabel, passGapLabel(record), record?.scoreLabel, record?.streakLabel, record?.rank ? `Best rank #${record.rank}` : '', 'Recorded this season');
        return `<div class="maxis-passport-lane"><div class="maxis-passport-lane-head"><strong>${icon} ${escapeHtml(title)}</strong><span>${escapeHtml(textValue(record?.value, record?.count, record?.rank ? `#${record.rank}` : ''))}</span></div><p>${escapeHtml(detail)}</p></div>`;
    }).join('');
}

function ongoingCrownRecords(address) {
    const target = String(address || '').toLowerCase();
    if (!target || !chamberState.legacy) return [];
    return categoriesFor(chamberState.legacy).flatMap((category) => {
        const lane = leaderForCategory(chamberState.legacy, category);
        const entry = normalizedRanking(chamberState.legacy, category)
            .find((row) => String(row?.address || '').toLowerCase() === target);
        return entry ? [{ category, lane, entry }] : [];
    }).sort((left, right) => Number(left.entry.rank) - Number(right.entry.rank));
}

function renderOngoingCrownRecords(address) {
    const records = ongoingCrownRecords(address);
    if (!records.length) {
        return '<div class="maxis-passport-lane"><div class="maxis-passport-lane-head"><strong>♛ No current top-ten crown</strong><span>ongoing</span></div><p>This address is not in the published top ten of a lane-native ongoing board. Season achievements remain part of its career record.</p></div>';
    }
    return records.map(({ category, lane, entry }) => `
        <div class="maxis-passport-lane maxis-career-crown">
            <div class="maxis-passport-lane-head"><strong>${CATEGORY_ICONS[category] || '•'} ${escapeHtml(ongoingLaneTitle(lane, category))}</strong><span>${escapeHtml(windowLabel(lane?.windowKind || entry?.windowKind))}</span></div>
            <p><strong>#${escapeHtml(String(entry.rank))} · ${escapeHtml(scoreLabel(entry))}</strong> on the current canonical board.</p>
        </div>
    `).join('');
}

function renderLocalPassportRitual(address) {
    const shares = Number(readShareLedger()[String(address || '').toLowerCase()]?.count || 0);
    if (shares <= 0) return '';
    return `
        <div class="maxis-side-heading maxis-passport-section-heading"><strong>Device-local ritual</strong><span>not verified</span></div>
        <div class="maxis-passport-lanes maxis-career-records">
            <div class="maxis-passport-lane maxis-local-ritual">
                <div class="maxis-passport-lane-head"><strong>↗ Rank-share clicks</strong><span>${escapeHtml(formatNumber(shares))} on this device</span></div>
                <p>This counter is stored only in this browser. It is not an on-chain receipt, a verified share, or part of Career stamps, crown scores, or Unicorn breadth.</p>
            </div>
        </div>
    `;
}

function governanceCareerRecord(address) {
    const artifact = chamberState.careers;
    const target = String(address || '');
    if (!artifact || !target) return null;
    const direct = artifact.records?.[target];
    if (direct) return direct;
    const matchedKey = Object.keys(artifact.records || {}).find((key) => key.toLowerCase() === target.toLowerCase());
    if (matchedKey) return artifact.records[matchedKey];
    if (artifact.coverage?.absenceMeansZero === true) {
        return {
            address: target,
            clock: 'career',
            lifetimeBallots: 0,
            lifetimeProposals: 0,
            lifetimeActions: 0,
            actionablePeriodsParticipated: 0,
            ballotPeriodsParticipated: 0,
            longestBallotPeriodStreak: 0,
            currentBallotPeriodStreak: 0,
            activeDelegate: false,
            activeDelegateGovernanceRank: null,
            lastGovernanceActivityAt: null
        };
    }
    return null;
}

function renderGovernanceCareer(address) {
    const record = governanceCareerRecord(address);
    if (!record) {
        const reason = chamberState.careerError
            ? `L1 governance career is scoped unavailable: ${chamberState.careerError}`
            : 'L1 governance career is loading independently of this season Passport.';
        return `<div class="maxis-passport-lane maxis-governance-career maxis-l1-governance-career is-unavailable"><div class="maxis-passport-lane-head"><strong><span class="maxis-civic-layer">L1</span> Governance career</strong><span>scoped</span></div><p>${escapeHtml(reason)}</p></div>`;
    }
    const actions = numberValue(record.lifetimeActions) || 0;
    const ballots = numberValue(record.lifetimeBallots) || 0;
    const proposals = numberValue(record.lifetimeProposals) || 0;
    const periods = numberValue(record.actionablePeriodsParticipated) || 0;
    const currentStreak = numberValue(record.currentBallotPeriodStreak) || 0;
    const longestStreak = numberValue(record.longestBallotPeriodStreak) || 0;
    const rank = numberValue(record.activeDelegateGovernanceRank);
    const lastActivity = formatDate(record.lastGovernanceActivityAt);
    return `
        <div class="maxis-passport-lane maxis-governance-career maxis-l1-governance-career">
            <div class="maxis-passport-lane-head"><strong><span class="maxis-civic-layer">L1</span> Governance career</strong><span>all history</span></div>
            <p><strong>${escapeHtml(formatNumber(actions))} applied actions</strong> · ${escapeHtml(formatNumber(ballots))} ballots · ${escapeHtml(formatNumber(proposals))} proposals across ${escapeHtml(formatNumber(periods))} actionable periods.</p>
            <p><strong>Completed ballot-period streak</strong> · ${escapeHtml(formatNumber(currentStreak))} current · ${escapeHtml(formatNumber(longestStreak))} personal best.</p>
            <p>${rank ? `<strong>#${escapeHtml(formatNumber(rank))} among active delegates</strong>` : 'Not currently ranked among active delegates'}${lastActivity ? ` · last action ${escapeHtml(lastActivity)}` : ''}.</p>
        </div>
    `;
}

function l2GovernanceCareerRecord(address) {
    const artifact = chamberState.l2Governance;
    const target = String(address || '');
    if (!artifact || !target) return null;
    const direct = artifact.records?.[target];
    if (direct) return direct;
    const matchedKey = Object.keys(artifact.records || {}).find((key) => key.toLowerCase() === target.toLowerCase());
    if (matchedKey) return artifact.records[matchedKey];
    if (artifact.coverage?.absenceMeansZero === true) {
        return {
            address: target,
            clock: 'career',
            windows: 0,
            proposalWindows: 0,
            promotionWindows: 0,
            receipts: 0,
            tracks: 0,
            activeDelegate: false,
            canonicalRank: null,
            lastActivityAt: null
        };
    }
    return null;
}

function l2GovernanceTrackCount(record) {
    if (Array.isArray(record?.tracks)) return record.tracks.length;
    const direct = numberValue(record?.tracks, record?.trackCount, record?.tracksParticipated);
    if (direct !== null) return direct;
    return Object.values(record?.trackBreakdown || record?.trackActivity || {}).filter((track) => {
        if (!track || typeof track !== 'object') return false;
        return (numberValue(track.windows, track.actionableWindows, track.receipts) || 0) > 0;
    }).length;
}

function renderL2GovernanceCareer(address) {
    const record = l2GovernanceCareerRecord(address);
    if (!record) {
        const reason = chamberState.l2GovernanceError
            ? `L2 governance career is scoped unavailable: ${chamberState.l2GovernanceError}`
            : 'L2 governance career is loading independently of L1 and this season Passport.';
        return `<div class="maxis-passport-lane maxis-l2-governance-career is-unavailable"><div class="maxis-passport-lane-head"><strong><span class="maxis-civic-layer">L2</span> Governance career</strong><span>scoped</span></div><p>${escapeHtml(reason)}</p></div>`;
    }
    const windows = numberValue(record.windows, record.lifetimeWindows, record.actionableWindows, record.participatedWindows, record.score) || 0;
    const proposals = numberValue(record.proposalWindows, record.lifetimeProposalWindows, record.proposals) || 0;
    const promotions = numberValue(record.promotionWindows, record.lifetimePromotionWindows, record.promotionBallots) || 0;
    const receipts = numberValue(record.receipts, record.lifetimeReceiptCount, record.appliedReceipts, record.actions) || 0;
    const tracks = l2GovernanceTrackCount(record);
    const rank = numberValue(record.canonicalRank, record.activeDelegateL2GovernanceRank, record.activeDelegateGovernanceRank, record.activeDelegateRank);
    const lastActivity = formatDate(textValue(record.lastL2GovernanceActivityAt, record.lastActivityAt, record.lastActivity));
    return `
        <div class="maxis-passport-lane maxis-l2-governance-career">
            <div class="maxis-passport-lane-head"><strong><span class="maxis-civic-layer">L2</span> Governance career</strong><span>all history</span></div>
            <p><strong>${escapeHtml(formatNumber(windows))} canonical windows</strong> · ${escapeHtml(formatNumber(proposals))} proposal · ${escapeHtml(formatNumber(promotions))} promotion across ${escapeHtml(formatNumber(tracks))}/3 tracks.</p>
            <p><strong>${escapeHtml(formatNumber(receipts))} applied receipts</strong> attributed to this represented baker; delegated voting-key senders are not separate identities.</p>
            <p>${rank ? `<strong>#${escapeHtml(formatNumber(rank))} among active delegates</strong>` : 'Not currently ranked among active delegates'}${lastActivity ? ` · last action ${escapeHtml(lastActivity)}` : ''}.</p>
        </div>
    `;
}

function renderPassportCard(profile, note) {
    const season = seasonById();
    const scope = seasonScopeLabels(season);
    const lanes = profileLanes(profile);
    const nearMisses = profileNearMisses(profile);
    const streaks = normalizeNamedRecords(profile?.streaks || (profile?.activeWeekStreak ? [{ title: 'Active-week streak', count: profile.activeWeekStreak, detail: `${profile.activeWeekStreak} consecutive completed week${profile.activeWeekStreak === 1 ? '' : 's'} · active in ${asArray(profile.activeWeeks).length} season weeks` }] : []), 'Streak');
    const personalBests = profilePersonalBests(profile);
    const { qualifying, required, percent: unicornPercent } = passportUnicornProgress(profile, lanes);
    const seasonBadges = badgeRecords(profile, { includeFallback: false });
    const careerBadges = careerBadgeRecords(profile?.address);
    const careerBests = careerPersonalBestRecords();
    const unicornScope = scope.phase === 'finalized'
        ? `${qualifying}/${required} final qualifying lanes for Unicorn`
        : scope.phase === 'settling'
            ? `${qualifying}/${required} provisional qualifying lanes for Unicorn`
            : `${qualifying}/${required} qualifying lanes toward Unicorn`;
    const emptyLaneCopy = scope.phase === 'finalized'
        ? 'No ranked lane receipt was recorded in this final archive.'
        : scope.phase === 'settling'
            ? 'No provisional ranked lane receipt is present while source settlement completes.'
            : 'Touch a ranked lane and the next season snapshot will begin the trail.';
    const resolvedDomain = normalizeTezDomainName(chamberState.passportInput);
    return `
        <article class="maxis-passport-card">
            <header class="maxis-passport-identity">
                <span class="maxis-passport-crest">${escapeHtml(textValue(profile?.crest, '✺'))}</span>
                <span class="maxis-passport-name"><span>Maxi Passport · address-bound${resolvedDomain ? ` · ${escapeHtml(resolvedDomain)} resolved` : ''}</span><strong>${escapeHtml(textValue(profile?.alias, profile?.name, shortAddress(profile?.address)))}</strong><code>${escapeHtml(profile?.address)}</code></span>
            </header>
            <section class="maxis-passport-scope maxis-passport-career" aria-labelledby="maxis-passport-career-title">
                <div class="maxis-passport-scope-head"><span>Career</span><strong id="maxis-passport-career-title">Earned identity</strong><small>Verified season shards are aggregated for this address. Repeatable badges keep their original season receipts; ongoing crowns and exact governance history keep their own clocks.</small></div>
                <div class="maxis-side-heading maxis-passport-section-heading"><strong>Career stamps</strong><span>${careerBadges.length} earned</span></div>
                <div class="maxis-passport-badges" aria-label="Career Passport badges">
                    ${careerBadges.length ? careerBadges.map((badge) => `<span class="maxis-passport-badge${badge?.earned === false || badge?.locked ? ' is-locked' : ''}" title="${escapeHtml(textValue(badge?.detail, badge?.description, badge?.seasonLabel))}"><b>${escapeHtml(textValue(badge?.icon, badge?.earned === false ? '○' : '✦'))}</b>${escapeHtml(textValue(badge?.title, badge?.label, 'Badge'))}</span>`).join('') : '<span class="maxis-passport-badge is-locked"><b>◇</b>No verified season stamps yet</span>'}
                </div>
                <div class="maxis-side-heading maxis-passport-section-heading"><strong>Cross-season breadth</strong><span>verified shard receipts</span></div>
                <div class="maxis-passport-lanes maxis-career-records">${renderCareerBreadth()}</div>
                <div class="maxis-side-heading maxis-passport-section-heading"><strong>Career high-water marks</strong><span>best rank per lane</span></div>
                <div class="maxis-passport-lanes maxis-career-records">${renderRecordCards(careerBests, 'No comparable personal best has been recorded across verified season receipts yet.', '◆', 'career')}</div>
                <div class="maxis-side-heading maxis-passport-section-heading"><strong>Ongoing crown appearances</strong><span>lane-native clocks</span></div>
                <div class="maxis-passport-lanes maxis-career-records">${renderOngoingCrownRecords(profile?.address)}</div>
                <div class="maxis-side-heading maxis-passport-section-heading"><strong>Civic record</strong><span>separate L1 + L2 clocks</span></div>
                <div class="maxis-passport-lanes maxis-career-records maxis-civic-records">${renderGovernanceCareer(profile?.address)}${renderL2GovernanceCareer(profile?.address)}</div>
                ${renderLocalPassportRitual(profile?.address)}
            </section>
            <section class="maxis-passport-scope maxis-passport-season" aria-labelledby="maxis-passport-season-title">
                <div class="maxis-passport-scope-head maxis-passport-season-head">
                    <span>${escapeHtml(scope.passportScope)}</span>
                    <strong id="maxis-passport-season-title">${escapeHtml(season?.displayLabel || `${season?.protocol || 'Tezos'} Season`)}</strong>
                    <small>${escapeHtml(scope.phase === 'finalized' ? 'Final ranks, frozen cut lines, streaks, and personal bests belong only to this archived protocol ruleset.' : scope.phase === 'settling' ? 'Provisional ranks and cut lines remain scoped to this closed protocol ruleset until source settlement completes.' : 'Ranks, cut lines, streaks, and personal bests compare only inside this active protocol-bounded ruleset.')}</small>
                    <span class="maxis-passport-unicorn"><strong>${unicornPercent}%</strong><small>${escapeHtml(unicornScope)}</small></span>
                </div>
                <div class="maxis-side-heading maxis-passport-section-heading"><strong>${escapeHtml(scope.passportScope)} stamps</strong><span>${seasonBadges.length} earned</span></div>
                <div class="maxis-passport-badges" aria-label="Selected season Passport badges">
                    ${seasonBadges.length ? seasonBadges.map((badge) => `<span class="maxis-passport-badge${badge?.earned === false || badge?.locked ? ' is-locked' : ''}" title="${escapeHtml(textValue(badge?.detail, badge?.description))}"><b>${escapeHtml(textValue(badge?.icon, badge?.earned === false ? '○' : '✦'))}</b>${escapeHtml(textValue(badge?.title, badge?.label, 'Badge'))}</span>`).join('') : '<span class="maxis-passport-badge is-locked"><b>◇</b>No season stamps yet</span>'}
                </div>
                <div class="maxis-side-heading maxis-passport-section-heading"><strong>${escapeHtml(scope.passportLaneHeading)}</strong><span>${lanes.length} touched</span></div>
                <div class="maxis-passport-lanes">${lanes.length ? lanes.map(renderPassportLane).join('') : renderRecordCards([], emptyLaneCopy, '◇')}</div>
                <div class="maxis-side-heading maxis-passport-section-heading"><strong>Near misses</strong><span>${escapeHtml(scope.passportCutLines)}</span></div>
                <div class="maxis-passport-lanes">${renderRecordCards(nearMisses, 'No trustworthy near-miss is present in the loaded depth yet.', '↟')}</div>
                <div class="maxis-side-heading maxis-passport-section-heading"><strong>Streaks</strong><span>season ritual</span></div>
                <div class="maxis-passport-lanes">${renderRecordCards(streaks, 'A streak begins after activity is observed across declared checkpoints.', '⌁')}</div>
                <div class="maxis-side-heading maxis-passport-section-heading"><strong>Selected-season bests</strong><span>this ruleset</span></div>
                <div class="maxis-passport-lanes">${renderRecordCards(personalBests, 'Personal bests appear after at least two comparable snapshots.', '◆')}</div>
            </section>
            ${note ? `<div class="maxis-cutline-card" style="margin: 0 0.85rem 0.85rem"><strong>Coverage note</strong>${escapeHtml(note)}</div>` : ''}
        </article>
    `;
}

function renderPassportPanel() {
    const saved = safeLocalStorageGet(MY_TEZOS_ADDRESS_KEY);
    const scope = seasonScopeLabels();
    const contextError = seasonContextError();
    return `
        ${renderRoomIntro(`Career + ${scope.passportScope.toLowerCase()}`, 'One address, two timelines', `Career keeps earned identity stamps. ${scope.passportScope} keeps the selected protocol’s ranks, gaps, streaks, and Unicorn breadth. Neither silently links wallets or changes the address saved in My Tezos.`)}
        <section class="maxis-passport-shell">
            <form class="maxis-passport-search" data-maxis-passport-form>
                <input class="maxis-passport-input" name="address" aria-label="Tezos address or .tez name for Maxi Passport" autocomplete="off" spellcheck="false" placeholder="tz1… tz4… or name.tez" value="${escapeHtml(chamberState.passportInput || chamberState.passportAddress)}">
                <button class="maxis-passport-submit" type="submit">Open Passport</button>
                <button class="maxis-passport-use-saved" type="button" data-maxis-use-saved ${saved ? '' : 'disabled'}>Use My Tezos</button>
            </form>
            <div aria-live="polite">
                ${chamberState.passportLoading ? (chamberState.passportLoadingStage === 'domain'
                    ? '<div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">.tez</span><strong>Resolving the Tezos Domain…</strong><p>Finding the account this name currently points to before reading any address-bound Passport shards.</p></div></div>'
                    : '<div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">✺</span><strong>Stamping the Passport…</strong><p>Reading only the deterministic shard for this address, then checking the loaded season ranks.</p></div></div>') : ''}
                ${!chamberState.passportLoading && chamberState.passportError ? `<div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">!</span><strong>Passport not opened</strong><p>${escapeHtml(chamberState.passportError)}</p>${chamberState.passportRetryable ? '<button class="maxis-passport-submit" type="button" data-maxis-passport-retry>Retry Passport</button>' : ''}</div></div>` : ''}
                ${!chamberState.passportLoading && !chamberState.passportError && chamberState.passportProfile ? renderPassportCard(chamberState.passportProfile, chamberState.passportNote) : ''}
                ${!chamberState.passportLoading && !chamberState.passportError && !chamberState.passportProfile ? (contextError
                    ? `<div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">!</span><strong>The selected season Passport is unavailable</strong><p>${escapeHtml(contextError)} The canonical Maxis and available Champions records remain usable.</p><button class="maxis-passport-submit" type="button" data-maxis-season-retry>Retry season sheet</button></div></div>`
                    : '<div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">✺</span><strong>Bring one wallet into focus</strong><p>Enter an address or .tez name above, or read the current My Tezos address. None of these actions mutate saved wallet state.</p></div></div>') : ''}
            </div>
        </section>
    `;
}

function archiveLaneCatalog(source) {
    const catalog = new Map();
    const rows = Array.isArray(source)
        ? source.map((lane) => [textValue(lane?.category, lane?.lane, lane?.id), lane])
        : (source && typeof source === 'object' ? Object.entries(source) : []);
    rows.forEach(([category, lane], index) => {
        const rawCategory = textValue(lane?.category, lane?.lane, lane?.id, category);
        if (!rawCategory) return;
        const metadata = {
            title: textValue(lane?.title, lane?.laneTitle, lane?.label),
            order: numberValue(lane?.order, lane?.laneOrder, index)
        };
        catalog.set(rawCategory, metadata);
        catalog.set(canonicalCategory(rawCategory), metadata);
    });
    return catalog;
}

function normalizeChampionRows(source, frozenLaneCatalog = []) {
    const pending = [];
    if (Array.isArray(source)) {
        source.forEach((champion) => {
            if (champion && typeof champion === 'object') pending.push({ champion, category: champion?.category || champion?.lane });
        });
    } else if (source && typeof source === 'object') {
        Object.entries(source).forEach(([category, champion]) => {
            if (Array.isArray(champion)) champion.forEach((entry) => pending.push({ champion: entry, category }));
            else if (champion && typeof champion === 'object') pending.push({ champion, category });
        });
    }
    const catalog = archiveLaneCatalog(frozenLaneCatalog);
    return pending.map(({ champion, category }) => {
        const rawCategory = textValue(champion?.category, champion?.lane, category);
        const metadata = catalog.get(rawCategory) || catalog.get(canonicalCategory(rawCategory)) || {};
        return {
            ...champion,
            category: canonicalCategory(rawCategory),
            frozenLaneTitle: textValue(champion?.title, champion?.laneTitle, champion?.frozenLaneTitle, metadata?.title),
            frozenLaneOrder: numberValue(champion?.laneOrder, champion?.frozenLaneOrder, champion?.order, metadata?.order)
        };
    });
}

function archivedChampionLaneTitle(champion) {
    return textValue(champion?.frozenLaneTitle, champion?.title, champion?.laneTitle, categoryLabel(champion?.category || champion?.lane));
}

function normalizeArchiveHonors(source) {
    const honors = Array.isArray(source)
        ? source
        : (source && typeof source === 'object'
            ? Object.entries(source).map(([title, honor]) => ({
                ...(honor && typeof honor === 'object' ? honor : { detail: honor }),
                title: textValue(honor?.title, title.replace(/([a-z])([A-Z])/g, '$1 $2'))
            }))
            : []);
    return honors.flatMap((honor) => {
        if (String(honor?.status || '').toLowerCase() !== 'ready') return [];
        const recipients = honor?.winner ? [honor.winner] : asArray(honor?.winners || honor?.leader);
        return recipients
            .filter((recipient) => recipient?.address)
            .map((recipient) => ({ honor, recipient }));
    });
}

function renderChampionRecord(champion) {
    const address = textValue(champion?.address);
    const encodedAddress = encodeURIComponent(address);
    return `
        <div class="maxis-champion-record">
            <div class="maxis-champion-row">
                <span>${escapeHtml(archivedChampionLaneTitle(champion))}</span>
                <span class="maxis-champion-identity">
                    <strong title="${escapeHtml(address)}">${escapeHtml(leaderName(champion))}</strong>
                    <code title="${escapeHtml(address)}">${escapeHtml(shortAddress(address))}</code>
                    <small>${escapeHtml(scoreLabel(champion))}</small>
                </span>
            </div>
            <div class="maxis-row-actions maxis-champion-actions" role="group" aria-label="Final champion trails for ${escapeHtml(leaderName(champion))}">
                <a class="maxis-rank-action maxis-ledger-action" href="/#ledger-flow=${encodedAddress}">Ledger Flow</a>
                ${champion?.sourceUrl ? `<a class="maxis-rank-action maxis-source-action" href="${escapeHtml(champion.sourceUrl)}" target="_blank" rel="noopener">Source ↗</a>` : ''}
            </div>
        </div>
    `;
}

function archiveReceiptUrls(archive, season, rawSeason) {
    return {
        summary: resolveDataUrl(textValue(
            archive?.summaryUrl,
            archive?.archiveUrl,
            season?.summaryUrl,
            rawSeason?.archiveUrl,
            rawSeason?.summaryPath
        )),
        rules: resolveDataUrl(textValue(
            archive?.rulesUrl,
            archive?.rulesPath,
            rawSeason?.rulesUrl,
            rawSeason?.rulesPath
        ))
    };
}

function archivesFromCurrentState() {
    const manifest = chamberState.manifest || {};
    const inline = manifest.archives || manifest.champions || manifest.hallOfChampions;
    let archives = [];
    if (Array.isArray(inline)) archives = inline;
    else if (inline && typeof inline === 'object') archives = Object.entries(inline).map(([id, archive]) => ({ id, ...(archive || {}) }));
    if (Array.isArray(chamberState.archives)) archives.push(...chamberState.archives);
    const unique = new Map();
    archives.forEach((archive, index) => {
        const id = seasonIdFrom(archive?.season || archive, `archive-${index}`);
        unique.set(id, { ...unique.get(id), ...archive, id });
    });
    return [...unique.values()];
}

async function ensureArchivesLoaded({ force = false } = {}) {
    if (force) {
        archiveRequestSerial += 1;
        chamberState.archives = null;
        chamberState.archivesLoading = false;
        chamberState.archivesError = '';
    }
    if (force && !chamberState.manifest) {
        chamberState.archivesLoading = true;
        renderExperience({ preserveScroll: true });
        const manifest = await loadManifest({ force: true });
        chamberState.archivesLoading = false;
        if (!manifest) {
            chamberState.archives = [];
            chamberState.archivesError = textValue(chamberState.manifestError, 'The Maxis season manifest is temporarily unavailable.');
            renderExperience({ preserveScroll: true, focusSelector: '[data-maxis-archives-retry]' });
            return;
        }
    }
    if (chamberState.archivesLoading || chamberState.archives) return;
    const serial = ++archiveRequestSerial;
    const completed = normalizedSeasons(chamberState.manifest, chamberState.summary).filter((season) => !season.isCurrent && ['final', 'finalized', 'complete', 'archived'].includes(season.status));
    if (!completed.length) {
        chamberState.archives = [];
        chamberState.archivesError = !chamberState.manifest && chamberState.manifestError
            ? chamberState.manifestError
            : '';
        renderExperience({ preserveScroll: true });
        return;
    }
    chamberState.archivesLoading = true;
    chamberState.archivesError = '';
    renderExperience({ preserveScroll: true });
    const rows = await Promise.all(completed.map(async (season) => {
        let summary;
        try {
            summary = await loadSeasonSummary(season.id, { force });
        } catch (error) {
            console.warn('Maxis archive identity receipt rejected', season.id, error);
            return {
                archive: null,
                error: `${season.displayLabel || season.protocol || season.id}: ${textValue(error?.message, 'final archive unavailable')}`
            };
        }
        if (!summary) {
            return {
                archive: null,
                error: `${season.displayLabel || season.protocol || season.id}: no verified final summary answered`
            };
        }
        const laneCatalog = summary.laneCatalog || summary.frozenLaneCatalog || summary?.rules?.laneCatalog;
        return {
            archive: {
                id: season.id,
                season,
                champions: summary.champions || summary.finalChampions || summary.winners || summary.leaders,
                ...(laneCatalog ? { laneCatalog } : {}),
                honors: summary.honors || summary.seasonHonors || null,
                finalizedAt: summary.finalizedAt || summary?.season?.finalizedAt || summary.generatedAt,
                summaryUrl: summaryUrlFor(chamberState.manifest, season),
                rulesUrl: resolveDataUrl(textValue(summary?.rules?.rulesPath, season?.rulesPath))
            },
            error: ''
        };
    }));
    if (serial !== archiveRequestSerial) return;
    chamberState.archives = rows.map((row) => row.archive).filter(Boolean);
    chamberState.archivesError = rows.map((row) => row.error).filter(Boolean).join(' · ');
    chamberState.archivesLoading = false;
    renderExperience({ preserveScroll: true });
}

function renderChampionsPanel() {
    const archives = archivesFromCurrentState();
    if (chamberState.archivesLoading) return `<div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">◇</span><strong>Opening the permanent record…</strong><p>Reading finalized season sheets only.</p></div></div>`;
    const archiveError = textValue(chamberState.archivesError, !chamberState.manifest ? chamberState.manifestError : '');
    if (!archives.length) {
        if (archiveError) {
            return `
                ${renderRoomIntro('Permanent protocol record', 'Final archives are scoped unavailable', 'The canonical Maxis room and current verified Season remain independent of this archive-loading failure.')}
                <div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">!</span><strong>The final archive receipts did not load</strong><p>${escapeHtml(archiveError)}</p><button class="maxis-passport-submit" type="button" data-maxis-archives-retry>Retry final archives</button></div></div>
            `;
        }
        return `
            ${renderRoomIntro('Permanent protocol record', 'Champions outlive the season', 'Boards close at activation and become permanent only after the declared source-settlement rebuild. The current arena must finish before its first archive can exist.')}
            <div class="maxis-empty-stage"><div><span class="maxis-empty-stage-mark">◇</span><strong>The first Maxis season is still live</strong><p>Maxis seasons begin with Ushuaia. No champion is invented early; this hall opens when a Maxis season has a final boundary and an immutable result sheet.</p></div></div>
        `;
    }
    return `
        ${renderRoomIntro('Immutable archives', 'Champions', 'Every card is a finalized protocol season. Later scoring-rule changes belong to later seasons; they do not rewrite old winners.')}
        ${archiveError ? `<div class="maxis-cutline-card" role="status"><strong>Some final archives are scoped unavailable</strong>${escapeHtml(archiveError)}<button class="maxis-passport-submit" type="button" data-maxis-archives-retry>Retry final archives</button></div>` : ''}
        <section class="maxis-champions-shell">
            <div class="maxis-champions-grid">
                ${archives.map((archive) => {
                    const rawSeason = archive.season || archive;
                    const season = normalizeSeason(rawSeason, 0, chamberState.manifest);
                    const receiptUrls = archiveReceiptUrls(archive, season, rawSeason);
                    const allRows = normalizeChampionRows(archive.champions || archive.winners || archive.leaders, archive.laneCatalog || archive.frozenLaneCatalog);
                    const order = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));
                    const rows = allRows
                        .filter((champion) => champion?.address && !['empty', 'unavailable', 'withheld'].includes(String(champion?.status || '').toLowerCase()))
                        .sort((left, right) => {
                            const leftFrozen = numberValue(left?.frozenLaneOrder, left?.laneOrder);
                            const rightFrozen = numberValue(right?.frozenLaneOrder, right?.laneOrder);
                            if (leftFrozen !== null || rightFrozen !== null) return (leftFrozen ?? Number.MAX_SAFE_INTEGER) - (rightFrozen ?? Number.MAX_SAFE_INTEGER);
                            return (order.get(canonicalCategory(left?.category || left?.lane)) ?? 99) - (order.get(canonicalCategory(right?.category || right?.lane)) ?? 99);
                        });
                    const unawardedCount = allRows.length - rows.length;
                    const finalHonors = normalizeArchiveHonors(archive.honors || archive.seasonHonors);
                    return `
                        <article class="maxis-champion-card">
                            <header class="maxis-champion-banner"><span>Season ${escapeHtml(seasonNumberLabel(season))} · final</span><strong>${escapeHtml(season.protocol)}</strong></header>
                            ${receiptUrls.summary || receiptUrls.rules ? `<div class="maxis-row-actions maxis-archive-actions" role="group" aria-label="${escapeHtml(season.protocol)} final receipts">${receiptUrls.summary ? `<a class="maxis-rank-action maxis-archive-summary-action" href="${escapeHtml(receiptUrls.summary)}" target="_blank" rel="noopener">Final receipt ↗</a>` : ''}${receiptUrls.rules ? `<a class="maxis-rank-action maxis-archive-rules-action" href="${escapeHtml(receiptUrls.rules)}" target="_blank" rel="noopener">Frozen rules ↗</a>` : ''}</div>` : ''}
                            <div class="maxis-champion-list">
                                ${rows.map(renderChampionRecord).join('') || '<div class="maxis-champion-row"><span>Final sheet</span><strong>No qualifying crowns</strong></div>'}
                                ${unawardedCount ? `<div class="maxis-champion-row"><span>Unawarded lanes</span><strong>${escapeHtml(String(unawardedCount))} · see final receipts</strong></div>` : ''}
                                ${finalHonors.length ? `<div class="maxis-side-heading"><strong>Season Honors</strong><span>final</span></div>${finalHonors.map(({ honor, recipient }) => `<div class="maxis-champion-row"><span>✦ ${escapeHtml(textValue(honor?.title, honor?.label, 'Season honor').replace(/\b\w/g, (letter) => letter.toUpperCase()))}</span><strong title="${escapeHtml(textValue(recipient?.address))}">${escapeHtml(leaderName(recipient))}${numberValue(recipient?.rank) ? ` · #${escapeHtml(String(recipient.rank))}` : ''}</strong></div>`).join('')}` : ''}
                            </div>
                        </article>
                    `;
                }).join('')}
            </div>
        </section>
    `;
}

function renderMethodology() {
    const summary = viewUsesSeasonContext() ? chamberState.summary : null;
    const legacy = chamberState.legacy;
    const coverage = summary?.coverage || legacy?.coverage || {};
    const caveat = textValue(coverage?.caveat, coverage?.note, 'Coverage follows the declared source catalog and the published season rules. Missing data is left missing, not estimated into a crown.');
    const receipts = Object.entries(summary?.sourceReceipts || {}).filter(([key]) => key !== 'activation').slice(0, 9);
    const sources = asArray(summary?.sources);
    const activationUrl = summary?.sourceReceipts?.activation?.tzktBlock?.sourceUrl;
    const rules = summary?.rules || {};
    const rulesUrl = resolveDataUrl(rules?.rulesPath);
    const ruleHashes = [
        ['evaluator', rules?.evaluatorImplementationHash],
        ['rules', rules?.rulesHash],
        ['coverage', rules?.semanticContractCoverageHash || rules?.contractCoverageHash]
    ].filter(([, hash]) => hash);
    return `
        <details class="maxis-methodology">
            <summary>Rules, coverage, and identity</summary>
            <div class="maxis-methodology-body">
                <p>Maxis identities keep their lane-specific live, rolling, all-time, all-time-active, or cross-lane clocks. Protocol Season ranks use activation-bounded score sheets. A Passport follows one explicit address; wallets are never silently merged.</p>
                <p>Ongoing L1 and L2 Governance are separate all-time-active civic records. L2 scores distinct canonical Tezos X governance windows attributed to represented bakers; raw calls and vote weight do not change rank. L2 is not retrofitted into frozen protocol Seasons or Champions.</p>
                <p>Pass gaps publish two different receipts: the primary-metric guarantee is actionable and strictly clears the frozen target; a conservative static-vector path compares only the frozen score vectors and is never a live minimum because other wallets can move.</p>
                <p>${escapeHtml(caveat)}</p>
                ${receipts.length ? `<div class="maxis-methodology-facts">${receipts.map(([key, receipt]) => {
                    const count = numberValue(receipt?.rows, receipt?.operations, receipt?.reportedRows, receipt?.ballots, receipt?.originations);
                    const status = receipt?.complete === true ? 'complete' : textValue(receipt?.availability, 'partial');
                    return `<span><strong>${escapeHtml(status)}</strong>${escapeHtml(key.replace(/([a-z])([A-Z])/g, '$1 $2'))}${count !== null ? ` · ${escapeHtml(formatNumber(count))}` : ''}</span>`;
                }).join('')}</div>` : ''}
                ${ruleHashes.length ? `<div class="maxis-methodology-facts">${ruleHashes.map(([label, hash]) => `<span title="${escapeHtml(hash)}"><strong>${escapeHtml(String(hash).slice(0, 10))}…</strong>${escapeHtml(label)} hash</span>`).join('')}</div>` : ''}
                ${sources.length || activationUrl || rulesUrl ? `<p>${sources.map((source) => source?.url ? `<a class="maxis-rank-action" href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(textValue(source.name, 'Source'))} ↗</a>` : '').join(' ')} ${activationUrl ? `<a class="maxis-rank-action" href="${escapeHtml(activationUrl)}" target="_blank" rel="noopener">Activation block ↗</a>` : ''} ${rulesUrl ? `<a class="maxis-rank-action" href="${escapeHtml(rulesUrl)}" target="_blank" rel="noopener">Frozen season rules ↗</a>` : ''}</p>` : ''}
                <p class="maxis-methodology-note">Crowns are objective activity metrics, not endorsements. Season honors reward trajectory and breadth without changing the crown score.</p>
            </div>
        </details>
    `;
}

function renderCurrentRoom() {
    if (chamberState.view === 'passport') return renderPassportPanel();
    if (chamberState.view === 'maxis') return renderMaxisPanel();
    if (chamberState.view === 'champions') return renderChampionsPanel();
    return renderSeasonPanel();
}

function renderChamberExperience() {
    const selectedView = chamberState.view;
    const seasonContext = viewUsesSeasonContext();
    const selectedSeasonPhase = seasonPhase();
    const contextError = seasonContextError();
    const state = freshness(selectedView === 'maxis' ? chamberState.legacy : chamberState.summary);
    const footerDataLabel = selectedView === 'maxis'
        ? (state.stale ? 'previous valid ongoing snapshot' : 'ongoing snapshot')
        : selectedView === 'champions'
            ? 'finalized season sheets'
            : selectedView === 'passport'
                ? (contextError ? 'career records + selected season unavailable' : `career stamps + ${selectedSeasonPhase === 'finalized' ? 'selected archive' : selectedSeasonPhase === 'settling' ? 'settling season' : 'selected season'}`)
                : (contextError ? 'selected protocol-season data unavailable' : state.stale ? 'previous valid season data' : selectedSeasonPhase === 'finalized' ? 'finalized protocol-season data' : selectedSeasonPhase === 'settling' ? 'provisional protocol-season data' : 'protocol-season data');
    return `
        <div class="maxis-experience${seasonContext ? ' has-season-context' : ''}" data-maxis-current-view="${selectedView}" data-maxis-season-phase="${escapeHtml(selectedSeasonPhase)}">
            ${seasonContext ? renderSeasonSelector() : ''}
            ${renderContextHero()}
            ${renderRoomTabs()}
            <section class="maxis-room-panel" id="maxis-panel-${selectedView}" role="tabpanel" aria-labelledby="maxis-tab-${selectedView}" tabindex="-1">
                ${renderCurrentRoom()}
            </section>
            ${renderMethodology()}
            <footer class="chamber-footer maxis-footer">
                <span>Sources: TzKT + OBJKT · ${escapeHtml(footerDataLabel)}</span>
                <span class="chamber-footer-sep">·</span>
                <span>Protocol boundaries stay explicit</span>
                <span class="chamber-footer-sep">·</span>
                <a class="panel-direct-link" href="/maxis/">Direct: /maxis/</a>
                <span class="maxis-idea-credit"><span aria-hidden="true">✦</span> Chamber idea by <strong>opeculiar</strong></span>
            </footer>
        </div>
    `;
}

function setSelectorOpen(open, { focus = false } = {}) {
    chamberState.selectorOpen = Boolean(open);
    const tray = document.querySelector('#maxis-modal .maxis-season-tray');
    const orb = tray?.querySelector('.maxis-season-orb');
    tray?.classList.toggle('is-open', chamberState.selectorOpen);
    orb?.setAttribute('aria-expanded', chamberState.selectorOpen ? 'true' : 'false');
    if (focus && orb) {
        chamberState.selectorFocusReturn = true;
        orb.focus({ preventScroll: true });
        queueMicrotask(() => { chamberState.selectorFocusReturn = false; });
    }
}

function closeOtherRowMenus() {
    chamberState.rowDetail = null;
}

function renderExperience({ preserveScroll = false, focusSelector = '' } = {}) {
    const overlay = document.getElementById('maxis-modal');
    const body = overlay?.querySelector('.maxis-body');
    const content = overlay?.querySelector('.maxis-content');
    if (!overlay?.classList.contains('active') || !body) return;
    const scrollTop = preserveScroll ? content?.scrollTop || 0 : 0;
    body.innerHTML = renderChamberExperience();
    wireExperience(body);
    content?.scrollTo({ top: scrollTop, behavior: 'auto' });
    if (focusSelector) requestAnimationFrame(() => body.querySelector(focusSelector)?.focus({ preventScroll: true }));
}

function revealMaxisDetail(body) {
    requestAnimationFrame(() => {
        const target = body.querySelector('#maxis-maxis-detail');
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({
            block: 'start',
            behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
    });
}

function revealRowActions(body, key) {
    requestAnimationFrame(() => {
        const toggle = body.querySelector(`[data-maxis-row-menu="${CSS.escape(key)}"]`);
        const controls = toggle?.getAttribute('aria-controls');
        if (!controls) return;
        body.querySelector(`#${CSS.escape(controls)}`)?.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'auto'
        });
    });
}

async function selectSeason(seasonId) {
    if (!seasonId || seasonId === chamberState.seasonId) {
        setSelectorOpen(false, { focus: true });
        return;
    }
    requestSerial += 1;
    const serial = ++summaryRequestSerial;
    chamberState.seasonId = seasonId;
    chamberState.summary = null;
    chamberState.summaryLoading = true;
    chamberState.summaryError = '';
    chamberState.passportProfile = null;
    chamberState.passportCareer = null;
    chamberState.passportLoading = false;
    chamberState.passportLoadingStage = '';
    chamberState.passportError = '';
    chamberState.passportNote = '';
    chamberState.passportRetryable = false;
    closeOtherRowMenus();
    setSelectorOpen(false);
    syncRouteState();
    renderExperience({ preserveScroll: false, focusSelector: '.maxis-season-orb' });
    const careerTask = loadCareerData();
    let summary;
    try {
        summary = await loadSeasonSummary(seasonId);
    } catch (error) {
        if (serial !== summaryRequestSerial || chamberState.seasonId !== seasonId) return;
        chamberState.summaryLoading = false;
        chamberState.summaryError = textValue(error?.message, 'The selected season summary could not be verified.');
        await careerTask;
        if (serial !== summaryRequestSerial || chamberState.seasonId !== seasonId) return;
        renderExperience({ preserveScroll: false, focusSelector: '.maxis-season-orb' });
        if (seasonId === currentSeasonId(chamberState.manifest)) {
            chamberState.entrySummaryLoading = false;
            chamberState.entrySummaryError = chamberState.summaryError;
            updateEntryCard(chamberState.legacy, chamberState.manifest, null);
        }
        return;
    }
    if (serial !== summaryRequestSerial || chamberState.seasonId !== seasonId) return;
    await careerTask;
    if (serial !== summaryRequestSerial || chamberState.seasonId !== seasonId) return;
    chamberState.summary = summary;
    chamberState.summaryLoading = false;
    chamberState.summaryError = '';
    ensureValidLane(chamberState.view === 'maxis' ? chamberState.legacy || {} : chamberState.summary || {});
    renderExperience({ preserveScroll: false, focusSelector: '.maxis-season-orb' });
    const entrySeasonId = currentSeasonId(chamberState.manifest);
    chamberState.entrySummaryLoading = false;
    if (seasonId === entrySeasonId) chamberState.entrySummaryError = '';
    updateEntryCard(
        chamberState.legacy,
        chamberState.manifest,
        seasonId === entrySeasonId ? chamberState.summary : (summaryCache.get(entrySeasonId) || null)
    );
    const passportTarget = chamberState.passportAddress || chamberState.passportInput;
    if (chamberState.view === 'passport' && passportTarget) {
        await openPassport(passportTarget, {
            usesSaved: chamberState.passportUsesSaved,
            inputLabel: chamberState.passportInput
        });
    }
}

async function retrySeasonContext() {
    requestSerial += 1;
    const serial = ++summaryRequestSerial;
    chamberState.summaryLoading = true;
    chamberState.summaryError = '';
    if (!chamberState.manifest) chamberState.manifestError = '';
    renderExperience({ preserveScroll: true });

    let manifest = chamberState.manifest;
    if (!manifest) manifest = await loadManifest({ force: true });
    if (serial !== summaryRequestSerial) return;
    chamberState.manifest = manifest;
    if (!manifest) {
        chamberState.summary = null;
        chamberState.summaryLoading = false;
        chamberState.summaryError = textValue(chamberState.manifestError, 'The Maxis season manifest is temporarily unavailable.');
        chamberState.entrySummaryLoading = false;
        chamberState.entrySummaryError = chamberState.summaryError;
        renderExperience({ preserveScroll: true, focusSelector: '[data-maxis-season-retry]' });
        updateEntryCard(chamberState.legacy, null, null);
        return;
    }

    const seasons = normalizedSeasons(manifest);
    if (!seasons.some((season) => season.id === chamberState.seasonId)) {
        chamberState.seasonId = textValue(currentSeasonId(manifest), seasons[0]?.id);
    }
    const seasonId = chamberState.seasonId;
    try {
        const summary = await loadSeasonSummary(seasonId, { force: true });
        if (serial !== summaryRequestSerial || chamberState.seasonId !== seasonId) return;
        chamberState.summary = summary;
        chamberState.summaryError = '';
    } catch (error) {
        if (serial !== summaryRequestSerial || chamberState.seasonId !== seasonId) return;
        chamberState.summary = null;
        chamberState.summaryError = textValue(error?.message, 'The selected season summary could not be verified.');
    }
    chamberState.summaryLoading = false;
    ensureValidLane(chamberState.summary || {});
    syncRouteState();
    renderExperience({ preserveScroll: true, focusSelector: chamberState.summary ? '.maxis-room-panel' : '[data-maxis-season-retry]' });

    const entrySeasonId = currentSeasonId(manifest);
    const entrySummary = seasonId === entrySeasonId ? chamberState.summary : (summaryCache.get(entrySeasonId) || null);
    chamberState.entrySummaryLoading = false;
    chamberState.entrySummaryError = seasonId === entrySeasonId ? chamberState.summaryError : '';
    updateEntryCard(chamberState.legacy, manifest, entrySummary);
    const passportTarget = chamberState.passportAddress || chamberState.passportInput;
    if (chamberState.view === 'passport' && chamberState.summary && passportTarget) {
        await openPassport(passportTarget, {
            usesSaved: chamberState.passportUsesSaved,
            inputLabel: chamberState.passportInput
        });
    }
}

async function selectView(view, { focus = true } = {}) {
    const nextView = canonicalView(view);
    if (!nextView) return;
    const previousLaneRoom = laneRoomForView();
    if (chamberState.lane) chamberState.laneByView[previousLaneRoom] = chamberState.lane;
    chamberState.view = nextView;
    const nextLaneRoom = laneRoomForView(nextView);
    chamberState.lane = chamberState.laneByView[nextLaneRoom] || chamberState.lane;
    if (!viewUsesSeasonContext(nextView)) setSelectorOpen(false);
    closeOtherRowMenus();
    if (nextView === 'season') ensureValidLane(chamberState.summary || {});
    if (nextView === 'maxis') ensureValidLane(chamberState.legacy || {});
    syncRouteState();
    renderExperience({ preserveScroll: false, focusSelector: focus ? `[data-maxis-view="${nextView}"]` : '' });
    if (nextView === 'passport' && !chamberState.passportProfile) {
        const target = chamberState.passportAddress || chamberState.passportInput || safeLocalStorageGet(MY_TEZOS_ADDRESS_KEY);
        if (target) {
            await openPassport(target, {
                usesSaved: !chamberState.passportAddress && !chamberState.passportInput,
                inputLabel: chamberState.passportInput
            });
        }
    }
    if (nextView === 'champions') ensureArchivesLoaded();
}

async function openPassport(rawAddress, { usesSaved = false, inputLabel = '' } = {}) {
    const serial = ++requestSerial;
    const target = String(rawAddress || '').trim();
    const domain = normalizeTezDomainName(target);
    const displayInput = String(inputLabel || domain || target).trim();
    chamberState.passportInput = isTezDomainName(displayInput) ? displayInput.toLowerCase() : displayInput;
    chamberState.passportAddress = '';
    chamberState.passportUsesSaved = usesSaved;
    chamberState.passportProfile = null;
    chamberState.passportCareer = null;
    chamberState.passportNote = '';
    chamberState.passportError = '';
    chamberState.passportRetryable = false;
    chamberState.passportLoadingStage = domain ? 'domain' : 'passport';
    syncRouteState();

    let resolvedAddress = target;
    if (domain) {
        chamberState.passportLoading = true;
        renderExperience({ preserveScroll: true });
        try {
            resolvedAddress = await resolveTezDomainAddress(domain);
        } catch (error) {
            if (serial !== requestSerial) return;
            chamberState.passportLoading = false;
            chamberState.passportLoadingStage = '';
            chamberState.passportRetryable = true;
            chamberState.passportError = `${domain} could not be resolved through Tezos Domains. ${textValue(error?.message, 'Try the lookup again.')}`;
            syncRouteState();
            renderExperience({ preserveScroll: true, focusSelector: '[data-maxis-passport-retry]' });
            return;
        }
        if (serial !== requestSerial) return;
        if (!resolvedAddress) {
            chamberState.passportLoading = false;
            chamberState.passportLoadingStage = '';
            chamberState.passportRetryable = true;
            chamberState.passportError = `${domain} does not currently resolve to a Tezos account.`;
            syncRouteState();
            renderExperience({ preserveScroll: true, focusSelector: '[data-maxis-passport-retry]' });
            return;
        }
    }

    const status = implicitAddressStatus(resolvedAddress);
    chamberState.passportAddress = status.address;
    chamberState.passportError = status.error && domain
        ? `${domain} resolves to ${status.address}, but ${status.error}`
        : status.error;
    syncRouteState();
    if (status.error) {
        chamberState.passportLoading = false;
        chamberState.passportLoadingStage = '';
        renderExperience({ preserveScroll: true, focusSelector: '.maxis-passport-input' });
        return;
    }
    chamberState.passportLoading = true;
    chamberState.passportLoadingStage = 'passport';
    renderExperience({ preserveScroll: true });
    let result;
    let career;
    try {
        [result, career] = await Promise.all([
            loadPassportProfile(status.address),
            loadPassportCareer(status.address),
            loadCareerData(),
            loadL2GovernanceData()
        ]);
    } catch (error) {
        if (serial !== requestSerial) return;
        chamberState.passportLoading = false;
        chamberState.passportLoadingStage = '';
        chamberState.passportError = textValue(error?.message, 'The deterministic Passport shard could not be loaded.');
        chamberState.passportNote = '';
        chamberState.passportRetryable = true;
        renderExperience({ preserveScroll: true, focusSelector: '[data-maxis-passport-retry]' });
        return;
    }
    if (serial !== requestSerial) return;
    chamberState.passportProfile = result.profile;
    chamberState.passportCareer = career;
    chamberState.passportNote = result.note;
    chamberState.passportLoading = false;
    chamberState.passportLoadingStage = '';
    chamberState.passportError = '';
    chamberState.passportRetryable = false;
    renderExperience({ preserveScroll: true, focusSelector: '.maxis-passport-input' });
}

function wireSeasonSelector(body) {
    const tray = body.querySelector('.maxis-season-tray');
    const orb = tray?.querySelector('.maxis-season-orb');
    if (!tray || !orb) return;
    tray.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'touch') setSelectorOpen(true);
    });
    tray.addEventListener('pointerleave', (event) => {
        if (event.pointerType !== 'touch' && !tray.contains(document.activeElement)) setSelectorOpen(false);
    });
    tray.addEventListener('focusin', () => {
        if (!chamberState.selectorFocusReturn) setSelectorOpen(true);
    });
    tray.addEventListener('focusout', () => {
        setTimeout(() => {
            if (!tray.contains(document.activeElement)) setSelectorOpen(false);
        }, 0);
    });
    orb.addEventListener('pointerdown', (event) => {
        chamberState.selectorWasOpenAtPointerDown = chamberState.selectorOpen;
        chamberState.lastSelectorPointerType = event.pointerType;
    });
    orb.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.detail === 0) {
            setSelectorOpen(true);
            return;
        }
        const hoverDevice = window.matchMedia?.('(hover: hover)').matches && chamberState.lastSelectorPointerType !== 'touch';
        setSelectorOpen(hoverDevice ? true : !chamberState.selectorWasOpenAtPointerDown);
    });
    tray.addEventListener('keydown', (event) => {
        const options = [...tray.querySelectorAll('[role="menuitemradio"]')];
        if (!options.length) return;
        if (event.target === orb && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            setSelectorOpen(true);
            const target = event.key === 'ArrowUp' || event.key === 'End'
                ? options[options.length - 1]
                : (options.find((option) => option.getAttribute('aria-checked') === 'true') || options[0]);
            target.focus({ preventScroll: true });
            return;
        }
        const index = options.indexOf(event.target);
        if (index < 0 || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = options.length - 1;
        else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % options.length;
        else next = (index - 1 + options.length) % options.length;
        options[next].focus({ preventScroll: true });
    });
}

// Kept as a compatibility hook for generated shells that may still contain the
// former all-lanes jump rail. The protocol-season rail uses delegated lane state.
function wireCategoryJumps(body) {
    body.querySelector('.maxis-category-nav')?.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-maxis-jump]') : null;
        if (!button?.dataset.maxisJump) return;
        chamberState.lane = canonicalCategory(button.dataset.maxisJump);
        chamberState.laneByView[laneRoomForView()] = chamberState.lane;
        renderExperience({ preserveScroll: true });
    });
}

function wireExperience(body) {
    wireCategoryJumps(body);
    wireSeasonSelector(body);
    if (!body.dataset.maxisClickWired) body.addEventListener('click', (event) => {
        const source = event.target instanceof Element ? event.target : null;
        if (!source) return;
        const seasonButton = source.closest('[data-maxis-season]');
        if (seasonButton) {
            event.preventDefault();
            selectSeason(seasonButton.dataset.maxisSeason);
            return;
        }
        const viewButton = source.closest('.maxis-room-tab[data-maxis-view]');
        if (viewButton) {
            event.preventDefault();
            selectView(viewButton.dataset.maxisView);
            return;
        }
        if (source.closest('[data-maxis-season-retry]')) {
            event.preventDefault();
            retrySeasonContext();
            return;
        }
        if (source.closest('[data-maxis-archives-retry]')) {
            event.preventDefault();
            ensureArchivesLoaded({ force: true });
            return;
        }
        const handoffButton = source.closest('[data-maxis-handoff-lane]');
        if (handoffButton) {
            event.preventDefault();
            const category = canonicalCategory(handoffButton.dataset.maxisHandoffLane);
            chamberState.laneByView.maxis = category;
            selectView('maxis', { focus: false }).then(() => revealMaxisDetail(body));
            return;
        }
        const laneButton = source.closest('[data-maxis-lane]');
        if (laneButton) {
            const opensDetail = laneButton.hasAttribute('data-maxis-overview-lane');
            chamberState.lane = canonicalCategory(laneButton.dataset.maxisLane);
            chamberState.laneByView[laneRoomForView()] = chamberState.lane;
            closeOtherRowMenus();
            syncRouteState();
            renderExperience({ preserveScroll: true, focusSelector: opensDetail ? '' : `[data-maxis-lane="${chamberState.lane}"]` });
            if (opensDetail) revealMaxisDetail(body);
            return;
        }
        const rowButton = source.closest('[data-maxis-row-menu]');
        if (rowButton) {
            const key = rowButton.dataset.maxisRowMenu;
            chamberState.rowDetail = chamberState.rowDetail === key ? null : key;
            renderExperience({ preserveScroll: true, focusSelector: `[data-maxis-row-menu="${CSS.escape(key)}"]` });
            if (chamberState.rowDetail) revealRowActions(body, key);
            return;
        }
        const share = source.closest('[data-maxis-share]');
        if (share) {
            const data = chamberState.view === 'maxis' ? chamberState.legacy : chamberState.summary;
            const category = canonicalCategory(share.dataset.maxisShareLane);
            const entry = normalizedRanking(data || {}, category).find((row) => row.address === share.dataset.maxisShare);
            recordRankShare(entry || { address: share.dataset.maxisShare }, category);
            return;
        }
        if (source.closest('[data-maxis-use-saved]')) {
            event.preventDefault();
            openPassport(safeLocalStorageGet(MY_TEZOS_ADDRESS_KEY), { usesSaved: true });
            return;
        }
        if (source.closest('[data-maxis-passport-retry]')) {
            event.preventDefault();
            shardCache.clear();
            shardRequestCache.clear();
            openPassport(chamberState.passportAddress || chamberState.passportInput, {
                usesSaved: chamberState.passportUsesSaved,
                inputLabel: chamberState.passportInput
            });
        }
    });
    body.dataset.maxisClickWired = '1';
    body.querySelector('[data-maxis-passport-form]')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.address;
        openPassport(input?.value || '', { usesSaved: false });
    });
    body.querySelector('.maxis-room-tabs')?.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
        const index = tabs.indexOf(event.target);
        if (index < 0) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else next = (index - 1 + tabs.length) % tabs.length;
        selectView(tabs[next].dataset.maxisView);
    });
    body.querySelector('.maxis-lane-rail')?.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const chips = [...event.currentTarget.querySelectorAll('[data-maxis-lane]')];
        const index = chips.indexOf(event.target);
        if (index < 0) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = chips.length - 1;
        else if (event.key === 'ArrowRight') next = (index + 1) % chips.length;
        else next = (index - 1 + chips.length) % chips.length;
        chips[next].click();
    });
}

function renderEntryContents(legacy, manifest, summary) {
    const season = normalizedSeasons(manifest, summary)[0];
    const seasonData = summary || null;
    const legacyData = legacy || {};
    const identities = categoriesFor(legacyData);
    const passportRecords = seasonData ? numberValue(seasonData?.passports?.indexedAddresses, seasonData?.coverage?.indexedAddresses) : null;
    const ongoingWallets = uniqueRankedWallets(legacyData);
    const ongoingUnicorn = normalizedRanking(legacyData, 'unicorn')[0];
    const seasonUnicorn = normalizedRanking(seasonData || {}, 'unicorn')[0];
    const seasonLanes = categoriesFor(seasonData || {}).length;
    const hasSeasonIdentity = Boolean(manifest && season?.id && season.id !== 'live');
    const seasonError = textValue(chamberState.entrySummaryError, chamberState.manifestError);
    const seasonPending = chamberState.manifestLoading || chamberState.entrySummaryLoading || (!manifest && !seasonError);
    const pulseState = seasonError
        ? 'unavailable'
        : seasonPending
            ? 'loading'
            : seasonData
                ? (season?.isCurrent ? 'live' : season?.status)
                : 'not published';
    const pulseTitle = seasonError
        ? (hasSeasonIdentity ? season?.displayLabel || `${season?.protocol || 'Tezos'} Season` : 'Season sheet unavailable')
        : hasSeasonIdentity
            ? season?.displayLabel || `${season?.protocol || 'Tezos'} Season`
            : 'Loading the Maxis season index';
    const boundaryCopy = seasonError && !hasSeasonIdentity
        ? 'Unavailable'
        : hasSeasonIdentity
            ? seasonEndCopy(season, { compact: true })
            : 'Loading…';
    const unicornCopy = seasonError
        ? 'Not shown'
        : seasonPending
            ? 'Loading…'
            : seasonData
                ? leaderName(seasonUnicorn)
                : 'Not published';
    const sheetCopy = seasonError
        ? 'Season pulse unavailable'
        : seasonPending
            ? 'Loading Passports · lanes'
            : seasonData
                ? `${formatNumber(passportRecords ?? 0)} Passports · ${formatNumber(seasonLanes)} lanes`
                : 'Season sheet not published';
    const seasonCrownCards = [
        'staking',
        'collector',
        'artist',
        'transaction',
        'defi',
        'gaming',
        'minter',
        'delegation',
        'liquidity',
        'bridge',
        'builder',
        'governance'
    ].map((category) => ({ category, leader: leaderForCategory(seasonData || {}, category) }))
        .filter(({ leader }) => leader?.address)
        .slice(0, 4);
    const identityCards = identities.map((category) => {
        const leader = leaderForCategory(legacyData, category);
        const name = leaderName(leader);
        const clock = windowLabel(leader?.windowKind || leader?.window);
        const label = categoryLabel(category);
        return `
            <span data-maxis-entry-identity="${escapeHtml(category)}" aria-label="${escapeHtml(`${label}: ${name}, ${clock}`)}" title="${escapeHtml(`${label}: ${name} · ${clock}`)}">
                <b class="maxis-entry-identity-mark" aria-hidden="true">${CATEGORY_ICONS[category] || '•'}</b>
                <span class="maxis-entry-identity-copy">
                    <span class="maxis-entry-identity-name">${escapeHtml(label)}</span>
                    <strong class="maxis-entry-identity-leader">${escapeHtml(name)}</strong>
                    <small>${escapeHtml(clock)}</small>
                </span>
            </span>
        `;
    }).join('');
    return `
        <div class="maxis-entry-season-front maxis-entry-maxis-front">
            <div class="maxis-entry-season-copy maxis-entry-maxis-copy">
                <span class="maxis-entry-season-label">✺ Ongoing Tezos identities</span>
                <div class="maxis-entry-season-title" id="maxis-entry-title">Tezos Maxis</div>
                <p>Live, rolling, and all-time Tezos records for creators, builders, L1/L2 voters, stakers, transactors, and cross-lane Unicorns.</p>
                <div class="maxis-entry-season-meta">
                    <span><strong>${escapeHtml(String(identities.length || '—'))}</strong> identities</span>
                    <span><strong>${escapeHtml(String(ongoingWallets || '—'))}</strong> ranked wallets</span>
                    <span><strong>${escapeHtml(leaderName(ongoingUnicorn))}</strong> Tezos Unicorn</span>
                </div>
                <div class="maxis-entry-identity-strip" aria-label="Current Tezos Maxi crown holders">
                    ${identityCards}
                </div>
            </div>
            <aside class="maxis-entry-season-pulse" aria-label="Current protocol season pulse">
                <span class="maxis-entry-season-label">◉ Season ${escapeHtml(hasSeasonIdentity ? seasonNumberLabel(season) : '—')} · ${escapeHtml(pulseState)}</span>
                <strong>${escapeHtml(pulseTitle)}</strong>
                <p>${escapeHtml(seasonError ? 'The ongoing Maxis identities above remain valid. Open the Chamber to retry the scoped season sheet.' : 'Protocol-bounded movement, honors, and Passport progress.')}</p>
                <div class="maxis-entry-pulse-line"><span>Boundary</span><strong>${escapeHtml(boundaryCopy)}</strong></div>
                <div class="maxis-entry-pulse-line"><span>Season Unicorn</span><strong>${escapeHtml(unicornCopy)}</strong></div>
                <div class="maxis-entry-pulse-line"><span>Season sheet</span><strong>${escapeHtml(sheetCopy)}</strong></div>
                ${seasonCrownCards.length ? `
                    <div class="maxis-entry-season-crowns" aria-label="Current protocol-season lane leaders">
                        ${seasonCrownCards.map(({ category, leader }) => `
                            <span title="${escapeHtml(`${categoryLabel(category)}: ${leaderName(leader)}`)}">
                                <small>${escapeHtml(categoryLabel(category))}</small>
                                <strong>${escapeHtml(leaderName(leader))}</strong>
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
            </aside>
        </div>
    `;
}

function updateEntryCard(legacy, manifest = null, summary = null) {
    const card = document.getElementById('maxis-entry-card');
    if (!card) return;
    const front = card.querySelector('.maxis-entry-front');
    if (front) front.innerHTML = renderEntryContents(legacy, manifest, summary);
    dispatchMaxisHotSignals(legacy, manifest, summary);
    const state = freshness(legacy || summary);
    const identityCount = categoriesFor(legacy || {}).length;
    card.dataset.updatedLabel = `Maxis · ${state.stale ? 'previous valid' : state.label} · ${GENERATED_PROOFBOOK_SCHEDULE_LABEL}`;
    card.classList.toggle('chamber-data-stale', state.stale);
    const backValue = card.querySelector('.card-back .stat-value');
    const backCopy = card.querySelector('.card-back .stat-description');
    if (backValue) backValue.textContent = `${identityCount || '—'} Maxis identities`;
    if (backCopy) backCopy.textContent = 'Live, rolling, and all-time records with a smaller protocol-season pulse.';
    window.syncChamberEntryFooters?.(card);
    wireChamberLauncher(card, {
        open: openMaxisChamber,
        label: 'Open Tezos Maxis Chamber',
        titleSelector: '#maxis-entry-title, .stat-label, .maxis-entry-season-title'
    });
}

function ensureEntryCard() {
    const grid = document.getElementById('chambers-grid');
    if (!grid) return null;
    let card = document.getElementById('maxis-entry-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'maxis-entry-card';
        card.className = 'stat-card chamber-entry-card chamber-entry-wide maxis-entry-card chamber-entry-adoption';
        card.dataset.updatedLabel = 'Loading Maxis identities';
        card.innerHTML = `
            <button class="card-copy-link" type="button" data-copy-hash="#maxis" aria-label="Copy Tezos Maxis direct link" title="Copy Tezos Maxis link">🔗</button>
            <div class="card-inner">
                <div class="card-front maxis-entry-front"><h2 class="stat-label" id="maxis-entry-title">Tezos Maxis</h2><div class="maxis-entry-loading">Opening the identity boards…</div></div>
                <div class="card-back" aria-hidden="true"><h2 class="stat-label">Tezos Maxis</h2><div class="stat-value">Maxis identities</div><p class="stat-description">Every identity keeps its honest clock.</p></div>
            </div>
        `;
        grid.appendChild(card);
    }
    wireChamberLauncher(card, {
        open: openMaxisChamber,
        label: 'Open Tezos Maxis Chamber',
        titleSelector: '#maxis-entry-title, .stat-label, .maxis-entry-season-title'
    });
    card.dataset.maxisWired = '1';
    return card;
}

function closeMaxisDialogLayer() {
    const overlay = document.getElementById('maxis-modal');
    if (chamberState.selectorOpen || overlay?.querySelector('.maxis-season-tray.is-open')) {
        setSelectorOpen(false, { focus: true });
        return;
    }
    closeMaxisChamber();
}

function handleOutsidePointer(event) {
    if (!chamberState.selectorOpen) return;
    const tray = document.querySelector('#maxis-modal .maxis-season-tray');
    if (tray && !tray.contains(event.target)) setSelectorOpen(false);
}

function renderError(body, error) {
    body.innerHTML = `
        <div class="chamber-error maxis-error">
            <div class="chamber-error-icon">✺</div>
            <h2 id="maxis-title" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">Tezos Maxis</h2>
            <h3>The Maxis records are off-chain</h3>
            <p>${escapeHtml(error?.message || 'Neither the ongoing Maxis snapshot nor a protocol-season sheet answered.')}</p>
            <button class="chamber-retry-btn" id="maxis-retry" type="button">Retry</button>
        </div>
    `;
    body.querySelector('#maxis-retry')?.addEventListener('click', () => refreshChamber({ force: true }));
}

async function refreshChamber({ force = false } = {}) {
    const overlay = document.getElementById('maxis-modal');
    const body = overlay?.querySelector('.maxis-body');
    if (!overlay?.classList.contains('active') || !body) return;
    entryHydrationSerial += 1;
    requestSerial += 1;
    const refreshSerial = ++summaryRequestSerial;
    body.innerHTML = `
        <div class="chamber-loading" aria-live="polite">
            <h2 id="maxis-title" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">Tezos Maxis</h2>
            <div class="chamber-loading-text">Opening Tezos Maxis…</div>
            <div class="chamber-loading-bar"><div class="chamber-loading-fill"></div></div>
            <div class="chamber-loading-subtext">Ongoing identities first, then the current protocol season.</div>
        </div>
    `;
    if (force) {
        archiveRequestSerial += 1;
        lastLegacyBase = null;
        lastLegacy = null;
        lastCareer = null;
        lastL2Governance = null;
        l2GovernanceLoaded = false;
        lastManifest = null;
        summaryCache.clear();
        shardCache.clear();
        shardRequestCache.clear();
        chamberState.careers = null;
        chamberState.careerError = '';
        chamberState.l2Governance = null;
        chamberState.l2GovernanceError = '';
        chamberState.manifestError = '';
        chamberState.archives = null;
        chamberState.archivesLoading = false;
        chamberState.archivesError = '';
        chamberState.entrySummaryError = '';
    }
    const route = readRouteState();
    chamberState.view = route.view;
    chamberState.lane = route.lane || chamberState.lane;
    chamberState.laneByView[laneRoomForView(route.view)] = route.lane || chamberState.laneByView[laneRoomForView(route.view)];
    chamberState.passportAddress = route.address || '';
    chamberState.passportInput = route.address || '';
    chamberState.passportUsesSaved = false;
    chamberState.passportProfile = null;
    chamberState.passportCareer = null;
    chamberState.passportLoading = false;
    chamberState.passportLoadingStage = '';
    chamberState.passportError = '';
    chamberState.passportRetryable = false;
    chamberState.summaryError = '';
    syncRouteState();
    const manifestTask = loadManifest({ force });
    const careerTask = loadCareerData({ force });
    const l2GovernanceTask = loadL2GovernanceData({ force });
    let legacyError = null;
    try {
        chamberState.legacy = await loadLegacy({ force });
        renderExperience();
    } catch (error) {
        legacyError = error;
        console.warn('Ongoing Maxis refresh failed', error);
    }
    const manifest = await manifestTask;
    chamberState.manifest = manifest;
    const seasons = normalizedSeasons(manifest);
    chamberState.seasonId = route.seasonId && seasons.some((season) => season.id === route.seasonId)
        ? route.seasonId
        : textValue(currentSeasonId(manifest), seasons[0]?.id);
    const requestedSeasonId = chamberState.seasonId;
    chamberState.summaryLoading = Boolean(manifest);
    if (manifest || chamberState.legacy) renderExperience({ preserveScroll: true });
    let summary = null;
    let summaryError = null;
    try {
        summary = manifest ? await loadSeasonSummary(requestedSeasonId, { force }) : null;
    } catch (error) {
        summaryError = error;
    }
    if (refreshSerial !== summaryRequestSerial || chamberState.seasonId !== requestedSeasonId) return;
    chamberState.summary = summary;
    chamberState.summaryLoading = false;
    chamberState.summaryError = summaryError
        ? textValue(summaryError?.message, 'The selected season summary could not be verified.')
        : (!manifest && chamberState.manifestError ? chamberState.manifestError : '');
    await Promise.all([careerTask, l2GovernanceTask]);
    if (!chamberState.legacy && !chamberState.summary) {
        renderError(body, legacyError || summaryError || new Error('No valid Maxis data source answered.'));
        return;
    }
    ensureValidLane(chamberState.view === 'maxis' ? chamberState.legacy : chamberState.summary || {});
    syncRouteState();
    renderExperience({ preserveScroll: false });
    const entrySeasonId = currentSeasonId(chamberState.manifest);
    const entrySummary = requestedSeasonId === entrySeasonId
        ? chamberState.summary
        : (summaryCache.get(entrySeasonId) || null);
    chamberState.entrySummaryLoading = false;
    chamberState.entrySummaryError = !chamberState.manifest
        ? chamberState.manifestError
        : requestedSeasonId === entrySeasonId
            ? chamberState.summaryError
            : '';
    updateEntryCard(chamberState.legacy, chamberState.manifest, entrySummary);
    if (chamberState.view === 'passport') {
        const address = chamberState.passportAddress || safeLocalStorageGet(MY_TEZOS_ADDRESS_KEY);
        if (address) await openPassport(address, { usesSaved: !route.address });
    }
    if (chamberState.view === 'champions') ensureArchivesLoaded();
}

export async function openMaxisChamber({ isCurrent = () => true } = {}) {
    if (!isCurrent()) return;
    if (!initComplete) { window.addEventListener('my-baker-updated', handleMyTezosUpdate); initComplete = true; }
    await ensureMaxisStyles();
    if (!isCurrent()) return;
    let overlay = document.getElementById('maxis-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'maxis-modal';
        overlay.className = 'modal-overlay chamber-overlay maxis-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="modal-content modal-large chamber-content maxis-content" role="dialog" aria-modal="true" aria-label="Tezos Maxis Chamber" aria-labelledby="maxis-title" tabindex="-1">
                <div class="maxis-corner-tray maxis-close-tray">
                    <button class="modal-close chamber-close" type="button" aria-label="Close Tezos Maxis Chamber">&times;</button>
                </div>
                <div class="chamber-body maxis-body"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.chamber-close')?.addEventListener('click', closeMaxisChamber);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeMaxisChamber();
        });
    }
    if (overlay.classList.contains('active')) return;
    savedBodyOverflow = document.body.style.overflow;
    savedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    overlay.classList.add('active');
    activateChamberDialog(overlay, {
        close: closeMaxisDialogLayer,
        dialogSelector: '.maxis-content',
        titleId: 'maxis-title',
        label: 'Tezos Maxis Chamber',
        restoreFocusSelector: '#maxis-entry-card'
    });
    document.addEventListener('pointerdown', handleOutsidePointer, true);
    await refreshChamber({ force: true });
    if (!isCurrent() || !overlay.classList.contains('active')) return;
}

export function closeMaxisChamber() {
    const overlay = document.getElementById('maxis-modal');
    if (!requestChamberClose(overlay)) return;
    document.removeEventListener('pointerdown', handleOutsidePointer, true);
    if (overlay) {
        overlay.classList.remove('active');
        deactivateChamberDialog(overlay);
    }
    chamberState.selectorOpen = false;
    document.body.style.overflow = savedBodyOverflow || '';
    document.documentElement.style.overflow = savedHtmlOverflow || '';
}

async function assertEntrySummaryProjection(document) {
    if (Number(document?.schema) !== 1
        || document?.kind !== 'maxis-entry-summary'
        || !Array.isArray(document?.payload?.legacy?.leaders)
        || !Number.isInteger(document?.payload?.legacy?.rankedWalletCount)
        || document.payload.legacy.rankedWalletCount < 0
        || !Array.isArray(document?.payload?.manifest?.seasons)
        || !Array.isArray(document?.payload?.summary?.leaders)) {
        throw new Error('The Maxis launcher projection has an unsupported schema.');
    }
    const receipts = document?.sourceReceipts;
    const requiredReceipts = ['legacy', 'l2Governance', 'manifest', 'currentSeasonSummary'];
    const requiredPaths = {
        legacy: '/data/maxis-leaders.json',
        l2Governance: '/data/maxis-l2-governance.json',
        manifest: '/data/maxis/manifest.json'
    };
    if (requiredReceipts.some((key) => {
        const receipt = receipts?.[key];
        return !receipt?.path
            || !Number.isInteger(receipt?.bytes)
            || receipt.bytes <= 0
            || !/^[a-f0-9]{64}$/.test(String(receipt?.sha256 || ''))
            || (requiredPaths[key] && receipt.path !== requiredPaths[key])
            || (key === 'currentSeasonSummary' && !/^\/data\/maxis\/seasons\/[^/]+\/summary\.json$/.test(receipt.path));
    })) {
        throw new Error('The Maxis launcher projection is missing a reviewed source receipt.');
    }
    const expectedCategories = ['transaction', 'collector', 'artist', 'minter', 'defi', 'gaming', 'governance', 'l2_governance', 'staking', 'unicorn'];
    const projectedCategories = new Set(document.payload.legacy.leaders.map((leader) => canonicalCategory(leader?.category || leader?.lane)));
    if (expectedCategories.some((category) => !projectedCategories.has(category))) {
        throw new Error('The Maxis launcher projection is missing a canonical identity.');
    }
    const activeSeasonId = textValue(document.payload.manifest.activeSeasonId, document.payload.manifest.current?.id, document.payload.manifest.current?.seasonId);
    const summarySeasonId = textValue(document.payload.summary.season?.id, document.payload.summary.season?.seasonId);
    if (!activeSeasonId || summarySeasonId !== activeSeasonId
        || !receipts.currentSeasonSummary.path.includes(`/seasons/${activeSeasonId}/`)) {
        throw new Error('The Maxis launcher projection season does not match its manifest and source receipt.');
    }
    const { integrity, ...unsigned } = document;
    if (integrity?.algorithm !== 'sha256-stable-json-v1' || !integrity?.contentHash) {
        throw new Error('The Maxis launcher projection has no integrity receipt.');
    }
    const actualHash = await sha256Text(JSON.stringify(stableJsonValue(unsigned)));
    if (actualHash.toLowerCase() !== String(integrity.contentHash).toLowerCase()) {
        throw new Error('The Maxis launcher projection failed its SHA-256 integrity receipt.');
    }
    return document.payload;
}

async function loadEntrySummaryProjection() {
    if (entrySummaryPromise) return entrySummaryPromise;
    entrySummaryPromise = fetchJson(ENTRY_SUMMARY_URL)
        .then(assertEntrySummaryProjection)
        .finally(() => { entrySummaryPromise = null; });
    return entrySummaryPromise;
}

async function hydrateEntryCard() {
    const serial = ++entryHydrationSerial;
    try {
        const projection = await loadEntrySummaryProjection();
        if (serial !== entryHydrationSerial || lastLegacy || chamberState.legacy) return;
        chamberState.entrySummaryLoading = false;
        chamberState.entrySummaryError = '';
        updateEntryCard(projection.legacy, projection.manifest, projection.summary);
        return;
    } catch (error) {
        if (serial !== entryHydrationSerial) return;
        chamberState.entrySummaryLoading = false;
        chamberState.entrySummaryError = textValue(error?.message, 'The compact Maxis launcher receipt is temporarily unavailable.');
        updateEntryCard(null, null, null);
        throw error;
    }
}

function handleMyTezosUpdate(event) {
    if (chamberState.view !== 'passport' || !chamberState.passportUsesSaved) return;
    const address = textValue(event?.detail?.address, safeLocalStorageGet(MY_TEZOS_ADDRESS_KEY));
    if (address && address !== chamberState.passportAddress) {
        openPassport(address, { usesSaved: true });
        return;
    }
    if (!address) {
        requestSerial += 1;
        chamberState.passportAddress = '';
        chamberState.passportInput = '';
        chamberState.passportProfile = null;
        chamberState.passportCareer = null;
        chamberState.passportLoading = false;
        chamberState.passportLoadingStage = '';
        chamberState.passportNote = '';
        chamberState.passportError = 'My Tezos was cleared. Enter an address explicitly or save another My Tezos address.';
        chamberState.passportRetryable = false;
        syncRouteState();
        renderExperience({ preserveScroll: true, focusSelector: '.maxis-passport-input' });
    }
}

export function initMaxisChamber() {
    ensureMaxisStyles().catch((error) => console.warn('Tezos Maxis styles unavailable', error));
    ensureEntryCard();
    window.openMaxisChamber = openMaxisChamber;
    if (!initComplete) {
        window.addEventListener('my-baker-updated', handleMyTezosUpdate);
        initComplete = true;
    }
    hydrateEntryCard().catch((error) => {
        console.debug('Tezos Maxis entry data unavailable', error);
        const card = document.getElementById('maxis-entry-card');
        if (card) {
            card.dataset.updatedLabel = 'Maxis data unavailable';
            card.classList.add('chamber-data-stale');
            window.syncChamberEntryFooters?.(card);
        }
    });
}
