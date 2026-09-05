const CONTRACT_REGISTRY_URL = new URL('../../data/my-tezos-contracts.json', import.meta.url);

let registryPromise = null;

function normalizeRule(rule, layer) {
    const address = String(rule?.address || '').trim();
    if (!address) return null;
    return {
        layer,
        address: layer === 'l2' ? address.toLowerCase() : address,
        label: String(rule?.label || rule?.name || address),
        kind: String(rule?.kind || ''),
        entrypoints: Array.isArray(rule?.entrypoints)
            ? rule.entrypoints.map((entrypoint) => String(entrypoint).toLowerCase())
            : [],
        sourceUrl: String(rule?.sourceUrl || '')
    };
}

export async function loadMyTezosContractRegistry() {
    if (!registryPromise) {
        registryPromise = fetch(CONTRACT_REGISTRY_URL, { cache: 'no-cache' })
            .then((response) => {
                if (!response.ok) throw new Error(`Contract registry unavailable: ${response.status}`);
                return response.json();
            })
            .then((payload) => ({
                schema: payload?.schema || '',
                l1: (payload?.tezosL1?.recognizedDexes || []).map((rule) => normalizeRule(rule, 'l1')).filter(Boolean),
                l2: (payload?.etherlink?.recognizedContracts || []).map((rule) => normalizeRule(rule, 'l2')).filter(Boolean)
            }))
            .catch(() => {
                registryPromise = null;
                return { schema: '', l1: [], l2: [] };
            });
    }
    return registryPromise;
}

export function findMyTezosContractRule(registry, layer, address) {
    const normalized = layer === 'l2'
        ? String(address || '').toLowerCase()
        : String(address || '');
    return (layer === 'l2' ? registry?.l2 : registry?.l1)?.find((rule) => rule.address === normalized) || null;
}

export function resetMyTezosContractRegistryForTests() {
    registryPromise = null;
}
