import { createHash } from 'node:crypto';
import { parse } from 'parse5';

export const REVIEW_AFTER_HOURS = 12;
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
const HOUR = 3_600_000;
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export function receiptFacts(receipt) {
  const copy = structuredClone(receipt);
  delete copy.updatedAt;
  delete copy.expiresAt;
  for (const candidate of copy.candidates) for (const evidence of candidate.evidence) delete evidence.observedAt;
  return copy;
}

const API = 'https://gitlab.com/api/v4/projects/tezos%2Ftezos';
export function sourceCatalog(receipt) {
  const catalog = new Map();
  for (const candidate of receipt.candidates) for (const evidence of candidate.evidence) {
    const original = evidence.url;
    if (new URL(original).protocol !== 'https:') throw new Error('Canonical sources must use HTTPS');
    let url = original, kind = 'html';
    // The operator permanently classifies this old incident as maintenance.
    if (url === 'https://status.etherlink.com/incident/1040145') url = 'https://status.etherlink.com/maintenance/1040145';
    if (url.startsWith('https://gitlab.com/tezos/tezos/-/tags')) {
      const tag = url.slice('https://gitlab.com/tezos/tezos/-/tags'.length);
      url = `${API}/repository/tags${tag || '?per_page=100&order_by=updated&sort=desc'}`;
      kind = tag ? 'tag' : 'tags';
    } else if (url.startsWith(`${API}/releases/`)) kind = 'release';
    else if (/^https:\/\/governance\.etherlink\.com\/api\/(slow|fast|sequencer)\/pastPeriods$/.test(url)) kind = 'governance';
    else if (!['tezos.com', 'spotlight.tezos.com', 'status.etherlink.com', 'x.tezos.com', 'octez.tezos.com'].includes(new URL(url).hostname)) {
      throw new Error(`Unreviewed source host: ${url}`);
    }
    if (!catalog.has(url)) catalog.set(url, { url, kind, evidenceUrls: [] });
    catalog.get(url).evidenceUrls.push(original);
  }
  for (const [url, kind] of [
    [`${API}/repository/tags?per_page=100&order_by=updated&sort=desc`, 'tags'],
    ['https://governance.etherlink.com/api/slow/pastPeriods', 'governance'],
    ['https://governance.etherlink.com/api/fast/pastPeriods', 'governance'],
    ['https://governance.etherlink.com/api/sequencer/pastPeriods', 'governance'],
    ['https://status.etherlink.com/index.json', 'status']
  ]) if (!catalog.has(url)) catalog.set(url, { url, kind, evidenceUrls: [] });
  return [...catalog.values()].sort((a, b) => a.url.localeCompare(b.url));
}

export function normalizeSource(source, body) {
  if (!body || Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error('Empty or oversized source');
  if (source.kind === 'html') {
    const tree = parse(body);
    const text = [], links = [];
    const walk = node => {
      if (['script', 'style', 'svg', 'noscript', 'template'].includes(node.tagName)) return;
      if (node.nodeName === '#text') text.push(node.value);
      if (node.tagName === 'a') {
        const href = node.attrs?.find(a => a.name === 'href')?.value;
        if (href) links.push(new URL(href, source.url).href);
      }
      for (const child of node.childNodes || []) walk(child);
    };
    walk(tree);
    const content = text.join(' ').replace(/\s+/g, ' ').trim();
    if (content.length < 100 || !/<html[\s>]/i.test(body) || /just a moment|verify you are human|access denied/i.test(content)) {
      throw new Error('Source did not return a complete public document');
    }
    return { text: content, links: [...new Set(links)].sort() };
  }
  const data = JSON.parse(body);
  if (source.kind === 'governance') {
    if (Object.keys(data).join() !== 'pastPeriods' || !Array.isArray(data.pastPeriods) || !data.pastPeriods.length
      || data.pastPeriods.some(p => !p.contract || !Number.isInteger(p.contract_voting_index) || !p.startDateTime || !p.endDateTime)) {
      throw new Error('Incomplete or changed governance archive schema');
    }
    return data; // Entire FAST/SLOW/Sequencer archives, including every older vote.
  }
  if (source.kind === 'tag' && (!data.name || typeof data.protected !== 'boolean' || !data.commit?.id)) throw new Error('Invalid tag receipt');
  if (source.kind === 'tags' && (!Array.isArray(data) || !data.length || data.some(t => !t.name || !t.commit?.id))) throw new Error('Invalid release discovery list');
  if (source.kind === 'release' && (!data.tag_name || !data.released_at || typeof data.upcoming_release !== 'boolean' || !data.assets)) throw new Error('Invalid publication receipt');
  if (source.kind === 'status') {
    if (data.data?.type !== 'status_page' || data.data?.attributes?.custom_domain !== 'status.etherlink.com' || !Array.isArray(data.included)) throw new Error('Invalid operator status feed');
    for (const group of ['sections', 'resources', 'status_reports']) {
      const refs = data.data.relationships?.[group]?.data;
      if (!Array.isArray(refs) || !refs.length || refs.some(ref => !data.included.some(i => i.type === ref.type && i.id === ref.id))) throw new Error(`Incomplete status ${group}`);
    }
    for (const report of data.included.filter(i => i.type === 'status_report')) {
      const updates = report.relationships?.status_updates?.data;
      if (!updates?.length || updates.some(ref => !data.included.some(i => i.type === ref.type && i.id === ref.id))) throw new Error('Incomplete incident updates');
    }
    // Poll/uptime counters are not release or deployment evidence. Preserve all
    // identities, current states, report memberships, messages and event times.
    delete data.data.attributes.updated_at;
    for (const item of data.included) if (item.type === 'status_page_resource') {
      delete item.attributes.availability;
      delete item.attributes.status_history;
    }
    return data;
  }
  // Avatar URLs can expire without changing tag/publication evidence.
  const stripAvatars = value => {
    if (Array.isArray(value)) return value.map(stripAvatars);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'avatar_url').map(([k, v]) => [k, stripAvatars(v)]));
    return value;
  };
  return stripAvatars(data);
}

