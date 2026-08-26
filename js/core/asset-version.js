/**
 * Shared cache stamp for first-party runtime assets.
 *
 * HTML and the service worker are checked against this value in CI. Runtime
 * modules should use versionedAsset() instead of carrying private ?v= stamps.
 */
export const ASSET_VERSION = '593';

export function versionedAsset(pathname) {
    const path = String(pathname || '');
    if (!path.startsWith('/') || path.includes('?')) {
        throw new TypeError(`versionedAsset expects an unversioned root path, received: ${path}`);
    }
    return `${path}?v=${ASSET_VERSION}`;
}
