/** Stable bracket slot identity within an edition (survives series row UUID changes). */
export type NhlBracketSlotRef = {
  round_code: string;
  side_or_conference: string | null;
  slot_index: number;
};

export function nhlBracketSlotKey(ref: NhlBracketSlotRef): string {
  return `${ref.round_code}|${ref.side_or_conference ?? ""}|${ref.slot_index}`;
}
