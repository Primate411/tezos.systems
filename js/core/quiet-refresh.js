/**
 * Quiet background refresh helpers.
 *
 * Live data may change, but a timed refresh must not move the page, reset a
 * nested scroller, replay entrance animation, or discard the reader's focus
 * and text selection. These helpers retain compatible DOM nodes and restore
 * browsing state around unavoidable structural changes.
 */

const KEY_ATTRIBUTES = [
    'data-quiet-key',
    'data-hot-signal-id',
    'data-hot-progress-index',
    'data-etherlink-track',
    'data-tz4-filter',
    'data-domain-event',
    'data-address',
    'data-hash'
];

function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function elementKey(element) {
    if (!(element instanceof Element)) return '';
    if (element.id) return `id:${element.id}`;
    for (const name of KEY_ATTRIBUTES) {
        const value = element.getAttribute(name);
        if (value) return `${element.tagName}:${name}:${value}`;
    }
    if (element.matches('a[href]')) return `${element.tagName}:href:${element.getAttribute('href')}`;
    if (element.matches('button[aria-label]')) return `${element.tagName}:aria:${element.getAttribute('aria-label')}`;
    return '';
}

function nodeCompatible(current, desired) {
    if (!current || !desired || current.nodeType !== desired.nodeType) return false;
    if (current.nodeType !== Node.ELEMENT_NODE) return true;
    if (current.tagName !== desired.tagName) return false;
    const currentKey = elementKey(current);
    const desiredKey = elementKey(desired);
    return !currentKey && !desiredKey ? true : currentKey === desiredKey;
}

function preserveRuntimeAttribute(name) {
    return name.startsWith('data-quiet-') || name.endsWith('-wired');
}

function syncAttributes(current, desired) {
    // A reader owns an opt-in disclosure, including across background renders.
    const disclosureOpen = current instanceof HTMLDetailsElement && current.hasAttribute('data-chamber-disclosure')
        ? current.open : null;
    for (const attribute of [...current.attributes]) {
        if (!desired.hasAttribute(attribute.name) && !preserveRuntimeAttribute(attribute.name)) {
            current.removeAttribute(attribute.name);
        }
    }
    for (const attribute of [...desired.attributes]) {
        if (current.getAttribute(attribute.name) !== attribute.value) {
            current.setAttribute(attribute.name, attribute.value);
        }
    }
    if (disclosureOpen !== null) current.open = disclosureOpen;
    if (current instanceof HTMLInputElement && desired instanceof HTMLInputElement) {
        if (current.type === 'checkbox' || current.type === 'radio') current.checked = desired.checked;
    } else if (current instanceof HTMLProgressElement && desired instanceof HTMLProgressElement) {
        current.value = desired.value;
    }
}

function syncNode(current, desired) {
    if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
        if (current.nodeValue !== desired.nodeValue) current.nodeValue = desired.nodeValue;
        return current;
    }
    syncAttributes(current, desired);
    syncChildren(current, desired);
    return current;
}

function syncChildren(currentParent, desiredParent) {
    const desiredChildren = [...desiredParent.childNodes];
    let cursor = currentParent.firstChild;
    for (const desired of desiredChildren) {
        if (cursor && nodeCompatible(cursor, desired)) {
            syncNode(cursor, desired);
            cursor = cursor.nextSibling;
            continue;
        }
        const desiredKey = desired.nodeType === Node.ELEMENT_NODE ? elementKey(desired) : '';
        let matching = null;
        if (desiredKey) {
            for (let candidate = cursor?.nextSibling || null; candidate; candidate = candidate.nextSibling) {
                if (nodeCompatible(candidate, desired)) {
                    matching = candidate;
                    break;
                }
            }
        }
        if (matching) {
            currentParent.insertBefore(matching, cursor);
            syncNode(matching, desired);
            cursor = matching.nextSibling;
        } else {
            const inserted = desired.cloneNode(true);
            currentParent.insertBefore(inserted, cursor);
            cursor = inserted.nextSibling;
        }
    }
    while (cursor) {
        const next = cursor.nextSibling;
        cursor.remove();
        cursor = next;
    }
}

function nodePath(root, node) {
    const path = [];
    let current = node;
    while (current && current !== root) {
        const parent = current.parentNode;
        if (!parent) return null;
        path.unshift([...parent.childNodes].indexOf(current));
        current = parent;
    }
    return current === root ? path : null;
}

