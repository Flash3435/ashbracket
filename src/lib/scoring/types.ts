import type { Prediction, PredictionKind, Result, ScoringRule } from "../../types/domain";

/** Group-stage exact-slot vs wrong-slot scoring (from `pools` + `tournament_stages.code = group`). */
export type GroupStageScoringConfig = {
  groupStageId: string;
  exactPoints: number;
  wrongSlotPoints: number;
};

/** Everything needed to score one pool (pure data; load from Supabase upstream). */
export interface PoolScoringInput {
  poolId: string;
  predictions: Prediction[];
  /** Tournament rows; same for every pool — matching is by slot, not pool. */
  results: Result[];
  scoringRules: ScoringRule[];
  /** When set, `group_winner` / `group_runner_up` picks use these points instead of `scoring_rules`. */
  groupStageScoring?: GroupStageScoringConfig | null;
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
