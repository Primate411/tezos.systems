import assert from 'node:assert/strict';

// Public REST pages have explicit continuation receipts, unlike capped CSV
// exports. Walk newest-first to the fixed lower boundary; never infer that a
// short page is complete without its null continuation receipt.
export async function fetchBlockscoutHistory(address, from, to, requestJson) {
  assert(/^0x[\da-f]{40}$/i.test(address), 'Invalid Etherlink address');
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  assert(Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs < toMs, 'Invalid Etherlink history range');
  const endpoint = `https://explorer.etherlink.com/api/v2/addresses/${address}/transactions`;
  const rows = [];
  const cursors = new Set();
  const hashes = new Set();
  let query = new URLSearchParams({ filter: 'to' });
  let previous = [Infinity, Infinity];
  let previousTime = Infinity;
  for (let page = 0; page < 20_000; page += 1) {
    const payload = await requestJson(`${endpoint}?${query}`);
    assert(Array.isArray(payload?.items) && Object.hasOwn(payload, 'next_page_params'), 'Incomplete Blockscout REST page');
    let crossedBoundary = false;
    for (const item of payload.items) {
      // Pending transactions are not confirmed activity and cannot terminate
      // the scan. Any malformed confirmed receipt fails the entire lane.
      if (item.block_number == null) {
        assert(item.status === null && item.timestamp === null, 'Invalid pending Blockscout transaction');
        continue;
      }
      const block = item.block_number;
      const position = item.position;
      const timestamp = Date.parse(item.timestamp);
      assert(Number.isSafeInteger(block) && block >= 0 && Number.isSafeInteger(position) && position >= 0
        && Number.isFinite(timestamp), 'Invalid Blockscout transaction position or time');
      assert(block < previous[0] || (block === previous[0] && position < previous[1]), 'Blockscout history order did not advance');
      assert(timestamp <= previousTime, 'Blockscout history time moved forward');
      previous = [block, position];
      previousTime = timestamp;
      assert(/^0x[\da-f]{64}$/i.test(item.hash) && !hashes.has(item.hash.toLowerCase()), 'Invalid or duplicate Blockscout transaction hash');
      hashes.add(item.hash.toLowerCase());
      const creation = item.to === null && item.created_contract?.hash?.toLowerCase() === address.toLowerCase();
      assert(/^0x[\da-f]{40}$/i.test(item.from?.hash) && (creation || item.to?.hash?.toLowerCase() === address.toLowerCase()), 'Invalid Blockscout inbound transaction identity');
      assert(['ok', 'error'].includes(item.status), 'Unknown Blockscout transaction status');
      if (timestamp < fromMs) { crossedBoundary = true; continue; }
      if (creation) continue;
      if (timestamp >= toMs) continue;
      rows.push({ timestamp, from: item.from.hash, to: item.to.hash, hash: item.hash,
        isError: item.status === 'ok' ? '0' : '1', txreceipt_status: item.status === 'ok' ? '1' : '0' });
    }
    if (crossedBoundary || payload.next_page_params === null) return rows;
    const next = payload.next_page_params;
    assert(next && typeof next === 'object' && !Array.isArray(next) && Object.keys(next).length, 'Invalid Blockscout continuation');
    assert(payload.items.length > 0, 'Empty Blockscout page with continuation');
    const allowed = new Set(['block_number', 'index', 'items_count', 'hash', 'inserted_at', 'filter', 'value', 'fee']);
    assert(Object.entries(next).every(([key, value]) => allowed.has(key) && ['string', 'number'].includes(typeof value)), 'Unexpected Blockscout continuation field');
    assert(next.filter === undefined || next.filter === 'to', 'Blockscout continuation changed direction');
    query = new URLSearchParams({ ...next, filter: 'to' });
    query.sort();
    assert(!cursors.has(query.toString()), 'Blockscout continuation did not advance');
    cursors.add(query.toString());
  }
  throw new Error('Blockscout history exceeded its page budget; last-good data retained');
}
