/**
 * Official FIFA knockout bracket pairings for WC 2026 (M89–M104).
 * R32 match index `i` corresponds to FIFA match M(73 + i).
 */

/** R16 (M89–M96): each pair is [homeR32MatchIndex, awayR32MatchIndex]. */
export const WC2026_R16_R32_PARTICIPANT_PAIRS: readonly (readonly [
  number,
  number,
])[] = [
  [1, 4], // M89: Winner M74 vs Winner M77
  [0, 2], // M90: Winner M73 vs Winner M75
  [3, 5], // M91: Winner M76 vs Winner M78
  [6, 7], // M92: Winner M79 vs Winner M80
  [10, 11], // M93: Winner M83 vs Winner M84
  [8, 9], // M94: Winner M81 vs Winner M82
  [13, 15], // M95: Winner M86 vs Winner M88
  [12, 14], // M96: Winner M85 vs Winner M87
] as const;

/** QF (M97–M100): quarterfinalist slot keys from R16 winners M89–M96. */
export const WC2026_QF_PARTICIPANT_SLOT_PAIRS: readonly (readonly [
  string,
  string,
])[] = [
  ["1", "2"], // M97: Winner M89 vs Winner M90
  ["5", "6"], // M98: Winner M93 vs Winner M94
  ["3", "4"], // M99: Winner M91 vs Winner M92
  ["7", "8"], // M100: Winner M95 vs Winner M96
] as const;

/** SF (M101–M102): semifinalist slot keys from QF winners M97–M100. */
export const WC2026_SF_PARTICIPANT_SLOT_PAIRS: readonly (readonly [
  string,
  string,
])[] = [
  ["1", "3"], // M101: Winner M97 vs Winner M99
  ["2", "4"], // M102: Winner M98 vs Winner M100
] as const;

/** Final (M104): finalist slot keys from SF winners M101–M102. */
export const WC2026_FINAL_PARTICIPANT_SLOT_PAIRS: readonly (readonly [
  string,
  string,
])[] = [["1", "2"]] as const;

export function r16R32ParticipantPair(
  matchIndex: number,
): readonly [number, number] | null {
  return WC2026_R16_R32_PARTICIPANT_PAIRS[matchIndex] ?? null;
}

export function knockoutParticipantSlotPair(
  stage: "quarterfinal" | "semifinal" | "final",
  matchIndex: number,
): readonly [string, string] | null {
  const table =
    stage === "quarterfinal"
      ? WC2026_QF_PARTICIPANT_SLOT_PAIRS
      : stage === "semifinal"
        ? WC2026_SF_PARTICIPANT_SLOT_PAIRS
        : WC2026_FINAL_PARTICIPANT_SLOT_PAIRS;
  return table[matchIndex] ?? null;
}
