import type { Prediction, PredictionKind, Result, ScoringRule } from "../../types/domain";

/** Everything needed to score one pool (pure data; load from Supabase upstream). */
export interface PoolScoringInput {
  poolId: string;
  predictions: Prediction[];
  /** Tournament rows; same for every pool — matching is by slot, not pool. */
  results: Result[];
  scoringRules: ScoringRule[];
}

/**
 * Synthetic ledger line for idempotent recomputation (no DB ids / timestamps).
 * Map into `points_ledger` when persisting.
 */
export interface ComputedLedgerLine {
  poolId: string;
  participantId: string;
  pointsDelta: number;
  predictionKind: PredictionKind;
  predictionId: string;
  resultId: string;
  note: string;
}

export interface ScoringOutcome {
  poolId: string;
  /** Sum of `pointsDelta` per participant (only participants who earned points appear). */
  totalsByParticipantId: Record<string, number>;
  /** Sorted for stable output across runs. */
  ledgerLines: ComputedLedgerLine[];
}
