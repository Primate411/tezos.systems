/**
 * The shared Chamber header. Every room opens with the Network Health anatomy:
 * a system strip, a glyph + title + status chip row, then one plain-language
 * summary line over a mono meta line. Text fields are escaped; `chips`, `meta`
 * and `actions` are trusted renderer markup so rooms can keep live ids.
 */
import { escapeHtml } from '../core/utils.js';

const CHIP_TONES = new Set(['live', 'current', 'historical']);

/** A status chip in the title row; tone follows the existing badge palette. */
export function renderChamberChip(label, { tone = 'current', id = '', className = '' } = {}) {
    const toneClass = CHIP_TONES.has(tone) ? tone : 'current';
    return `<span class="chamber-badge ${toneClass}${className ? ` ${escapeHtml(className)}` : ''}"${id ? ` id="${escapeHtml(id)}"` : ''}>${escapeHtml(label)}</span>`;
}

export function renderChamberHeader({
    room,
    strip = [],
    glyph = '',
    title,
    titleId = '',
    titleTag = 'h2',
    chips = '',
    summary = '',
    summaryClass = '',
    meta = '',
    metaId = '',
    actions = '',
    className = ''
}) {
    const [brand = 'Tezos.Systems', ...trail] = strip;
    const tag = titleTag === 'h1' ? 'h1' : 'h2';
    const info = summary || meta
        ? `<div class="chamber-proposal-info">${summary ? `<div class="proposal-name${summaryClass ? ` ${escapeHtml(summaryClass)}` : ''}">${escapeHtml(summary)}</div>` : ''}${meta ? `<div class="proposal-hash"${metaId ? ` id="${escapeHtml(metaId)}"` : ''}>${meta}</div>` : ''}</div>`
        : '';
    return `<header class="chamber-header lb-header chamber-house-header${className ? ` ${escapeHtml(className)}` : ''}" data-chamber-header="${escapeHtml(room)}" data-quiet-key="${escapeHtml(room)}-header">
        <div class="lb-system-strip"><span class="lb-system-brand">${escapeHtml(brand)}</span>${trail.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
        <div class="chamber-title-row"><${tag} class="chamber-title"${titleId ? ` id="${escapeHtml(titleId)}"` : ''}${glyph ? ` data-glyph="${escapeHtml(glyph)}"` : ''}>${escapeHtml(title)}</${tag}>${chips}</div>
        ${info}${actions ? `<div class="chamber-header-actions">${actions}</div>` : ''}
    </header>`;
}
