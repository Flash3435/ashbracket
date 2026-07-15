/**
 * Defensive checks before `replace_points_ledger_for_pool`.
 * Blocks duplicate knockout progression awards for the same (participant, team).
 */
import { isKnockoutProgressionKind } from "../../../lib/predictions/knockoutProgressionKinds";

export type LedgerPayloadRow = {
  participant_id: string;
  points_delta: number;
  prediction_kind: string;
  prediction_id: string;
  result_id: string | null;
  note?: string | null;
};

export type KnockoutLedgerPayloadValidation = {
  ok: boolean;
  error?: string;
  duplicateParticipantTeamKeys: string[];
  duplicatePredictionIds: string[];
  nullOrUnresolvedResultIds: number;
  duplicateLogicalKeys: string[];
  pointsByCategory: Record<string, number>;
  knockoutRowCount: number;
};

function resolveTeamId(
  row: LedgerPayloadRow,
  resultTeamIdById: ReadonlyMap<string, string | null>,
  predictionTeamIdByPredictionId?: ReadonlyMap<string, string | null>,
): string | null {
  const rid = row.result_id?.trim() ? row.result_id : "";
  if (rid) {
    const fromResult = resultTeamIdById.get(rid);
    if (fromResult) return fromResult;
  }
  if (predictionTeamIdByPredictionId) {
    return predictionTeamIdByPredictionId.get(row.prediction_id) ?? null;
  }
  return null;
}

/**
 * Validate a ledger replacement payload. Fail closed on duplicate KO ownership.
 */
export function validateKnockoutLedgerPayload(input: {
  rows: readonly LedgerPayloadRow[];
  resultTeamIdById: ReadonlyMap<string, string | null>;
  predictionTeamIdByPredictionId?: ReadonlyMap<string, string | null>;
}): KnockoutLedgerPayloadValidation {
  const pointsByCategory: Record<string, number> = {};
  const koKeys = new Map<string, number>();
  const predIds = new Map<string, number>();
  const logicalKeys = new Map<string, number>();
  let nullOrUnresolvedResultIds = 0;
  let knockoutRowCount = 0;

  for (const row of input.rows) {
    const cat = isKnockoutProgressionKind(row.prediction_kind)
      ? "knockout_progression"
      : row.prediction_kind.startsWith("group_")
        ? "group"
        : row.prediction_kind === "third_place_qualifier"
          ? "third_place_qualifier"
          : "other";
    pointsByCategory[cat] = (pointsByCategory[cat] ?? 0) + Number(row.points_delta);

    const logical = `${row.participant_id}|${row.prediction_kind}|${row.prediction_id}|${row.result_id ?? ""}`;
    logicalKeys.set(logical, (logicalKeys.get(logical) ?? 0) + 1);

    if (!isKnockoutProgressionKind(row.prediction_kind)) continue;
    knockoutRowCount += 1;

    predIds.set(row.prediction_id, (predIds.get(row.prediction_id) ?? 0) + 1);

    const teamId = resolveTeamId(
      row,
      input.resultTeamIdById,
      input.predictionTeamIdByPredictionId,
    );
    const rid = row.result_id?.trim() ? row.result_id : "";
    if (!rid || !input.resultTeamIdById.get(rid)) {
      nullOrUnresolvedResultIds += 1;
    }

    const key = `${row.participant_id}::${teamId ?? "UNRESOLVED"}`;
    koKeys.set(key, (koKeys.get(key) ?? 0) + 1);
  }

  const duplicateParticipantTeamKeys = [...koKeys.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k);
  const duplicatePredictionIds = [...predIds.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k);
  const duplicateLogicalKeys = [...logicalKeys.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k);

  const ok = duplicateParticipantTeamKeys.length === 0;
  return {
    ok,
    error: ok
      ? undefined
      : `Knockout ledger payload has duplicate (participant, team) awards: ${duplicateParticipantTeamKeys.slice(0, 8).join(", ")}${duplicateParticipantTeamKeys.length > 8 ? "…" : ""}`,
    duplicateParticipantTeamKeys,
    duplicatePredictionIds,
    nullOrUnresolvedResultIds,
    duplicateLogicalKeys,
    pointsByCategory,
    knockoutRowCount,
  };
}
