const IOS_DEVICE_PATTERN = /iPad|iPhone|iPod/;
const TEZ_GLYPH = 'ꜩ';
const IOS_TEZ_FALLBACK = 'tz';
const SKIPPED_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA']);

export function isIosDevice() {
    if (typeof navigator === 'undefined') return false;
    return IOS_DEVICE_PATTERN.test(navigator.userAgent || '')
        || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
}

function replaceTezGlyph(node) {
    if (node?.nodeType !== Node.TEXT_NODE || !node.nodeValue?.includes(TEZ_GLYPH)) return;
    if (SKIPPED_TEXT_PARENTS.has(node.parentElement?.tagName)) return;
    node.nodeValue = node.nodeValue.replaceAll(TEZ_GLYPH, IOS_TEZ_FALLBACK);
}

function replaceTezGlyphsWithin(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
        replaceTezGlyph(root);
        return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
        replaceTezGlyph(node);
        node = walker.nextNode();
    }
}

export function initPlatformTextFallbacks() {
    if (!isIosDevice() || !document.body || document.documentElement.dataset.iosTezFallback === 'true') return;
    document.documentElement.dataset.iosTezFallback = 'true';
    replaceTezGlyphsWithin(document.body);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'characterData') replaceTezGlyph(mutation.target);
            mutation.addedNodes.forEach(replaceTezGlyphsWithin);
        }
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
}
