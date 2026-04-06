import { createClient } from "@/lib/supabase/server";
import { SAMPLE_POOL_ID } from "../config/sample-pool";
import { solePublicPoolIdFromScoringView } from "../pools/solePublicPoolIdFromScoringView";
import { fetchPoolPublicStats, type PoolPublicStats } from "./fetchPoolPublicStats";

/**
 * Resolves the same public pool id as the home leaderboard when possible, then
 * loads `pool_public_stats` for that pool.
 */
export async function fetchSamplePoolPublicStats(): Promise<{
  stats: PoolPublicStats | null;
  poolLabel: string;
  error: string | null;
}> {
  const supabase = await createClient();
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

  const { stats, error } = await fetchPoolPublicStats(poolId);
  return { stats, poolLabel, error };
}
