export type BracketSkeletonSlot = {
  round_code: "R1" | "R2" | "CF" | "SCF";
  round_order: 1 | 2 | 3 | 4;
  side_or_conference: "east" | "west" | "cup";
  slot_index: number;
};

/**
 * Standard 16-team conference bracket skeleton:
 * 8 R1, 4 R2, 2 conference finals, 1 Stanley Cup Final.
 */
export function buildDefaultBracketSkeleton(): BracketSkeletonSlot[] {
  const rows: BracketSkeletonSlot[] = [];

  for (const side of ["east", "west"] as const) {
    for (let s = 1; s <= 4; s++) {
      rows.push({
        round_code: "R1",
        round_order: 1,
        side_or_conference: side,
        slot_index: s,
      });
    }
  }

  for (const side of ["east", "west"] as const) {
    for (let s = 1; s <= 2; s++) {
      rows.push({
        round_code: "R2",
        round_order: 2,
        side_or_conference: side,
        slot_index: s,
      });
    }
  }

  for (const side of ["east", "west"] as const) {
    rows.push({
      round_code: "CF",
      round_order: 3,
      side_or_conference: side,
      slot_index: 1,
    });
  }

  rows.push({
    round_code: "SCF",
    round_order: 4,
    side_or_conference: "cup",
    slot_index: 1,
  });

  return rows;
}
