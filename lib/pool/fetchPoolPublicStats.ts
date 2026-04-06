import { createClient } from "@/lib/supabase/server";

export type PoolPublicStats = {
  registeredCount: number;
  paidCount: number;
  entryFeeCents: number | null;
  prizePoolCents: number | null;
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

/**
 * Loads aggregate stats for a pool via `pool_public_stats` (public pools only).
 * Does not expose which individuals are paid.
 */
export async function fetchPoolPublicStats(
  poolId: string,
): Promise<{ stats: PoolPublicStats | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pool_public_stats", {
      p_pool_id: poolId,
    });

    if (error) {
      return { stats: null, error: error.message };
    }

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
  } catch (e) {
    return {
      stats: null,
      error: e instanceof Error ? e.message : "Failed to load pool stats.",
    };
  }
}
