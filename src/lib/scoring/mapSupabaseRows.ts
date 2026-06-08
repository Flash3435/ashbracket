import type { Prediction, Result, ScoringRule } from "../../types/domain";

/** Map `predictions` row → domain (camelCase). */
export function mapPredictionRow(row: {
  id: string;
  pool_id: string;
  participant_id: string;
  prediction_kind: string;
  team_id: string | null;
  tournament_stage_id: string | null;
  group_code: string | null;
  slot_key: string | null;
  bonus_key: string | null;
  value_text: string | null;
  created_at: string;
  updated_at: string;
}): Prediction {
  return {
    id: row.id,
    poolId: row.pool_id,
    participantId: row.participant_id,
    predictionKind: row.prediction_kind as Prediction["predictionKind"],
    teamId: row.team_id,
    tournamentStageId: row.tournament_stage_id,
    groupCode: row.group_code,
    slotKey: row.slot_key,
    bonusKey: row.bonus_key,
    valueText: row.value_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapResultRow(row: {
  id: string;
  tournament_stage_id: string;
  kind: string;
  team_id: string;
  group_code: string | null;
  slot_key: string | null;
  value_text: string | null;
  resolved_at: string;
  created_at: string;
  source?: string | null;
  locked?: boolean | null;
}): Result {
  return {
    id: row.id,
    tournamentStageId: row.tournament_stage_id,
    kind: row.kind as Result["kind"],
    teamId: row.team_id,
    groupCode: row.group_code,
    slotKey: row.slot_key,
    valueText: row.value_text,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    source:
      row.source === "sync" || row.source === "manual"
        ? row.source
        : undefined,
    locked: row.locked ?? undefined,
  };
}

export function mapScoringRuleRow(row: {
  id: string;
  pool_id: string;
  prediction_kind: string;
  bonus_key?: string | null;
  points: number | string;
  created_at: string;
  updated_at: string;
}): ScoringRule {
  return {
    id: row.id,
    poolId: row.pool_id,
    predictionKind: row.prediction_kind as ScoringRule["predictionKind"],
    bonusKey: row.bonus_key ?? null,
    points: Number(row.points),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
