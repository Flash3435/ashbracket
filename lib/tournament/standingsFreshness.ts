/**
 * Heuristic: sample pool ledger `created_at` vs latest prediction update and latest
 * result resolution. Does not detect scoring_rules edits.
 */
export type StandingsFreshness = {
  lastLedgerAt: string | null;
  lastPredictionUpdateAt: string | null;
  lastResultResolvedAt: string | null;
  /** True when ledger exists and is at least as new as both input signals. */
  appearsCurrent: boolean;
  /** No ledger rows for this pool. */
  ledgerEmpty: boolean;
};

export function computeStandingsFreshness(input: {
  lastLedgerAt: string | null;
  lastPredictionUpdateAt: string | null;
  lastResultResolvedAt: string | null;
}): StandingsFreshness {
  const { lastLedgerAt, lastPredictionUpdateAt, lastResultResolvedAt } = input;
  const ledgerEmpty = lastLedgerAt == null;

  const pred = lastPredictionUpdateAt
    ? new Date(lastPredictionUpdateAt).getTime()
    : 0;
  const res = lastResultResolvedAt
    ? new Date(lastResultResolvedAt).getTime()
    : 0;
  const inputMax = Math.max(pred, res);

  if (ledgerEmpty) {
    return {
      lastLedgerAt,
      lastPredictionUpdateAt,
      lastResultResolvedAt,
      appearsCurrent: false,
      ledgerEmpty: true,
    };
  }

  const ledgerT = new Date(lastLedgerAt!).getTime();
  const appearsCurrent =
    !Number.isNaN(ledgerT) && ledgerT >= inputMax;

  return {
    lastLedgerAt,
    lastPredictionUpdateAt,
    lastResultResolvedAt,
    appearsCurrent,
    ledgerEmpty: false,
  };
}
