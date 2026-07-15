/**
 * Temporary ops freeze for live score sync / standings recompute while the
 * duplicate-knockout-ledger repair is in progress.
 *
 * Override (ops only): set ASHBRACKET_ALLOW_LIVE_SCORE_SYNC=1 to bypass.
 * After repair + idempotency checks, set LIVE_SCORE_SYNC_AND_RECOMPUTE_FROZEN = false
 * and redeploy.
 */
export const LIVE_SCORE_SYNC_AND_RECOMPUTE_FROZEN = true;

export const LIVE_SCORE_SYNC_FREEZE_MESSAGE =
  "Live score sync and standings recompute are temporarily frozen while the duplicate knockout ledger repair is running. Do not sync or recompute until ops clears the freeze.";

export function isLiveScoreSyncAndRecomputeFrozen(): boolean {
  if (process.env.ASHBRACKET_ALLOW_LIVE_SCORE_SYNC === "1") return false;
  return LIVE_SCORE_SYNC_AND_RECOMPUTE_FROZEN;
}

export function refuseIfLiveScoreSyncFrozen():
  | { ok: true }
  | { ok: false; error: string } {
  if (isLiveScoreSyncAndRecomputeFrozen()) {
    return { ok: false, error: LIVE_SCORE_SYNC_FREEZE_MESSAGE };
  }
  return { ok: true };
}
