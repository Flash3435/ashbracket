import { createClient } from "@/lib/supabase/server";
import type { LeaderboardPublicRow } from "@/types/domain";
import type { LeaderboardPublicRowDb } from "@/types/leaderboard";
import { mapPublicLeaderboardRow } from "./publicLeaderboard";

/**
 * Loads one participant row from `leaderboard_public` (same source as the homepage).
 * Returns null when the id is absent or the pool is not public — no PII beyond display name.
 */
export async function fetchPublicParticipantById(
  participantId: string,
): Promise<{ participant: LeaderboardPublicRow | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leaderboard_public")
    .select("pool_id, pool_name, participant_id, display_name, total_points, rank")
    .eq("participant_id", participantId)
    .maybeSingle();

  if (error) {
    return { participant: null, error: error.message };
  }
  if (!data) {
    return { participant: null, error: null };
  }

  return {
    participant: mapPublicLeaderboardRow(data as LeaderboardPublicRowDb),
    error: null,
  };
}
