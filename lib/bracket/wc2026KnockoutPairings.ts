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
  ["1", "2"], // M101: Winner M97 vs Winner M98
  ["3", "4"], // M102: Winner M99 vs Winner M100
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

/** QF match index (0 = M97 … 3 = M100) that owns a quarterfinalist slot key. */
export function qfMatchIndexForQuarterfinalistSlot(
  slotKey: string,
): number | null {
  for (let qfIndex = 0; qfIndex < WC2026_QF_PARTICIPANT_SLOT_PAIRS.length; qfIndex++) {
    const pair = WC2026_QF_PARTICIPANT_SLOT_PAIRS[qfIndex]!;
    if (pair.includes(slotKey)) return qfIndex;
  }
  return null;
}

/** R16 match index (0 = M89 … 7 = M96) for a round_of_16 slot key. */
export function r16MatchIndexForSlot(slotKey: string): number | null {
  const n = Number(slotKey);
  if (!Number.isInteger(n) || n < 1 || n > 8) return null;
  return n - 1;
}

/** Which semi-final (0 = M101, 1 = M102) a QF path feeds into. */
export function semifinalMatchIndexForQfMatchIndex(
  qfMatchIndex: number,
): number | null {
  for (
    let sfIndex = 0;
    sfIndex < WC2026_SF_PARTICIPANT_SLOT_PAIRS.length;
    sfIndex++
  ) {
    const pair = WC2026_SF_PARTICIPANT_SLOT_PAIRS[sfIndex]!;
    const qfA = Number(pair[0]) - 1;
    const qfB = Number(pair[1]) - 1;
    if (qfMatchIndex === qfA || qfMatchIndex === qfB) return sfIndex;
  }
  return null;
}

/** Which semi-final branch an R16 slot path feeds into. */
export function semifinalMatchIndexForR16Slot(slotKey: string): number | null {
  const r16Index = r16MatchIndexForSlot(slotKey);
  if (r16Index == null) return null;
  const qfSlotKey = String(r16Index + 1);
  const qfIndex = qfMatchIndexForQuarterfinalistSlot(qfSlotKey);
  if (qfIndex == null) return null;
  return semifinalMatchIndexForQfMatchIndex(qfIndex);
}

/**
 * True only when two QF feeder paths reach opposite semi-finals (M101 vs M102),
 * meaning the teams could meet in the Final if both advance.
 */
export function canMeetInFinalByQfPath(
  qfMatchIndexA: number,
  qfMatchIndexB: number,
): boolean {
  const branchA = semifinalMatchIndexForQfMatchIndex(qfMatchIndexA);
  const branchB = semifinalMatchIndexForQfMatchIndex(qfMatchIndexB);
  if (branchA == null || branchB == null) return false;
  return branchA !== branchB;
}
