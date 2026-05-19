import type { SupabaseClient } from "@supabase/supabase-js";
import type { WcLedgerRecomputeTrigger } from "@/lib/scoring/recomputePoolLedger";

export type WcPoolLedgerRecomputeRow = {
  poolId: string;
  poolName: string;
  lastSuccessAt: string | null;
  lastTrigger: WcLedgerRecomputeTrigger | null;
  lastStatus: string | null;
};

const TRIGGER_LABEL: Record<WcLedgerRecomputeTrigger, string> = {
  participant_save: "Participant pick save",
  tournament_sync: "Tournament sync",
  admin_manual_recompute: "Admin manual recompute",
  admin_pick_edit: "Admin pick edit",
  admin_result_edit: "Admin result edit",
  admin_recompute_all_pools: "Admin recompute all pools",
};

export function labelWcLedgerRecomputeTrigger(
  t: WcLedgerRecomputeTrigger | null | undefined,
): string {
  if (t == null) return "—";
  return TRIGGER_LABEL[t] ?? t;
}

/** Age after which the UI treats the last recompute as “stale” for badge purposes. */
export const WC_LEDGER_RECOMPUTE_STALE_MS = 2 * 60 * 60 * 1000;

export function wcLedgerRecomputeFreshnessBadge(
  lastSuccessAt: string | null,
): "never" | "fresh" | "stale" {
  if (lastSuccessAt == null) return "never";
  const t = new Date(lastSuccessAt).getTime();
  if (Number.isNaN(t)) return "never";
  return Date.now() - t <= WC_LEDGER_RECOMPUTE_STALE_MS ? "fresh" : "stale";
}

/**
 * Football pools: all rows from `pools` with optional `wc_pool_ledger_recompute_status`.
 * Caller must enforce admin access (e.g. global admin page or requireManagedPool).
 */
export async function fetchWcLedgerRecomputeDiagnosticsForPools(
  supabase: SupabaseClient,
  poolIds: string[] | null,
): Promise<{ rows: WcPoolLedgerRecomputeRow[]; error: string | null }> {
  let poolsQuery = supabase.from("pools").select("id, name").order("name", { ascending: true });
  if (poolIds != null && poolIds.length > 0) {
    poolsQuery = poolsQuery.in("id", poolIds);
  }

  const { data: pools, error: pErr } = await poolsQuery;
  if (pErr) return { rows: [], error: pErr.message };

  const ids = (pools ?? []).map((p) => p.id as string);
  if (ids.length === 0) return { rows: [], error: null };

  const { data: statusRows, error: sErr } = await supabase
    .from("wc_pool_ledger_recompute_status")
    .select("pool_id, last_success_at, last_trigger, last_status")
    .in("pool_id", ids);

  if (sErr) return { rows: [], error: sErr.message };

  const byPool = new Map(
    (statusRows ?? []).map((r) => [
      r.pool_id as string,
      {
        last_success_at: r.last_success_at as string | null,
        last_trigger: r.last_trigger as WcLedgerRecomputeTrigger | null,
        last_status: r.last_status as string | null,
      },
    ]),
  );

  const rows: WcPoolLedgerRecomputeRow[] = (pools ?? []).map((p) => {
    const id = p.id as string;
    const s = byPool.get(id);
    return {
      poolId: id,
      poolName: (p.name as string) ?? id,
      lastSuccessAt: s?.last_success_at ?? null,
      lastTrigger: s?.last_trigger ?? null,
      lastStatus: s?.last_status ?? null,
    };
  });

  return { rows, error: null };
}
