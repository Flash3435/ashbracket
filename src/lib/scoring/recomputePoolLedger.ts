import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePoolAdminPaths } from "@/lib/admin/revalidatePoolAdminPaths";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureThirdPlaceQualifierResults } from "@/lib/scoring/ensureThirdPlaceQualifierResults";
import { computePoolScores } from "./computePoolScores";
import { fetchPoolPredictions } from "@/lib/predictions/fetchPoolPredictions";
import { warnIfPoolPredictionsLookTruncated } from "@/lib/supabase/fetchAllRows";
import { mapResultRow, mapScoringRuleRow } from "./mapSupabaseRows";

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
  const poolPredictions = await fetchPoolPredictions(supabase, { poolId });
  if (poolPredictions.error) return { error: poolPredictions.error };

  const { data: participantRows, error: participantErr } = await supabase
    .from("participants")
    .select("id")
    .eq("pool_id", poolId);
  if (participantErr) return { error: participantErr.message };

  const participantCount = (participantRows ?? []).length;
  warnIfPoolPredictionsLookTruncated({
    participantCount,
    predictionRowCount: poolPredictions.predictions.length,
    paginationPageCount: poolPredictions.pageCount,
    context: "recomputePoolLedgerWithClient",
    poolId,
  });

  const { data: poolRow, error: poolErr } = await supabase
    .from("pools")
    .select(
      "id, group_advance_exact_points, group_advance_wrong_slot_points, tournament_edition_id",
    )
    .eq("id", poolId)
    .maybeSingle();

  if (poolErr) return { error: poolErr.message };
  if (!poolRow?.tournament_edition_id) {
    return { error: "Pool has no tournament edition assigned." };
  }

  const editionId = poolRow.tournament_edition_id as string;

  const { data: groupStageRow } = await supabase
    .from("tournament_stages")
    .select("id")
    .eq("code", "group")
    .maybeSingle();

  let groupStageScoring: {
    groupStageId: string;
    exactPoints: number;
    wrongSlotPoints: number;
  } | null = null;
  if (
    poolRow &&
    poolRow.group_advance_exact_points != null &&
    poolRow.group_advance_wrong_slot_points != null &&
    groupStageRow?.id
  ) {
    groupStageScoring = {
      groupStageId: groupStageRow.id,
      exactPoints: Number(poolRow.group_advance_exact_points),
      wrongSlotPoints: Number(poolRow.group_advance_wrong_slot_points),
    };
  }

  const { data: rulesRaw, error: rulesErr } = await supabase
    .from("scoring_rules")
    .select(
      "id, pool_id, prediction_kind, bonus_key, points, created_at, updated_at",
    )
    .eq("pool_id", poolId);

  if (rulesErr) return { error: rulesErr.message };

  await ensureThirdPlaceQualifierResults(supabase, editionId);

  const { data: resultsRaw, error: resErr } = await supabase
    .from("results")
    .select(
      "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id",
    )
    .eq("edition_id", editionId);

  if (resErr) return { error: resErr.message };

  const predictions = poolPredictions.predictions;
  const scoringRules = (rulesRaw ?? []).map(mapScoringRuleRow);
  const results = (resultsRaw ?? []).map(mapResultRow);

  const outcome = computePoolScores({
    poolId,
    predictions,
    results,
    scoringRules,
    groupStageScoring,
  });

  const payload = outcome.ledgerLines.map((l) => ({
    participant_id: l.participantId,
    points_delta: l.pointsDelta,
    prediction_kind: l.predictionKind,
    prediction_id: l.predictionId,
    result_id: l.resultId,
    note: l.note,
  }));

  const { error: rpcErr } = await supabase.rpc("replace_points_ledger_for_pool", {
    p_pool_id: poolId,
    p_rows: payload,
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
