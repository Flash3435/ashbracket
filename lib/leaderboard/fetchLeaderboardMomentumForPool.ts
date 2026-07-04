import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLeaderboardMomentum,
  type LeaderboardMomentumResult,
  type LeaderboardStandingsPointRow,
} from "./buildLeaderboardMomentum";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import {
  parsePreviousStandingsFromMetadata,
  validateLeaderboardMomentumSnapshot,
} from "./validateLeaderboardMomentumSnapshot";

function parseMomentumFromMetadata(
  metadata: Record<string, unknown>,
  currentRows: ReadonlyArray<LeaderboardPublicRow>,
): LeaderboardMomentumResult | null {
  const previousRows: LeaderboardStandingsPointRow[] | null =
    parsePreviousStandingsFromMetadata(metadata);
  if (!previousRows) return null;

  return buildLeaderboardMomentum({ currentRows, previousRows });
}

/**
 * Loads rank/points momentum from the latest score-impact activity for a pool.
 * Uses service role because pool_activity is member-scoped in RLS.
 */
export async function fetchLeaderboardMomentumForPool(
  supabase: SupabaseClient,
  poolId: string,
  currentRows: ReadonlyArray<LeaderboardPublicRow>,
): Promise<LeaderboardMomentumResult | null> {
  const { data, error } = await supabase
    .from("pool_activity")
    .select("metadata_json")
    .eq("pool_id", poolId)
    .eq("type", "ash_score_impact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.metadata_json || typeof data.metadata_json !== "object") {
    return null;
  }

  const metadata = data.metadata_json as Record<string, unknown>;
  const validation = validateLeaderboardMomentumSnapshot({
    metadata,
    currentRows,
  });
  if (!validation.valid) {
    console.warn("[ashbracket:leaderboard-momentum] ignoring invalid snapshot", {
      poolId,
      reason: validation.reason,
    });
    return { hasPreviousSnapshot: false, rows: [] };
  }

  return parseMomentumFromMetadata(metadata, currentRows);
}
