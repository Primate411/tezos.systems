// Shared receipt contract for the generator and the Community Funding room.
export const FUNDING_MAX_BYTES = 512 * 1024;
export const FUNDING_MAX_ITEMS = 1000;
export const FUNDING_PREVIEW_MAX_BYTES = 16 * 1024;
export const FUNDING_STALE_MS = 18 * 60 * 60 * 1000;
export const FUNDING_SOURCES = Object.freeze({
    teztree: { name: 'TezTree', url: 'https://funding.teztree.com/api/campaigns', home: 'https://funding.teztree.com/', path: '/data/community-funding-teztree.json' },
    hacktez: { name: 'HackTez', url: 'https://hacktez.com/api/v1/projects', home: 'https://hacktez.com/', path: '/data/community-funding-hacktez.json' }
});

export const fundingPreviewPath = source => `/data/community-funding-${source}-preview.json`;

// A stable discovery sample, not a popularity or donation ranking.
export function buildFundingPreview(snapshot) {
    validateFundingSnapshot(snapshot, snapshot.source);
    const now = Date.parse(snapshot.generatedAt);
    const campaigns = snapshot.source === 'teztree';
    const liveOrder = item => ({ live: 0, wip: 1 }[item.status] ?? 2);
    const open = campaigns ? snapshot.items.filter(item => campaignState(item, now) === 'open') : [];
    const highlights = [...snapshot.items].sort((a, b) => campaigns
        ? Number(campaignState(b, now) === 'open') - Number(campaignState(a, now) === 'open')
            || (campaignState(a, now) === 'open' ? Date.parse(a.deadline) - Date.parse(b.deadline) : Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
            || a.id.localeCompare(b.id)
        : liveOrder(a) - liveOrder(b) || a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id)
    ).slice(0, 3).map(item => ({ ...item, summary: item.summary.slice(0, 160), ...(campaigns ? {} : { supportNote: '', tipCounters: null, payTo: null, suggestedAmounts: item.suggestedAmounts.slice(0, 3) }) }));
    return {
        schemaVersion: 1, kind: 'funding-preview', source: snapshot.source, sourceUrl: snapshot.sourceUrl,
        generatedAt: snapshot.generatedAt, sourceGeneratedAt: snapshot.sourceGeneratedAt, sourceCount: snapshot.sourceCount,
        availableCount: snapshot.items.length, openCount: campaigns ? open.length : null,
        nextDeadline: open.length ? open.map(item => item.deadline).sort()[0] : null, highlights
    };
}

export function validateFundingPreview(preview, source, now = Date.now()) {
    if (preview?.kind !== 'funding-preview' || !Array.isArray(preview.highlights) || preview.highlights.length > 3
        || !Number.isSafeInteger(preview.availableCount) || preview.availableCount < preview.highlights.length
        || preview.availableCount > preview.sourceCount || preview.availableCount > FUNDING_MAX_ITEMS
        || (source === 'teztree' ? !Number.isSafeInteger(preview.openCount) || preview.openCount < 0 || preview.openCount > preview.availableCount
            || (preview.openCount > 0 ? !Number.isFinite(Date.parse(preview.nextDeadline)) : preview.nextDeadline !== null)
            : preview.openCount !== null || preview.nextDeadline !== null)) throw new Error(`Invalid ${source} funding preview`);
    validateFundingSnapshot({ ...preview, complete: true, items: preview.highlights }, source, now);
    return preview;
}

export function fundingUrl(value, source) {
    try {
        const url = new URL(value);
        const host = source === 'teztree' ? 'funding.teztree.com' : 'hacktez.com';
        if (url.protocol !== 'https:' || url.host !== host || url.username || url.password) return '';
        if (source === 'teztree' ? !/^\/c\/\d+$/.test(url.pathname) : !/^\/u\/[a-z0-9-]+\/p\/[a-z0-9-]+$/.test(url.pathname)) return '';
        return url.origin + url.pathname;
    } catch { return ''; }
}

