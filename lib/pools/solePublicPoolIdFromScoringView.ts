import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * If `scoring_rules_public` rows all belong to exactly one pool, returns that
 * `pool_id`. Used when `NEXT_PUBLIC_SAMPLE_POOL_ID` still points at the local
 * seed but production only has a different public pool.
 */
export async function solePublicPoolIdFromScoringView(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("scoring_rules_public")
    .select("pool_id")
    .limit(500);

  if (error || !data?.length) return null;
  const ids = [...new Set(data.map((r) => r.pool_id as string))];
  return ids.length === 1 ? ids[0]! : null;
}
