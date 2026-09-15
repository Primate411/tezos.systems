#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FUNDING_SOURCES, FUNDING_MAX_BYTES, FUNDING_PREVIEW_MAX_BYTES, campaignState, campaignProgress, fundingStale, fundingUrl, fundingImage, formatFundingAmount, validateFundingSnapshot, buildFundingPreview, validateFundingPreview, fundingPreviewPath } from '../js/core/community-funding.mjs';
import { normalizeHacktez, normalizeTeztree, normalizeTtcrowd, fetchHacktezCatalog, fetchTtcrowdCatalog } from '../scripts/lib/community-funding.mjs';
import { SCHEDULED_REFRESH_LANES } from '../scripts/lib/scheduled-refresh-lanes.mjs';
import { fundingFixtures } from './fixtures/community-funding.mjs';

const now = Date.now();
const fixtures = fundingFixtures(now);
assert.deepEqual(fixtures.teztree.items.map(item => campaignState(item, now)), ['open', 'ended', 'ended']);
assert.equal(campaignState({ ...fixtures.teztree.items[0], moderation: 'suspended' }, now), 'suspended');
assert.equal(campaignState({ ...fixtures.teztree.items[0], status: 'unknown' }, now), 'unavailable');
assert.equal(campaignProgress(fixtures.teztree.items[1]), 12.5, 'funded flag cannot fabricate goal progress');
assert.equal(campaignProgress(fixtures.teztree.items[2]), null, 'missing amounts stay unavailable');
assert.equal(formatFundingAmount('12345678901234567890', 6), '12,345,678,901,234.56789');
assert.equal(formatFundingAmount('0', 6), '0');
assert.equal(formatFundingAmount(null), 'Unavailable');
assert.equal(fixtures.hacktez.items.length, 8, 'only explicit project tips');
assert.equal(fixtures.hacktez.items[0].tipCounters.count, 2, 'project counter is not the member counter');
assert.equal(fixtures.hacktez.items[0].tipCounters.totals.length, 2, 'asset totals remain separate');
assert.equal(fixtures.hacktez.items[1].tipCounters, null, 'an absent project counter is not a zero');
assert.equal(fundingStale(fixtures.hacktez, now), false);
assert.equal(fundingStale({ ...fixtures.hacktez, generatedAt: new Date(now - 19 * 3600000).toISOString() }, now), true);
assert.equal(fundingStale({ ...fixtures.hacktez, sourceGeneratedAt: new Date(now - 19 * 3600000).toISOString() }, now), true);
assert.equal(fundingUrl('https://hacktez.com.evil.test/u/a/p/b', 'hacktez'), '');
assert.equal(fundingUrl('javascript:alert(1)', 'teztree'), '');
assert.equal(fundingImage('data:image/svg+xml,unsafe'), '');
assert.equal(fundingImage('https://evil.test/tracker.png'), '');
assert.equal(fundingImage('ipfs://QmImage'), 'https://ipfs.fileship.xyz/ipfs/QmImage');
assert.throws(() => normalizeTeztree({ campaigns: [{ ...fixtures.campaigns.campaigns[0], goalMutez: '-1' }] }, fixtures.teztree.generatedAt));
assert.throws(() => normalizeTeztree({ campaigns: [{ ...fixtures.campaigns.campaigns[0], goalMutez: 9007199254740992 }] }, fixtures.teztree.generatedAt), 'unsafe numeric mutez cannot silently round');
assert.equal(normalizeTeztree({ campaigns: [{ ...fixtures.campaigns.campaigns[0], goalMutez: '9007199254740993' }] }, fixtures.teztree.generatedAt).items[0].goalMutez, '9007199254740993');
assert.throws(() => normalizeHacktez({ ...fixtures.projects, total: 100 }, fixtures.members, fixtures.hacktez.generatedAt));
assert.throws(() => normalizeHacktez({ ...fixtures.projects, data: [{ ...fixtures.projects.data[0], urls: { page: 'https://evil.test/pay' } }], total: 1 }, fixtures.members, fixtures.hacktez.generatedAt));
const duplicate = structuredClone(fixtures.hacktez); duplicate.items.push(duplicate.items[0]);
assert.throws(() => validateFundingSnapshot(duplicate, 'hacktez'));
assert.throws(() => validateFundingSnapshot(fixtures.hacktez, 'teztree'));
assert.throws(() => validateFundingSnapshot({ ...fixtures.hacktez, generatedAt: new Date(now + 3600000).toISOString() }, 'hacktez'));
const zero = structuredClone(fixtures.members); zero.data[0].tipCounters.projects[0] = { slug: 'project-1', count: 0, totals: [] };
assert.equal(normalizeHacktez(fixtures.projects, zero, fixtures.hacktez.generatedAt).items[0].tipCounters.count, 0);
const unavailable = structuredClone(fixtures.members); unavailable.data[0].tipCounters = null;
assert.equal(normalizeHacktez(fixtures.projects, unavailable, fixtures.hacktez.generatedAt).items[0].tipCounters, null);
const preview = buildFundingPreview(fixtures.hacktez);
assert.equal(preview.highlights.length, 3);
assert.equal(preview.availableCount, 8);
assert(preview.highlights.every(item => item.status === 'live'), 'live projects precede work in progress in the stable discovery sample');
assert.equal(preview.sourceGeneratedAt, fixtures.hacktez.sourceGeneratedAt, 'launcher preserves the upstream clock');
const campaignPreview = buildFundingPreview(fixtures.teztree);
assert.equal(campaignPreview.openCount, 1);
assert.equal(campaignState(campaignPreview.highlights[0]), 'open');
assert.throws(() => validateFundingPreview({ ...preview, highlights: [...preview.highlights, preview.highlights[0]] }, 'hacktez'));
assert.throws(() => validateFundingPreview({ ...preview, availableCount: 1 }, 'hacktez'));

