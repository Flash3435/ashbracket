import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import type { PoolStandingsLedgerLine } from "./buildPoolStandingsFromLedger";

/** True when at least one participant has awarded points (> 0) from the ledger. */
export function poolLeaderboardIsActiveFromRows(rows: LeaderboardPublicRow[]): boolean {
  return rows.some((row) => row.totalPoints > 0);
}

/** True when the ledger contains any non-zero points_delta for the pool. */
export function poolLeaderboardIsActiveFromLedgerLines(
  lines: PoolStandingsLedgerLine[],
): boolean {
  return lines.some((line) => Number(line.points_delta ?? 0) !== 0);
}

/**
 * Server check: pool has at least one awarded point in points_ledger.
 * Uses service role for consistent public/private pool reads.
 */
export async function fetchPoolHasAwardedLeaderboardPoints(
  poolId: string,
  _options?: { supabase?: SupabaseClient },
): Promise<boolean> {
  const trimmed = poolId.trim();
  if (!trimmed) return false;

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("points_ledger")
    .select("points_delta")
    .eq("pool_id", trimmed)
    .neq("points_delta", 0)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }
  return (data?.length ?? 0) > 0;
}

export const LEADERBOARD_PENDING_NAV_NOTE =
  "Leaderboard will appear once the first official pool points are awarded.";

export const LEADERBOARD_WAITING_HEADLINE =
  "Standings are waiting for the first awarded points";

export const LEADERBOARD_WAITING_BODY =
  "Everyone is still at 0 because no official pool points have landed yet. Group-stage advancement points are awarded after each group is complete. Once points are awarded, this page will show the leaders, rank changes, and each participant's scoring breakdown.";
