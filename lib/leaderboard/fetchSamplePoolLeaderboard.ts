import { createClient } from "@/lib/supabase/server";
import { SAMPLE_POOL_ID } from "../config/sample-pool";
import { solePublicPoolIdFromScoringView } from "../pools/solePublicPoolIdFromScoringView";
import type {
  LeaderboardPublicRowDb,
  PublicLeaderboardPoolSection,
} from "../../types/leaderboard";
import {
  groupPublicLeaderboardByPool,
  mapPublicLeaderboardRow,
} from "./publicLeaderboard";

/**
 * Loads `leaderboard_public` rows for the configured sample pool only.
 * Uses the Supabase view (safe columns; no email / payment / notes).
 */
export async function fetchSamplePoolLeaderboard(): Promise<{
  sections: PublicLeaderboardPoolSection[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    let poolId = SAMPLE_POOL_ID;
    const first = await supabase
      .from("leaderboard_public")
      .select(
        "pool_id, pool_name, participant_id, display_name, total_points, rank",
      )
      .eq("pool_id", poolId)
      .order("rank", { ascending: true });

    if (first.error) {
      return { sections: [], error: first.error.message };
    }

    let data = first.data;

    if (!(data ?? []).length) {
      const sole = await solePublicPoolIdFromScoringView(supabase);
      if (sole && sole !== SAMPLE_POOL_ID) {
        poolId = sole;
        const second = await supabase
          .from("leaderboard_public")
          .select(
            "pool_id, pool_name, participant_id, display_name, total_points, rank",
          )
          .eq("pool_id", poolId)
          .order("rank", { ascending: true });
        if (second.error) {
          return { sections: [], error: second.error.message };
        }
        data = second.data;
      }
    }

    const rows = (data ?? []).map((row) =>
      mapPublicLeaderboardRow(row as LeaderboardPublicRowDb),
    );
    const sections = groupPublicLeaderboardByPool(rows);
    return { sections, error: null };
  } catch (e) {
    return {
      sections: [],
      error:
        e instanceof Error ? e.message : "Failed to load the leaderboard.",
    };
  }
}
