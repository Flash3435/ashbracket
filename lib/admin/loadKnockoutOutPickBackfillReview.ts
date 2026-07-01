import type { SupabaseClient } from "@supabase/supabase-js";
import { mapTeamRow, mapTournamentStageRow } from "../results/mapRows";
import { TEAM_TABLE_SELECT } from "../teams/teamDbSelect";
import { mapPredictionRow } from "../../src/lib/scoring/mapSupabaseRows";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import {
  buildKnockoutOutPickBackfillPlan,
  buildMediumCandidateReviewReports,
  extractBackfillCandidatesFromAuditRows,
  summarizeKnockoutOutBackfillReview,
  type BackfillCandidate,
  type BackfillPlanItem,
  type CorrectionAuditRow,
  type MediumCandidateReviewReport,
  type KnockoutOutBackfillReviewSummary,
} from "./knockoutOutPickBackfillPlanner";

const STAGE_CODES = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
] as const;

export type KnockoutOutBackfillHighConfidenceRow = {
  candidateId: string;
  participantName: string;
  poolName: string;
  matchCode: string;
  predictionKind: string;
  slotKey: string | null;
  teamName: string;
  plannedAction: "restore" | "add_status_only" | "skip" | "report_only";
  detail: string | null;
};

export type KnockoutOutBackfillReviewData = {
  generatedAt: string;
  poolIds: string[];
  summary: KnockoutOutBackfillReviewSummary;
  mediumReports: MediumCandidateReviewReport[];
  highConfidenceRows: KnockoutOutBackfillHighConfidenceRow[];
  manualAuditGaps: string[];
  candidates: BackfillCandidate[];
  existingPredictions: Prediction[];
};

function detectManualAuditGaps(auditRows: CorrectionAuditRow[]): string[] {
  const gaps: string[] = [];
  for (const audit of auditRows) {
    const meta = audit.metadata;
    if (!meta) continue;
    const clearedCount =
      typeof meta.clearedPickCount === "number" ? meta.clearedPickCount : 0;
    if (clearedCount <= 0) continue;
    const marked = Array.isArray(meta.markedOutPicks)
      ? meta.markedOutPicks.length
      : 0;
    const summary = Array.isArray(meta.clearedSummary)
      ? meta.clearedSummary.length
      : 0;
    if (marked === 0 && summary === 0) {
      gaps.push(
        `Audit ${audit.id} (${audit.matchCode}) reports clearedPickCount=${clearedCount} without structured metadata.`,
      );
    }
  }
  return gaps;
}

function highConfidenceRowsFromPlan(input: {
  planItems: BackfillPlanItem[];
  participantNameById: Map<string, string>;
  poolNameById: Map<string, string>;
}): KnockoutOutBackfillHighConfidenceRow[] {
  return input.planItems
    .filter((item) => item.candidate.confidence === "high")
    .map((item) => ({
      candidateId: item.candidate.candidateId,
      participantName:
        input.participantNameById.get(item.candidate.participantId) ??
        item.candidate.participantId,
      poolName:
        input.poolNameById.get(item.candidate.poolId) ?? item.candidate.poolId,
      matchCode: item.candidate.matchCode,
      predictionKind: item.candidate.predictionKind,
      slotKey: item.candidate.slotKey,
      teamName: item.candidate.teamName,
      plannedAction: item.action,
      detail:
        item.action === "skip" || item.action === "report_only"
          ? item.detail ?? item.reason
          : item.candidate.explanation,
    }));
}

export async function loadKnockoutOutPickBackfillReview(
  supabase: SupabaseClient,
  poolIds: string[],
): Promise<
  { ok: true; data: KnockoutOutBackfillReviewData } | { ok: false; error: string }
