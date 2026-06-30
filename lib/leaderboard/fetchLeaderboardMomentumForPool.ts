import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLeaderboardMomentum,
  type LeaderboardMomentumResult,
  type LeaderboardStandingsPointRow,
} from "./buildLeaderboardMomentum";
import type { LeaderboardPublicRow } from "../../types/leaderboard";

type MomentumMetadataRow = {
  participant_id?: unknown;
  previous_rank?: unknown;
  previous_points?: unknown;
  rank_change?: unknown;
  points_gained?: unknown;
  is_new_entry?: unknown;
};

function readNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parsePreviousRowsFromMetadata(
  metadata: Record<string, unknown>,
): LeaderboardStandingsPointRow[] | null {
  const raw = metadata.previous_standings;
  if (!Array.isArray(raw)) return null;

  const rows: LeaderboardStandingsPointRow[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const participantId = readString((item as { participant_id?: unknown }).participant_id);
    const totalPoints = readNumber((item as { total_points?: unknown }).total_points);
    if (!participantId || totalPoints == null) continue;
    rows.push({ participantId, totalPoints });
  }

  return rows.length > 0 ? rows : null;
}

function parseMomentumFromMetadata(
  metadata: Record<string, unknown>,
  currentRows: ReadonlyArray<LeaderboardPublicRow>,
): LeaderboardMomentumResult | null {
  if (metadata.has_previous_snapshot !== true) {
    const previousRows = parsePreviousRowsFromMetadata(metadata);
    if (!previousRows) return null;
    return buildLeaderboardMomentum({ currentRows, previousRows });
  }

  const raw = metadata.leaderboard_momentum;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const rows = raw
    .map((item) => {
      if (item == null || typeof item !== "object") return null;
      const row = item as MomentumMetadataRow;
      const participantId = readString(row.participant_id);
      if (!participantId) return null;

      const current = currentRows.find((r) => r.participantId === participantId);
      if (!current) return null;

      const isNewEntry = row.is_new_entry === true;
      const previousRank = readNumber(row.previous_rank);
      const previousPoints = readNumber(row.previous_points);
      const rankChange = readNumber(row.rank_change) ?? 0;
      const pointsGained = readNumber(row.points_gained) ?? 0;

      return {
        participantId,
        previousRank: isNewEntry ? null : previousRank,
        currentRank: current.rank,
        rankChange: isNewEntry ? 0 : rankChange,
        previousPoints: isNewEntry ? null : previousPoints,
        currentPoints: current.totalPoints,
        recentPointsGained: Math.max(0, pointsGained),
        isNewEntry,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  if (rows.length === 0) return null;
  return { hasPreviousSnapshot: true, rows };
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

  return parseMomentumFromMetadata(data.metadata_json as Record<string, unknown>, currentRows);
}
