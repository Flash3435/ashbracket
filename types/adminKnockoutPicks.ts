/** Knockout stages editable on the admin participant picks page. */
export type KnockoutPickPredictionKind =
  | "quarterfinalist"
  | "semifinalist"
  | "finalist"
  | "champion";

/** One selectable slot in the form (camelCase for UI). */
export type KnockoutPickSlotDraft = {
  rowKey: string;
  sectionLabel: string;
  slotLabel: string;
  predictionKind: KnockoutPickPredictionKind;
  tournamentStageId: string;
  slotKey: string | null;
  /** Selected team id, or empty string if unset. */
  teamId: string;
};
