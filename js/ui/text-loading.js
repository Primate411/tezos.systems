import { escapeHtml } from '../core/utils.js';

// Explicit request state only: never infer loading from a dash, zero, or error
// message. Callers retain last-good facts while background requests are pending.
export function setTextPending(element, pending) {
    if (!element) return;
    if (pending) {
        element.setAttribute('data-text-pending', 'true');
        element.setAttribute('aria-busy', 'true');
    } else {
        element.removeAttribute('data-text-pending');
        element.removeAttribute('aria-busy');
    }
}

export function setPendingFields(root, selector, pending) {
    root?.querySelectorAll(selector).forEach(element => setTextPending(element, pending));
}

export function loadingText(label = 'Loading data', text = 'Loading…') {
    return `<span class="text-loading-inline" data-text-pending="true" role="status" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${escapeHtml(text)}</span></span>`;
}

export function loadingRows(label = 'Loading receipts', count = 3) {
    return `<div class="text-loading-rows" role="status" aria-label="${escapeHtml(label)}">${Array.from({ length: count }, () => '<div aria-hidden="true"><span data-text-pending="true">Pending receipt</span><span data-text-pending="true">Pending detail</span></div>').join('')}</div>`;
}