function resolveNodePath(root, path) {
    if (!Array.isArray(path)) return null;
    let current = root;
    for (const index of path) {
        current = current?.childNodes?.[index] || null;
        if (!current) return null;
    }
    return current;
}

function elementLocator(root, element) {
    if (!(element instanceof Element) || !root.contains(element)) return null;
    if (element.id) return { selector: `#${cssEscape(element.id)}` };
    for (const name of KEY_ATTRIBUTES) {
        const value = element.getAttribute(name);
        if (value) return { selector: `[${name}="${cssEscape(value)}"]` };
    }
    return { path: nodePath(root, element) };
}

function resolveElement(root, reference) {
    if (!reference) return null;
    if (reference.selector) return root.querySelector(reference.selector);
    const node = resolveNodePath(root, reference.path);
    return node instanceof Element ? node : null;
}

function captureSelection(root) {
    const selection = document.getSelection?.();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    return {
        startPath: nodePath(root, range.startContainer),
        startOffset: range.startOffset,
        endPath: nodePath(root, range.endContainer),
        endOffset: range.endOffset
    };
}

function restoreSelection(root, snapshot) {
    if (!snapshot) return;
    const start = resolveNodePath(root, snapshot.startPath);
    const end = resolveNodePath(root, snapshot.endPath);
    if (!start || !end) return;
    try {
        const range = document.createRange();
        range.setStart(start, Math.min(snapshot.startOffset, start.length ?? start.childNodes.length));
        range.setEnd(end, Math.min(snapshot.endOffset, end.length ?? end.childNodes.length));
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    } catch {
        // A changing data row may no longer have the same text shape.
    }
}

function scrollableElements(root) {
    return [root, ...root.querySelectorAll('*')].filter((element) => (
        element instanceof HTMLElement
        && (element.scrollTop || element.scrollLeft || element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)
    ));
}

function scrollableAncestors(root) {
    const ancestors = [];
    for (let element = root.parentElement; element; element = element.parentElement) {
        if (element instanceof HTMLElement && (
            element.scrollTop
            || element.scrollLeft
            || element.scrollHeight > element.clientHeight + 1
            || element.scrollWidth > element.clientWidth + 1
        )) {
            ancestors.push(element);
        }
    }
    return ancestors;
}

function captureViewportAnchor() {
    if (!window.scrollY) return null;
    const x = Math.max(1, Math.min(window.innerWidth - 1, window.innerWidth / 2));
    const y = Math.max(1, Math.min(window.innerHeight - 1, window.innerHeight / 2));
    let element = document.elementFromPoint(x, y);
    // A fixed Chamber has its own scroll anchor. Moving one of its rows must
    // never compensate the underlying dashboard's saved window position.
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        if (getComputedStyle(ancestor).position === 'fixed') return null;
    }
    while (element && element !== document.body && !element.id && !element.parentElement?.matches('main, section, article')) {
        element = element.parentElement;
    }
    if (!element || element === document.documentElement) return null;
    return { element, top: element.getBoundingClientRect().top };
}

function setWindowScrollInstantly(left, top) {
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(left, top);
    html.style.scrollBehavior = previous;
}

let scrollAnchorHoldDepth = 0;
let previousScrollAnchor = '';

function holdNativeScrollAnchoring() {
    const html = document.documentElement;
    if (scrollAnchorHoldDepth === 0) previousScrollAnchor = html.style.overflowAnchor;
    scrollAnchorHoldDepth += 1;
    html.style.overflowAnchor = 'none';
}

function releaseNativeScrollAnchoring() {
    scrollAnchorHoldDepth = Math.max(0, scrollAnchorHoldDepth - 1);
    if (scrollAnchorHoldDepth === 0) {
        document.documentElement.style.overflowAnchor = previousScrollAnchor;
        previousScrollAnchor = '';
    }
}

