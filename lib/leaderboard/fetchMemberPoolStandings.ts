import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { buildPoolStandingsFromLedger } from "./buildPoolStandingsFromLedger";
import type { LeaderboardPublicRow } from "../../types/leaderboard";

export type FetchMemberPoolStandingsResult =
  | { ok: true; rows: LeaderboardPublicRow[]; poolName: string }
  | { ok: false; error: string };

/**
 * Loads pool standings from points_ledger for an authenticated pool member.
 * Uses service role after membership is verified (private pools are not in leaderboard_public).
 */
export async function fetchMemberPoolStandings(
  poolId: string,
  viewerUserId: string,
  options?: { supabase?: SupabaseClient },
): Promise<FetchMemberPoolStandingsResult> {
  const trimmedPoolId = poolId.trim();
  if (!trimmedPoolId) {
    return { ok: false, error: "Pool not found." };
  }

  const supabase = options?.supabase ?? (await createClient());
  const { data: membership, error: memErr } = await supabase
    .from("participants")
    .select("id")
    .eq("pool_id", trimmedPoolId)
    .eq("user_id", viewerUserId)
    .maybeSingle();

  if (memErr) {
    return { ok: false, error: memErr.message };
  }
  if (!membership?.id) {
    return { ok: false, error: "You are not a member of this pool." };
  }

  const service = createServiceRoleClient();
  const [
    { data: poolRow, error: poolErr },
    { data: participants, error: pErr },
    { data: ledger, error: lErr },
  ] = await Promise.all([
    service
      .from("pools")
      .select("id, name")
      .eq("id", trimmedPoolId)
      .maybeSingle(),
    service
      .from("participants")
      .select("id, display_name")
      .eq("pool_id", trimmedPoolId),
    service
      .from("points_ledger")
      .select("participant_id, points_delta")
      .eq("pool_id", trimmedPoolId),
  ]);

  if (poolErr || !poolRow) {
    return { ok: false, error: poolErr?.message ?? "Pool not found." };
  }
  if (pErr) {
    return { ok: false, error: pErr.message };
  }
  if (lErr) {
    return { ok: false, error: lErr.message };
  }

  const poolName = String(poolRow.name ?? "").trim() || "Pool";
  const rows = buildPoolStandingsFromLedger({
    poolId: trimmedPoolId,
    poolName,
    participants: participants ?? [],
    ledgerLines: ledger ?? [],
  });

  return { ok: true, rows, poolName };
}