> {
  if (poolIds.length === 0) {
    return {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        poolIds: [],
        summary: {
          mediumCandidates: 0,
          highConfidenceCandidates: 0,
          conflicts: 0,
          alreadyOut: 0,
          missingTeamId: 0,
          auditGaps: 0,
          restorableMedium: 0,
        },
        mediumReports: [],
        highConfidenceRows: [],
        manualAuditGaps: [],
        candidates: [],
        existingPredictions: [],
      },
    };
  }

  const { data: stageRows, error: stageErr } = await supabase
    .from("tournament_stages")
    .select(
      "id, code, label, sort_order, starts_at, ends_at, created_at, updated_at",
    )
    .in("code", STAGE_CODES);
  if (stageErr) return { ok: false, error: stageErr.message };

  const stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>> =
    {};
  for (const row of stageRows ?? []) {
    const stage = mapTournamentStageRow(row);
    stageByCode[stage.code] = stage;
  }

  const { data: teamRows, error: teamErr } = await supabase
    .from("teams")
    .select(TEAM_TABLE_SELECT);
  if (teamErr) return { ok: false, error: teamErr.message };
  const teams = (teamRows ?? []).map(mapTeamRow).map((t) => ({
    id: t.id,
    name: t.name,
    countryCode: t.countryCode,
  }));

  const { data: poolRows, error: poolErr } = await supabase
    .from("pools")
    .select("id, name")
    .in("id", poolIds);
  if (poolErr) return { ok: false, error: poolErr.message };
  const poolNameById = new Map<string, string>();
  for (const row of poolRows ?? []) {
    poolNameById.set(row.id, row.name?.trim() || row.id);
  }

  const { data: participantRows, error: participantErr } = await supabase
    .from("participants")
    .select("id, display_name, pool_id")
    .in("pool_id", poolIds);
  if (participantErr) return { ok: false, error: participantErr.message };
  const participantNameById = new Map<string, string>();
  for (const row of participantRows ?? []) {
    participantNameById.set(row.id, row.display_name?.trim() || row.id);
  }

  const { data: auditRowsRaw, error: auditErr } = await supabase
    .from("participant_pick_correction_audit")
    .select(
      "id, pool_id, participant_id, match_code, created_at, actor_email, actor_user_id, metadata",
    )
    .in("pool_id", poolIds)
    .order("created_at", { ascending: true });
  if (auditErr) return { ok: false, error: auditErr.message };

  const auditRows: CorrectionAuditRow[] = (auditRowsRaw ?? []).map((row) => ({
    id: row.id,
    poolId: row.pool_id,
    participantId: row.participant_id,
    matchCode: row.match_code,
    createdAt: row.created_at,
    actorEmail: row.actor_email,
    actorUserId: row.actor_user_id,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  }));
  const auditById = new Map(auditRows.map((row) => [row.id, row] as const));

  const candidates = extractBackfillCandidatesFromAuditRows({
    auditRows,
    stageByCode,
    teams,
  });

  const participantIds = [...new Set(candidates.map((c) => c.participantId))];
  let existingPredictions: Prediction[] = [];
  if (participantIds.length > 0) {
    const { data: predictionRows, error: predErr } = await supabase
      .from("predictions")
      .select("*")
      .in("pool_id", poolIds)
      .in("participant_id", participantIds);
    if (predErr) return { ok: false, error: predErr.message };
    existingPredictions = (predictionRows ?? []).map(mapPredictionRow);
  }

  const plan = buildKnockoutOutPickBackfillPlan({
    candidates,
    existingPredictions,
  });
  const mediumReports = buildMediumCandidateReviewReports({
    candidates,
    existingPredictions,
    participantNameById,
    poolNameById,
    auditById,
  });
  const manualAuditGaps = detectManualAuditGaps(auditRows);
  const summary = summarizeKnockoutOutBackfillReview({
    candidates,
    mediumReports,
    manualAuditGaps,
  });

  return {
    ok: true,
    data: {
      generatedAt: new Date().toISOString(),
      poolIds,
      summary,
      mediumReports,
      highConfidenceRows: highConfidenceRowsFromPlan({
        planItems: plan.items,
        participantNameById,
        poolNameById,
      }),
      manualAuditGaps,
      candidates,
      existingPredictions,
    },
  };
}

export async function loadManagedPoolIdsForBackfillReview(
  supabase: SupabaseClient,
): Promise<{ ok: true; poolIds: string[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("pools")
    .select("id")
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true, poolIds: (data ?? []).map((row) => row.id) };
}
