import { FUNDING_MAX_ITEMS, FUNDING_SOURCES, fundingUrl, fundingImage, validateFundingSnapshot } from '../../js/core/community-funding.mjs';

const bounded = (value, limit) => String(value ?? '').trim().slice(0, limit);
const amount = (value, integer = false) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER
        || (integer && !Number.isSafeInteger(value)))) throw new Error('Unsafe funding amount; exact string required');
    const raw = String(value);
    if (!(integer ? /^(0|[1-9]\d{0,39})$/ : /^(0|[1-9]\d{0,39})(\.\d{1,18})?$/).test(raw)) throw new Error('Invalid funding amount');
    return raw;
};
const count = value => {
    if (value === null || value === undefined) return null;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid funding count');
    return value;
};
const date = value => {
    if (!value) return null;
    if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid funding date');
    return new Date(value).toISOString();
};

export function normalizeTeztree(payload, generatedAt) {
    if (!Array.isArray(payload?.campaigns) || payload.campaigns.length > FUNDING_MAX_ITEMS) throw new Error('Incomplete TezTree campaigns');
    const items = payload.campaigns.map(row => {
        if (!row || !Number.isSafeInteger(row.id) || row.id < 0 || typeof row.closed !== 'boolean') throw new Error('Invalid TezTree campaign');
        return {
            id: String(row.id), title: bounded(row.title, 240), summary: bounded(row.summary, 2000),
            builder: bounded(row.creator, 160), payout: bounded(row.payout, 100),
            url: `https://funding.teztree.com/c/${row.id}`, image: fundingImage(row.image),
            goalMutez: amount(row.goalMutez, true), raisedMutez: amount(row.raisedMutez, true), backers: count(row.backers),
            closed: row.closed, status: bounded(row.status, 40), moderation: row.moderation?.status ? bounded(row.moderation.status, 40) : null,
            deadline: date(row.deadline), createdAt: date(row.createdAt)
        };
    }).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0) || a.id.localeCompare(b.id));
    return validateFundingSnapshot({ schemaVersion: 1, source: 'teztree', sourceUrl: FUNDING_SOURCES.teztree.url, generatedAt,
        sourceGeneratedAt: null, complete: true, sourceCount: items.length, items }, 'teztree', Date.parse(generatedAt));
}

const TTCROWD_MAX_CAMPAIGNS = 100;

function validateTtcrowdCatalog(catalog) {
    if (!Array.isArray(catalog) || catalog.length > TTCROWD_MAX_CAMPAIGNS) throw new Error('Incomplete or oversized TTCrowd catalog');
    const slugs = new Set();
    for (const row of catalog) {
        if (!row || typeof row.slug !== 'string' || row.slug.length > 220 || slugs.has(row.slug)
            || !fundingUrl(`https://crowd.thetezos.com/c/${row.slug}`, 'ttcrowd')
            || !['active', 'paused', 'completed'].includes(row.status)) throw new Error('Invalid public TTCrowd campaign');
        slugs.add(row.slug);
    }
}

export function normalizeTtcrowd(catalog, summaries, generatedAt) {
    validateTtcrowdCatalog(catalog);
    if (!Array.isArray(summaries) || summaries.length !== catalog.length) throw new Error('Incomplete TTCrowd summaries');
    const items = catalog.map((row, index) => {
        const summary = summaries[index];
        if (!summary || summary.slug !== row.slug || summary.preview !== false
            || summary.valuation_currency !== row.valuation_currency
            || typeof summary.is_closed !== 'boolean' || typeof summary.is_capped !== 'boolean' || typeof summary.include_staked !== 'boolean'
            || !(summary.not_taking === null || typeof summary.not_taking === 'string' || typeof summary.not_taking === 'boolean')) throw new Error('Invalid TTCrowd campaign summary');
        return {
            source: 'ttcrowd', id: row.slug, title: bounded(row.title, 240),
            summary: bounded(summary.description || row.tagline, 2000).replace(/^#{1,6}\s+/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1'),
            builder: bounded(summary.steward?.tzdomain || summary.steward?.alias || summary.steward?.name || summary.steward?.address, 160),
            url: `https://crowd.thetezos.com/c/${row.slug}`, image: fundingImage(row.banner_url || row.logo_url),
            // Catalog values already use valuation_currency. The summary's legacy
            // *_xtz field names also hold fiat values; never relabel those as tez.
            reportedAmount: amount(row.raised), targetAmount: amount(row.target), reportedPercent: amount(row.percent),
            currency: row.valuation_currency, progressBasis: summary.progress_basis, includeStaked: summary.include_staked,
            status: row.status, closed: summary.is_closed, capped: summary.is_capped, notTaking: Boolean(summary.not_taking),
            deadline: date(row.end_date || summary.campaign_end_date), createdAt: date(row.start_date || summary.campaign_start_date)
        };
    }).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0) || a.id.localeCompare(b.id));
    return validateFundingSnapshot({ schemaVersion: 1, source: 'ttcrowd', sourceUrl: FUNDING_SOURCES.ttcrowd.url,
        generatedAt, sourceGeneratedAt: null, complete: true, sourceCount: catalog.length, items }, 'ttcrowd', Date.parse(generatedAt));
}

