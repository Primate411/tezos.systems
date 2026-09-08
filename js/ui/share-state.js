// Synchronous share metadata stays available without loading canvas rendering.
import { loadStats } from '../core/storage.js';

export const CARD_SHARE_ICON_SVG = '<svg class="card-share-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7.8 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.8L14.5 4Z"/><circle cx="12" cy="13" r="3.2"/></svg>';
const SHARE_UTM_CAMPAIGN = 'tezos_systems_shares';

function parseBlockLevel(value) {
    const parsed = Number(String(value || '').replace(/[^0-9]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getSealBlockLevel() {
    const cached = loadStats();
    const fromCache = parseBlockLevel(cached?.blockLevel);
    if (fromCache) return fromCache;
    return parseBlockLevel(document.getElementById('cycle-chip-block')?.textContent);
}

export function appendCardSeal(cardEl) {
    if (!cardEl) return null;
    cardEl.querySelector(':scope > .share-card-seal')?.remove();
    const blockLevel = getSealBlockLevel();
    const seal = document.createElement('div');
    seal.className = 'share-card-seal';
    seal.textContent = blockLevel
        ? `live from tezos.systems · block #${blockLevel.toLocaleString('en-US')}`
        : 'live from tezos.systems';
    if (getComputedStyle(cardEl).position === 'static') cardEl.style.position = 'relative';
    seal.style.cssText = `
        position:absolute;left:34px;right:34px;bottom:14px;z-index:5;
        padding:8px 0 0;border-top:1px solid rgba(255,255,255,0.08);
        color:rgba(255,255,255,0.45);font-size:11px;line-height:1.2;
        font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
        font-variant-numeric:tabular-nums;text-align:left;letter-spacing:0;
        pointer-events:none;
    `;
    cardEl.appendChild(seal);
    return seal;
}

export function shareSlug(value) {
    return String(value || 'share')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'share';
}

function shareAttribution(channel) {
    if (channel === 'x') return { source: 'x', medium: 'social' };
    if (channel === 'native_share') return { source: 'native_share', medium: 'share' };
    return { source: shareSlug(channel || 'direct_share'), medium: 'share' };
}

export function trackedTezosUrl(raw = 'https://tezos.systems/', context = 'share', channel = 'direct_share') {
    try {
        const url = new URL(String(raw).startsWith('http') ? raw : `https://${raw}`);
        if (url.hostname !== 'tezos.systems') return raw;
        const attribution = shareAttribution(channel);
        url.searchParams.set('utm_source', attribution.source);
        url.searchParams.set('utm_medium', attribution.medium);
        url.searchParams.set('utm_campaign', SHARE_UTM_CAMPAIGN);
        url.searchParams.set('utm_content', shareSlug(context));
        return url.toString();
    } catch (_) {
        return raw;
    }
}

export let liveShareAPY = { delegateAPY: null, bakerAPY: null };
export function setLiveAPY(delegateAPY, bakerAPY) {
    liveShareAPY = { delegateAPY, bakerAPY };
}