export function fundingImage(value) {
    const raw = String(value || '');
    if (/^ipfs:\/\/[a-zA-Z0-9]+(?:\/[^\s?#]*)?$/.test(raw)) return `https://ipfs.fileship.xyz/ipfs/${raw.slice(7)}`;
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' && !url.username && !url.password
            && ['funding.teztree.com', 'ipfs.fileship.xyz', 'ipfs.io', 'dweb.link', 'gateway.pinata.cloud'].includes(url.host) ? url.href : '';
    } catch { return ''; }
}

export function campaignState(item, now = Date.now()) {
    if (item.moderation === 'suspended') return 'suspended';
    if (item.closed || (item.deadline && Date.parse(item.deadline) <= now)) return 'ended';
    if (item.status === 'live' && item.closed === false && Number.isFinite(Date.parse(item.deadline))) return 'open';
    return 'unavailable';
}

export function fundingStale(snapshot, now = Date.now()) {
    const clocks = [snapshot?.generatedAt, snapshot?.sourceGeneratedAt].filter(Boolean).map(Date.parse);
    return !clocks.length || clocks.some(time => !Number.isFinite(time) || time > now + 300_000 || now - time > FUNDING_STALE_MS);
}

export function formatFundingAmount(value, decimals = 0) {
    if (value === null || value === undefined) return 'Unavailable';
    // Integer mutez stay exact even above Number.MAX_SAFE_INTEGER.
    if (decimals) {
        const amount = BigInt(value);
        const scale = 10n ** BigInt(decimals);
        const fraction = String(amount % scale).padStart(decimals, '0').replace(/0+$/, '');
        return (amount / scale).toLocaleString('en-US') + (fraction ? `.${fraction}` : '');
    }
    const [whole, fraction] = String(value).split('.');
    return BigInt(whole).toLocaleString('en-US') + (fraction ? `.${fraction}` : '');
}

export function campaignProgress(item) {
    if (item.goalMutez === null || item.raisedMutez === null || BigInt(item.goalMutez) <= 0n) return null;
    // Round only the visual percentage, never the source amounts.
    return Number(BigInt(item.raisedMutez) * 1000n / BigInt(item.goalMutez)) / 10;
}

const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const text = (value, max, nullable = false) => (nullable && value === null) || (typeof value === 'string' && value.length <= max);
const decimal = value => value === null || (typeof value === 'string' && /^(0|[1-9]\d{0,39})(\.\d{1,18})?$/.test(value));
const integer = value => value === null || (typeof value === 'string' && /^(0|[1-9]\d{0,39})$/.test(value));
const count = value => value === null || (Number.isSafeInteger(value) && value >= 0);

export function validateFundingSnapshot(snapshot, source, now = Date.now()) {
    const fail = () => { throw new Error(`Invalid ${source} funding receipt`); };
    if (!FUNDING_SOURCES[source] || snapshot?.schemaVersion !== 1 || snapshot.source !== source
        || snapshot.sourceUrl !== FUNDING_SOURCES[source].url || snapshot.complete !== true
        || !timestamp(snapshot.generatedAt) || Date.parse(snapshot.generatedAt) > now + 300_000
        || !(snapshot.sourceGeneratedAt === null || (timestamp(snapshot.sourceGeneratedAt) && Date.parse(snapshot.sourceGeneratedAt) <= now + 300_000))
        || !Number.isSafeInteger(snapshot.sourceCount) || snapshot.sourceCount < 0
        || !Array.isArray(snapshot.items) || snapshot.items.length > FUNDING_MAX_ITEMS
        || snapshot.items.length > snapshot.sourceCount) fail();
    const seen = new Set();
    for (const item of snapshot.items) {
        if (!text(item.id, 220) || !item.id || seen.has(item.id) || !text(item.title, 240) || !item.title
            || !text(item.summary, 2000) || !text(item.builder, 160) || !text(item.image, 2048)
            || (item.image && fundingImage(item.image) !== item.image)
            || !fundingUrl(item.url, source) || fundingUrl(item.url, source) !== item.url) fail();
        seen.add(item.id);
        if (source === 'teztree') {
            if (!/^\d+$/.test(item.id) || item.url !== `https://funding.teztree.com/c/${item.id}`
                || !integer(item.goalMutez) || !integer(item.raisedMutez) || !count(item.backers)
                || typeof item.closed !== 'boolean' || !text(item.status, 40) || !text(item.moderation, 40, true)
                || !(item.deadline === null || timestamp(item.deadline)) || !(item.createdAt === null || timestamp(item.createdAt))) fail();
        } else {
            if (item.tipsEnabled !== true || !text(item.status, 40) || !text(item.supportNote, 2000)
                || !Array.isArray(item.suggestedAmounts) || item.suggestedAmounts.length > 12
                || item.suggestedAmounts.some(amount => amount === null || !decimal(amount))
                || typeof item.customAmount !== 'boolean' || !text(item.payTo, 100, true)
                || !text(item.builderUrl, 2048)) fail();
            if (item.builderUrl !== new URL(item.url).origin + new URL(item.url).pathname.split('/p/')[0]) fail();
            if (item.tipCounters !== null) {
                const counters = item.tipCounters;
                if (!count(counters?.count) || counters.count === null || !Array.isArray(counters.totals) || counters.totals.length > 100) fail();
                const assets = new Set();
                for (const total of counters.totals) {
                    if (!text(total.asset, 200) || !total.asset || assets.has(total.asset) || !text(total.symbol, 40)
                        || total.total === null || !decimal(total.total)) fail();
                    assets.add(total.asset);
                }
            }
        }
    }
    return snapshot;
}
