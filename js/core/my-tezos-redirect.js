import { parseMyTezosPathRoute } from './site-map.js';

// GitHub Pages serves 404.html for dynamic address paths. Load the real My
// Tezos shell, which restores this validated path before opening the account.
const route = parseMyTezosPathRoute(location.pathname);
if (route) {
    const params = new URLSearchParams(location.search);
    params.set('account-route', route.path);
    params.delete('view');
    location.replace(`/my/?${params}${location.hash}`);
}
