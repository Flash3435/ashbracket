import type { KnockoutPickPredictionKind } from "./adminKnockoutPicks";

export type SaveKnockoutPicksResult =
  | { ok: true }
  | { ok: false; error: string };

export type KnockoutPickSlotPayload = {
  predictionKind: KnockoutPickPredictionKind;
  tournamentStageId: string;
  slotKey: string | null;
  /** Empty or missing means clear this slot. */
  teamId: string;
};
