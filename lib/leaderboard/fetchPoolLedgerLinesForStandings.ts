import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";
import type { PoolStandingsLedgerLine } from "./buildPoolStandingsFromLedger";

export type FetchPoolLedgerLinesResult =
  | { ok: true; ledgerLines: PoolStandingsLedgerLine[]; pageCount: number }
  | { ok: false; error: string };

/**
 * Loads all points_ledger rows for a pool (paginated past PostgREST's 1000-row cap).
 * Required for accurate standings in pools with many scored picks.
 */
export async function fetchPoolLedgerLinesForStandings(
  supabase: SupabaseClient,
  poolId: string,
): Promise<FetchPoolLedgerLinesResult> {
  const trimmedPoolId = poolId.trim();
  if (!trimmedPoolId) {
    return { ok: false, error: "Pool not found." };
  }

  const { data, error, pageCount } = await fetchAllRows<PoolStandingsLedgerLine>(
    async ({ from, to }) =>
      supabase
        .from("points_ledger")
        .select("participant_id, points_delta")
        .eq("pool_id", trimmedPoolId)
        .order("participant_id", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to),
  );

  if (error) {
    return { ok: false, error };
  }

  return { ok: true, ledgerLines: data, pageCount };
}
