import { escapeHtml } from '../core/utils.js';

function snapshotStatus(saved, error) {
    return error ? 'Last-good snapshot · refresh failed' : saved ? 'Saved snapshot · update pending' : 'Generated snapshot verified';
}

export function snapshotStatusMarkup(saved, error) {
    return `<p class="chamber-snapshot-status" data-snapshot-status data-quiet-key="snapshot-status" role="status">${snapshotStatus(saved, error)}</p>`;
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
