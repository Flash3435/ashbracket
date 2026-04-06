import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import type { SaveKnockoutPicksResult } from "../../types/knockoutPicksSave";
import {
  PARTICIPANT_PICK_UUID_RE,
  validateParticipantPickSaveInput,
} from "./validateParticipantPickPayload";

/** @deprecated Use PARTICIPANT_PICK_UUID_RE */
export const KNOCKOUT_PICK_UUID_RE = PARTICIPANT_PICK_UUID_RE;

/**
 * Validates participant id and slot payloads before DB writes.
 */
export function validateKnockoutPickSaveInput(input: {
  participantId: string;
  slots: ParticipantPickSlotPayload[];
}): SaveKnockoutPicksResult | null {
  return validateParticipantPickSaveInput(input);
}
