import type { SupabaseClient } from "@supabase/supabase-js";

export type PoolPublicStats = {
  registeredCount: number;
  /** Null when only a partial snapshot (e.g. RPC unavailable). */
  paidCount: number | null;
  entryFeeCents: number | null;
  prizePoolCents: number | null;
  /** From public leaderboard count only; payment and prize lines may be omitted. */
  partial?: boolean;
};

type RpcRow = {
  registered_count: number | string;
  paid_count: number | string;
  entry_fee_cents: number | null;
  prize_pool_cents: number | string | null;
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

async function registeredCountFromLeaderboard(
  supabase: SupabaseClient,
  poolId: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from("leaderboard_public")
    .select("participant_id", { count: "exact", head: true })
    .eq("pool_id", poolId);

  if (error) return null;
  return count ?? 0;
}

/**
 * Loads aggregate stats for a pool via `pool_public_stats` (public pools only).
 * Falls back to a registered count from `leaderboard_public` if the RPC is
 * missing or errors, so the home page stays usable before migrations land.
 */
export async function fetchPoolPublicStats(
  supabase: SupabaseClient,
  poolId: string,
): Promise<{ stats: PoolPublicStats | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("pool_public_stats", {
      p_pool_id: poolId,
    });

    if (!error) {
      const rows = (data ?? []) as RpcRow[];
      const row = rows[0];
      if (!row) {
        return { stats: null, error: null };
      }

      return {
        stats: {
          registeredCount: num(row.registered_count),
          paidCount: num(row.paid_count),
          entryFeeCents: row.entry_fee_cents,
          prizePoolCents:
            row.prize_pool_cents == null ? null : num(row.prize_pool_cents),
        },
        error: null,
      };
    }

    const fallback = await registeredCountFromLeaderboard(supabase, poolId);
    if (fallback != null) {
      return {
        stats: {
          registeredCount: fallback,
          paidCount: null,
          entryFeeCents: null,
          prizePoolCents: null,
          partial: true,
        },
        error: null,
      };
    }

    return { stats: null, error: null };
  } catch {
    const fallback = await registeredCountFromLeaderboard(supabase, poolId);
    if (fallback != null) {
      return {
        stats: {
          registeredCount: fallback,
          paidCount: null,
          entryFeeCents: null,
          prizePoolCents: null,
          partial: true,
        },
        error: null,
      };
    }
    return { stats: null, error: null };
  }
}