const crowd = fixtures.ttcrowd.items;
assert.deepEqual(crowd.map(item => campaignState(item, now)), ['open', 'open', 'paused', 'ended']);
assert.equal(campaignState(crowd[1], now), 'open', 'funding above goal does not close an accepting campaign');
assert.equal(campaignState({ ...crowd[0], notTaking: true }, now), 'not-accepting');
assert.equal(campaignState({ ...crowd[0], deadline: new Date(now - 1).toISOString() }, now), 'ended');
assert.equal(campaignState({ ...crowd[0], createdAt: new Date(now + 86400000).toISOString() }, now), 'unavailable');
assert.equal(campaignProgress(crowd[1]), 120.1);
assert.equal(campaignProgress(crowd[3]), null);
assert.equal(crowd[0].reportedAmount, '27.802');
assert.deepEqual(crowd.map(item => item.currency), ['USD', 'XTZ', 'EUR', 'XTZ']);
assert.equal(crowd[1].progressBasis, 'balance', 'treasury accounting retains its source basis');
const crowdPreview = buildFundingPreview(fixtures.ttcrowd);
assert.equal(crowdPreview.openCount, 2);
assert.equal(crowdPreview.nextDeadline, null, 'open TTCrowd campaigns may have no deadline');
validateFundingPreview(crowdPreview, 'ttcrowd');
assert.equal(fundingUrl('https://crowd.thetezos.com/c/animation', 'ttcrowd'), crowd[0].url);
assert.equal(fundingUrl('https://crowd.thetezos.com.evil.test/c/animation', 'ttcrowd'), '');
assert.equal(fundingUrl('https://crowd.thetezos.com/admin', 'ttcrowd'), '');
assert.equal(fundingUrl('https://crowd.thetezos.com/c/a/../../admin', 'ttcrowd'), '');
assert.equal(fundingImage('https://pbs.twimg.com/media/campaign.jpg'), 'https://pbs.twimg.com/media/campaign.jpg');
assert.equal(fundingImage('https://pbs.twimg.com.evil.test/media/campaign.jpg'), '');
const normalizeCrowd = (catalog = fixtures.crowdCatalog, summaries = fixtures.crowdSummaries) => normalizeTtcrowd(catalog, summaries, fixtures.ttcrowd.generatedAt);
assert.throws(() => normalizeCrowd(fixtures.crowdCatalog, fixtures.crowdSummaries.slice(1)), 'all summaries are required');
assert.throws(() => normalizeCrowd([...fixtures.crowdCatalog, fixtures.crowdCatalog[0]]), 'duplicate slugs rejected');
for (const change of [{ slug: 'other' }, { preview: true }, { valuation_currency: 'EUR' }, { progress_basis: 'unknown' }, { is_closed: null }]) {
    assert.throws(() => normalizeCrowd(fixtures.crowdCatalog, [{ ...fixtures.crowdSummaries[0], ...change }, ...fixtures.crowdSummaries.slice(1)]));
}
assert.equal(campaignState(normalizeCrowd(fixtures.crowdCatalog, [{ ...fixtures.crowdSummaries[0], is_capped: true }, ...fixtures.crowdSummaries.slice(1)]).items[0], now), 'not-accepting');
assert.throws(() => normalizeCrowd([{ ...fixtures.crowdCatalog[0], raised: -1 }], [fixtures.crowdSummaries[0]]));
let crowdCalls = [];
const fetchedCrowd = await fetchTtcrowdCatalog(async url => {
    crowdCalls.push(url);
    return url === FUNDING_SOURCES.ttcrowd.url ? fixtures.crowdCatalog
        : fixtures.crowdSummaries.find(summary => url.endsWith(`/c/${summary.slug}/summary`));
}, fixtures.ttcrowd.generatedAt);
assert.deepEqual(fetchedCrowd, fixtures.ttcrowd);
assert.equal(crowdCalls.length, 5);
await assert.rejects(fetchTtcrowdCatalog(async url => {
    if (url === FUNDING_SOURCES.ttcrowd.url) return fixtures.crowdCatalog;
    throw new Error('summary unavailable');
}, fixtures.ttcrowd.generatedAt), 'one failed summary fails the source lane');
await assert.rejects(fetchTtcrowdCatalog(async () => Array.from({ length: 101 }, (_, i) => ({ ...fixtures.crowdCatalog[0], slug: `campaign-${i}` })), fixtures.ttcrowd.generatedAt));

