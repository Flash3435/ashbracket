import type { WcLedgerRecomputeTrigger } from "@/lib/scoring/recomputePoolLedger";

export const SCORE_IMPACT_LEDGER_TRIGGERS = new Set<WcLedgerRecomputeTrigger>([
  "tournament_sync",
  "admin_result_edit",
  "admin_manual_recompute",
  "admin_recompute_all_pools",
]);

export function isScoreImpactLedgerTrigger(
  trigger: WcLedgerRecomputeTrigger,
): trigger is WcLedgerRecomputeTrigger {
  return SCORE_IMPACT_LEDGER_TRIGGERS.has(trigger);
}

export function poolMatchesEditionSimulationScope(
  poolIsSimulation: boolean,
  editionIsSimulation: boolean | undefined,
): boolean {
  if (editionIsSimulation == null) return true;
  return poolIsSimulation === editionIsSimulation;
}
