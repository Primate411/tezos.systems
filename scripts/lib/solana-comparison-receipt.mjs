// Require the reviewed current-consensus statement and development badge.
// When the source publishes cluster activation status, it must agree as well.
// Planned Alpenglow finality and reduced slot times must never become live facts.
export function readSolanaTowerReceipt(text) {
  const hasActivationTable = /\bCurrent feature gate activation status:/i.test(text);
  const mainnetStatus = text.match(/\bCurrent feature gate activation status:\s+Cluster Activation status\s+Testnet\s+(?:Active|Not activated)\s+Devnet\s+(?:Active|Not activated)\s+Mainnet\s+(Not activated|Active)\b/i)?.[1];
  const mainnetInactive = mainnetStatus?.toLowerCase() === 'not activated';
  const revised = /\bIn Development\b/i.test(text) && /Today that job belongs to TowerBFT\b/i.test(text);
  const current = /\bIn Development\b/i.test(text)
    && /Solana['’]s current consensus,\s*TowerBFT\b/i.test(text)
    && mainnetInactive;
  if ((hasActivationTable && !mainnetInactive)
      || (!current && !revised && !/\bUnder Development\b/i.test(text))) {
    throw new Error('Solana Alpenglow phase is no longer unambiguously under development; review mainnet activation before publishing');
  }
  const slot = text.match(current
    ? /Block time is being cut separately[^.]*from\s+([\d.]+)ms\s+to/i
    : revised
    ? /Slot time is being cut separately[^.]*from\s+([\d.]+)ms\s+to/i
    : /current roughly\s+([\d.]+)ms\s+pre-confirmation latency/i);
  const finality = text.match(current
    ? /Today that takes about\s+([\d.]+)\s+seconds\.\s+Alpenglow targets/i
    : revised
    ? /votes have stacked up over\s+[\d.]+\s+slots, about\s+([\d.]+)\s+seconds/i
    : /([\d.]+)-second TowerBFT finality/i);
  const slotMs = Number(slot?.[1]);
  const finalitySeconds = Number(finality?.[1]);
  if (!Number.isFinite(slotMs) || slotMs <= 0 || !Number.isFinite(finalitySeconds) || finalitySeconds <= 0) {
    throw new Error('Solana current TowerBFT timing is missing from the source');
  }
  return { slotMs, finalitySeconds };
}
