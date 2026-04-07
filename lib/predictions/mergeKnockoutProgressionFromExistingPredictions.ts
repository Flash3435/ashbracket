import type { Prediction } from "../../src/types/domain";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import { isKnockoutProgressionKind } from "./knockoutProgressionKinds";

function progressionKey(parts: {
  predictionKind: string;
  tournamentStageId: string;
  slotKey: string | null;
}): string {
  return `${parts.predictionKind}\0${parts.tournamentStageId}\0${parts.slotKey ?? ""}`;
}

/**
 * When knockout progression picks are server-frozen, replace those payload rows with
 * values from already-saved predictions so a normal full-slot save cannot change them.
 */
export function mergeKnockoutProgressionSlotsFromPredictions(
  incoming: ParticipantPickSlotPayload[],
  existing: Prediction[],
): ParticipantPickSlotPayload[] {
  const byKey = new Map<string, string>();
  for (const p of existing) {
    if (!isKnockoutProgressionKind(p.predictionKind)) continue;
    const tid = p.teamId?.trim() ?? "";
    if (!tid) continue;
    const stageId = p.tournamentStageId ?? "";
    byKey.set(
      progressionKey({
        predictionKind: p.predictionKind,
        tournamentStageId: stageId,
        slotKey: p.slotKey,
      }),
      tid,
    );
  }

  return incoming.map((s) => {
    if (!isKnockoutProgressionKind(s.predictionKind)) return s;
    const k = progressionKey({
      predictionKind: s.predictionKind,
      tournamentStageId: s.tournamentStageId,
      slotKey: s.slotKey,
    });
    const keep = byKey.get(k);
    return keep != null ? { ...s, teamId: keep } : { ...s, teamId: "" };
  });
}
