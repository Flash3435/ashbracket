import type { PredictionKind } from "../src/types/domain";
import type { KnockoutPickStatus } from "../lib/predictions/knockoutPickStatus";
import type { KnockoutPathPickClearReason } from "../lib/predictions/pruneOfficialKnockoutPathPicks";

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
  /** Group letter for group-stage rows and participant Stage 2 third-place rows; otherwise null. */
  groupCode: string | null;
  /** Bonus category for `bonus_pick`; otherwise null. */
  bonusKey: string | null;
  /** Selected team id, or empty string if unset. */
  teamId: string;
  /** Locked invalid path — historical pick is out but still visible. */
  pickStatus?: KnockoutPickStatus | null;
  invalidReason?: KnockoutPathPickClearReason | null;
};
