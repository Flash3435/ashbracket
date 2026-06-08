import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePoolAdminPaths } from "@/lib/admin/revalidatePoolAdminPaths";
import { createClient } from "@/lib/supabase/server";
import { computePoolScores } from "./computePoolScores";
import {
  mapPredictionRow,
  mapResultRow,
  mapScoringRuleRow,
} from "./mapSupabaseRows";

type RecomputeResult = { error?: string };

/**
 * Same as `recomputePoolLedgerForPool` but uses the given Supabase client (e.g. service role
 * when the RPC requires elevated privileges).
 */
export async function recomputePoolLedgerWithClient(
  supabase: SupabaseClient,
  poolId: string,
): Promise<RecomputeResult> {
  const { data: predRaw, error: predErr } = await supabase
    .from("predictions")
    .select(
      "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
    )
    .eq("pool_id", poolId);

  if (predErr) return { error: predErr.message };

  const { data: poolRow, error: poolErr } = await supabase
    .from("pools")
    .select("id, group_advance_exact_points, group_advance_wrong_slot_points")
    .eq("id", poolId)
    .maybeSingle();

  if (poolErr) return { error: poolErr.message };

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

  const { data: resultsRaw, error: resErr } = await supabase
    .from("results")
    .select(
      "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at",
    );

  if (resErr) return { error: resErr.message };

  const predictions = (predRaw ?? []).map(mapPredictionRow);
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

  revalidatePoolAdminPaths(poolId);
  revalidatePath("/admin/results");
  revalidatePath("/admin/tournament");
  revalidatePath("/admin/tournament/status");

  return {};
}

/**
 * Server-only: load pool predictions, all tournament results, pool scoring rules;
 * run `computePoolScores`; replace `points_ledger` for the pool via RPC (single transaction).
 * Idempotent and safe to rerun whenever results change.
 */
export async function recomputePoolLedgerForPool(
  poolId: string,
): Promise<RecomputeResult> {
  const supabase = await createClient();
  return recomputePoolLedgerWithClient(supabase, poolId);
}
