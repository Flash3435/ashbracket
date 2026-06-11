import type { SupabaseClient } from "@supabase/supabase-js";
import type { WcLedgerRecomputeTrigger } from "@/lib/scoring/recomputePoolLedger";
import { recomputePoolLedgersWithScoreImpact } from "@/lib/poolActivity/scoreImpact/recomputeWithScoreImpact";
import type { ScoreImpactRunContext } from "@/lib/poolActivity/scoreImpact/types";
import { poolIdsForEdition } from "./editionScope";

/**
 * Recompute ledgers for every pool bound to the given tournament edition.
 */
export async function recomputePoolsForEdition(
  supabase: SupabaseClient,
  editionId: string,
  trigger: WcLedgerRecomputeTrigger,
  options?: {
    scoreImpactContext?: ScoreImpactRunContext;
    editionIsSimulation?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const poolIds = await poolIdsForEdition(supabase, editionId);
  return recomputePoolLedgersWithScoreImpact(
    supabase,
    poolIds,
    trigger,
    { editionId, ...options?.scoreImpactContext },
    { editionIsSimulation: options?.editionIsSimulation },
  );
}
