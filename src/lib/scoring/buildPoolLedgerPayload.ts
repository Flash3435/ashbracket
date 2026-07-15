/**
 * Build the points_ledger replacement payload for a pool (no writes).
 * Shared by recompute and the duplicate-KO repair dry-run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureThirdPlaceQualifierResults } from "@/lib/scoring/ensureThirdPlaceQualifierResults";
import { fetchPoolPredictions } from "@/lib/predictions/fetchPoolPredictions";
import { warnIfPoolPredictionsLookTruncated } from "@/lib/supabase/fetchAllRows";
import { isKnockoutProgressionKind } from "@/lib/predictions/knockoutProgressionKinds";
import { computePoolScores } from "./computePoolScores";
import { mapResultRow, mapScoringRuleRow } from "./mapSupabaseRows";
import {
  knockoutScoringConfigFromTransition,
  mergePreservedPreCutoffKnockoutLedger,
  postCutoffTeamIdsFromResults,
  resolveKnockoutScoringTransition,
  type ExcludedKnockoutOrphan,
} from "./knockoutScoringTransition";
import {
  validateKnockoutLedgerPayload,
  type KnockoutLedgerPayloadValidation,
  type LedgerPayloadRow,
} from "./validateKnockoutLedgerPayload";

export type BuildPoolLedgerPayloadResult =
  | {
      ok: true;
      payload: LedgerPayloadRow[];
      validation: KnockoutLedgerPayloadValidation;
      excludedOrphans: ExcludedKnockoutOrphan[];
      liveKoRows: number;
      liveNullResultKoRows: number;
      liveDuplicateKeys: number;
      editionId: string;
      knockoutMode: string;
    }
  | { ok: false; error: string };

export async function buildPoolLedgerPayloadWithClient(
  supabase: SupabaseClient,
  poolId: string,
): Promise<BuildPoolLedgerPayloadResult> {
  const poolPredictions = await fetchPoolPredictions(supabase, { poolId });
  if (poolPredictions.error) return { ok: false, error: poolPredictions.error };

  const { data: participantRows, error: participantErr } = await supabase
    .from("participants")
    .select("id")
    .eq("pool_id", poolId);
  if (participantErr) return { ok: false, error: participantErr.message };

  warnIfPoolPredictionsLookTruncated({
    participantCount: (participantRows ?? []).length,
    predictionRowCount: poolPredictions.predictions.length,
    paginationPageCount: poolPredictions.pageCount,
    context: "buildPoolLedgerPayloadWithClient",
    poolId,
  });

  const { data: poolRow, error: poolErr } = await supabase
    .from("pools")
    .select(
      "id, group_advance_exact_points, group_advance_wrong_slot_points, tournament_edition_id",
    )
    .eq("id", poolId)
    .maybeSingle();

  if (poolErr) return { ok: false, error: poolErr.message };
  if (!poolRow?.tournament_edition_id) {
    return { ok: false, error: "Pool has no tournament edition assigned." };
  }

  const editionId = poolRow.tournament_edition_id as string;

  const { data: editionRow, error: editionErr } = await supabase
    .from("tournament_editions")
    .select("code, is_simulation")
    .eq("id", editionId)
    .maybeSingle();
  if (editionErr) return { ok: false, error: editionErr.message };

  const knockoutScoring = knockoutScoringConfigFromTransition(
    resolveKnockoutScoringTransition({
      editionCode: editionRow?.code ?? null,
      isSimulation: Boolean(editionRow?.is_simulation),
    }),
  );

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

  if (rulesErr) return { ok: false, error: rulesErr.message };

  await ensureThirdPlaceQualifierResults(supabase, editionId);

  const { data: resultsRaw, error: resErr } = await supabase
    .from("results")
    .select(
      "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id",
    )
    .eq("edition_id", editionId);

  if (resErr) return { ok: false, error: resErr.message };

  const predictions = poolPredictions.predictions;
  const scoringRules = (rulesRaw ?? []).map(mapScoringRuleRow);
  const results = (resultsRaw ?? []).map(mapResultRow);

  const outcome = computePoolScores({
    poolId,
    predictions,
    results,
    scoringRules,
    groupStageScoring,
    knockoutScoring,
  });

  const computedRows = outcome.ledgerLines.map((l) => ({
    participant_id: l.participantId,
    points_delta: l.pointsDelta,
    prediction_kind: l.predictionKind,
    prediction_id: l.predictionId,
    result_id: l.resultId,
    note: l.note,
  }));

  let payload: LedgerPayloadRow[] = computedRows;
  let excludedOrphans: ExcludedKnockoutOrphan[] = [];

  const resultTeamIdById = new Map(
    results.map((r) => [r.id, r.teamId] as const),
  );
  const predictionTeamIdByPredictionId = new Map(
    predictions.map((p) => [p.id, p.teamId] as const),
  );

  const { data: liveLedgerRaw, error: liveErr } = await supabase
    .from("points_ledger")
    .select(
      "participant_id, points_delta, prediction_kind, prediction_id, result_id, note",
    )
    .eq("pool_id", poolId);
  if (liveErr) return { ok: false, error: liveErr.message };

  const liveRows = (liveLedgerRaw ?? []).map((r) => ({
    participant_id: r.participant_id as string,
    points_delta: Number(r.points_delta),
    prediction_kind: r.prediction_kind as string,
    prediction_id: r.prediction_id as string,
    result_id: (r.result_id as string | null) ?? "",
    note: (r.note as string | null) ?? null,
  }));

  let liveKoRows = 0;
  let liveNullResultKoRows = 0;
  const liveOwn = new Map<string, number>();
  for (const row of liveRows) {
    if (!isKnockoutProgressionKind(row.prediction_kind)) continue;
    liveKoRows += 1;
    if (!row.result_id.trim() || !resultTeamIdById.get(row.result_id)) {
      liveNullResultKoRows += 1;
    }
    const teamId =
      (row.result_id.trim()
        ? resultTeamIdById.get(row.result_id)
        : null) ??
      predictionTeamIdByPredictionId.get(row.prediction_id) ??
      null;
    const key = `${row.participant_id}::${teamId ?? "UNRESOLVED"}`;
    liveOwn.set(key, (liveOwn.get(key) ?? 0) + 1);
  }
  const liveDuplicateKeys = [...liveOwn.values()].filter((n) => n > 1).length;

  if (knockoutScoring.mode === "grandfathered_cutoff_then_capped_increment") {
    const postCutoffTeamIds = postCutoffTeamIdsFromResults(
      results,
      knockoutScoring.cutoffMaxOfficialKind,
    );
    const merged = mergePreservedPreCutoffKnockoutLedger({
      computedRows,
      liveRows,
      resultTeamIdById,
      predictionTeamIdByPredictionId,
      postCutoffTeamIds,
    });
    excludedOrphans = merged.excludedOrphans;
    payload = merged.rows.map((r) => ({
      ...r,
      note: r.note ?? "",
    }));
  }

  const validation = validateKnockoutLedgerPayload({
    rows: payload,
    resultTeamIdById,
    predictionTeamIdByPredictionId,
  });

  return {
    ok: true,
    payload,
    validation,
    excludedOrphans,
    liveKoRows,
    liveNullResultKoRows,
    liveDuplicateKeys,
    editionId,
    knockoutMode: knockoutScoring.mode,
  };
}
