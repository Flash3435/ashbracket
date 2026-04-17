import type { Prediction, Team, TournamentStage } from "../../src/types/domain";
import type { PredictionsPublicRowDb } from "./mapPublicParticipantRows";

const EMPTY_TS = "1970-01-01T00:00:00.000Z";

/**
 * Reconstructs domain `Prediction` rows from `predictions_public` (team ids via country code).
 */
export function predictionsFromPublicViewRows(
  rows: PredictionsPublicRowDb[],
  input: {
    poolId: string;
    participantId: string;
    stages: TournamentStage[];
    teamsByCountry: Map<string, Team>;
  },
): Prediction[] {
  const stageByCode = new Map(
    input.stages.map((s) => [s.code as string, s]),
  );

  return rows.map((row) => {
    const code = row.stage_code;
    const stage = code ? stageByCode.get(code) : undefined;
    const cc = (row.team_country_code ?? "").trim().toUpperCase();
    const team = cc ? input.teamsByCountry.get(cc) : undefined;

    return {
      id: row.prediction_id,
      poolId: input.poolId,
      participantId: input.participantId,
      predictionKind: row.prediction_kind as Prediction["predictionKind"],
      teamId: team?.id ?? null,
      tournamentStageId: stage?.id ?? null,
      groupCode: row.group_code,
      slotKey: row.slot_key,
      bonusKey: row.bonus_key,
      valueText: null,
      createdAt: EMPTY_TS,
      updatedAt: EMPTY_TS,
    };
  });
}
