export type SavePicksOutcomeKind =
  | "success"
  | "validation_error"
  | "unexpected_error";

export type SaveKnockoutPicksResult =
  | { ok: true; kind: "success"; warning?: string }
  | { ok: false; kind: "validation_error"; error: string }
  | { ok: false; kind: "unexpected_error"; error: string };

/** Payload for saving any tournament pick row (group, bracket, bonus). */
export type ParticipantPickSlotPayload = {
  predictionKind: string;
  tournamentStageId: string;
  slotKey: string | null;
  groupCode: string | null;
  bonusKey: string | null;
  /** Empty or whitespace means clear this slot. */
  teamId: string;
};

/** @deprecated Use ParticipantPickSlotPayload */
export type KnockoutPickSlotPayload = ParticipantPickSlotPayload;
