/**
 * Official WC 2026 knockout rows M89–M104 (Round of 16 through Final + bronze).
 */

import {
  knockoutParticipantSlotPair,
  r16R32ParticipantPair,
} from "./wc2026KnockoutPairings";

export type Wc2026LaterKnockoutStageCode =
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "third_place"
  | "final";

export type Wc2026LaterKnockoutScoring = {
  scoringResultKind: "quarterfinalist" | "semifinalist" | "finalist" | "champion" | null;
  scoringSlotKey: string | null;
  scoringStageCode: "quarterfinal" | "semifinal" | "final" | null;
};

export type Wc2026LaterKnockoutMatchDef = {
  fifaMatchNo: number;
  stageCode: Wc2026LaterKnockoutStageCode;
  roundIndex: number;
} & Wc2026LaterKnockoutScoring;

export function wc2026FifaMatchCode(fifaMatchNo: number): string {
  return `M${fifaMatchNo}`;
}

const R16_DEFS: Wc2026LaterKnockoutMatchDef[] = Array.from({ length: 8 }, (_, i) => ({
  fifaMatchNo: 89 + i,
  stageCode: "round_of_16",
  roundIndex: i,
  scoringResultKind: "quarterfinalist",
  scoringSlotKey: String(i + 1),
  scoringStageCode: "quarterfinal",
}));

const QF_DEFS: Wc2026LaterKnockoutMatchDef[] = Array.from({ length: 4 }, (_, i) => ({
  fifaMatchNo: 97 + i,
  stageCode: "quarterfinal",
  roundIndex: i,
  scoringResultKind: "semifinalist",
  scoringSlotKey: String(i + 1),
  scoringStageCode: "semifinal",
}));

const SF_DEFS: Wc2026LaterKnockoutMatchDef[] = Array.from({ length: 2 }, (_, i) => ({
  fifaMatchNo: 101 + i,
  stageCode: "semifinal",
  roundIndex: i,
  scoringResultKind: "finalist",
  scoringSlotKey: String(i + 1),
  scoringStageCode: "final",
}));

export const WC2026_LATER_KNOCKOUT_MATCH_DEFS: readonly Wc2026LaterKnockoutMatchDef[] = [
  ...R16_DEFS,
  ...QF_DEFS,
  ...SF_DEFS,
  {
    fifaMatchNo: 103,
    stageCode: "third_place",
    roundIndex: 0,
    scoringResultKind: null,
    scoringSlotKey: null,
    scoringStageCode: null,
  },
  {
    fifaMatchNo: 104,
    stageCode: "final",
    roundIndex: 0,
    scoringResultKind: "champion",
    scoringSlotKey: null,
    scoringStageCode: "final",
  },
] as const;

/**
 * Feeder FIFA match numbers for bracket advance links.
 * Winners advance everywhere except the third-place match (M103), which takes
 * the semifinal losers — see `propagateBracketAdvance`, which keys loser
 * propagation on `stage_code === "third_place"`.
 */
export function wc2026LaterKnockoutAdvanceFrom(
  def: Wc2026LaterKnockoutMatchDef,
): { homeFifaMatchNo: number | null; awayFifaMatchNo: number | null } {
  const { fifaMatchNo } = def;
  if (fifaMatchNo >= 89 && fifaMatchNo <= 96) {
    const pair = r16R32ParticipantPair(fifaMatchNo - 89);
    if (!pair) return { homeFifaMatchNo: null, awayFifaMatchNo: null };
    return { homeFifaMatchNo: 73 + pair[0], awayFifaMatchNo: 73 + pair[1] };
  }
  if (fifaMatchNo >= 97 && fifaMatchNo <= 100) {
    const pair = knockoutParticipantSlotPair("quarterfinal", fifaMatchNo - 97);
    if (!pair) return { homeFifaMatchNo: null, awayFifaMatchNo: null };
    return {
      homeFifaMatchNo: 89 + Number(pair[0]) - 1,
      awayFifaMatchNo: 89 + Number(pair[1]) - 1,
    };
  }
  if (fifaMatchNo >= 101 && fifaMatchNo <= 102) {
    const pair = knockoutParticipantSlotPair("semifinal", fifaMatchNo - 101);
    if (!pair) return { homeFifaMatchNo: null, awayFifaMatchNo: null };
    return {
      homeFifaMatchNo: 97 + Number(pair[0]) - 1,
      awayFifaMatchNo: 97 + Number(pair[1]) - 1,
    };
  }
  if (fifaMatchNo === 103 || fifaMatchNo === 104) {
    // M104 final: winners of the semifinals. M103 bronze final: losers of the
    // same semifinals (loser semantics applied downstream via stage_code).
    return { homeFifaMatchNo: 101, awayFifaMatchNo: 102 };
  }
  return { homeFifaMatchNo: null, awayFifaMatchNo: null };
}

export const WC2026_OFFICIAL_KNOCKOUT_MATCH_COUNT = 88 + WC2026_LATER_KNOCKOUT_MATCH_DEFS.length;