export function validateBaseline(receipt, baseline) {
  if (baseline?.schemaVersion !== 1 || baseline.receiptDigest !== digest(receiptFacts(receipt))) throw new Error('Radar facts differ from the human-reviewed baseline');
  if (!Number.isFinite(Date.parse(baseline.reviewedAt)) || (baseline.notAfter && !Number.isFinite(Date.parse(baseline.notAfter))) || !Array.isArray(baseline.sources)) throw new Error('Missing human source review');
  const catalog = sourceCatalog(receipt);
  if (baseline.sources.length !== catalog.length || new Set(baseline.sources.map(s => s.url)).size !== catalog.length) throw new Error('Incomplete baseline source inventory');
  for (const source of catalog) {
    const saved = baseline.sources.find(s => s.url === source.url);
    if (!saved || saved.kind !== source.kind || digest(saved.evidenceUrls) !== digest(source.evidenceUrls) || !/^[a-f0-9]{64}$/.test(saved.sha256)) throw new Error(`Missing source baseline: ${source.url}`);
  }
  return catalog;
}

export async function fetchSource(source, { fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchImpl(source.url, { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'TezosSystems-ReleaseReview/1.0' }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.transient = [408, 429, 500, 502, 503, 504].includes(response.status);
        throw error;
      }
      if (Number(response.headers.get('content-length')) > MAX_BODY_BYTES) throw new Error('Oversized source');
      // Review the canonical public representation, including its disclosed CDN
      // age. Retrieval time is not an assertion that the origin was republished.
      // Explicit stale/revalidation-failed responses may not renew evidence.
      if (/\b11[01]\b/.test(response.headers.get('warning') || '')) throw new Error('Upstream explicitly served stale evidence');
      const reader = response.body.getReader();const chunks = [];let bytes = 0;
      try {
        for (;;) { const { value, done } = await reader.read();if (done) break;bytes += value.byteLength;if (bytes > MAX_BODY_BYTES) throw new Error('Oversized source');chunks.push(Buffer.from(value)); }
      } finally { await reader.cancel(); }
      const body = Buffer.concat(chunks).toString('utf8');
      const normalized = normalizeSource(source, body);
      return { ...source, responseDate: response.headers.get('date'), cacheAgeSeconds: response.headers.get('age'), lastModified: response.headers.get('last-modified'), etag: response.headers.get('etag'), fetchedAt: new Date(now()).toISOString(), bytes, rawSha256: createHash('sha256').update(body).digest('hex'), sha256: digest(normalized), normalized, attempts: attempt };
    } catch (error) {
      const temporary = error.transient || ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name);
      if (!temporary || attempt === 3) throw error;
      await sleep(attempt * 5000);
    }
  }
}

export async function reviewSources({ receipt, baseline, force = false, collect = false, now = Date.now(), fetcher = fetchSource }) {
  if (receipt.staleAfterHours !== 36 || !Number.isFinite(Date.parse(receipt.updatedAt))) throw new Error('Invalid Radar freshness policy');
  const age = now - Date.parse(receipt.updatedAt);
  if (!collect && Date.parse(baseline.reviewedAt) > now) throw new Error('Human source review clock is in the future');
  if (age < 0) throw new Error('Radar review clock is in the future');
  const catalog = collect ? sourceCatalog(receipt) : validateBaseline(receipt, baseline);
  const report = { schemaVersion: 1, checkedAt: new Date(now).toISOString(), status: 'not_due', ageHours: age / HOUR, reviewAfterHours: REVIEW_AFTER_HOURS, staleAfterHours: 36, sources: [], problems: [] };
  if (!force && !collect && age < REVIEW_AFTER_HOURS * HOUR && !(baseline.notAfter && now >= Date.parse(baseline.notAfter))) return { report, receipt };
  for (const source of catalog) {
    try {
      const result = await fetcher(source);report.sources.push(result);
      if (!collect && result.sha256 !== baseline.sources.find(s => s.url === source.url).sha256) report.problems.push({ url: source.url, reason: 'Source evidence changed; substantive review required' });
    } catch (error) { report.problems.push({ url: source.url, reason: error.message }); }
  }
  if (!collect && baseline.notAfter && now >= Date.parse(baseline.notAfter)) report.problems.push({ reason: 'A reviewed future-event boundary has passed; substantive review required' });
  report.status = report.problems.length ? 'review_required' : collect ? 'collected' : 'reviewed';
  if (report.status !== 'reviewed') return { report, receipt };
  // Clock is the start of this complete review, never an upstream publication clock.
  const renewed = structuredClone(receipt);renewed.updatedAt = report.checkedAt;renewed.expiresAt = new Date(now + 14 * 24 * HOUR).toISOString();
  for (const c of renewed.candidates) for (const e of c.evidence) e.observedAt = report.checkedAt;
  return { report, receipt: renewed };
}
