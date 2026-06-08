import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Active participant rows per pool (one query; aggregate in memory).
 * Rows removed from `participants` are not counted. Invited/manual rows remain.
 */
export async function fetchParticipantCountsByPoolId(
  supabase: SupabaseClient,
  poolIds: string[],
): Promise<{ countsByPoolId: Map<string, number>; error: string | null }> {
  const countsByPoolId = new Map<string, number>();
  for (const id of poolIds) {
    countsByPoolId.set(id, 0);
  }
  if (poolIds.length === 0) {
    return { countsByPoolId, error: null };
  }

  const { data, error } = await supabase
    .from("participants")
    .select("pool_id")
    .in("pool_id", poolIds);

  if (error) {
    return { countsByPoolId, error: error.message };
  }

  for (const row of data ?? []) {
    const poolId = row.pool_id as string;
    countsByPoolId.set(poolId, (countsByPoolId.get(poolId) ?? 0) + 1);
  }

  return { countsByPoolId, error: null };
}
