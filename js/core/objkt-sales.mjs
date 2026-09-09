const OBJKT_GRAPHQL_URL = 'https://data.objkt.com/v3/graphql';
const PAGE_SIZE = 500;
const QUERY = `
  query LivePulseObjktSales($where: listing_sale_bool_exp!, $window: listing_sale_bool_exp!, $limit: Int!, $includeTop: Boolean!) {
    recent: listing_sale(where: $where, order_by: { id: desc }, limit: $limit) { id }
    top: listing_sale(where: $window, order_by: [{ price_xtz: desc }, { id: desc }], limit: 1) @include(if: $includeTop) {
      id timestamp price_xtz amount ophash
      token { name fa_contract token_id }
    }
  }
`;

function saleId(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const text = String(value ?? '');
  return /^\d+$/.test(text) ? BigInt(text) : null;
}

// OBJKT caps each response at 500 rows. Descending IDs avoid offset drift and
// timestamp ties; both queries retain the exact same trailing-day boundaries.
// Only a terminal short page proves completeness. Failure keeps the old signal.
export async function fetchNftPulse({
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  timeoutMs = 15_000,
  pageDelayMs = 550,
  shouldContinue = () => true
} = {}) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  const window = { timestamp: {
    _gte: new Date(now - 86_400_000).toISOString(),
    _lt: new Date(now).toISOString()
  } };
  let beforeId = null;
  let count = 0;
  let top = null;
  try {
    while (!controller.signal.aborted && shouldContinue()) {
      const response = await fetchImpl(OBJKT_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ query: QUERY, variables: {
          window,
          where: beforeId === null ? window : { ...window, id: { _lt: String(beforeId) } },
          limit: PAGE_SIZE,
          includeTop: beforeId === null
        } })
      });
      if (!response.ok) return null;
      const payload = await response.json();
      if (controller.signal.aborted || payload.errors?.length) return null;
      const rows = payload.data?.recent;
      if (!Array.isArray(rows) || rows.length > PAGE_SIZE) return null;
      if (beforeId === null) {
        if (!Array.isArray(payload.data?.top)) return null;
        top = payload.data.top[0] || null;
      }
      for (const row of rows) {
        const id = saleId(row?.id);
        if (id === null || (beforeId !== null && id >= beforeId)) return null;
        beforeId = id;
      }
      count += rows.length;
      if (rows.length < PAGE_SIZE) {
        return {
          count,
          top: top ? {
            id: top.id,
            timestamp: top.timestamp,
            priceXtz: (Number(top.price_xtz) || 0) / 1e6,
            amount: Number(top.amount) || 1,
            name: top.token?.name || 'OBJKT piece',
            contract: top.token?.fa_contract || '',
            tokenId: top.token?.token_id || '',
            ophash: top.ophash || ''
          } : null
        };
      }
      // Stay below the public API's 120-request/minute limit during a scan.
      await new Promise(resolve => setTimeout(resolve, pageDelayMs));
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
  }
}
