import type {
  PublicParticipantLedgerRow,
  PublicParticipantPick,
} from "../../types/publicParticipant";

export type PredictionsPublicRowDb = {
  prediction_id: string;
  participant_id: string;
  pool_id: string;
  prediction_kind: string;
  group_code: string | null;
  slot_key: string | null;
  bonus_key: string | null;
  stage_code: string | null;
  stage_label: string | null;
  stage_sort_order: number | null;
  team_name: string | null;
  team_country_code: string | null;
};

export type PointsLedgerPublicRowDb = {
  id: string;
  participant_id: string;
  pool_id: string;
  points_delta: number;
  prediction_kind: string | null;
  created_at: string;
  prediction_id: string | null;
  result_id: string | null;
};

export function mapPredictionPublicRow(
  row: PredictionsPublicRowDb,
): PublicParticipantPick {
  return {
    predictionId: row.prediction_id,
    predictionKind: row.prediction_kind,
    groupCode: row.group_code,
    slotKey: row.slot_key,
    bonusKey: row.bonus_key,
    stageCode: row.stage_code,
    stageLabel: row.stage_label ?? "Other",
    stageSortOrder: row.stage_sort_order ?? 10_000,
    teamName: row.team_name,
    teamCountryCode: row.team_country_code,
  };
}

export function mapLedgerPublicRow(
  row: PointsLedgerPublicRowDb,
): PublicParticipantLedgerRow {
  return {
    id: row.id,
    pointsDelta: row.points_delta,
    predictionKind: row.prediction_kind,
    createdAt: row.created_at,
    predictionId: row.prediction_id,
    resultId: row.result_id,
  };
}
