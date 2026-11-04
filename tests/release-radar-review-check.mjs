#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { reviewSources, validateBaseline, sourceCatalog, normalizeSource, fetchSource, digest, receiptFacts, MAX_BODY_BYTES } from '../scripts/lib/release-radar-review.mjs';
import { runReview } from '../scripts/review-release-radar.mjs';
import { normalizeReleaseRadarSnapshot } from '../js/core/release-radar.mjs';
const receipt = JSON.parse(await fs.readFile(new URL('../data/release-radar.json', import.meta.url)));
const baseline = JSON.parse(await fs.readFile(new URL('../data/release-radar-review.json', import.meta.url)));
validateBaseline(receipt, baseline);
const catalog = sourceCatalog(receipt);
assert.equal(catalog.filter(s => s.kind === 'governance').length, 3);
assert(catalog.some(s => s.kind === 'status'));
for (const c of receipt.candidates) for (const e of c.evidence) assert(catalog.some(s => s.evidenceUrls.includes(e.url)), 'Every evidence row is re-reviewed');
const base = { ...baseline, notAfter: null };
const start = Date.parse(receipt.updatedAt), now = start + 12 * 3600000;
const seen = [];
const fetcher = async s => { seen.push(s.url);return { ...s, sha256: baseline.sources.find(b => b.url === s.url).sha256 }; };
let result = await reviewSources({ receipt, baseline: base, now: now - 1, fetcher });
assert.equal(result.report.status, 'not_due');assert.equal(seen.length, 0);
result = await reviewSources({ receipt, baseline: base, now, fetcher });
assert.equal(result.report.status, 'reviewed');assert.equal(seen.length, catalog.length);
assert.deepEqual(receiptFacts(result.receipt), receiptFacts(receipt), 'No launch inference, changed history, or upstream clock advancement');
assert.equal(result.receipt.updatedAt, new Date(now).toISOString());
assert(result.receipt.candidates.every(c => c.evidence.every(e => e.observedAt === result.receipt.updatedAt)));
assert.equal(result.receipt.staleAfterHours, 36);
assert(normalizeReleaseRadarSnapshot(receipt).staleAtMs < start + 37 * 3600000, 'Failed renewal still expires at the existing limit');
for (const source of catalog) {
 const changed = await reviewSources({ receipt, baseline: base, now, fetcher: async s => ({ ...await fetcher(s), ...(s.url === source.url ? { sha256: 'f'.repeat(64) } : {}) }) });
 assert.equal(changed.report.status, 'review_required', source.url);assert.deepEqual(changed.receipt, receipt);
}
for (const baselineOverride of [{ sources: base.sources.slice(1) }, { receiptDigest: 'wrong' }, { notAfter: 'invalid' }, { reviewedAt: new Date(now + 1).toISOString() }]) {
 await assert.rejects(reviewSources({ receipt, baseline: { ...base, ...baselineOverride }, now, fetcher }));
}
const boundary = await reviewSources({ receipt, baseline: { ...base, notAfter: new Date(start + 1000).toISOString() }, now: start + 2000, fetcher });
assert.equal(boundary.report.status, 'review_required', 'Event boundaries trigger review even before the normal 12-hour due time');
assert.deepEqual(boundary.receipt, receipt);
await assert.rejects(reviewSources({ receipt, baseline: base, now: start - 1, fetcher }), /future/);
const htmlSource = { kind: 'html', url: 'https://tezos.com/tezos-x' };
const html = '<html><body><main>' + 'Reviewed roadmap and deployment evidence. '.repeat(5) + '<a href="/release">Release</a></main></body></html>';
const normalized = normalizeSource(htmlSource, html);
assert.notEqual(digest(normalized), digest(normalizeSource(htmlSource, html.replace('/release', '/new-release'))));
assert.notEqual(digest(normalized), digest(normalizeSource(htmlSource, html.replace('roadmap', 'launched'))));
assert.throws(() => normalizeSource(htmlSource, '<html>Access denied</html>'));
assert.throws(() => normalizeSource(htmlSource, 'x'.repeat(MAX_BODY_BYTES + 1)));
const gov = { pastPeriods: [{ contract: 'KT1', contract_voting_index: 1, startDateTime: '2026-01-01', endDateTime: '2026-01-02', promotion: { yea_voting_power: 5 } }, { contract: 'KT1', contract_voting_index: 0, startDateTime: '2025-01-01', endDateTime: '2025-01-02' }] };
const first = digest(normalizeSource({ kind: 'governance' }, JSON.stringify(gov)));
gov.pastPeriods.at(-1).proposals = [{ proposal_hash: 'older-vote-changed' }];
assert.notEqual(first, digest(normalizeSource({ kind: 'governance' }, JSON.stringify(gov))), 'Older governance evidence must not be sampled away');
assert.throws(() => normalizeSource({ kind: 'governance' }, '{"pastPeriods":[],"next":"page2"}'));
assert.throws(() => normalizeSource({ kind: 'status' }, '{"data":{"type":"status_page"},"included":[]}'));
const statusSource = { kind: 'status' };
const status = { data: { type: 'status_page', attributes: { custom_domain: 'status.etherlink.com', updated_at: 'poll1' }, relationships: {
 sections: { data: [{ type: 'status_page_section', id: '1' }] }, resources: { data: [{ type: 'status_page_resource', id: '2' }] }, status_reports: { data: [{ type: 'status_report', id: '3' }] }
} }, included: [
 { type: 'status_page_section', id: '1', attributes: { name: 'Mainnet' } },
 { type: 'status_page_resource', id: '2', attributes: { status: 'operational', availability: 99, status_history: [] } },
 { type: 'status_report', id: '3', attributes: { title: 'Deployment', starts_at: '2026-01-01', aggregate_state: 'resolved' }, relationships: { status_updates: { data: [{ type: 'status_update', id: '4' }] } } },
 { type: 'status_update', id: '4', attributes: { message: 'Kernel deployment completed' } }
] };
const statusHash = digest(normalizeSource(statusSource, JSON.stringify(status)));
status.data.attributes.updated_at = 'poll2';status.included[1].attributes.availability = 100;
assert.equal(statusHash, digest(normalizeSource(statusSource, JSON.stringify(status))), 'Only non-evidence polling counters are ignored');
status.included[3].attributes.message = 'Deployment withdrawn';
assert.notEqual(statusHash, digest(normalizeSource(statusSource, JSON.stringify(status))), 'Operator corrections remain evidence');
status.included.pop();assert.throws(() => normalizeSource(statusSource, JSON.stringify(status)), /Incomplete incident/);
const tags = [{ name: 'v1', protected: true, commit: { id: 'sha', created_at: '2026-01-01' } }];
const tagHash = digest(normalizeSource({ kind: 'tags' }, JSON.stringify(tags)));
tags.push({ name: 'v2', protected: true, commit: { id: 'sha2' } });
assert.notEqual(tagHash, digest(normalizeSource({ kind: 'tags' }, JSON.stringify(tags))), 'New releases must request substantive review');
let requests = 0;
const response = () => new Response(html, { headers: { date: new Date(now).toUTCString(), age: '1000' } });
const fetched = await fetchSource(htmlSource, { now: () => now, sleep: async () => {}, fetchImpl: async () => ++requests < 3 ? new Response('', { status: 503 }) : response() });
assert.equal(requests, 3);assert.equal(fetched.sha256, digest(normalized));assert.equal(fetched.cacheAgeSeconds, '1000', 'Disclose CDN age without conflating it with origin publication');
for (const makeResponse of [() => new Response(html, { status: 404 }), () => new Response('<html>challenge</html>'), () => new Response(html, { headers: { warning: '110 - "Response is stale"' } }), () => new Response(html, { headers: { 'content-length': String(MAX_BODY_BYTES + 1) } })]) {
 requests = 0;await assert.rejects(fetchSource(htmlSource, { sleep: async () => {}, fetchImpl: async () => { requests++;return makeResponse(); } }));assert.equal(requests, 1);
}
requests = 0;await assert.rejects(fetchSource(htmlSource, { sleep: async () => {}, fetchImpl: async () => { requests++;throw new TypeError('network failure'); } }));assert.equal(requests, 3);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-review-check-'));
try {
 await fs.mkdir(path.join(temp, 'data'));
 const file = path.join(temp, 'data/release-radar.json');const original = JSON.stringify(receipt);
 await fs.writeFile(file, original);await fs.writeFile(path.join(temp, 'data/release-radar-review.json'), JSON.stringify(base));
 const reportPath = path.join(temp, 'report.json');
 const failed = await runReview({ root: temp, reportPath, now, apply: true, fetcher: async () => { throw new Error('HTTP 503'); } });
 assert.equal(failed.status, 'review_required');assert.equal(failed.problems.length, catalog.length);assert.equal(await fs.readFile(file, 'utf8'), original, 'Outage preserves exact last-good bytes');
 await runReview({ root: temp, reportPath, now, apply: true, collect: true, fetcher });
 assert.equal(await fs.readFile(file, 'utf8'), original, 'Collection never accepts a baseline or renews clocks');
 const reconcile = createRequire(import.meta.url)('../.github/scripts/reconcile-release-review.js');
 let issue;const mutations = [];
 const context = { repo: { owner: 'owner', repo: 'repo' }, runId: 123 };
 const core = { warning() {}, summary: { addHeading() { return this; }, addLink() { return this; }, async write() {} } };
 const github = { paginate: async () => issue ? [issue] : [], rest: { issues: { listForRepo() {}, async create(p) { issue = { ...p, number: 1, state: 'open' };mutations.push('create'); }, async update(p) { Object.assign(issue, p);mutations.push('update'); } } } };
 const invoke = async report => { await fs.writeFile(reportPath, JSON.stringify(report));await reconcile({ github, context, core, env: { REVIEW_REPORT: reportPath } }); };
 const needsReview = { status: 'review_required', attempts: [{ review: failed }] };
 await invoke(needsReview);await invoke(needsReview);assert.deepEqual(mutations, ['create'], 'Repeated source problems do not send repeated issue notifications');
 await invoke({ status: 'not_due' });assert.equal(issue.state, 'open', 'Not-due is not recovery proof');
 await assert.rejects(invoke({ status: 'reviewed', published: false }));assert.equal(issue.state, 'open');
 await invoke({ status: 'reviewed', published: true, commit: 'verified', attempts: [{ review: { problems: [] } }] });assert.equal(issue.state, 'closed');
 await invoke(needsReview);assert.equal(issue.state, 'open');assert.equal(mutations.length, 3);
} finally { await fs.rm(temp, { recursive: true, force: true }); }
const workflow = await fs.readFile(new URL('../.github/workflows/review-release-radar.yml', import.meta.url), 'utf8');
for (const snippet of ["cron: '7 */4 * * *'", 'Collect Chamber History', 'head_repository.full_name == github.repository', "head_branch == 'main'", 'ref: main', 'tezos-systems-repository-writer', 'cancel-in-progress: false', 'gh workflow run ci.yml', 'gh workflow run audit-generated-freshness.yml', 'if-no-files-found: error']) assert(workflow.includes(snippet), snippet);
assert(!workflow.includes('continue-on-error'), 'Technical failures remain red');
console.log('ok - complete source review, unchanged-evidence renewal, deadline boundaries, last-good preservation and one early incident');
