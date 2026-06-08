import type { Prediction } from "../../src/types/domain";

/**
 * Stable fingerprint of pick rows for one participant (order-independent).
 * Used to detect meaningful changes between saves.
 */
export function fingerprintPredictionsForParticipant(
  predictions: Prediction[],
  participantId: string,
): string {
  const parts = predictions
    .filter((p) => p.participantId === participantId)
    .map((p) =>
      [
        p.predictionKind,
        p.tournamentStageId ?? "",
        p.groupCode ?? "",
        p.slotKey ?? "",
        p.bonusKey ?? "",
        p.teamId ?? "",
        p.valueText ?? "",
      ].join("|"),
    );
  parts.sort();
  return parts.join("\n");
}
