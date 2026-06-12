import type { SupabaseClient } from "@supabase/supabase-js";
import { SAMPLE_POOL_ID } from "../config/sample-pool";
import { solePublicPoolIdFromScoringView } from "../pools/solePublicPoolIdFromScoringView";
import {
  loadActiveLiveWc2026PublicRulesPoolCandidates,
  pickActivePublicRulesPoolId,
} from "./selectActivePublicRulesPool";

export type PublicRulesPoolResolution =
  | { poolId: string; source: "configured_sample" }
  | { poolId: string; source: "active_live_wc2026" }
  | { poolId: string; source: "sole_public_rules_pool" };

/**
 * Pool whose rules /rules should show.
 *
 * Prefers an active live `fifa_wc_2026` pool with public rules and scoring rows
 * (configured sample when eligible, otherwise the stable first active pool).
 * Falls back to legacy sole-public-pool behavior when no live candidate exists.
 */
export async function resolvePublicRulesPoolId(
  supabase: SupabaseClient,
): Promise<PublicRulesPoolResolution> {
  const liveCandidates =
    await loadActiveLiveWc2026PublicRulesPoolCandidates(supabase);
  const livePick = pickActivePublicRulesPoolId(SAMPLE_POOL_ID, liveCandidates);
  if (livePick) {
    return livePick;
  }

  let poolId = SAMPLE_POOL_ID;

  const { count, error } = await supabase
    .from("scoring_rules_public")
    .select("pool_id", { count: "exact", head: true })
    .eq("pool_id", poolId);

  if (!error && (count ?? 0) === 0) {
    const sole = await solePublicPoolIdFromScoringView(supabase);
    if (sole) {
      return { poolId: sole, source: "sole_public_rules_pool" };
    }
  }

  return { poolId, source: "configured_sample" };
}