function captureState(root) {
    const active = root.contains(document.activeElement) ? document.activeElement : null;
    const viewportAnchor = captureViewportAnchor();
    const rootRect = root.getBoundingClientRect();
    return {
        windowX: window.scrollX,
        windowY: window.scrollY,
        viewportAnchor,
        compensateViewportAnchor: rootRect.top < 0 && (
            rootRect.bottom <= 0
            || Boolean(viewportAnchor?.element && root.contains(viewportAnchor.element))
        ),
        active,
        activeLocator: elementLocator(root, active),
        controlSelection: active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
            ? {
                start: active.selectionStart,
                end: active.selectionEnd,
                direction: active.selectionDirection
            }
            : null,
        selection: captureSelection(root),
        disclosures: [...root.querySelectorAll('details[data-chamber-disclosure][data-quiet-key]')].map(element => ({ key: element.dataset.quietKey, open: element.open })),
        scrollers: [...new Set([...scrollableAncestors(root), ...scrollableElements(root)])].map((element) => ({
            element,
            locator: element === root ? null : elementLocator(root, element),
            top: element.scrollTop,
            left: element.scrollLeft
        }))
    };
}

function restoreState(root, state) {
    for (const disclosure of state.disclosures) {
        const element = root.querySelector(`details[data-chamber-disclosure][data-quiet-key="${CSS.escape(disclosure.key)}"]`);
        if (element) element.open = disclosure.open;
    }
    for (const scroll of state.scrollers) {
        const element = scroll.element?.isConnected
            ? scroll.element
            : scroll.locator
                ? resolveElement(root, scroll.locator)
                : root;
        if (!element) continue;
        element.scrollTop = scroll.top;
        element.scrollLeft = scroll.left;
    }
    if (!Number.isFinite(state.targetWindowY)) {
        const anchor = state.viewportAnchor?.element;
        const delta = anchor?.isConnected
            ? anchor.getBoundingClientRect().top - state.viewportAnchor.top
            : 0;
        // Compensate only when the mutation root began above the viewport and
        // can move the captured row. An in-view card keeps the exact page
        // position; a long feed spanning the viewport keeps the visible row.
        state.targetWindowY = state.compensateViewportAnchor
            ? state.windowY + delta
            : state.windowY;
    }
    setWindowScrollInstantly(state.windowX, state.targetWindowY);
    const focusTarget = state.active?.isConnected ? state.active : resolveElement(root, state.activeLocator);
    if (focusTarget instanceof HTMLElement && document.activeElement !== focusTarget) {
        focusTarget.focus({ preventScroll: true });
    }
    restoreSelection(root, state.selection);
    if ((focusTarget instanceof HTMLInputElement || focusTarget instanceof HTMLTextAreaElement)
        && state.controlSelection
        && Number.isInteger(state.controlSelection.start)
        && Number.isInteger(state.controlSelection.end)) {
        try {
            focusTarget.setSelectionRange(
                state.controlSelection.start,
                state.controlSelection.end,
                state.controlSelection.direction || 'none'
            );
        } catch {}
    }
}

/** Run a synchronous DOM mutation without moving the reader's viewport. */
export function quietlyMutate(root, mutate) {
    if (!(root instanceof Element) || typeof mutate !== 'function') return mutate?.();
    const state = captureState(root);
    holdNativeScrollAnchoring();
    root.dataset.quietRefreshing = 'true';
    let result;
    try {
        result = mutate();
        root.dataset.quietRefreshSettled = 'true';
        restoreState(root, state);
    } catch (error) {
        delete root.dataset.quietRefreshing;
        releaseNativeScrollAnchoring();
        throw error;
    }
    requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - state.targetWindowY) < 1 && Math.abs(window.scrollX - state.windowX) < 1) {
            setWindowScrollInstantly(state.windowX, state.targetWindowY);
        }
        delete root.dataset.quietRefreshing;
        releaseNativeScrollAnchoring();
    });
    return result;
}

/** Reconcile generated markup while retaining compatible live DOM nodes. */
export function quietlySyncHtml(root, html) {
    if (!(root instanceof Element)) return false;
    const template = document.createElement('template');
    template.innerHTML = String(html ?? '');
    quietlyMutate(root, () => syncChildren(root, template.content));
    return true;
}

/** Reconcile one rendered panel without replacing the panel element itself. */
export function quietlySyncElement(element, html) {
    if (!(element instanceof Element)) return false;
    const template = document.createElement('template');
    template.innerHTML = String(html ?? '').trim();
    const desired = template.content.firstElementChild;
    if (!desired || desired.tagName !== element.tagName) return false;
    quietlyMutate(element, () => syncNode(element, desired));
    return true;
}
