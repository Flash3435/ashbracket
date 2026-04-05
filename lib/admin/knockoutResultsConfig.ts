import type { PredictionKind } from "../../src/types/domain";

/** Maps editor sections to `tournament_stages.code` and `results.kind`. */
export type KnockoutEditorSection = {
  kind: PredictionKind;
  stageCode: string;
  label: string;
  /** Slot keys stored in `results.slot_key` (null = single row like champion). */
  slotKeys: (string | null)[];
};

export const KNOCKOUT_EDITOR_SECTIONS: KnockoutEditorSection[] = [
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
    label: "Finalists",
    slotKeys: ["1", "2"],
  },
  {
    kind: "champion",
    stageCode: "final",
    label: "Champion",
    slotKeys: [null],
  },
];

export function resultRowKey(kind: string, slotKey: string | null): string {
  return `${kind}|${slotKey === null ? "" : slotKey}`;
}
