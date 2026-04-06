export type SaveKnockoutPicksResult =
  | { ok: true }
  | { ok: false; error: string };

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
