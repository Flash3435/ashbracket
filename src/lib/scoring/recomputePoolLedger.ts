import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePoolAdminPaths } from "@/lib/admin/revalidatePoolAdminPaths";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { buildPoolLedgerPayloadWithClient } from "./buildPoolLedgerPayload";

type RecomputeResult = { error?: string };

/** Persisted on `wc_pool_ledger_recompute_status.last_trigger` (World Cup football only). */
export type WcLedgerRecomputeTrigger =
  | "participant_save"
  | "tournament_sync"
  | "admin_manual_recompute"
  | "admin_pick_edit"
  | "admin_result_edit"
  | "admin_recompute_all_pools";

export type RecomputePoolLedgerOptions = {
  ledgerTrigger?: WcLedgerRecomputeTrigger;
  /** Skip Next.js cache revalidation (required for CLI scripts outside the app runtime). */
  skipRevalidation?: boolean;
};

async function recordLedgerRecomputeDiagnostic(
  supabase: SupabaseClient,
  poolId: string,
  trigger: WcLedgerRecomputeTrigger,
): Promise<void> {
  const at = new Date().toISOString();
  const { error } = await supabase.from("wc_pool_ledger_recompute_status").upsert(
    {
      pool_id: poolId,
      last_success_at: at,
      last_trigger: trigger,
      last_status: "ok",
      last_error: null,
    },
    { onConflict: "pool_id" },
  );
  if (error) {
    console.error("[ashbracket:ledger-diagnostics] upsert failed", {
      poolId,
      trigger,
      message: error.message,
    });
  }
}

/**
 * Same as `recomputePoolLedgerForPool` but uses the given Supabase client (e.g. service role
 * when the RPC requires elevated privileges).
 */
export async function recomputePoolLedgerWithClient(
  supabase: SupabaseClient,
  poolId: string,
  options?: RecomputePoolLedgerOptions,
): Promise<RecomputeResult> {
  const built = await buildPoolLedgerPayloadWithClient(supabase, poolId);
  if (!built.ok) return { error: built.error };

  if (built.excludedOrphans.length > 0) {
    console.warn("[ashbracket:ledger-merge] excluded knockout orphans", {
      poolId,
      count: built.excludedOrphans.length,
      sample: built.excludedOrphans.slice(0, 5),
    });
  }

  if (!built.validation.ok) {
    console.error("[ashbracket:ledger-validate] blocked replace", {
      poolId,
      ...built.validation,
    });
    return { error: built.validation.error ?? "Invalid knockout ledger payload" };
  }

  const { error: rpcErr } = await supabase.rpc("replace_points_ledger_for_pool", {
    p_pool_id: poolId,
    p_rows: built.payload,
  });

  if (rpcErr) return { error: rpcErr.message };

  if (options?.ledgerTrigger) {
    await recordLedgerRecomputeDiagnostic(supabase, poolId, options.ledgerTrigger);
  }

  if (!options?.skipRevalidation) {
    revalidatePoolAdminPaths(poolId);
    revalidatePath("/admin/results");
    revalidatePath("/admin/tournament");
    revalidatePath("/admin/tournament/status");
  }

  return {};
}

/**
 * Server-only: load pool predictions, all tournament results, pool scoring rules;
 * run `computePoolScores`; replace `points_ledger` for the pool via RPC (single transaction).
 * Idempotent and safe to rerun whenever results change.
 */
export async function recomputePoolLedgerForPool(
  poolId: string,
  options?: RecomputePoolLedgerOptions,
): Promise<RecomputeResult> {
  const supabase = await createClient();
  return recomputePoolLedgerWithClient(supabase, poolId, options);
}

/**
 * Same as `recomputePoolLedgerWithClient` but uses the service role client so the
 * `replace_points_ledger_for_pool` RPC succeeds after application code has verified
 * the acting user (e.g. participant owns their row). Use only from trusted server actions.
 */
export async function recomputePoolLedgerForPoolAsTrustedServer(
  poolId: string,
  options?: RecomputePoolLedgerOptions,
): Promise<RecomputeResult> {
  const supabase = createServiceRoleClient();
  return recomputePoolLedgerWithClient(supabase, poolId, options);
}
