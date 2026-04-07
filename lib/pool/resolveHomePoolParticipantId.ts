import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Participant profile id for the signed-in user in the home leaderboard pool, if any.
 * Used to gate pool-scoped surfaces (e.g. Recent activity on Home) without exposing other pools.
 */
export async function resolveHomePoolParticipantId(
  supabase: SupabaseClient,
  userId: string,
  homePoolId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("participants")
    .select("id")
    .eq("user_id", userId)
    .eq("pool_id", homePoolId)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}
