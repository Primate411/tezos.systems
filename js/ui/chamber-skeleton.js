import { escapeHtml } from '../core/utils.js';

function snapshotStatus(saved, error) {
    return error ? 'Last-good snapshot · refresh failed' : saved ? 'Saved snapshot · update pending' : 'Artifact validated';
}

export function snapshotStatusMarkup(saved, error, sources = {}) {
    const rows = Object.entries(sources || {}).map(([key, source]) => {
        const clockKey = ['observedAt', 'lastGoodAt', 'retrievedAt', 'reviewedAt'].find(field => source?.[field]);
        const label = escapeHtml(source?.label || key);
        const link = /^https?:\/\//.test(source?.url || '')
            ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${label} ↗</a>` : label;
        return `<li><strong>${link}</strong> · ${escapeHtml(source?.status || 'status unavailable')}${source?.credit ? `<p>${escapeHtml(source.credit)}</p>` : ''}${clockKey ? `<time datetime="${escapeHtml(source[clockKey])}">${escapeHtml(clockKey.replace(/At$/, ''))}: ${escapeHtml(source[clockKey])}</time>` : ''}${source?.error ? `<p>${escapeHtml(source.error)}</p>` : ''}</li>`;
    }).join('');
    const content = ( `<p>Validation checks the artifact's structure and integrity. Each source retains its own observation date, coverage, and limitations; issuer statements remain attributed claims.</p>${rows ? `<ul class="chamber-source-list">${rows}</ul>` : '<p>Source receipts are attached to the observations in this room.</p>'}`);
    return `<details class="chamber-disclosure chamber-source-status" data-chamber-disclosure data-quiet-key="snapshot-sources"><summary>Sources &amp; refresh · <span class="chamber-snapshot-status" data-snapshot-status data-quiet-key="snapshot-status" role="status">${snapshotStatus(saved, error)}</span></summary><div class="chamber-disclosure-content">${content}</div></details>`;
}

export function syncSnapshotStatus(body, saved, error) {
    const status = body?.querySelector('[data-snapshot-status]');
    const text = snapshotStatus(saved, error);
    if (status && status.textContent !== text) status.textContent = text;
}

// Static section frames: no made-up values, spinner, or repeated animation.
// The room keeps its own typography and colors through the enclosing surface.
export function chamberSkeleton({ title, titleId, sections }) {
    return `<div class="chamber-first-paint" aria-busy="true">
        <header><span class="chamber-first-paint-kicker">Tezos Systems</span><h2 id="${escapeHtml(titleId)}">${escapeHtml(title)}</h2>
        <p role="status">Verifying the saved or generated proofbook…</p></header>
        <div class="chamber-first-paint-grid">${sections.map((section) => `<section><h3>${escapeHtml(section)}</h3><div class="chamber-first-paint-lines" aria-hidden="true"><i></i><i></i><i></i></div></section>`).join('')}</div>
        <p class="chamber-first-paint-note">Figures and source dates appear after verification.</p>
    </div>`;
}
