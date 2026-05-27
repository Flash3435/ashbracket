import type { SupabaseClient } from "@supabase/supabase-js";
import { SAMPLE_POOL_ID } from "../config/sample-pool";
import { solePublicPoolIdFromScoringView } from "../pools/solePublicPoolIdFromScoringView";

export type PublicRulesPoolResolution =
  | { poolId: string; source: "configured_sample" }
  | { poolId: string; source: "sole_public_rules_pool" };

/**
 * Pool whose rules /rules should show: configured sample id when it has public
 * scoring rows, otherwise the sole pool in `scoring_rules_public`.
 *
 * Matches `resolveHomePublicPool` fallback so rules and leaderboard target the
 * same production pool when `NEXT_PUBLIC_SAMPLE_POOL_ID` is stale.
 */
export async function resolvePublicRulesPoolId(
  supabase: SupabaseClient,
): Promise<PublicRulesPoolResolution> {
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
