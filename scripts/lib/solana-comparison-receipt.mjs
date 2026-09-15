// The Foundation revised this page in September 2026. Require its explicit
// current-consensus statement as well as the development badge for the new copy.
// Planned Alpenglow finality and reduced slot times must never become live facts.
export function readSolanaTowerReceipt(text) {
  const revised = /\bIn Development\b/i.test(text) && /Today that job belongs to TowerBFT\b/i.test(text);
  if (!revised && !/\bUnder Development\b/i.test(text)) {
    throw new Error('Solana Alpenglow phase is no longer unambiguously under development; review mainnet activation before publishing');
  }
  const slot = text.match(revised
    ? /Slot time is being cut separately[^.]*from\s+([\d.]+)ms\s+to/i
    : /current roughly\s+([\d.]+)ms\s+pre-confirmation latency/i);
  const finality = text.match(revised
    ? /votes have stacked up over\s+[\d.]+\s+slots, about\s+([\d.]+)\s+seconds/i
    : /([\d.]+)-second TowerBFT finality/i);
  const slotMs = Number(slot?.[1]);
  const finalitySeconds = Number(finality?.[1]);
  if (!Number.isFinite(slotMs) || slotMs <= 0 || !Number.isFinite(finalitySeconds) || finalitySeconds <= 0) {
    throw new Error('Solana current TowerBFT timing is missing from the source');
  }
  return { slotMs, finalitySeconds };
}