let pages = 0;
const complete = await fetchHacktezCatalog(FUNDING_SOURCES.hacktez.url, async url => {
    const offset = Number(new URL(url).searchParams.get('offset')); pages++;
    return { network: 'mainnet', data: [offset], offset, count: 1, total: 2, generatedAt: fixtures.hacktez.generatedAt };
});
assert.equal(pages, 2); assert.deepEqual(complete.data, [0, 1]);
await assert.rejects(fetchHacktezCatalog(FUNDING_SOURCES.hacktez.url, async () => ({ network: 'mainnet', data: [], offset: 0, count: 0, total: 1, generatedAt: fixtures.hacktez.generatedAt })));

for (const [source, config] of Object.entries(FUNDING_SOURCES)) {
    const raw = await readFile(new URL(`..${config.path}`, import.meta.url), 'utf8');
    assert(Buffer.byteLength(raw) <= FUNDING_MAX_BYTES);
    validateFundingSnapshot(JSON.parse(raw), source);
    const lane = SCHEDULED_REFRESH_LANES.find(lane => lane.id === `community-funding-${source}`);
    assert.deepEqual(lane.targets, [config.path.slice(1), fundingPreviewPath(source).slice(1)], 'each source owns its snapshot and preview rollback targets');
    assert(lane.validate.length);
    const previewRaw = await readFile(new URL(`..${fundingPreviewPath(source)}`, import.meta.url), 'utf8');
    assert(Buffer.byteLength(previewRaw) <= FUNDING_PREVIEW_MAX_BYTES);
    assert.deepEqual(validateFundingPreview(JSON.parse(previewRaw), source), buildFundingPreview(JSON.parse(raw)));
}
const feature = await readFile(new URL('../js/features/community-funding.js', import.meta.url), 'utf8');
assert.match(feature, /document.visibilityState === 'visible' && active\(\)/);
assert.match(feature, /if \(!mayRefresh\(\)\) \{ pending = results; return; \}/);
assert.match(feature, /quietlySyncHtml\(panel, markup\)/);
assert.match(feature, /clearInterval\(timer\)/);
assert.match(feature, /if \(!mayPreview\(\)\) \{ pendingPreview = results; return; \}/);
assert.match(feature, /quietlySyncHtml\(card.querySelector\('\.funding-entry-preview'\)/);
assert.match(feature, /document.visibilityState === 'visible' && entryInView/);
assert.doesNotMatch(feature, /fetch\(['"`]https:/);
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
assert(Object.values(FUNDING_SOURCES).every(source => sw.includes(source.path)));
console.log('ok - Community Funding: exact amounts, statuses, source clocks, project-only per-asset counters, safe URLs, bounded pagination and independent refresh lanes');
