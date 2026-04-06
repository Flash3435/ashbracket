import type { SupabaseClient } from "@supabase/supabase-js";
import { SAMPLE_POOL_ID } from "../config/sample-pool";
import { solePublicPoolIdFromScoringView } from "../pools/solePublicPoolIdFromScoringView";

export type ResolvedHomePublicPool = {
  poolId: string;
  poolLabel: string;
};

/**
 * Same public pool as the home leaderboard: configured sample id, or the sole
 * public pool from scoring rules when the sample id has no rows.
 */
export async function resolveHomePublicPool(
  supabase: SupabaseClient,
): Promise<ResolvedHomePublicPool> {
  let poolId = SAMPLE_POOL_ID;

  const { data: firstName } = await supabase
    .from("leaderboard_public")
    .select("pool_name")
    .eq("pool_id", poolId)
    .limit(1)
    .maybeSingle();

  if (!firstName) {
    const sole = await solePublicPoolIdFromScoringView(supabase);
    if (sole) poolId = sole;
  }

  const { data: labelRow } = await supabase
    .from("leaderboard_public")
    .select("pool_name")
    .eq("pool_id", poolId)
    .limit(1)
    .maybeSingle();

  const poolLabel =
    (labelRow?.pool_name as string | undefined)?.trim() || "Sample pool";

  return { poolId, poolLabel };
}
