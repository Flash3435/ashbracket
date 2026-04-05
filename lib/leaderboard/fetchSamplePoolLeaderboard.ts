import { createClient } from "@/lib/supabase/server";
import { SAMPLE_POOL_ID } from "../config/sample-pool";
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
    const { data, error } = await supabase
      .from("leaderboard_public")
      .select(
        "pool_id, pool_name, participant_id, display_name, total_points, rank",
      )
      .eq("pool_id", SAMPLE_POOL_ID)
      .order("rank", { ascending: true });

    if (error) {
      return { sections: [], error: error.message };
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
