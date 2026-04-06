import type { PredictionKind } from "../src/types/domain";

/** Bracket slot kinds (excludes group + bonus, which use extra fields on the draft). */
export type KnockoutPickPredictionKind = Extract<
  PredictionKind,
  | "round_of_32"
  | "round_of_16"
  | "quarterfinalist"
  | "semifinalist"
  | "finalist"
  | "champion"
  | "third_place_qualifier"
>;

/** One selectable slot in the tournament picks UI. */
export type KnockoutPickSlotDraft = {
  rowKey: string;
  sectionLabel: string;
  slotLabel: string;
  predictionKind: PredictionKind;
  tournamentStageId: string;
  slotKey: string | null;
  /** Group letter for `group_winner` / `group_runner_up`; otherwise null. */
  groupCode: string | null;
  /** Bonus category for `bonus_pick`; otherwise null. */
  bonusKey: string | null;
  /** Selected team id, or empty string if unset. */
  teamId: string;
};
