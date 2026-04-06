import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import type { SaveKnockoutPicksResult } from "../../types/knockoutPicksSave";

const ALLOWED_KINDS = new Set([
  "group_winner",
  "group_runner_up",
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
  "third_place_qualifier",
  "bonus_pick",
]);

export const PARTICIPANT_PICK_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates participant id and slot payloads before DB writes.
 */
export function validateParticipantPickSaveInput(input: {
  participantId: string;
  slots: ParticipantPickSlotPayload[];
}): SaveKnockoutPicksResult | null {
  if (!PARTICIPANT_PICK_UUID_RE.test(input.participantId)) {
    return { ok: false, error: "Invalid participant id." };
  }

  for (const s of input.slots) {
    if (!ALLOWED_KINDS.has(s.predictionKind)) {
      return { ok: false, error: "Invalid prediction kind." };
    }
    if (!PARTICIPANT_PICK_UUID_RE.test(s.tournamentStageId)) {
      return { ok: false, error: "Invalid tournament stage id." };
    }
    if (s.predictionKind === "bonus_pick") {
      if (!s.bonusKey || !s.bonusKey.trim()) {
        return { ok: false, error: "Bonus pick is missing a category." };
      }
    }
    if (s.predictionKind === "group_winner" || s.predictionKind === "group_runner_up") {
      if (!s.groupCode || !s.groupCode.trim()) {
        return { ok: false, error: "Group pick is missing a group letter." };
      }
    }
    const tid = s.teamId.trim();
    if (tid && !PARTICIPANT_PICK_UUID_RE.test(tid)) {
      return { ok: false, error: "Invalid team id." };
    }
  }

  return null;
}
