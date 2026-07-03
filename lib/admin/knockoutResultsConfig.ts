import type { PredictionKind } from "../../src/types/domain";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";

/** How a section row maps into `results.slot_key` / `results.group_code`. */
export type KnockoutResultsSlotBinding = "bracket" | "group_finish";

/** Maps editor sections to `tournament_stages.code` and `results.kind`. */
export type KnockoutEditorSection = {
  kind: PredictionKind;
  stageCode: string;
  label: string;
  /** Slot keys stored in `results.slot_key` (null = single row like champion). */
  slotKeys: (string | null)[];
  /**
   * `bracket` (default): `slot_key` = key, `group_code` null.
   * `group_finish`: key is the group letter; `group_code` = key, `slot_key` null.
   */
  slotBinding?: KnockoutResultsSlotBinding;
};

const ROUND_OF_32_SLOT_KEYS: string[] = Array.from({ length: 32 }, (_, i) =>
  String(i + 1),
);

/** Official 1st / 2nd per letter group (`results.group_code` = A–L, `slot_key` null). */
export const GROUP_STAGE_FINISH_SECTIONS: KnockoutEditorSection[] = [
  {
    kind: "group_winner",
    stageCode: "group",
    label: "Group stage — 1st place",
    slotKeys: [...WC2026_GROUP_CODES],
    slotBinding: "group_finish",
  },
  {
    kind: "group_runner_up",
    stageCode: "group",
    label: "Group stage — 2nd place",
    slotKeys: [...WC2026_GROUP_CODES],
    slotBinding: "group_finish",
  },
];

/** Third-place teams that advance into the Round of 32 (8 slots on `round_of_32` stage). */
export const THIRD_PLACE_QUALIFIER_SECTIONS: KnockoutEditorSection[] = [
  {
    kind: "third_place_qualifier",
    stageCode: "round_of_32",
    label: "Third-place qualifiers",
    slotKeys: ["1", "2", "3", "4", "5", "6", "7", "8"],
  },
];

/** All 32 teams still in the tournament at the Round of 32. */
export const ROUND_OF_32_SECTIONS: KnockoutEditorSection[] = [
  {
    kind: "round_of_32",
    stageCode: "round_of_32",
    label: "Round of 32",
    slotKeys: ROUND_OF_32_SLOT_KEYS,
  },
];

/** Knockout progression after Round of 32 (one row per team when they reach that round). */
export const KNOCKOUT_PROGRESSION_SECTIONS: KnockoutEditorSection[] = [
  {
    kind: "round_of_16",
    stageCode: "round_of_16",
    label: "Round of 16",
    slotKeys: [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
    ],
  },
  {
    kind: "quarterfinalist",
    stageCode: "quarterfinal",
    label: "Quarterfinalists",
    slotKeys: ["1", "2", "3", "4", "5", "6", "7", "8"],
  },
  {
    kind: "semifinalist",
    stageCode: "semifinal",
    label: "Semifinalists",
    slotKeys: ["1", "2", "3", "4"],
  },
  {
    kind: "finalist",
    stageCode: "final",
    label: "Semi-final winners",
    slotKeys: ["1", "2"],
  },
  {
    kind: "champion",
    stageCode: "final",
    label: "Champion",
    slotKeys: [null],
  },
];

/** @deprecated Use KNOCKOUT_PROGRESSION_SECTIONS; kept for grep compatibility. */
export const KNOCKOUT_EDITOR_SECTIONS = KNOCKOUT_PROGRESSION_SECTIONS;

/**
 * Bracket slots (participant + admin results), build order.
 * Group stage picks are built separately from `WC2026_GROUP_CODES`.
 */
export const ALL_BRACKET_PICK_SECTIONS: KnockoutEditorSection[] = [
  ...GROUP_STAGE_FINISH_SECTIONS,
  ...THIRD_PLACE_QUALIFIER_SECTIONS,
  ...ROUND_OF_32_SECTIONS,
  ...KNOCKOUT_PROGRESSION_SECTIONS,
];

/**
 * Participant knockout bracket rows only. `GROUP_STAGE_FINISH_SECTIONS` stay in
 * `ALL_BRACKET_PICK_SECTIONS` for the admin results editor (`slotBinding: group_finish`),
 * but participant predictions store group 1st/2nd on `group_code`, not `slot_key`, so
 * those sections must not be merged again in `buildBracketPickSlotDrafts` (that would
 * duplicate empty slots and break completeness checks).
 */
export const PARTICIPANT_BRACKET_PICK_SECTIONS: KnockoutEditorSection[] = [
  ...THIRD_PLACE_QUALIFIER_SECTIONS,
  ...ROUND_OF_32_SECTIONS,
  ...KNOCKOUT_PROGRESSION_SECTIONS,
];

export function resultRowKey(kind: string, slotKey: string | null): string {
  return `${kind}|${slotKey === null ? "" : slotKey}`;
}
