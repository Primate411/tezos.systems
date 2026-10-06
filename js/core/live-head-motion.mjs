// Visibility catch-up is shared by primary and supplemental receipts. Local
// layout changes and old-head responses cannot consume the pending catch-up.
export function resolveLiveHeadMotion({ catchupPending, visible, previousLevel, level,
  supplemental = false, suppressMotion = false, error = false }) {
  const completedCatchup = visible && !supplemental && !suppressMotion && !error
    && Number(level) > Number(previousLevel);
  return {
    suppressMotion: Boolean(suppressMotion || catchupPending || !visible),
    catchupPending: Boolean(catchupPending && !completedCatchup)
  };
}