export async function fetchTtcrowdCatalog(fetchJson, generatedAt) {
    const catalog = await fetchJson(FUNDING_SOURCES.ttcrowd.url);
    validateTtcrowdCatalog(catalog);
    const summaries = [];
    // Limit upstream concurrency and reject the whole lane if any summary fails.
    for (let offset = 0; offset < catalog.length; offset += 4) {
        summaries.push(...await Promise.all(catalog.slice(offset, offset + 4).map(row =>
            fetchJson(`https://crowd.thetezos.com/api/public/c/${row.slug}/summary`))));
    }
    return normalizeTtcrowd(catalog, summaries, generatedAt);
}

export function normalizeHacktez(projects, members, generatedAt) {
    if (!Array.isArray(projects?.data) || projects.data.length !== projects.total || projects.total > FUNDING_MAX_ITEMS
        || projects.network !== 'mainnet' || !Array.isArray(members?.data) || members.data.length !== members.total
        || members.network !== 'mainnet') throw new Error('Incomplete HackTez catalog');
    const sourceGeneratedAt = date(projects.generatedAt);
    if (!sourceGeneratedAt || !date(members.generatedAt)) throw new Error('Missing HackTez source clock');
    const memberMap = new Map();
    for (const member of members.data) {
        if (memberMap.has(member.name)) throw new Error('Duplicate HackTez member');
        memberMap.set(member.name, member);
    }
    const items = projects.data.filter(row => row.tips?.enabled === true).map(row => {
        const url = fundingUrl(row.urls?.page, 'hacktez');
        if (!url || !row.member?.name || !row.slug || !url.endsWith(`/p/${row.slug}`)) throw new Error('Invalid HackTez project identity');
        const member = memberMap.get(row.member.name);
        // A member total is never a project total. Only join an exact member + slug receipt.
        const matches = member?.tipCounters?.projects?.filter(counter => counter.slug === row.slug) || [];
        if (matches.length > 1) throw new Error('Ambiguous HackTez project counters');
        const counter = matches[0];
        return {
            id: `${row.member.name}/${row.slug}`, title: bounded(row.name, 240), summary: bounded(row.desc, 2000),
            builder: bounded(row.member.displayName || row.member.name, 160), builderUrl: url.split('/p/')[0],
            url, image: fundingImage(row.logo || row.member.picture), status: bounded(row.status, 40),
            tipsEnabled: true, supportNote: bounded(row.tips.desc, 2000),
            suggestedAmounts: (row.tips.amounts || []).map(value => amount(value)), customAmount: row.tips.customAmount === true,
            payTo: row.tips.payTo ? bounded(row.tips.payTo, 100) : null,
            tipCounters: counter ? { count: count(counter.count), totals: counter.totals.map(total => ({
                asset: bounded(total.asset, 200), symbol: bounded(total.symbol, 40), total: amount(total.total)
            })) } : null
        };
    }).sort((a, b) => a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id));
    return validateFundingSnapshot({ schemaVersion: 1, source: 'hacktez', sourceUrl: FUNDING_SOURCES.hacktez.url, generatedAt,
        sourceGeneratedAt: new Date(Math.min(Date.parse(sourceGeneratedAt), Date.parse(members.generatedAt))).toISOString(),
        complete: true, sourceCount: projects.total, items }, 'hacktez', Date.parse(generatedAt));
}

export async function fetchHacktezCatalog(url, fetchJson) {
    const data = [];
    let total = null;
    let generatedAt = null;
    for (let page = 0; page < 20; page += 1) {
        const next = new URL(url);
        next.searchParams.set('limit', '1000');
        next.searchParams.set('offset', String(data.length));
        const payload = await fetchJson(next.href);
        if (payload?.network !== 'mainnet' || !Array.isArray(payload.data) || payload.count !== payload.data.length
            || payload.offset !== data.length || !Number.isSafeInteger(payload.total) || payload.total < 0 || payload.total > FUNDING_MAX_ITEMS
            || (total !== null && payload.total !== total) || !date(payload.generatedAt)
            || (generatedAt && generatedAt !== payload.generatedAt)) throw new Error('HackTez pagination changed or is incomplete');
        total = payload.total;
        generatedAt = payload.generatedAt;
        data.push(...payload.data);
        if (data.length === total) return { data, total, generatedAt, network: 'mainnet' };
        if (!payload.data.length || data.length > total) throw new Error('HackTez truncated catalog');
    }
    throw new Error('HackTez pagination limit');
}
