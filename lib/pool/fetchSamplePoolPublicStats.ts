import { createClient } from "@/lib/supabase/server";
import { fetchPoolPublicStats, type PoolPublicStats } from "./fetchPoolPublicStats";
import type { ResolvedHomePublicPool } from "./resolveHomePublicPool";
import { resolveHomePublicPool } from "./resolveHomePublicPool";

/**
 * Loads pool stats for the home public pool (RPC with leaderboard fallback).
 */
export async function fetchSamplePoolPublicStats(
  resolved?: ResolvedHomePublicPool,
): Promise<{
  stats: PoolPublicStats | null;
  poolLabel: string;
  error: string | null;
}> {
  const supabase = await createClient();
  const { poolId, poolLabel } = resolved ?? (await resolveHomePublicPool(supabase));
  const { stats, error } = await fetchPoolPublicStats(supabase, poolId);
  return { stats, poolLabel, error };
}
