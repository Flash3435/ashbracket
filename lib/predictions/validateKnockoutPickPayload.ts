import type { KnockoutPickPredictionKind } from "../../types/adminKnockoutPicks";
import type { KnockoutPickSlotPayload, SaveKnockoutPicksResult } from "../../types/knockoutPicksSave";

const KNOCKOUT_KINDS: readonly KnockoutPickPredictionKind[] = [
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
] as const;

export const KNOCKOUT_PICK_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isKnockoutPickKind(k: string): k is KnockoutPickPredictionKind {
  return (KNOCKOUT_KINDS as readonly string[]).includes(k);
}

/**
 * Validates participant id and slot payloads before DB writes.
 */
export function validateKnockoutPickSaveInput(input: {
  participantId: string;
  slots: KnockoutPickSlotPayload[];
}): SaveKnockoutPicksResult | null {
  if (!KNOCKOUT_PICK_UUID_RE.test(input.participantId)) {
    return { ok: false, error: "Invalid participant id." };
  }

  for (const s of input.slots) {
    if (!isKnockoutPickKind(s.predictionKind)) {
      return { ok: false, error: "Invalid prediction kind." };
    }
    if (!KNOCKOUT_PICK_UUID_RE.test(s.tournamentStageId)) {
      return { ok: false, error: "Invalid tournament stage id." };
    }
    const tid = s.teamId.trim();
    if (tid && !KNOCKOUT_PICK_UUID_RE.test(tid)) {
      return { ok: false, error: "Invalid team id." };
    }
  }

  return null;
}
